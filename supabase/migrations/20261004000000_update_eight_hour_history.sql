-- Business-approved one-time conversion of historical regular hours.
-- Keep updated_at and all unrelated columns unchanged.
alter table public.time_entries disable trigger time_entries_updated_at;

update public.time_entries
set regular_hours = 10
where regular_hours = 8;

alter table public.time_entries enable trigger time_entries_updated_at;
