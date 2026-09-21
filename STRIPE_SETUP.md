# Paywall setup

Free accounts get `GENERATION_LIMIT` (3) lifetime generations. Pro lifts the cap,
either by paying through Stripe or by redeeming a coupon code. Enforcement lives
in Postgres, not the browser, so a tampered client gains nothing.

**No Stripe dashboard access needed.** `scripts/setup-stripe.mjs` creates the
product, price, webhook endpoint and billing portal config over the API using
only your secret key. The app uses Stripe-hosted Checkout, so the publishable
(`pk_...`) key is never needed at all.

## Plans

| Plan | Price | Generations |
| --- | --- | --- |
| Free | $0 | 3, lifetime |
| Pro | $27 / month | Unlimited |
| Coupon | $0 | Unlimited, no payment step |

The prices on the upgrade card come from `FREE_PRICE_LABEL` / `PRO_PRICE_LABEL`
in `src/lib/billing.functions.ts`. Those are **labels only** — what anyone is
actually charged comes from `STRIPE_PRICE_ID`. Change the price in Stripe and
mirror the label, or override with `VITE_PRO_PRICE_LABEL`.

## How it fits together

| Piece | File |
| --- | --- |
| Subscriptions table, `has_active_subscription()` | `supabase/migrations/20260921000000_stripe_subscriptions.sql` |
| Coupons, `redeem_coupon()`, `has_pro_access()`, final limiter | `supabase/migrations/20260921010000_coupon_access.sql` |
| Stripe REST calls + webhook signature check | `src/lib/stripe.ts` |
| Checkout / billing-portal server functions | `src/lib/billing.functions.ts` |
| Webhook event handling | `src/lib/stripe-webhook.ts` |
| Webhook route (mounted ahead of SSR) | `src/server.ts` |
| Plan cards, coupon box, Pro badge, Billing button | `src/routes/index.tsx` |
| One-time Stripe provisioning | `scripts/setup-stripe.mjs` |

`reserve_generation_slot()` still does the counting, in one atomic upsert; it
skips the cap when `has_pro_access()` is true. Usage keeps incrementing for Pro
users, so if a subscription lapses or a timed coupon runs out, the cap snaps
straight back.

## 1. Run the migrations

This repo has no linked Supabase CLI project, so paste these into the Supabase
SQL Editor and run them **in order**:

