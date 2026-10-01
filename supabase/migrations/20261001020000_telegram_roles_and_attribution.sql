create type public.telegram_role as enum ('MANAGER','SCHEDULER');

create table public.telegram_users (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint unique not null,
  display_name text not null check (char_length(trim(display_name)) between 1 and 160),
  role public.telegram_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index telegram_users_active_id_idx on public.telegram_users(telegram_user_id) where is_active;
alter table public.telegram_users enable row level security;
create policy telegram_users_authenticated_read on public.telegram_users for select to authenticated using (true);

alter table public.time_entries add column telegram_actor_id uuid null references public.telegram_users(id) on delete set null;
create index time_entries_telegram_actor_idx on public.time_entries(telegram_actor_id) where telegram_actor_id is not null;

create table public.telegram_audit_events (
  id uuid primary key default gen_random_uuid(),
  telegram_actor_id uuid null references public.telegram_users(id) on delete set null,
  action_type text not null check (action_type in ('ATTENDANCE_CREATED','EMPLOYEE_CREATED','PROJECT_CREATED','TIME_ENTRY_UPDATED','TIME_ENTRY_DELETED')),
  entity_type text not null,
  entity_id uuid null,
  draft_id uuid null references public.telegram_drafts(id) on delete set null,
  created_at timestamptz not null default now()
);
create index telegram_audit_actor_created_idx on public.telegram_audit_events(telegram_actor_id,created_at desc);
alter table public.telegram_audit_events enable row level security;

create or replace function public.telegram_role_has_capability(p_role public.telegram_role,p_capability text)
returns boolean language sql immutable set search_path='' as $$
  select case p_role
    when 'MANAGER' then p_capability=any(array['ATTENDANCE_CREATE','EMPLOYEES_READ','EMPLOYEES_CREATE','PROJECTS_READ','PROJECTS_CREATE','TIME_ENTRIES_EDIT','TIME_ENTRIES_DELETE','REPORTS_VIEW','REPORTS_EXPORT','HISTORY_VIEW'])
    when 'SCHEDULER' then p_capability=any(array['ATTENDANCE_CREATE','EMPLOYEES_READ','EMPLOYEES_CREATE','PROJECTS_READ'])
    else false end;
$$;
revoke all on function public.telegram_role_has_capability(public.telegram_role,text) from public,anon,authenticated;
grant execute on function public.telegram_role_has_capability(public.telegram_role,text) to service_role;

create or replace function public.confirm_telegram_draft(p_draft_id uuid,p_chat_id bigint,p_telegram_user_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  draft public.telegram_drafts%rowtype; actor public.telegram_users%rowtype; item jsonb;
  operation text; required_capability text; affected integer:=0; changed integer:=0;
  entity_name text; first_name text; last_name text; created_id uuid; has_accounts boolean;
begin
  select * into draft from public.telegram_drafts where id=p_draft_id and chat_id=p_chat_id and telegram_user_id=p_telegram_user_id for update;
  if not found then return jsonb_build_object('result','not_found'); end if;
  select exists(select 1 from public.telegram_users) into has_accounts;
  select * into actor from public.telegram_users where telegram_user_id=p_telegram_user_id;
  if has_accounts and (not found or not actor.is_active) then return jsonb_build_object('result','unauthorized'); end if;
  required_capability:=case draft.intent when 'CREATE_TIME_ENTRIES' then 'ATTENDANCE_CREATE' when 'CREATE_EMPLOYEE' then 'EMPLOYEES_CREATE' when 'CREATE_PROJECT' then 'PROJECTS_CREATE' end;
  if actor.id is not null and not public.telegram_role_has_capability(actor.role,required_capability) then return jsonb_build_object('result','forbidden'); end if;
  if draft.status='confirmed' then return jsonb_build_object('result','already_confirmed','intent',draft.intent,'name',draft.payload->>'name'); end if;
  if draft.status<>'pending' then return jsonb_build_object('result',draft.status::text); end if;
  if draft.expires_at<=now() then update public.telegram_drafts set status='expired' where id=p_draft_id;return jsonb_build_object('result','expired');end if;

  if draft.intent='CREATE_EMPLOYEE' then
    entity_name:=trim(draft.payload->>'name');if entity_name is null or entity_name='' then raise exception 'Employee name is required';end if;
    if exists(select 1 from public.employees e where e.status='active' and lower(trim(e.first_name||' '||e.last_name))=lower(entity_name)) then update public.telegram_drafts set status='cancelled' where id=p_draft_id;return jsonb_build_object('result','duplicate','intent',draft.intent,'name',entity_name);end if;
    first_name:=split_part(entity_name,' ',1);last_name:=trim(substr(entity_name,length(first_name)+1));
    insert into public.employees(first_name,last_name,phone,status) values(first_name,last_name,nullif(trim(draft.payload->>'phone'),''),'active') returning id into created_id;
    insert into public.telegram_audit_events(telegram_actor_id,action_type,entity_type,entity_id,draft_id) values(actor.id,'EMPLOYEE_CREATED','employee',created_id,draft.id);
    update public.telegram_drafts set status='confirmed',confirmed_at=now() where id=p_draft_id;return jsonb_build_object('result','confirmed','intent',draft.intent,'name',entity_name,'affected',1);
  elsif draft.intent='CREATE_PROJECT' then
    entity_name:=trim(draft.payload->>'name');if entity_name is null or entity_name='' then raise exception 'Project name is required';end if;
    if exists(select 1 from public.projects p where p.status='active' and lower(trim(p.name))=lower(entity_name)) then update public.telegram_drafts set status='cancelled' where id=p_draft_id;return jsonb_build_object('result','duplicate','intent',draft.intent,'name',entity_name);end if;
    insert into public.projects(name,status) values(entity_name,'active') returning id into created_id;
    insert into public.telegram_audit_events(telegram_actor_id,action_type,entity_type,entity_id,draft_id) values(actor.id,'PROJECT_CREATED','project',created_id,draft.id);
    update public.telegram_drafts set status='confirmed',confirmed_at=now() where id=p_draft_id;return jsonb_build_object('result','confirmed','intent',draft.intent,'name',entity_name,'affected',1);
  end if;

  for item in select * from jsonb_array_elements(draft.payload->'entries') loop
    operation:=item->>'operation';
    if operation='insert' then
      insert into public.time_entries(work_date,employee_id,project_id,regular_hours,overtime_hours,notes,source,created_by,telegram_actor_id)
      values((item->>'work_date')::date,(item->>'employee_id')::uuid,(item->>'project_id')::uuid,(item->>'regular_hours')::numeric,(item->>'overtime_hours')::numeric,item->>'notes','telegram',(draft.payload->>'created_by')::uuid,actor.id) returning id into created_id;
      insert into public.telegram_audit_events(telegram_actor_id,action_type,entity_type,entity_id,draft_id) values(actor.id,'ATTENDANCE_CREATED','time_entry',created_id,draft.id);
    elsif operation='update' then
      if actor.id is not null and not public.telegram_role_has_capability(actor.role,'TIME_ENTRIES_EDIT') then return jsonb_build_object('result','forbidden');end if;
      update public.time_entries set regular_hours=(item->>'regular_hours')::numeric,overtime_hours=(item->>'overtime_hours')::numeric,notes=item->>'notes',source='telegram',updated_at=now()
      where employee_id=(item->>'employee_id')::uuid and project_id=(item->>'project_id')::uuid and work_date=(item->>'work_date')::date returning id into created_id;
      get diagnostics changed=row_count;if changed<>1 then raise exception 'Expected one existing Telegram time entry for update';end if;
      insert into public.telegram_audit_events(telegram_actor_id,action_type,entity_type,entity_id,draft_id) values(actor.id,'TIME_ENTRY_UPDATED','time_entry',created_id,draft.id);
    else raise exception 'Invalid Telegram draft operation';end if;
    affected:=affected+1;
  end loop;
  update public.telegram_drafts set status='confirmed',confirmed_at=now() where id=p_draft_id;
  return jsonb_build_object('result','confirmed','affected',affected,'summary',draft.payload->'summary');
end;$$;
revoke all on function public.confirm_telegram_draft(uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function public.confirm_telegram_draft(uuid,bigint,bigint) to service_role;
