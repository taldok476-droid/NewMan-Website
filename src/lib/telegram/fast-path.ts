import type { ParsedIntent } from "./ai/schema";
import { DEFAULT_WORK_DAY_HOURS } from "../business-rules";
import { extractDateExpression } from "./dates";
import { resolveReportPeriod } from "./reports";
import { resolveEntity, type NamedEntity } from "./resolution";

const dateExpression = String.raw`(?:היום|אתמול|ב(?:-|\s)?\d{1,2}\s*לחודש|ביום\s+\d{1,2}\s*לחודש|בתאריך\s+\d{1,2}\s*לחודש|בראשון\s*לחודש|ב(?:-|\s)?\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)`;
const number = String.raw`(\d+(?:\.\d+)?)`;
const patterns = [
  new RegExp(`^(${dateExpression})\\s+(.+?)\\s+עבד(?:ה)?\\s+אצל\\s+(.+?)\\s+${number}\\s+שעות$`),
  new RegExp(`^(${dateExpression})\\s+(.+?)\\s+עבד(?:ה)?\\s+${number}\\s+שעות\\s+אצל\\s+(.+?)$`),
  new RegExp(`^(${dateExpression})\\s+(.+?)\\s+עבד(?:ה)?\\s+ב([^\\s].*?)\\s+${number}\\s+שעות$`),
  new RegExp(`^(${dateExpression})\\s+(.+?)\\s+(?:עבד(?:ה)?|עובד(?:ת)?|היה|הייתה)\\s+עם\\s+(.+?)\\s+${number}\\s+שעות$`),
];

export function parseSimpleTimeEntry(message: string): ParsedIntent | null {
  const normalized = message.trim().replace(/\s+/g, " ");
  for (let index = 0; index < patterns.length; index += 1) {
    const match = normalized.match(patterns[index]);
    if (!match) continue;
    const [date, employee, third, fourth] = match.slice(1);
    const hoursFirst = index === 1;
    const hours = Number(hoursFirst ? third : fourth);
    const project = hoursFirst ? fourth : third;
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return null;
    if (/\sו\S|,|;|\bעבדו\b/.test(employee) || /\sו?ב(?:פרויקט|שוהם|אצל)\b/.test(project)) return null;
    return {
      intent: "CREATE_TIME_ENTRIES",
      create_groups: [{
        date_reference: date,
        project_reference: project,
        entries: [{ employee_reference: employee, regular_hours: hours, overtime_hours: null, notes: null }],
      }],
      report: null,
      entity_creation: null,
      missing_information: [],
    };
  }
  const extracted = extractDateExpression(normalized);
  if (!extracted) return null;
  const withoutDate = `${normalized.slice(0, extracted.start)} ${normalized.slice(extracted.end)}`.replace(/\s+/g, " ").trim();
  const anywherePatterns = [
    /^(.+?)\s+עבד(?:ה)?\s+אצל\s+(.+?)\s+(\d+(?:\.\d+)?)\s+שעות$/,
    /^(.+?)\s+עבד(?:ה)?\s+(\d+(?:\.\d+)?)\s+שעות\s+אצל\s+(.+?)$/,
    /^(.+?)\s+עבד(?:ה)?\s+ב([^\s].*?)\s+(\d+(?:\.\d+)?)\s+שעות$/,
    /^(.+?)\s+עבד(?:ה)?\s+(\d+(?:\.\d+)?)\s+שעות\s+ב([^\s].*?)$/,
    /^(.+?)\s+(?:עבד(?:ה)?|עובד(?:ת)?|היה|הייתה)\s+עם\s+(.+?)\s+(\d+(?:\.\d+)?)\s+שעות$/,
  ];
  for (let index = 0; index < anywherePatterns.length; index += 1) {
    const match = withoutDate.match(anywherePatterns[index]);
    if (!match) continue;
    const employee = match[1];
    const hoursFirst = index === 1 || index === 3;
    const hours = Number(hoursFirst ? match[2] : match[3]);
    const project = hoursFirst ? match[3] : match[2];
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return null;
    if (/\sו\S|,|;|\bעבדו\b/.test(employee) || /\sו?ב(?:פרויקט|שוהם|אצל)\b/.test(project)) return null;
    return {
      intent: "CREATE_TIME_ENTRIES",
      create_groups: [{
        date_reference: extracted.expression,
        project_reference: project,
        entries: [{ employee_reference: employee, regular_hours: hours, overtime_hours: null, notes: null }],
      }],
      report: null,
      entity_creation: null,
      missing_information: [],
    };
  }
  const omittedHours = withoutDate.match(/^(.+?)\s+(עבד(?:ה)?|עבדו)\s+אצל\s+(.+)$/);
  if (omittedHours) {
    const employees = omittedHours[1].split(/\s+ו(?=\S)/).map(value => value.trim()).filter(Boolean);
    const project = omittedHours[3].trim();
    if (employees.length && !/[,:;]|\b(?:כמה|מי|דוח)\b/.test(omittedHours[1]) && !/\b(?:עבד|עבדו|שעות)\b/.test(project)) {
      return {
        intent: "CREATE_TIME_ENTRIES",
        create_groups: [{
          date_reference: extracted.expression,
          project_reference: project,
          entries: employees.map(employee_reference => ({ employee_reference, regular_hours: DEFAULT_WORK_DAY_HOURS, overtime_hours: 0, notes: null })),
        }],
        report: null,
        entity_creation: null,
        missing_information: [],
      };
    }
  }
  return null;
}

