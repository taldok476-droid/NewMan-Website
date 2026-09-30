import { NextResponse } from "next/server";
import { answerCallbackQuery, sendChatAction, sendMessage } from "@/lib/telegram/api";
import { isChatAuthorized, isValidWebhookSecret } from "@/lib/telegram/auth";
import { claimTelegramUpdate, releaseTelegramUpdate } from "@/lib/telegram/data";
import { routeCommand } from "@/lib/telegram/router";
import { telegramUpdateSchema } from "@/lib/telegram/types";
import { handleClarificationCallback, handleNaturalMessage } from "@/lib/telegram/natural";
import { handleDraftCallback } from "@/lib/telegram/callbacks";
import { TelegramPerformance } from "@/lib/telegram/performance";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const timing = new TelegramPerformance();
  if (!isValidWebhookSecret(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = telegramUpdateSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const callback = parsed.data.callback_query;
  const message = parsed.data.message ?? parsed.data.edited_message;
  if (!message?.text && !callback?.data) return NextResponse.json({ ok: true });

  try {
    const claimed = await timing.measure("idempotency",()=>claimTelegramUpdate(parsed.data.update_id));
    if (!claimed) { timing.log({updateId:parsed.data.update_id,flow:"retry"}); return NextResponse.json({ ok: true }); }

    if (callback?.data && callback.message) {
      const chatId = callback.message.chat.id;
      const authorized=await timing.measure("authorization",async()=>isChatAuthorized(chatId));
      if (!authorized) {
        console.warn("Unauthorized Telegram callback attempt", { chatId });
        await answerCallbackQuery(callback.id, "אין הרשאה");
      } else {
        const clarification=callback.data.startsWith("clarify:");
        const reply = clarification ? await handleClarificationCallback(chatId,callback.from.id,callback.data,timing) : await handleDraftCallback(chatId, callback.from.id, callback.data);
        await answerCallbackQuery(callback.id);
        await timing.measure("telegram_send",()=>sendMessage(chatId, typeof reply==="string"?reply:reply.text, typeof reply==="string"?{}:{inlineKeyboard:reply.inlineKeyboard}));
      }
      timing.log({updateId:parsed.data.update_id,flow:"callback"});
    } else if (message?.text) {
      const authorized=await timing.measure("authorization",async()=>isChatAuthorized(message.chat.id));
      const reply = await routeCommand(message.chat.id, message.text);
      if (reply) {
        await timing.measure("telegram_send",()=>sendMessage(message.chat.id, reply));
        timing.log({updateId:parsed.data.update_id,flow:message.text.startsWith("/")?"command":"unauthorized"});
      } else if (authorized) {
        await timing.measure("typing",()=>sendChatAction(message.chat.id));
        const naturalReply = await handleNaturalMessage(message.chat.id, message.from?.id ?? message.chat.id, message.text, timing);
        await timing.measure("telegram_send",()=>sendMessage(message.chat.id, naturalReply.text, { inlineKeyboard: naturalReply.inlineKeyboard }));
        timing.log({updateId:parsed.data.update_id,flow:"natural"});
      }
    }
  } catch (error) {
    await releaseTelegramUpdate(parsed.data.update_id).catch(() => undefined);
    console.error("Telegram webhook processing failed", {
      updateId: parsed.data.update_id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    timing.log({updateId:parsed.data.update_id,flow:"error"});
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
