import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getActiveProjects(): Promise<string[]> {
  const { data, error } = await createAdminClient()
    .from("projects")
    .select("name")
    .eq("status", "active")
    .order("name");
  if (error) throw new Error(`Project lookup failed: ${error.code}`);
  return data.map((project) => project.name);
}

export async function getActiveEmployees(): Promise<string[]> {
  const { data, error } = await createAdminClient()
    .from("employees")
    .select("first_name,last_name")
    .eq("status", "active")
    .order("first_name");
  if (error) throw new Error(`Employee lookup failed: ${error.code}`);
  return data.map((employee) => `${employee.first_name} ${employee.last_name}`);
}

export async function getTodayEntries() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const { data, error } = await createAdminClient()
    .from("time_entries")
    .select("regular_hours,overtime_hours,employees(first_name,last_name),projects(name)")
    .eq("work_date", today)
    .order("created_at");
  if (error) throw new Error(`Time-entry lookup failed: ${error.code}`);
  return data.map((entry) => ({
    regular_hours: Number(entry.regular_hours),
    overtime_hours: Number(entry.overtime_hours),
    employees: Array.isArray(entry.employees) ? (entry.employees[0] ?? null) : entry.employees,
    projects: Array.isArray(entry.projects) ? (entry.projects[0] ?? null) : entry.projects,
  }));
}

export type TelegramTimeEntryInput = {
  workDate: string;
  employeeId: string;
  projectId: string;
  regularHours: number;
  overtimeHours?: number;
  notes?: string;
  createdBy: string;
};

// Reserved for the confirmation workflow in the next Telegram phase.
export async function createTelegramTimeEntries(entries: TelegramTimeEntryInput[]) {
  const payload = entries.map((entry) => ({
    work_date: entry.workDate,
    employee_id: entry.employeeId,
    project_id: entry.projectId,
    regular_hours: entry.regularHours,
    overtime_hours: entry.overtimeHours ?? 0,
    notes: entry.notes ?? null,
    created_by: entry.createdBy,
    source: "telegram" as const,
  }));
  const { data, error } = await createAdminClient().from("time_entries").insert(payload).select();
  if (error) throw new Error(`Time-entry creation failed: ${error.code}`);
  return data;
}

export async function claimTelegramUpdate(updateId: number): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("telegram_updates")
    .insert({ update_id: updateId });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(`Telegram update claim failed: ${error.code}`);
}

export async function releaseTelegramUpdate(updateId: number): Promise<void> {
  await createAdminClient().from("telegram_updates").delete().eq("update_id", updateId);
}
