import { NextResponse } from "next/server";
import { answerCallbackQuery, sendMessage } from "@/lib/telegram/api";
import { isChatAuthorized, isValidWebhookSecret } from "@/lib/telegram/auth";
import { claimTelegramUpdate, releaseTelegramUpdate } from "@/lib/telegram/data";
import { routeCommand } from "@/lib/telegram/router";
import { telegramUpdateSchema } from "@/lib/telegram/types";
import { handleNaturalMessage } from "@/lib/telegram/natural";
import { handleDraftCallback } from "@/lib/telegram/callbacks";

export const runtime = "nodejs";

export async function POST(request: Request) {
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
    const claimed = await claimTelegramUpdate(parsed.data.update_id);
    if (!claimed) return NextResponse.json({ ok: true });

    if (callback?.data && callback.message) {
      const chatId = callback.message.chat.id;
      if (!isChatAuthorized(chatId)) {
        console.warn("Unauthorized Telegram callback attempt", { chatId });
        await answerCallbackQuery(callback.id, "אין הרשאה");
      } else {
        const reply = await handleDraftCallback(chatId, callback.from.id, callback.data);
        await answerCallbackQuery(callback.id);
        await sendMessage(chatId, reply);
      }
    } else if (message?.text) {
      const reply = await routeCommand(message.chat.id, message.text);
      if (reply) {
        await sendMessage(message.chat.id, reply);
      } else if (isChatAuthorized(message.chat.id)) {
        const naturalReply = await handleNaturalMessage(message.chat.id, message.from?.id ?? message.chat.id, message.text);
        await sendMessage(message.chat.id, naturalReply.text, { inlineKeyboard: naturalReply.inlineKeyboard });
      }
    }
  } catch (error) {
    await releaseTelegramUpdate(parsed.data.update_id).catch(() => undefined);
    console.error("Telegram webhook processing failed", {
      updateId: parsed.data.update_id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
