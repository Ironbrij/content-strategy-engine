// A minimal Stripe client built on fetch + Web Crypto rather than the `stripe`
// npm package. This app builds through nitro onto a Cloudflare-style runtime,
// where the Node SDK needs Stripe.createSubtleCryptoProvider() for async
// webhook verification; all we actually need is a few REST calls and one HMAC
// check, so doing it directly avoids both the dependency and that footgun.
//
// Server-only: every function here reads STRIPE_SECRET_KEY. Never import this
// into a component that ships to the browser.

const STRIPE_API_BASE = "https://api.stripe.com/v1";

// Stripe signs with a timestamp; reject anything older than this to blunt
// replay of a captured webhook body. Matches Stripe's own default tolerance.
const SIGNATURE_TOLERANCE_SECONDS = 300;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

// Stripe's REST API takes form-encoded bodies, with nested objects written as
// `parent[child]` and arrays as `items[0][price]`.
function appendFormValue(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendFormValue(params, `${key}[${index}]`, item));
    return;
  }
  if (typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      appendFormValue(params, `${key}[${childKey}]`, childValue);
    }
    return;
  }
  params.append(key, String(value));
}

export function toFormBody(input: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    appendFormValue(params, key, value);
  }
  return params.toString();
}

export async function stripeRequest<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {},
): Promise<T> {
  const { method = "POST", body } = options;

  const res = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${requireEnv("STRIPE_SECRET_KEY")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? toFormBody(body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    // Fall through to the !res.ok branch, or return {} for an odd-but-ok 200.
  }

  if (!res.ok) {
    const message =
      (parsed as { error?: { message?: string } })?.error?.message ??
      `Stripe request failed (${res.status})`;
    // Log the detail server-side; callers surface something friendlier.
    console.error("Stripe API error", path, res.status, message);
    throw new Error(message);
  }

  return parsed as T;
}

// --- Webhook signature verification -----------------------------------------

function parseSignatureHeader(header: string): { timestamp: number; signatures: string[] } {
  let timestamp = 0;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = Number.parseInt(value ?? "", 10);
    // v1 is the current scheme; v0 exists only for Stripe's own test tooling.
    if (key === "v1" && value) signatures.push(value);
  }
  return { timestamp, signatures };
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Length-independent, value-constant comparison, so a mismatch doesn't leak
// how many leading characters were correct.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// `rawBody` must be the exact bytes Stripe sent. Re-serialising the parsed
// JSON changes key order and whitespace, and the signature will never match.
export async function verifyStripeWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader) return false;

  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return signatures.some((candidate) => timingSafeEqual(candidate, expected));
}

// --- Narrow shapes for the handful of fields we read -------------------------

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  // Stripe moved current_period_end from the subscription onto each item in
  // API version 2025-03-31. Accounts pinned either side of that send a
  // different shape, so readers must check both (see periodEndIso).
  current_period_end?: number | null;
  items?: { data?: Array<{ current_period_end?: number | null }> };
  metadata?: Record<string, string>;
}

export interface StripeCheckoutSession {
  id: string;
  url?: string | null;
  customer?: string | null;
  subscription?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string>;
}

// Resolves the period end across both subscription shapes, as an ISO string.
export function periodEndIso(subscription: StripeSubscription): string | null {
  const seconds =
    subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end ?? null;
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}
