-- REVEAL visitor counts: where players come from and what they do. Run once in Supabase → SQL Editor. Safe to re-run.
--
-- The game sends small anonymous events (track.js): visit, start, finish, signin, signup.
-- src   = the visitor's FIRST source (threads, facebook, instagram, google, share, direct, or your own ?src= tag)
-- via   = the source of this particular visit
-- mode  = solo, daily, ranked, br (unranked online), room (challenge a friend), local (Play Locally host), join (phone that joined)
-- visitor = a random id kept on that device. No names, emails or IP addresses are stored.
--
-- To see the numbers: SQL Editor → run   select * from reveal_report;      (last 7 days, by source)
--                                    and   select * from reveal_report_days; (last 14 days, by day)

create table if not exists public.reveal_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null,
  mode text,
  src text not null,
  via text,
  visitor text not null
);
create index if not exists reveal_events_at on public.reveal_events (at);
alter table public.reveal_events enable row level security;
revoke all on public.reveal_events from anon, authenticated;

create or replace function public.reveal_track(kind text, mode text default null, src text default 'direct', visitor text default '', via text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if kind not in ('visit','start','finish','signin','signup') then return; end if;
  if visitor !~ '^[a-z0-9]{12,40}$' then return; end if;
  -- a gentle cap so one device can't flood the table
  if (select count(*) from reveal_events e where e.visitor = reveal_track.visitor and e.at > now() - interval '1 hour') >= 300 then return; end if;
  insert into reveal_events (kind, mode, src, via, visitor)
  values (kind,
          nullif(left(regexp_replace(lower(coalesce(mode,'')), '[^a-z0-9._-]', '', 'g'), 32), ''),
          coalesce(nullif(left(regexp_replace(lower(coalesce(src,'')), '[^a-z0-9._-]', '', 'g'), 32), ''), 'direct'),
          nullif(left(regexp_replace(lower(coalesce(via,'')), '[^a-z0-9._-]', '', 'g'), 32), ''),
          visitor);
end $$;
revoke all on function public.reveal_track(text, text, text, text, text) from public;
grant execute on function public.reveal_track(text, text, text, text, text) to anon, authenticated;

-- Last 7 days, one row per source: people, games started and finished, sign-ins and new accounts.
create or replace view public.reveal_report as
  select src as source,
         count(distinct visitor)                                    as people,
         count(*) filter (where kind = 'visit')                     as visits,
         count(*) filter (where kind = 'start')                     as games_started,
         count(*) filter (where kind = 'finish')                    as games_finished,
         count(distinct visitor) filter (where kind = 'start')      as people_who_played,
         count(*) filter (where kind = 'signin')                    as sign_ins,
         count(*) filter (where kind = 'signup')                    as new_accounts,
         count(*) filter (where kind = 'start' and mode = 'daily')  as daily_games,
         count(*) filter (where kind = 'start' and mode = 'ranked') as ranked_games
  from public.reveal_events
  where at > now() - interval '7 days'
  group by src
  order by people desc;

-- Last 14 days, one row per day (Malaysia time).
create or replace view public.reveal_report_days as
  select (at at time zone 'Asia/Kuala_Lumpur')::date as day,
         count(distinct visitor)                               as people,
         count(*) filter (where kind = 'start')                as games_started,
         count(*) filter (where kind = 'finish')               as games_finished,
         count(*) filter (where kind = 'signup')               as new_accounts,
         string_agg(distinct src, ', ')                        as sources
  from public.reveal_events
  where at > now() - interval '14 days'
  group by 1
  order by 1 desc;
revoke all on public.reveal_report, public.reveal_report_days from anon, authenticated;
