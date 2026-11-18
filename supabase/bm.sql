-- REVEAL Bahasa Melayu: run once in Supabase → SQL Editor → New query → Run (after daily-accounts.sql, ranked.sql
-- and online.sql). Safe to re-run. Run it BEFORE merging the BM pull request: the game then asks for a language.
--
-- 1. Daily Play: BM has its own 10 words a day and its own leaderboard. One try per device / account per language.
-- 2. Ranked: BM players get BM lobbies and BM words. BM ranked words go into rk_words with lang = 'ms' from the
--    private word file (never in this repo). Until those are loaded, a BM player is put in an English lobby.
--    Rating stays one rating for both languages.

-- ---------- 1. Daily ----------
alter table public.daily_scores add column if not exists lang text not null default 'en';
alter table public.daily_scores drop constraint if exists daily_scores_lang_ok;
alter table public.daily_scores add constraint daily_scores_lang_ok check (lang in ('en','ms'));

-- one row per device per day per language (was: per device per day)
alter table public.daily_scores drop constraint if exists daily_scores_day_device_key;
create unique index if not exists daily_scores_day_device_lang on public.daily_scores (day, device, lang);
drop index if exists public.daily_scores_day_user;
create unique index if not exists daily_scores_day_user_lang on public.daily_scores (day, user_id, lang) where user_id is not null;
create index if not exists daily_scores_board on public.daily_scores (day, lang, score desc);

revoke select on public.daily_scores from anon, authenticated;
grant select (id, day, lang, name, score, solved, time_ms, user_id, created_at) on public.daily_scores to anon, authenticated;

drop function if exists public.claim_daily(date, text);
create or replace function public.claim_daily(p_day date, p_device text, p_lang text default 'en') returns void
language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  if auth.uid() is null then return; end if;
  select username into uname from public.profiles where id = auth.uid();
  if uname is null then return; end if;
  if exists (select 1 from public.daily_scores where day = p_day and lang = p_lang and user_id = auth.uid()) then return; end if;
  update public.daily_scores set user_id = auth.uid(), name = uname
   where day = p_day and lang = p_lang and device = p_device and user_id is null;
end $$;
revoke all on function public.claim_daily(date, text, text) from public, anon;
grant execute on function public.claim_daily(date, text, text) to authenticated;

-- ---------- 2. Ranked ----------
alter table public.rk_words add column if not exists lang text not null default 'en';
alter table public.rk_words drop constraint if exists rk_words_lang_ok;
alter table public.rk_words add constraint rk_words_lang_ok check (lang in ('en','ms'));
alter table public.rk_words drop constraint if exists rk_words_word_key;       -- the same word may be in both languages
create unique index if not exists rk_words_lang_word on public.rk_words (lang, word);

alter table public.rk_matches add column if not exists lang text not null default 'en';

-- next word: from the match's language
create or replace function public.rk_next_round(m uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mt rk_matches; w rk_words; n int; alive int; b record; r double precision; s double precision; miss double precision; wrong double precision;
begin
  select * into mt from rk_matches where id = m;
  select count(*) into alive from rk_players where match_id = m and not out;
  select * into w from rk_words where lang = mt.lang and not (id = any(mt.used)) order by random() limit 1;
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

-- join: same as before, plus the language. English players call rk_join() as before.
drop function if exists public.rk_join();
create or replace function public.rk_join(p_lang text default 'en') returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); prof profiles; mid uuid; lg text := case when p_lang = 'ms' then 'ms' else 'en' end;
begin
  if uid is null then raise exception 'Sign in to play ranked.'; end if;
  select * into prof from profiles where id = uid;
  if prof.id is null then raise exception 'Pick a player name first.'; end if;
  -- no BM ranked words loaded yet: play in English rather than end the match at once
  if not exists (select 1 from rk_words where lang = lg) then lg := 'en'; end if;
  -- back into a match you're still alive in, but only one you were in a moment ago (e.g. after a refresh).
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
  -- join a lobby in your language that still has someone in it and enough time left to feel like a lobby
  select x.id into mid from rk_matches x
    where x.phase = 'lobby' and x.lang = lg and x.start_at > now() + interval '5 seconds'
      and (select count(*) from rk_players p where p.match_id = x.id) < rk_conf('max')
      and exists (select 1 from rk_players p where p.match_id = x.id and not p.bot and p.last_seen > now() - interval '10 seconds')
    order by x.created_at limit 1 for update skip locked;
  if mid is null then
    insert into rk_matches (start_at, lang) values (now() + make_interval(secs => rk_conf('lobby')), lg) returning id into mid;
  end if;
  insert into rk_players (match_id, pid, user_id, name, avatar)
  values (mid, (select coalesce(max(pid),0)+1 from rk_players where match_id = mid), uid, prof.username, prof.avatar);
  return mid;
end $$;
revoke all on function public.rk_next_round(uuid) from public, anon, authenticated;
revoke all on function public.rk_join(text) from public, anon;
grant execute on function public.rk_join(text) to authenticated;
