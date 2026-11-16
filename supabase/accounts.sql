-- REVEAL accounts: run once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run: it only creates what is missing.

-- 1. Player names: 3–14 lowercase letters, numbers or _, and no rude words.
create or replace function public.reveal_name_ok(n text) returns boolean
language sql immutable as $$
  select n ~ '^[a-z0-9_]{3,14}$'
     and not exists (
       select 1 from unnest(array[
         'fuck','shit','cunt','bitch','nigg','fagg','slut','whore','rape','nazi','porn','dick','penis','vagina','anal',
         'puki','pukimak','babi','sial','kontol','pantat','lancau','butoh','bangsat','keparat','jubur',
         'admin','moderator','reveal'
       ]) w where replace(n, '_', '') like '%' || w || '%')
$$;

-- 2. Public profiles: one per signed-in player.
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique check (public.reveal_name_ok(username)),
  avatar text not null default 'nova' check (avatar in ('nova','pixel','echo','blaze','juno','orbit','maple','comet','kiwi','mochi','sable','rook')),
  stats jsonb not null default '{}'::jsonb check (pg_column_size(stats) < 2000),
  rating int not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);
drop policy if exists "create your own profile" on public.profiles;
create policy "create your own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "edit your own profile" on public.profiles;
create policy "edit your own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Players may only write these columns. Rating is changed by the game server only (ranked, next step).
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, username, avatar, stats, updated_at) on public.profiles to authenticated;
grant update (username, avatar, stats, updated_at) on public.profiles to authenticated;

-- 3. Daily scores posted by signed-in players carry their account id.
alter table public.daily_scores add column if not exists user_id uuid references auth.users on delete set null;
drop policy if exists "post for today only" on public.daily_scores;
create policy "post for today only" on public.daily_scores for insert
  with check (day between current_date - 1 and current_date + 1
              and (user_id is null or user_id = auth.uid()));
