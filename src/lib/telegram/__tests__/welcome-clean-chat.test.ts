import {afterEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:vi.fn()}));
vi.mock("../data",()=>({getTodayEntries:vi.fn(async()=>[])}));
vi.mock("../reference-cache",()=>({getCachedActiveEmployees:vi.fn(async()=>[]),getCachedActiveProjects:vi.fn(async()=>[])}));
import {answerCallbackQuery,editCallbackMessage} from "../api";
import {formatRoleMenu,formatRoleWelcome,formatUnknownWelcome} from "../format";
import {routeCommand} from "../router";
import type {TelegramActor} from "../auth";

const manager:TelegramActor={id:"m",telegramUserId:1,displayName:"אחמד שריף",role:"MANAGER",legacy:false};
const scheduler:TelegramActor={id:"s",telegramUserId:2,displayName:"יוסף נחאש",role:"SCHEDULER",legacy:false};

describe("role-aware Telegram welcome",()=>{
  it("welcomes a manager by display-name first name without exposing the role",()=>{const text=formatRoleWelcome("אחמד שריף","MANAGER");expect(text).toContain("שלום אחמד");expect(text).toContain("להפיק דוחות");expect(text).not.toContain("MANAGER");});
  it("welcomes a scheduler with operational capabilities only",()=>{const text=formatRoleWelcome("יוסף נחאש","SCHEDULER");expect(text).toContain("שלום יוסף");expect(text).toContain("סידורי העבודה היומיים");expect(text).not.toContain("דוחות");expect(text).not.toContain("SCHEDULER");});
  it("onboards an unknown user with only their own Telegram ID",()=>{const text=formatUnknownWelcome(12345);expect(text).toContain("12345");expect(text).toContain("הגישה שלך עדיין לא הופעלה");});
  it("keeps scheduler menu actions within scheduler authorization",()=>{const menu=formatRoleMenu("SCHEDULER");expect(menu).toContain("הוספת עובד");expect(menu).not.toContain("דוחות");});
  it("routes manager and scheduler /start through their database actor",async()=>{expect(await routeCommand(1,"/start",manager)).toContain("שלום אחמד");expect(await routeCommand(2,"/start",scheduler)).toContain("שלום יוסף");});
  it("routes unknown /start to safe onboarding without business data",async()=>{const text=await routeCommand(77,"/start",null);expect(text).toContain("77");expect(text).not.toContain("פרויקטים פעילים");});
  it("keeps /myid scoped to the sender",async()=>expect(await routeCommand(88,"/myid",null)).toBe("88"));
});

describe("clean callback delivery",()=>{
  afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();delete process.env.TELEGRAM_BOT_TOKEN;});
  it("edits the original confirmation message and removes inline buttons",async()=>{process.env.TELEGRAM_BOT_TOKEN="token";const fetchMock=vi.fn().mockResolvedValue({ok:true});vi.stubGlobal("fetch",fetchMock);await editCallbackMessage(10,20,"✅ הדיווח נשמר");expect(fetchMock).toHaveBeenCalledOnce();expect(String(fetchMock.mock.calls[0][0])).toContain("editMessageText");expect(JSON.parse(fetchMock.mock.calls[0][1].body).reply_markup).toEqual({inline_keyboard:[]});});
  it("edits cancellation into the same message with buttons removed",async()=>{process.env.TELEGRAM_BOT_TOKEN="token";const fetchMock=vi.fn().mockResolvedValue({ok:true});vi.stubGlobal("fetch",fetchMock);await editCallbackMessage(10,20,"❌ הפעולה בוטלה");expect(JSON.parse(fetchMock.mock.calls[0][1].body).reply_markup.inline_keyboard).toEqual([]);});
  it("replaces obsolete clarification buttons with the next operation buttons",async()=>{process.env.TELEGRAM_BOT_TOKEN="token";const fetchMock=vi.fn().mockResolvedValue({ok:true});vi.stubGlobal("fetch",fetchMock);const buttons=[[{text:"אישור",callback_data:"confirm:11111111-1111-1111-1111-111111111111"}]];await editCallbackMessage(10,20,"טיוטה",{inlineKeyboard:buttons});expect(JSON.parse(fetchMock.mock.calls[0][1].body).reply_markup.inline_keyboard).toEqual(buttons);});
  it("removes stale buttons and falls back to one concise message if Telegram cannot edit",async()=>{process.env.TELEGRAM_BOT_TOKEN="token";vi.spyOn(console,"error").mockImplementation(()=>undefined);const fetchMock=vi.fn().mockResolvedValueOnce({ok:false,status:400}).mockResolvedValueOnce({ok:true}).mockResolvedValueOnce({ok:true});vi.stubGlobal("fetch",fetchMock);await editCallbackMessage(10,20,"✅ נשמר");expect(fetchMock).toHaveBeenCalledTimes(3);expect(String(fetchMock.mock.calls[1][0])).toContain("editMessageReplyMarkup");expect(String(fetchMock.mock.calls[2][0])).toContain("sendMessage");});
  it("logs Telegram error status and response safely without exposing the bot token",async()=>{process.env.TELEGRAM_BOT_TOKEN="super-secret-token";const error=vi.spyOn(console,"error").mockImplementation(()=>undefined);vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,status:400,text:async()=>JSON.stringify({ok:false,error_code:400,description:"Bad Request: query is too old"})}));await expect(answerCallbackQuery("old-query")).rejects.toThrow("Telegram answerCallbackQuery failed");expect(error).toHaveBeenCalledWith("Telegram API request failed",expect.objectContaining({method:"answerCallbackQuery",status:400,response:{ok:false,error_code:400,description:"Bad Request: query is too old"}}));expect(JSON.stringify(error.mock.calls)).not.toContain("super-secret-token");error.mockRestore();});
  it("treats an HTTP 200 Telegram envelope with ok false as an API failure",async()=>{process.env.TELEGRAM_BOT_TOKEN="token";vi.spyOn(console,"error").mockImplementation(()=>undefined);vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,status:200,text:async()=>JSON.stringify({ok:false,error_code:400,description:"Bad Request"})}));await expect(answerCallbackQuery("bad-query")).rejects.toThrow();});
});
