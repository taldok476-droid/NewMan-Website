import {describe,expect,it} from "vitest";
import {parseAttendanceList,parseSimpleTimeEntry,recognizeReadOnlyIntent} from "../fast-path";
import {resolveEntity} from "../resolution";
import {buildClarificationState,selectClarification} from "../clarification";

describe("Telegram deterministic fast path",()=>{
  it.each([
    ["היום מואיד עבד אצל טל 8 שעות","היום","מואיד","טל",8],
    ["היום יוסף עבד 8 שעות אצל טל","היום","יוסף","טל",8],
    ["ב21 לחודש מואיד עבד אצל טל 8 שעות","ב21 לחודש","מואיד","טל",8],
    ["אתמול קייס עבד בשוהם 9 שעות","אתמול","קייס","שוהם",9],
  ])("parses %s without AI",(message,date,employee,project,hours)=>{const parsed=parseSimpleTimeEntry(message);expect(parsed?.intent).toBe("CREATE_TIME_ENTRIES");expect(parsed?.create_groups[0]).toMatchObject({date_reference:date,project_reference:project,entries:[{employee_reference:employee,regular_hours:hours}]});});
  it("falls back to AI for a complex multi-project message",()=>expect(parseSimpleTimeEntry("היום אצל טל מואיד ויוסף עבדו 8 שעות וקייס 10 שעות ובשוהם ארנון עבד 7.5 שעות")).toBeNull());
  it("falls back to AI for natural report queries",()=>expect(parseSimpleTimeEntry("כמה שעות עבד מואיד אצל טל בספטמבר?")).toBeNull());
  it("falls back to AI for conversational follow-ups",()=>expect(parseSimpleTimeEntry("ואצל טל?")).toBeNull());
  it("parses a creation sentence without explicit hours using the business default",()=>expect(parseSimpleTimeEntry("היום מואיד עבד אצל טל")?.create_groups[0].entries[0]).toMatchObject({regular_hours:8,overtime_hours:0}));
  it("does not parse multiple employees as a single employee",()=>expect(parseSimpleTimeEntry("היום מואיד ויוסף עבד אצל טל 8 שעות")).toBeNull());
  it("keeps unknown employee resolution safe",()=>{const parsed=parseSimpleTimeEntry("היום אלמוני עבד אצל טל 8 שעות")!;expect(resolveEntity(parsed.create_groups[0].entries[0].employee_reference,[{id:"1",name:"מואיד"}]).kind).toBe("not_found");});
  it("keeps unknown project resolution safe",()=>{const parsed=parseSimpleTimeEntry("היום מואיד עבד אצל פרויקטלאקיים 8 שעות")!;expect(resolveEntity(parsed.create_groups[0].project_reference,[{id:"1",name:"עובדי רג״י טל"}]).kind).toBe("not_found");});
  it("only creates a structured proposal and never a database write",()=>{const parsed=parseSimpleTimeEntry("היום מואיד עבד אצל טל 8 שעות")!;expect(parsed).not.toHaveProperty("id");expect(parsed).not.toHaveProperty("status","confirmed");});
  it.each([
    ["היי איזה פרויקטים פתוחים יש לי?","PROJECTS_LIST"],
    ["איזה פרויקטים יש לי?","PROJECTS_LIST"],
    ["תראה לי פרויקטים פעילים","PROJECTS_LIST"],
    ["מה הפרויקטים הפתוחים?","PROJECTS_LIST"],
    ["תראה לי את העובדים","EMPLOYEES_LIST"],
    ["איזה עובדים יש לי?","EMPLOYEES_LIST"],
    ["מי עבד היום?","TODAY_STATUS"],
    ["מה דווח היום?","TODAY_STATUS"],
  ])("recognizes conversational read-only question %s",(message,intent)=>expect(recognizeReadOnlyIntent(message)).toBe(intent));
  it("falls back to AI for unusual uncertain wording",()=>expect(recognizeReadOnlyIntent("אפשר לעזור לי להבין מה קורה באתר?")).toBeNull());
});

const productionAttendance=`היום עבדו אצל טל:
יוסף
מואיד
קיס
ורד

ובאחזקה:
עאיש

ובקבלנות:
איהאב
קרם

ובמשמיע:
חוסאם
עבד
בהאא

ובשוהם:
שריף
חוסין
מועתז
מוחמד
אנס
עלאא
יוסף`;

