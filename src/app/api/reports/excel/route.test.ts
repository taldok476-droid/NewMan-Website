import {beforeEach,describe,expect,it,vi} from "vitest";
import ExcelJS from "exceljs";

const mocks=vi.hoisted(()=>({getUser:vi.fn(),queryRows:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("../../../../lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:mocks.getUser}})}));
vi.mock("../../../../lib/report-data",()=>({queryReportRows:mocks.queryRows}));

import {GET} from "./route";

const rows=[
  {work_date:"2026-09-01",employee_id:"e1",project_id:"p1",regular_hours:10,overtime_hours:0,source:"web",notes:null,employee:{first_name:"יוסף",last_name:"נחאש"},project:{name:"טל"}},
  {work_date:"2026-09-02",employee_id:"e1",project_id:"p1",regular_hours:10,overtime_hours:0,source:"telegram",notes:null,employee:{first_name:"יוסף",last_name:"נחאש"},project:{name:"טל"}},
];

describe("authenticated website Excel route",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:{id:"u1"}}});mocks.queryRows.mockResolvedValue(rows);});
  it("returns a valid in-memory XLSX with safe download headers and shared totals",async()=>{const response=await GET(new Request("https://newman.test/api/reports/excel?month=2026-09"));expect(response.status).toBe(200);expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="newman-hours-2026-09-company\.xlsx"$/);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await response.arrayBuffer());const employees=workbook.getWorksheet("לפי עובדים")!;expect(employees.getCell("B2").value).toBe(2);expect(employees.getCell("C2").value).toBe(20);});
  it("rejects an unauthenticated request before querying report data",async()=>{mocks.getUser.mockResolvedValue({data:{user:null}});const response=await GET(new Request("https://newman.test/api/reports/excel?month=2026-09"));expect(response.status).toBe(401);expect(mocks.queryRows).not.toHaveBeenCalled();});
  it("applies the selected month",async()=>{await GET(new Request("https://newman.test/api/reports/excel?month=2026-09"));expect(mocks.queryRows).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({fromInclusive:"2026-09-01",toExclusive:"2026-10-01"}));});
  it("applies custom range, employee, and project filters",async()=>{await GET(new Request("https://newman.test/api/reports/excel?month=2026-09&from=2026-09-05&to=2026-09-20&employee=e1&project=p1"));expect(mocks.queryRows).toHaveBeenCalledWith(expect.anything(),{fromInclusive:"2026-09-05",toExclusive:"2026-09-21",employeeId:"e1",projectId:"p1"});});
});
