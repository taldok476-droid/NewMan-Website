import "server-only";
import { parsedIntentJsonSchema, parsedIntentSchema, type ParsedIntent } from "./schema";
import type { HebrewIntentProvider, ParseContext } from "./provider";
import type { TelegramPerformance } from "../performance";

export class OpenAIHebrewIntentProvider implements HebrewIntentProvider {
  async parse(message: string, context: ParseContext, timing?: TelegramPerformance): Promise<ParsedIntent> {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL;
    if (!apiKey || !model) throw new Error("AI provider is not configured");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const aiStarted=performance.now();
    try {
      timing?.set("ai_request_started",true);
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          store: false,
          instructions: "Extract Hebrew workforce intent to the schema. Read-only intents: PROJECTS_LIST, EMPLOYEES_LIST, TODAY_STATUS. Copy name/project/date references verbatim; never invent IDs, dates, or hours. Missing hours=null plus missing_information=['hours']. Split multiple projects into groups. Use previous filters only for report follow-ups. Unrelated input=UNKNOWN.",
          input: JSON.stringify({ message, context }),
          reasoning: /^(gpt-[56]|o[134])/.test(model) ? { effort: "low" } : undefined,
          text: { format: { type: "json_schema", name: "newman_intent", strict: true, schema: parsedIntentJsonSchema } },
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`OpenAI request failed with status ${response.status}`);
      const result = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
      timing?.set("ai_request_completed",true);
      const outputText = result.output_text ?? result.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
      if (!outputText) throw new Error("OpenAI returned no structured output");
      const parsingStarted=performance.now();
      const parsed=parsedIntentSchema.parse(JSON.parse(outputText));
      timing?.duration("ai_parse",parsingStarted);
      return parsed;
    } finally {
      timing?.duration("ai",aiStarted);
      clearTimeout(timeout);
    }
  }
}

export function getIntentProvider(): HebrewIntentProvider {
  return new OpenAIHebrewIntentProvider();
}
