import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";

export const GENERATION_LIMIT = 3;

const inputSchema = z.object({
  avatar: z.string().trim().min(1).max(2000),
  services_profession: z.string().trim().min(1).max(500),
  audience: z.string().trim().min(1).max(500),
  persona: z.string().trim().min(1).max(300),
  access_token: z.string().min(1),
});

export type GenerateInput = z.infer<typeof inputSchema>;

export interface StoryItem {
  framework: string;
  format: string;
  type: string;
  story: string;
}

export interface MetaphorItem {
  title: string;
  concept: string;
  story: string;
}

export interface ParableItem {
  title: string;
  lesson: string;
  story: string;
}

export interface GenerateResult {
  avatar: string;
  services_profession: string;
  audience: string;
  persona: string;
  generated_at: string;
  fears: string[];
  frustrations: string[];
  dreams: string[];
  desires: string[];
  hooks: string[];
  stories: StoryItem[];
  metaphors: MetaphorItem[];
  parables: ParableItem[];
  linkedin_posts: string[];
  facebook_posts: string[];
  generations_used: number;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : String(v)))
      .filter((s) => s && s.trim().length > 0);
  }
  return [];
}

function toStoryArray(value: unknown): StoryItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v): StoryItem | null => {
      if (typeof v === "object" && v !== null && typeof (v as any).story === "string") {
        return {
          framework: typeof (v as any).framework === "string" ? (v as any).framework : "",
          format: typeof (v as any).format === "string" ? (v as any).format : "",
          type: typeof (v as any).type === "string" ? (v as any).type : "",
          story: (v as any).story,
        };
      }
      // Fallback: handle plain strings (old format)
      if (typeof v === "string" && v.trim().length > 0) {
        return { framework: "", format: "", type: "", story: v };
      }
      return null;
    })
    .filter((s): s is StoryItem => s !== null);
}

function toMetaphorArray(value: unknown): MetaphorItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v): MetaphorItem | null => {
      if (typeof v === "object" && v !== null && typeof (v as any).story === "string") {
        return {
          title: typeof (v as any).title === "string" ? (v as any).title : "",
          concept: typeof (v as any).concept === "string" ? (v as any).concept : "",
          story: (v as any).story,
        };
      }
      // Fallback: handle plain strings (old flat-list format)
      if (typeof v === "string" && v.trim().length > 0) {
        return { title: "", concept: "", story: v };
      }
      return null;
    })
    .filter((m): m is MetaphorItem => m !== null);
}

function toParableArray(value: unknown): ParableItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v): ParableItem | null => {
      if (typeof v === "object" && v !== null && typeof (v as any).story === "string") {
        return {
          title: typeof (v as any).title === "string" ? (v as any).title : "",
          lesson: typeof (v as any).lesson === "string" ? (v as any).lesson : "",
          story: (v as any).story,
        };
      }
      // Fallback: handle plain strings (old flat-list format)
      if (typeof v === "string" && v.trim().length > 0) {
        return { title: "", lesson: "", story: v };
      }
      return null;
    })
    .filter((p): p is ParableItem => p !== null);
}

export const generateContent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<GenerateResult> => {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error("N8N_WEBHOOK_URL is not configured");
    }

    // Reserve a slot before doing any expensive work. This runs as the
    // signed-in caller (via their access token) and atomically increments
    // a server-side counter that's independent of the `generations` history
    // table, so deleting past results from History can't free up a slot.
    const supabaseServer = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${data.access_token}` } },
    });
    const { data: generationsUsed, error: reserveError } = await supabaseServer.rpc(
      "reserve_generation_slot",
      { p_limit: GENERATION_LIMIT }
    );
    if (reserveError) {
      if (reserveError.message.includes("generation_limit_reached")) {
        throw new Error(
          `You've used all ${GENERATION_LIMIT} of your free generations for this account.`
        );
      }
      console.error("Failed to reserve a generation slot", reserveError.message);
      throw new Error("Couldn't verify your generation limit. Please try again.");
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Webhook failed", res.status, text);
      throw new Error(`Content generation failed (${res.status})`);
    }

    // Read as text first so we can tell the difference between "the webhook
    // came back empty" (usually a timeout / n8n execution error before the
    // Respond to Webhook node fires) and "the webhook came back with junk".
    // Both used to surface as the opaque "Unexpected end of JSON input".
    const rawText = await res.text();
    if (!rawText.trim()) {
      console.error("Webhook returned an empty body (status " + res.status + ")");
      throw new Error(
        "The content generator returned an empty response. This usually means the n8n workflow timed out or errored before responding — check the n8n execution log, then try again."
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(rawText);
    } catch {
      console.error("Webhook returned invalid JSON", rawText.slice(0, 500));
      throw new Error("The content generator returned an unreadable response. Please try again.");
    }

    const payload = Array.isArray(raw) ? (raw[0] ?? {}) : (raw as Record<string, unknown>);

    return {
      avatar: data.avatar,
      services_profession: data.services_profession,
      audience: data.audience,
      persona: data.persona,
      generated_at: typeof payload.generated_at === "string" ? payload.generated_at : new Date().toISOString(),
      fears: toStringArray(payload.fears),
      frustrations: toStringArray(payload.frustrations),
      dreams: toStringArray(payload.dreams),
      desires: toStringArray(payload.desires),
      hooks: toStringArray(payload.hooks),
      stories: toStoryArray(payload.stories),
      metaphors: toMetaphorArray(payload.metaphors),
      parables: toParableArray(payload.parables),
      linkedin_posts: toStringArray(payload.linkedin_posts),
      facebook_posts: toStringArray(payload.facebook_posts),
      generations_used: generationsUsed as number,
    };
  });
