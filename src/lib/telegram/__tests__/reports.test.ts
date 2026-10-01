import { describe, expect, it } from "vitest";
import { buildReportResult, formatEmptyReport, formatReportResult, reportPeriodFromContext, resolveReportPeriod, type ReportRow } from "../reports";
import { parseSimpleReportQuery, parseSimpleTimeEntry } from "../fast-path";
import { resolveEntity } from "../resolution";

const months=[
  ["ינואר",1],["פברואר",2],["מרץ",3],["אפריל",4],["מאי",5],["יוני",6],
  ["יולי",7],["אוגוסט",8],["ספטמבר",9],["אוקטובר",10],["נובמבר",11],["דצמבר",12],
] as const;

const rows:ReportRow[]=[
  {work_date:"2026-09-01",employee_id:"e1",project_id:"p1",regular_hours:8,overtime_hours:0,source:"telegram",notes:null,employee:{first_name:"מואיד",last_name:""},project:{name:"עובדי רג״י טל"}},
  {work_date:"2026-09-02",employee_id:"e1",project_id:"p2",regular_hours:7,overtime_hours:1,source:"telegram",notes:"לילה",employee:{first_name:"מואיד",last_name:""},project:{name:"לשם - שוהם"}},
  {work_date:"2026-09-02",employee_id:"e2",project_id:"p2",regular_hours:8,overtime_hours:0,source:"web",notes:null,employee:{first_name:"יוסף",last_name:"נחאש"},project:{name:"לשם - שוהם"}},
];

describe("deterministic report periods",()=>{
  it("fixes the exact October production regression",()=>{
    expect(resolveReportPeriod("בחודש ספטמבר","2026-10-01")).toEqual({fromInclusive:"2026-09-01",toExclusive:"2026-10-01",label:"ספטמבר 2026",kind:"month"});
    expect(parseSimpleReportQuery("מי עבד בחודש ספטמבר?")?.report?.report_type).toBe("WHO_WORKED");
  });

  it.each(months)("supports the Hebrew month %s",(name,month)=>{
    const expectedYear=month<=10?2026:2025;
    const nextMonth=month===12?1:month+1,nextYear=month===12?expectedYear+1:expectedYear;
    expect(resolveReportPeriod(name,"2026-10-01")).toMatchObject({fromInclusive:`${expectedYear}-${String(month).padStart(2,"0")}-01`,toExclusive:`${nextYear}-${String(nextMonth).padStart(2,"0")}-01`});
  });

  it.each([
    ["ספטמבר","2026-10-01","2026-09-01","2026-10-01"],
    ["אוקטובר","2026-10-01","2026-10-01","2026-11-01"],
    ["נובמבר","2026-10-01","2025-11-01","2025-12-01"],
    ["דצמבר","2027-01-05","2026-12-01","2027-01-01"],
    ["ינואר","2027-01-05","2027-01-01","2027-02-01"],
    ["ספטמבר","2027-01-05","2026-09-01","2026-10-01"],
  ])("uses the most recent non-future occurrence for %s at %s",(reference,businessDate,from,to)=>expect(resolveReportPeriod(reference,businessDate)).toMatchObject({fromInclusive:from,toExclusive:to}));

  it.each([
    ["ספטמבר 2026","2026-09-01","2026-10-01"],
    ["ספטמבר 26","2026-09-01","2026-10-01"],
    ["אוקטובר 2025","2025-10-01","2025-11-01"],
    ["ינואר 2027","2027-01-01","2027-02-01"],
  ])("lets explicit year win for %s",(reference,from,to)=>expect(resolveReportPeriod(reference,"2026-10-01")).toMatchObject({fromInclusive:from,toExclusive:to}));

  it("handles current and previous month at year boundaries",()=>{
    expect(resolveReportPeriod("חודש שעבר","2026-10-01")).toMatchObject({fromInclusive:"2026-09-01",toExclusive:"2026-10-01"});
    expect(resolveReportPeriod("חודש שעבר","2027-01-01")).toMatchObject({fromInclusive:"2026-12-01",toExclusive:"2027-01-01"});
    expect(resolveReportPeriod("החודש","2027-01-05")).toMatchObject({fromInclusive:"2027-01-01",toExclusive:"2027-01-06"});
  });

  it("handles leap-year February without a fake last day",()=>expect(resolveReportPeriod("פברואר","2028-03-01")).toMatchObject({fromInclusive:"2028-02-01",toExclusive:"2028-03-01"}));

  it.each([
    ["היום","2026-10-01","2026-10-02"],["אתמול","2026-09-30","2026-10-01"],
    ["השבוע","2026-09-27","2026-10-02"],["מתחילת השבוע","2026-09-27","2026-10-02"],
  ])("resolves relative period %s",(reference,from,to)=>expect(resolveReportPeriod(reference,"2026-10-01")).toMatchObject({fromInclusive:from,toExclusive:to}));

  it.each([
    ["מ-1.9.26 עד 30.9.26","2026-10-01"],["מ-01/09/2026 עד 30/09/2026","2026-10-01"],["בין 1 לספטמבר ל-15 לספטמבר","2026-09-16"],
  ])("converts inclusive custom range %s to an exclusive upper bound",(reference,toExclusive)=>{const period=resolveReportPeriod(reference,"2026-10-01");expect(period?.fromInclusive).toBe("2026-09-01");expect(period?.toExclusive).toBe(toExclusive);});

  it("rejects reversed or invalid custom ranges",()=>{expect(resolveReportPeriod("מ-30.9.26 עד 1.9.26","2026-10-01")).toBeNull();expect(resolveReportPeriod("מ-31.9.26 עד 2.10.26","2026-10-01")).toBeNull();});
});

