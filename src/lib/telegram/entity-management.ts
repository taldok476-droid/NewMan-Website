import type { ParsedIntent } from "./ai/schema";
import { normalizeHebrew, resolveEntity, type NamedEntity } from "./resolution";

export type EntityCreationKind="employee"|"project";

function result(kind:EntityCreationKind,name:string|null,phone:string|null=null):ParsedIntent{
  return{intent:kind==="employee"?"CREATE_EMPLOYEE":"CREATE_PROJECT",create_groups:[],entity_creation:{name,phone},report:null,missing_information:name?[]:["name"]};
}

function cleanExplicitName(value:string){return value.replace(/\s+(?:תוסיף|תוסיפו)\s+(?:אותו|אותה)$/ ,"").trim();}

/** Conservative, high-confidence parser; unusual phrasing remains for the AI fallback. */
export function parseEntityCreationIntent(message:string):ParsedIntent|null{
  let text=message.trim().replace(/[.!?]+$/g,"").replace(/\s+/g," ");
  const phone=text.match(/\s+טלפון\s+([+\d][\d-]{7,15})$/);
  if(phone)text=text.slice(0,phone.index).trim();
  const verb=String.raw`(?:להוסיף|נוסיף|תוסיף|תיצור|תקים|תפתח|לפתוח|תרשום|תכניס)`;
  const employeeCommand=text.match(new RegExp(`^(?:(?:אני רוצה|בוא)\\s+)?${verb}(?:\\s+לי)?(?:\\s+למערכת)?\\s+(?:את\\s+)?עובד(?:\\s+חדש)?(?:\\s+(?:בשם|שנקרא)\\s+(.+)|\\s+(.+))?$`));
  if(employeeCommand){const name=cleanExplicitName(employeeCommand[1]??employeeCommand[2]??"");return result("employee",name||null,phone?.[1]??null);}
  const employeeList=text.match(new RegExp(`^(?:(?:אני רוצה|בוא)\\s+)?${verb}\\s+(?:את\\s+)?(.+?)\\s+לעובדים$`))??text.match(/^יש (?:לי )?עובד חדש(?: בשם)?\s+(.+)$/)??text.match(/^עובד חדש(?: בשם)?(?:\s+(.+))?$/);
  if(employeeList){const name=cleanExplicitName(employeeList[1]??"");return result("employee",name||null,phone?.[1]??null);}
  const projectCommand=text.match(new RegExp(`^(?:(?:אני רוצה|בוא)\\s+)?${verb}(?:\\s+לי)?(?:\\s+למערכת)?\\s+(?:את\\s+)?פרויקט(?:\\s+חדש)?(?:\\s+(?:בשם|שנקרא)\\s+(.+)|\\s+(.+))?$`));
  if(projectCommand){const name=cleanExplicitName(projectCommand[1]??projectCommand[2]??"");return result("project",name||null);}
  const projectList=text.match(new RegExp(`^(?:(?:אני רוצה|בוא)\\s+)?${verb}\\s+(?:את\\s+)?(.+?)\\s+לפרויקטים$`))??text.match(/^יש לנו פרויקט חדש(?: בשם)?\s+(.+)$/)??text.match(/^פרויקט חדש(?: בשם)?(?:\s+(.+))?$/);
  if(projectList){const name=cleanExplicitName(projectList[1]??"");return result("project",name||null);}
  return null;
}

export function creationFromFollowUp(kind:EntityCreationKind,message:string):ParsedIntent{return result(kind,message.trim()||null);}
export function isCreationCancellation(message:string){return /^(?:ביטול|בטל|עזוב|לא משנה)[.!]?$/i.test(message.trim());}

export function assessCreationDuplicate(name:string,entities:NamedEntity[]){
  const exact=entities.find(entity=>normalizeHebrew(entity.name)===normalizeHebrew(name));
  if(exact)return{kind:"exact" as const,entity:exact};
  const similar=resolveEntity(name,entities);
  return similar.kind==="resolved"?{kind:"similar" as const,entity:similar.entity}:similar.kind==="ambiguous"?{kind:"similar" as const,entity:similar.options[0]}:{kind:"none" as const};
}

export function splitEmployeeName(name:string){const parts=name.trim().split(/\s+/);return{firstName:parts.shift()||"",lastName:parts.join(" ")};}

export function formatCreationDraft(kind:EntityCreationKind,name:string,phone:string|null,similar?:string){
  const title=kind==="employee"?"👤 עובד חדש":"📍 פרויקט חדש",question=kind==="employee"?"האם ליצור את העובד?":"האם ליצור את הפרויקט?",details=phone?`\nטלפון: ${phone}`:"";
  const warning=similar?`מצאתי ${kind==="employee"?"עובד עם שם דומה":"פרויקט עם שם דומה"}:\n${similar}\n\nהאם בכל זאת ליצור את ${name}?`:`${question}`;
  return`${title}\n\nשם: ${name}${details}\n\n${warning}`;
}
