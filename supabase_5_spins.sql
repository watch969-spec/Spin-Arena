-- Spin Arena: install a separate v2 daily-limit system.
-- This avoids changing the return types or schema of your older functions/tables.
-- Uses existing tables: player_wallets(user_id, balance)
-- and spin_history(user_id, reward, created_at).

create table if not exists public.spin_daily_limits_v2 (
  user_id uuid not null references auth.users(id) on delete cascade,
  spin_date date not null,
  spins_used integer not null default 0 check (spins_used between 0 and 5),
  primary key (user_id, spin_date)
);

alter table public.spin_daily_limits_v2 enable row level security;

drop policy if exists "Players read own spin daily limits v2"
  on public.spin_daily_limits_v2;
create policy "Players read own spin daily limits v2"
  on public.spin_daily_limits_v2
  for select to authenticated
  using (auth.uid() = user_id);

grant select on public.spin_daily_limits_v2 to authenticated;

-- Status function: returns the count for the current India calendar day.
create or replace function public.get_daily_spin_status_v2()
returns table(spins_used integer, spins_left integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_used integer;
begin
  if auth.uid() is null then
    raise exception 'Please login first';
  end if;

  insert into public.spin_daily_limits_v2(user_id, spin_date, spins_used)
  values (auth.uid(), v_today, 0)
  on conflict (user_id, spin_date) do nothing;

  select d.spins_used into v_used
  from public.spin_daily_limits_v2 as d
  where d.user_id = auth.uid() and d.spin_date = v_today;

  return query select v_used, greatest(0, 5 - v_used);
end;
$$;

-- Spin function: the database, not the browser, enforces five spins per India day.
-- Segment/reward order matches the labels in index.html: 10,20,50,100,25,5,75,15.
create or replace function public.spin_once_v2()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_used integer;
  v_segment integer;
  v_reward integer;
  v_balance bigint;
  v_rewards integer[] := array[10,20,50,100,25,5,75,15];
begin
  if v_uid is null then
    raise exception 'Please login first';
  end if;

  -- Ensure a wallet exists without overwriting an existing user's balance.
  insert into public.player_wallets(user_id, balance)
  values (v_uid, 0)
  on conflict (user_id) do nothing;

  insert into public.spin_daily_limits_v2(user_id, spin_date, spins_used)
  values (v_uid, v_today, 0)
  on conflict (user_id, spin_date) do nothing;

  -- Row lock prevents two simultaneous requests using the same remaining spin.
  select d.spins_used into v_used
  from public.spin_daily_limits_v2 as d
  where d.user_id = v_uid and d.spin_date = v_today
  for update;

  if v_used >= 5 then
    raise exception 'Daily limit reached. You can spin only 5 times per day.';
  end if;

  v_segment := floor(random() * 8)::integer;
  v_reward := v_rewards[v_segment + 1];

  update public.spin_daily_limits_v2
  set spins_used = spins_used + 1
  where user_id = v_uid and spin_date = v_today;

  update public.player_wallets
  set balance = balance + v_reward
  where user_id = v_uid
  returning balance into v_balance;

  insert into public.spin_history(user_id, reward)
  values (v_uid, v_reward);

  return jsonb_build_object(
    'reward', v_reward,
    'segment', v_segment,
    'balance', v_balance,
    'spins_used', v_used + 1,
    'spins_left', greatest(0, 4 - v_used)
  );
end;
$$;

revoke all on function public.get_daily_spin_status_v2() from public;
revoke all on function public.spin_once_v2() from public;
grant execute on function public.get_daily_spin_status_v2() to authenticated;
grant execute on function public.spin_once_v2() to authenticated;

notify pgrst, 'reload schema';
