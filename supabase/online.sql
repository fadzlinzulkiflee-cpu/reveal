-- REVEAL "players online" counter for the Battle Royale page and the home screen's Ranked Play button.
-- Run once in Supabase → SQL Editor → New query → Run (after ranked.sql). Safe to re-run.
--
-- Every open Battle Royale page (guest or signed in) sends a small "I'm here" ping about every 20 s with a random
-- id that is not linked to the player. rk_activity() saves the ping and returns live numbers:
--   online   people with the Battle Royale page open in the last 45 s
--   waiting  signed-in players sitting in a ranked lobby right now
--   playing  signed-in players in a ranked match that has started
--   starts   seconds until the open ranked lobby starts (null when no lobby is open)
-- The home screen calls it without an id, so it only reads.

create table if not exists public.reveal_online (
  id text primary key,
  seen timestamptz not null default now()
);
alter table public.reveal_online enable row level security;
revoke all on public.reveal_online from anon, authenticated;
create index if not exists reveal_online_seen on public.reveal_online (seen);

create or replace function public.rk_activity(me text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_online int; n_wait int; n_play int; nxt double precision;
begin
  if me ~ '^[a-z0-9]{10,40}$' then
    insert into reveal_online (id, seen) values (me, now())
      on conflict (id) do update set seen = excluded.seen;
  end if;
  delete from reveal_online where seen < now() - interval '2 minutes';
  select count(*) into n_online from reveal_online where seen > now() - interval '45 seconds';

  select count(*) into n_wait from rk_players p join rk_matches x on x.id = p.match_id
    where x.phase = 'lobby' and x.start_at > now() and not p.bot and p.last_seen > now() - interval '10 seconds';
  select count(*) into n_play from rk_players p join rk_matches x on x.id = p.match_id
    where x.phase in ('countdown','play','reveal') and not p.bot and p.last_seen > now() - interval '15 seconds';
  select extract(epoch from min(x.start_at) - now()) into nxt from rk_matches x
    where x.phase = 'lobby' and x.start_at > now() + interval '2 seconds'
      and exists (select 1 from rk_players p where p.match_id = x.id and not p.bot and p.last_seen > now() - interval '10 seconds');

  return jsonb_build_object(
    'online', greatest(n_online, n_wait + n_play),
    'waiting', n_wait, 'playing', n_play,
    'starts', case when nxt is null then null else ceil(nxt) end);
end $$;
revoke all on function public.rk_activity(text) from public;
grant execute on function public.rk_activity(text) to anon, authenticated;
