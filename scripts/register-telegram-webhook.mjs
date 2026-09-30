import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const baseUrl = process.argv[2] ?? process.env.TELEGRAM_WEBHOOK_URL;

if (!token || !secret || !baseUrl) {
  console.error(
    "Missing configuration. Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET, then pass the public HTTPS URL as the first argument.",
  );
  process.exit(1);
}

const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/telegram/webhook`;
if (!webhookUrl.startsWith("https://")) {
  console.error("The webhook URL must use HTTPS.");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message", "edited_message", "callback_query"],
    drop_pending_updates: false,
  }),
});

const result = await response.json();
if (!response.ok || !result.ok) {
  console.error("Telegram rejected the webhook registration.", {
    status: response.status,
    description: result.description,
  });
  process.exit(1);
}

console.log("Telegram webhook registered successfully.");
