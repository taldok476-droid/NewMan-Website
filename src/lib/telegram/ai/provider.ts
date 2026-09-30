import "server-only";
import type { ParsedIntent } from "./schema";

export type ParseContext = {
  businessDate: string;
  activeProjectNames: string[];
  activeEmployeeNames: string[];
  previousFilters?: Record<string, unknown> | null;
};

export interface HebrewIntentProvider {
  parse(message: string, context: ParseContext): Promise<ParsedIntent>;
}
