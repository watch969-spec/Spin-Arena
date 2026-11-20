-- Run this entire script in Supabase Dashboard > SQL Editor.
-- Virtual entertainment coins only. No deposits, purchases, transfers or cash-out.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.player_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 100 check (balance >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.spin_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  reward integer not null check (reward in (5,10,15,20,25,50,75,100)),
  segment integer not null check (segment between 0 and 7),
  created_at timestamptz not null default now()
);

alter table public.player_wallets enable row level security;
alter table public.spin_history enable row level security;

drop policy if exists "Players read own wallet" on public.player_wallets;
create policy "Players read own wallet" on public.player_wallets
for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Players read own spin history" on public.spin_history;
create policy "Players read own spin history" on public.spin_history
for select to authenticated using (auth.uid() = user_id);

-- Create a starter wallet for every new auth account.
create or replace function public.create_player_wallet()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.player_wallets(user_id, balance)
  values (new.id, 100)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_wallet on auth.users;
create trigger on_auth_user_created_wallet
after insert on auth.users
for each row execute function public.create_player_wallet();

-- Backfill existing accounts that were created before this script.
insert into public.player_wallets(user_id, balance)
select id, 100 from auth.users
on conflict (user_id) do nothing;

-- True only when the signed-in user has not spun during the last 24 hours.
create or replace function public.can_spin()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null and not exists (
    select 1 from public.spin_history
    where user_id = auth.uid()
      and created_at > now() - interval '24 hours'
  );
$$;

-- Server-side spin: locks wallet, checks cooldown, chooses and credits reward atomically.
create or replace function public.spin_once()
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_roll integer;
  v_reward integer;
  v_segment integer;
begin
  if v_user is null then
    raise exception 'Please sign in first.';
  end if;

  insert into public.player_wallets(user_id, balance)
  values (v_user, 100) on conflict (user_id) do nothing;

  perform 1 from public.player_wallets where user_id = v_user for update;

  if exists (
    select 1 from public.spin_history
    where user_id = v_user and created_at > now() - interval '24 hours'
  ) then
    raise exception 'You have already used your free spin. Please try again after 24 hours.';
  end if;

  -- Cryptographically strong random integer 0..7 from pgcrypto.
  v_roll := get_byte(extensions.gen_random_bytes(1), 0) % 8;
  v_segment := v_roll;
  v_reward := (array[10,20,50,100,25,5,75,15])[v_roll + 1];

  update public.player_wallets
  set balance = balance + v_reward
  where user_id = v_user;

  insert into public.spin_history(user_id, reward, segment)
  values (v_user, v_reward, v_segment);

  return jsonb_build_object('reward', v_reward, 'segment', v_segment);
end;
$$;

revoke all on function public.create_player_wallet() from public, anon, authenticated;
revoke all on function public.can_spin() from public, anon;
grant execute on function public.can_spin() to authenticated;
revoke all on function public.spin_once() from public, anon;
grant execute on function public.spin_once() to authenticated;

-- No client-side writes to wallet/history. Only the secure RPC can award coins.
revoke insert, update, delete on public.player_wallets from anon, authenticated;
revoke insert, update, delete on public.spin_history from anon, authenticated;
grant select on public.player_wallets, public.spin_history to authenticated;