describe("shared report result and Telegram presentation",()=>{
  const period=resolveReportPeriod("ספטמבר 2026","2026-10-01")!;
  const result=buildReportResult(rows,period);
  it("calculates company totals from rows",()=>expect(result).toMatchObject({employees:2,projects:2,workDays:2,regularHours:23,overtimeHours:1,totalHours:24}));
  it("formats a company report",()=>{const text=formatReportResult(result,{type:"COMPANY"});expect(text).toContain("דוח שעות — ספטמבר 2026");expect(text).toContain("פירוט לפי עובד");expect(text).toContain("פירוט לפי פרויקט");});
  it("formats who-worked without zero-entry employees",()=>{const text=formatReportResult(result,{type:"WHO_WORKED"});expect(text).toContain("מואיד — 2 ימי עבודה — 16 שעות");expect(text).toContain("עובדים: 2");});
  it("formats an employee report by project",()=>expect(formatReportResult(buildReportResult(rows.filter(row=>row.employee_id==="e1"),period),{type:"EMPLOYEE",employeeName:"מואיד"})).toContain("לפי פרויקט"));
  it("formats a project report by employee",()=>expect(formatReportResult(buildReportResult(rows.filter(row=>row.project_id==="p2"),period),{type:"PROJECT",projectName:"לשם - שוהם"})).toContain("לפי עובד"));
  it("formats an employee and project report",()=>{const text=formatReportResult(buildReportResult(rows.slice(1,2),period),{type:"EMPLOYEE_PROJECT",employeeName:"מואיד",projectName:"לשם - שוהם"});expect(text).toContain("כמות שעות עבודה: 8");});
  it("restores the same resolved period for a report follow-up",()=>expect(reportPeriodFromContext({fromInclusive:"2026-09-01",toExclusive:"2026-10-01",periodLabel:"ספטמבר 2026",periodKind:"month"})).toEqual(period));
  it("formats useful empty results",()=>{expect(formatEmptyReport(period)).toBe("אין דיווחי שעות לספטמבר 2026.");expect(formatEmptyReport(period,"מואיד","לשם - שוהם")).toContain("מואיד בפרויקט לשם - שוהם");});
  it("keeps project aliases and typo resolution on the shared resolver",()=>{expect(resolveEntity("בשוהם",[{id:"p2",name:"לשם - שוהם"}]).kind).toBe("resolved");expect(resolveEntity("שוהמ",[{id:"p2",name:"לשם - שוהם"}]).kind).toBe("resolved");});
  it("keeps ambiguous report entities unresolved",()=>expect(resolveEntity("שוהם",[{id:"p1",name:"לשם - שוהם"},{id:"p2",name:"שוהם גמרים"}]).kind).toBe("ambiguous"));
  it("keeps creation parsing unaffected",()=>expect(parseSimpleTimeEntry("היום יוסף עבד אצל טל 8 שעות")?.intent).toBe("CREATE_TIME_ENTRIES"));
});
