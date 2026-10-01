import {beforeEach,describe,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({
  aiParse:vi.fn(),createEntityDraft:vi.fn(),getContext:vi.fn(),saveContext:vi.fn(),
}));
vi.mock("server-only",()=>({}));
vi.mock("../ai/openai",()=>({getIntentProvider:()=>({parse:mocks.aiParse})}));
vi.mock("../reference-cache",()=>({
  getCachedActiveEmployees:async()=>[{id:"e1",name:"יוסף נחאש"}],
  getCachedActiveProjects:async()=>[{id:"p1",name:"עובדי רג״י טל"}],
}));
vi.mock("../data",()=>({
  createEntityDraft:mocks.createEntityDraft,
  createTelegramDraft:vi.fn(),findExistingEntries:vi.fn(async()=>new Map()),
  getConversationContext:mocks.getContext,saveConversationContext:mocks.saveContext,
  getTodayEntries:vi.fn(async()=>[]),queryReport:vi.fn(async()=>[]),
}));

import {handleNaturalMessage} from "../natural";

const employeeIntent={intent:"CREATE_EMPLOYEE",create_groups:[],entity_creation:{name:"אחמד",phone:null},report:null,missing_information:[]};

describe("two-stage Telegram intent routing",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.getContext.mockResolvedValue(null);mocks.createEntityDraft.mockResolvedValue({id:"11111111-1111-1111-1111-111111111111"});});

  it("does not call AI when the deterministic creation path succeeds",async()=>{
    const reply=await handleNaturalMessage(1,2,"תוסיף עובד אחמד");
    expect(mocks.aiParse).not.toHaveBeenCalled();
    expect(mocks.createEntityDraft).toHaveBeenCalledOnce();
    expect(reply.text).toContain("האם ליצור את העובד?");
  });

  it("uses exactly one AI interpretation call for unusual wording",async()=>{
    mocks.aiParse.mockResolvedValue(employeeIntent);
    const reply=await handleNaturalMessage(1,2,"יש לי בחור חדש אחמד שמתחיל אצלנו תכניס אותו למערכת");
    expect(mocks.aiParse).toHaveBeenCalledOnce();
    expect(mocks.createEntityDraft).toHaveBeenCalledOnce();
    expect(reply.inlineKeyboard?.[0][0].callback_data).toMatch(/^confirm:[0-9a-f-]{36}$/);
  });

  it("asks for clarification when AI cannot confidently classify",async()=>{
    mocks.aiParse.mockResolvedValue({intent:"UNKNOWN",create_groups:[],entity_creation:null,report:null,missing_information:[]});
    const reply=await handleNaturalMessage(1,2,"תעשה משהו עם אחמד");
    expect(mocks.aiParse).toHaveBeenCalledOnce();
    expect(reply.text).toContain("מה תרצה לעשות");
    expect(mocks.createEntityDraft).not.toHaveBeenCalled();
  });

  it("continues a missing employee name from short-lived context without AI",async()=>{
    mocks.getContext.mockResolvedValue({kind:"entity_creation_missing_name",telegramUserId:2,entityKind:"employee"});
    const reply=await handleNaturalMessage(1,2,"אחמד מחמוד");
    expect(mocks.aiParse).not.toHaveBeenCalled();
    expect(mocks.createEntityDraft).toHaveBeenCalledWith(expect.objectContaining({kind:"employee",name:"אחמד מחמוד"}));
    expect(reply.text).toContain("אחמד מחמוד");
  });
});
