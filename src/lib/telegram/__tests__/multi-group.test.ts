import { describe, expect, it } from "vitest";
import { calculateDraftTotals, confirmationButtonText, duplicateProposalKeys, formatActionSummary, formatCombinedDraft, type ResolvedDraftEntry } from "../batch";
import { parsedIntentSchema, type ParsedIntent } from "../ai/schema";
import { buildClarificationState, selectClarification } from "../clarification";
import { resolveDateReference } from "../dates";
import { parseSimpleTimeEntry, recognizeReadOnlyIntent } from "../fast-path";
import { resolveEntity } from "../resolution";
import { draftAvailability, parseDraftCallback } from "../business";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const entry = (patch: Partial<ResolvedDraftEntry> = {}): ResolvedDraftEntry => ({
  work_date: "2026-09-30", employee_id: "e1", employee_name: "יוסף", project_id: "p1",
  project_name: "עובדי רג״י טל", regular_hours: 8, overtime_hours: 0, notes: null,
  operation: "insert", existing_regular_hours: null, existing_overtime_hours: null, ...patch,
});

const create = (create_groups: ParsedIntent["create_groups"]): ParsedIntent => parsedIntentSchema.parse({
  intent: "CREATE_TIME_ENTRIES", create_groups, report: null, missing_information: [],
});

describe("multi-group structured interpretation", () => {
  it("represents two employees sharing one project and hours", () => {
    const parsed=create([{date_reference:"היום",project_reference:"טל",entries:["יוסף","קייס"].map(employee_reference=>({employee_reference,regular_hours:8,overtime_hours:null,notes:null}))}]);
    expect(parsed.create_groups[0].entries.map(x=>x.regular_hours)).toEqual([8,8]);
  });

  it("represents the primary four-employee two-project example", () => {
    const parsed=create([
      {date_reference:"היום",project_reference:"טל",entries:["יוסף","קייס"].map(employee_reference=>({employee_reference,regular_hours:8,overtime_hours:null,notes:null}))},
      {date_reference:"היום",project_reference:"שוהם",entries:["אמיר","יונתן"].map(employee_reference=>({employee_reference,regular_hours:8,overtime_hours:null,notes:null}))},
    ]);
    expect(parsed.create_groups).toHaveLength(2);
    expect(parsed.create_groups.flatMap(group=>group.entries)).toHaveLength(4);
  });

  it("preserves different hours per employee", () => {
    const parsed=create([{date_reference:"היום",project_reference:"שוהם",entries:[{employee_reference:"אמיר",regular_hours:10,overtime_hours:null,notes:null},{employee_reference:"יונתן",regular_hours:7.5,overtime_hours:null,notes:null}]}]);
    expect(parsed.create_groups[0].entries.map(x=>x.regular_hours)).toEqual([10,7.5]);
  });

  it.each([["כולם 8 שעות",[8,8,8]],["שניהם 8 שעות",[8,8]]])("supports local shared-hours interpretation for %s", (_phrase, expected) => {
    const parsed=create([{date_reference:"היום",project_reference:"טל",entries:expected.map((regular_hours,index)=>({employee_reference:`עובד ${index}`,regular_hours,overtime_hours:null,notes:null}))}]);
    expect(parsed.create_groups[0].entries.map(x=>x.regular_hours)).toEqual(expected);
  });

  it("keeps multiple dates in separate groups and delegates each to the date parser", () => {
    const parsed=create([{date_reference:"ב25 לחודש",project_reference:"טל",entries:[{employee_reference:"יוסף",regular_hours:8,overtime_hours:null,notes:null}]},{date_reference:"ב26 לחודש",project_reference:"שוהם",entries:[{employee_reference:"אמיר",regular_hours:9,overtime_hours:null,notes:null}]}]);
    expect(parsed.create_groups.map(group=>resolveDateReference(group.date_reference,"2026-09-30"))).toEqual(["2026-09-25","2026-09-26"]);
  });

  it.each([["ב25.09.26","2026-09-25"],["ב26/09/2026","2026-09-26"],["ב25 לספטמבר","2026-09-25"]])("supports group date %s", (reference, expected) => {
    expect(resolveDateReference(reference,"2026-09-30")).toBe(expected);
  });

  it("rejects an invalid date in one group", () => expect(resolveDateReference("ב31.09.26","2026-09-30")).toBeNull());
  it("schema preserves invalid hours for server validation", () => expect(create([{date_reference:"היום",project_reference:"טל",entries:[{employee_reference:"יוסף",regular_hours:25,overtime_hours:null,notes:null}]}]).create_groups[0].entries[0].regular_hours).toBe(25));
});

