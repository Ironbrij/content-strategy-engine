# Stripe paywall setup

Free accounts get `GENERATION_LIMIT` (3) lifetime generations. An active Stripe
subscription lifts the cap. Enforcement lives in Postgres, not the browser, so a
tampered client gains nothing.

**No Stripe dashboard access needed.** `scripts/setup-stripe.mjs` creates the
product, price, webhook endpoint and billing portal config over the API using
only your secret key. The app uses Stripe-hosted Checkout, so the publishable
(`pk_...`) key is never needed at all.

## How it fits together

| Piece | File |
| --- | --- |
| Entitlement table, `has_active_subscription()`, updated limiter | `supabase/migrations/20260921000000_stripe_subscriptions.sql` |
| Stripe REST calls + webhook signature check | `src/lib/stripe.ts` |
| Checkout / billing-portal server functions | `src/lib/billing.functions.ts` |
| Webhook event handling | `src/lib/stripe-webhook.ts` |
| Webhook route (mounted ahead of SSR) | `src/server.ts` |
| Upgrade card, Pro badge, Billing button | `src/routes/index.tsx` |
| One-time Stripe provisioning | `scripts/setup-stripe.mjs` |

`reserve_generation_slot()` still does the counting, in one atomic upsert; it now
skips the cap when `has_active_subscription()` is true. Usage keeps incrementing
for subscribers, so if a subscription lapses the cap snaps straight back.

## 1. Run the migration

This repo has no linked Supabase CLI project, so paste
`supabase/migrations/20260921000000_stripe_subscriptions.sql` into the Supabase
SQL Editor and run it. It replaces the `reserve_generation_slot()` from the
earlier generation-limit migration, so run that one first if you haven't.

`public.subscriptions` has a select-only RLS policy and no write policy at all:
the webhook (service role) is the only writer.

## 2. Provision Stripe

Run this yourself — it reads the key from the environment rather than taking it
as an argument, so it stays out of your shell history.

```bash
STRIPE_SECRET_KEY=sk_test_... \
APP_URL=https://your-app.example.com \
PRICE_AMOUNT=2900 \
npm run setup:stripe
```

`PRICE_AMOUNT` is in the currency's smallest unit — `2900` means $29.00. Add
`PRICE_CURRENCY` (default `usd`) and `PRICE_INTERVAL` (default `month`) to
change those.

The script:

1. verifies the key and reports whether it is live or test mode
2. creates the Pro product and recurring price, tagged with a stable
   `lookup_key` so re-runs reuse it instead of creating duplicates
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
set them wherever the app is deployed, not just in local `.env`.

`APP_URL` is the origin used for Stripe's success/cancel/return URLs. It is read
from the environment rather than the request on purpose — a browser-supplied
origin would turn Checkout into an open redirect.

For local development, `stripe listen --forward-to localhost:3000/api/stripe/webhook`
gives you a webhook secret without registering a public endpoint.

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
