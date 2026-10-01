import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { monthRangeExclusive, nextDateExclusive } from "@/lib/date-ranges";
import { TimeEntryActions } from "@/components/time-entry-actions";

type Params = {
  from?: string;
  to?: string;
  month?: string;
  project?: string;
  employee?: string;
  error?: string;
  success?: string;
};
function returnTo(filters: Params) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && key !== "error" && key !== "success") params.set(key, value);
  }
  const query = params.toString();
  return `/history${query ? `?${query}` : ""}`;
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const p = await searchParams,
    s = await createClient();
  const [{ data: employees }, { data: projects }] = await Promise.all([
    s.from("employees").select("*").order("first_name"),
    s.from("projects").select("*").order("name"),
  ]);
  let query = s
    .from("time_entries")
    .select("*,employees(first_name,last_name),projects(name),telegram_users(display_name)")
    .order("work_date", { ascending: false })
    .limit(500);
  if (p.from) query = query.gte("work_date", p.from);
  if (p.to) query = query.lt("work_date", nextDateExclusive(p.to));
  if (p.month) {
    const range = monthRangeExclusive(p.month);
    query = query
      .gte("work_date", range.from)
      .lt("work_date", range.toExclusive);
  }
  if (p.project) query = query.eq("project_id", p.project);
  if (p.employee) query = query.eq("employee_id", p.employee);
  const { data } = await query,
    items = data || [],
    back = returnTo(p);
  return (
    <>
      <PageHeader
        title="היסטוריית דיווחים"
        description="חיפוש, סינון, עריכה ומחיקה של דיווחי שעות"
      />
      {p.success && (
        <p className="p-3 mb-4 bg-emerald-50 text-emerald-700 rounded">
          {p.success}
        </p>
      )}
      {p.error && (
        <p className="p-3 mb-4 bg-red-50 text-red-700 rounded">{p.error}</p>
      )}
      <form className="card p-4 mb-4 grid sm:grid-cols-2 xl:grid-cols-6 gap-3">
        <input
          className="field"
          type="month"
          name="month"
          defaultValue={p.month}
        />
        <input
          className="field"
          type="date"
          name="from"
          defaultValue={p.from}
        />
        <input className="field" type="date" name="to" defaultValue={p.to} />
        <select className="field" name="project" defaultValue={p.project}>
          <option value="">כל הפרויקטים</option>
          {projects?.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select className="field" name="employee" defaultValue={p.employee}>
          <option value="">כל העובדים</option>
          {employees?.map((x) => (
            <option key={x.id} value={x.id}>
              {x.first_name} {x.last_name}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary">הצגת תוצאות</button>
      </form>
      <div className="card table-wrap">
        {items.length ? (
          <table>
            <thead>
              <tr>
                <th>תאריך</th>
                <th>עובד</th>
                <th>פרויקט</th>
                <th>רגילות</th>
                <th>נוספות</th>
                <th>סה״כ</th>
                <th>מקור</th>
                <th>הערות</th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x: any) => {
                const employeeName =
                    `${x.employees?.first_name || ""} ${x.employees?.last_name || ""}`.trim(),
                  projectName = x.projects?.name || "";
                return (
                  <tr key={x.id}>
                    <td>
                      <Link
                        className="font-bold text-[#a96222] hover:underline"
                        href={`/projects/${x.project_id}/work-days/${x.work_date}`}
                      >
                        {formatDate(x.work_date)}
                      </Link>
                    </td>
                    <td>
                      <Link
                        className="hover:underline"
                        href={`/employees/${x.employee_id}`}
                      >
                        {employeeName}
                      </Link>
                    </td>
                    <td>
                      <Link
                        className="hover:underline"
                        href={`/projects/${x.project_id}/work-days/${x.work_date}`}
                      >
                        {projectName}
                      </Link>
                    </td>
                    <td>{x.regular_hours}</td>
                    <td>{x.overtime_hours}</td>
                    <td>
                      <b>
                        {Number(x.regular_hours) + Number(x.overtime_hours)}
                      </b>
                    </td>
                    <td>{x.source === "web" ? "מערכת" : <><span>טלגרם</span><span className="block text-xs text-slate-500">{x.telegram_users?.display_name?`דווח ע״י: ${x.telegram_users.display_name}`:"דווח דרך Telegram"}</span></>}</td>
                    <td className="max-w-48 truncate">{x.notes || "—"}</td>
                    <td>
                      <TimeEntryActions
                        entry={{
                          id: x.id,
                          work_date: x.work_date,
                          regular_hours: Number(x.regular_hours),
                          overtime_hours: Number(x.overtime_hours),
                          employee_name: employeeName,
                          project_name: projectName,
                        }}
                        returnTo={back}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <EmptyState text="לא נמצאו דיווחים" />
        )}
      </div>
    </>
  );
}
