import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Brain,
  CheckCircle2,
  Circle,
  Flame,
  Heart,
  Loader2,
  LogOut,
  Megaphone,
  PencilLine,
  Send,
  Sparkles,
  Target,
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
  type GenerateResult,
  type StoryItem,
} from "@/lib/generate-content.functions";
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
  { label: "Writing hooks and stories", icon: PencilLine },
  { label: "Drafting your posts", icon: Send },
] as const;

function Page() {
  const generate = useServerFn(generateContent);
  const navigate = useNavigate();

  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [avatar, setAvatar] = useState("");
  const [servicesProfession, setServicesProfession] = useState("");
  const [audience, setAudience] = useState("");
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const mutation = useMutation({
    mutationFn: (input: { avatar: string; services_profession: string; audience: string }) =>
      generate({ data: input }),
    onSuccess: async (data, variables) => {
      if (!userId) return;
      await supabase.from("generations").insert({
        user_id: userId,
        avatar: variables.avatar,
        services_profession: variables.services_profession,
        audience: variables.audience,
        fears: data.fears,
        frustrations: data.frustrations,
        dreams: data.dreams,
        desires: data.desires,
        hooks: data.hooks,
        stories: data.stories,
        linkedin_posts: data.linkedin_posts,
        facebook_posts: data.facebook_posts,
      });
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
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate({ to: "/sign-in" });
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (mutation.isSuccess && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [mutation.isSuccess]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/sign-in" });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!avatar.trim() || !servicesProfession.trim() || !audience.trim()) return;
    mutation.mutate({ avatar: avatar.trim(), services_profession: servicesProfession.trim(), audience: audience.trim() });
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header userEmail={userEmail} onSignOut={handleSignOut} />
      <main className="mx-auto w-full max-w-5xl px-5 pb-24 pt-10 sm:px-8">
        <Hero />
        <section className="mt-10">
          <InputCard avatar={avatar} setAvatar={setAvatar} servicesProfession={servicesProfession} setServicesProfession={setServicesProfession} audience={audience} setAudience={setAudience} onSubmit={onSubmit} isPending={mutation.isPending} />
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

function Header({ userEmail, onSignOut }: { userEmail: string | null; onSignOut: () => void }) {
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
        One avatar in — audience psychology, hooks, stories, and ready-to-post LinkedIn and Facebook content out.
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
};

interface InputCardProps {
  avatar: string; setAvatar: (v: string) => void;
  servicesProfession: string; setServicesProfession: (v: string) => void;
  audience: string; setAudience: (v: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
}

function InputCard({ avatar, setAvatar, servicesProfession, setServicesProfession, audience, setAudience, onSubmit, isPending }: InputCardProps) {
  function loadExample() {
    setAvatar(EXAMPLE.avatar);
    setServicesProfession(EXAMPLE.services);
    setAudience(EXAMPLE.audience);
  }
  const isEmpty = !avatar && !servicesProfession && !audience;

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-8"
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
    </form>
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
            <a
              href={"/guide#" + guideSection}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the field guide in a new tab"
              className="inline-flex items-center gap-1 rounded-md font-medium text-primary no-underline transition-colors hover:text-primary-hover hover:underline underline-offset-2"
            >
              <BookOpen className="h-3 w-3" />
              See guide
            </a>
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
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
  <div>
    <h2 className="font-display text-2xl font-bold text-heading">Your content strategy</h2>
    <p className="mt-1 text-sm text-muted-foreground">Generated {generatedAt}</p>
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
        <TabsList className="grid w-full grid-cols-3 bg-secondary p-1">
          <StageTab value="stage1" index={1} label="Audience Psychology" />
          <StageTab value="stage2" index={2} label="Creative Assets" />
          <StageTab value="stage3" index={3} label="Ready to Post" />
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
        </TabsContent>
        <TabsContent value="stage3" className="mt-6 space-y-6">
          <Category title="LinkedIn Posts" description="Ready to copy and publish" icon={Megaphone} items={data.linkedin_posts} variant="long" />
          <Category title="Facebook Posts" description="Ready to copy and publish" icon={Megaphone} items={data.facebook_posts} variant="long" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StageTab({ value, index, label }: { value: string; index: number; label: string }) {
  return (
    <TabsTrigger value={value} className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:text-heading data-[state=active]:shadow-sm">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{index}</span>
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">Stage {index}</span>
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