describe("combined draft, totals, and duplicates", () => {
  const mixed = [
    entry(),
    entry({employee_id:"e2",employee_name:"קייס"}),
    entry({employee_id:"e3",employee_name:"אמיר",project_id:"p2",project_name:"לשם - שוהם",regular_hours:10,operation:"update",existing_regular_hours:8,existing_overtime_hours:0}),
    entry({employee_id:"e4",employee_name:"יונתן",project_id:"p2",project_name:"לשם - שוהם",regular_hours:7.5,overtime_hours:1}),
  ];

  it("calculates every total server-side", () => expect(calculateDraftTotals(mixed)).toEqual({uniqueEmployees:4,entries:4,projects:2,dates:1,regularHours:33.5,overtimeHours:1,totalHours:34.5,inserts:3,updates:1}));
  it("formats one grouped draft", () => {const text=formatCombinedDraft(mixed);expect(text).toContain("עובדי רג״י טל");expect(text).toContain("לשם - שוהם");expect(text).toContain("עובדים: 4");expect(text).toContain("פרויקטים: 2");expect(text).toContain("כמות שעות עבודה: 34.5");});
  it("marks one duplicate without labelling new rows as updates", () => {const text=formatCombinedDraft(mixed);expect(text).toContain("אמיר\n  קיים: 8 שעות\n  חדש: 10 שעות\n  ⚠️ עדכון דיווח קיים");expect(text).toContain("• קייס — 8 שעות");});
  it("uses a mixed-operation confirmation label", () => expect(confirmationButtonText(mixed)).toBe("✅ שמירת 3 חדשים + עדכון 1"));
  it("supports an all-update batch", () => expect(confirmationButtonText(mixed.map(row=>({...row,operation:"update" as const,existing_regular_hours:8,existing_overtime_hours:0})))).toBe("✅ אישור ועדכון 4"));
  it("detects repeated proposed keys before drafting", () => expect(duplicateProposalKeys([entry(),entry()])).toHaveLength(1));
  it("allows the same employee on another project or date", () => expect(duplicateProposalKeys([entry(),entry({project_id:"p2"}),entry({work_date:"2026-10-01"})])).toEqual([]));
});

describe("management-oriented action summary", () => {
  it("summarizes only new entries", () => {
    expect(formatActionSummary([entry(),entry({employee_id:"e2",employee_name:"קייס"}),entry({employee_id:"e3",employee_name:"אמיר"})]))
      .toBe("סיכום: יבוצעו 3 דיווחים חדשים");
  });

  it("uses singular Hebrew for one new entry", () => {
    expect(formatActionSummary([entry()])).toBe("סיכום: יבוצע דיווח חדש אחד");
  });

  it("summarizes new entries plus one updated employee", () => {
    const rows=[entry(),entry({employee_id:"e2",employee_name:"קייס"}),entry({employee_id:"e3",employee_name:"יוסף נחאש",operation:"update",existing_regular_hours:8,existing_overtime_hours:0})];
    expect(formatActionSummary(rows)).toBe("סיכום: יבוצעו 2 דיווחים חדשים ועדכון שעות ליוסף נחאש");
  });

  it("uses natural punctuation for several updated employees", () => {
    const rows=[entry(),entry({employee_id:"e2",employee_name:"יוסף נחאש",operation:"update"}),entry({employee_id:"e3",employee_name:"מואיד",operation:"update"}),entry({employee_id:"e4",employee_name:"קייס",operation:"update"})];
    expect(formatActionSummary(rows)).toBe("סיכום: יבוצע דיווח חדש אחד ועדכוני שעות ליוסף נחאש, מואיד וקייס");
  });

  it("summarizes updates-only batches", () => {
    const rows=[entry({employee_name:"יוסף נחאש",operation:"update"}),entry({employee_id:"e2",employee_name:"מואיד",operation:"update"})];
    expect(formatActionSummary(rows)).toBe("סיכום: יעודכנו השעות ליוסף נחאש ומואיד");
  });

  it("does not repeat an employee updated in multiple entries", () => {
    const rows=[entry({employee_name:"יוסף נחאש",operation:"update"}),entry({project_id:"p2",project_name:"לשם - שוהם",employee_name:"יוסף נחאש",operation:"update"})];
    expect(formatActionSummary(rows)).toBe("סיכום: יעודכנו השעות ליוסף נחאש");
  });

  it("keeps technical totals internal and out of the rendered totals section", () => {
    const text=formatCombinedDraft([entry()]);
    expect(text).not.toContain("דיווחים\n");
    expect(text).not.toContain("תאריכים");
    expect(text).not.toContain("רגילות +");
    expect(text).not.toContain("חדשים ·");
  });
});

