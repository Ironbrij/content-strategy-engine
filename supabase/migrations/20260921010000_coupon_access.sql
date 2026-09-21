-- Coupon codes that grant Pro access outright, with no payment and no Stripe
-- involvement at all. Run this in the Supabase SQL Editor after
-- 20260921000000_stripe_subscriptions.sql.

create table if not exists public.coupons (
  code text primary key,
  -- null = unlimited redemptions
  max_redemptions integer,
  redeemed_count integer not null default 0,
  -- How long the access lasts once redeemed. null = forever.
  grant_duration interval,
  -- When the code itself stops working. null = never.
  expires_at timestamptz,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.coupon_redemptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null references public.coupons(code) on delete cascade,
  -- null = lifetime access
  access_until timestamptz,
  redeemed_at timestamptz not null default now(),
  primary key (user_id, code)
);

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;

-- public.coupons deliberately has NO select policy. RLS is on and nothing is
-- granted to authenticated, so a signed-in user cannot list or probe the code
-- table -- otherwise anyone could read every code straight out of the API and
-- hand themselves free access. redeem_coupon() below is security definer, so
-- it is the only thing that can read this table.

-- Users may see which codes they personally redeemed, so the UI can say so.
create policy "Users can view their own redemptions"
  on public.coupon_redemptions
  for select
  using (auth.uid() = user_id);

grant select on public.coupon_redemptions to authenticated;
grant all on public.coupons to service_role;
grant all on public.coupon_redemptions to service_role;

create index if not exists coupon_redemptions_user_id_idx
  on public.coupon_redemptions (user_id);

-- Redeems a code for the calling user. Returns the granted access window.
-- `for update` locks the coupon row, so two people racing on the last
-- redemption of a limited code cannot both win it.
create or replace function public.redeem_coupon(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_coupon public.coupons%rowtype;
  v_access_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- Codes are handed out in print and typed by hand, so match forgivingly.
  v_code := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));

  if v_code = '' then
    raise exception 'coupon_not_found';
  end if;

  select * into v_coupon from public.coupons where code = v_code for update;

  if not found then
    raise exception 'coupon_not_found';
  end if;

  if not v_coupon.active then
    raise exception 'coupon_inactive';
  end if;

  if v_coupon.expires_at is not null and v_coupon.expires_at <= now() then
    raise exception 'coupon_expired';
  end if;

  if exists (
    select 1 from public.coupon_redemptions
    where user_id = auth.uid() and code = v_code
  ) then
    raise exception 'coupon_already_redeemed';
  end if;

  if v_coupon.max_redemptions is not null
     and v_coupon.redeemed_count >= v_coupon.max_redemptions then
    raise exception 'coupon_exhausted';
  end if;

  v_access_until := case
    when v_coupon.grant_duration is null then null
    else now() + v_coupon.grant_duration
  end;

  insert into public.coupon_redemptions (user_id, code, access_until)
  values (auth.uid(), v_code, v_access_until);

  update public.coupons
     set redeemed_count = redeemed_count + 1
   where code = v_code;

  return jsonb_build_object('code', v_code, 'access_until', v_access_until);
end;
$$;

grant execute on function public.redeem_coupon(text) to authenticated;

create or replace function public.has_coupon_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coupon_redemptions r
    where r.user_id = auth.uid()
      and (r.access_until is null or r.access_until > now())
  );
$$;

grant execute on function public.has_coupon_access() to authenticated;

-- The single question the rest of the app asks: may this account generate
-- without a cap? Paid subscription or valid coupon, either lifts it.
create or replace function public.has_pro_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_active_subscription() or public.has_coupon_access();
$$;

grant execute on function public.has_pro_access() to authenticated;

-- Third and final version of the limiter: identical contract, but the cap is
-- now lifted by Pro access from either source rather than by Stripe alone.
create or replace function public.reserve_generation_slot(p_limit integer default 3)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
  is_pro boolean;
begin
  is_pro := public.has_pro_access();

  insert into public.generation_usage (user_id, used_count, updated_at)
  values (auth.uid(), 1, now())
  on conflict (user_id) do update
    set used_count = generation_usage.used_count + 1,
        updated_at = now()
    where is_pro or generation_usage.used_count < p_limit
  returning used_count into new_count;

  if new_count is null then
    raise exception 'generation_limit_reached';
  end if;

  return new_count;
end;
$$;

grant execute on function public.reserve_generation_slot(integer) to authenticated;
