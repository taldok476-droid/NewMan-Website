import { formatHebrewDate, getBusinessDate as sharedBusinessDate, monthRangeExclusive } from "../date-ranges";

export const HEBREW_MONTHS = {
  ינואר: 1, פברואר: 2, מרץ: 3, אפריל: 4, מאי: 5, יוני: 6,
  יולי: 7, אוגוסט: 8, ספטמבר: 9, אוקטובר: 10, נובמבר: 11, דצמבר: 12,
} as const;

const DAY_MS = 86_400_000;
const monthAlternation = Object.keys(HEBREW_MONTHS).join("|");
const wrapper = String.raw`(?:ב(?:[-־]\s*|\s+)?|ביום\s+|בתאריך\s+)?(?:ה[-־]?\s*)?`;
const numericSource = String.raw`${wrapper}\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?`;
const namedMonthSource = String.raw`${wrapper}\d{1,2}\s+(?:ל|ב)(?:${monthAlternation})(?:\s+\d{2,4})?`;
const currentMonthSource = String.raw`${wrapper}(?:\d{1,2}|ראשון)\s*לחודש`;

export const getBusinessDate = sharedBusinessDate;

function iso(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function expandYear(value: string): number {
  const year = Number(value);
  return value.length === 2 ? 2000 + year : year;
}

/**
 * Omitted years use the business-date year, unless that date would be more than
 * 31 days in the future; in that case the previous year is used.
 */
function resolveOmittedYear(month: number, day: number, businessDate: string): string | null {
  const businessYear = Number(businessDate.slice(0, 4));
  const candidate = iso(businessYear, month, day);
  if (!candidate) return null;
  const distance = Date.parse(`${candidate}T00:00:00Z`) - Date.parse(`${businessDate}T00:00:00Z`);
  return distance > 31 * DAY_MS ? iso(businessYear - 1, month, day) : candidate;
}

export function resolveDateReference(reference: string, businessDate: string): string | null {
  const ref = reference.trim().replace(/\s+/g, " ");
  const [year, month, day] = businessDate.split("-").map(Number);
  if (!iso(year, month, day)) return null;
  if (ref === "היום") return businessDate;
  if (ref === "אתמול") {
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }
  if (ref === "החודש") return `${businessDate.slice(0, 7)}-01`;

  const currentMonth = ref.match(new RegExp(`^${wrapper}(ראשון|\\d{1,2})\\s*לחודש$`));
  if (currentMonth) return iso(year, month, currentMonth[1] === "ראשון" ? 1 : Number(currentMonth[1]));

  const numeric = ref.match(new RegExp(`^${wrapper}(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?$`));
  if (numeric) {
    const parsedMonth = Number(numeric[2]);
    const parsedDay = Number(numeric[1]);
    return numeric[3] ? iso(expandYear(numeric[3]), parsedMonth, parsedDay) : resolveOmittedYear(parsedMonth, parsedDay, businessDate);
  }

  const namedMonth = ref.match(new RegExp(`^${wrapper}(\\d{1,2})\\s+(?:ל|ב)(${monthAlternation})(?:\\s+(\\d{2,4}))?$`));
  if (namedMonth) {
    const parsedMonth = HEBREW_MONTHS[namedMonth[2] as keyof typeof HEBREW_MONTHS];
    const parsedDay = Number(namedMonth[1]);
    return namedMonth[3] ? iso(expandYear(namedMonth[3]), parsedMonth, parsedDay) : resolveOmittedYear(parsedMonth, parsedDay, businessDate);
  }

  const bareDay = ref.match(new RegExp(`^${wrapper}(\\d{1,2})$`));
  if (bareDay && /^(?:ב[-־\s]|ביום|בתאריך)/.test(ref)) return iso(year, month, Number(bareDay[1]));

  const monthOnly = ref.match(new RegExp(`^(?:ב)?(${monthAlternation})(?:\\s+(\\d{2,4}))?$`));
  if (monthOnly) {
    const parsedMonth = HEBREW_MONTHS[monthOnly[1] as keyof typeof HEBREW_MONTHS];
    return monthOnly[2] ? iso(expandYear(monthOnly[2]), parsedMonth, 1) : resolveOmittedYear(parsedMonth, 1, businessDate);
  }
  return null;
}

export type ExtractedDateExpression = { expression: string; start: number; end: number };

/** Finds a supported date phrase at any position without interpreting nearby entity text. */
export function extractDateExpression(message: string): ExtractedDateExpression | null {
  const candidates = [numericSource, namedMonthSource, currentMonthSource, String.raw`(?:היום|אתמול)`];
  for (const source of candidates) {
    const match = new RegExp(source).exec(message);
    if (match?.index !== undefined) return { expression: match[0].trim(), start: match.index, end: match.index + match[0].length };
  }
  return null;
}

export function monthRange(reference: string, businessDate: string): [string, string] | null {
  const first = resolveDateReference(reference, businessDate);
  if (!first) return null;
  const range = monthRangeExclusive(first.slice(0, 7));
  const end = new Date(`${range.toExclusive}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return [range.from, end.toISOString().slice(0, 10)];
}

export const formatBusinessDate = formatHebrewDate;
