const monthNames: Record<string, number> = { ינואר:1, פברואר:2, מרץ:3, אפריל:4, מאי:5, יוני:6, יולי:7, אוגוסט:8, ספטמבר:9, אוקטובר:10, נובמבר:11, דצמבר:12 };

export function getBusinessDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Jerusalem", year:"numeric", month:"2-digit", day:"2-digit" }).format(now);
}

function iso(y:number,m:number,d:number): string | null { const date=new Date(Date.UTC(y,m-1,d));if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return null;return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }

export function resolveDateReference(reference:string, businessDate:string): string | null {
  const ref=reference.trim().replace(/^ב[-־]?/,"");const [year,month,day]=businessDate.split("-").map(Number);
  if(ref==="היום")return businessDate;
  if(ref==="אתמול"){const d=new Date(Date.UTC(year,month-1,day));d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
  const numeric=ref.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);if(numeric){let y=numeric[3]?Number(numeric[3]):year;if(y<100)y+=2000;let result=iso(y,Number(numeric[2]),Number(numeric[1]));if(!numeric[3]&&result){const candidate=new Date(`${result}T00:00:00Z`),current=new Date(`${businessDate}T00:00:00Z`);if(candidate.getTime()-current.getTime()>31*86_400_000)result=iso(y-1,Number(numeric[2]),Number(numeric[1]));}return result;}
  const monthEntry=Object.entries(monthNames).find(([name])=>ref.includes(name));if(monthEntry){const [,m]=monthEntry;const specifiedYear=ref.match(/(20\d{2})/)?.[1];return iso(Number(specifiedYear||year),m,1);}
  if(ref==="החודש")return `${businessDate.slice(0,7)}-01`;
  return null;
}

export function monthRange(reference:string,businessDate:string): [string,string] | null {const first=resolveDateReference(reference,businessDate);if(!first)return null;const [y,m]=first.split("-").map(Number);const last=new Date(Date.UTC(y,m,0)).getUTCDate();return [`${y}-${String(m).padStart(2,"0")}-01`,`${y}-${String(m).padStart(2,"0")}-${last}`];}
export function formatBusinessDate(value:string){const [y,m,d]=value.split("-");return `${d}/${m}/${y}`;}
