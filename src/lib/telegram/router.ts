import "server-only";
import { hasCapability, type TelegramActor } from "./auth";
import { getTodayEntries } from "./data";
import {
  getCachedActiveEmployees,
  getCachedActiveProjects,
} from "./reference-cache";
import {
  commandList,
  formatNameList,
  formatRoleMenu,
  formatRoleWelcome,
  formatUnknownWelcome,
  formatTodayEntries,
} from "./format";

const unauthorizedMessage = "אין הרשאה להשתמש בבוט זה.";

function normalizeCommand(text: string): string {
  return text.trim().split(/\s+/)[0].split("@")[0].toLowerCase();
}

export async function routeCommand(
  userId: number,
  text: string,
  actor: TelegramActor | null,
): Promise<string | null> {
  const command = normalizeCommand(text);
  if (command === "/myid") return String(userId);
  if(command==="/start"&&!actor)return formatUnknownWelcome(userId);

  if (!actor) return unauthorizedMessage;

  switch (command) {
    case "/start":
      return formatRoleWelcome(actor.displayName,actor.role);
    case "/menu":
      return formatRoleMenu(actor.role);
    case "/projects":
      if (!hasCapability(actor, "PROJECTS_READ")) return unauthorizedMessage;
      return formatNameList(
        "פרויקטים פעילים:",
        (await getCachedActiveProjects()).map((project) => project.name),
        "לא נמצאו פרויקטים פעילים.",
      );
    case "/employees":
      if (!hasCapability(actor, "EMPLOYEES_READ")) return unauthorizedMessage;
      return formatNameList(
        "עובדים פעילים:",
        (await getCachedActiveEmployees()).map((employee) => employee.name),
        "לא נמצאו עובדים פעילים.",
      );
    case "/today":
      if (!hasCapability(actor, "HISTORY_VIEW"))
        return "אין לך הרשאה לצפות בהיסטוריית דיווחים דרך הבוט.";
      return formatTodayEntries(await getTodayEntries());
    case "/help":
      return `הבוט מאפשר צפייה ודיווח בנתוני NEWMAN. אפשר לכתוב בקשות טבעיות בעברית, למשל "היום מואיד עבד אצל טל 8 שעות" או "כמה שעות עבד מואיד החודש?".\n\n${commandList}`;
    default:
      return command.startsWith("/")
        ? "הפקודה אינה מוכרת. לקבלת עזרה ניתן לשלוח /help"
        : null;
  }
}
