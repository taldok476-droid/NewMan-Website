-- Employee UUIDs remain the authoritative identity. Preserve existing numbers,
-- but allow new employees to be created without this legacy business field.
alter table public.employees alter column employee_number drop not null;
