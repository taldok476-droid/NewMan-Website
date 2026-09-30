import { describe, expect, it } from "vitest";
import { extractDateExpression, HEBREW_MONTHS, resolveDateReference } from "../dates";
import { parseSimpleTimeEntry } from "../fast-path";

const months = [
  ["ינואר", 1, 31], ["פברואר", 2, 28], ["מרץ", 3, 31], ["אפריל", 4, 30],
  ["מאי", 5, 31], ["יוני", 6, 30], ["יולי", 7, 31], ["אוגוסט", 8, 31],
  ["ספטמבר", 9, 30], ["אוקטובר", 10, 31], ["נובמבר", 11, 30], ["דצמבר", 12, 31],
] as const;

describe("generic Hebrew business-date parser", () => {
  it.each(months)("supports the final valid day of %s", (name, month, finalDay) => {
    expect(resolveDateReference(`ב${finalDay} ל${name} 2026`, "2026-06-15"))
      .toBe(`2026-${String(month).padStart(2, "0")}-${finalDay}`);
  });

  it.each(months)("maps the Hebrew month %s", (name, month) => {
    expect(HEBREW_MONTHS[name]).toBe(month);
    expect(resolveDateReference(`ביום ה-15 ב${name} 26`, "2026-01-01"))
      .toBe(`2026-${String(month).padStart(2, "0")}-15`);
  });

  it.each([
    ["ב25.09.26", "2026-09-25"],
    ["ב-25/09/2026", "2026-09-25"],
    ["בתאריך 25.09.26", "2026-09-25"],
    ["בתאריך ה25/09/2026", "2026-09-25"],
    ["ביום 25.09.26", "2026-09-25"],
    ["ביום ה-25/09/2026", "2026-09-25"],
    ["ב01.01.00", "2000-01-01"],
    ["ב31.12.99", "2099-12-31"],
  ])("parses numeric wrapper %s", (input, expected) => {
    expect(resolveDateReference(input, "2026-09-30")).toBe(expected);
  });

  it.each([
    ["ב25 לחודש", "2026-09-30", "2026-09-25"],
    ["ב-25 לחודש", "2026-10-01", "2026-10-25"],
    ["ביום 25 לחודש", "2026-11-10", "2026-11-25"],
    ["בתאריך ה-25 לחודש", "2027-01-03", "2027-01-25"],
  ])("resolves current-month phrase %s from %s", (input, businessDate, expected) => {
    expect(resolveDateReference(input, businessDate)).toBe(expected);
  });

  it.each([
    ["ב31.04.26"], ["ב31.06.26"], ["ב31.09.26"], ["ב31.11.26"],
    ["ב29.02.26"], ["ב30 לפברואר 2026"], ["ב32 לחודש"], ["ב00.10.26"],
  ])("rejects impossible date %s", (input) => {
    expect(resolveDateReference(input, "2026-09-30")).toBeNull();
  });

  it("accepts leap day only in a leap year", () => {
    expect(resolveDateReference("ב29.02.28", "2026-09-30")).toBe("2028-02-29");
    expect(resolveDateReference("ב29 בפברואר 2028", "2026-09-30")).toBe("2028-02-29");
    expect(resolveDateReference("ב29.02.2100", "2026-09-30")).toBeNull();
  });

  it("uses the documented omitted-year rule across New Year", () => {
    expect(resolveDateReference("ב25 לדצמבר", "2027-01-05")).toBe("2026-12-25");
    expect(resolveDateReference("ב25.12", "2027-01-05")).toBe("2026-12-25");
    expect(resolveDateReference("ב20 לינואר", "2027-01-05")).toBe("2027-01-20");
    expect(resolveDateReference("ב10 למרץ", "2027-01-05")).toBe("2026-03-10");
  });

  it("lets an explicit month override the current business month", () => {
    expect(resolveDateReference("ב5 לאוקטובר 26", "2026-09-30")).toBe("2026-10-05");
    expect(resolveDateReference("ב5 לספטמבר 26", "2026-10-01")).toBe("2026-09-05");
  });
});

describe("date extraction and time-entry fast path", () => {
  const examples = [
    ["בתאריך ה25/09/2026 נור מחמוד עבד בשוהם 8 שעות", "2026-09-25", "נור מחמוד", "שוהם"],
    ["ב25.09.26 נור מחמוד עבד בשוהם 8 שעות", "2026-09-25", "נור מחמוד", "שוהם"],
    ["ב25 לספטמבר נור עבד אצל טל 8 שעות", "2026-09-25", "נור", "טל"],
    ["ב25 לחודש נור עבד אצל טל 8 שעות", "2026-09-25", "נור", "טל"],
    ["נור עבד אצל טל 8 שעות ב25.09.26", "2026-09-25", "נור", "טל"],
    ["נור עבד 8 שעות בשוהם בתאריך 5.10.26", "2026-10-05", "נור", "שוהם"],
  ] as const;

  it.each(examples)("extracts and parses: %s", (message, expectedDate, employee, project) => {
    const extracted = extractDateExpression(message);
    expect(extracted).not.toBeNull();
    expect(resolveDateReference(extracted!.expression, "2026-09-30")).toBe(expectedDate);
    const parsed = parseSimpleTimeEntry(message);
    expect(parsed?.intent).toBe("CREATE_TIME_ENTRIES");
    expect(parsed?.create_groups?.[0]).toMatchObject({ project_reference: project });
    expect(parsed?.create_groups?.[0]?.entries[0]).toMatchObject({ employee_reference: employee, regular_hours: 8 });
  });
});
