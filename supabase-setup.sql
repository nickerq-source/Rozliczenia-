-- Wklej to w Supabase SQL Editor i kliknij Run

create table if not exists workspaces (
  token      text primary key,
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Zezwól na anonimowy odczyt i zapis (brak logowania w aplikacji)
alter table workspaces enable row level security;

create policy "Publiczny dostep" on workspaces
  for all using (true) with check (true);
