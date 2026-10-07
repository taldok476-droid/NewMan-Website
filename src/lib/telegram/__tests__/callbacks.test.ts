import {beforeEach,describe,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({confirm:vi.fn(),cancel:vi.fn(),clearEmployees:vi.fn(),clearProjects:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("../data",()=>({confirmTelegramDraft:mocks.confirm,cancelTelegramDraft:mocks.cancel}));
vi.mock("../reference-cache",()=>({clearEmployeeReferenceCache:mocks.clearEmployees,clearProjectReferenceCache:mocks.clearProjects}));
import {handleDraftCallback} from "../callbacks";

const id="11111111-1111-1111-1111-111111111111",confirmData=`confirm:${id}`,cancelData=`cancel:${id}`;
const attendance={result:"confirmed",intent:"CREATE_TIME_ENTRIES",affected:2,summary:[{employee_name:"מואיד",project_name:"טל",regular_hours:10,overtime_hours:0},{employee_name:"יוסף",project_name:"טל",regular_hours:10,overtime_hours:0}]};

describe("Telegram draft callback state transitions",()=>{
  beforeEach(()=>vi.clearAllMocks());
  it("formats a successful attendance confirmation from actual summary data",async()=>{mocks.confirm.mockResolvedValue(attendance);const text=await handleDraftCallback(10,20,confirmData);expect(mocks.confirm).toHaveBeenCalledOnce();expect(text).toContain("✅ הדיווח נשמר");expect(text).toContain("פרויקט: טל");expect(text).toContain("עובדים: 2");expect(text).toContain("כמות שעות עבודה: 20");});
  it("cancels without invoking the attendance confirmation RPC",async()=>{mocks.cancel.mockResolvedValue("cancelled");expect(await handleDraftCallback(10,20,cancelData)).toBe("❌ הפעולה בוטלה\n\nלא בוצע שינוי.");expect(mocks.confirm).not.toHaveBeenCalled();});
  it("keeps a double confirmation harmless",async()=>{mocks.confirm.mockResolvedValueOnce(attendance).mockResolvedValueOnce({result:"already_confirmed"});expect(await handleDraftCallback(10,20,confirmData)).toContain("נשמר");expect(await handleDraftCallback(10,20,confirmData)).toBe("הפעולה כבר בוצעה בהצלחה.");});
  it("rejects confirmation after cancellation",async()=>{mocks.confirm.mockResolvedValue({result:"cancelled"});expect(await handleDraftCallback(10,20,confirmData)).toBe("הטיוטה בוטלה ולא ניתן לאשר אותה.");});
  it("rejects cancellation after confirmation",async()=>{mocks.cancel.mockResolvedValue("confirmed");expect(await handleDraftCallback(10,20,cancelData)).toBe("הפעולה כבר בוצעה.");});
  it.each([["CREATE_EMPLOYEE","אחמד","העובד אחמד נוסף",mocks.clearEmployees],["CREATE_PROJECT","טל","הפרויקט טל נוסף",mocks.clearProjects]] as const)("preserves %s confirmation callbacks",async(intent,name,expected,clear)=>{mocks.confirm.mockResolvedValue({result:"confirmed",intent,name});expect(await handleDraftCallback(10,20,confirmData)).toContain(expected);expect(clear).toHaveBeenCalledOnce();});
});
