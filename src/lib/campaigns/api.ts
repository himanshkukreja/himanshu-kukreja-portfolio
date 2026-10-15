/** Request parsing + error mapping for /api/admin/newsletter/*. Server-only. */
import { NextResponse } from "next/server";
import { TablesMissingError } from "./store";
import type { Block, EmailDoc } from "./render";
import type { AudienceKind, AudienceSpec } from "./types";

export function apiError(e: unknown): NextResponse {
  if (e instanceof TablesMissingError) return NextResponse.json({ error: e.message, code: "tables-missing", missing: e.missing }, { status: 503 });
  const err = e as Error & { status?: number; expected?: string };
  const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status === 500) console.error("[campaigns]", err);
  return NextResponse.json({ error: err?.message || "Request failed", ...(err?.expected ? { expected: err.expected } : {}) }, { status });
}

export const bad = (message: string, status = 400) => Object.assign(new Error(message), { status });

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

const BLOCK_FIELDS: Record<Block["type"], string[]> = {
  hero: ["eyebrow", "title"],
  text: ["md"],
  button: ["label", "url"],
  feature: ["tag", "title", "md"],
  callout: ["eyebrow", "title", "label", "url"],
  image: ["src", "alt", "href"],
  divider: [],
  html: ["html"],
};

export function parseDoc(v: unknown): EmailDoc {
  const d = v as Record<string, unknown> | null;
  if (!d || typeof d !== "object") throw bad("Missing document");
  if (d.layout === "raw") {
    const html = str(d.html, 400_000);
    if (!html.trim()) throw bad("The HTML is empty");
    return { layout: "raw", html, text: str(d.text, 200_000), source: str(d.source, 200) || undefined };
  }
  if (d.layout !== "blocks" || !Array.isArray(d.blocks)) throw bad("Unknown document layout");
  if (d.blocks.length > 80) throw bad("Too many blocks (max 80)");
  const blocks: Block[] = d.blocks.map((raw, i) => {
    const b = raw as Record<string, unknown>;
    const type = b?.type as Block["type"];
    if (!BLOCK_FIELDS[type]) throw bad(`Block ${i + 1} has an unknown type`);
    const out: Record<string, string> = { id: str(b.id, 40) || `b${i}`, type };
    for (const f of BLOCK_FIELDS[type]) out[f] = str(b[f], type === "html" ? 100_000 : 20_000);
    return out as unknown as Block;
  });
  return { layout: "blocks", topLabel: str(d.topLabel, 60), footer: str(d.footer, 2000), blocks };
}

const KINDS: AudienceKind[] = ["all", "learners", "subscribers", "active", "never_started", "completed", "custom"];

export function parseAudience(v: unknown): AudienceSpec {
  const a = (v || {}) as Record<string, unknown>;
  const kind = KINDS.includes(a.kind as AudienceKind) ? (a.kind as AudienceKind) : "learners";
  const out: AudienceSpec = { kind };
  if (kind === "active") out.days = Math.min(Math.max(Number(a.days) || 30, 1), 3650);
  if (kind === "completed") out.min = Math.min(Math.max(Number(a.min) || 1, 1), 1000);
  if (kind === "custom") out.emails = str(a.emails, 500_000);
  return out;
}

export type ContentInput = {
  name: string;
  subject: string;
  subjectFallback: string | null;
  preheader: string | null;
  template: string;
  doc: EmailDoc;
  senderId: string | null;
  audience: AudienceSpec;
  trackOpens: boolean;
  trackClicks: boolean;
};

export function parseContent(body: unknown): ContentInput {
  const b = (body || {}) as Record<string, unknown>;
  const subject = str(b.subject, 300).replace(/[\r\n]+/g, " ");
  return {
    name: str(b.name, 120).trim() || subject.slice(0, 80) || "Untitled campaign",
    subject,
    subjectFallback: str(b.subjectFallback, 300).replace(/[\r\n]+/g, " ").trim() || null,
    preheader: str(b.preheader, 300).trim() || null,
    template: str(b.template, 40) || "blank",
    doc: parseDoc(b.doc),
    senderId: str(b.senderId, 60) || null,
    audience: parseAudience(b.audience),
    trackOpens: b.trackOpens !== false,
    trackClicks: b.trackClicks !== false,
  };
}
