import {describe,expect,it} from "vitest";
import {parsedIntentSchema} from "../ai/schema";
import {draftAvailability,parseDraftCallback} from "../business";
import {assessCreationDuplicate,creationFromFollowUp,formatCreationDraft,isCreationCancellation,parseEntityCreationIntent,splitEmployeeName} from "../entity-management";
import {parseAttendanceList} from "../fast-path";

describe("deterministic Telegram entity-creation intent",()=>{
  it.each([
    ["תוסיף עובד אחמד","אחמד"],
    ["תיצור עובד אחמד","אחמד"],
    ["תקים עובד אחמד","אחמד"],
    ["תפתח עובד חדש בשם אחמד","אחמד"],
    ["תרשום לי עובד חדש אחמד","אחמד"],
    ["תכניס עובד אחמד","אחמד"],
    ["עובד חדש אחמד מחמוד","אחמד מחמוד"],
    ["אני רוצה להוסיף את אחמד לעובדים","אחמד"],
    ["יש עובד חדש בשם אחמד תוסיף אותו","אחמד"],
    ["בוא נוסיף את אחמד לעובדים","אחמד"],
  ])("parses employee request %s",(message,name)=>expect(parseEntityCreationIntent(message)).toMatchObject({intent:"CREATE_EMPLOYEE",entity_creation:{name}}));

  it("extracts an optional phone without requiring an employee number",()=>expect(parseEntityCreationIntent("תוסיף עובד אחמד מחמוד טלפון 0501234567")).toMatchObject({intent:"CREATE_EMPLOYEE",entity_creation:{name:"אחמד מחמוד",phone:"0501234567"}}));

  it.each([
    ["תוסיף פרויקט שוהם","שוהם"],
    ["תיצור פרויקט שוהם","שוהם"],
    ["תקים פרויקט חדש שוהם","שוהם"],
    ["תפתח פרויקט חדש בשם שוהם","שוהם"],
    ["תרשום פרויקט חדש שוהם","שוהם"],
    ["יש לנו פרויקט חדש שוהם","שוהם"],
    ["בוא נוסיף את שוהם לפרויקטים","שוהם"],
  ])("parses project request %s",(message,name)=>expect(parseEntityCreationIntent(message)).toMatchObject({intent:"CREATE_PROJECT",entity_creation:{name}}));

  it("keeps unusual wording for semantic AI fallback",()=>expect(parseEntityCreationIntent("יש לי בחור חדש אחמד שמתחיל לעבוד אצלנו תכניס אותו למערכת")).toBeNull());
  it("does not classify attendance as entity creation",()=>expect(parseEntityCreationIntent("היום אחמד עבד אצל טל")).toBeNull());
  it("does not classify reports as entity creation",()=>expect(parseEntityCreationIntent("כמה שעות עבד אחמד?")).toBeNull());
  it("continues employee and project missing-name follow-ups",()=>{
    expect(creationFromFollowUp("employee","אחמד מחמוד")).toMatchObject({intent:"CREATE_EMPLOYEE",entity_creation:{name:"אחמד מחמוד"}});
    expect(creationFromFollowUp("project","מגדלי ראשון")).toMatchObject({intent:"CREATE_PROJECT",entity_creation:{name:"מגדלי ראשון"}});
  });
  it.each(["תפתח לי פרויקט חדש","תקים לי פרויקט חדש","תיצור לי פרויקט חדש","תוסיף פרויקט","אני רוצה לפתוח פרויקט חדש"])("recognizes missing project name in %s",message=>expect(parseEntityCreationIntent(message)).toMatchObject({intent:"CREATE_PROJECT",entity_creation:{name:null}}));
  it.each([
    ["תפתח לי פרויקט חדש בשם בדיקה","בדיקה"],
    ["תקים פרויקט בשם לשם - שוהם","לשם - שוהם"],
    ["תוסיף פרויקט שנקרא מגדלי ראשון","מגדלי ראשון"],
    ["אני רוצה להוסיף פרויקט בשם עבודות נשר","עבודות נשר"],
  ])("extracts only the explicit project name from %s",(message,name)=>expect(parseEntityCreationIntent(message)?.entity_creation?.name).toBe(name));
  it.each(["תוסיף לי עובד חדש","תיצור לי עובד חדש"])("recognizes missing employee name in %s",message=>expect(parseEntityCreationIntent(message)).toMatchObject({intent:"CREATE_EMPLOYEE",entity_creation:{name:null}}));
  it("extracts an explicit employee name without command leakage",()=>expect(parseEntityCreationIntent("תוסיף לי עובד חדש בשם אחמד מחמוד")?.entity_creation?.name).toBe("אחמד מחמוד"));
  it.each(["ביטול","בטל","עזוב","לא משנה"])("recognizes follow-up cancellation %s",message=>expect(isCreationCancellation(message)).toBe(true));
});

