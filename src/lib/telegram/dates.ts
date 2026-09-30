import { formatHebrewDate, getBusinessDate as sharedBusinessDate, monthRangeExclusive } from "../date-ranges";

const monthNames: Record<string, number> = { ינואר:1, פברואר:2, מרץ:3, אפריל:4, מאי:5, יוני:6, יולי:7, אוגוסט:8, ספטמבר:9, אוקטובר:10, נובמבר:11, דצמבר:12 };

export const getBusinessDate = sharedBusinessDate;

function iso(y:number,m:number,d:number): string | null { const date=new Date(Date.UTC(y,m-1,d));if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return null;return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }

export function resolveDateReference(reference:string, businessDate:string): string | null {
  const ref=reference.trim();const [year,month,day]=businessDate.split("-").map(Number);
  if(ref==="היום")return businessDate;
  if(ref==="אתמול"){const d=new Date(Date.UTC(year,month-1,day));d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
  const currentMonthDay=ref.match(/^(?:ב|ב-|ב |ביום |בתאריך )?(\d{1,2})\s*לחודש$/);if(currentMonthDay)return iso(year,month,Number(currentMonthDay[1]));
  if(/^(?:ב|ב-|ב |ביום |בתאריך )?ראשון\s*לחודש$/.test(ref))return iso(year,month,1);
  const unambiguousDay=ref.match(/^(?:ב-|ב |ביום |בתאריך )(\d{1,2})$/);if(unambiguousDay)return iso(year,month,Number(unambiguousDay[1]));
  const numeric=ref.match(/^(?:ב[-־ ]?)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);if(numeric){let y=numeric[3]?Number(numeric[3]):year;if(y<100)y+=2000;let result=iso(y,Number(numeric[2]),Number(numeric[1]));if(!numeric[3]&&result){const candidate=new Date(`${result}T00:00:00Z`),current=new Date(`${businessDate}T00:00:00Z`);if(candidate.getTime()-current.getTime()>31*86_400_000)result=iso(y-1,Number(numeric[2]),Number(numeric[1]));}return result;}
  const monthEntry=Object.entries(monthNames).find(([name])=>ref.includes(name));if(monthEntry){const [,m]=monthEntry;const specifiedYear=ref.match(/(20\d{2})/)?.[1];return iso(Number(specifiedYear||year),m,1);}
  if(ref==="החודש")return `${businessDate.slice(0,7)}-01`;
  return null;
}

export function monthRange(reference:string,businessDate:string): [string,string] | null {const first=resolveDateReference(reference,businessDate);if(!first)return null;const range=monthRangeExclusive(first.slice(0,7));const end=new Date(`${range.toExclusive}T00:00:00Z`);end.setUTCDate(end.getUTCDate()-1);return [range.from,end.toISOString().slice(0,10)];}
export const formatBusinessDate = formatHebrewDate;