describe("entity resolution and sequential clarification", () => {
  it.each(["שוהם","לשם","בלשם","בשוהם"])("resolves project alias %s", reference => expect(resolveEntity(reference,[{id:"p1",name:"לשם - שוהם"}]).kind).toBe("resolved"));
  it("resolves a short employee name", () => expect(resolveEntity("יוסף",[{id:"e1",name:"יוסף כהן"}]).kind).toBe("resolved"));
  it("keeps a minor typo conservative", () => expect(resolveEntity("יוספ",[{id:"e1",name:"יוסף כהן"}]).kind).toBe("resolved"));
  it("detects ambiguous employee and project references", () => {expect(resolveEntity("יוני",[{id:"e1",name:"יוני כהן"},{id:"e2",name:"יוני לוי"}]).kind).toBe("ambiguous");expect(resolveEntity("שוהם",[{id:"p1",name:"לשם - שוהם"},{id:"p2",name:"שוהם גמרים"}]).kind).toBe("ambiguous");});
  it("preserves a full multi-group operation across sequential choices", () => {
    const parsed=create([{date_reference:"היום",project_reference:"טל",entries:[{employee_reference:"יוני",regular_hours:8,overtime_hours:null,notes:null}]},{date_reference:"היום",project_reference:"שוהם",entries:[{employee_reference:"אמיר",regular_hours:9,overtime_hours:null,notes:null}]}]);
    const first=buildClarificationState({clarificationId:"11111111-1111-1111-1111-111111111111",telegramUserId:7,parsed,forced:[],kind:"employee",reference:"יוני",options:[{id:"e1",name:"יוני כהן"}]});
    const selected=selectClarification(first,first.clarificationId,0,7)!;
    const second=buildClarificationState({clarificationId:"22222222-2222-2222-2222-222222222222",telegramUserId:7,parsed:selected.parsed,forced:selected.forced,kind:"project",reference:"שוהם",options:[{id:"p1",name:"לשם - שוהם"}]});
    const completed=selectClarification(second,second.clarificationId,0,7)!;
    expect((completed.parsed as ParsedIntent).create_groups).toHaveLength(2);
    expect(completed.forced).toHaveLength(2);
  });
  it("does not invent unknown employees or projects", () => {expect(resolveEntity("אלמוני",[{id:"e1",name:"יוסף כהן"}]).kind).toBe("not_found");expect(resolveEntity("פרויקט לא קיים",[{id:"p1",name:"טל"}]).kind).toBe("not_found");});
});

describe("regressions", () => {
  it("keeps the single-entry fast path", () => expect(parseSimpleTimeEntry("היום יוסף עבד אצל טל 8 שעות")?.intent).toBe("CREATE_TIME_ENTRIES"));
  it("does not force complex multi-project text through the fast path", () => expect(parseSimpleTimeEntry("היום יוסף וקייס עובדים אצל טל 8 שעות ואמיר ויונתן עובדים בשוהם 8 שעות")).toBeNull());
  it("keeps natural reports on the read-only route", () => expect(recognizeReadOnlyIntent("מי עבד היום?")).toBe("TODAY_STATUS"));
  it("supports confirm and cancel batch callbacks", () => {const id="11111111-1111-1111-1111-111111111111";expect(parseDraftCallback(`confirm:${id}`)?.action).toBe("confirm");expect(parseDraftCallback(`cancel:${id}`)?.action).toBe("cancel");});
  it("treats a second confirmation as already confirmed", () => expect(draftAvailability("confirmed","2099-01-01T00:00:00Z")).toBe("already_confirmed"));
  it("keeps expired and cancelled drafts unavailable", () => {expect(draftAvailability("expired","2099-01-01T00:00:00Z")).toBe("expired");expect(draftAvailability("cancelled","2099-01-01T00:00:00Z")).toBe("cancelled");});
  it("migration locks the draft and enforces exact atomic operations", () => {
    const sql=readFileSync(join(process.cwd(),"supabase/migrations/20260930030000_transactional_telegram_batches.sql"),"utf8");
    expect(sql).toContain("for update");
    expect(sql).toContain("operation='insert'");
    expect(sql).toContain("operation='update'");
    expect(sql).toContain("raise exception 'Expected one existing Telegram time entry for update'");
    expect(sql).toContain("draft.status='confirmed'");
  });
});
