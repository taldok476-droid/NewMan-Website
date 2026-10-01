import { describe, expect, it } from "vitest";
import { formatCombinedDraft, inheritCreateGroupDates, missingReferenceQuestion, type ResolvedDraftEntry } from "../batch";
import { parseMultilineTimeEntries, parseSimpleTimeEntry } from "../fast-path";
import { resolveDateReference } from "../dates";

describe("newline-separated Telegram work groups", () => {
  it.each([
    ["היום קיס עבד עם טל 8 שעות\nוורד נחאש עבד בשוהם 8 שעות", ["טל", "שוהם"]],
    ["היום קיס עבד אצל טל 8 שעות\nוורד נחאש עבד בשוהם 8 שעות", ["טל", "שוהם"]],
    ["היום קיס עבד עם טל 8 שעות\nוורד נחאש בשוהם 8 שעות", ["טל", "שוהם"]],
    ["ב25 לחודש קיס עבד עם טל 8 שעות\nוורד נחאש עבד בשוהם 9 שעות", ["טל", "שוהם"]],
  ])("parses each line as a local group: %s", (message, projects) => {
    const parsed = parseMultilineTimeEntries(message);
    expect(parsed?.create_groups.map((group) => group.project_reference)).toEqual(projects);
    expect(parsed?.create_groups.map((group) => group.date_reference)).toEqual([parsed?.create_groups[0].date_reference, parsed?.create_groups[0].date_reference]);
  });

  it("covers the exact production regression and produces one combined draft", () => {
    const parsed = parseMultilineTimeEntries("היום קיס עבד עם טל 8 שעות\nוורד נחאש עבד בשוהם 8 שעות")!;
    expect(parsed.create_groups).toEqual([
      {date_reference:"היום",project_reference:"טל",entries:[{employee_reference:"קיס",regular_hours:8,overtime_hours:null,notes:null}]},
      {date_reference:"היום",project_reference:"שוהם",entries:[{employee_reference:"וורד נחאש",regular_hours:8,overtime_hours:null,notes:null}]},
    ]);
    const entries:ResolvedDraftEntry[] = parsed.create_groups.map((group,index)=>({
      work_date:"2026-09-30",employee_id:`e${index}`,employee_name:group.entries[0].employee_reference,
      project_id:`p${index}`,project_name:index===0?"עובדי רג״י טל":"לשם - שוהם",
      regular_hours:Number(group.entries[0].regular_hours),overtime_hours:0,notes:null,operation:"insert",
      existing_regular_hours:null,existing_overtime_hours:null,
    }));
    const draft=formatCombinedDraft(entries);
    expect(draft).toContain("• קיס — 8 שעות");
    expect(draft).toContain("• וורד נחאש — 8 שעות");
  });

  it("parses three independent lines with one inherited date", () => {
    const parsed=parseMultilineTimeEntries("היום קיס עבד עם טל 8 שעות\nוורד נחאש עבד בשוהם 8 שעות\nאמיר עבד בלשם 10 שעות")!;
    expect(parsed.create_groups).toHaveLength(3);
    expect(parsed.create_groups.map(group=>group.date_reference)).toEqual(["היום","היום","היום"]);
    expect(parsed.create_groups.map(group=>group.entries[0].regular_hours)).toEqual([8,8,10]);
  });

  it("changes the active date for following lines", () => {
    const parsed=parseMultilineTimeEntries("ב25 לחודש קיס עבד עם טל 8 שעות\nב26 לחודש וורד נחאש עבד בשוהם 9 שעות\nאמיר עבד בלשם 10 שעות")!;
    expect(parsed.create_groups.map(group=>group.date_reference)).toEqual(["ב25 לחודש","ב26 לחודש","ב26 לחודש"]);
    expect(parsed.create_groups.map(group=>resolveDateReference(group.date_reference,"2026-09-30"))).toEqual(["2026-09-25","2026-09-26","2026-09-26"]);
  });

  it("supports עם only inside a clear work-report structure", () => {
    expect(parseSimpleTimeEntry("היום קיס עבד עם טל 8 שעות")?.create_groups[0].project_reference).toBe("טל");
    expect(parseSimpleTimeEntry("היום קיס טייל עם טל 8 שעות")).toBeNull();
  });
});

describe("post-extraction inheritance and empty references", () => {
  it("inherits only an active date and changes it on an explicit later date", () => {
    const normalized=inheritCreateGroupDates({intent:"CREATE_TIME_ENTRIES",entity_creation:null,report:null,missing_information:[],create_groups:[
      {date_reference:"היום",project_reference:"טל",entries:[{employee_reference:"קיס",regular_hours:8,overtime_hours:null,notes:null}]},
      {date_reference:"",project_reference:"שוהם",entries:[{employee_reference:"וורד",regular_hours:8,overtime_hours:null,notes:null}]},
      {date_reference:"ב26 לחודש",project_reference:"לשם",entries:[{employee_reference:"אמיר",regular_hours:10,overtime_hours:null,notes:null}]},
      {date_reference:" ",project_reference:"טל",entries:[{employee_reference:"קייס",regular_hours:7,overtime_hours:null,notes:null}]},
    ]});
    expect(normalized.create_groups.map(group=>group.date_reference)).toEqual(["היום","היום","ב26 לחודש","ב26 לחודש"]);
    expect(normalized.create_groups.map(group=>group.project_reference)).toEqual(["טל","שוהם","לשם","טל"]);
  });

  it("uses a human project question instead of resolving an empty reference", () => {
    const message=missingReferenceQuestion("project","וורד נחאש");
    expect(message).toBe("לא הצלחתי לזהות באיזה פרויקט עבד וורד נחאש. באיזה פרויקט לדווח אותו?");
    expect(message).not.toContain('התואם ל-""');
  });

  it("uses a human employee question instead of resolving an empty reference", () => {
    const message=missingReferenceQuestion("employee");
    expect(message).toContain("מה שם העובד?");
    expect(message).not.toContain('עובד בשם ""');
  });
});
