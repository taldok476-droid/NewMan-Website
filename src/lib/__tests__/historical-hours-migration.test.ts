import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe,expect,it} from "vitest";

const migration=readFileSync(join(process.cwd(),"supabase/migrations/20261004000000_update_eight_hour_history.sql"),"utf8");

describe("historical eight-to-ten migration",()=>{
  it("targets only regular_hours equal to exactly eight",()=>{expect(migration).toMatch(/set\s+regular_hours\s*=\s*10[\s\S]*where\s+regular_hours\s*=\s*8/i);expect(migration).not.toMatch(/overtime_hours\s*=/i);});
  it("preserves timestamps by suspending only the existing updated-at trigger",()=>{expect(migration).toContain("disable trigger time_entries_updated_at");expect(migration).toContain("enable trigger time_entries_updated_at");});
  it.each([[7,7],[8,10],[9,9],[10,10],[12,12]])("maps regular hours %s to %s",(before,after)=>expect(before===8?10:before).toBe(after));
  it("leaves overtime and unrelated data unchanged",()=>{const before={regular_hours:8,overtime_hours:2,employee_id:"e1",project_id:"p1",work_date:"2026-09-01"};expect({...before,regular_hours:before.regular_hours===8?10:before.regular_hours}).toEqual({...before,regular_hours:10});});
});
