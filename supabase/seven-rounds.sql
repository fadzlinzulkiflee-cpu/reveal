-- REVEAL: 7 rounds per Ranked match (Lin, 22 Nov 2026). Run once in Supabase → SQL Editor → New query → Run.
-- Only changes the settings function. It does not touch players, ratings, matches or ranked words. Safe to re-run.
create or replace function public.rk_conf(k text) returns double precision language sql immutable as $$
  select case k
    when 'lobby' then 20      -- seconds a lobby waits for players
    when 'max' then 20        -- players per match
    when 'fill' then 10       -- bots fill the match up to this many players
    when 't' then 20          -- seconds per word
    when 'countdown' then 3.4 -- 3-2-1-GO
    when 'reveal' then 4      -- pause on the answer between rounds
    when 'rounds' then 7      -- after this many words, everyone left wins together (was 30)
    when 'k' then 32          -- ELO K factor
    when 'min_real' then 3    -- signed-in players needed for a rated match
  end $$;
