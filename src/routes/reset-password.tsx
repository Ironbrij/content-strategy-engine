import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — Clarify" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when the user lands via the reset email link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setIsLoading(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setIsLoading(false); return; }
    setDone(true);
    setIsLoading(false);
    setTimeout(() => navigate({ to: "/" }), 2000);
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-primary">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="font-display text-xl font-semibold text-heading">Password updated</h2>
          <p className="mt-2 text-sm text-body">Redirecting you to the app…</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          <p className="mt-4 text-sm text-body">Verifying your reset link…</p>
          <p className="mt-6 text-xs text-muted-foreground">
            Link expired?{" "}
            <Link to="/sign-in" className="font-semibold text-primary hover:underline">
              Request a new one
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="font-display text-sm font-bold">C</span>
          </div>
          <span className="font-display text-base font-bold tracking-tight text-heading">Clarify</span>
        </div>
        <div className="rounded-2xl border border-border bg-card p-8 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
          <div className="mb-6 text-center">
            <h2 className="font-display text-2xl font-semibold text-heading">Choose a new password</h2>
            <p className="mt-1 text-sm text-body">At least 8 characters</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="font-display text-sm font-semibold text-heading">
                New password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                disabled={isLoading}
                autoComplete="new-password"
                className="h-11 border-border bg-background text-body placeholder:text-muted-foreground focus-visible:ring-primary"
              />
            </div>
            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={isLoading}
              className="h-11 w-full bg-primary font-semibold text-white hover:bg-primary-hover"
            >
              {isLoading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating…</>
                : "Update password"
              }
            </Button>
          </form>
        </div>
        <p className="mt-6 text-center text-sm text-body">
          <Link to="/sign-in" className="font-semibold text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
