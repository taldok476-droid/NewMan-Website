import {beforeEach,describe,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({
  aiParse:vi.fn(),createEntityDraft:vi.fn(),createTelegramDraft:vi.fn(),findExisting:vi.fn(),queryReport:vi.fn(),getContext:vi.fn(),saveContext:vi.fn(),clearContext:vi.fn(),
}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:vi.fn()}));
vi.mock("../ai/openai",()=>({getIntentProvider:()=>({parse:mocks.aiParse})}));
vi.mock("../reference-cache",()=>({
  getCachedActiveEmployees:async()=>["יוסף","מואיד","קיס","ורד","עאיש","איהאב","קרם","חוסאם","עבד","בהאא","שריף","חוסין","מועתז","מוחמד","אנס","עלאא"].map((name,index)=>({id:`e${index+1}`,name})),
  getCachedActiveProjects:async()=>["טל","אחזקה","קבלנות","משמיע","שוהם"].map((name,index)=>({id:`p${index+1}`,name})),
}));
vi.mock("../data",()=>({
  clearConversationContext:mocks.clearContext,
  createEntityDraft:mocks.createEntityDraft,
  createTelegramDraft:mocks.createTelegramDraft,findExistingEntries:mocks.findExisting,
  getConversationContext:mocks.getContext,saveConversationContext:mocks.saveContext,
  getTodayEntries:vi.fn(async()=>[]),queryReport:mocks.queryReport,
}));

import {handleNaturalMessage} from "../natural";
import type {TelegramActor} from "../auth";

