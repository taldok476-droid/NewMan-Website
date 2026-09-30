-- Server-only idempotency ledger. No client policies are intentionally created.
create table public.telegram_updates (
  update_id bigint primary key,
  received_at timestamptz not null default now()
);

alter table public.telegram_updates enable row level security;

-- Prevent indefinite growth while retaining enough history for Telegram retries.
create index telegram_updates_received_at_idx on public.telegram_updates(received_at);
