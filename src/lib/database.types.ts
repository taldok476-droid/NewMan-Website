export type ProjectStatus = "active" | "paused" | "completed";
export type EmployeeStatus = "active" | "inactive";
export type EntrySource = "web" | "telegram";
export type Project = { id:string; name:string; description:string|null; location:string|null; status:ProjectStatus; start_date:string|null; end_date:string|null; notes:string|null; created_at:string; updated_at:string };
export type Employee = { id:string; first_name:string; last_name:string; phone:string|null; status:EmployeeStatus; notes:string|null; created_at:string; updated_at:string };
export type TimeEntry = { id:string; work_date:string; employee_id:string; project_id:string; regular_hours:number; overtime_hours:number; notes:string|null; source:EntrySource; created_by:string; telegram_actor_id:string|null; created_at:string; updated_at:string; employees?:Pick<Employee,"first_name"|"last_name">; projects?:Pick<Project,"name">; telegram_users?:{display_name:string}|null };
