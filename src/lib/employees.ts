const formValue=(form:FormData,key:string)=>String(form.get(key)||"").trim()||null;

export function employeeMutationData(form:FormData){return{
  first_name:formValue(form,"first_name"),
  last_name:formValue(form,"last_name"),
  phone:formValue(form,"phone"),
  status:formValue(form,"status"),
  notes:formValue(form,"notes"),
};}
