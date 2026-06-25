import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ArrowLeft, Clock, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "History — Clarify" }] }),
  component: HistoryPage,
});

interface Generation {
  id: string;
  created_at: string;
  avatar: string;
  services_profession: string;
  audience: string;
  fears: string[];
  frustrations: string[];
  dreams: string[];
  desires: string[];
  hooks: string[];
  stories: string[];
  linkedin_posts: string[];
  facebook_posts: string[];
}

function HistoryPage() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate({ to: "/sign-in" });
        return;
      }
      setAuthChecked(true);
      fetchGenerations();
    });
  }, [navigate]);

  async function fetchGenerations() {
    const { data, error } = await supabase
      .from("generations")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setGenerations(data as Generation[]);
    }
    setIsLoading(false);
  }

  async function handleDelete() {
    if (!deleteId) return;
    setIsDeleting(true);
    await supabase.from("generations").delete().eq("id", deleteId);
    setGenerations((prev) => prev.filter((g) => g.id !== deleteId));
    setDeleteId(null);
    setIsDeleting(false);
  }

  async function handleDelete() {
    if (!deleteId) return;
    setIsDeleting(true);
    await supabase.from("generations").delete().eq("id", deleteId);
    setGenerations((prev) => prev.filter((g) => g.id !== deleteId));
    setDeleteId(null);
    setIsDeleting(false);
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
      {/* Header */}
      <header className="border-b border-border bg-background">
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
              <div className="font-display text-base font-bold tracking-tight text-heading">Clarify</div>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-24 pt-10 sm:px-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-heading">History</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your past content strategy generations
          </p>
        </div>

        {/* Delete confirmation dialog */}
        <Dialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display text-base font-semibold text-heading">Delete this generation?</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                This can't be undone. The content strategy will be permanently removed from your history.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setDeleteId(null)} disabled={isDeleting}>Cancel</Button>
              <Button
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-destructive font-semibold text-white hover:bg-destructive/90"
              >
                {isDeleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting…</> : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {generations.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <Clock className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-4 font-display text-base font-semibold text-heading">No generations yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your content strategies will appear here after you generate them.
            </p>
            <Link
              to="/"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              Generate your first strategy
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {generations.map((gen) => (
              <GenerationCard
                key={gen.id}
                generation={gen}
                isExpanded={expandedId === gen.id}
                onToggle={() => setExpandedId(expandedId === gen.id ? null : gen.id)}
                onDelete={() => setDeleteId(gen.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function GenerationCard({
  generation: gen,
  isExpanded,
  onToggle,
  onDelete,
}: {
  generation: Generation;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const date = new Date(gen.created_at).toLocaleString();
  const avatarPreview = gen.avatar.length > 120 ? gen.avatar.slice(0, 120) + "…" : gen.avatar;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Card header — always visible */}
      <button
        onClick={onToggle}
        className="w-full px-6 py-5 text-left transition-colors hover:bg-muted/30"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {date}
            </div>
            <p className="mt-2 text-sm font-medium text-heading line-clamp-2">{avatarPreview}</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-muted-foreground">
                {gen.services_profession.length > 50 ? gen.services_profession.slice(0, 50) + "…" : gen.services_profession}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="Delete this generation"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <span className="text-muted-foreground">
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border px-6 pb-6 pt-5 space-y-6">
          {/* Inputs summary */}
          <div className="grid gap-3 rounded-lg border border-border bg-background p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Avatar</p>
              <p className="mt-1 text-sm text-body">{gen.avatar}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Services</p>
              <p className="mt-1 text-sm text-body">{gen.services_profession}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Audience</p>
              <p className="mt-1 text-sm text-body">{gen.audience}</p>
            </div>
          </div>

          {/* Output sections */}
          <OutputSection title="Fears" items={gen.fears} />
          <OutputSection title="Frustrations" items={gen.frustrations} />
          <OutputSection title="Dreams" items={gen.dreams} />
          <OutputSection title="Desires" items={gen.desires} />
          <OutputSection title="Hooks" items={gen.hooks} />
          <OutputSection title="Stories" items={gen.stories} long />
          <OutputSection title="LinkedIn Posts" items={gen.linkedin_posts} long />
          <OutputSection title="Facebook Posts" items={gen.facebook_posts} long />
        </div>
      )}
    </div>
  );
}

function OutputSection({
  title,
  items,
  long = false,
}: {
  title: string;
  items: string[];
  long?: boolean;
}) {
  if (!items || items.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          {title} <span className="ml-1 font-normal text-muted-foreground">({items.length})</span>
        </p>
        <CopyButton text={items.join("\n\n")} label="Copy all" size="sm" variant="outline" />
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li
            key={i}
            className={cn(
              "flex items-start gap-3 rounded-lg border border-border bg-background p-3",
              long && "p-4"
            )}
          >
            <p className={cn("min-w-0 flex-1 whitespace-pre-wrap text-sm text-body", long && "text-[15px] leading-7")}>
              {item}
            </p>
            <CopyButton text={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}
