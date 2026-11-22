-- REVEAL ranked Battle Royale: the match runs in the database, so nobody's phone decides the result.
-- Run once in Supabase → SQL Editor (after accounts.sql), then load the ranked words from the private word file (not in this repo). Safe to re-run.
--
-- How it works: players call rk_join() to get a match, then poll rk_state(match) about twice a second and
-- send answers with rk_guess(match, text). Every call first runs rk_tick(match), which moves the match on
-- when its time is up (lobby → countdown → play → reveal → … → over). The secret word never leaves the
-- database until the round is over. Rules match the unranked game: 20 s per word, a wrong answer or no
-- answer puts you out, so does the slowest correct answer, nobody is out if nobody gets it, and with two
-- left the first correct answer wins. Bots fill empty seats and never affect ratings. A match is rated
-- (ELO, K = 32 shared across opponents) only when 3 or more signed-in players took part.


-- ---------- tables (no direct access for players: everything goes through the functions below) ----------
create table if not exists public.rk_words (
  id serial primary key,
  word text not null unique check (word ~ '^[A-Z]{3,20}$'),
  hint text not null,
  level int not null check (level between 1 and 3)
);

create table if not exists public.rk_matches (
  id uuid primary key default gen_random_uuid(),
  phase text not null default 'lobby' check (phase in ('lobby','countdown','play','reveal','over')),
  created_at timestamptz not null default now(),
  start_at timestamptz not null,               -- when the lobby closes
  phase_ends timestamptz,                      -- end of the current countdown / play / reveal
  play_start timestamptz,                      -- when this round's clock started
  round int not null default 0,
  word text, hint text, ord int[],             -- this round's word, clue and letter reveal order (0-based)
  used int[] not null default '{}',            -- rk_words ids already used in this match
  showdown boolean not null default false,
  total int not null default 0,
  finished boolean not null default false,
  feed jsonb, summary jsonb, winner text,
  rated boolean not null default false
);
create index if not exists rk_matches_lobby on public.rk_matches (phase, start_at);

create table if not exists public.rk_players (
  match_id uuid not null references public.rk_matches on delete cascade,
  pid int not null,
  user_id uuid references auth.users on delete set null,
  name text not null,
  avatar text,
  bot boolean not null default false,
  skill real,
  out boolean not null default false,
  out_round int, place int, elim_round int,
  r_correct boolean not null default false,    -- this round
  r_failed boolean not null default false,
  r_at double precision,                       -- seconds after the round's clock started
  plan_at double precision, plan_right boolean,-- bots decide up front
  rating_before int, rating_after int,
  last_seen timestamptz not null default now(),
  primary key (match_id, pid)
);
create unique index if not exists rk_players_user on public.rk_players (match_id, user_id) where user_id is not null;
create index if not exists rk_players_user_any on public.rk_players (user_id);

alter table public.rk_words enable row level security;
alter table public.rk_matches enable row level security;
alter table public.rk_players enable row level security;
revoke all on public.rk_words, public.rk_matches, public.rk_players from anon, authenticated;

-- ---------- settings ----------
create or replace function public.rk_conf(k text) returns double precision language sql immutable as $$
  select case k
    when 'lobby' then 20      -- seconds a lobby waits for players
    when 'max' then 20        -- players per match
    when 'fill' then 10       -- bots fill the match up to this many players
    when 't' then 20          -- seconds per word
    when 'countdown' then 3.4 -- 3-2-1-GO
    when 'reveal' then 4      -- pause on the answer between rounds
    when 'rounds' then 7      -- after this many words, everyone left wins together (Lin, 22 Nov: 7 rounds)
    when 'k' then 32          -- ELO K factor
    when 'min_real' then 3    -- signed-in players needed for a rated match
  end $$;

