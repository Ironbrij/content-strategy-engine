import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Users, Briefcase } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/guide")({
  head: () => ({
    meta: [
      { title: "How to Fill In Your Content Strategy — Clarify" },
      {
        name: "description",
        content:
          "A step-by-step guide on how to fill in your avatar, services, and audience to get the best results from Clarify.",
      },
    ],
  }),
  component: GuidePage,
});

interface GuideSection {
  id: string;
  icon: React.ReactNode;
  label: string;
  title: string;
  why: string;
  tips: string[];
  example: string;
  videoPlaceholder?: boolean;
}

const SECTIONS: GuideSection[] = [
  {
    id: "avatar",
    icon: <Users className="h-5 w-5" />,
    label: "Ideal Client Avatar",
    title: "How to describe your ideal client avatar",
    why: "The more specific your avatar, the sharper your psychology research, hooks, and posts will be. Generic avatars produce generic content — the AI can't write something that feels personally written if it doesn't know who the person is.",
    tips: [
      "Give them a name and age — this forces you to think of them as a real person, not a demographic",
      "Include their job title and the size of their business or team",
      "Describe their biggest daily struggle in concrete, observable terms — not just 'stressed' but what specifically is stressing them",
      "Mention what they've already tried and why it hasn't worked — this is gold for hooks",
      "Add what they actually want — not just to fix the problem, but the life or business outcome behind it",
    ],
    example:
      "Mark, 45, runs a 6-person NDIS support coordination business in Western Sydney. He's drowning in admin — spending 3 hours a day on emails and scheduling instead of growing his client base. He's tried hiring a local admin assistant but couldn't justify the full-time cost. He wants to step back from the day-to-day and finally focus on bringing in new NDIS participants.",
    videoPlaceholder: true,
  },
  {
    id: "services",
    icon: <Briefcase className="h-5 w-5" />,
    label: "Services or Profession",
    title: "How to describe your services or profession",
    why: "This tells the AI what lens to write through. The same avatar might need completely different content depending on whether you're a VA agency, a business coach, or a bookkeeper. Be specific — 'consultant' is too vague to produce sharp content.",
    tips: [
      "Describe what you actually do, not just your industry category",
      "Include who you specialise in serving if relevant",
      "Mention your delivery model if it's distinctive — done-for-you vs coaching vs software all produce very different content",
      "Include your location or market if your service is region-specific",
      "Don't be modest — the more context you give, the better the output",
    ],
    example:
      "Virtual assistant agency specialising in admin support, inbox management, and scheduling for NDIS providers and allied health businesses in Australia. Done-for-you service — clients hand off their admin completely.",
    videoPlaceholder: true,
  },
  {
    id: "audience",
    icon: <BookOpen className="h-5 w-5" />,
    label: "Target Audience",
    title: "How to describe your target audience",
    why: "Your avatar is one specific person. Your audience is the broader group they represent. This helps the AI understand the market's shared characteristics and write content that resonates across your whole client base — not just one individual.",
    tips: [
      "Think of this as how you'd describe your ideal clients to someone at a networking event",
      "Include business size or team size if it defines who you work with",
      "Include industry or niche",
      "Include geography if your service is location-specific",
      "Don't confuse this with your avatar — your audience is the category, your avatar is one individual from that category",
    ],
    example:
      "NDIS providers, support coordinators, and allied health practice owners in Australia with small teams of 2–10 staff who are growing but not yet large enough to justify hiring full-time admin.",
    videoPlaceholder: true,
  },
];

function GuidePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-heading"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to tool
          </Link>
          <div className="flex items-center gap-3">
            <span className="font-display text-sm font-semibold text-heading">
              Clarify — Field Guide
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Page intro */}
      <div className="mx-auto max-w-3xl px-4 pt-10 pb-6 sm:px-6">
        <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-tint px-3 py-1 text-xs font-medium text-primary">
          <BookOpen className="h-3 w-3" />
          How to get the best results
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold text-heading sm:text-4xl">
          Filling in your content strategy
        </h1>
        <p className="mt-3 text-body">
          The quality of your output depends heavily on what you put in. This
          guide walks through each field — what to write, what to avoid, and
          what a strong answer looks like.
        </p>

        {/* Jump links */}
        <div className="mt-6 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-body transition-colors hover:border-primary hover:text-primary"
            >
              {s.icon}
              {s.label}
            </a>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="mx-auto max-w-3xl space-y-12 px-4 pb-20 sm:px-6">
        {SECTIONS.map((section, i) => (
          <section key={section.id} id={section.id} className="scroll-mt-20">
            {/* Section header */}
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white text-sm font-bold">
                {i + 1}
              </div>
              <h2 className="font-display text-xl font-bold text-heading">
                {section.title}
              </h2>
            </div>

            <div className="space-y-5 rounded-xl border border-border bg-card p-6">
              {/* Video placeholder */}
              {section.videoPlaceholder && (
                <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                  Video guide coming soon
                </div>
              )}

              {/* Why it matters */}
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
                  Why this matters
                </p>
                <p className="text-sm text-body">{section.why}</p>
              </div>

              {/* Tips */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
                  Tips
                </p>
                <ul className="space-y-2">
                  {section.tips.map((tip, j) => (
                    <li key={j} className="flex gap-2 text-sm text-body">
                      <span className="mt-0.5 shrink-0 font-bold text-primary">
                        •
                      </span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Example */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
                  Example
                </p>
                <p className="rounded-lg border border-border bg-tint/50 p-4 text-sm italic text-muted-foreground">
                  {section.example}
                </p>
              </div>
            </div>
          </section>
        ))}

        {/* Back CTA */}
        <div className="pt-4 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to the tool
          </Link>
        </div>
      </div>
    </div>
  );
}
