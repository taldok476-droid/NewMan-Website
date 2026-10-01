import "server-only";
import ExcelJS from "exceljs";
import type { ReportResult } from "./reports";

export const MAX_EXCEL_DETAIL_ROWS = 10_000;

export type ExcelReportScope = { type:"COMPANY"|"WHO_WORKED"|"EMPLOYEE"|"PROJECT"|"EMPLOYEE_PROJECT";employeeName?:string;projectName?:string };
export type GeneratedExcelReport = { filename:string;data:Buffer };

const navy="1F4E78",blue="D9EAF7",light="F3F6F9",white="FFFFFF";

function safeFilename(result:ReportResult,scope:ExcelReportScope):string {
  const month=result.period.fromInclusive.slice(0,7);
  const suffix=scope.type==="EMPLOYEE_PROJECT"?"employee-project":scope.type==="EMPLOYEE"?"employee":scope.type==="PROJECT"?"project":"company";
  return `newman-hours-${month}-${suffix}.xlsx`;
}

function setupSheet(sheet:ExcelJS.Worksheet,widths:number[],freeze=true){
  sheet.views=[{rightToLeft:true,state:freeze?"frozen":"normal",ySplit:freeze?1:0}];
  widths.forEach((width,index)=>{sheet.getColumn(index+1).width=width;});
}

function styleHeader(row:ExcelJS.Row){row.font={bold:true,color:{argb:white}};row.fill={type:"pattern",pattern:"solid",fgColor:{argb:navy}};row.alignment={horizontal:"right",vertical:"middle"};row.height=22;}
function styleTotals(row:ExcelJS.Row){row.font={bold:true};row.fill={type:"pattern",pattern:"solid",fgColor:{argb:blue}};}
function hoursFormat(sheet:ExcelJS.Worksheet,columns:number[],from=2){for(const column of columns)sheet.getColumn(column).eachCell((cell,row)=>{if(row>=from)cell.numFmt="#,#00.##";});}
function addTableFilter(sheet:ExcelJS.Worksheet,lastColumn:string,lastRow:number){if(lastRow>=1)sheet.autoFilter={from:"A1",to:`${lastColumn}${lastRow}`};}

export async function generateExcelReport(result:ReportResult,scope:ExcelReportScope):Promise<GeneratedExcelReport>{
  if(result.rows.length>MAX_EXCEL_DETAIL_ROWS)throw new Error("EXCEL_REPORT_TOO_LARGE");
  const workbook=new ExcelJS.Workbook();
  workbook.creator="NEW-MAN";workbook.created=new Date();workbook.modified=new Date();

  const summary=workbook.addWorksheet("סיכום");setupSheet(summary,[28,22],false);
  summary.mergeCells("A1:B1");summary.getCell("A1").value="NEW-MAN";summary.getCell("A1").font={bold:true,size:18,color:{argb:navy}};
  summary.mergeCells("A2:B2");summary.getCell("A2").value="דוח שעות עבודה";summary.getCell("A2").font={bold:true,size:14};
  summary.addRow([]);summary.addRow(["תקופה",result.period.label]);
  if(scope.employeeName)summary.addRow(["עובד",scope.employeeName]);
  if(scope.projectName)summary.addRow(["פרויקט",scope.projectName]);
  summary.addRow([]);const summaryHeader=summary.addRow(["מדד","ערך"]);styleHeader(summaryHeader);
  [["מספר עובדים",result.employees],["מספר פרויקטים",result.projects],["ימי עבודה",result.workDays],["כמות שעות עבודה",result.totalHours]].forEach(row=>summary.addRow(row));
  if(result.overtimeHours>0){summary.addRow(["שעות רגילות",result.regularHours]);summary.addRow(["שעות נוספות",result.overtimeHours]);summary.addRow(["סה״כ שעות",result.totalHours]);}
  summary.getColumn(2).numFmt="#,#00.##";

  const employees=workbook.addWorksheet("לפי עובדים");setupSheet(employees,[28,16,14,16,16,16]);
  styleHeader(employees.addRow(["עובד","מספר עובד","ימי עבודה","שעות רגילות","שעות נוספות","סה״כ שעות"]));
  result.byEmployee.forEach(row=>employees.addRow([row.name,row.employeeNumber??"",row.days,row.regularHours,row.overtimeHours,row.hours]));
  const employeeTotal=employees.addRow(["סה״כ","",result.workDays,result.regularHours,result.overtimeHours,result.totalHours]);styleTotals(employeeTotal);hoursFormat(employees,[3,4,5,6]);addTableFilter(employees,"F",Math.max(1,employees.rowCount-1));

  const projects=workbook.addWorksheet("לפי פרויקטים");setupSheet(projects,[32,16,14,16,16,16]);
  styleHeader(projects.addRow(["פרויקט","מספר עובדים","ימי עבודה","שעות רגילות","שעות נוספות","סה״כ שעות"]));
  result.byProject.forEach(row=>projects.addRow([row.name,row.employees??0,row.days,row.regularHours,row.overtimeHours,row.hours]));
  const projectTotal=projects.addRow(["סה״כ",result.employees,result.workDays,result.regularHours,result.overtimeHours,result.totalHours]);styleTotals(projectTotal);hoursFormat(projects,[2,3,4,5,6]);addTableFilter(projects,"F",Math.max(1,projects.rowCount-1));

  const details=workbook.addWorksheet("פירוט דיווחים");setupSheet(details,[15,26,16,30,16,16,16,16,35]);
  styleHeader(details.addRow(["תאריך","עובד","מספר עובד","פרויקט","שעות רגילות","שעות נוספות","סה״כ שעות","מקור דיווח","הערה"]));
  [...result.rows].sort((a,b)=>a.work_date.localeCompare(b.work_date)||(a.project?.name??"").localeCompare(b.project?.name??"","he")||`${a.employee?.first_name??""} ${a.employee?.last_name??""}`.localeCompare(`${b.employee?.first_name??""} ${b.employee?.last_name??""}`,"he")).forEach(row=>details.addRow([new Date(`${row.work_date}T00:00:00Z`),`${row.employee?.first_name??""} ${row.employee?.last_name??""}`.trim(),row.employee?.employee_number??"",row.project?.name??"",row.regular_hours,row.overtime_hours,row.regular_hours+row.overtime_hours,row.source,row.notes??""]));
  details.getColumn(1).numFmt="dd/mm/yyyy";hoursFormat(details,[5,6,7]);addTableFilter(details,"I",details.rowCount);
  for(const sheet of workbook.worksheets){sheet.eachRow(row=>row.eachCell(cell=>{cell.alignment={...cell.alignment,horizontal:"right",vertical:"middle"};cell.border={bottom:{style:"hair",color:{argb:light}}};}));}
  const data=await workbook.xlsx.writeBuffer();
  return{filename:safeFilename(result,scope),data:Buffer.from(data)};
}
