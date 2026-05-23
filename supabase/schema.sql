-- ARKX Motion Pro V2 — Supabase Schema
-- Jalankan di: Supabase Dashboard → SQL Editor

create table if not exists history (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,
  model       text not null,
  prompt      text,
  task_id     text,
  status      text default 'processing',
  video_url   text,
  cover_url   text,
  params      jsonb default '{}',
  error       text,
  created_at  timestamptz default now()
);

create index if not exists idx_history_type   on history(type);
create index if not exists idx_history_status on history(status);
create index if not exists idx_history_ts     on history(created_at desc);

alter table history enable row level security;
create policy "allow all" on history for all using (true);
