import "server-only";
import { isChatAuthorized } from "./auth";
import { getTodayEntries } from "./data";
import { getCachedActiveEmployees, getCachedActiveProjects } from "./reference-cache";
import { commandList, formatNameList, formatStartMessage, formatTodayEntries } from "./format";

const unauthorizedMessage = "אין הרשאה להשתמש בבוט זה.";

function normalizeCommand(text: string): string {
  return text.trim().split(/\s+/)[0].split("@")[0].toLowerCase();
}

export async function routeCommand(chatId: number, text: string): Promise<string | null> {
  const command = normalizeCommand(text);
  if (command === "/myid") return String(chatId);

  if (!isChatAuthorized(chatId)) {
    console.warn("Unauthorized Telegram access attempt", { chatId });
    return unauthorizedMessage;
  }

  switch (command) {
    case "/start":
      return formatStartMessage();
    case "/projects":
      return formatNameList("פרויקטים פעילים:", (await getCachedActiveProjects()).map(project=>project.name), "לא נמצאו פרויקטים פעילים.");
    case "/employees":
      return formatNameList("עובדים פעילים:", (await getCachedActiveEmployees()).map(employee=>employee.name), "לא נמצאו עובדים פעילים.");
    case "/today":
      return formatTodayEntries(await getTodayEntries());
    case "/help":
      return `הבוט מאפשר צפייה ודיווח בנתוני NEWMAN. אפשר לכתוב בקשות טבעיות בעברית, למשל "היום מואיד עבד אצל טל 8 שעות" או "כמה שעות עבד מואיד החודש?".\n\n${commandList}`;
    default:
      return command.startsWith("/") ? "הפקודה אינה מוכרת. לקבלת עזרה ניתן לשלוח /help" : null;
  }
}
