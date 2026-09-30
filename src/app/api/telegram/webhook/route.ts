import { NextResponse } from "next/server";
import { sendMessage } from "@/lib/telegram/api";
import { isValidWebhookSecret } from "@/lib/telegram/auth";
import { claimTelegramUpdate, releaseTelegramUpdate } from "@/lib/telegram/data";
import { routeCommand } from "@/lib/telegram/router";
import { telegramUpdateSchema } from "@/lib/telegram/types";

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

  const message = parsed.data.message ?? parsed.data.edited_message;
  if (!message?.text) return NextResponse.json({ ok: true });

  try {
    const claimed = await claimTelegramUpdate(parsed.data.update_id);
    if (!claimed) return NextResponse.json({ ok: true });

    const reply = await routeCommand(message.chat.id, message.text);
    if (reply) await sendMessage(message.chat.id, reply);
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
