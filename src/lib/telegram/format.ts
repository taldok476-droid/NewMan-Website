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

export function formatRoleWelcome(displayName:string,role:"MANAGER"|"SCHEDULER"){const firstName=displayName.trim().split(/\s+/)[0]||displayName;return role==="MANAGER"?`👋 שלום ${firstName}, אני NEWMAN\n\nהעוזר שלך לניהול העובדים והפרויקטים.\nאפשר לדווח עבודה, לנהל עובדים ופרויקטים ולהפיק דוחות — פשוט כתוב לי מה אתה צריך.`:`👋 שלום ${firstName}, אני NEWMAN\n\nאני כאן כדי לעזור לך בסידורי העבודה היומיים.\nאפשר לדווח מי עובד ובאיזה פרויקט, לראות עובדים ופרויקטים ולהוסיף עובדים חדשים.`;}
export function formatUnknownWelcome(userId:number){return`👋 שלום, אני NEWMAN\n\nהגישה שלך עדיין לא הופעלה.\nמזהה Telegram שלך: ${userId}\nיש להעביר את המזהה למנהל המערכת לצורך הרשאה.`;}
export function formatRoleMenu(role:"MANAGER"|"SCHEDULER"){return role==="MANAGER"?"תפריט NEWMAN:\n\n📝 דיווח עבודה\n👷 עובדים\n🏗️ פרויקטים\n📊 דוחות":"תפריט NEWMAN:\n\n📝 דיווח עבודה\n👷 עובדים\n🏗️ פרויקטים\n➕ הוספת עובד";}

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
