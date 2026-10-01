import type { ParsedIntent } from "./ai/schema";
import { normalizeHebrew, resolveEntity, type NamedEntity } from "./resolution";

export type EntityCreationKind="employee"|"project";

function result(kind:EntityCreationKind,name:string|null,phone:string|null=null):ParsedIntent{
  return{intent:kind==="employee"?"CREATE_EMPLOYEE":"CREATE_PROJECT",create_groups:[],entity_creation:{name,phone},report:null,missing_information:name?[]:["name"]};
}

function cleanName(value:string,kind:EntityCreationKind){
  const noun=kind==="employee"?"עובד":"פרויקט";
  return value.replace(/^את\s+/,"").replace(new RegExp(`^${noun}\\s*`),"").replace(/^חדש\s+/,"").replace(/^בשם\s+/,"").replace(/\s+(?:תוסיף|תוסיפו)\s+(?:אותו|אותה)$/ ,"").trim();
}

/** Conservative, high-confidence parser; unusual phrasing remains for the AI fallback. */
export function parseEntityCreationIntent(message:string):ParsedIntent|null{
  let text=message.trim().replace(/[.!?]+$/g,"").replace(/\s+/g," ");
  const phone=text.match(/\s+טלפון\s+([+\d][\d-]{7,15})$/);
  if(phone)text=text.slice(0,phone.index).trim();
  const employee=text.match(/^(?:(?:אני רוצה|בוא)\s+)?(?:להוסיף|נוסיף|תוסיף|תיצור|תקים|תפתח|תרשום(?: לי)?|תכניס(?: למערכת)?)\s+(.+)$/)??text.match(/^עובד חדש\s+(.+)$/)??text.match(/^יש (?:לי )?עובד חדש(?: בשם)?\s+(.+)$/);
  if(employee&&(text.includes("עובד")||text.includes("לעובדים"))){
    const name=cleanName(employee[1].replace(/\s+לעובדים$/,"").trim(),"employee");
    return result("employee",name||null,phone?.[1]??null);
  }
  const project=text.match(/^(?:(?:אני רוצה|בוא)\s+)?(?:להוסיף|נוסיף|תוסיף|תיצור|תקים|תפתח|לפתוח|תרשום(?: לי)?|תכניס(?: למערכת)?)\s+(.+)$/)??text.match(/^פרויקט חדש\s+(.+)$/)??text.match(/^יש לנו פרויקט חדש(?: בשם)?\s+(.+)$/);
  if(project&&(text.includes("פרויקט")||text.includes("לפרויקטים"))){
    const name=cleanName(project[1].replace(/\s+לפרויקטים$/,"").trim(),"project");
    return result("project",name||null);
  }
  const missingEmployee=text.match(/^(?:תוסיף|תיצור|תקים|תפתח)\s+עובד(?: חדש)?$/);
  if(missingEmployee)return result("employee",null);
  const missingProject=text.match(/^(?:תוסיף|תיצור|תקים|תפתח)\s+פרויקט(?: חדש)?$/);
  return missingProject?result("project",null):null;
}

export function creationFromFollowUp(kind:EntityCreationKind,message:string):ParsedIntent{return result(kind,message.trim()||null);}

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
