-- Confirm a Telegram batch in one database transaction and execute exactly the
-- insert/update operation displayed in the draft. Existing grants and RLS stay intact.
create or replace function public.confirm_telegram_draft(p_draft_id uuid, p_chat_id bigint, p_telegram_user_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  draft public.telegram_drafts%rowtype;
  item jsonb;
  operation text;
  affected integer := 0;
  changed integer := 0;
begin
  select * into draft
  from public.telegram_drafts
  where id=p_draft_id and chat_id=p_chat_id and telegram_user_id=p_telegram_user_id
  for update;

  if not found then return jsonb_build_object('result','not_found'); end if;
  if draft.status='confirmed' then return jsonb_build_object('result','already_confirmed'); end if;
  if draft.status<>'pending' then return jsonb_build_object('result',draft.status::text); end if;
  if draft.expires_at <= now() then
    update public.telegram_drafts set status='expired' where id=p_draft_id;
    return jsonb_build_object('result','expired');
  end if;

  for item in select * from jsonb_array_elements(draft.payload->'entries') loop
    operation := item->>'operation';
    if operation='insert' then
      insert into public.time_entries(work_date,employee_id,project_id,regular_hours,overtime_hours,notes,source,created_by)
      values ((item->>'work_date')::date,(item->>'employee_id')::uuid,(item->>'project_id')::uuid,(item->>'regular_hours')::numeric,(item->>'overtime_hours')::numeric,item->>'notes','telegram',(draft.payload->>'created_by')::uuid);
    elsif operation='update' then
      update public.time_entries set
        regular_hours=(item->>'regular_hours')::numeric,
        overtime_hours=(item->>'overtime_hours')::numeric,
        notes=item->>'notes',
        source='telegram',
        updated_at=now()
      where employee_id=(item->>'employee_id')::uuid
        and project_id=(item->>'project_id')::uuid
        and work_date=(item->>'work_date')::date;
      get diagnostics changed = row_count;
      if changed <> 1 then raise exception 'Expected one existing Telegram time entry for update'; end if;
    elsif operation is null and coalesce((draft.payload->>'allow_updates')::boolean,false) then
      -- Backward compatibility for drafts created before this migration.
      insert into public.time_entries(work_date,employee_id,project_id,regular_hours,overtime_hours,notes,source,created_by)
      values ((item->>'work_date')::date,(item->>'employee_id')::uuid,(item->>'project_id')::uuid,(item->>'regular_hours')::numeric,(item->>'overtime_hours')::numeric,item->>'notes','telegram',(draft.payload->>'created_by')::uuid)
      on conflict(employee_id,project_id,work_date) do update set regular_hours=excluded.regular_hours,overtime_hours=excluded.overtime_hours,notes=excluded.notes,source='telegram',updated_at=now();
    elsif operation is null then
      insert into public.time_entries(work_date,employee_id,project_id,regular_hours,overtime_hours,notes,source,created_by)
      values ((item->>'work_date')::date,(item->>'employee_id')::uuid,(item->>'project_id')::uuid,(item->>'regular_hours')::numeric,(item->>'overtime_hours')::numeric,item->>'notes','telegram',(draft.payload->>'created_by')::uuid);
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
