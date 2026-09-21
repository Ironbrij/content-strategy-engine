#!/usr/bin/env node
/**
 * One-time Stripe setup, done entirely through the API.
 *
 * Everything the Stripe dashboard would be used for -- creating the Pro
 * product and price, registering the webhook endpoint, and enabling the
 * customer billing portal -- is done here with just STRIPE_SECRET_KEY. Run it
 * yourself; it reads the key from the environment and never takes it as an
 * argument, so the key stays out of your shell history.
 *
 *   STRIPE_SECRET_KEY=sk_test_... \
 *   APP_URL=https://your-app.example.com \
 *   PRICE_AMOUNT=2900 \
 *   node scripts/setup-stripe.mjs
 *
 * It is idempotent: re-running reuses whatever already exists rather than
 * creating duplicates. Pass --recreate-webhook to replace the webhook endpoint
 * (the only way to obtain a fresh signing secret -- see below).
 *
 * At the end it prints the env vars to set. Set them wherever the app is
 * deployed, not just in a local .env.
 */

const API = "https://api.stripe.com/v1";

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const APP_URL = (process.env.APP_URL ?? "").replace(/\/+$/, "");
const PRICE_AMOUNT = process.env.PRICE_AMOUNT;
const PRICE_CURRENCY = (process.env.PRICE_CURRENCY ?? "usd").toLowerCase();
const PRICE_INTERVAL = process.env.PRICE_INTERVAL ?? "month";
const PRODUCT_NAME = process.env.PRODUCT_NAME ?? "Clarify Pro";

// Stable handle so re-runs find the price we made last time instead of
// stacking up near-identical ones.
const LOOKUP_KEY = process.env.PRICE_LOOKUP_KEY ?? "clarify_pro";

const RECREATE_WEBHOOK = process.argv.includes("--recreate-webhook");

const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

function fail(message) {
  console.error(`\n  error  ${message}\n`);
  process.exit(1);
}

if (!SECRET_KEY) fail("STRIPE_SECRET_KEY is not set.");
if (!SECRET_KEY.startsWith("sk_") && !SECRET_KEY.startsWith("rk_")) {
  fail(
    "STRIPE_SECRET_KEY should start with sk_ (or rk_ for a restricted key).\n" +
      "         A pk_... value is the publishable key, which can't create anything.",
  );
}
if (!APP_URL) fail("APP_URL is not set (e.g. https://your-app.example.com).");
if (!/^https?:\/\//.test(APP_URL)) fail(`APP_URL must include the scheme; got "${APP_URL}".`);

function formBody(input, prefix = "") {
  const params = new URLSearchParams();
  const walk = (key, value) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(`${key}[${i}]`, item));
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(`${key}[${k}]`, v);
      return;
    }
    params.append(key, String(value));
  };
  for (const [k, v] of Object.entries(input)) walk(prefix ? `${prefix}[${k}]` : k, v);
  return params.toString();
}

async function stripe(path, { method = "POST", body, query } = {}) {
  const url = `${API}${path}${query ? `?${formBody(query)}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? formBody(body) : undefined,
  });

  const text = await res.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    /* handled below */
  }

  if (!res.ok) {
    const detail = parsed?.error?.message ?? `HTTP ${res.status}`;
    fail(`Stripe rejected ${method} ${path}\n         ${detail}`);
  }
  return parsed;
}

const step = (n, label) => console.log(`\n[${n}/4] ${label}`);

// --- 1. Confirm the key works, and say which mode we're in ------------------

step(1, "Checking the API key");

// /v1/balance is the cheapest authenticated read that every key can do.
await stripe("/balance", { method: "GET" });
const livemode = SECRET_KEY.startsWith("sk_live") || SECRET_KEY.startsWith("rk_live");
console.log(`      key works - ${livemode ? "LIVE mode (real charges)" : "test mode"}`);

// --- 2. Product + recurring price -------------------------------------------

step(2, "Product and price");

const existingPrices = await stripe("/prices", {
  method: "GET",
  query: { lookup_keys: [LOOKUP_KEY], limit: 1, active: true },
});

let price = existingPrices.data?.[0];

