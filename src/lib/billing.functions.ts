import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";
import { requireEnv, stripeRequest, type StripeCheckoutSession } from "./stripe";

const inputSchema = z.object({
  access_token: z.string().min(1),
});

// Display-only labels for the plan cards. These do NOT set what anyone is
// charged -- Stripe does, from STRIPE_PRICE_ID. Change the price there (or via
// scripts/setup-stripe.mjs) and mirror it here, or override with
// VITE_PRO_PRICE_LABEL / VITE_PRO_PRICE_CADENCE.
export const FREE_PRICE_LABEL = "$0";
export const PRO_PRICE_LABEL: string = import.meta.env?.VITE_PRO_PRICE_LABEL || "$47";
export const PRO_PRICE_CADENCE: string = import.meta.env?.VITE_PRO_PRICE_CADENCE || "per month";

// Return URLs must not come from the client: a caller-supplied origin would
// turn Checkout into an open redirect. APP_URL is the deployed origin, e.g.
// https://clarify.example.com (no trailing slash).
function appOrigin(): string {
  return requireEnv("APP_URL").replace(/\/+$/, "");
}

// Validates the caller's access token against Supabase Auth and returns a
// client scoped to them, so every read below is still subject to RLS.
async function authenticate(accessToken: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  return { supabase, user: data.user };
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { supabase, user } = await authenticate(data.access_token);

    // Someone who subscribed before and lapsed already has a Stripe customer.
    // Reusing it keeps their billing history and saved card on one record
    // instead of creating a duplicate customer on every resubscribe.
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .maybeSingle();

    const session = await stripeRequest<StripeCheckoutSession>("/checkout/sessions", {
      body: {
        mode: "subscription",
        line_items: [{ price: requireEnv("STRIPE_PRICE_ID"), quantity: 1 }],
        success_url: `${appOrigin()}/?checkout=success`,
        cancel_url: `${appOrigin()}/?checkout=cancelled`,
        allow_promotion_codes: true,
        // Stamped in three places because the webhook may see any of them
        // first, and it needs to map Stripe's ids back to a Supabase user:
        // client_reference_id and metadata ride on the session,
        // subscription_data.metadata rides on the subscription itself (which
        // is what customer.subscription.* events carry).
        client_reference_id: user.id,
        metadata: { supabase_user_id: user.id },
        subscription_data: { metadata: { supabase_user_id: user.id } },
        ...(existing?.stripe_customer_id
          ? { customer: existing.stripe_customer_id }
          : { customer_email: user.email ?? undefined }),
      },
    });

    if (!session.url) {
      throw new Error("Stripe didn't return a checkout link. Please try again.");
    }

    return { url: session.url };
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { supabase } = await authenticate(data.access_token);

    const { data: existing } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .maybeSingle();

    if (!existing?.stripe_customer_id) {
      throw new Error("No billing account found for this login yet.");
    }

    const session = await stripeRequest<{ url?: string }>("/billing_portal/sessions", {
      body: {
        customer: existing.stripe_customer_id,
        return_url: `${appOrigin()}/`,
      },
    });

    if (!session.url) {
      throw new Error("Stripe didn't return a billing portal link. Please try again.");
    }

    return { url: session.url };
  });
