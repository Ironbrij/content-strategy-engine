import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useUser, UserButton } from "@clerk/tanstack-react-start";
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
import { CopyButton } from "@/components/copy-button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  generateContent,
  type GenerateResult,
} from "@/lib/generate-content.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "6 Months Content Automation — Clarify" },
      {
        name: "description",
        content:
          "Generate a 6-month content strategy from your client avatar. Audience psychology, hooks, stories, and 10 ready-to-post LinkedIn and Facebook posts.",
      },
      { property: "og:title", content: "6 Months Content Automation — Clarify" },
      {
        property: "og:description",
        content:
          "Turn one client avatar into 6 months of LinkedIn and Facebook content.",
      },
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
  // ALL hooks must be at the top — before any early returns
  const { isLoaded, isSignedIn } = useUser();
  const navigate = useNavigate();
  const generate = useServerFn(generateContent);

  const [avatar, setAvatar] = useState("");
  const [servicesProfession, setServicesProfession] = useState("");
  const [audience, setAudience] = useState("");

  const resultsRef = useRef<HTMLDivElement | null>(null);

  const mutation = useMutation({
    mutationFn: (input: {
      avatar: string;
      services_profession: string;
      audience: string;
    }) => generate({ data: input }),
  });

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      navigate({ to: "/sign-in" });
    }
  }, [isLoaded, isSignedIn, navigate]);

  useEffect(() => {
    if (mutation.isSuccess && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [mutation.isSuccess]);

  // Early return AFTER all hooks
  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      avatar.trim().length === 0 ||
      servicesProfession.trim().length === 0 ||
      audience.trim().length === 0
    ) {
      return;
    }
    mutation.mutate({
      avatar: avatar.trim(),
      services_profession: servicesProfession.trim(),
      audience: audience.trim(),
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto w-full max-w-5xl px-5 pb-24 pt-10 sm:px-8">
        <Hero />

        <section className="mt-10">
          <InputCard
            avatar={avatar}
            setAvatar={setAvatar}
            servicesProfession={servicesProfession}
            setServicesProfession={setServicesProfession}
            audience={audience}
            setAudience={setAudience}
            onSubmit={onSubmit}
            isPending={mutation.isPending}
          />

          {mutation.isError && (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Generation failed</p>
                <p className="text-destructive/80">
                  {(mutation.error as Error)?.message ??
                    "Something went wrong. Please try again."}
                </p>
              </div>
            </div>
          )}
        </section>

        {mutation.isPending && (
          <section className="mt-10">
            <LoadingStages />
          </section>
        )}

        {mutation.isSuccess && mutation.data && (
          <section ref={resultsRef} className="mt-12 scroll-mt-8">
            <Results data={mutation.data} />
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

/* ---------- header / hero / footer ---------- */

function Header() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="font-display text-sm font-bold">C</span>
          </div>
          <div className="font-display text-base font-bold tracking-tight text-heading">
            Clarify
          </div>
        </div>
        <div className="flex items-center gap-3">
          <UserButton afterSignOutUrl="/sign-in" />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <div className="max-w-3xl">
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-soft-tint px-3 py-1 text-xs font-medium text-soft-tint-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Content strategy in a few minutes
      </div>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-heading sm:text-4xl">
        6 Months Content Automation
      </h1>
      <p className="mt-3 text-base leading-relaxed text-body">
        Describe your ideal client and we'll build a complete content
        strategy — audience psychology, creative hooks, stories, and
        ready-to-post LinkedIn and Facebook content.
      </p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-5 py-6 text-xs text-muted-foreground sm:px-8">
        <span>© {new Date().getFullYear()} Clarify</span>
        <span>The bridge between ambition and achievement.</span>
      </div>
    </footer>
  );
}

/* ---------- input card ---------- */

interface InputCardProps {
  avatar: string;
  setAvatar: (v: string) => void;
  servicesProfession: string;
  setServicesProfession: (v: string) => void;
  audience: string;
  setAudience: (v: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
}

function InputCard(props: InputCardProps) {
  const {
    avatar,
    setAvatar,
    servicesProfession,
    setServicesProfession,
    audience,
    setAudience,
    onSubmit,
    isPending,
  } = props;

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-7"
    >
      <div className="space-y-5">
        <Field
          id="avatar"
          label="Ideal client avatar"
          hint="Describe one specific person — name, role, situation, what's on their plate."
          guideSection="avatar"
        >
          <Textarea
            id="avatar"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="Sarah, 38, runs a 4-person bookkeeping firm. Overwhelmed by admin and chasing clients for paperwork. Wants to grow but can't see past this week's inbox."
            rows={4}
            maxLength={2000}
            disabled={isPending}
            required
            className="resize-y"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="services"
            label="Services or profession"
            hint="What do you do or sell?"
            guideSection="services"
          >
            <Input
              id="services"
              value={servicesProfession}
              onChange={(e) => setServicesProfession(e.target.value)}
              placeholder="Virtual assistant agency for accountants"
              maxLength={500}
              disabled={isPending}
              required
            />
          </Field>

          <Field id="audience" label="Target audience" hint="Who is your broader market?" guideSection="audience">
            <Input
              id="audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="Owners of 2–10 person accounting / bookkeeping firms"
              maxLength={500}
              disabled={isPending}
              required
            />
          </Field>
        </div>
      </div>

      <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="submit"
          disabled={isPending}
          className="h-11 bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              Generate my content strategy
              <Sparkles className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  guideSection,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  guideSection?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="font-display text-sm font-semibold text-heading">
        {label}
      </Label>
      {children}
      {hint && (
        <p className="text-xs text-muted-foreground">
          {hint}{" "}
          {guideSection && (
            <a
              href={"/guide#" + guideSection}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

/* ---------- loading stages ---------- */

function LoadingStages() {
  const [statuses, setStatuses] = useState<StageStatus[]>([
    "active",
    "pending",
    "pending",
  ]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (let i = 0; i < STAGES.length - 1; i++) {
      elapsed += STAGE_DURATION_MS[i];
      timers.push(
        setTimeout(() => {
          setStatuses((prev) => {
            const next = [...prev];
            next[i] = "done";
            next[i + 1] = "active";
            return next;
          });
        }, elapsed),
      );
    }
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <p className="font-display text-sm font-semibold text-heading">
        Working on your strategy
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        This takes about a minute — three AI passes running back-to-back.
      </p>

      <ol className="mt-5 space-y-3">
        {STAGES.map((stage, i) => {
          const status = statuses[i];
          return (
            <li
              key={stage.label}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
                status === "active" && "border-primary/30 bg-soft-tint",
                status === "done" && "border-border bg-background",
                status === "pending" && "border-border bg-background opacity-60",
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                {status === "done" ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : status === "active" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </span>
              <span
                className={cn(
                  "text-sm",
                  status === "pending"
                    ? "text-muted-foreground"
                    : "font-medium text-heading",
                )}
              >
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------- results ---------- */

function Results({ data }: { data: GenerateResult }) {
  const generatedAt = useMemo(() => {
    try {
      return new Date(data.generated_at).toLocaleString();
    } catch {
      return data.generated_at;
    }
  }, [data.generated_at]);

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-heading">
            Your content strategy
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Generated {generatedAt}
          </p>
        </div>
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
          <Category title="Stories" description="Narrative arcs to draw from" icon={PencilLine} items={data.stories} variant="long" />
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
    <TabsTrigger
      value={value}
      className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:text-heading data-[state=active]:shadow-sm"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
        {index}
      </span>
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">Stage {index}</span>
    </TabsTrigger>
  );
}

function Category({
  title,
  description,
  icon: Icon,
  items,
  variant = "short",
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  items: string[];
  variant?: "short" | "long";
}) {
  const allText = items.join("\n\n");

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h3 className="font-display text-base font-semibold text-heading">{title}</h3>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">No {title.toLowerCase()} returned.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-soft-tint text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-heading">
              {title}{" "}
              <span className="ml-1 text-xs font-medium text-muted-foreground">({items.length})</span>
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <CopyButton text={allText} label="Copy all" size="sm" variant="outline" />
      </div>

      <ul className="space-y-2">
        {items.map((item, i) => (
          <li
            key={i}
            className={cn(
              "group flex items-start gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/30 hover:bg-soft-tint/40",
              variant === "long" && "p-4",
            )}
          >
            <p
              className={cn(
                "min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-body",
                variant === "long" && "text-[15px] leading-7",
              )}
            >
              {item}
            </p>
            <CopyButton text={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}
