-- Detailed preview: run before applying the migration.
select te.id,concat_ws(' ',e.first_name,e.last_name) as employee,p.name as project,te.work_date,te.regular_hours as current_regular_hours,te.overtime_hours,10::numeric as proposed_regular_hours
from public.time_entries te
join public.employees e on e.id=te.employee_id
join public.projects p on p.id=te.project_id
where te.regular_hours=8
order by te.work_date,employee,project;

-- Count preview: run before applying the migration.
select count(*) as affected_rows
from public.time_entries
where regular_hours=8;
