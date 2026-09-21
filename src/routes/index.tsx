import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Brain,
  CheckCircle2,
  Circle,
  CreditCard,
  Crown,
  Ticket,
  Flame,
  Heart,
  Loader2,
  LogOut,
  Megaphone,
  PencilLine,
  ScrollText,
  Send,
  Shapes,
  Sparkles,
  Target,
  Video,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyButton } from "@/components/copy-button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  generateContent,
  GENERATION_LIMIT,
  type GenerateResult,
  type StoryItem,
  type MetaphorItem,
  type ParableItem,
} from "@/lib/generate-content.functions";
import {
  createCheckoutSession,
  FREE_PRICE_LABEL,
  PRO_PRICE_CADENCE,
  PRO_PRICE_LABEL,
} from "@/lib/billing.functions";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { downloadStrategyPdf } from "@/lib/pdf-export";
import { Download } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "6 Months Content Automation — Clarify" },
      { name: "description", content: "Generate a 6-month content strategy from your client avatar." },
    ],
  }),
  component: Page,
});

type StageStatus = "pending" | "active" | "done";
const STAGE_DURATION_MS = [22000, 26000, 30000];
const STAGES = [
  { label: "Researching your audience's psychology", icon: Brain },
  { label: "Writing hooks, stories, metaphors & parables", icon: PencilLine },
  { label: "Drafting your posts", icon: Send },
] as const;

// Persists the four input fields across navigation (e.g. opening the field
// guide and coming back) and accidental reloads. sessionStorage is scoped to
// the current tab, cleared when the tab closes, and never touches the server
// — so it's safe to read/write per keystroke without an SSR guard issue as
// long as we check `typeof window` first (this component also renders on
// the server, where sessionStorage doesn't exist).
const DRAFT_STORAGE_KEY = "clarify:formDraft:v1";

type FormDraft = {
  avatar: string;
  servicesProfession: string;
  audience: string;
  persona: string;
};

const EMPTY_DRAFT: FormDraft = { avatar: "", servicesProfession: "", audience: "", persona: "" };

function loadDraft(): FormDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw);
    return {
      avatar: typeof parsed.avatar === "string" ? parsed.avatar : "",
      servicesProfession: typeof parsed.servicesProfession === "string" ? parsed.servicesProfession : "",
      audience: typeof parsed.audience === "string" ? parsed.audience : "",
      persona: typeof parsed.persona === "string" ? parsed.persona : "",
    };
  } catch {
    // Corrupt JSON, storage disabled, or private-browsing quota issues —
    // fall back to a blank draft rather than breaking the page.
    return EMPTY_DRAFT;
  }
}

function saveDraft(draft: FormDraft) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage full or disabled (e.g. some private-browsing modes) — losing
    // the draft-persistence nicety isn't worth surfacing an error for.
  }
}

// redeem_coupon() raises bare tokens rather than prose, so the wording lives
// here next to the UI that shows it.
function couponErrorMessage(raw: string): string {
  if (raw.includes("coupon_not_found")) return "That code isn't valid. Check for typos.";
  if (raw.includes("coupon_already_redeemed")) return "You've already used that code.";
  if (raw.includes("coupon_exhausted")) return "That code has been fully claimed.";
  if (raw.includes("coupon_expired")) return "That code has expired.";
  if (raw.includes("coupon_inactive")) return "That code is no longer active.";
  if (raw.includes("not_authenticated")) return "Please sign in and try again.";
  return "Couldn't apply that code. Please try again.";
}

// Mirrors public.has_active_subscription() in
// supabase/migrations/20260921000000_stripe_subscriptions.sql. This only
// decides what the page shows -- the cap itself is still enforced server-side
// by reserve_generation_slot(), so a tampered client gains nothing.
function isEntitled(
  row: { status?: string | null; current_period_end?: string | null } | null,
): boolean {
  if (!row?.status) return false;
  if (row.status !== "active" && row.status !== "trialing") return false;
  if (!row.current_period_end) return true;
  return new Date(row.current_period_end).getTime() > Date.now();
}

