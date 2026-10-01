import { describe,expect,it } from "vitest";
import { employeeMutationData } from "../employees";
import { resolveEntity } from "../telegram/resolution";

function form(id?:string){const data=new FormData();if(id)data.set("id",id);data.set("first_name","יוסף");data.set("last_name","נחאש");data.set("phone","0501234567");data.set("status","active");data.set("notes","");return data;}

describe("employees without business numbers",()=>{
  it("builds a creation payload without employee_number",()=>expect(employeeMutationData(form())).toEqual({first_name:"יוסף",last_name:"נחאש",phone:"0501234567",status:"active",notes:null}));
  it("builds an edit payload without overwriting a stored employee_number",()=>{const data=form("employee-uuid");data.set("employee_number","legacy-100");expect(employeeMutationData(data)).not.toHaveProperty("employee_number");});
  it("continues resolving existing employees entirely by name",()=>expect(resolveEntity("יוסף נחאש",[{id:"employee-uuid",name:"יוסף נחאש"}])).toMatchObject({kind:"resolved",entity:{id:"employee-uuid"}}));
  it("keeps duplicate first names ambiguous",()=>expect(resolveEntity("יוסף",[{id:"employee-uuid-1",name:"יוסף נחאש"},{id:"employee-uuid-2",name:"יוסף כהן"}]).kind).toBe("ambiguous"));
  it("keeps UUID identity independent of identical display names",()=>{const employees=[{id:"employee-uuid-1",name:"יוסף כהן"},{id:"employee-uuid-2",name:"יוסף כהן"}];expect(new Set(employees.map(employee=>employee.id)).size).toBe(2);expect(resolveEntity("יוסף כהן",employees).kind).toBe("ambiguous");});
});