function parseProjectHeader(line:string,allowBarePrefixedHeader=false):{date:string|null;project:string}|null{
  const extracted=extractDateExpression(line);
  const withoutDate=extracted?`${line.slice(0,extracted.start)} ${line.slice(extracted.end)}`:line;
  const hasTrailingPunctuation=/[:：׃]\s*$/.test(withoutDate);
  const text=withoutDate.replace(/\s*[:：׃]\s*$/," ").replace(/\s+/g," ").trim();
  const explicit=text.match(/^(?:עובדים|עבדו)\s+(?:אצל\s+|ב\s*)(.+)$/)??text.match(/^פרויקט\s+(.+)$/);
  const continued=text.match(/^וב\s*(.+)$/)??((hasTrailingPunctuation||allowBarePrefixedHeader)?text.match(/^ב\s*(.+)$/):null);
  const match=explicit??continued;
  if(!match||!match[1].trim()||/\d+(?:\.\d+)?\s*(?:שעות)?$/.test(match[1]))return null;
  return{date:extracted?.expression??null,project:match[1].trim()};
}

function parseAttendanceEmployee(line:string):ParsedIntent["create_groups"][number]["entries"][number]|null{
  const separated=line.match(/^(.+?)\s*(?:-|:|־)\s*(\d+(?:\.\d+)?)\s*(?:שעות)?$/);
  const spaced=line.match(/^(.+?)\s+(\d+(?:\.\d+)?)(?:\s+שעות)?$/);
  const match=separated??spaced;
  const employee=(match?.[1]??line).trim();
  if(!employee||/\d/.test(employee)||/^(?:מי|כמה|תן|דוח|עובדים|פרויקט)\b/.test(employee))return null;
  const hours=match?Number(match[2]):DEFAULT_WORK_DAY_HOURS;
  if(!Number.isFinite(hours)||hours<=0||hours>24)return null;
  return{employee_reference:employee,regular_hours:hours,overtime_hours:match?null:0,notes:null};
}

/** Fast path for a dated project header followed by employee lines and optional project sections. */
export function parseAttendanceList(message:string):ParsedIntent|null{
  const lines=message.split(/\r?\n/).map(line=>line.trim());
  const firstIndex=lines.findIndex(Boolean);
  if(firstIndex<0)return null;
  const first=parseProjectHeader(lines[firstIndex]);
  if(!first?.date)return null;
  const groups:ParsedIntent["create_groups"]=[];
  let activeDate=first.date;
  let current:ParsedIntent["create_groups"][number]={date_reference:activeDate,project_reference:first.project,entries:[]};
  groups.push(current);
  let precededByBlank=false;
  for(const line of lines.slice(firstIndex+1)){
    if(!line){precededByBlank=true;continue;}
    const header=parseProjectHeader(line,precededByBlank);
    if(header&&current.entries.length){
      if(header.date)activeDate=header.date;
      current={date_reference:activeDate,project_reference:header.project,entries:[]};
      groups.push(current);
      precededByBlank=false;
      continue;
    }
    const entry=parseAttendanceEmployee(line);
    if(!entry)return null;
    current.entries.push(entry);
    precededByBlank=false;
  }
  if(groups.some(group=>!group.entries.length))return null;
  return{intent:"CREATE_TIME_ENTRIES",create_groups:groups,entity_creation:null,report:null,missing_information:[]};
}

