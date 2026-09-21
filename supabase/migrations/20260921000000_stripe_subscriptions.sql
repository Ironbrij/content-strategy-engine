-- Stripe subscription entitlements. A paid, active subscription lifts the
-- free generation cap added in 20260819000000_generation_usage_limit.sql.
-- This repo has no linked Supabase CLI project, so run this once in the
-- Supabase SQL Editor (after the generation-usage migration).

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  status text not null default 'incomplete',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Read-only to the owner. There is deliberately no insert/update/delete
-- policy: the Stripe webhook is the only writer, and it uses the service
-- role key (which bypasses RLS). A client can therefore see its own
-- entitlement but can never grant itself one.
drop policy if exists "Users can view their own subscription"
  on public.subscriptions;

create policy "Users can view their own subscription"
  on public.subscriptions
  for select
  using (auth.uid() = user_id);

grant select on public.subscriptions to authenticated;

-- Supabase's default privileges normally cover this, but stating it outright
-- means a misconfigured project fails at migration time rather than silently
-- dropping a paid customer's entitlement at webhook time.
grant all on public.subscriptions to service_role;

-- The webhook looks rows up by Stripe's ids, not by user_id.
create index if not exists subscriptions_stripe_customer_id_idx
  on public.subscriptions (stripe_customer_id);
create index if not exists subscriptions_stripe_subscription_id_idx
  on public.subscriptions (stripe_subscription_id);

-- True when the caller currently has a paid entitlement. Takes no argument
-- and reads auth.uid() itself, so a signed-in user can only ever ask about
-- their own status. `trialing` counts as paid; a subscription that Stripe
-- has moved to past_due/canceled/unpaid does not. current_period_end is a
-- backstop for the case where a webhook delivery is missed.
create or replace function public.has_active_subscription()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = auth.uid()
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

grant execute on function public.has_active_subscription() to authenticated;

-- Replaces the version in 20260819000000_generation_usage_limit.sql. Same
-- contract as before -- atomically reserve a slot, return the new count,
-- raise 'generation_limit_reached' at the cap -- except that an active
-- subscriber skips the cap entirely. Usage is still counted for subscribers
-- so the UI can show a lifetime total, and so the cap snaps back into place
-- by itself if the subscription later lapses.
create or replace function public.reserve_generation_slot(p_limit integer default 3)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
  is_subscribed boolean;
begin
  is_subscribed := public.has_active_subscription();

  insert into public.generation_usage (user_id, used_count, updated_at)
  values (auth.uid(), 1, now())
  on conflict (user_id) do update
    set used_count = generation_usage.used_count + 1,
        updated_at = now()
    where is_subscribed or generation_usage.used_count < p_limit
  returning used_count into new_count;

  if new_count is null then
    raise exception 'generation_limit_reached';
  end if;

  return new_count;
end;
$$;

grant execute on function public.reserve_generation_slot(integer) to authenticated;
