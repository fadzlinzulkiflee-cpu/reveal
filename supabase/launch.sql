-- REVEAL launch prep: run once in Supabase → SQL Editor → New query → Run (after accounts.sql and ranked.sql).
-- Safe to re-run.

-- 1. Daily leaderboard nicknames (guests type any name): block rude words.
--    Long words are blocked anywhere in the name; short ones only as a whole word (so "Grace" and "Dickson" are fine).
--    Repeated letters count once ("fuuuck"). Digits/symbols that stand in for letters (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, $→s, @→a) are read as those letters.
create or replace function public.reveal_nick_ok(n text) returns boolean
language sql immutable as $$
  with t as (select lower(translate(coalesce(n,''), '013457$@', 'oieastsa')) s)
  select not exists (
           select 1 from t, unnest(array[
             'fuck','shit','cunt','bitch','nigg','fagg','whore','porn','penis','vagina',
             'pukimak','puki','kontol','lancau','butoh','bangsat'
           ]) w where regexp_replace(t.s, '[^a-z]', '', 'g') like '%' || w || '%'
                   or regexp_replace(regexp_replace(t.s, '[^a-z]', '', 'g'), '(.)\1+', '\1', 'g') like '%' || w || '%')   -- "fuuuck"
     and not exists (
           select 1 from t, unnest(array[
             'anal','dick','rape','babi','sial','slut','nazi','pantat','jubur','keparat','sex','fag','ass','cock','tits'
           ]) w where w = any(regexp_split_to_array(t.s, '[^a-z]+')))
$$;
alter table public.daily_scores drop constraint if exists daily_scores_name_ok;
alter table public.daily_scores add constraint daily_scores_name_ok check (public.reveal_nick_ok(name)) not valid;

-- 2. "Delete my account": a signed-in player removes their account and everything linked to it.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  delete from public.daily_scores where user_id = uid;          -- their Daily scores
  update public.rk_players set name = 'Deleted player', avatar = null where user_id = uid;   -- old ranked matches keep no name
  delete from auth.users where id = uid;                         -- the login; the profile is removed with it (cascade)
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