/** Applies the business default only to already-classified create proposals. */
export function applyDefaultWorkdayHours(parsed:ParsedIntent):ParsedIntent{
  if(parsed.intent!=="CREATE_TIME_ENTRIES")return parsed;
  return{...parsed,missing_information:parsed.missing_information.filter(item=>item!=="hours"),create_groups:parsed.create_groups.map(group=>({...group,entries:group.entries.map(entry=>entry.regular_hours===null?{...entry,regular_hours:DEFAULT_WORK_DAY_HOURS,overtime_hours:entry.overtime_hours??0}:entry)}))};
}

function parseMultilineGroup(line:string,dateReference:string):ParsedIntent["create_groups"][number]|null{
  const extracted=extractDateExpression(line);
  const withoutDate=extracted?`${line.slice(0,extracted.start)} ${line.slice(extracted.end)}`.replace(/\s+/g," ").trim():line.trim().replace(/\s+/g," ");
  const relation=withoutDate.match(/^(.+?)\s+(?:(?:עבד(?:ה)?|עובד(?:ת)?|היה|הייתה)\s+)?(?:אצל|עם)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+שעות$/);
  const prefixedProject=withoutDate.match(/^(.+?)\s+(?:(?:עבד(?:ה)?|עובד(?:ת)?|היה|הייתה)\s+)?ב([^\s].*?)\s+(\d+(?:\.\d+)?)\s+שעות$/);
  const match=relation??prefixedProject;
  if(!match)return null;
  const hours=Number(match[3]);
  if(!Number.isFinite(hours)||hours<=0||hours>24)return null;
  return{date_reference:extracted?.expression??dateReference,project_reference:match[2],entries:[{employee_reference:match[1],regular_hours:hours,overtime_hours:null,notes:null}]};
}

/** Deterministic path for clear newline-separated single-employee work groups. */
export function parseMultilineTimeEntries(message:string):ParsedIntent|null{
  const lines=message.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  if(lines.length<2)return null;
  const groups:ParsedIntent["create_groups"]=[];
  let activeDate="";
  for(const line of lines){
    const explicitDate=extractDateExpression(line)?.expression;
    if(explicitDate)activeDate=explicitDate;
    if(!activeDate)return null;
    const group=parseMultilineGroup(line,activeDate);
    if(!group)return null;
    groups.push(group);
  }
  return{intent:"CREATE_TIME_ENTRIES",create_groups:groups,entity_creation:null,report:null,missing_information:[]};
}

