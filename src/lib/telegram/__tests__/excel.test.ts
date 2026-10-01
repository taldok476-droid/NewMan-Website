import { describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import ExcelJS from "exceljs";
import { generateExcelReport, MAX_EXCEL_DETAIL_ROWS } from "../excel";
import { buildReportResult, formatEmptyReport, resolveReportPeriod, type ReportRow } from "../reports";
import { EXCEL_DELIVERY_FAILURE_MESSAGE } from "../delivery";

const rows:ReportRow[]=[
  {work_date:"2026-09-01",employee_id:"uuid-secret-1",project_id:"uuid-secret-p1",regular_hours:8,overtime_hours:0,source:"telegram",notes:null,employee:{first_name:"מואיד",last_name:""},project:{name:"עובדי רג״י טל"}},
  {work_date:"2026-09-02",employee_id:"uuid-secret-1",project_id:"uuid-secret-p2",regular_hours:7.5,overtime_hours:1.5,source:"telegram",notes:"משמרת ערב",employee:{first_name:"מואיד",last_name:""},project:{name:"לשם - שוהם"}},
  {work_date:"2026-09-02",employee_id:"uuid-secret-2",project_id:"uuid-secret-p2",regular_hours:8,overtime_hours:0,source:"web",notes:null,employee:{first_name:"יוסף",last_name:"נחאש"},project:{name:"לשם - שוהם"}},
];
const period=resolveReportPeriod("ספטמבר 2026","2026-10-01")!;
const result=buildReportResult(rows,period);
async function workbook(type:"COMPANY"|"EMPLOYEE"|"PROJECT"|"EMPLOYEE_PROJECT"="COMPANY"){const generated=await generateExcelReport(result,{type,employeeName:type.includes("EMPLOYEE")?"מואיד":undefined,projectName:type.includes("PROJECT")?"לשם - שוהם":undefined});const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(generated.data as never);return{generated,loaded};}

describe("Telegram Excel reports",()=>{
  it.each(["COMPANY","EMPLOYEE","PROJECT","EMPLOYEE_PROJECT"] as const)("generates a %s workbook",async type=>{const{generated,loaded}=await workbook(type);expect(generated.data.byteLength).toBeGreaterThan(1000);expect(loaded.worksheets.map(sheet=>sheet.name)).toEqual(["סיכום","לפי עובדים","לפי פרויקטים","פירוט דיווחים"]);});
  it("uses Hebrew headers without employee numbers",async()=>{const{loaded}=await workbook();const employeeHeaders=loaded.getWorksheet("לפי עובדים")?.getRow(1).values,detailHeaders=loaded.getWorksheet("פירוט דיווחים")?.getRow(1).values;expect(employeeHeaders).toEqual([undefined,"עובד","ימי עבודה","שעות רגילות","שעות נוספות","סה״כ שעות"]);expect(detailHeaders).toContain("מקור דיווח");expect(JSON.stringify([employeeHeaders,detailHeaders])).not.toContain("מספר עובד");});
  it("keeps workbook totals equal to ReportResult",async()=>{const{loaded}=await workbook();const summary=loaded.getWorksheet("סיכום")!;const totalCell=summary.getColumn(1).values.findIndex(value=>value==="כמות שעות עבודה");expect(summary.getCell(totalCell,2).value).toBe(result.totalHours);});
  it("writes every detailed source row without UUIDs",async()=>{const{loaded}=await workbook();const details=loaded.getWorksheet("פירוט דיווחים")!;expect(details.rowCount).toBe(rows.length+1);const json=JSON.stringify(details.getSheetValues());expect(json).not.toContain("uuid-secret");expect(json).toContain("משמרת ערב");});
  it("configures RTL worksheets",async()=>{const{loaded}=await workbook();expect(loaded.worksheets.every(sheet=>sheet.views[0]?.rightToLeft)).toBe(true);});
  it("formats dates as DD/MM/YYYY",async()=>{const{loaded}=await workbook();expect(loaded.getWorksheet("פירוט דיווחים")?.getCell("A2").numFmt).toBe("dd/mm/yyyy");});
  it("preserves decimal hours and overtime",async()=>{const{loaded}=await workbook();const details=loaded.getWorksheet("פירוט דיווחים")!;const evening=details.getRows(2,details.rowCount-1)?.find(row=>row.getCell(8).value==="משמרת ערב");expect(evening?.getCell(4).value).toBe(7.5);expect(evening?.getCell(5).value).toBe(1.5);expect(result.overtimeHours).toBe(1.5);});
  it("does not generate delivery for an empty result in the report flow",()=>expect(formatEmptyReport(period)).toBe("אין דיווחי שעות לספטמבר 2026."));
  it("creates a deterministic safe filename",async()=>expect((await generateExcelReport(result,{type:"COMPANY"})).filename).toBe("newman-hours-2026-09-company.xlsx"));
  it("provides a safe Telegram upload failure message",()=>{expect(EXCEL_DELIVERY_FAILURE_MESSAGE).toContain("בעיה בשליחת קובץ ה-Excel");expect(EXCEL_DELIVERY_FAILURE_MESSAGE).not.toContain("token");});
  it("enforces the synchronous detail-row limit",async()=>{const oversized=buildReportResult(Array.from({length:MAX_EXCEL_DETAIL_ROWS+1},()=>rows[0]),period);await expect(generateExcelReport(oversized,{type:"COMPANY"})).rejects.toThrow("EXCEL_REPORT_TOO_LARGE");});
});
