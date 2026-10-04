import { getBusinessDate, monthRangeExclusive, nextDateExclusive } from "./date-ranges";
import type { ExcelReportScope } from "./telegram/excel";
import type { ReportPeriod } from "./telegram/reports";

export type WebsiteReportParams={month?:string;from?:string;to?:string;project?:string;employee?:string};
const datePattern=/^\d{4}-\d{2}-\d{2}$/;

export function resolveWebsiteReport(params:WebsiteReportParams,businessDate=getBusinessDate()){
  const fallbackMonth=businessDate.slice(0,7);let month=params.month??fallbackMonth;
  try{monthRangeExclusive(month);}catch{month=fallbackMonth;}
  const monthRange=monthRangeExclusive(month),from=params.from&&datePattern.test(params.from)?params.from:monthRange.from,inclusiveTo=params.to&&datePattern.test(params.to)?params.to:null,toExclusive=inclusiveTo?nextDateExclusive(inclusiveTo):monthRange.toExclusive;
  const period:ReportPeriod={fromInclusive:from,toExclusive,label:params.from||params.to?`${from}–${inclusiveTo??monthRange.toExclusive}`:month,kind:params.from||params.to?"custom":"month"};
  return{month,period,query:{fromInclusive:from,toExclusive,employeeId:params.employee||undefined,projectId:params.project||undefined}};
}
export function websiteExcelScope(params:WebsiteReportParams,employeeName?:string,projectName?:string):ExcelReportScope{const type=params.employee&&params.project?"EMPLOYEE_PROJECT":params.employee?"EMPLOYEE":params.project?"PROJECT":"COMPANY";return{type,employeeName,projectName};}
export function websiteExcelUrl(params:WebsiteReportParams):string{const query=new URLSearchParams();for(const key of ["month","from","to","project","employee"] as const)if(params[key])query.set(key,params[key]);return `/api/reports/excel?${query.toString()}`;}
