import "server-only";
import { parsedIntentJsonSchema, parsedIntentSchema, type ParsedIntent } from "./schema";
import type { HebrewIntentProvider, ParseContext } from "./provider";

export class OpenAIHebrewIntentProvider implements HebrewIntentProvider {
  async parse(message: string, context: ParseContext): Promise<ParsedIntent> {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL;
    if (!apiKey || !model) throw new Error("AI provider is not configured");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          store: false,
          instructions: "Parse Hebrew NEWMAN workforce messages. Never invent names, IDs, dates, or hours. Preserve date phrases exactly for server resolution. For missing hours use null and add 'hours' to missing_information. Multiple projects become multiple create_groups. Report follow-ups may rely on previous filters. Return UNKNOWN for unrelated input.",
          input: JSON.stringify({ message, context }),
          text: { format: { type: "json_schema", name: "newman_intent", strict: true, schema: parsedIntentJsonSchema } },
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`OpenAI request failed with status ${response.status}`);
      const result = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
      const outputText = result.output_text ?? result.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
      if (!outputText) throw new Error("OpenAI returned no structured output");
      return parsedIntentSchema.parse(JSON.parse(outputText));
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function getIntentProvider(): HebrewIntentProvider {
  return new OpenAIHebrewIntentProvider();
}
