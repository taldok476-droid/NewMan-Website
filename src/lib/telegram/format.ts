type TodayEntry = {
  regular_hours: number;
  overtime_hours: number;
  employees: { first_name: string; last_name: string } | null;
  projects: { name: string } | null;
};

export const commandList = [
  "/projects — פרויקטים פעילים",
  "/employees — עובדים פעילים",
  "/today — דיווחי היום",
  "/help — עזרה",
].join("\n");

export function formatStartMessage(): string {
  return `שלום 👋\nברוכים הבאים למערכת NEWMAN.\n\nהבוט מחובר בהצלחה למערכת ניהול העובדים והפרויקטים.\n\nפקודות זמינות:\n${commandList}`;
}

export function formatNameList(title: string, names: string[], empty: string): string {
  if (!names.length) return `${title}\n\n${empty}`;
  return `${title}\n\n${names.map((name) => `• ${name}`).join("\n")}`;
}

export function formatTodayEntries(entries: TodayEntry[]): string {
  if (!entries.length) return "דיווחי היום:\n\nלא נמצאו דיווחים להיום.";

  const groups = new Map<string, string[]>();
  let total = 0;
  for (const entry of entries) {
    const project = entry.projects?.name ?? "פרויקט לא ידוע";
    const employee = entry.employees
      ? `${entry.employees.first_name} ${entry.employees.last_name}`
      : "עובד לא ידוע";
    const hours = Number(entry.regular_hours) + Number(entry.overtime_hours);
    total += hours;
    groups.set(project, [...(groups.get(project) ?? []), `• ${employee} — ${hours} שעות`]);
  }

  const sections = [...groups].map(([project, rows]) => `${project}\n${rows.join("\n")}`);
  return `דיווחי היום:\n\n${sections.join("\n\n")}\n\nסה״כ: ${total} שעות`;
}