export type ReadOnlyIntent="PROJECTS_LIST"|"EMPLOYEES_LIST"|"TODAY_STATUS";
export function recognizeReadOnlyIntent(message:string):ReadOnlyIntent|null{const text=message.normalize("NFKD").replace(/[?!.,״׳'"-]/g," ").replace(/\s+/g," ").trim();if(/פרויקט/.test(text)&&/(איזה|אילו|מה|תראה|הצג|פתוח|פעיל)/.test(text))return"PROJECTS_LIST";if(/עובד/.test(text)&&/(איזה|אילו|מי|תראה|הצג|רשימ)/.test(text))return"EMPLOYEES_LIST";if(/היום/.test(text)&&/(מי עבד|מה דווח|דיווח|עבד היום)/.test(text))return"TODAY_STATUS";return null;}

const reportPeriod = String.raw`(?:ב?חודש\s+)?(?:ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)(?:\s+\d{2,4})?|החודש(?:\s+הזה|\s+שעבר)?|חודש\s+(?:נוכחי|שעבר)|השבוע(?:\s+הזה)?|היום|אתמול|מתחילת\s+(?:החודש|השבוע)`;
export function parseSimpleReportQuery(message:string):ParsedIntent|null{
  const text=message.trim().replace(/[?؟!]$/g,"").replace(/\s+/g," ");
  const who=text.match(new RegExp(`^מי עבד (?:ב)?(${reportPeriod})$`));
  const all=text.match(new RegExp(`^(?:תן לי )?דוח(?: שעות)? (?:של )?כל העובדים (?:ב)?(${reportPeriod})$`));
  const company=text.match(new RegExp(`^כמה שעות (?:עשינו|היו) (?:ב)?(${reportPeriod})$`))??text.match(new RegExp(`^(?:(?:תן|תכין|תוציא) לי )?(?:דוח(?: אקסל)?(?: שעות)?|אקסל)(?: של| ל)? (?:ב)?(${reportPeriod})$`));
  const match=who??all??company;
  if(!match)return null;
  const output_format=/(?:אקסל|קובץ|תכין|תוציא)/.test(text)?"EXCEL":"TEXT";
  return{intent:"REPORT_QUERY",create_groups:[],entity_creation:null,report:{report_type:who?"WHO_WORKED":"COMPANY",output_format,employee_reference:null,project_reference:null,date_reference:match[1],date_from_reference:null,date_to_reference:null},missing_information:[]};
}

function splitReportSubjectAndPeriod(value:string,businessDate:string):{subject:string;period:string}|null{const words=value.trim().split(/\s+/);for(let index=1;index<words.length;index+=1){const period=words.slice(index).join(" ");if(resolveReportPeriod(period,businessDate))return{subject:words.slice(0,index).join(" "),period};}return null;}
function reportIntent(type:NonNullable<ParsedIntent["report"]>["report_type"],format:"TEXT"|"EXCEL",period:string,employee:string|null,project:string|null):ParsedIntent{return{intent:"REPORT_QUERY",create_groups:[],entity_creation:null,report:{report_type:type,output_format:format,employee_reference:employee,project_reference:project,date_reference:period,date_from_reference:null,date_to_reference:null},missing_information:[]};}
export function parseEntityReportQuery(message:string,businessDate:string,employees:NamedEntity[],projects:NamedEntity[]):ParsedIntent|null{
  const text=message.trim().replace(/[?؟!]$/g,"").replace(/\s+/g," "),format=/(?:אקסל|קובץ|תכין|תוציא)/.test(text)?"EXCEL":"TEXT";
  const employeeRequest=text.match(/^כמה שעות עבד (.+)$/);
  if(employeeRequest){const split=splitReportSubjectAndPeriod(employeeRequest[1],businessDate);if(split){const employee=resolveEntity(split.subject,employees);if(employee.kind==="resolved")return reportIntent("EMPLOYEE",format,split.period,split.subject,null);}}
  const projectRequest=text.match(/^כמה שעות היו ב(.+)$/);
  if(projectRequest){const split=splitReportSubjectAndPeriod(projectRequest[1],businessDate);if(split){const project=resolveEntity(split.subject,projects);if(project.kind==="resolved")return reportIntent("PROJECT",format,split.period,null,split.subject);}}
  const generated=text.match(/^(?:(?:תן|תכין|תוציא) לי )?(?:דוח(?: אקסל)?(?: שעות)?|אקסל) של (.+)$/);
  if(!generated)return null;const split=splitReportSubjectAndPeriod(generated[1],businessDate);if(!split)return null;
  const combined=split.subject.match(/^(.+?)\s+ב(.+)$/);if(combined){const employee=resolveEntity(combined[1],employees),project=resolveEntity(combined[2],projects);if(employee.kind==="resolved"&&project.kind==="resolved")return reportIntent("EMPLOYEE_PROJECT",format,split.period,combined[1],combined[2]);}
  const employee=resolveEntity(split.subject,employees),project=resolveEntity(split.subject,projects);
  if(employee.kind==="resolved"&&project.kind==="not_found")return reportIntent("EMPLOYEE",format,split.period,split.subject,null);
  if(project.kind==="resolved"&&employee.kind==="not_found")return reportIntent("PROJECT",format,split.period,null,split.subject);
  return null;
}
