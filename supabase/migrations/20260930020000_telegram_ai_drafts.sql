create type public.telegram_draft_status as enum ('pending','confirmed','cancelled','expired');

create table public.telegram_drafts (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  telegram_user_id bigint not null,
  status public.telegram_draft_status not null default 'pending',
  intent text not null check (intent in ('CREATE_TIME_ENTRIES')),
  payload jsonb not null,
  original_message_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  confirmed_at timestamptz
);
create index telegram_drafts_chat_status_idx on public.telegram_drafts(chat_id,status,created_at desc);
alter table public.telegram_drafts enable row level security;

create table public.telegram_conversation_contexts (
  chat_id bigint primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);
alter table public.telegram_conversation_contexts enable row level security;

create or replace function public.confirm_telegram_draft(p_draft_id uuid, p_chat_id bigint, p_telegram_user_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  draft public.telegram_drafts%rowtype;
  item jsonb;
  affected integer := 0;
begin
  select * into draft from public.telegram_drafts where id=p_draft_id and chat_id=p_chat_id and telegram_user_id=p_telegram_user_id for update;
  if not found then return jsonb_build_object('result','not_found'); end if;
  if draft.status='confirmed' then return jsonb_build_object('result','already_confirmed'); end if;
  if draft.status<>'pending' then return jsonb_build_object('result',draft.status::text); end if;
  if draft.expires_at <= now() then
    update public.telegram_drafts set status='expired' where id=p_draft_id;
    return jsonb_build_object('result','expired');
  end if;
  for item in select * from jsonb_array_elements(draft.payload->'entries') loop
    if coalesce((draft.payload->>'allow_updates')::boolean,false) then
      insert into public.time_entries(work_date,employee_id,project_id,regular_hours,overtime_hours,notes,source,created_by)
      values ((item->>'work_date')::date,(item->>'employee_id')::uuid,(item->>'project_id')::uuid,(item->>'regular_hours')::numeric,(item->>'overtime_hours')::numeric,item->>'notes','telegram',(draft.payload->>'created_by')::uuid)
      on conflict(employee_id,project_id,work_date) do update set regular_hours=excluded.regular_hours,overtime_hours=excluded.overtime_hours,notes=excluded.notes,source='telegram',updated_at=now();
    else
      insert into public.time_entries(work_date,employee_id,project_id,regular_hours,overtime_hours,notes,source,created_by)
      values ((item->>'work_date')::date,(item->>'employee_id')::uuid,(item->>'project_id')::uuid,(item->>'regular_hours')::numeric,(item->>'overtime_hours')::numeric,item->>'notes','telegram',(draft.payload->>'created_by')::uuid);
    end if;
    affected := affected + 1;
  end loop;
  update public.telegram_drafts set status='confirmed',confirmed_at=now() where id=p_draft_id;
  return jsonb_build_object('result','confirmed','affected',affected,'summary',draft.payload->'summary');
end; $$;

revoke all on function public.confirm_telegram_draft(uuid,bigint,bigint) from public, anon, authenticated;
grant execute on function public.confirm_telegram_draft(uuid,bigint,bigint) to service_role;
