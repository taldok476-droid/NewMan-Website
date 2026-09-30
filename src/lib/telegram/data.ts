import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getActiveProjects(): Promise<string[]> {
  const { data, error } = await createAdminClient()
    .from("projects")
    .select("name")
    .eq("status", "active")
    .order("name");
  if (error) throw new Error(`Project lookup failed: ${error.code}`);
  return data.map((project) => project.name);
}

export async function getActiveProjectEntities() {
  const { data, error } = await createAdminClient().from("projects").select("id,name").eq("status","active").order("name");
  if (error) throw new Error(`Project lookup failed: ${error.code}`);
  return data;
}

export async function getActiveEmployees(): Promise<string[]> {
  const { data, error } = await createAdminClient()
    .from("employees")
    .select("first_name,last_name")
    .eq("status", "active")
    .order("first_name");
  if (error) throw new Error(`Employee lookup failed: ${error.code}`);
  return data.map((employee) => `${employee.first_name} ${employee.last_name}`);
}

export async function getActiveEmployeeEntities() {
  const { data, error } = await createAdminClient().from("employees").select("id,first_name,last_name").eq("status","active").order("first_name");
  if (error) throw new Error(`Employee lookup failed: ${error.code}`);
  return data.map(x=>({id:x.id,name:`${x.first_name} ${x.last_name}`}));
}

export async function getTodayEntries() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const { data, error } = await createAdminClient()
    .from("time_entries")
    .select("regular_hours,overtime_hours,employees(first_name,last_name),projects(name)")
    .eq("work_date", today)
    .order("created_at");
  if (error) throw new Error(`Time-entry lookup failed: ${error.code}`);
  return data.map((entry) => ({
    regular_hours: Number(entry.regular_hours),
    overtime_hours: Number(entry.overtime_hours),
    employees: Array.isArray(entry.employees) ? (entry.employees[0] ?? null) : entry.employees,
    projects: Array.isArray(entry.projects) ? (entry.projects[0] ?? null) : entry.projects,
  }));
}

export type TelegramTimeEntryInput = {
  workDate: string;
  employeeId: string;
  projectId: string;
  regularHours: number;
  overtimeHours?: number;
  notes?: string;
  createdBy: string;
};

// Reserved for the confirmation workflow in the next Telegram phase.
export async function createTelegramTimeEntries(entries: TelegramTimeEntryInput[]) {
  const payload = entries.map((entry) => ({
    work_date: entry.workDate,
    employee_id: entry.employeeId,
    project_id: entry.projectId,
    regular_hours: entry.regularHours,
    overtime_hours: entry.overtimeHours ?? 0,
    notes: entry.notes ?? null,
    created_by: entry.createdBy,
    source: "telegram" as const,
  }));
  const { data, error } = await createAdminClient().from("time_entries").insert(payload).select();
  if (error) throw new Error(`Time-entry creation failed: ${error.code}`);
  return data;
}

export async function claimTelegramUpdate(updateId: number): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("telegram_updates")
    .insert({ update_id: updateId });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(`Telegram update claim failed: ${error.code}`);
}

export async function releaseTelegramUpdate(updateId: number): Promise<void> {
  await createAdminClient().from("telegram_updates").delete().eq("update_id", updateId);
}

export type ResolvedDraftEntry={work_date:string;employee_id:string;employee_name:string;project_id:string;project_name:string;regular_hours:number;overtime_hours:number;notes:string|null;existing_hours:number|null};
export async function findExistingEntries(entries:ResolvedDraftEntry[]){const s=createAdminClient();const found=new Map<string,number>();for(const entry of entries){const {data,error}=await s.from("time_entries").select("regular_hours,overtime_hours").eq("employee_id",entry.employee_id).eq("project_id",entry.project_id).eq("work_date",entry.work_date).maybeSingle();if(error)throw new Error(`Duplicate lookup failed: ${error.code}`);if(data)found.set(`${entry.employee_id}:${entry.project_id}:${entry.work_date}`,Number(data.regular_hours)+Number(data.overtime_hours));}return found;}
export async function createTelegramDraft(args:{chatId:number;telegramUserId:number;entries:ResolvedDraftEntry[];messageHash:string;allowUpdates:boolean}){const createdBy=process.env.TELEGRAM_CREATED_BY_USER_ID;if(!createdBy)throw new Error("Missing TELEGRAM_CREATED_BY_USER_ID");const summary=args.entries.map(({employee_name,project_name,work_date,regular_hours,overtime_hours})=>({employee_name,project_name,work_date,regular_hours,overtime_hours}));const {data,error}=await createAdminClient().from("telegram_drafts").insert({chat_id:args.chatId,telegram_user_id:args.telegramUserId,intent:"CREATE_TIME_ENTRIES",original_message_hash:args.messageHash,payload:{entries:args.entries,allow_updates:args.allowUpdates,created_by:createdBy,summary}}).select("id,expires_at").single();if(error)throw new Error(`Draft creation failed: ${error.code}`);return data;}
export async function confirmTelegramDraft(id:string,chatId:number,userId:number){const {data,error}=await createAdminClient().rpc("confirm_telegram_draft",{p_draft_id:id,p_chat_id:chatId,p_telegram_user_id:userId});if(error)throw new Error(`Draft confirmation failed: ${error.code}`);return data as {result:string;affected?:number;summary?:Array<Record<string,unknown>>};}
export async function cancelTelegramDraft(id:string,chatId:number,userId:number){const s=createAdminClient();const {data}=await s.from("telegram_drafts").select("status,expires_at").eq("id",id).eq("chat_id",chatId).eq("telegram_user_id",userId).maybeSingle();if(!data)return"not_found";if(data.status!=="pending")return data.status;if(new Date(data.expires_at)<=new Date()){await s.from("telegram_drafts").update({status:"expired"}).eq("id",id);return"expired";}const {error}=await s.from("telegram_drafts").update({status:"cancelled"}).eq("id",id).eq("status","pending");if(error)throw new Error(`Draft cancellation failed: ${error.code}`);return"cancelled";}
export async function getConversationContext(chatId:number){const {data}=await createAdminClient().from("telegram_conversation_contexts").select("payload,expires_at").eq("chat_id",chatId).maybeSingle();if(!data||new Date(data.expires_at)<=new Date())return null;return data.payload as Record<string,unknown>;}
export async function saveConversationContext(chatId:number,payload:Record<string,unknown>){const expires=new Date(Date.now()+15*60_000).toISOString();const {error}=await createAdminClient().from("telegram_conversation_contexts").upsert({chat_id:chatId,payload,updated_at:new Date().toISOString(),expires_at:expires});if(error)throw new Error(`Context save failed: ${error.code}`);}
export async function queryReport(filters:{employeeId?:string;projectId?:string;from:string;to:string}){let q=createAdminClient().from("time_entries").select("work_date,regular_hours,overtime_hours,employees(first_name,last_name),projects(name)").gte("work_date",filters.from).lte("work_date",filters.to);if(filters.employeeId)q=q.eq("employee_id",filters.employeeId);if(filters.projectId)q=q.eq("project_id",filters.projectId);const {data,error}=await q.order("work_date");if(error)throw new Error(`Report query failed: ${error.code}`);return data.map(x=>({work_date:x.work_date,regular_hours:Number(x.regular_hours),overtime_hours:Number(x.overtime_hours),employee:Array.isArray(x.employees)?x.employees[0]:x.employees,project:Array.isArray(x.projects)?x.projects[0]:x.projects}));}