1. `supabase/migrations/20260819000000_generation_usage_limit.sql` (if you
   haven't already)
2. `supabase/migrations/20260921000000_stripe_subscriptions.sql`
3. `supabase/migrations/20260921010000_coupon_access.sql`

Each one replaces `reserve_generation_slot()` with a wider version, so the order
matters — running them out of order leaves an older definition in place.

RLS notes:

- `public.subscriptions` is select-only for its owner, with **no** write policy.
  The Stripe webhook (service role) is its only writer.
- `public.coupons` has RLS on and **no** policy at all, so no signed-in user can
  list or probe your codes. `redeem_coupon()` is `security definer`, which is the
  only way in.

## 2. Provision Stripe

Run this yourself. It reads the key from the environment rather than taking it as
an argument, so it stays out of your shell history. **Never paste a secret key
into a chat or commit it.**

PowerShell (Windows):

```powershell
$env:STRIPE_SECRET_KEY="sk_test_..."; $env:APP_URL="https://your-app.example.com"; $env:PRICE_AMOUNT="2700"; npm run setup:stripe
```

bash / macOS / Linux:

```bash
STRIPE_SECRET_KEY=sk_test_... APP_URL=https://your-app.example.com PRICE_AMOUNT=2700 npm run setup:stripe
```

`PRICE_AMOUNT` is in the currency's smallest unit — `2700` means $27.00. Add
`PRICE_CURRENCY` (default `usd`) and `PRICE_INTERVAL` (default `month`) to change
those.

The script:

1. verifies the key and reports whether it is live or test mode
2. creates the Pro product and recurring price, tagged with a stable `lookup_key`
   so re-runs reuse it instead of creating duplicates
3. registers the webhook endpoint at `APP_URL/api/stripe/webhook` with the four
   events below, and prints the signing secret
4. creates a default customer-portal configuration, without which the Billing
   button's `billing_portal/sessions` call fails on an account that has never
   been set up through the dashboard

It then prints the env vars to set. Re-running is safe.

Subscribed events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

> Stripe returns a webhook signing secret **only** when the endpoint is created.
> If the endpoint already exists, the script can't read its secret back — re-run
> with `npm run setup:stripe -- --recreate-webhook` to replace the endpoint and
> get a fresh one.

## 3. Set the environment variables

See `.env.example`. All of `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`,
`STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` and `APP_URL` are required;
set them **wherever the app is deployed**, not just in a local `.env`. A local
`.env` only affects `npm run dev` on your own machine.

`APP_URL` is the origin used for Stripe's success/cancel/return URLs. It is read
from the environment rather than the request on purpose — a browser-supplied
origin would turn Checkout into an open redirect.

## 4. Coupon codes

Codes grant Pro outright: no Stripe customer, no subscription, no payment step.
A coupon user sees the Pro badge but no Billing button, since there is nothing
for the portal to manage.

Create a batch in the SQL Editor:

```sql
insert into public.coupons (code, max_redemptions, grant_duration, note) values
  ('CLARIFY-ABCD-EFGH', 1, null, 'launch batch'),
  ('CLARIFY-IJKL-MNOP', 1, null, 'launch batch');
```

- `max_redemptions` — `1` for a single-use code, `null` for unlimited.
- `grant_duration` — `null` for lifetime access, or an interval such as
  `'30 days'::interval` / `'1 year'::interval` for timed access.
- `expires_at` — optional; when the *code* stops being redeemable, regardless of
  how much access it would have granted.

Codes are matched case-insensitively with whitespace stripped, so `clarify-abcd-efgh`
and `CLARIFY ABCD EFGH` both work.

See who redeemed what:

```sql
select c.code, c.redeemed_count, c.max_redemptions, r.user_id, r.redeemed_at
  from public.coupons c
  left join public.coupon_redemptions r on r.code = c.code
 order by c.created_at;
```

Disable a code without deleting it (existing redemptions keep working):

```sql
update public.coupons set active = false where code = 'CLARIFY-ABCD-EFGH';
```

Revoke someone's access:

```sql
delete from public.coupon_redemptions where user_id = '<uuid>';
```

## 5. Testing

Use **test mode** keys (`sk_test_...`) first — nothing is really charged.

**Coupon path** (no Stripe needed at all):

1. Sign in, generate 3 times to hit the cap.
2. Enter a code in the box at the bottom of the paywall, press Apply.
3. The card should be replaced by the form, with "Pro — unlimited generations"
   under the button.

**Stripe path:**

1. Hit the cap, click Upgrade to Pro.
2. Pay with test card `4242 4242 4242 4242`, any future expiry, any CVC.
3. You land back on `/?checkout=success`; the page polls for a few seconds while
   the webhook lands, then flips to Pro.

If it stays capped after paying, the webhook is the thing to check — the Stripe
webhook endpoint's delivery log shows the response your app gave. A 400 means the
signing secret doesn't match; a 500 means `SUPABASE_SERVICE_ROLE_KEY` is missing
or the migration hasn't been run.

Locally, `stripe listen --forward-to localhost:3000/api/stripe/webhook` gives you
a webhook secret without registering a public endpoint.

## Notes

- **Raw body.** Signature verification needs the exact bytes Stripe signed, so
  the webhook is answered in `src/server.ts` before the SSR handler can touch the
  body. That is also why it isn't a file route.
- **No `stripe` package.** This app builds through nitro onto Cloudflare Workers,
  where the Node SDK needs a special crypto provider for webhook verification.
  `src/lib/stripe.ts` uses `fetch` + Web Crypto instead. Verified after building:
  none of it reaches the browser bundle.
- **Period end moved.** Stripe relocated `current_period_end` from the
  subscription onto its items in API version 2025-03-31. `periodEndIso()` reads
  both shapes, so either account pinning works.
- **Checkout beats the webhook.** Stripe redirects back the instant payment
  succeeds, often before the webhook lands, so the page polls the entitlement for
  a few seconds after `?checkout=success` instead of showing a paid user the cap.
