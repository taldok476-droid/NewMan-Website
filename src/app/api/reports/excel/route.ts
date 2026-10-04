import { createClient } from "../../../../lib/supabase/server";
import { queryReportRows } from "../../../../lib/report-data";
import { resolveWebsiteReport, websiteExcelScope, type WebsiteReportParams } from "../../../../lib/website-reports";
import { buildReportResult } from "../../../../lib/telegram/reports";
import { generateExcelReport } from "../../../../lib/telegram/excel";

export async function GET(request:Request){
  const supabase=await createClient(),{data:{user}}=await supabase.auth.getUser();
  if(!user)return Response.json({error:"Unauthorized"},{status:401});
  const params=Object.fromEntries(new URL(request.url).searchParams) as WebsiteReportParams,resolved=resolveWebsiteReport(params);
  if(resolved.period.fromInclusive>=resolved.period.toExclusive)return Response.json({error:"Invalid report range"},{status:400});
  const rows=await queryReportRows(supabase,resolved.query),result=buildReportResult(rows,resolved.period);
  const employeeName=params.employee?result.byEmployee.find(row=>row.id===params.employee)?.name:undefined,projectName=params.project?result.byProject.find(row=>row.id===params.project)?.name:undefined;
  try{
    const report=await generateExcelReport(result,websiteExcelScope(params,employeeName,projectName));
    return new Response(new Uint8Array(report.data),{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="${report.filename}"`,"Cache-Control":"private, no-store"}});
  }catch(error){
    if(error instanceof Error&&error.message==="EXCEL_REPORT_TOO_LARGE")return Response.json({error:"Report too large"},{status:413});
    throw error;
  }
}
