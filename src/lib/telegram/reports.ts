import { nextDateExclusive } from "../date-ranges";
import { HEBREW_MONTHS, resolveDateReference } from "./dates";

export type ReportPeriod = {
  fromInclusive: string;
  toExclusive: string;
  label: string;
  kind: "day" | "week" | "month" | "custom";
};

export type ReportRow = {
  work_date: string;
  employee_id: string;
  project_id: string;
  regular_hours: number;
  overtime_hours: number;
  source: string;
  notes: string | null;
  employee: { first_name: string; last_name: string } | null;
  project: { name: string } | null;
};

export type ReportBreakdown = { id: string; name: string; employees?:number; days: number; regularHours:number; overtimeHours:number; hours: number };
export type ReportResult = {
  period: ReportPeriod;
  employees: number;
  projects: number;
  workDays: number;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  byEmployee: ReportBreakdown[];
  byProject: ReportBreakdown[];
  rows: ReportRow[];
};

const monthEntries = Object.entries(HEBREW_MONTHS) as Array<[keyof typeof HEBREW_MONTHS, number]>;
const DAY_MS = 86_400_000;

function iso(year:number,month:number,day:number):string {
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}

function shiftDays(date:string,days:number):string {
  return new Date(Date.parse(`${date}T00:00:00Z`)+days*DAY_MS).toISOString().slice(0,10);
}

function expandYear(value:string):number {return value.length===2?2000+Number(value):Number(value);}
function monthLabel(month:number,year:number):string {return `${monthEntries.find(([,number])=>number===month)?.[0]??"חודש"} ${year}`;}
function monthPeriod(year:number,month:number):ReportPeriod {
  const nextYear=month===12?year+1:year,nextMonth=month===12?1:month+1;
  return{fromInclusive:iso(year,month,1),toExclusive:iso(nextYear,nextMonth,1),label:monthLabel(month,year),kind:"month"};
}

/** Month names without a year resolve to their most recent occurrence that is not in the future. */
export function resolveReportPeriod(reference:string,businessDate:string):ReportPeriod|null {
  const normalized=reference.trim().replace(/[?؟!]/g,"").replace(/\s+/g," ");
  const [businessYear,businessMonth]=businessDate.split("-").map(Number);
  if(/^(?:היום)$/.test(normalized))return{fromInclusive:businessDate,toExclusive:nextDateExclusive(businessDate),label:"היום",kind:"day"};
  if(/^(?:אתמול)$/.test(normalized)){const yesterday=shiftDays(businessDate,-1);return{fromInclusive:yesterday,toExclusive:businessDate,label:"אתמול",kind:"day"};}
  if(/^(?:החודש|החודש הזה|חודש נוכחי|מתחילת החודש)$/.test(normalized))return{...monthPeriod(businessYear,businessMonth),toExclusive:nextDateExclusive(businessDate)};
  if(/^(?:חודש שעבר|החודש שעבר)$/.test(normalized)){const month=businessMonth===1?12:businessMonth-1,year=businessMonth===1?businessYear-1:businessYear;return monthPeriod(year,month);}
  if(/^(?:השבוע|השבוע הזה|מתחילת השבוע)$/.test(normalized)){const date=new Date(`${businessDate}T00:00:00Z`),from=shiftDays(businessDate,-date.getUTCDay());return{fromInclusive:from,toExclusive:nextDateExclusive(businessDate),label:"השבוע",kind:"week"};}

  const custom=normalized.match(/^מ[-־]?\s*(.+?)\s+עד\s+(.+)$/)??normalized.match(/^בין\s+(.+?)\s+ל[-־]\s*(.+)$/);
  if(custom){const from=resolveDateReference(custom[1],businessDate),to=resolveDateReference(custom[2],businessDate);if(!from||!to||from>to)return null;return{fromInclusive:from,toExclusive:nextDateExclusive(to),label:`${from}–${to}`,kind:"custom"};}

  const monthMatch=normalized.match(new RegExp(`^(?:ב|של\\s+|ב?חודש\\s+|לחודש\\s+)?(${monthEntries.map(([name])=>name).join("|")})(?:\\s+(\\d{2}|\\d{4}))?$`));
  if(monthMatch){const month=HEBREW_MONTHS[monthMatch[1] as keyof typeof HEBREW_MONTHS];const year=monthMatch[2]?expandYear(monthMatch[2]):month<=businessMonth?businessYear:businessYear-1;return monthPeriod(year,month);}
  return null;
}

export function reportPeriodFromContext(context:Record<string,unknown>|null):ReportPeriod|null {
  if(!context?.fromInclusive||!context?.toExclusive)return null;
  return{fromInclusive:String(context.fromInclusive),toExclusive:String(context.toExclusive),label:String(context.periodLabel||"התקופה הקודמת"),kind:(context.periodKind as ReportPeriod["kind"])||"custom"};
}

