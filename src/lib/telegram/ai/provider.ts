import "server-only";
import type { ParsedIntent } from "./schema";
import type { TelegramPerformance } from "../performance";

export type ParseContext = {
  businessDate: string;
  previousFilters?: Record<string, unknown> | null;
};

export interface HebrewIntentProvider {
  parse(message: string, context: ParseContext, performance?: TelegramPerformance): Promise<ParsedIntent>;
}