if (price) {
  console.log(`      reusing existing price ${price.id} (lookup_key "${LOOKUP_KEY}")`);
} else {
  if (!PRICE_AMOUNT) {
    fail(
      "PRICE_AMOUNT is not set, and no price exists yet.\n" +
        "         Set it in the currency's smallest unit -- 2900 means $29.00 for usd.",
    );
  }
  if (!/^\d+$/.test(PRICE_AMOUNT)) {
    fail(`PRICE_AMOUNT must be a whole number of minor units; got "${PRICE_AMOUNT}".`);
  }

  const product = await stripe("/products", {
    body: {
      name: PRODUCT_NAME,
      description: "Unlimited content strategy generations",
      metadata: { app: "clarify-content-engine" },
    },
  });
  console.log(`      created product ${product.id} (${PRODUCT_NAME})`);

  price = await stripe("/prices", {
    body: {
      product: product.id,
      unit_amount: PRICE_AMOUNT,
      currency: PRICE_CURRENCY,
      recurring: { interval: PRICE_INTERVAL },
      lookup_key: LOOKUP_KEY,
      metadata: { app: "clarify-content-engine" },
    },
  });

  const display = (Number(PRICE_AMOUNT) / 100).toFixed(2);
  console.log(
    `      created price ${price.id} - ${display} ${PRICE_CURRENCY.toUpperCase()}/${PRICE_INTERVAL}`,
  );
}

// --- 3. Webhook endpoint -----------------------------------------------------

step(3, "Webhook endpoint");

const webhookUrl = `${APP_URL}/api/stripe/webhook`;
const endpoints = await stripe("/webhook_endpoints", { method: "GET", query: { limit: 100 } });
let endpoint = endpoints.data?.find((e) => e.url === webhookUrl);
let webhookSecret = null;

if (endpoint && RECREATE_WEBHOOK) {
  await stripe(`/webhook_endpoints/${endpoint.id}`, { method: "DELETE" });
  console.log(`      deleted old endpoint ${endpoint.id}`);
  endpoint = null;
}

if (endpoint) {
  // Stripe returns the signing secret only in the create response, so an
  // existing endpoint's secret can't be read back here.
  console.log(`      endpoint already exists: ${endpoint.id}`);
  console.log(`      its signing secret cannot be read back through the API.`);
  console.log(`      re-run with --recreate-webhook to replace it and get a fresh one.`);

  const missing = WEBHOOK_EVENTS.filter((e) => !(endpoint.enabled_events ?? []).includes(e));
  if (missing.length) {
    await stripe(`/webhook_endpoints/${endpoint.id}`, {
      body: { enabled_events: WEBHOOK_EVENTS },
    });
    console.log(`      added missing events: ${missing.join(", ")}`);
  }
} else {
  endpoint = await stripe("/webhook_endpoints", {
    body: {
      url: webhookUrl,
      enabled_events: WEBHOOK_EVENTS,
      description: "Clarify content engine - subscription entitlements",
    },
  });
  webhookSecret = endpoint.secret;
  console.log(`      created endpoint ${endpoint.id}`);
  console.log(`      -> ${webhookUrl}`);
}

// --- 4. Customer billing portal ---------------------------------------------

step(4, "Customer billing portal");

// The "Billing" button calls /v1/billing_portal/sessions, which fails outright
// if the account has no default portal configuration -- normally created by
// visiting the dashboard once. Create one over the API instead.
const configs = await stripe("/billing_portal/configurations", {
  method: "GET",
  query: { limit: 1, is_default: true },
});

if (configs.data?.length) {
  console.log(`      default portal configuration already set (${configs.data[0].id})`);
} else {
  const config = await stripe("/billing_portal/configurations", {
    body: {
      business_profile: { headline: "Manage your Clarify subscription" },
      features: {
        customer_update: { enabled: true, allowed_updates: ["email", "address"] },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "at_period_end" },
      },
    },
  });
  console.log(`      created default portal configuration ${config.id}`);
}

// --- Summary -----------------------------------------------------------------

console.log("\n" + "-".repeat(68));
console.log("Set these where the app is deployed:\n");
console.log(`  STRIPE_SECRET_KEY=${SECRET_KEY.slice(0, 11)}...   (the key you just used)`);
console.log(`  STRIPE_PRICE_ID=${price.id}`);
if (webhookSecret) {
  console.log(`  STRIPE_WEBHOOK_SECRET=${webhookSecret}`);
} else {
  console.log(`  STRIPE_WEBHOOK_SECRET=<unchanged - see step 3>`);
}
console.log(`  APP_URL=${APP_URL}`);
console.log(`  SUPABASE_SERVICE_ROLE_KEY=<from Supabase project settings -> API>`);
console.log("\nStill to do by hand, in the Supabase SQL Editor:");
console.log("  1. migrations/20260819000000_generation_usage_limit.sql");
console.log("  2. migrations/20260921000000_stripe_subscriptions.sql");
console.log("  3. migrations/20260921010000_coupon_access.sql");
console.log("     run in order - each one replaces the previous limiter");
console.log("  4. your coupon codes INSERT, if you want codes");
console.log("-".repeat(68));
if (webhookSecret) {
  console.log("\nThe signing secret above is shown once. Store it now; don't commit it.");
}
console.log();