describe("safe creation drafts and duplicate assessment",()=>{
  const employees=[{id:"e1",name:"אחמד מוחמד"},{id:"e2",name:"יוסף נחאש"}];
  it("blocks an exact normalized duplicate",()=>expect(assessCreationDuplicate("אחמד מוחמד",employees)).toMatchObject({kind:"exact",entity:{id:"e1"}}));
  it("warns about a safely resolved similar name",()=>expect(assessCreationDuplicate("אחמד מחמד",employees)).toMatchObject({kind:"similar",entity:{id:"e1"}}));
  it("allows a distinct name",()=>expect(assessCreationDuplicate("מואיד חטיב",employees).kind).toBe("none"));
  it("blocks an exact project duplicate after a name follow-up",()=>{const followUp=creationFromFollowUp("project","לשם - שוהם");expect(assessCreationDuplicate(followUp.entity_creation!.name!,[{id:"p1",name:"לשם - שוהם"}]).kind).toBe("exact");});
  it("warns about a similar project after a name follow-up",()=>{const followUp=creationFromFollowUp("project","מגדלי ראשון");expect(assessCreationDuplicate(followUp.entity_creation!.name!,[{id:"p1",name:"מגדלי ראשון שלב א"}]).kind).toBe("similar");});
  it("formats employee and project confirmation drafts",()=>{
    expect(formatCreationDraft("employee","אחמד מחמוד","0501234567")).toContain("האם ליצור את העובד?");
    expect(formatCreationDraft("project","מגדלי ראשון",null,"מגדלי ראשון - שלב א")).toContain("פרויקט עם שם דומה");
  });
  it("splits employee names without inventing an employee number",()=>expect(splitEmployeeName("אחמד מחמוד עלי")).toEqual({firstName:"אחמד",lastName:"מחמוד עלי"}));
  it("uses only opaque draft IDs in callbacks",()=>expect(parseDraftCallback("confirm:11111111-1111-1111-1111-111111111111")).toEqual({action:"confirm",draftId:"11111111-1111-1111-1111-111111111111"}));
  it("models cancel, expiry, and double-confirm safely",()=>{
    expect(draftAvailability("pending","2099-01-01T00:00:00Z")).toBe("available");
    expect(draftAvailability("cancelled","2099-01-01T00:00:00Z")).toBe("cancelled");
    expect(draftAvailability("confirmed","2099-01-01T00:00:00Z")).toBe("already_confirmed");
  });
  it("rejects AI attempts to smuggle mutation fields through strict output",()=>{
    expect(parsedIntentSchema.safeParse({intent:"CREATE_EMPLOYEE",create_groups:[],entity_creation:{name:"אחמד",phone:null,id:"trusted"},report:null,missing_information:[]}).success).toBe(false);
  });
  it("keeps unknown attendance structured as attendance, never creation",()=>expect(parseAttendanceList("היום עובדים אצל טל\nדוד")?.intent).toBe("CREATE_TIME_ENTRIES"));
});
