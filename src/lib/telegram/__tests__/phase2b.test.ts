import { describe,expect,it } from "vitest";
import { parsedIntentSchema } from "../ai/schema";
import { draftAvailability,mergeReportFilters,parseDraftCallback } from "../business";
import { resolveDateReference } from "../dates";
import { resolveEntity } from "../resolution";

const businessDate="2026-09-30";
const employees=[{id:"1",name:"מואיד אבו"},{id:"2",name:"יוסף כהן"},{id:"3",name:"יוסף לוי"},{id:"4",name:"קייס"}];
const projects=[{id:"p1",name:"עובדי רג״י טל"},{id:"p2",name:"שוהם"}];
const create=(groups:unknown)=>parsedIntentSchema.parse({intent:"CREATE_TIME_ENTRIES",create_groups:groups,report:null,missing_information:[]});
describe("Phase 2B business behavior",()=>{
 it("1 parses a same-hours structured draft",()=>expect(create([{date_reference:"היום",project_reference:"טל",entries:["מואיד","יוסף כהן","קייס"].map(employee_reference=>({employee_reference,regular_hours:8,overtime_hours:null,notes:null}))}]).create_groups[0].entries).toHaveLength(3));
 it("2 preserves different employee hours",()=>{const p=create([{date_reference:"אתמול",project_reference:"טל",entries:[{employee_reference:"מואיד",regular_hours:8,overtime_hours:null,notes:null},{employee_reference:"קייס",regular_hours:10,overtime_hours:null,notes:null}]}]);expect(p.create_groups[0].entries[1].regular_hours).toBe(10);});
 it("3 supports multiple projects",()=>expect(create([{date_reference:"היום",project_reference:"טל",entries:[{employee_reference:"מואיד",regular_hours:8,overtime_hours:null,notes:null}]},{date_reference:"היום",project_reference:"שוהם",entries:[{employee_reference:"יוסי",regular_hours:9,overtime_hours:null,notes:null}]}]).create_groups).toHaveLength(2));
 it("4 resolves an explicit date without year",()=>expect(resolveDateReference("ב-28.9",businessDate)).toBe("2026-09-28"));
 it("5 reports an unknown employee",()=>expect(resolveEntity("ארנון",employees).kind).toBe("not_found"));
 it("6 reports an ambiguous employee",()=>expect(resolveEntity("יוסף",employees).kind).toBe("ambiguous"));
 it("7 reports an unknown project",()=>expect(resolveEntity("חיפה",projects).kind).toBe("not_found"));
 it("8 retains missing hours as null",()=>{const p=create([{date_reference:"היום",project_reference:"טל",entries:[{employee_reference:"מואיד",regular_hours:null,overtime_hours:null,notes:null}]}]);expect(p.create_groups[0].entries[0].regular_hours).toBeNull();});
 it("9 requires an explicit update callback for duplicates",()=>expect(parseDraftCallback("update:11111111-1111-1111-1111-111111111111")?.action).toBe("update"));
 it("10 recognizes an already confirmed draft",()=>expect(draftAvailability("confirmed","2099-01-01T00:00:00Z")).toBe("already_confirmed"));
 it("11 recognizes an expired draft",()=>expect(draftAvailability("pending","2020-01-01T00:00:00Z",new Date("2026-01-01"))).toBe("expired"));
 it("12 validates a natural report query structure",()=>expect(parsedIntentSchema.parse({intent:"REPORT_QUERY",create_groups:[],report:{employee_reference:"מואיד",project_reference:null,date_reference:"ספטמבר",date_from_reference:null,date_to_reference:null},missing_information:[]}).intent).toBe("REPORT_QUERY"));
 it("13 merges follow-up project with previous report filters",()=>expect(mergeReportFilters({employeeReference:"מואיד",from:"2026-09-01",to:"2026-09-30"},{projectReference:"טל"})).toMatchObject({employeeReference:"מואיד",projectReference:"טל"}));
});
