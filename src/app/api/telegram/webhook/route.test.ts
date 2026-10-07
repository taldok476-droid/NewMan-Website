import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({answer:vi.fn(),edit:vi.fn(),actor:vi.fn(),claim:vi.fn(),release:vi.fn(),draft:vi.fn(),order:[] as string[]}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/telegram/api",()=>({answerCallbackQuery:mocks.answer,editCallbackMessage:mocks.edit,sendChatAction:vi.fn(),sendDocument:vi.fn(),sendMessage:vi.fn()}));
vi.mock("@/lib/telegram/auth",()=>({isValidWebhookSecret:()=>true,getTelegramActor:mocks.actor}));
vi.mock("@/lib/telegram/data",()=>({claimTelegramUpdate:mocks.claim,releaseTelegramUpdate:mocks.release}));
vi.mock("@/lib/telegram/router",()=>({routeCommand:vi.fn()}));
vi.mock("@/lib/telegram/types",()=>({telegramUpdateSchema:{safeParse:(data:unknown)=>({success:true,data})}}));
vi.mock("@/lib/telegram/natural",()=>({handleClarificationCallback:vi.fn(),handleNaturalMessage:vi.fn()}));
vi.mock("@/lib/telegram/callbacks",()=>({handleDraftCallback:mocks.draft}));
vi.mock("@/lib/telegram/performance",()=>({TelegramPerformance:class{async measure(_name:string,fn:()=>unknown){return fn();}log(){}}}));
vi.mock("@/lib/telegram/delivery",()=>({EXCEL_DELIVERY_FAILURE_MESSAGE:"failure"}));
import {POST} from "./route";

const manager={id:"m",telegramUserId:20,displayName:"Manager",role:"MANAGER",legacy:false},scheduler={...manager,id:"s",role:"SCHEDULER"};
function request(data=`confirm:11111111-1111-1111-1111-111111111111`){return new Request("https://newman.test/api/telegram/webhook",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({update_id:99,callback_query:{id:"callback-1",from:{id:20},message:{message_id:30,chat:{id:10}},data}})});}

describe("Telegram webhook callback lifecycle",()=>{
  afterEach(()=>vi.restoreAllMocks());
  beforeEach(()=>{vi.clearAllMocks();mocks.order.length=0;mocks.claim.mockResolvedValue(true);mocks.release.mockResolvedValue(undefined);mocks.actor.mockResolvedValue(manager);mocks.answer.mockImplementation(async()=>{mocks.order.push("ack");});mocks.draft.mockImplementation(async()=>{mocks.order.push("business");return"✅ הדיווח נשמר";});mocks.edit.mockImplementation(async()=>{mocks.order.push("edit");});});
  it.each([["manager",manager],["scheduler",scheduler]] as const)("acknowledges, confirms, and edits for %s",async(_label,actor)=>{mocks.actor.mockResolvedValue(actor);const response=await POST(request());expect(response.status).toBe(200);expect(mocks.order).toEqual(["ack","business","edit"]);expect(mocks.edit).toHaveBeenCalledWith(10,30,"✅ הדיווח נשמר",{});});
  it("acknowledges cancellation before editing the original message",async()=>{mocks.draft.mockResolvedValue("❌ הפעולה בוטלה\n\nלא בוצע שינוי.");await POST(request("cancel:11111111-1111-1111-1111-111111111111"));expect(mocks.answer).toHaveBeenCalledWith("callback-1");expect(mocks.edit).toHaveBeenCalledWith(10,30,"❌ הפעולה בוטלה\n\nלא בוצע שינוי.",{});});
  it("continues the business action when callback acknowledgement fails",async()=>{mocks.answer.mockRejectedValue(new Error("expired callback"));const response=await POST(request());expect(response.status).toBe(200);expect(mocks.draft).toHaveBeenCalledOnce();expect(mocks.edit).toHaveBeenCalledOnce();});
  it("does not undo a completed business action when all UI delivery fails",async()=>{vi.spyOn(console,"error").mockImplementation(()=>undefined);mocks.edit.mockRejectedValue(new Error("delivery failed"));const response=await POST(request());expect(response.status).toBe(500);expect(mocks.draft).toHaveBeenCalledOnce();expect(mocks.release).toHaveBeenCalledWith(99);});
});
