-- Ehrwald Trainer – Schema (Phase 4)
-- Alle Tabellen gehören genau einem Nutzer (user_id = auth.uid()), Row Level Security ist überall aktiv.
-- Tokens und OAuth-States sind für das Frontend unsichtbar (RLS ohne Policies → nur Service Role).

-- ───────────── Nutzerdaten (lesen + schreiben durch den Nutzer) ─────────────

create table if not exists public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  settings jsonb not null,
  onboarded boolean not null default false,
  demo_mode boolean not null default false,
  checklist jsonb not null default '{}'::jsonb,
  workout_assignments jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.day_overrides (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  type text not null check (type in ('V','URLAUB','KRANK','TAUSCH','UEBERSTUNDEN','FORTBILDUNG','FREI')),
  shift text check (shift in ('T','N','V','F')),
  start_time text,
  end_time text,
  note text,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists public.session_logs (
  user_id uuid not null references auth.users on delete cascade,
  session_id text not null,
  date date not null,
  status text not null check (status in ('done','partial','skipped')),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, session_id)
);
create index if not exists session_logs_date on public.session_logs (user_id, date);

create table if not exists public.strength_tests (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists public.strength_progress (
  user_id uuid primary key references auth.users on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.manual_recovery (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  sleep_hours numeric(4,2) not null,
  sleep_quality smallint not null check (sleep_quality between 1 and 5),
  feeling smallint not null check (feeling between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists public.adjustment_decisions (
  user_id uuid not null references auth.users on delete cascade,
  session_id text not null,
  date date not null,
  accepted boolean not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

create table if not exists public.push_subscriptions (
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);

create table if not exists public.reminders (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  fire_at timestamptz not null,
  title text not null,
  body text not null,
  sent_at timestamptz,
  primary key (user_id, id)
);
create index if not exists reminders_due on public.reminders (fire_at) where sent_at is null;

-- ───────────── WHOOP (nur Edge Functions schreiben, Nutzer liest) ─────────────

create table if not exists public.whoop_connections (
  user_id uuid primary key references auth.users on delete cascade,
  whoop_user_id bigint,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  scope text,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists whoop_connections_whoop_user on public.whoop_connections (whoop_user_id);

create table if not exists public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users on delete cascade,
  redirect_to text,
  created_at timestamptz not null default now()
);

create table if not exists public.whoop_cycles (
  user_id uuid not null references auth.users on delete cascade,
  id bigint not null,
  start_at timestamptz not null,
  end_at timestamptz,
  raw jsonb not null,
  primary key (user_id, id)
);
create table if not exists public.whoop_recoveries (
  user_id uuid not null references auth.users on delete cascade,
  cycle_id bigint not null,
  sleep_id text,
  raw jsonb not null,
  primary key (user_id, cycle_id)
);
create table if not exists public.whoop_sleeps (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  nap boolean not null default false,
  raw jsonb not null,
  primary key (user_id, id)
);
create table if not exists public.whoop_workouts (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  raw jsonb not null,
  primary key (user_id, id)
);
create table if not exists public.whoop_body (
  user_id uuid primary key references auth.users on delete cascade,
  raw jsonb not null,
  updated_at timestamptz not null default now()
);

-- ───────────── Row Level Security ─────────────

do $$
declare t text;
begin
  -- Tabellen, die der Nutzer selbst lesen und schreiben darf
  foreach t in array array['profiles','day_overrides','session_logs','strength_tests','strength_progress','manual_recovery','adjustment_decisions','push_subscriptions','reminders'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_all on public.%I', t);
    execute format('create policy own_all on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
  -- WHOOP-Rohdaten: nur lesen
  foreach t in array array['whoop_cycles','whoop_recoveries','whoop_sleeps','whoop_workouts','whoop_body'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_read on public.%I', t);
    execute format('create policy own_read on public.%I for select to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;

-- Tokens und States: RLS an, KEINE Policy → für anon/authenticated unsichtbar
alter table public.whoop_connections enable row level security;
alter table public.oauth_states enable row level security;

-- Verbindungsstatus ohne Tokens für das Frontend
create or replace function public.whoop_status()
returns table (connected boolean, last_sync_at timestamptz, scope text)
language sql
security definer
set search_path = public
as $$
  select true, c.last_sync_at, c.scope from public.whoop_connections c where c.user_id = auth.uid()
$$;
revoke all on function public.whoop_status() from public, anon;
grant execute on function public.whoop_status() to authenticated;
