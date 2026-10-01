-- Extend the existing expiring, user-owned Telegram draft workflow to entity creation.
alter table public.telegram_drafts drop constraint if exists telegram_drafts_intent_check;
alter table public.telegram_drafts add constraint telegram_drafts_intent_check
  check (intent in ('CREATE_TIME_ENTRIES','CREATE_EMPLOYEE','CREATE_PROJECT'));

create or replace function public.confirm_telegram_draft(p_draft_id uuid, p_chat_id bigint, p_telegram_user_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  draft public.telegram_drafts%rowtype;
  item jsonb;
  operation text;
  affected integer := 0;
  changed integer := 0;
  entity_name text;
  first_name text;
  last_name text;
begin
  select * into draft from public.telegram_drafts
  where id=p_draft_id and chat_id=p_chat_id and telegram_user_id=p_telegram_user_id for update;
  if not found then return jsonb_build_object('result','not_found'); end if;
  if draft.status='confirmed' then return jsonb_build_object('result','already_confirmed','intent',draft.intent,'name',draft.payload->>'name'); end if;
  if draft.status<>'pending' then return jsonb_build_object('result',draft.status::text); end if;
  if draft.expires_at <= now() then
    update public.telegram_drafts set status='expired' where id=p_draft_id;
    return jsonb_build_object('result','expired');
  end if;

  if draft.intent='CREATE_EMPLOYEE' then
    entity_name := trim(draft.payload->>'name');
    if entity_name is null or entity_name='' then raise exception 'Employee name is required'; end if;
    if exists(select 1 from public.employees e where e.status='active' and lower(trim(e.first_name||' '||e.last_name))=lower(entity_name)) then
      update public.telegram_drafts set status='cancelled' where id=p_draft_id;
      return jsonb_build_object('result','duplicate','intent',draft.intent,'name',entity_name);
    end if;
    first_name := split_part(entity_name,' ',1);
    last_name := trim(substr(entity_name,length(first_name)+1));
    insert into public.employees(first_name,last_name,phone,status) values(first_name,last_name,nullif(trim(draft.payload->>'phone'),''),'active');
    update public.telegram_drafts set status='confirmed',confirmed_at=now() where id=p_draft_id;
    return jsonb_build_object('result','confirmed','intent',draft.intent,'name',entity_name,'affected',1);
  elsif draft.intent='CREATE_PROJECT' then
    entity_name := trim(draft.payload->>'name');
    if entity_name is null or entity_name='' then raise exception 'Project name is required'; end if;
    if exists(select 1 from public.projects p where p.status='active' and lower(trim(p.name))=lower(entity_name)) then
      update public.telegram_drafts set status='cancelled' where id=p_draft_id;
      return jsonb_build_object('result','duplicate','intent',draft.intent,'name',entity_name);
    end if;
    insert into public.projects(name,status) values(entity_name,'active');
    update public.telegram_drafts set status='confirmed',confirmed_at=now() where id=p_draft_id;
    return jsonb_build_object('result','confirmed','intent',draft.intent,'name',entity_name,'affected',1);
  end if;

  for item in select * from jsonb_array_elements(draft.payload->'entries') loop
    operation := item->>'operation';
    if operation='insert' then
      insert into public.time_entries(work_date,employee_id,project_id,regular_hours,overtime_hours,notes,source,created_by)
      values ((item->>'work_date')::date,(item->>'employee_id')::uuid,(item->>'project_id')::uuid,(item->>'regular_hours')::numeric,(item->>'overtime_hours')::numeric,item->>'notes','telegram',(draft.payload->>'created_by')::uuid);
    elsif operation='update' then
      update public.time_entries set regular_hours=(item->>'regular_hours')::numeric,overtime_hours=(item->>'overtime_hours')::numeric,notes=item->>'notes',source='telegram',updated_at=now()
      where employee_id=(item->>'employee_id')::uuid and project_id=(item->>'project_id')::uuid and work_date=(item->>'work_date')::date;
      get diagnostics changed = row_count;
      if changed <> 1 then raise exception 'Expected one existing Telegram time entry for update'; end if;
    else
      raise exception 'Invalid Telegram draft operation';
    end if;
    affected := affected + 1;
  end loop;
  update public.telegram_drafts set status='confirmed',confirmed_at=now() where id=p_draft_id;
  return jsonb_build_object('result','confirmed','affected',affected,'summary',draft.payload->'summary');
end; $$;

revoke all on function public.confirm_telegram_draft(uuid,bigint,bigint) from public, anon, authenticated;
grant execute on function public.confirm_telegram_draft(uuid,bigint,bigint) to service_role;
