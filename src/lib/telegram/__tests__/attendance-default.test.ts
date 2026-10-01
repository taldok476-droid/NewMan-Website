import {describe,expect,it} from "vitest";
import {applyDefaultWorkdayHours,parseAttendanceList,parseSimpleTimeEntry} from "../fast-path";
import {resolveDateReference} from "../dates";
import {resolveEntity} from "../resolution";

const finalized=(message:string)=>{
  const parsed=parseAttendanceList(message)??parseSimpleTimeEntry(message);
  return parsed?applyDefaultWorkdayHours(parsed):null;
};

describe("eight-hour Telegram business default",()=>{
  it("defaults every employee in the primary list format",()=>{
    const parsed=finalized("היום עובדים אצל טל\nיוסף\nקיס\nמואיד")!;
    expect(parsed.create_groups[0].entries.map(entry=>entry.regular_hours)).toEqual([8,8,8]);
    expect(parsed.create_groups[0].entries.map(entry=>entry.overtime_hours)).toEqual([0,0,0]);
  });

  it("keeps an override local to its employee",()=>{
    const parsed=finalized("היום עובדים אצל טל\nיוסף\nקיס 10\nמואיד")!;
    expect(parsed.create_groups[0].entries.map(entry=>entry.regular_hours)).toEqual([8,10,8]);
  });

  it.each([
    ["קיס 9.5",9.5],
    ["קיס 10 שעות",10],
    ["קיס - 10",10],
    ["קיס: 10",10],
    ["קיס - 9.5 שעות",9.5],
  ])("supports list override %s",(line,hours)=>expect(finalized(`היום עובדים אצל טל\n${line}`)?.create_groups[0].entries[0].regular_hours).toBe(hours));

  it("defaults a natural single employee",()=>expect(finalized("היום יוסף עבד אצל טל")?.create_groups[0].entries[0].regular_hours).toBe(8));

  it("defaults multiple employees in a natural sentence",()=>{
    const entries=finalized("היום יוסף וקיס עבדו אצל טל")?.create_groups[0].entries;
    expect(entries?.map(entry=>[entry.employee_reference,entry.regular_hours])).toEqual([["יוסף",8],["קיס",8]]);
  });

  it.each(["בשוהם","עובדים בשוהם","פרויקט שוהם"])("supports a second project section headed %s",header=>{
    const parsed=finalized(`היום עובדים אצל טל\nיוסף\nקיס 10\n\n${header}\nאמיר\nיונתן 9`)!;
    expect(parsed.create_groups.map(group=>[group.date_reference,group.project_reference,group.entries.map(entry=>entry.regular_hours)])).toEqual([
      ["היום","טל",[8,10]],
      ["היום","שוהם",[8,9]],
    ]);
  });

  it("changes and then inherits an explicit later date",()=>{
    const parsed=finalized("ב25 לחודש עובדים אצל טל\nיוסף\n\nב26 לחודש עובדים בשוהם\nאמיר\n\nפרויקט לשם\nיונתן")!;
    expect(parsed.create_groups.map(group=>resolveDateReference(group.date_reference,"2026-09-30"))).toEqual(["2026-09-25","2026-09-26","2026-09-26"]);
  });

  it.each([
    ["ב25.09.26 עובדים אצל טל\nיוסף","2026-09-25"],
    ["ב25 לספטמבר עובדים בשוהם\nאמיר","2026-09-25"],
  ])("uses the shared date parser for %s",(message,date)=>expect(resolveDateReference(finalized(message)!.create_groups[0].date_reference,"2026-10-01")).toBe(date));

  it("preserves typo, ambiguity, and unknown-name handling for the resolver",()=>{
    const reference=finalized("היום עובדים אצל טל\nקיס")!.create_groups[0].entries[0].employee_reference;
    expect(resolveEntity(reference,[{id:"e1",name:"קייס"}]).kind).toBe("resolved");
    expect(resolveEntity("יוסף",[{id:"e1",name:"יוסף נחאש"},{id:"e2",name:"יוסף כהן"}]).kind).toBe("ambiguous");
    expect(resolveEntity("דוד",[{id:"e1",name:"מואיד"}]).kind).toBe("not_found");
  });

  it("does not turn report requests into attendance lists",()=>{
    expect(parseAttendanceList("מי עבד היום?\nיוסף")).toBeNull();
    expect(parseAttendanceList("כמה שעות עבד יוסף?\nטל")).toBeNull();
    expect(parseAttendanceList("תן לי דוח של מואיד\nטל")).toBeNull();
  });

  it("does not mutate report intents when applying the default",()=>{
    const report={intent:"REPORT_QUERY" as const,create_groups:[],entity_creation:null,report:{report_type:"EMPLOYEE" as const,output_format:"TEXT" as const,employee_reference:"יוסף",project_reference:null,date_reference:"היום",date_from_reference:null,date_to_reference:null},missing_information:["hours"]};
    expect(applyDefaultWorkdayHours(report)).toEqual(report);
  });
});
