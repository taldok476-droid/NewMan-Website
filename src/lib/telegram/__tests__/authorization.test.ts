import {afterEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:vi.fn()}));
import {createAdminClient} from "@/lib/supabase/admin";
import {clearTelegramAuthorizationCache,getTelegramActor,hasCapability,permissionDeniedMessage,requiredCapability,type TelegramActor} from "../auth";

const manager:TelegramActor={id:"m",telegramUserId:1,displayName:"Manager",role:"MANAGER",legacy:false};
const scheduler:TelegramActor={id:"s",telegramUserId:2,displayName:"Scheduler",role:"SCHEDULER",legacy:false};

describe("Telegram role capabilities",()=>{
  afterEach(()=>{clearTelegramAuthorizationCache();delete process.env.TELEGRAM_ALLOWED_CHAT_IDS;vi.clearAllMocks();});
  it("grants every required capability to managers",()=>expect(["ATTENDANCE_CREATE","EMPLOYEES_READ","EMPLOYEES_CREATE","PROJECTS_READ","PROJECTS_CREATE","TIME_ENTRIES_EDIT","TIME_ENTRIES_DELETE","REPORTS_VIEW","REPORTS_EXPORT","HISTORY_VIEW"].every(capability=>hasCapability(manager,capability as never))).toBe(true));
  it("grants only operational capabilities to schedulers",()=>{
    expect(hasCapability(scheduler,"ATTENDANCE_CREATE")).toBe(true);
    expect(hasCapability(scheduler,"EMPLOYEES_CREATE")).toBe(true);
    expect(hasCapability(scheduler,"PROJECTS_READ")).toBe(true);
    expect(hasCapability(scheduler,"PROJECTS_CREATE")).toBe(false);
    expect(hasCapability(scheduler,"TIME_ENTRIES_EDIT")).toBe(false);
    expect(hasCapability(scheduler,"REPORTS_VIEW")).toBe(false);
  });
  it("maps intents to centralized capabilities",()=>{
    expect(requiredCapability("CREATE_TIME_ENTRIES")).toBe("ATTENDANCE_CREATE");
    expect(requiredCapability("CREATE_PROJECT")).toBe("PROJECTS_CREATE");
    expect(requiredCapability("REPORT_QUERY","EXCEL")).toBe("REPORTS_EXPORT");
  });
  it("uses concise domain-specific denial messages",()=>expect(permissionDeniedMessage("PROJECTS_CREATE")).toContain("ליצור פרויקטים"));
  it("does not model Telegram usernames as an authorization input",()=>expect(scheduler).not.toHaveProperty("username"));
  it("loads an active account by authoritative numeric Telegram user ID",async()=>{vi.mocked(createAdminClient).mockReturnValue({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:"s",telegram_user_id:2,display_name:"Scheduler",role:"SCHEDULER",is_active:true},error:null})})})})} as never);expect(await getTelegramActor(2,999,{fresh:true})).toMatchObject({id:"s",role:"SCHEDULER"});});
  it("denies inactive and unknown users",async()=>{const maybeSingle=vi.fn().mockResolvedValueOnce({data:{id:"s",telegram_user_id:2,display_name:"Scheduler",role:"SCHEDULER",is_active:false},error:null}).mockResolvedValueOnce({data:null,error:null});vi.mocked(createAdminClient).mockReturnValue({from:()=>({select:()=>({eq:()=>({maybeSingle})})})} as never);expect(await getTelegramActor(2,999,{fresh:true})).toBeNull();expect(await getTelegramActor(3,999,{fresh:true})).toBeNull();});
  it("uses the legacy allow-list only when no database account exists",async()=>{process.env.TELEGRAM_ALLOWED_CHAT_IDS="7";vi.mocked(createAdminClient).mockReturnValue({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})})} as never);expect(await getTelegramActor(7,7,{fresh:true})).toMatchObject({role:"MANAGER",legacy:true});});
});
