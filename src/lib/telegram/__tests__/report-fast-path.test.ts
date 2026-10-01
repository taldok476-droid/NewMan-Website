import { describe,expect,it } from "vitest";
import { parseEntityReportQuery, parseMultilineTimeEntries, parseSimpleReportQuery, parseSimpleTimeEntry } from "../fast-path";

const employees=[{id:"e1",name:"מואיד אבו סאלח"},{id:"e2",name:"יוסף נחאש"}];
const projects=[{id:"p1",name:"עובדי רג״י טל"},{id:"p2",name:"לשם - שוהם"}];

describe("deterministic report intent paths",()=>{
  it.each([
    ["מי עבד בספטמבר?","WHO_WORKED","TEXT"],
    ["כמה שעות היו בספטמבר?","COMPANY","TEXT"],
    ["תכין לי דוח שעות של ספטמבר","COMPANY","EXCEL"],
    ["תוציא לי אקסל של ספטמבר","COMPANY","EXCEL"],
    ["תן לי דוח חודש שעבר","COMPANY","TEXT"],
  ])("recognizes %s without AI",(message,type,format)=>expect(parseSimpleReportQuery(message)?.report).toMatchObject({report_type:type,output_format:format}));

  it("recognizes a confident employee report",()=>expect(parseEntityReportQuery("כמה שעות עבד מואיד בספטמבר?","2026-10-01",employees,projects)?.report).toMatchObject({report_type:"EMPLOYEE",employee_reference:"מואיד"}));
  it("recognizes a confident project report",()=>expect(parseEntityReportQuery("כמה שעות היו בשוהם בספטמבר?","2026-10-01",employees,projects)?.report).toMatchObject({report_type:"PROJECT",project_reference:"שוהם"}));
  it("recognizes a filtered Excel report",()=>expect(parseEntityReportQuery("תכין לי אקסל של מואיד בשוהם בספטמבר","2026-10-01",employees,projects)?.report).toMatchObject({report_type:"EMPLOYEE_PROJECT",output_format:"EXCEL"}));
  it("falls back when a subject is ambiguous",()=>expect(parseEntityReportQuery("תן לי דוח של יוסף בספטמבר","2026-10-01",[{id:"e1",name:"יוסף נחאש"},{id:"e2",name:"יוסף כהן"}],projects)).toBeNull());
  it("falls back for a complex report",()=>expect(parseEntityReportQuery("תשווה בין מואיד ליוסף בכל הפרויקטים בספטמבר","2026-10-01",employees,projects)).toBeNull());
  it("never classifies a creation message as a report",()=>{const message="היום יוסף עבד אצל טל 8 שעות";expect(parseSimpleReportQuery(message)).toBeNull();expect(parseEntityReportQuery(message,"2026-10-01",employees,projects)).toBeNull();expect(parseSimpleTimeEntry(message)?.intent).toBe("CREATE_TIME_ENTRIES");});
  it("keeps multi-group creation independent",()=>expect(parseMultilineTimeEntries("היום יוסף עבד אצל טל 8 שעות\nמואיד עבד בשוהם 9 שעות")?.intent).toBe("CREATE_TIME_ENTRIES"));
});