function Page() {
  const generate = useServerFn(generateContent);
  const startCheckout = useServerFn(createCheckoutSession);
  const navigate = useNavigate();

  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [avatar, setAvatar] = useState(() => loadDraft().avatar);
  const [servicesProfession, setServicesProfession] = useState(() => loadDraft().servicesProfession);
  const [audience, setAudience] = useState(() => loadDraft().audience);
  const [persona, setPersona] = useState(() => loadDraft().persona);
  const [historySaveError, setHistorySaveError] = useState<string | null>(null);
  const [generationsUsed, setGenerationsUsed] = useState<number | null>(null);
  // Pro access from either source, subscription or coupon. The distinction
  // between the two only matters on the subscription page, which asks for
  // itself -- here all that matters is whether the cap applies.
  const [hasProAccess, setHasProAccess] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingPending, setBillingPending] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponPending, setCouponPending] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [returnedFromCheckout] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("checkout") === "success",
  );
  const resultsRef = useRef<HTMLDivElement | null>(null);

  // Reads the two rows that decide what this page allows: lifetime usage and
  // the Stripe entitlement. Returns whether the account is Pro, so the
  // post-checkout poll below can stop as soon as the webhook lands.
  const refreshEntitlement = useCallback(async () => {
    const [{ data: usage }, { data: proAccess }, { data: subscriptionRow }] = await Promise.all([
      supabase.from("generation_usage").select("used_count").maybeSingle(),
      // One question, answered server-side: subscription or coupon, either way.
      supabase.rpc("has_pro_access"),
      supabase.from("subscriptions").select("status, current_period_end").maybeSingle(),
    ]);
    setGenerationsUsed(usage?.used_count ?? 0);

    // Falls back to the subscription row if has_pro_access() isn't there yet,
    // so the app still works between deploying and running the migration.
    const pro = proAccess === true || isEntitled(subscriptionRow);
    setHasProAccess(pro);
    return pro;
  }, []);

  // Keep the draft in sync as the person types, so navigating to the field
  // guide (or refreshing) and coming back doesn't lose what they've written.
  useEffect(() => {
    saveDraft({ avatar, servicesProfession, audience, persona });
  }, [avatar, servicesProfession, audience, persona]);

  const mutation = useMutation({
    mutationFn: (input: {
      avatar: string;
      services_profession: string;
      audience: string;
      persona: string;
      access_token: string;
    }) => generate({ data: input }),
    onSuccess: async (data, variables) => {
      setGenerationsUsed(data.generations_used);
      if (!userId) return;
      setHistorySaveError(null);
      const { error } = await supabase.from("generations").insert({
        user_id: userId,
        avatar: variables.avatar,
        services_profession: variables.services_profession,
        audience: variables.audience,
        persona: variables.persona,
        fears: data.fears,
        frustrations: data.frustrations,
        dreams: data.dreams,
        desires: data.desires,
        hooks: data.hooks,
        stories: data.stories,
        metaphors: data.metaphors,
        parables: data.parables,
        linkedin_posts: data.linkedin_posts,
        facebook_posts: data.facebook_posts,
      });
      if (error) {
        // Don't block the results the person already has in front of them —
        // just make the failure visible instead of silently dropping it,
        // since a save failure here used to fail with no trace anywhere.
        console.error("Failed to save generation to history:", error.message);
        setHistorySaveError(
          "This result wasn't saved to your history (" + error.message + "). Your content above is still safe to copy or download."
        );
      }
    },
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate({ to: "/sign-in" });
      } else {
        setUserEmail(session.user.email ?? null);
        setUserId(session.user.id);
        setAuthChecked(true);
        void refreshEntitlement();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate({ to: "/sign-in" });
    });

    return () => subscription.unsubscribe();
  }, [navigate, refreshEntitlement]);

  useEffect(() => {
    if (mutation.isSuccess && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [mutation.isSuccess]);

  // Stripe redirects back the instant payment succeeds, which regularly beats
  // the webhook that records the entitlement. Poll for a few seconds rather
  // than showing someone who just paid that they are still capped.
  useEffect(() => {
    if (!authChecked || !returnedFromCheckout) return;

    // Drop the query param so a refresh doesn't replay this.
    window.history.replaceState({}, "", window.location.pathname);

    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;

    const poll = async () => {
      const entitled = await refreshEntitlement();
      if (cancelled || entitled) return;
      attempts += 1;
      if (attempts >= 6) {
        setBillingError(
          "Your payment went through, but Stripe hasn't confirmed it with us yet. Refresh in a moment -- you won't be charged again.",
        );
        return;
      }
      timer = window.setTimeout(poll, 1500);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [authChecked, returnedFromCheckout, refreshEntitlement]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/sign-in" });
  }

  // Both of these hand off to a Stripe-hosted page, so on success the browser
  // leaves this app entirely -- deliberately leaving billingPending true so the
  // button stays disabled instead of flashing back during the redirect.
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
      // Re-read rather than assuming: the RPC is the authority on what the
      // code actually granted.
      await refreshEntitlement();
    } finally {
      setCouponPending(false);
    }
  }

  const handleUpgrade = () =>
    redirectToStripe(startCheckout, "Couldn't open checkout. Please try again.");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!avatar.trim() || !servicesProfession.trim() || !audience.trim() || !persona.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate({ to: "/sign-in" });
      return;
    }
    mutation.mutate({
      avatar: avatar.trim(),
      services_profession: servicesProfession.trim(),
      audience: audience.trim(),
      persona: persona.trim(),
      access_token: session.access_token,
    });
  }

  const limitReached =
    !hasProAccess && generationsUsed !== null && generationsUsed >= GENERATION_LIMIT;

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header userEmail={userEmail} onSignOut={handleSignOut} isPro={hasProAccess} />
      <main className="mx-auto w-full max-w-5xl px-5 pb-24 pt-10 sm:px-8">
        <Hero />
        <section className="mt-10">
          {limitReached ? (
            <UpgradeCard
              onUpgrade={handleUpgrade}
              isPending={billingPending}
              couponCode={couponCode}
              setCouponCode={setCouponCode}
              onRedeemCoupon={handleRedeemCoupon}
              couponPending={couponPending}
              couponError={couponError}
            />
          ) : (
            <InputCard
              avatar={avatar}
              setAvatar={setAvatar}
              servicesProfession={servicesProfession}
              setServicesProfession={setServicesProfession}
              audience={audience}
              setAudience={setAudience}
              persona={persona}
              setPersona={setPersona}
              onSubmit={onSubmit}
              isPending={mutation.isPending}
              generationsUsed={generationsUsed}
              hasProAccess={hasProAccess}
            />
          )}
          {billingError && (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Billing</p>
                <p className="text-destructive/80">{billingError}</p>
              </div>
            </div>
          )}
          {mutation.isError && (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Generation failed</p>
                <p className="text-destructive/80">{(mutation.error as Error)?.message ?? "Something went wrong. Please try again."}</p>
              </div>
            </div>
          )}
        </section>
        {mutation.isPending && <section className="mt-10"><LoadingStages /></section>}
        {mutation.isSuccess && mutation.data && (
          <section ref={resultsRef} className="mt-12 scroll-mt-8">
            {historySaveError && (
              <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{historySaveError}</p>
              </div>
            )}
            <Results data={mutation.data} />
            <div className="mt-8 flex justify-center">
              <Button
                onClick={() => {
                  mutation.reset();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                variant="outline"
                className="gap-2 border-border px-6 font-medium text-muted-foreground hover:border-primary hover:text-primary"
              >
                <Sparkles className="h-4 w-4" />
                Generate another strategy
              </Button>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Header({
  userEmail,
  onSignOut,
  isPro,
}: {
  userEmail: string | null;
  onSignOut: () => void;
  isPro: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold text-heading">Sign out?</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              You'll need to sign back in to access your content strategy tool.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              onClick={() => { setConfirmOpen(false); onSignOut(); }}
              className="bg-primary font-semibold text-white hover:bg-primary-hover"
            >
              Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-8 sm:py-4">
          <Link to="/" className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-80">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <span className="font-display text-sm font-bold">C</span>
            </div>
            <div className="truncate font-display text-base font-bold tracking-tight text-heading">Clarify</div>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {userEmail && (
              <span className="hidden max-w-[220px] truncate text-xs text-muted-foreground md:block" title={userEmail}>
                {userEmail}
              </span>
            )}
            <Link
              to="/subscription"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary sm:px-3"
            >
              {isPro ? (
                <Crown className="h-3.5 w-3.5 text-primary" />
              ) : (
                <CreditCard className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">{isPro ? "Pro" : "Plan"}</span>
            </Link>
            <Link
              to="/history"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary sm:px-3"
            >
              History
            </Link>
            <button
              onClick={() => setConfirmOpen(true)}
              aria-label="Sign out"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary sm:px-3"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>
    </>
  );
}

function Hero() {
  return (
    <div className="max-w-3xl">
      <div className="group inline-flex items-center gap-2 rounded-full border border-border bg-soft-tint px-3 py-1 text-xs font-medium text-soft-tint-foreground transition-all hover:border-primary/40 hover:shadow-sm">
        <Sparkles className="h-3.5 w-3.5 text-primary transition-transform group-hover:rotate-12" />
        Content strategy in a few minutes
      </div>
      <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-heading sm:text-4xl md:text-5xl">
        Clarify
      </h1>
      <p className="mt-3 font-display text-lg font-semibold text-heading sm:text-xl">
        6 months of content strategy, built in minutes.
      </p>
      <p className="mt-3 text-base leading-relaxed text-body">
        One avatar in — audience psychology, hooks, stories, metaphors, parables, and ready-to-post LinkedIn and Facebook content out.
      </p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-2 px-5 py-6 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:gap-4 sm:px-8 sm:text-left">
        <span>© {new Date().getFullYear()} Clarify</span>
        <a
          href="https://ironbrij.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] opacity-70 transition-opacity hover:opacity-100 sm:order-3"
        >
          Powered by <span className="font-semibold">Ironbrij</span>
        </a>
      </div>
    </footer>
  );
}

const EXAMPLE = {
  avatar:
    "Mark, 45, runs a 6-person NDIS support coordination business in Western Sydney. He's drowning in admin — 3 hours a day on emails and scheduling instead of growing his client base. Tried hiring locally but couldn't justify the full-time cost. Wants to step back and focus on bringing in new participants.",
  services:
    "Virtual assistant agency — done-for-you admin, inbox, and scheduling for NDIS providers and allied health businesses in Australia.",
  audience:
    "NDIS providers, support coordinators, and allied health practice owners in Australia with teams of 2–10 staff.",
  persona: "Alex Hormozi — direct, blunt, high-energy, short punchy sentences, no fluff.",
};

interface InputCardProps {
  avatar: string; setAvatar: (v: string) => void;
  servicesProfession: string; setServicesProfession: (v: string) => void;
  audience: string; setAudience: (v: string) => void;
  persona: string; setPersona: (v: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
  generationsUsed: number | null;
  hasProAccess: boolean;
}

function InputCard({ avatar, setAvatar, servicesProfession, setServicesProfession, audience, setAudience, persona, setPersona, onSubmit, isPending, generationsUsed, hasProAccess }: InputCardProps) {
  function loadExample() {
    setAvatar(EXAMPLE.avatar);
    setServicesProfession(EXAMPLE.services);
    setAudience(EXAMPLE.audience);
    setPersona(EXAMPLE.persona);
  }
  const isEmpty = !avatar && !servicesProfession && !audience && !persona;

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6"
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <p className="font-display text-sm font-semibold text-heading">Tell us who you're writing for</p>
        {isEmpty && !isPending && (
          <button
            type="button"
            onClick={loadExample}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Sparkles className="h-3 w-3" />
            Try an example
          </button>
        )}
      </div>
      <div className="space-y-7">
        <Field id="avatar" label="Ideal client avatar" hint="Describe one specific person — name, role, situation, what's on their plate." guideSection="avatar">
          <Textarea
            id="avatar"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="e.g. Sarah, 38, runs a 4-person bookkeeping firm. Overwhelmed by admin and chasing clients for paperwork. Wants to grow but can't see past this week's inbox."
            rows={4}
            maxLength={2000}
            disabled={isPending}
            required
            className="resize-y px-4 py-3 leading-relaxed placeholder:text-muted-foreground/60"
          />
        </Field>
        <div className="grid gap-7 sm:grid-cols-2">
          <Field id="services" label="Services or profession" hint="What do you do or sell?" guideSection="services">
            <Input
              id="services"
              value={servicesProfession}
              onChange={(e) => setServicesProfession(e.target.value)}
              placeholder="e.g. Virtual assistant agency for accountants"
              maxLength={500}
              disabled={isPending}
              required
              className="h-11 px-4 placeholder:text-muted-foreground/60"
            />
          </Field>
          <Field id="audience" label="Target audience" hint="Who is your broader market?" guideSection="audience">
            <Input
              id="audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. Owners of 2–10 person accounting firms"
              maxLength={500}
              disabled={isPending}
              required
              className="h-11 px-4 placeholder:text-muted-foreground/60"
            />
          </Field>
        </div>
        <Field id="persona" label="Persona to imitate" hint="Whose voice or writing style should we imitate?" guideSection="persona">
          <Input
            id="persona"
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            placeholder="e.g. Alex Hormozi — direct, blunt, high-energy, short punchy sentences"
            maxLength={300}
            disabled={isPending}
            required
            className="h-11 px-4 placeholder:text-muted-foreground/60"
          />
        </Field>
      </div>
      <div className="mt-7 flex justify-stretch sm:justify-end">
        <Button
          type="submit"
          disabled={isPending}
          className="h-11 w-full bg-primary px-6 font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md active:scale-[0.99] disabled:opacity-70 sm:w-auto"
        >
          {isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating your strategy…</>
          ) : (
            <>Generate my content strategy<Sparkles className="ml-2 h-4 w-4" /></>
          )}
        </Button>
      </div>
      {hasProAccess ? (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-primary sm:justify-end">
          <Crown className="h-3.5 w-3.5" />
          Pro - unlimited generations
        </p>
      ) : (
        generationsUsed !== null && (
          <p className="mt-3 text-center text-xs text-muted-foreground sm:text-right">
            {Math.max(GENERATION_LIMIT - generationsUsed, 0)} of {GENERATION_LIMIT} free generations remaining
          </p>
        )
      )}
    </form>
  );
}

function UpgradeCard({
  onUpgrade,
  isPending,
  couponCode,
  setCouponCode,
  onRedeemCoupon,
  couponPending,
  couponError,
}: {
  onUpgrade: () => void;
  isPending: boolean;
  couponCode: string;
  setCouponCode: (v: string) => void;
  onRedeemCoupon: (e: React.FormEvent<HTMLFormElement>) => void;
  couponPending: boolean;
  couponError: string | null;
}) {
  // Presentation state only, so it stays local. The coupon lives inside the Pro
  // column on purpose: it grants this plan, so it belongs to this plan rather
  // than floating under both as if it applied to Free too.
  const [couponOpen, setCouponOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
      <div className="text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-soft-tint">
          <Crown className="h-5 w-5 text-primary" />
        </div>
        <p className="mt-4 font-display text-base font-semibold text-heading">
          You've used all {GENERATION_LIMIT} free generations
        </p>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
          Everything you've already generated stays available in{" "}
          <Link to="/history" className="font-medium text-primary underline-offset-2 hover:underline">
            History
          </Link>
          .
        </p>
      </div>

      <div className="mt-7 grid items-start gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-5">
          <p className="font-display text-sm font-semibold text-heading">Free</p>
          <p className="mt-2 font-display text-2xl font-extrabold text-heading">
            {FREE_PRICE_LABEL}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Your current plan</p>
          <ul className="mt-4 grid gap-2 text-sm text-body">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{GENERATION_LIMIT} generations, used up</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>History, PDF export and copy tools</span>
            </li>
          </ul>
        </div>

        <div className="rounded-lg border-2 border-primary bg-soft-tint/30 p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-sm font-semibold text-heading">Pro</p>
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
              Unlimited
            </span>
          </div>
          <p className="mt-2 font-display text-2xl font-extrabold text-heading">
            {PRO_PRICE_LABEL}
            <span className="ml-1 text-xs font-medium text-muted-foreground">
              {PRO_PRICE_CADENCE}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Cancel anytime</p>
          <ul className="mt-4 grid gap-2 text-sm text-body">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>Unlimited content strategy generations</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>Everything in Free</span>
            </li>
          </ul>
          <Button
            onClick={onUpgrade}
            disabled={isPending}
            className="mt-5 h-11 w-full bg-primary px-6 font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md active:scale-[0.99] disabled:opacity-70"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Opening secure checkout...
              </>
            ) : (
              <>
                Upgrade to Pro
                <Sparkles className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Secure checkout by Stripe
          </p>

          {couponOpen ? (
            <form onSubmit={onRedeemCoupon} className="mt-4 border-t border-primary/20 pt-4">
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
                  autoCapitalize="characters"
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
              className="mt-3 w-full text-center text-xs font-medium text-primary underline-offset-2 transition-colors hover:text-primary-hover hover:underline"
            >
              Have a coupon code?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ id, label, hint, guideSection, children }: { id: string; label: string; hint?: string; guideSection?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <Label htmlFor={id} className="font-display text-sm font-semibold text-heading">{label}</Label>
      {children}
      {hint && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{hint}</span>
          {guideSection && (
            <Link
              to="/guide"
              hash={guideSection}
              title="Open the field guide"
              className="inline-flex items-center gap-1 rounded-md font-medium text-primary no-underline transition-colors hover:text-primary-hover hover:underline underline-offset-2"
            >
              <BookOpen className="h-3 w-3" />
              See guide
            </Link>
          )}
        </p>
      )}
    </div>
  );
}

function LoadingStages() {
  const [statuses, setStatuses] = useState<StageStatus[]>(["active", "pending", "pending"]);
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (let i = 0; i < STAGES.length - 1; i++) {
      elapsed += STAGE_DURATION_MS[i];
      timers.push(setTimeout(() => { setStatuses((prev) => { const next = [...prev]; next[i] = "done"; next[i + 1] = "active"; return next; }); }, elapsed));
    }
    return () => { for (const t of timers) clearTimeout(t); };
  }, []);
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <p className="font-display text-sm font-semibold text-heading">Working on your strategy</p>
      <p className="mt-1 text-xs text-muted-foreground">This takes about a minute — three AI passes running back-to-back.</p>
      <ol className="mt-5 space-y-3">
        {STAGES.map((stage, i) => {
          const status = statuses[i];
          return (
            <li key={stage.label} className={cn("flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors", status === "active" && "border-primary/30 bg-soft-tint", status === "done" && "border-border bg-background", status === "pending" && "border-border bg-background opacity-60")}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                {status === "done" ? <CheckCircle2 className="h-5 w-5 text-primary" /> : status === "active" ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
              </span>
              <span className={cn("text-sm", status === "pending" ? "text-muted-foreground" : "font-medium text-heading")}>{stage.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Results({ data }: { data: GenerateResult }) {
  const generatedAt = useMemo(() => { try { return new Date(data.generated_at).toLocaleString(); } catch { return data.generated_at; } }, [data.generated_at]);
  const videoScripts = useMemo(
    () => buildVideoScripts(data.fears, data.frustrations, data.dreams, data.desires),
    [data.fears, data.frustrations, data.dreams, data.desires]
  );
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
  <div>
    <h2 className="font-display text-2xl font-bold text-heading">Your content strategy</h2>
    <p className="mt-1 text-sm text-muted-foreground">Generated {generatedAt}</p>
    {data.persona && (
      <p className="mt-1 text-sm text-muted-foreground">
        Written in the voice of <span className="font-medium text-heading">{data.persona}</span>
      </p>
    )}
  </div>
  <Button
    onClick={() => downloadStrategyPdf(data)}
    variant="outline"
    className="gap-2 border-border font-medium text-muted-foreground hover:border-primary hover:text-primary"
  >
    <Download className="h-4 w-4" />
    Download PDF
  </Button>
</div>
      <Tabs defaultValue="stage1" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-secondary p-1">
          <StageTab value="stage1" index={1} label="Audience Psychology" />
          <StageTab value="stage2" index={2} label="Creative Assets" />
          <StageTab value="stage3" index={3} label="Ready to Post" />
          <StageTab value="stage4" index={4} label="Videos" mobileLabel="Videos" />
        </TabsList>
        <TabsContent value="stage1" className="mt-6 space-y-6">
          <Category title="Fears" description="What keeps them up at night" icon={AlertCircle} items={data.fears} />
          <Category title="Frustrations" description="Daily friction they hit" icon={Flame} items={data.frustrations} />
          <Category title="Dreams" description="The future they imagine" icon={Sparkles} items={data.dreams} />
          <Category title="Desires" description="What they actively want" icon={Heart} items={data.desires} />
        </TabsContent>
        <TabsContent value="stage2" className="mt-6 space-y-6">
          <Category title="Hooks" description="Opening lines that stop the scroll" icon={Target} items={data.hooks} />
          <StoryCategory items={data.stories} />
          <MetaphorCategory items={data.metaphors} />
          <ParableCategory items={data.parables} />
        </TabsContent>
        <TabsContent value="stage3" className="mt-6 space-y-6">
          <Category title="LinkedIn Posts" description="Ready to copy and publish" icon={Megaphone} items={data.linkedin_posts} variant="long" />
          <Category title="Facebook Posts" description="Ready to copy and publish" icon={Megaphone} items={data.facebook_posts} variant="long" />
        </TabsContent>
        <TabsContent value="stage4" className="mt-6 space-y-6">
          <VideoScriptCategory items={videoScripts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StageTab({ value, index, label, mobileLabel }: { value: string; index: number; label: string; mobileLabel?: string }) {
  return (
    <TabsTrigger value={value} className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:text-heading data-[state=active]:shadow-sm">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{index}</span>
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{mobileLabel ?? `Stage ${index}`}</span>
    </TabsTrigger>
  );
}

function Category({ title, description, icon: Icon, items, variant = "short" }: { title: string; description: string; icon: React.ComponentType<{ className?: string }>; items: string[]; variant?: "short" | "long" }) {
  const allText = items.join("\n\n");
  if (items.length === 0) return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /><h3 className="font-display text-base font-semibold text-heading">{title}</h3></div>
      <p className="mt-2 text-sm text-muted-foreground">No {title.toLowerCase()} returned.</p>
    </div>
  );
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-soft-tint text-primary"><Icon className="h-4 w-4" /></div>
          <div>
            <h3 className="font-display text-base font-semibold text-heading">{title}{" "}<span className="ml-1 text-xs font-medium text-muted-foreground">({items.length})</span></h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <CopyButton text={allText} label="Copy all" size="sm" variant="outline" />
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className={cn("group flex items-start gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/30 hover:bg-soft-tint/40", variant === "long" && "p-4")}>
            <p className={cn("min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-body", variant === "long" && "text-[15px] leading-7")}>{item}</p>
            <CopyButton text={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetaphorCategory({ items }: { items: MetaphorItem[] }) {
  const allText = items.map((m) => (m.title ? `${m.title}\n${m.story}` : m.story)).join("\n\n");
  if (items.length === 0) return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Shapes className="h-4 w-4 text-primary" />
        <h3 className="font-display text-base font-semibold text-heading">Metaphors</h3>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">No metaphors returned.</p>
    </div>
  );
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-soft-tint text-primary">
            <Shapes className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-heading">
              Metaphors{" "}
              <span className="ml-1 text-xs font-medium text-muted-foreground">({items.length})</span>
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Vivid comparisons that simplify a core pain point</p>
          </div>
        </div>
        <CopyButton text={allText} label="Copy all" size="sm" variant="outline" />
      </div>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="group flex flex-col gap-2 rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/30 hover:bg-soft-tint/40">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {item.title && (
                  <p className="font-display text-sm font-semibold text-heading">{item.title}</p>
                )}
                {item.concept && (
                  <p className="mt-0.5 text-xs italic text-muted-foreground">{item.concept}</p>
                )}
                <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-body">{item.story}</p>
              </div>
              <CopyButton text={item.title ? `${item.title}\n${item.story}` : item.story} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ParableCategory({ items }: { items: ParableItem[] }) {
  const allText = items.map((p) => (p.title ? `${p.title}\n${p.story}` : p.story)).join("\n\n");
  if (items.length === 0) return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <ScrollText className="h-4 w-4 text-primary" />
        <h3 className="font-display text-base font-semibold text-heading">Parables</h3>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">No parables returned.</p>
    </div>
  );
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-soft-tint text-primary">
            <ScrollText className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-heading">
              Parables{" "}
              <span className="ml-1 text-xs font-medium text-muted-foreground">({items.length})</span>
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Short illustrative stories that teach a lesson</p>
          </div>
        </div>
        <CopyButton text={allText} label="Copy all" size="sm" variant="outline" />
      </div>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="group flex flex-col gap-2 rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/30 hover:bg-soft-tint/40">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {item.title && (
                  <p className="font-display text-sm font-semibold text-heading">{item.title}</p>
                )}
                {item.lesson && (
                  <p className="mt-0.5 text-xs italic text-muted-foreground">{item.lesson}</p>
                )}
                <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-body">{item.story}</p>
              </div>
              <CopyButton text={item.title ? `${item.title}\n${item.story}` : item.story} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StoryCategory({ items }: { items: StoryItem[] }) {
  const allText = items.map((s) => s.story).join("\n\n");
  if (items.length === 0) return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <PencilLine className="h-4 w-4 text-primary" />
        <h3 className="font-display text-base font-semibold text-heading">Stories</h3>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">No stories returned.</p>
    </div>
  );
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-soft-tint text-primary">
            <PencilLine className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-heading">
              Stories{" "}
              <span className="ml-1 text-xs font-medium text-muted-foreground">({items.length})</span>
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Narrative arcs to draw from</p>
          </div>
        </div>
        <CopyButton text={allText} label="Copy all" size="sm" variant="outline" />
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="group flex flex-col gap-2 rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/30 hover:bg-soft-tint/40">
            
            <div className="flex items-start gap-3">
              <p className="min-w-0 flex-1 whitespace-pre-wrap text-[15px] leading-7 text-body">
                {item.story}
              </p>
              <CopyButton text={item.story} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The psychology items are written in third person (describing the avatar:
// "...without them", "their revenue"). This does a best-effort swap to
// second person so the item reads naturally after a "Do you...?" question.
// It's a word-boundary regex, not a rewrite — it catches the common
// possessive/object pronouns but won't fix every phrasing.
function toSecondPerson(text: string): string {
  return text
    .replace(/\btheir\b/gi, "your")
    .replace(/\bthemselves\b/gi, "yourself")
    .replace(/\bthem\b/gi, "you");
}

// Turns a raw psychology item (e.g. "Losing a client's trust after a
// billing error — one bad review could undo years of work.") into a
// fragment that reads naturally after a question stem: lowercases the
// first letter and drops a trailing sentence-ending punctuation mark.
function toQuestionFragment(item: string): string {
  const trimmed = toSecondPerson(item.trim()).replace(/[.?!]+$/, "");
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

// Builds sample 4-line video scripts by pairing up one fear, one
// frustration, one dream, and one desire per script (matched by index),
// so each script draws from a different angle across the psychology data.
function buildVideoScripts(fears: string[], frustrations: string[], dreams: string[], desires: string[]): string[] {
  const count = Math.min(fears.length, frustrations.length, dreams.length, desires.length);
  const scripts: string[] = [];
  for (let i = 0; i < count; i++) {
    scripts.push(
      [
        `Do you fear ${toQuestionFragment(fears[i])}?`,
        `Are you frustrated by ${toQuestionFragment(frustrations[i])}?`,
        `Do you dream of ${toQuestionFragment(dreams[i])}?`,
        `Do you really want ${toQuestionFragment(desires[i])}?`,
      ].join("\n")
    );
  }
  return scripts;
}

function VideoScriptCategory({ items }: { items: string[] }) {
  const allText = items.join("\n\n---\n\n");
  if (items.length === 0) return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-primary" />
        <h3 className="font-display text-base font-semibold text-heading">Video Scripts</h3>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">No video scripts available.</p>
    </div>
  );
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-soft-tint text-primary">
            <Video className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-heading">
              Video Scripts{" "}
              <span className="ml-1 text-xs font-medium text-muted-foreground">({items.length})</span>
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Sample hooks built from a fear, frustration, dream, and desire — read one straight into camera
            </p>
          </div>
        </div>
        <CopyButton text={allText} label="Copy all" size="sm" variant="outline" />
      </div>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="group flex items-start gap-3 rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/30 hover:bg-soft-tint/40">
            <p className="min-w-0 flex-1 whitespace-pre-wrap text-[15px] leading-7 text-body">{item}</p>
            <CopyButton text={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}
