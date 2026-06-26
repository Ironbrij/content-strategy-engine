import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/sign-in")({
  head: () => ({ meta: [{ title: "Sign in — Clarify" }] }),
  component: SignInPage,
});

function BrandPanel() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:w-1/2 xl:w-2/5">
      <div className="relative z-10">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
            <span className="font-display text-2xl font-bold text-white">C</span>
          </div>
          <span className="font-display text-2xl font-bold text-white">Clarify</span>
        </div>
        <h1 className="mt-10 font-display text-4xl font-bold leading-[1.1] tracking-tight text-white">
          Turn one client avatar into 6 months of content.
        </h1>
        <p className="mt-5 max-w-md text-lg leading-relaxed text-white/80">
          Generate audience psychology, hooks, stories, and ready-to-post LinkedIn and Facebook content — in minutes.
        </p>
      </div>

      <div className="relative z-10 space-y-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10">
            <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm leading-relaxed text-white/90">Build a 6-month content strategy from one client avatar</p>
        </div>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10">
            <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm leading-relaxed text-white/90">LinkedIn and Facebook posts written for your voice</p>
        </div>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10">
            <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm leading-relaxed text-white/90">Hooks, stories, and CTAs based on real buyer psychology</p>
        </div>
      </div>

      <div className="pointer-events-none absolute -bottom-32 -right-32 h-[28rem] w-[28rem] rounded-full bg-white/[0.06] blur-3xl" />
      <div className="pointer-events-none absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-white/[0.05] blur-3xl" />
    </div>
  );
}

type View = "sign-in" | "forgot" | "forgot-sent";

function SignInPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setIsLoading(false); return; }
    navigate({ to: "/" });
  }

  async function handleGoogle() {
    setIsGoogleLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) { setError(error.message); setIsGoogleLoading(false); }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError("Enter your email address above first."); return; }
    setIsLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/`,
    });
    if (error) { setError(error.message); setIsLoading(false); return; }
    setIsLoading(false);
    setView("forgot-sent");
  }

  const googleButton = (
    <Button
      type="button"
      onClick={handleGoogle}
      disabled={isGoogleLoading || isLoading}
      variant="outline"
      className="w-full gap-2 border-border bg-background py-5 text-sm font-medium text-heading transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {isGoogleLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      )}
      Continue with Google
    </Button>
  );

  const divider = (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs">
        <span className="bg-card px-3 text-muted-foreground">or continue with email</span>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <BrandPanel />
      <main className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-1/2 lg:px-12 xl:w-3/5">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <span className="font-display text-xl font-bold text-white">C</span>
            </div>
            <span className="font-display text-xl font-bold text-heading">Clarify</span>
          </div>

          {/* ── Forgot password sent ── */}
          {view === "forgot-sent" && (
            <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-primary">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="font-display text-2xl font-semibold text-heading">Check your email</h2>
              <p className="mt-2 text-sm text-body">
                We sent a password reset link to <strong>{email}</strong>. Click it to set a new password.
              </p>
              <button
                type="button"
                onClick={() => { setView("sign-in"); setError(null); }}
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to sign in
              </button>
            </div>
          )}

          {/* ── Forgot password form ── */}
          {view === "forgot" && (
            <div className="rounded-2xl border border-border bg-card p-8 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
              <button
                type="button"
                onClick={() => { setView("sign-in"); setError(null); }}
                className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-heading"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to sign in
              </button>
              <div className="mb-6">
                <h2 className="font-display text-2xl font-semibold text-heading">Reset your password</h2>
                <p className="mt-1 text-sm text-body">Enter your email and we'll send you a reset link.</p>
              </div>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email" className="font-display text-sm font-semibold text-heading">Email address</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    disabled={isLoading}
                    autoComplete="email"
                    autoFocus
                    className="h-11 border-border bg-background text-body placeholder:text-muted-foreground focus-visible:ring-primary"
                  />
                </div>
                {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={isLoading} className="h-11 w-full bg-primary font-semibold text-white hover:bg-primary-hover">
                  {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : "Send reset link"}
                </Button>
              </form>
            </div>
          )}

          {/* ── Sign in form ── */}
          {view === "sign-in" && (
            <div className="rounded-2xl border border-border bg-card p-8 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
              <div className="mb-6 text-center">
                <h2 className="font-display text-2xl font-semibold text-heading">Welcome back</h2>
                <p className="mt-1 text-sm text-body">Sign in to your Clarify account</p>
              </div>

              {googleButton}
              {divider}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="font-display text-sm font-semibold text-heading">Email address</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required disabled={isLoading} autoComplete="email" className="h-11 border-border bg-background text-body placeholder:text-muted-foreground focus-visible:ring-primary" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="font-display text-sm font-semibold text-heading">Password</Label>
                    <button
                      type="button"
                      onClick={() => { setView("forgot"); setError(null); }}
                      className="text-xs font-medium text-primary transition-colors hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required disabled={isLoading} autoComplete="current-password" className="h-11 border-border bg-background text-body placeholder:text-muted-foreground focus-visible:ring-primary" />
                </div>
                {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={isLoading || isGoogleLoading} className="h-11 w-full bg-primary font-semibold text-white hover:bg-primary-hover">
                  {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in…</> : "Sign in"}
                </Button>
              </form>
            </div>
          )}

          <p className="mt-6 text-center text-sm text-body">
            Don't have an account?{" "}
            <Link to="/sign-up" className="font-semibold text-primary hover:underline">Create one</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
