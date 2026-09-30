import { z } from "zod";

export const editableTimeEntrySchema = z.object({
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employee_id: z.string().uuid(),
  project_id: z.string().uuid(),
  regular_hours: z.coerce.number().min(0).max(24),
  overtime_hours: z.coerce.number().min(0).max(24),
  notes: z.string().trim().max(2000).nullable(),
}).superRefine((value,context)=>{
  const total=value.regular_hours+value.overtime_hours;
  if(total<=0)context.addIssue({code:"custom",message:"יש להזין לפחות חלק משעת עבודה"});
  if(total>24)context.addIssue({code:"custom",message:"סך השעות היומי לא יכול לעלות על 24"});
  const [year,month,day]=value.work_date.split("-").map(Number),date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)context.addIssue({code:"custom",message:"תאריך העבודה אינו תקין"});
});

export type EditableTimeEntry=z.infer<typeof editableTimeEntrySchema>;
export type AuditedTimeEntry=EditableTimeEntry&{id:string;source:"web"|"telegram";created_by:string;created_at:string};

export function applyTimeEntryEdit(entry:AuditedTimeEntry,changes:EditableTimeEntry):AuditedTimeEntry{return{...entry,...changes};}
export function hasDuplicateCollision(entries:Array<Pick<AuditedTimeEntry,"id"|"employee_id"|"project_id"|"work_date">>,id:string,changes:Pick<EditableTimeEntry,"employee_id"|"project_id"|"work_date">){return entries.some(entry=>entry.id!==id&&entry.employee_id===changes.employee_id&&entry.project_id===changes.project_id&&entry.work_date===changes.work_date);}
export function calculateTimeEntryTotals(entries:Array<Pick<EditableTimeEntry,"regular_hours"|"overtime_hours">>){const regular=entries.reduce((sum,entry)=>sum+Number(entry.regular_hours),0),overtime=entries.reduce((sum,entry)=>sum+Number(entry.overtime_hours),0);return{regular,overtime,total:regular+overtime};}
export function removeTimeEntry<T extends {id:string}>(entries:T[],id:string){return entries.filter(entry=>entry.id!==id);}
