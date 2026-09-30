import type { ParsedIntent } from "./ai/schema";
import { extractDateExpression } from "./dates";

const dateExpression = String.raw`(?:היום|אתמול|ב(?:-|\s)?\d{1,2}\s*לחודש|ביום\s+\d{1,2}\s*לחודש|בתאריך\s+\d{1,2}\s*לחודש|בראשון\s*לחודש|ב(?:-|\s)?\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)`;
const number = String.raw`(\d+(?:\.\d+)?)`;
const patterns = [
  new RegExp(`^(${dateExpression})\\s+(.+?)\\s+עבד(?:ה)?\\s+אצל\\s+(.+?)\\s+${number}\\s+שעות$`),
  new RegExp(`^(${dateExpression})\\s+(.+?)\\s+עבד(?:ה)?\\s+${number}\\s+שעות\\s+אצל\\s+(.+?)$`),
  new RegExp(`^(${dateExpression})\\s+(.+?)\\s+עבד(?:ה)?\\s+ב([^\\s].*?)\\s+${number}\\s+שעות$`),
];

export function parseSimpleTimeEntry(message: string): ParsedIntent | null {
  const normalized = message.trim().replace(/\s+/g, " ");
  for (let index = 0; index < patterns.length; index += 1) {
    const match = normalized.match(patterns[index]);
    if (!match) continue;
    const [date, employee, third, fourth] = match.slice(1);
    const hoursFirst = index === 1;
    const hours = Number(hoursFirst ? third : fourth);
    const project = hoursFirst ? fourth : third;
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return null;
    if (/\sו\S|,|;|\bעבדו\b/.test(employee) || /\sו?ב(?:פרויקט|שוהם|אצל)\b/.test(project)) return null;
    return {
      intent: "CREATE_TIME_ENTRIES",
      create_groups: [{
        date_reference: date,
        project_reference: project,
        entries: [{ employee_reference: employee, regular_hours: hours, overtime_hours: null, notes: null }],
      }],
      report: null,
      missing_information: [],
    };
  }
  const extracted = extractDateExpression(normalized);
  if (!extracted) return null;
  const withoutDate = `${normalized.slice(0, extracted.start)} ${normalized.slice(extracted.end)}`.replace(/\s+/g, " ").trim();
  const anywherePatterns = [
    /^(.+?)\s+עבד(?:ה)?\s+אצל\s+(.+?)\s+(\d+(?:\.\d+)?)\s+שעות$/,
    /^(.+?)\s+עבד(?:ה)?\s+(\d+(?:\.\d+)?)\s+שעות\s+אצל\s+(.+?)$/,
    /^(.+?)\s+עבד(?:ה)?\s+ב([^\s].*?)\s+(\d+(?:\.\d+)?)\s+שעות$/,
    /^(.+?)\s+עבד(?:ה)?\s+(\d+(?:\.\d+)?)\s+שעות\s+ב([^\s].*?)$/,
  ];
  for (let index = 0; index < anywherePatterns.length; index += 1) {
    const match = withoutDate.match(anywherePatterns[index]);
    if (!match) continue;
    const employee = match[1];
    const hoursFirst = index === 1 || index === 3;
    const hours = Number(hoursFirst ? match[2] : match[3]);
    const project = hoursFirst ? match[3] : match[2];
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return null;
    if (/\sו\S|,|;|\bעבדו\b/.test(employee) || /\sו?ב(?:פרויקט|שוהם|אצל)\b/.test(project)) return null;
    return {
      intent: "CREATE_TIME_ENTRIES",
      create_groups: [{
        date_reference: extracted.expression,
        project_reference: project,
        entries: [{ employee_reference: employee, regular_hours: hours, overtime_hours: null, notes: null }],
      }],
      report: null,
      missing_information: [],
    };
  }
  return null;
}

export type ReadOnlyIntent="PROJECTS_LIST"|"EMPLOYEES_LIST"|"TODAY_STATUS";
export function recognizeReadOnlyIntent(message:string):ReadOnlyIntent|null{const text=message.normalize("NFKD").replace(/[?!.,״׳'"-]/g," ").replace(/\s+/g," ").trim();if(/פרויקט/.test(text)&&/(איזה|אילו|מה|תראה|הצג|פתוח|פעיל)/.test(text))return"PROJECTS_LIST";if(/עובד/.test(text)&&/(איזה|אילו|מי|תראה|הצג|רשימ)/.test(text))return"EMPLOYEES_LIST";if(/היום/.test(text)&&/(מי עבד|מה דווח|דיווח|עבד היום)/.test(text))return"TODAY_STATUS";return null;}
