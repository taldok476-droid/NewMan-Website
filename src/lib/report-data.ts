import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportRow } from "./telegram/reports";

export type ReportQueryFilters = { employeeId?:string;projectId?:string;fromInclusive:string;toExclusive:string };

/** Shared authoritative report-row query for Telegram and the authenticated website. */
export async function queryReportRows(client:SupabaseClient,filters:ReportQueryFilters):Promise<ReportRow[]>{
  let query=client.from("time_entries").select("work_date,employee_id,project_id,regular_hours,overtime_hours,source,notes,employees(first_name,last_name),projects(name)").gte("work_date",filters.fromInclusive).lt("work_date",filters.toExclusive);
  if(filters.employeeId)query=query.eq("employee_id",filters.employeeId);
  if(filters.projectId)query=query.eq("project_id",filters.projectId);
  const {data,error}=await query.order("work_date");
  if(error)throw new Error(`Report query failed: ${error.code}`);
  return (data??[]).map(row=>({work_date:String(row.work_date),employee_id:String(row.employee_id),project_id:String(row.project_id),regular_hours:Number(row.regular_hours),overtime_hours:Number(row.overtime_hours),source:String(row.source),notes:row.notes===null?null:String(row.notes),employee:Array.isArray(row.employees)?row.employees[0]??null:row.employees,project:Array.isArray(row.projects)?row.projects[0]??null:row.projects})) as ReportRow[];
}
