import "server-only";
import { isChatAuthorized } from "./auth";
import { getActiveEmployees, getActiveProjects, getTodayEntries } from "./data";
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
      return formatNameList("פרויקטים פעילים:", await getActiveProjects(), "לא נמצאו פרויקטים פעילים.");
    case "/employees":
      return formatNameList("עובדים פעילים:", await getActiveEmployees(), "לא נמצאו עובדים פעילים.");
    case "/today":
      return formatTodayEntries(await getTodayEntries());
    case "/help":
      return `הבוט מאפשר צפייה בנתוני NEWMAN.\n\n${commandList}`;
    default:
      return "הפקודה אינה מוכרת. לקבלת עזרה ניתן לשלוח /help";
  }
}
