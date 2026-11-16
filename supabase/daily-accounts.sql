-- REVEAL Daily Challenge with accounts: run once in Supabase → SQL Editor (after accounts.sql). Safe to re-run.

-- 1. One Daily try per account (guests stay one per device).
create unique index if not exists daily_scores_day_user on public.daily_scores (day, user_id) where user_id is not null;

-- 2. Keep each player's device id private: the leaderboard can read every column except device.
revoke select on public.daily_scores from anon, authenticated;
grant select (id, day, name, score, solved, time_ms, user_id, created_at) on public.daily_scores to anon, authenticated;

-- 3. Signing in after playing as a guest moves today's score from this device to the account.
create or replace function public.claim_daily(p_day date, p_device text) returns void
language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  if auth.uid() is null then return; end if;
  select username into uname from public.profiles where id = auth.uid();
  if uname is null then return; end if;
  if exists (select 1 from public.daily_scores where day = p_day and user_id = auth.uid()) then return; end if;
  update public.daily_scores set user_id = auth.uid(), name = uname
   where day = p_day and device = p_device and user_id is null;
end $$;
revoke all on function public.claim_daily(date, text) from public, anon;
grant execute on function public.claim_daily(date, text) to authenticated;