export function formatEmptyReport(period:ReportPeriod,employeeName?:string,projectName?:string):string {
  const scope=[employeeName,projectName].filter(Boolean).join(" בפרויקט ");
  return scope?`לא נמצאו דיווחי שעות ל${scope} ב${period.label}.`:`אין דיווחי שעות ל${period.label}.`;
}

function aggregate(rows:ReportRow[],key:"employee"|"project"):ReportBreakdown[]{
  const groups=new Map<string,{name:string;days:Set<string>;employees:Set<string>;regularHours:number;overtimeHours:number}>();
  for(const row of rows){const id=key==="employee"?row.employee_id:row.project_id;const name=key==="employee"?`${row.employee?.first_name??""} ${row.employee?.last_name??""}`.trim():row.project?.name??"פרויקט לא ידוע";const group=groups.get(id)??{name,days:new Set<string>(),employees:new Set<string>(),regularHours:0,overtimeHours:0};group.days.add(row.work_date);group.employees.add(row.employee_id);group.regularHours+=row.regular_hours;group.overtimeHours+=row.overtime_hours;groups.set(id,group);}
  return[...groups].map(([id,value])=>({id,name:value.name,employees:key==="project"?value.employees.size:undefined,days:value.days.size,regularHours:value.regularHours,overtimeHours:value.overtimeHours,hours:value.regularHours+value.overtimeHours})).sort((a,b)=>a.name.localeCompare(b.name,"he"));
}

export function buildReportResult(rows:ReportRow[],period:ReportPeriod):ReportResult {
  const regularHours=rows.reduce((sum,row)=>sum+row.regular_hours,0),overtimeHours=rows.reduce((sum,row)=>sum+row.overtime_hours,0);
  return{period,employees:new Set(rows.map(row=>row.employee_id)).size,projects:new Set(rows.map(row=>row.project_id)).size,workDays:new Set(rows.map(row=>row.work_date)).size,regularHours,overtimeHours,totalHours:regularHours+overtimeHours,byEmployee:aggregate(rows,"employee"),byProject:aggregate(rows,"project"),rows};
}

function bullets(rows:ReportBreakdown[],withDays=false):string{return rows.map(row=>`• ${row.name} — ${withDays?`${row.days} ימי עבודה — `:""}${row.hours} שעות`).join("\n");}

export function formatReportResult(result:ReportResult,args:{type:"COMPANY"|"WHO_WORKED"|"EMPLOYEE"|"PROJECT"|"EMPLOYEE_PROJECT";employeeName?:string;projectName?:string}):string {
  const overtime=result.overtimeHours>0?`\nשעות נוספות: ${result.overtimeHours}`:"";
  if(args.type==="WHO_WORKED")return`👷 עובדים שעבדו — ${result.period.label}\n\n${bullets(result.byEmployee,true)}\n\nסה״כ:\nעובדים: ${result.employees}\nכמות שעות עבודה: ${result.totalHours}`;
  if(args.type==="EMPLOYEE_PROJECT")return`👷 ${args.employeeName}\n📍 ${args.projectName}\n📅 ${result.period.label}\n\nימי עבודה: ${result.workDays}\nכמות שעות עבודה: ${result.totalHours}${overtime}`;
  if(args.type==="EMPLOYEE")return`👷 ${args.employeeName}\n📅 ${result.period.label}\n\nימי עבודה: ${result.workDays}\nכמות שעות עבודה: ${result.totalHours}${overtime}\n\nלפי פרויקט:\n${bullets(result.byProject)}`;
  if(args.type==="PROJECT")return`📍 ${args.projectName}\n📅 ${result.period.label}\n\nעובדים: ${result.employees}\nימי עבודה: ${result.workDays}\nכמות שעות עבודה: ${result.totalHours}${overtime}\n\nלפי עובד:\n${bullets(result.byEmployee)}`;
  return`📊 דוח שעות — ${result.period.label}\n\nעובדים: ${result.employees}\nפרויקטים: ${result.projects}\nימי עבודה: ${result.workDays}\nכמות שעות עבודה: ${result.totalHours}${overtime}\n\nפירוט לפי עובד:\n${bullets(result.byEmployee)}\n\nפירוט לפי פרויקט:\n${bullets(result.byProject)}`;
}

export function formatExcelTelegramSummary(result:ReportResult):string{return`📊 דוח שעות — ${result.period.label}\n\nעובדים: ${result.employees}\nפרויקטים: ${result.projects}\nכמות שעות עבודה: ${result.totalHours}\n\nמצורף דוח Excel מפורט.`;}
