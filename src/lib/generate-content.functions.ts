import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  avatar: z.string().trim().min(1).max(2000),
  services_profession: z.string().trim().min(1).max(500),
  audience: z.string().trim().min(1).max(500),
});

export type GenerateInput = z.infer<typeof inputSchema>;

export interface GenerateResult {
  avatar: string;
  services_profession: string;
  audience: string;
  generated_at: string;
  fears: string[];
  frustrations: string[];
  dreams: string[];
  desires: string[];
  hooks: string[];
  stories: string[];
  linkedin_posts: string[];
  facebook_posts: string[];
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)))
      .filter((s) => s && s.trim().length > 0);
  }
  return [];
}

export const generateContent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<GenerateResult> => {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error("N8N_WEBHOOK_URL is not configured");
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

    const raw = await res.json();
    // n8n sometimes wraps responses in an array
    const payload = Array.isArray(raw) ? raw[0] ?? {} : raw;

    return {
      avatar: data.avatar,
      services_profession: data.services_profession,
      audience: data.audience,
      generated_at: typeof payload.generated_at === "string" ? payload.generated_at : new Date().toISOString(),
      fears: toStringArray(payload.fears),
      frustrations: toStringArray(payload.frustrations),
      dreams: toStringArray(payload.dreams),
      desires: toStringArray(payload.desires),
      hooks: toStringArray(payload.hooks),
      stories: toStringArray(payload.stories),
      linkedin_posts: toStringArray(payload.linkedin_posts),
      facebook_posts: toStringArray(payload.facebook_posts),
    };
  });
