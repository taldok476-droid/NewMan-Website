import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { updateTimeEntry } from "../../actions";

export default async function EditTimeEntry({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string; error?: string }>;
}) {
  const { id } = await params,
    p = await searchParams,
    s = await createClient();
  const [{ data: entry }, { data: employees }, { data: projects }] =
    await Promise.all([
      s.from("time_entries").select("*,telegram_users(display_name)").eq("id", id).maybeSingle(),
      s
        .from("employees")
        .select("id,first_name,last_name,status")
        .order("first_name"),
      s.from("projects").select("id,name,status").order("name"),
    ]);
  if (!entry) notFound();
  const candidate = p.returnTo || "/history",
    returnTo =
      /^\/(history|employees\/[^/]+|projects\/[^/]+\/work-days\/\d{4}-\d{2}-\d{2})(\?.*)?$/.test(
        candidate,
      )
        ? candidate
        : "/history";
  return (
    <>
      <PageHeader
        title="עריכת דיווח שעות"
        description="עדכון דיווח קיים ללא שינוי מקור הדיווח או פרטי הביקורת"
      />
      {p.error && (
        <p className="p-3 mb-4 rounded bg-red-50 text-red-700">{p.error}</p>
      )}
      <form
        action={updateTimeEntry}
        className="card p-5 grid md:grid-cols-2 gap-4 max-w-3xl"
      >
        <input type="hidden" name="id" value={id} />
        {entry.source==="telegram"&&<p className="md:col-span-2 text-sm text-slate-500">{entry.telegram_users?.display_name?`דווח ע״י: ${entry.telegram_users.display_name}`:"דווח דרך Telegram"}</p>}
        <input type="hidden" name="return_to" value={returnTo} />
        <div>
          <label className="label">תאריך עבודה</label>
          <input
            required
            type="date"
            name="work_date"
            className="field"
            defaultValue={entry.work_date}
          />
        </div>
        <div>
          <label className="label">עובד</label>
          <select
            required
            name="employee_id"
            className="field"
            defaultValue={entry.employee_id}
          >
            {employees?.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.first_name} {employee.last_name}
                {employee.status !== "active" ? " — לא פעיל" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">פרויקט</label>
          <select
            required
            name="project_id"
            className="field"
            defaultValue={entry.project_id}
          >
            {projects?.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
                {project.status !== "active" ? " — לא פעיל" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">שעות רגילות</label>
          <input
            required
            type="number"
            min="0"
            max="24"
            step="0.25"
            name="regular_hours"
            className="field"
            defaultValue={entry.regular_hours}
          />
        </div>
        <div>
          <label className="label">שעות נוספות</label>
          <input
            required
            type="number"
            min="0"
            max="24"
            step="0.25"
            name="overtime_hours"
            className="field"
            defaultValue={entry.overtime_hours}
          />
        </div>
        <div className="md:col-span-2">
          <label className="label">הערות</label>
          <textarea
            name="notes"
            className="field"
            rows={4}
            defaultValue={entry.notes || ""}
          />
        </div>
        <div className="md:col-span-2 flex gap-2">
          <button className="btn btn-primary">שמירת שינויים</button>
          <Link href={returnTo} className="btn btn-secondary">
            ביטול
          </Link>
        </div>
      </form>
    </>
  );
}
