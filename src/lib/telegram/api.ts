import "server-only";

type SendMessageOptions = {
  parseMode?: "HTML";
  inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>;
};

export async function sendMessage(
  chatId: number,
  text: string,
  options: SendMessageOptions = {},
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: options.parseMode,
      disable_web_page_preview: true,
      reply_markup: options.inlineKeyboard ? { inline_keyboard: options.inlineKeyboard } : undefined,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed with status ${response.status}`);
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");
  const response = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }), cache: "no-store",
  });
  if (!response.ok) throw new Error(`Telegram answerCallbackQuery failed with status ${response.status}`);
}
