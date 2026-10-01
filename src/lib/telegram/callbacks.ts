import "server-only";
import { cancelTelegramDraft, confirmTelegramDraft } from "./data";
import { parseDraftCallback } from "./business";
import {
  clearEmployeeReferenceCache,
  clearProjectReferenceCache,
} from "./reference-cache";
export async function handleDraftCallback(
  chatId: number,
  userId: number,
  data: string,
) {
  const parsed = parseDraftCallback(data);
  if (!parsed) return "הפעולה אינה תקינה.";
  const { action, draftId: id } = parsed;
  if (action === "cancel") {
    const result = await cancelTelegramDraft(id, chatId, userId);
    if (result === "cancelled") return "❌ הפעולה בוטלה\n\nלא בוצע שינוי.";
    if (result === "expired") return "הטיוטה פגה. יש לשלוח את הבקשה מחדש.";
    return result === "confirmed"
      ? "הפעולה כבר בוצעה."
      : "הטיוטה כבר טופלה או אינה קיימת.";
  }
  const result = await confirmTelegramDraft(id, chatId, userId);
  if (result.result === "unauthorized") return "אין הרשאה להשתמש בבוט זה.";
  if (result.result === "forbidden")
    return "אין לך הרשאה לבצע את הפעולה דרך הבוט.";
  if (result.result === "confirmed" && result.intent === "CREATE_EMPLOYEE") {
    clearEmployeeReferenceCache();
    return `✅ העובד ${result.name} נוסף בהצלחה.`;
  }
  if (result.result === "confirmed" && result.intent === "CREATE_PROJECT") {
    clearProjectReferenceCache();
    return `✅ הפרויקט ${result.name} נוסף בהצלחה.`;
  }
  if (result.result === "duplicate")
    return result.intent === "CREATE_EMPLOYEE"
      ? `קיים כבר עובד בשם ${result.name}.`
      : `קיים כבר פרויקט בשם ${result.name}.`;
  if (result.result === "confirmed") {
    const summary=result.summary||[],projects=[...new Set(summary.map(x=>String(x.project_name)))],employees=new Set(summary.map(x=>String(x.employee_name))).size,hours=summary.reduce((sum,x)=>sum+Number(x.regular_hours)+Number(x.overtime_hours),0);
    return `✅ הדיווח נשמר\n\n${projects.length===1?`פרויקט: ${projects[0]}`:`פרויקטים: ${projects.join(", ")}`}\nעובדים: ${employees}\nכמות שעות עבודה: ${hours}`;
  }
  if (result.result === "already_confirmed") return "הפעולה כבר בוצעה בהצלחה.";
  if (result.result === "expired") return "הטיוטה פגה. יש לשלוח את הבקשה מחדש.";
  if (result.result === "cancelled") return "הטיוטה בוטלה ולא ניתן לאשר אותה.";
  return "הטיוטה אינה קיימת או כבר טופלה.";
}
