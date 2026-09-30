import { formatBusinessDate } from "./dates";

export type DraftOperation = "insert" | "update";

export type ResolvedDraftEntry = {
  work_date: string;
  employee_id: string;
  employee_name: string;
  project_id: string;
  project_name: string;
  regular_hours: number;
  overtime_hours: number;
  notes: string | null;
  operation: DraftOperation;
  existing_regular_hours: number | null;
  existing_overtime_hours: number | null;
};

export type DraftTotals = {
  uniqueEmployees: number;
  entries: number;
  projects: number;
  dates: number;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  inserts: number;
  updates: number;
};

export function calculateDraftTotals(entries: ResolvedDraftEntry[]): DraftTotals {
  const regularHours = entries.reduce((sum, entry) => sum + entry.regular_hours, 0);
  const overtimeHours = entries.reduce((sum, entry) => sum + entry.overtime_hours, 0);
  return {
    uniqueEmployees: new Set(entries.map((entry) => entry.employee_id)).size,
    entries: entries.length,
    projects: new Set(entries.map((entry) => entry.project_id)).size,
    dates: new Set(entries.map((entry) => entry.work_date)).size,
    regularHours,
    overtimeHours,
    totalHours: regularHours + overtimeHours,
    inserts: entries.filter((entry) => entry.operation === "insert").length,
    updates: entries.filter((entry) => entry.operation === "update").length,
  };
}

function hours(entry: Pick<ResolvedDraftEntry, "regular_hours" | "overtime_hours">): number {
  return entry.regular_hours + entry.overtime_hours;
}

function hebrewNameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ו${names.at(-1)}`;
}

export function formatActionSummary(entries: ResolvedDraftEntry[]): string {
  const totals = calculateDraftTotals(entries);
  const updatedEmployees = [...new Map(
    entries.filter((entry) => entry.operation === "update").map((entry) => [entry.employee_id, entry.employee_name]),
  ).values()];
  const updateNames = hebrewNameList(updatedEmployees);
  if (!totals.inserts) return `סיכום: יעודכנו השעות ל${updateNames}`;
  const inserts = totals.inserts === 1 ? "יבוצע דיווח חדש אחד" : `יבוצעו ${totals.inserts} דיווחים חדשים`;
  if (!totals.updates) return `סיכום: ${inserts}`;
  const updates = updatedEmployees.length === 1 ? `ועדכון שעות ל${updateNames}` : `ועדכוני שעות ל${updateNames}`;
  return `סיכום: ${inserts} ${updates}`;
}

export function formatCombinedDraft(entries: ResolvedDraftEntry[]): string {
  const byDate = new Map<string, Map<string, ResolvedDraftEntry[]>>();
  for (const entry of entries) {
    const projects = byDate.get(entry.work_date) ?? new Map<string, ResolvedDraftEntry[]>();
    projects.set(entry.project_name, [...(projects.get(entry.project_name) ?? []), entry]);
    byDate.set(entry.work_date, projects);
  }
  const body = [...byDate].map(([date, projects]) => [
    `📅 ${formatBusinessDate(date)}`,
    ...[...projects].map(([project, rows]) => `📍 ${project}\n${rows.map((entry) => {
      if (entry.operation === "insert") return `• ${entry.employee_name} — ${hours(entry)} שעות`;
      const existing = Number(entry.existing_regular_hours) + Number(entry.existing_overtime_hours);
      return `• ${entry.employee_name}\n  קיים: ${existing} שעות\n  חדש: ${hours(entry)} שעות\n  ⚠️ עדכון דיווח קיים`;
    }).join("\n")}`),
  ].join("\n\n")).join("\n\n");
  const totals = calculateDraftTotals(entries);
  const totalsText = [
    `עובדים: ${totals.uniqueEmployees}`,
    `פרויקטים: ${totals.projects}`,
    `כמות שעות עבודה: ${totals.totalHours}`,
  ].join("\n");
  return `📝 טיוטת דיווח\n\n${body}\n\nסה״כ:\n${totalsText}\n\n${formatActionSummary(entries)}\n\nהאם לשמור את הדיווחים?`;
}

export function confirmationButtonText(entries: ResolvedDraftEntry[]): string {
  const { inserts, updates } = calculateDraftTotals(entries);
  if (updates && inserts) return `✅ שמירת ${inserts} חדשים + עדכון ${updates}`;
  if (updates) return `✅ אישור ועדכון ${updates}`;
  return `✅ אישור ושמירת ${inserts}`;
}

export function duplicateProposalKeys(entries: ResolvedDraftEntry[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.employee_id}:${entry.project_id}:${entry.work_date}`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}