-- ---------- internal steps ----------
create or replace function public.rk_next_round(m uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mt rk_matches; w rk_words; n int; alive int; b record; r double precision; s double precision; miss double precision; wrong double precision;
begin
  select * into mt from rk_matches where id = m;
  select count(*) into alive from rk_players where match_id = m and not out;
  select * into w from rk_words where not (id = any(mt.used)) order by random() limit 1;
  if w.id is null or mt.round >= rk_conf('rounds') then perform rk_game_over(m); return; end if;
  n := length(w.word);
  update rk_matches set
    round = round + 1, word = w.word, hint = w.hint, used = used || w.id,
    ord = (select array_agg(i order by random()) from generate_series(0, n-1) i),
    showdown = (alive = 2), feed = null, summary = null,
    phase = 'countdown', phase_ends = now() + make_interval(secs => rk_conf('countdown')), play_start = null
  where id = m;
  update rk_players set r_correct = false, r_failed = false, r_at = null, elim_round = null, plan_at = null, plan_right = null
  where match_id = m;
  -- bots plan when they will answer and whether they get it right (same odds as the unranked game)
  for b in select pid, skill from rk_players where match_id = m and bot and not out loop
    s := b.skill; r := random(); miss := .04 + (1-s)*.12; wrong := .04 + (1-s)*.08;
    if r >= miss then
      update rk_players set plan_right = (r >= miss + wrong),
        plan_at = least(.97, .18 + (1-s)*.45 + random()*.32 + greatest(0, n-7)*.015) * rk_conf('t')
      where match_id = m and pid = b.pid;
    end if;
  end loop;
end $$;

create or replace function public.rk_end_round(m uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mt rk_matches; contenders int; ncorrect int; slow int; aliveAfter int; outs int; fd jsonb := '[]'::jsonb; names text; first_name text;
begin
  select * into mt from rk_matches where id = m;
  select count(*) into contenders from rk_players where match_id = m and not out;
  select count(*) into ncorrect from rk_players where match_id = m and not out and r_correct;
  if ncorrect = 0 then
    fd := fd || to_jsonb('Nobody got it, so everyone stays in.'::text);
    aliveAfter := contenders; outs := 0;
  else
    slow := null;
    if ncorrect >= 2 and not mt.showdown then
      select pid into slow from rk_players where match_id = m and not out and r_correct order by r_at desc, pid desc limit 1;
    end if;
    select count(*) into outs from rk_players where match_id = m and not out and (not r_correct or pid = slow);
    aliveAfter := contenders - outs;
    if mt.showdown then
      select name into first_name from rk_players where match_id = m and not out and r_correct order by r_at, pid limit 1;
      fd := fd || to_jsonb(format('<b>%s</b> answered first and wins the showdown!', first_name));
    end if;
    select string_agg(format('<b>%s</b>', name), ', ' order by pid) into names from rk_players where match_id = m and not out and r_failed;
    if names is not null then fd := fd || to_jsonb('Wrong answer: ' || names); end if;
    if not mt.showdown then
      select string_agg(format('<b>%s</b>', name), ', ' order by pid) into names from rk_players where match_id = m and not out and not r_correct and not r_failed;
      if names is not null then fd := fd || to_jsonb('Out of time: ' || names); end if;
    end if;
    if slow is not null then
      select format('Slowest correct: <b>%s</b>', name) into names from rk_players where match_id = m and pid = slow;
      fd := fd || to_jsonb(names);
    end if;
    if outs = 0 then fd := fd || to_jsonb('Everyone survives.'::text); end if;
    update rk_players set out = true, elim_round = mt.round, out_round = mt.round, place = aliveAfter + 1
    where match_id = m and not out and (not r_correct or pid = slow);
  end if;
  update rk_matches set phase = 'reveal', phase_ends = now() + make_interval(secs => rk_conf('reveal')),
    feed = fd, summary = jsonb_build_object('survived', aliveAfter, 'out', outs),
    finished = (aliveAfter <= 1 or round >= rk_conf('rounds'))
  where id = m;
end $$;

create or replace function public.rk_game_over(m uuid) returns void
language plpgsql security definer set search_path = public as $$
declare alive_names text; nalive int; nreal int; k double precision := rk_conf('k');
begin
  update rk_players set place = 1 where match_id = m and not out;
  select count(*), string_agg(name, ' & ' order by pid) into nalive, alive_names from rk_players where match_id = m and not out;
  update rk_matches set phase = 'over', phase_ends = null,
    winner = case when nalive = 1 then alive_names || ' is the last one standing!' when nalive > 1 then alive_names || ' survive!' else 'No one survived!' end
  where id = m;
  -- ELO: every signed-in player is compared with every other one by finishing place
  select count(*) into nreal from rk_players where match_id = m and user_id is not null and not bot;
  if nreal >= rk_conf('min_real') then
    with r as (
      select p.pid, p.place, pr.rating::double precision as rt
      from rk_players p join profiles pr on pr.id = p.user_id
      where p.match_id = m and not p.bot
    ), d as (
      select a.pid, a.rt,
        round(k / (nreal - 1) * sum(
          (case when a.place < b.place then 1.0 when a.place = b.place then 0.5 else 0.0 end)
          - 1.0 / (1.0 + power(10.0, (b.rt - a.rt) / 400.0))))::int as delta
      from r a join r b on a.pid <> b.pid group by a.pid, a.rt
    )
    update rk_players p set rating_before = d.rt::int, rating_after = greatest(0, d.rt::int + d.delta)
    from d where p.match_id = m and p.pid = d.pid;
    update profiles pr set rating = p.rating_after, updated_at = now()
    from rk_players p where p.match_id = m and p.user_id = pr.id and p.rating_after is not null;
    update rk_matches set rated = true where id = m;
  end if;
end $$;

-- Moves the match on while its time is up. Safe to call as often as you like.
create or replace function public.rk_tick(m uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mt rk_matches; el double precision; t double precision := rk_conf('t'); names text[]; b text; i int; j int; humans int; active_open int;
begin
  for i in 1..12 loop
    select * into mt from rk_matches where id = m for update;
    if not found or mt.phase = 'over' then return; end if;

    if mt.phase = 'lobby' then
      if now() < mt.start_at and (select count(*) from rk_players where match_id = m) < rk_conf('max') then return; end if;
      -- fill with bots and start
      select count(*) into humans from rk_players where match_id = m;
      names := array(select x from unnest(array['Nova','Pixel','Echo','Blaze','Juno','Orbit','Maple','Comet','Indigo','Rook','Sable','Kiwi',
        'Atlas','Ember','Quill','Zephyr','Pepper','Lumen','Vega','Mochi','Sprout','Cobalt','Dune','Fable']) x
        where lower(x) not in (select lower(name) from rk_players where match_id = m) order by random());
      for j in 1 .. greatest(0, least(coalesce(array_length(names,1),0), greatest(rk_conf('fill'), 2)::int - humans)) loop
        b := names[j];
        insert into rk_players (match_id, pid, name, avatar, bot, skill)
        values (m, (select coalesce(max(pid),0)+1 from rk_players where match_id = m), b,
          case when lower(b) in ('nova','pixel','echo','blaze','juno','orbit','maple','comet','kiwi','mochi','sable','rook') then lower(b)
               else (array['nova','pixel','echo','blaze','juno','orbit','maple','comet','kiwi','mochi','sable','rook'])[1 + floor(random()*12)::int] end,
          true, .3 + random()*.6);
      end loop;
      update rk_matches set total = (select count(*) from rk_players where match_id = m) where id = m;
      perform rk_next_round(m);
      continue;
    end if;

    if mt.phase = 'countdown' then
      if now() < mt.phase_ends then return; end if;
      update rk_matches set phase = 'play', play_start = mt.phase_ends, phase_ends = mt.phase_ends + make_interval(secs => t) where id = m;
      continue;
    end if;

    if mt.phase = 'play' then
      el := extract(epoch from now() - mt.play_start);
      -- bots whose planned moment has passed lock in (at their planned time)
      update rk_players set r_correct = plan_right, r_failed = not plan_right, r_at = plan_at
      where match_id = m and bot and not out and plan_at is not null and not r_correct and not r_failed and plan_at <= least(el, t);
      if mt.showdown and exists (select 1 from rk_players where match_id = m and not out and r_correct) then
        perform rk_end_round(m); continue;
      end if;
      -- still waiting on someone who can answer: an alive bot with a plan still to come, or a human seen in the last 10 s
      select count(*) into active_open from rk_players where match_id = m and not out and not r_correct and not r_failed
        and ((bot and plan_at is not null) or (not bot and last_seen > now() - interval '10 seconds'));
      if el >= t or active_open = 0 then perform rk_end_round(m); continue; end if;
      return;
    end if;

    if mt.phase = 'reveal' then
      if now() < mt.phase_ends then return; end if;
      if mt.finished then perform rk_game_over(m); else perform rk_next_round(m); end if;
      continue;
    end if;
  end loop;
end $$;

-- What one player sees (same shape as the unranked game's messages).
create or replace function public.rk_view(m uuid, me int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mt rk_matches; pl rk_players; el double precision := 0; t double precision := rk_conf('t'); shown int := 0; n int; pat text := ''; i int;
  players jsonb; alive int; locked int; base jsonb;
begin
  select * into mt from rk_matches where id = m;
  select * into pl from rk_players where match_id = m and pid = me;
  select count(*) into alive from rk_players where match_id = m and not out;
  select count(*) into locked from rk_players where match_id = m and not out and (r_correct or r_failed);
  select jsonb_agg(jsonb_build_object('n', name, 'a', avatar, 'bot', bot, 'out', out,
           'l', (mt.phase = 'play' and (r_correct or r_failed))) order by pid)
    into players from rk_players where match_id = m;
  base := jsonb_build_object('t','state','phase',mt.phase,'total',greatest(mt.total,(select count(*) from rk_players where match_id = m)),
    'alive',alive,'T',t,'players',players,'locked',case when mt.phase='play' then locked else 0 end,
    'now', floor(extract(epoch from now())*1000));
  if mt.phase = 'lobby' then
    return base || jsonb_build_object('startsIn', greatest(0, extract(epoch from mt.start_at - now())));
  end if;
  if mt.phase = 'over' then
    return base || jsonb_build_object('place', coalesce(pl.place,1), 'outRound', coalesce(pl.out_round,0), 'winner', mt.winner,
      'coWin', alive > 1, 'rated', mt.rated, 'ratingBefore', pl.rating_before, 'ratingAfter', pl.rating_after);
  end if;
  n := length(mt.word);
  if mt.phase = 'play' then
    el := extract(epoch from now() - mt.play_start);
    shown := least(n - 1, floor(el / (t / n))::int);
  end if;
  for i in 0 .. n-1 loop
    pat := pat || case when mt.phase = 'reveal' or (shown > 0 and i = any(mt.ord[1:shown])) then substr(mt.word, i+1, 1) else '_' end;
  end loop;
  if mt.phase = 'reveal' then pat := mt.word; end if;
  return base || jsonb_build_object('round', mt.round, 'len', n, 'hint', mt.hint, 'pattern', pat,
    'left', case when mt.phase = 'play' then greatest(0, t - el) else t end, 'showdown', mt.showdown,
    'out', pl.out,
    'correct', pl.r_correct, 'failed', pl.r_failed, 'eliminated', (mt.phase = 'reveal' and pl.elim_round = mt.round),
    'word', case when mt.phase = 'reveal' then mt.word end,
    'feed', case when mt.phase = 'reveal' then mt.feed end, 'sum', case when mt.phase = 'reveal' then mt.summary end,
    'finished', mt.finished);
end $$;

-- ---------- what players can call ----------
-- Leave a match (the Exit or Cancel button). In a lobby you're simply removed (and an empty lobby is closed).
-- Once the match has started, leaving counts as out, placed below everyone still in.
create or replace function public.rk_leave(m uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); mt rk_matches; me int;
begin
  if uid is null then return; end if;
  select * into mt from rk_matches where id = m for update;
  if not found or mt.phase = 'over' then return; end if;
  select pid into me from rk_players where match_id = m and user_id = uid and not out;
  if me is null then return; end if;
  if mt.phase = 'lobby' then
    delete from rk_players where match_id = m and pid = me;
    if not exists (select 1 from rk_players where match_id = m and not bot) then delete from rk_matches where id = m; end if;
  else
    update rk_players set out = true, out_round = mt.round, elim_round = mt.round, r_correct = false, r_failed = false,
      place = (select count(*) from rk_players where match_id = m and not out), last_seen = now() - interval '1 hour'
    where match_id = m and pid = me;
  end if;
end $$;

create or replace function public.rk_join() returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); prof profiles; mid uuid;
begin
  if uid is null then raise exception 'Sign in to play ranked.'; end if;
  select * into prof from profiles where id = uid;
  if prof.id is null then raise exception 'Pick a player name first.'; end if;
  -- back into a match you're still alive in, but only one you were in a moment ago (e.g. after a refresh).
  -- A match you walked away from (closed the app, lost signal) is not resumed: you get a fresh lobby instead.
  select p.match_id into mid from rk_players p join rk_matches x on x.id = p.match_id
    where p.user_id = uid and not p.out and x.phase <> 'over' and x.created_at > now() - interval '1 hour'
      and p.last_seen > now() - interval '15 seconds'
      and (x.phase <> 'lobby' or x.start_at > now() + interval '2 seconds')
    order by x.created_at desc limit 1;
  if mid is not null then return mid; end if;
  -- leave any older match you abandoned, so it can't pull you back later
  perform rk_leave(p.match_id) from rk_players p join rk_matches x on x.id = p.match_id
    where p.user_id = uid and not p.out and x.phase <> 'over';
  delete from rk_matches where created_at < now() - interval '2 days';
  -- join a lobby that still has someone in it and enough time left to feel like a lobby
  select x.id into mid from rk_matches x
    where x.phase = 'lobby' and x.start_at > now() + interval '5 seconds'
      and (select count(*) from rk_players p where p.match_id = x.id) < rk_conf('max')
      and exists (select 1 from rk_players p where p.match_id = x.id and not p.bot and p.last_seen > now() - interval '10 seconds')
    order by x.created_at limit 1 for update skip locked;
  if mid is null then
    insert into rk_matches (start_at) values (now() + make_interval(secs => rk_conf('lobby'))) returning id into mid;
  end if;
  insert into rk_players (match_id, pid, user_id, name, avatar)
  values (mid, (select coalesce(max(pid),0)+1 from rk_players where match_id = mid), uid, prof.username, prof.avatar);
  return mid;
end $$;

create or replace function public.rk_state(m uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me int;
begin
  select pid into me from rk_players where match_id = m and user_id = uid;
  if me is null then raise exception 'You are not in this match.'; end if;
  update rk_players set last_seen = now() where match_id = m and pid = me;
  perform rk_tick(m);
  return rk_view(m, me);
end $$;

create or replace function public.rk_guess(m uuid, g text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me int; mt rk_matches; pl rk_players; el double precision; ok boolean; is_first boolean;
begin
  select pid into me from rk_players where match_id = m and user_id = uid;
  if me is null then raise exception 'You are not in this match.'; end if;
  update rk_players set last_seen = now() where match_id = m and pid = me;
  perform rk_tick(m);                                          -- bots that answered before you count first
  select * into mt from rk_matches where id = m for update;
  select * into pl from rk_players where match_id = m and pid = me;
  if mt.phase <> 'play' or pl.out or pl.r_correct or pl.r_failed then return jsonb_build_object('t','result','late',true); end if;
  el := extract(epoch from now() - mt.play_start);
  if el > rk_conf('t') then return jsonb_build_object('t','result','late',true); end if;
  ok := upper(regexp_replace(coalesce(g,''), '[^A-Za-z]', '', 'g')) = mt.word;
  if ok then
    is_first := not exists (select 1 from rk_players where match_id = m and not out and r_correct);
    update rk_players set r_correct = true, r_at = el where match_id = m and pid = me;
  else
    update rk_players set r_failed = true, r_at = el where match_id = m and pid = me;
  end if;
  perform rk_tick(m);
  return jsonb_build_object('t','result','ok',ok,'first',coalesce(is_first,false));
end $$;

-- Only the three player functions are callable from the game; the steps above are internal.
revoke all on function public.rk_conf(text), public.rk_next_round(uuid), public.rk_end_round(uuid), public.rk_game_over(uuid),
  public.rk_tick(uuid), public.rk_view(uuid, int) from public, anon, authenticated;
revoke all on function public.rk_join(), public.rk_state(uuid), public.rk_guess(uuid, text), public.rk_leave(uuid) from public, anon;
grant execute on function public.rk_join(), public.rk_state(uuid), public.rk_guess(uuid, text), public.rk_leave(uuid) to authenticated;
