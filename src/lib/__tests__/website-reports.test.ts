import {describe,expect,it} from "vitest";
import {resolveWebsiteReport,websiteExcelScope,websiteExcelUrl} from "../website-reports";

describe("website report filters",()=>{
  it("resolves a selected month to the same exclusive database range",()=>expect(resolveWebsiteReport({month:"2026-09"},"2026-10-04").query).toEqual({fromInclusive:"2026-09-01",toExclusive:"2026-10-01",employeeId:undefined,projectId:undefined}));
  it("preserves an inclusive custom range and employee/project filters",()=>expect(resolveWebsiteReport({month:"2026-09",from:"2026-09-05",to:"2026-09-20",employee:"e1",project:"p1"},"2026-10-04").query).toEqual({fromInclusive:"2026-09-05",toExclusive:"2026-09-21",employeeId:"e1",projectId:"p1"}));
  it("builds a filter-preserving download URL",()=>{const url=websiteExcelUrl({month:"2026-09",from:"2026-09-05",to:"2026-09-20",employee:"e1",project:"p1"});expect(url).toContain("month=2026-09");expect(url).toContain("from=2026-09-05");expect(url).toContain("to=2026-09-20");expect(url).toContain("employee=e1");expect(url).toContain("project=p1");});
  it.each([
    [{},"COMPANY"],[{employee:"e1"},"EMPLOYEE"],[{project:"p1"},"PROJECT"],[{employee:"e1",project:"p1"},"EMPLOYEE_PROJECT"],
  ] as const)("selects the shared workbook scope",(params,type)=>expect(websiteExcelScope(params)).toMatchObject({type}));
});
