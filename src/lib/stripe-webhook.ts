import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_URL } from "./supabase";
import {
  periodEndIso,
  requireEnv,
  stripeRequest,
  verifyStripeWebhook,
  type StripeCheckoutSession,
  type StripeSubscription,
} from "./stripe";

// Handled in src/server.ts rather than as a file route, because signature
// verification needs the exact bytes Stripe sent -- the fetch entry is the one
// place guaranteed to see the body before anything can parse or re-encode it.
export const STRIPE_WEBHOOK_PATH = "/api/stripe/webhook";

interface StripeEvent {
  id: string;
  type: string;
  data: { object: unknown };
}

// The service role key bypasses RLS. public.subscriptions has no write policy,
// so this is the only path that can grant an entitlement -- which is the whole
// point: a client can read its subscription but never write one.
function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function upsertSubscription(
  supabase: SupabaseClient,
  userId: string,
  subscription: StripeSubscription,
): Promise<void> {
  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: subscription.customer,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_end: periodEndIso(subscription),
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    // Thrown so the handler can answer 500 and let Stripe retry -- a dropped
    // write here means someone paid and didn't get access.
    throw new Error(`Failed to store subscription: ${error.message}`);
  }
}

// Events carry the Supabase user id in metadata (stamped at checkout). A
// subscription created directly in the Stripe dashboard won't have it, so fall
// back to the customer id of a row we've already seen.
async function resolveUserId(
  supabase: SupabaseClient,
  subscription: StripeSubscription,
): Promise<string | null> {
  const fromMetadata = subscription.metadata?.supabase_user_id;
  if (fromMetadata) return fromMetadata;

  const { data } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", subscription.customer)
    .maybeSingle();

  return (data?.user_id as string | undefined) ?? null;
}

export async function handleStripeWebhook(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await request.text();

  let verified: boolean;
  try {
    verified = await verifyStripeWebhook(
      rawBody,
      request.headers.get("stripe-signature"),
      requireEnv("STRIPE_WEBHOOK_SECRET"),
    );
  } catch (error) {
    // Missing STRIPE_WEBHOOK_SECRET -- a deployment problem, not a bad caller.
    console.error("Stripe webhook is not configured", error);
    return new Response("Webhook not configured", { status: 500 });
  }

  if (!verified) {
    console.error("Rejected a Stripe webhook with an invalid signature");
    return new Response("Invalid signature", { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  try {
    const supabase = adminClient();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as StripeCheckoutSession;
        if (!session.subscription) break;

        // The session says a subscription exists but not its status or period
        // end, so read the subscription itself rather than guessing.
        const subscription = await stripeRequest<StripeSubscription>(
          `/subscriptions/${session.subscription}`,
          { method: "GET" },
        );

        const userId =
          session.metadata?.supabase_user_id ??
          session.client_reference_id ??
          subscription.metadata?.supabase_user_id ??
          null;

        if (!userId) {
          console.error("checkout.session.completed with no Supabase user id", session.id);
          break;
        }

        await upsertSubscription(supabase, userId, subscription);
        break;
      }

      // Covers renewals, upgrades, cancellations and lapses. `deleted` arrives
      // with status "canceled", which has_active_subscription() excludes, so
      // the free cap comes back on its own.
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as StripeSubscription;
        const userId = await resolveUserId(supabase, subscription);

        if (!userId) {
          console.error(`${event.type} could not be mapped to a user`, subscription.id);
          break;
        }

        await upsertSubscription(supabase, userId, subscription);
        break;
      }

      default:
        // Everything else is acknowledged and ignored; Stripe sends plenty we
        // haven't subscribed to caring about.
        break;
    }
  } catch (error) {
    console.error("Stripe webhook handler failed", event.type, error);
    // 500 asks Stripe to retry with backoff.
    return new Response("Webhook handler failed", { status: 500 });
  }

  // Anything we reached here on is settled -- 200 stops the retries.
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
