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
          instructions: `Extract Hebrew workforce intent to the strict schema. Read-only intents: PROJECTS_LIST, EMPLOYEES_LIST, TODAY_STATUS.
For CREATE_TIME_ENTRIES, emit one create_group per distinct date+project segment. Copy every employee, project, and date reference from the message; never invent IDs, calendar dates, people, projects, or hours. Server code resolves all references and dates.
Line breaks may separate independent work groups even without punctuation or a Hebrew conjunction. A date stated at the beginning remains the active date for following groups until another explicit supported date expression appears. Repeat that active textual date_reference in every extracted group.
In a work-report construction, phrases such as "עבד עם טל", "עובד עם טל", and "היה עם טל" may identify טל as the project reference, like "עבד אצל טל". Treat עם this way only inside the local work-report structure. Every group must contain its own exact project_reference when its text supplies one; never output an empty project_reference when a project is explicitly present.
Preserve local grouping and hour scope: "כולם 8" or "שניהם 8" applies only to the immediately associated local employees. If a shared hours value follows a named employee list, repeat that value on each entry. If employees have different hours, preserve each value and never apply the last value globally. Inherit a date only within segments where Hebrew wording clearly does so. Multiple explicit dates must remain separate groups.
Missing or ambiguous hours must be null and add "hours" to missing_information. Split multiple projects and dates into groups. Keep overtime separate only when explicitly stated; otherwise use null. Do not merge repeated names across different projects or dates.
Use previous filters only for report follow-ups. Unrelated input=UNKNOWN.`,
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
