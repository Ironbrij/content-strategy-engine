import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Crown,
  Loader2,
  Sparkles,
  Ticket,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { GENERATION_LIMIT } from "@/lib/generate-content.functions";
import {
  createCheckoutSession,
  createPortalSession,
  FREE_PRICE_LABEL,
  PRO_PRICE_CADENCE,
  PRO_PRICE_LABEL,
} from "@/lib/billing.functions";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/subscription")({
  head: () => ({ meta: [{ title: "Subscription — Clarify" }] }),
  component: SubscriptionPage,
});

interface SubscriptionRow {
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}

interface RedemptionRow {
  code: string;
  access_until: string | null;
  redeemed_at: string;
}

function isStripeActive(row: SubscriptionRow | null): boolean {
  if (!row?.status) return false;
  if (row.status !== "active" && row.status !== "trialing") return false;
  if (!row.current_period_end) return true;
  return new Date(row.current_period_end).getTime() > Date.now();
}

function isRedemptionActive(row: RedemptionRow | null): boolean {
  if (!row) return false;
  if (!row.access_until) return true;
  return new Date(row.access_until).getTime() > Date.now();
}

function formatDate(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// redeem_coupon() raises bare tokens; the wording lives next to the UI.
function couponErrorMessage(raw: string): string {
  if (raw.includes("coupon_not_found")) return "That code isn't valid. Check for typos.";
  if (raw.includes("coupon_already_redeemed")) return "You've already used that code.";
  if (raw.includes("coupon_exhausted")) return "That code has been fully claimed.";
  if (raw.includes("coupon_expired")) return "That code has expired.";
  if (raw.includes("coupon_inactive")) return "That code is no longer active.";
  if (raw.includes("not_authenticated")) return "Please sign in and try again.";
  return "Couldn't apply that code. Please try again.";
}

function SubscriptionPage() {
  const navigate = useNavigate();
  const startCheckout = useServerFn(createCheckoutSession);
  const openBillingPortal = useServerFn(createPortalSession);

  const [authChecked, setAuthChecked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [used, setUsed] = useState(0);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [redemption, setRedemption] = useState<RedemptionRow | null>(null);

  const [billingPending, setBillingPending] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponPending, setCouponPending] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [{ data: usage }, { data: sub }, { data: red }] = await Promise.all([
      supabase.from("generation_usage").select("used_count").maybeSingle(),
      supabase
        .from("subscriptions")
        .select("status, current_period_end, cancel_at_period_end")
        .maybeSingle(),
      supabase
        .from("coupon_redemptions")
        .select("code, access_until, redeemed_at")
        .order("redeemed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setUsed(usage?.used_count ?? 0);
    setSubscription((sub as SubscriptionRow | null) ?? null);
    setRedemption((red as RedemptionRow | null) ?? null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate({ to: "/sign-in" });
        return;
      }
      setEmail(session.user.email ?? null);
      setAuthChecked(true);
      void refresh();
    });
  }, [navigate, refresh]);

  const stripeActive = isStripeActive(subscription);
  const couponActive = isRedemptionActive(redemption);
  const isPro = stripeActive || couponActive;

  async function redirectToStripe(
    create: (args: { data: { access_token: string } }) => Promise<{ url: string }>,
    fallback: string,
  ) {
    setBillingError(null);
    setBillingPending(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/sign-in" });
        return;
      }
      const { url } = await create({ data: { access_token: session.access_token } });
      window.location.href = url;
    } catch (error) {
      setBillingError((error as Error)?.message ?? fallback);
      setBillingPending(false);
    }
  }

  async function handleRedeemCoupon(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = couponCode.trim();
    if (!code || couponPending) return;

    setCouponError(null);
    setCouponPending(true);
    try {
      const { error } = await supabase.rpc("redeem_coupon", { p_code: code });
      if (error) {
        setCouponError(couponErrorMessage(error.message));
        return;
      }
      setCouponCode("");
      setCouponOpen(false);
      await refresh();
    } finally {
      setCouponPending(false);
    }
  }

  if (!authChecked || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-heading"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <span className="font-display text-sm font-bold">C</span>
              </div>
              <div className="font-display text-base font-bold tracking-tight text-heading">
                Clarify
              </div>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 pb-24 pt-10 sm:px-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-heading">Subscription</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {email ? `Signed in as ${email}` : "Your plan and usage"}
          </p>
        </div>

        <div
          className={
            isPro
              ? "rounded-xl border-2 border-primary bg-soft-tint/30 p-6 sm:p-8"
              : "rounded-xl border border-border bg-card p-6 sm:p-8"
          }
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                {isPro && <Crown className="h-5 w-5 text-primary" />}
                <p className="font-display text-xl font-bold text-heading">
                  {isPro ? "Pro" : "Free"}
                </p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {isPro ? "Unlimited content strategy generations" : "Your current plan"}
              </p>
            </div>
            <p className="font-display text-2xl font-extrabold text-heading">
              {isPro ? (
                <>
                  {couponActive && !stripeActive ? (
                    FREE_PRICE_LABEL
                  ) : (
                    <>
                      {PRO_PRICE_LABEL}
                      <span className="ml-1 text-xs font-medium text-muted-foreground">
                        {PRO_PRICE_CADENCE}
                      </span>
                    </>
                  )}
                </>
              ) : (
                FREE_PRICE_LABEL
              )}
            </p>
          </div>

          <dl className="mt-6 grid gap-3 border-t border-border pt-6 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Generations used</dt>
              <dd className="mt-0.5 font-medium text-heading">
                {isPro ? `${used} (unlimited)` : `${used} of ${GENERATION_LIMIT}`}
              </dd>
            </div>

            {stripeActive && (
              <>
                <div>
                  <dt className="text-muted-foreground">Unlocked by</dt>
                  <dd className="mt-0.5 font-medium text-heading">Paid subscription</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {subscription?.cancel_at_period_end ? "Access ends" : "Renews"}
                  </dt>
                  <dd className="mt-0.5 font-medium text-heading">
                    {formatDate(subscription?.current_period_end ?? null)}
                  </dd>
                </div>
                {subscription?.cancel_at_period_end && (
                  <div className="sm:col-span-2">
                    <p className="text-sm text-muted-foreground">
                      This subscription is set to cancel. You keep Pro until the date above.
                    </p>
                  </div>
                )}
              </>
            )}

            {couponActive && !stripeActive && (
              <>
                <div>
                  <dt className="text-muted-foreground">Unlocked by</dt>
                  <dd className="mt-0.5 font-medium text-heading">Coupon code</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Code</dt>
                  <dd className="mt-0.5 font-mono text-xs font-medium tracking-wide text-heading">
                    {redemption?.code}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Access</dt>
                  <dd className="mt-0.5 font-medium text-heading">
                    {redemption?.access_until
                      ? `Until ${formatDate(redemption.access_until)}`
                      : "Lifetime"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Redeemed</dt>
                  <dd className="mt-0.5 font-medium text-heading">
                    {formatDate(redemption?.redeemed_at ?? null)}
                  </dd>
                </div>
              </>
            )}
          </dl>

          <div className="mt-6 border-t border-border pt-6">
            {isPro ? (
              stripeActive ? (
                <>
                  <Button
                    onClick={() =>
                      redirectToStripe(
                        openBillingPortal,
                        "Couldn't open the billing portal. Please try again.",
                      )
                    }
                    disabled={billingPending}
                    variant="outline"
                    className="h-11 w-full bg-background px-6 font-semibold disabled:opacity-70 sm:w-auto"
                  >
                    {billingPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Opening...
                      </>
                    ) : (
                      <>
                        <CreditCard className="mr-2 h-4 w-4" />
                        Manage billing
                      </>
                    )}
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Update your card, download invoices, or cancel — handled by Stripe.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your Pro access came from a coupon, so there's no billing to manage. Nothing will
                  ever be charged.
                </p>
              )
            ) : (
              <>
                <div className="grid gap-2 text-sm text-body">
                  <p className="font-display font-semibold text-heading">Upgrade to Pro</p>
                  <ul className="mt-1 grid gap-2">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>Unlimited content strategy generations</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>Cancel anytime</span>
                    </li>
                  </ul>
                </div>

                <Button
                  onClick={() =>
                    redirectToStripe(startCheckout, "Couldn't open checkout. Please try again.")
                  }
                  disabled={billingPending}
                  className="mt-5 h-11 w-full bg-primary px-6 font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md active:scale-[0.99] disabled:opacity-70 sm:w-auto"
                >
                  {billingPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Opening secure checkout...
                    </>
                  ) : (
                    <>
                      Upgrade to Pro — {PRO_PRICE_LABEL} {PRO_PRICE_CADENCE}
                      <Sparkles className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>

                {couponOpen ? (
                  <form onSubmit={handleRedeemCoupon} className="mt-5 max-w-md">
                    <Label
                      htmlFor="coupon"
                      className="flex items-center gap-1.5 font-display text-xs font-semibold text-heading"
                    >
                      <Ticket className="h-3.5 w-3.5 text-primary" />
                      Coupon code
                    </Label>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="coupon"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        placeholder="CLARIFY-XXXX-XXXX"
                        maxLength={64}
                        autoFocus
                        autoComplete="off"
                        spellCheck={false}
                        disabled={couponPending}
                        className="h-10 flex-1 px-3 font-mono text-sm tracking-wide placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground/60"
                      />
                      <Button
                        type="submit"
                        variant="outline"
                        disabled={couponPending || !couponCode.trim()}
                        className="h-10 bg-background px-5 font-semibold disabled:opacity-60"
                      >
                        {couponPending ? (
                          <>
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            Checking...
                          </>
                        ) : (
                          "Apply"
                        )}
                      </Button>
                    </div>
                    {couponError ? (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {couponError}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Unlocks Pro immediately, with no payment.
                      </p>
                    )}
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCouponOpen(true)}
                    className="mt-3 text-xs font-medium text-primary underline-offset-2 transition-colors hover:text-primary-hover hover:underline"
                  >
                    Have a coupon code?
                  </button>
                )}
              </>
            )}

            {billingError && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {billingError}
              </p>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Past results stay in{" "}
          <Link
            to="/history"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            History
          </Link>{" "}
          on any plan.
        </p>
      </main>
    </div>
  );
}