const employeeIntent={intent:"CREATE_EMPLOYEE",create_groups:[],entity_creation:{name:"אחמד",phone:null},report:null,missing_information:[]};
const manager:TelegramActor={id:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",telegramUserId:2,displayName:"Manager",role:"MANAGER",legacy:false};
const scheduler:TelegramActor={id:"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",telegramUserId:3,displayName:"Scheduler",role:"SCHEDULER",legacy:false};

describe("two-stage Telegram intent routing",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.getContext.mockResolvedValue(null);mocks.findExisting.mockResolvedValue(new Map());mocks.queryReport.mockResolvedValue([]);mocks.createEntityDraft.mockResolvedValue({id:"11111111-1111-1111-1111-111111111111"});mocks.createTelegramDraft.mockResolvedValue({id:"22222222-2222-2222-2222-222222222222"});});

  it("does not call AI when the deterministic creation path succeeds",async()=>{
    const reply=await handleNaturalMessage(1,2,"תוסיף עובד אחמד",manager);
    expect(mocks.aiParse).not.toHaveBeenCalled();
    expect(mocks.createEntityDraft).toHaveBeenCalledOnce();
    expect(reply.text).toContain("האם ליצור את העובד?");
  });

  it("uses exactly one AI interpretation call for unusual wording",async()=>{
    mocks.aiParse.mockResolvedValue(employeeIntent);
    const reply=await handleNaturalMessage(1,2,"יש לי בחור חדש אחמד שמתחיל אצלנו תכניס אותו למערכת",manager);
    expect(mocks.aiParse).toHaveBeenCalledOnce();
    expect(mocks.createEntityDraft).toHaveBeenCalledOnce();
    expect(reply.inlineKeyboard?.[0][0].callback_data).toMatch(/^confirm:[0-9a-f-]{36}$/);
  });

  it("asks for clarification when AI cannot confidently classify",async()=>{
    mocks.aiParse.mockResolvedValue({intent:"UNKNOWN",create_groups:[],entity_creation:null,report:null,missing_information:[]});
    const reply=await handleNaturalMessage(1,2,"תעשה משהו עם אחמד",manager);
    expect(mocks.aiParse).toHaveBeenCalledOnce();
    expect(reply.text).toContain("מה תרצה לעשות");
    expect(mocks.createEntityDraft).not.toHaveBeenCalled();
  });

  it("continues a missing employee name from short-lived context without AI",async()=>{
    mocks.getContext.mockResolvedValue({kind:"entity_creation_missing_name",telegramUserId:2,entityKind:"employee"});
    const reply=await handleNaturalMessage(1,2,"אחמד מחמוד",manager);
    expect(mocks.aiParse).not.toHaveBeenCalled();
    expect(mocks.createEntityDraft).toHaveBeenCalledWith(expect.objectContaining({kind:"employee",name:"אחמד מחמוד"}));
    expect(reply.text).toContain("אחמד מחמוד");
  });

  it("asks for a missing project name and drafts the next message exactly",async()=>{
    const question=await handleNaturalMessage(1,2,"תפתח לי פרויקט חדש",manager);
    expect(question.text).toBe("איך תרצה לקרוא לפרויקט?");
    mocks.getContext.mockResolvedValue({kind:"entity_creation_missing_name",telegramUserId:2,entityKind:"project"});
    const draft=await handleNaturalMessage(1,2,"לשם - שוהם",manager);
    expect(mocks.createEntityDraft).toHaveBeenCalledWith(expect.objectContaining({kind:"project",name:"לשם - שוהם"}));
    expect(draft.text).toContain("שם: לשם - שוהם");
  });

  it.each(["ביטול","בטל","עזוב","לא משנה"])("cancels a pending project name with %s",async message=>{
    mocks.getContext.mockResolvedValue({kind:"entity_creation_missing_name",telegramUserId:2,entityKind:"project"});
    const reply=await handleNaturalMessage(1,2,message,manager);
    expect(reply.text).toBe("בוטל. לא בוצע שינוי.");
    expect(mocks.clearContext).toHaveBeenCalledWith(1);
    expect(mocks.createEntityDraft).not.toHaveBeenCalled();
  });

  it("allows scheduler employee creation but denies project creation without AI",async()=>{
    expect((await handleNaturalMessage(1,3,"תוסיף עובד אחמד",scheduler)).text).toContain("עובד חדש");
    const denied=await handleNaturalMessage(1,3,"תפתח לי פרויקט חדש",scheduler);
    expect(denied.text).toBe("אין לך הרשאה ליצור פרויקטים דרך הבוט.");
    expect(mocks.aiParse).not.toHaveBeenCalled();
  });

  it("denies an AI-classified scheduler report before querying data",async()=>{
    mocks.aiParse.mockResolvedValue({intent:"REPORT_QUERY",create_groups:[],entity_creation:null,report:{report_type:"COMPANY",output_format:"EXCEL",employee_reference:null,project_reference:null,date_reference:"חודש שעבר",date_from_reference:null,date_to_reference:null},missing_information:[]});
    const reply=await handleNaturalMessage(1,3,"תארגן לי קובץ עם כל השעות של חודש שעבר",scheduler);
    expect(reply.text).toBe("אין לך הרשאה לצפות בדוחות דרך הבוט.");
    expect(mocks.aiParse).toHaveBeenCalledOnce();
    expect(mocks.queryReport).not.toHaveBeenCalled();
  });

  it("blocks scheduler updates, including mixed batches, before creating a draft",async()=>{
    mocks.findExisting.mockResolvedValue(new Map([["e1:p1:2026-10-01",{regular_hours:8,overtime_hours:0}]]));
    const reply=await handleNaturalMessage(1,3,"היום עובדים אצל טל\nיוסף",scheduler);
    expect(reply.text).toContain("לעדכון דיווח קיים יש לפנות למנהל");
    expect(mocks.createTelegramDraft).not.toHaveBeenCalled();
  });
  it("allows scheduler attendance and attributes the draft to the scheduler actor",async()=>{const reply=await handleNaturalMessage(1,3,"היום עובדים אצל טל\nיוסף",scheduler);expect(reply.text).toContain("8 שעות");expect(mocks.createTelegramDraft).toHaveBeenCalledWith(expect.objectContaining({telegramActorId:scheduler.id,entries:[expect.objectContaining({employee_id:"e1",regular_hours:8})]}));});
  it("keeps the manager duplicate update workflow",async()=>{mocks.findExisting.mockResolvedValue(new Map([["e1:p1:2026-10-01",{regular_hours:7,overtime_hours:0}]]));const reply=await handleNaturalMessage(1,2,"היום עובדים אצל טל\nיוסף 8",manager);expect(reply.text).toContain("עדכון דיווח קיים");expect(mocks.createTelegramDraft).toHaveBeenCalled();});
  it("routes the exact production schedule identically for manager and scheduler without AI",async()=>{const message=`היום עבדו אצל טל:
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
    await handleNaturalMessage(1,2,message,manager);
    const managerEntries=mocks.createTelegramDraft.mock.calls.at(-1)?.[0].entries;
    mocks.createTelegramDraft.mockClear();
    await handleNaturalMessage(1,3,message,scheduler);
    const schedulerEntries=mocks.createTelegramDraft.mock.calls.at(-1)?.[0].entries;
    expect(schedulerEntries).toEqual(managerEntries);
    expect(schedulerEntries).toHaveLength(17);
    expect(mocks.aiParse).not.toHaveBeenCalled();
  });
});
