import {describe,expect,it} from "vitest";
import {applyTimeEntryEdit,calculateTimeEntryTotals,editableTimeEntrySchema,hasDuplicateCollision,removeTimeEntry,type AuditedTimeEntry} from "../time-entry-rules";

const base:AuditedTimeEntry={id:"11111111-1111-1111-1111-111111111111",work_date:"2026-09-21",employee_id:"22222222-2222-2222-2222-222222222222",project_id:"33333333-3333-3333-3333-333333333333",regular_hours:8,overtime_hours:0,notes:null,source:"telegram",created_by:"44444444-4444-4444-4444-444444444444",created_at:"2026-09-21T12:00:00Z"};
const edit=(changes:Partial<AuditedTimeEntry>)=>applyTimeEntryEdit(base,{work_date:changes.work_date??base.work_date,employee_id:changes.employee_id??base.employee_id,project_id:changes.project_id??base.project_id,regular_hours:changes.regular_hours??base.regular_hours,overtime_hours:changes.overtime_hours??base.overtime_hours,notes:changes.notes===undefined?base.notes:changes.notes});

describe("individual time-entry management",()=>{
  it("edits regular hours",()=>expect(edit({regular_hours:9}).regular_hours).toBe(9));
  it("edits overtime hours",()=>expect(edit({overtime_hours:2}).overtime_hours).toBe(2));
  it("edits work date",()=>expect(edit({work_date:"2026-09-22"}).work_date).toBe("2026-09-22"));
  it("edits project",()=>expect(edit({project_id:"55555555-5555-5555-5555-555555555555"}).project_id).toBe("55555555-5555-5555-5555-555555555555"));
  it("edits notes",()=>expect(edit({notes:"עבודה בגובה"}).notes).toBe("עבודה בגובה"));
  it("detects a duplicate collision excluding the current UUID",()=>expect(hasDuplicateCollision([base,{...base,id:"66666666-6666-6666-6666-666666666666"}],base.id,base)).toBe(true));
  it("deletes only the selected entry",()=>expect(removeTimeEntry([base,{...base,id:"77777777-7777-7777-7777-777777777777"}],base.id).map(x=>x.id)).toEqual(["77777777-7777-7777-7777-777777777777"]));
  it("delete cancellation leaves the collection unchanged",()=>{const rows=[base];expect(rows).toHaveLength(1);expect(rows[0]).toBe(base);});
  it("recalculates totals after edit",()=>expect(calculateTimeEntryTotals([edit({regular_hours:9,overtime_hours:1})])).toEqual({regular:9,overtime:1,total:10}));
  it("recalculates totals after delete",()=>expect(calculateTimeEntryTotals(removeTimeEntry([base,{...base,id:"88888888-8888-8888-8888-888888888888",regular_hours:4}],base.id))).toEqual({regular:4,overtime:0,total:4}));
  it("retains telegram audit source when edited from web",()=>{const updated=edit({regular_hours:9});expect(updated.source).toBe("telegram");expect(updated.created_by).toBe(base.created_by);expect(updated.created_at).toBe(base.created_at);});
  it("rejects zero and excessive total hours",()=>{expect(editableTimeEntrySchema.safeParse({...base,regular_hours:0,overtime_hours:0}).success).toBe(false);expect(editableTimeEntrySchema.safeParse({...base,regular_hours:20,overtime_hours:5}).success).toBe(false);});
});
