import { NextResponse } from "next/server";
import { answerCallbackQuery, editCallbackMessage, sendChatAction, sendDocument, sendMessage } from "@/lib/telegram/api";
import { getTelegramActor, isValidWebhookSecret } from "@/lib/telegram/auth";
import { claimTelegramUpdate, releaseTelegramUpdate } from "@/lib/telegram/data";
import { routeCommand } from "@/lib/telegram/router";
import { telegramUpdateSchema } from "@/lib/telegram/types";
import { handleClarificationCallback, handleNaturalMessage } from "@/lib/telegram/natural";
import { handleDraftCallback } from "@/lib/telegram/callbacks";
import { TelegramPerformance } from "@/lib/telegram/performance";
import { EXCEL_DELIVERY_FAILURE_MESSAGE } from "@/lib/telegram/delivery";

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

    if (callback?.data) {
      await timing.measure("callback_ack",()=>answerCallbackQuery(callback.id)).catch(()=>undefined);
      if(!callback.message){
        console.warn("Telegram callback has no chat message",{updateId:parsed.data.update_id,hasInlineMessageId:Boolean(callback.inline_message_id)});
        timing.log({updateId:parsed.data.update_id,flow:"callback"});
        return NextResponse.json({ok:true});
      }
      const chatId = callback.message.chat.id;
      const actor=await timing.measure("authorization_lookup",()=>getTelegramActor(callback.from.id,chatId,{fresh:true}));
      if (!actor) {
        console.warn("Unauthorized Telegram callback attempt", { chatId });
      } else {
        const clarification=callback.data.startsWith("clarify:");
        const reply = clarification ? await handleClarificationCallback(chatId,callback.from.id,callback.data,actor,timing) : await handleDraftCallback(chatId, callback.from.id, callback.data);
        const text=typeof reply==="string"?reply:reply.text,options=typeof reply==="string"?{}:{inlineKeyboard:reply.inlineKeyboard};
        await timing.measure("telegram_send",()=>editCallbackMessage(chatId,callback.message!.message_id,text,options));
      }
      timing.log({updateId:parsed.data.update_id,flow:"callback"});
    } else if (message?.text) {
      const userId=message.from?.id??message.chat.id;
      const actor=await timing.measure("authorization_lookup",()=>getTelegramActor(userId,message.chat.id));
      const reply = await routeCommand(userId,message.text,actor);
      if (reply) {
        await timing.measure("telegram_send",()=>sendMessage(message.chat.id, reply));
        timing.log({updateId:parsed.data.update_id,flow:message.text.startsWith("/")?"command":"unauthorized"});
      } else if (actor) {
        await timing.measure("typing",()=>sendChatAction(message.chat.id));
        const naturalReply = await handleNaturalMessage(message.chat.id,userId,message.text,actor,timing);
        await timing.measure("telegram_send",async()=>{await sendMessage(message.chat.id,naturalReply.text,{inlineKeyboard:naturalReply.inlineKeyboard});if(naturalReply.document){try{await sendDocument(message.chat.id,naturalReply.document.data,naturalReply.document.filename);}catch(error){console.error("Telegram Excel delivery failed",{updateId:parsed.data.update_id,error:error instanceof Error?error.message:"Unknown error"});await sendMessage(message.chat.id,EXCEL_DELIVERY_FAILURE_MESSAGE);}}});
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