describe("official Telegram daily schedule",()=>{
  const expectedProjects=["טל","אחזקה","קבלנות","משמיע","שוהם"];
  it("parses every employee in the exact production message",()=>{const parsed=parseAttendanceList(productionAttendance)!;expect(parsed.create_groups.map(group=>group.project_reference)).toEqual(expectedProjects);expect(parsed.create_groups.every(group=>group.date_reference==="היום")).toBe(true);expect(parsed.create_groups.flatMap(group=>group.entries)).toHaveLength(17);expect(parsed.create_groups.flatMap(group=>group.entries).reduce((sum,entry)=>sum+(entry.regular_hours??0),0)).toBe(136);expect(parsed.create_groups[3].entries.map(entry=>entry.employee_reference)).toEqual(["חוסאם","עבד","בהאא"]);});
  it("produces an actor-independent proposal before authorization",()=>{const proposals=["MANAGER","SCHEDULER"].map(()=>parseAttendanceList(productionAttendance));expect(proposals[0]).toEqual(proposals[1]);});
  it("handles CRLF, trailing spaces, and multiple blank lines",()=>{const variant=productionAttendance.replace(/\n/g,"  \r\n").replace(/\r\n\r\n/g,"\r\n\r\n\r\n");expect(parseAttendanceList(variant)?.create_groups.map(group=>group.project_reference)).toEqual(expectedProjects);});
  it("handles the same continuation headers without blank lines",()=>expect(parseAttendanceList(productionAttendance.replace(/\n\n/g,"\n"))?.create_groups).toHaveLength(5));
  it.each(["היום עובדים אצל טל","היום עובדים אצל טל:","היום עבדו אצל טל","היום עבדו אצל טל:","היום עובדים בטל","היום עובדים בטל:","היום עבדו בטל","היום עבדו בטל:","היום עבדו אצל טל ׃","היום עבדו אצל טל："]) ("accepts first header %s",header=>expect(parseAttendanceList(`${header}\nיוסף`)?.create_groups[0].project_reference).toBe("טל"));
  it.each(["ובשוהם:","ובשוהם","בשוהם:"]) ("strips prefixes and punctuation from continuation %s",header=>expect(parseAttendanceList(`היום עבדו אצל טל:\nיוסף\n${header}\nמואיד`)?.create_groups[1].project_reference).toBe("שוהם"));
  it("supports a bare continuation after a blank boundary",()=>expect(parseAttendanceList("היום עבדו אצל טל\nיוסף\n\nבשוהם\nמואיד")?.create_groups[1].project_reference).toBe("שוהם"));
  it("does not mistake the employee בהאא for a project header",()=>expect(parseAttendanceList("היום עבדו אצל טל\nעבד\nבהאא")?.create_groups[0].entries.map(entry=>entry.employee_reference)).toEqual(["עבד","בהאא"]));
  it("applies an explicit override only to its own employee",()=>expect(parseAttendanceList("היום עבדו אצל טל\nשריף\nחוסין 10\nמועתז")?.create_groups[0].entries.map(entry=>entry.regular_hours)).toEqual([8,10,8]));
  it("accepts headers without colons",()=>expect(parseAttendanceList(productionAttendance.replaceAll(":",""))?.create_groups.map(group=>group.project_reference)).toEqual(expectedProjects));
});

describe("forgiving conservative Hebrew entity resolution",()=>{
  const single=[{id:"p1",name:"לשם - שוהם"}];
  it.each(["שוהם","בשוהם","לשם","בלשם","ובלשם","לשם שוהם","לשם - שוהם"])("matches project alias %s",reference=>expect(resolveEntity(reference,single)).toMatchObject({kind:"resolved",entity:{id:"p1"}}));
  it("normalizes punctuation and repeated whitespace",()=>expect(resolveEntity("  לשם—  שוהם ",single).kind).toBe("resolved"));
  it("accepts one clear small typo",()=>expect(resolveEntity("לשפ",single).kind).toBe("resolved"));
  it("rejects typo below confidence threshold",()=>expect(resolveEntity("חיפה",single).kind).toBe("not_found"));
  it("keeps two projects containing שוהם ambiguous",()=>expect(resolveEntity("שוהם",[...single,{id:"p2",name:"שוהם עבודות גמר"}]).kind).toBe("ambiguous"));
  it("keeps two employees named יוסף ambiguous",()=>expect(resolveEntity("יוסף",[{id:"e1",name:"יוסף נחאש"},{id:"e2",name:"יוסף כהן"}]).kind).toBe("ambiguous"));
});

describe("clarification continuity",()=>{
  it("preserves the parsed pending action and adds only the selected real entity",()=>{const parsed=parseSimpleTimeEntry("היום יוסף עבד אצל שוהם 8 שעות")!;const id="11111111-1111-1111-1111-111111111111",options=[{id:"p1",name:"לשם - שוהם"},{id:"p2",name:"שוהם עבודות גמר"}],state=buildClarificationState({clarificationId:id,telegramUserId:7,parsed,forced:[],kind:"project",reference:"שוהם",options}),selection=selectClarification(state,id,1,7);expect(selection?.parsed).toEqual(parsed);expect(selection?.forced).toEqual([{kind:"project",reference:"שוהם",entity:options[1]}]);expect(selection?.parsed).not.toHaveProperty("status","confirmed");});
  it("rejects a clarification selection from another Telegram user",()=>{const state=buildClarificationState({clarificationId:"11111111-1111-1111-1111-111111111111",telegramUserId:7,parsed:{},forced:[],kind:"project",reference:"שוהם",options:[{id:"p1",name:"לשם - שוהם"}]});expect(selectClarification(state,state.clarificationId,0,8)).toBeNull();});
});
