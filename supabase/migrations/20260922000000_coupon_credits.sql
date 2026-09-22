-- Switches the model from "free tier + coupons that grant unlimited access" to
-- "no free tier + coupons that grant a fixed number of generations".
--
-- Free accounts now get nothing: the paywall shows on first login. A coupon
-- grants a set number of generations (not unlimited, not time-based access),
-- and a paid subscription is still the only route to unlimited.
--
-- Run in the Supabase SQL Editor, after 20260921010000_coupon_access.sql.

-- How many generations a code hands out. Kept nullable so an older row that
-- predates this migration is obvious rather than silently worth zero.
alter table public.coupons
  add column if not exists grant_credits integer;

-- Recorded per redemption rather than read back through the coupon, so that
-- changing a code's value later never retroactively alters what someone was
-- already given.
alter table public.coupon_redemptions
  add column if not exists credits_granted integer;

-- Existing codes were written under the unlimited-access model. Convert them to
-- the new one rather than leaving them worth nothing.
update public.coupons
   set grant_credits = 3,
       grant_duration = null,
       max_redemptions = null
 where grant_credits is null;

update public.coupon_redemptions
   set credits_granted = 3
 where credits_granted is null;

-- Total generations this account has been granted by codes. access_until is
-- still honoured, so a code can hand out credits that expire if you ever want
-- that; a null access_until means the credits simply don't expire.
create or replace function public.coupon_credits()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(r.credits_granted, 0)), 0)::integer
    from public.coupon_redemptions r
   where r.user_id = auth.uid()
     and (r.access_until is null or r.access_until > now());
$$;

grant execute on function public.coupon_credits() to authenticated;

-- Pro is now subscription-only. A coupon buys generations, not Pro -- that
-- distinction is the whole point of the new model, so has_pro_access() no
-- longer consults coupons.
create or replace function public.has_pro_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_active_subscription();
$$;

grant execute on function public.has_pro_access() to authenticated;

-- One code per account, ever. The per-code check that used to live here is now
-- redundant, but the account-level rule is what the UI promises ("no more
-- codes" once one is used), and the server has to mean it -- hiding the input
-- is not enforcement.
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
  v_credits integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));

  if v_code = '' then
    raise exception 'coupon_not_found';
  end if;

  if exists (select 1 from public.coupon_redemptions where user_id = auth.uid()) then
    raise exception 'coupon_already_used_on_account';
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

  -- null max_redemptions means the code is shareable: any number of accounts
  -- may claim it, each getting its credits once.
  if v_coupon.max_redemptions is not null
     and v_coupon.redeemed_count >= v_coupon.max_redemptions then
    raise exception 'coupon_exhausted';
  end if;

  v_credits := coalesce(v_coupon.grant_credits, 0);
  v_access_until := case
    when v_coupon.grant_duration is null then null
    else now() + v_coupon.grant_duration
  end;

  insert into public.coupon_redemptions (user_id, code, access_until, credits_granted)
  values (auth.uid(), v_code, v_access_until, v_credits);

  update public.coupons
     set redeemed_count = redeemed_count + 1
   where code = v_code;

  return jsonb_build_object('code', v_code, 'credits', v_credits, 'access_until', v_access_until);
end;
$$;

grant execute on function public.redeem_coupon(text) to authenticated;

-- p_limit now defaults to 0: there is no free allowance, and everything a
-- non-subscriber may do comes from coupon credits.
create or replace function public.reserve_generation_slot(p_limit integer default 0)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
  is_pro boolean;
  allowance integer;
begin
  is_pro := public.has_active_subscription();
  allowance := coalesce(p_limit, 0) + public.coupon_credits();

  -- ON CONFLICT only fires when a row already exists, so with a zero allowance
  -- a first-time caller would otherwise slip through and get one generation
  -- free. The cap has to be checked before the insert as well as inside it.
  if not is_pro and allowance < 1 then
    raise exception 'generation_limit_reached';
  end if;

  insert into public.generation_usage (user_id, used_count, updated_at)
  values (auth.uid(), 1, now())
  on conflict (user_id) do update
    set used_count = generation_usage.used_count + 1,
        updated_at = now()
    where is_pro or generation_usage.used_count < allowance
  returning used_count into new_count;

  if new_count is null then
    raise exception 'generation_limit_reached';
  end if;

  return new_count;
end;
$$;

grant execute on function public.reserve_generation_slot(integer) to authenticated;
