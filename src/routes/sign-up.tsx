import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/sign-up")({
  head: () => ({ meta: [{ title: "Create account — Clarify" }] }),
  component: SignUpPage,
});

function SignUpPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) { setError(error.message); setIsLoading(false); return; }
    setSuccess(true);
    setIsLoading(false);
  }

  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <span className="font-display text-base font-bold text-white">C</span>
            </div>
          </div>
          <h2 className="font-display text-xl font-bold text-heading">Check your email</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Already confirmed?{" "}
            <Link to="/sign-in" className="font-medium text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <span className="font-display text-base font-bold text-white">C</span>
          </div>
          <span className="font-display text-xl font-bold text-heading">Clarify</span>
          <p className="text-sm text-muted-foreground">Create your account</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-display text-sm font-semibold text-heading">Email address</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required disabled={isLoading} autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="font-display text-sm font-semibold text-heading">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} disabled={isLoading} autoComplete="new-password" />
            </div>
            {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={isLoading} className="w-full bg-primary font-semibold text-white hover:bg-primary-hover">
              {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating account…</> : "Create account"}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/sign-in" className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
