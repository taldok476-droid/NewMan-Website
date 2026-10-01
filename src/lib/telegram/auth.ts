import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type TelegramRole = "MANAGER" | "SCHEDULER";
export type TelegramCapability =
  | "ATTENDANCE_CREATE"
  | "EMPLOYEES_READ"
  | "EMPLOYEES_CREATE"
  | "PROJECTS_READ"
  | "PROJECTS_CREATE"
  | "TIME_ENTRIES_EDIT"
  | "TIME_ENTRIES_DELETE"
  | "REPORTS_VIEW"
  | "REPORTS_EXPORT"
  | "HISTORY_VIEW";
export type TelegramActor = {
  id: string | null;
  telegramUserId: number;
  displayName: string;
  role: TelegramRole;
  legacy: boolean;
};

export const ROLE_CAPABILITIES: Record<
  TelegramRole,
  ReadonlySet<TelegramCapability>
> = {
  MANAGER: new Set([
    "ATTENDANCE_CREATE",
    "EMPLOYEES_READ",
    "EMPLOYEES_CREATE",
    "PROJECTS_READ",
    "PROJECTS_CREATE",
    "TIME_ENTRIES_EDIT",
    "TIME_ENTRIES_DELETE",
    "REPORTS_VIEW",
    "REPORTS_EXPORT",
    "HISTORY_VIEW",
  ]),
  SCHEDULER: new Set([
    "ATTENDANCE_CREATE",
    "EMPLOYEES_READ",
    "EMPLOYEES_CREATE",
    "PROJECTS_READ",
  ]),
};
export const hasCapability = (
  actor: TelegramActor,
  capability: TelegramCapability,
) => ROLE_CAPABILITIES[actor.role].has(capability);
export function requiredCapability(
  intent: string,
  outputFormat?: string,
): TelegramCapability | null {
  if (intent === "CREATE_TIME_ENTRIES") return "ATTENDANCE_CREATE";
  if (intent === "CREATE_EMPLOYEE") return "EMPLOYEES_CREATE";
  if (intent === "CREATE_PROJECT") return "PROJECTS_CREATE";
  if (intent === "EMPLOYEES_LIST" || intent === "EMPLOYEE_INFO")
    return "EMPLOYEES_READ";
  if (intent === "PROJECTS_LIST" || intent === "PROJECT_INFO")
    return "PROJECTS_READ";
  if (intent === "REPORT_QUERY")
    return outputFormat === "EXCEL" ? "REPORTS_EXPORT" : "REPORTS_VIEW";
  if (intent === "TODAY_STATUS") return "HISTORY_VIEW";
  return null;
}
export function permissionDeniedMessage(capability: TelegramCapability) {
  if (capability === "PROJECTS_CREATE")
    return "אין לך הרשאה ליצור פרויקטים דרך הבוט.";
  if (
    capability === "REPORTS_VIEW" ||
    capability === "REPORTS_EXPORT" ||
    capability === "HISTORY_VIEW"
  )
    return "אין לך הרשאה לצפות בדוחות דרך הבוט.";
  return "אין לך הרשאה לבצע את הפעולה דרך הבוט.";
}
const cache = new Map<
    number,
    { actor: TelegramActor | null; expiresAt: number }
  >(),
  TTL_MS = 5_000;
export function clearTelegramAuthorizationCache(userId?: number) {
  if (userId === undefined) cache.clear();
  else cache.delete(userId);
}
function legacyAllowed(userId: number, chatId: number) {
  const ids = new Set(
    (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  );
  return ids.has(String(userId)) || ids.has(String(chatId));
}
export async function getTelegramActor(
  userId: number,
  chatId: number,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<TelegramActor | null> {
  const cached = cache.get(userId);
  if (!fresh && cached && cached.expiresAt > Date.now()) return cached.actor;
  const { data, error } = await createAdminClient()
    .from("telegram_users")
    .select("id,telegram_user_id,display_name,role,is_active")
    .eq("telegram_user_id", userId)
    .maybeSingle();
  if (error && error.code !== "42P01")
    throw new Error(`Telegram authorization lookup failed: ${error.code}`);
  let actor: TelegramActor | null = null;
  if (data)
    actor = data.is_active
      ? {
          id: data.id,
          telegramUserId: Number(data.telegram_user_id),
          displayName: data.display_name,
          role: data.role as TelegramRole,
          legacy: false,
        }
      : null;
  else if (legacyAllowed(userId, chatId))
    actor = {
      id: null,
      telegramUserId: userId,
      displayName: "Telegram manager",
      role: "MANAGER",
      legacy: true,
    };
  cache.set(userId, { actor, expiresAt: Date.now() + TTL_MS });
  return actor;
}

export function isValidWebhookSecret(received: string | null): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !received || received.length !== expected.length)
    return false;

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return difference === 0;
}
