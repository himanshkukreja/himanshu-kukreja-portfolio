import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { apiError, bad, parseAudience } from "@/lib/campaigns/api";
import { invalidateAudience, listNamedPeople, namedPeople } from "@/lib/campaigns/audience";
import { storySendSet } from "@/lib/campaigns/engine";
import { getNamesStore } from "@/lib/campaigns/names";
import { checkName, isRecipientEmail } from "@/lib/campaigns/names-core";
import type { AudienceSpec, NamesReply } from "@/lib/campaigns/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Recipient names (Recipients panel). Admin-set names live in public.email_names and only affect
 * newsletter merge tags + admin listings (never user_profiles). Resolution: override → profile name
 * → sign-in metadata name → none.
 *
 *   GET    ?kind=&days=&min=&emails=&storySlug=&q=&missing=1&limit=&offset=   (no kind = everyone)
 *   POST   { audience?, storySlug?, q?, missing?, limit?, offset? }            same, for long custom lists (read-only)
 *          { lookup: [emails] }                                                current names for those addresses (read-only)
 *   PUT    { email, name } | { items: [{ email, name }] }                       set / change (all-or-nothing)
 *   PATCH  same as PUT
 *   DELETE ?email= | { emails: [] }                                             clear → falls back to the profile name
 */

const MAX_ITEMS = 1000;
const NO_STORE = { "Cache-Control": "no-store" };

type ListInput = { audience: AudienceSpec | null; storySlug: string | null; q: string; missing: boolean; limit: number; offset: number };

async function list(input: ListInput) {
  const storyExclude = input.audience && input.storySlug ? await storySendSet(input.storySlug) : undefined;
  const r = await listNamedPeople({ spec: input.audience, storyExclude, q: input.q, missingOnly: input.missing, limit: input.limit, offset: input.offset });
  const reply: NamesReply = { ...r, offset: input.offset, limit: input.limit };
  return NextResponse.json(reply, { headers: NO_STORE });
}

const slug = (v: unknown) => (typeof v === "string" && /^[a-z0-9-]{1,120}$/.test(v) ? v : null);
const num = (v: unknown, d: number, max: number) => Math.min(Math.max(Number(v) || d, 0), max);

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const sp = req.nextUrl.searchParams;
    const kind = sp.get("kind");
    const audience = kind && kind !== "everyone" ? parseAudience({ kind, days: sp.get("days"), min: sp.get("min"), emails: sp.get("emails") }) : null;
    return await list({
      audience,
      storySlug: slug(sp.get("storySlug")),
      q: (sp.get("q") || "").slice(0, 120),
      missing: sp.get("missing") === "1",
      limit: num(sp.get("limit"), 100, 500),
      offset: num(sp.get("offset"), 0, 1_000_000),
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (Array.isArray(b.lookup)) {
      // current names for specific addresses (bulk paste preview)
      const emails = [...new Set(b.lookup.filter((e): e is string => typeof e === "string").map((e) => e.trim().toLowerCase()))].filter(isRecipientEmail).slice(0, MAX_ITEMS);
      return NextResponse.json({ people: await namedPeople(emails) }, { headers: NO_STORE });
    }
    return await list({
      audience: b.audience ? parseAudience(b.audience) : null,
      storySlug: slug(b.storySlug),
      q: typeof b.q === "string" ? b.q.slice(0, 120) : "",
      missing: b.missing === true,
      limit: num(b.limit, 100, 500),
      offset: num(b.offset, 0, 1_000_000),
    });
  } catch (e) {
    return apiError(e);
  }
}

/** Validate every item first; nothing is written unless all are valid. */
function parseItems(body: Record<string, unknown>) {
  const raw = Array.isArray(body.items) ? body.items : [{ email: body.email, name: body.name }];
  if (!raw.length) throw bad("Nothing to save.");
  if (raw.length > MAX_ITEMS) throw bad(`At most ${MAX_ITEMS} names per request.`);
  const errors: { index: number; email: string; error: string }[] = [];
  const byEmail = new Map<string, string>();
  raw.forEach((it, index) => {
    const r = (it || {}) as Record<string, unknown>;
    const email = typeof r.email === "string" ? r.email.trim().toLowerCase() : "";
    if (!email || !isRecipientEmail(email) || email.length > 320) return errors.push({ index, email, error: "Not a valid email address." });
    const c = checkName(r.name);
    if (!c.ok) return errors.push({ index, email, error: c.error });
    byEmail.set(email, c.name); // later items win
  });
  if (errors.length) throw Object.assign(bad(errors.length === 1 ? `${errors[0].email || "item " + (errors[0].index + 1)}: ${errors[0].error}` : `${errors.length} names aren't valid; nothing was saved.`), { errors });
  return [...byEmail].map(([email, name]) => ({ email, name }));
}

async function save(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const items = parseItems((await req.json().catch(() => ({}))) as Record<string, unknown>);
    const saved = await getNamesStore().upsert(items, admin.email);
    invalidateAudience();
    const people = await namedPeople(items.map((i) => i.email));
    return NextResponse.json({ saved: saved.length, people }, { headers: NO_STORE });
  } catch (e) {
    return apiError(e);
  }
}

export const PUT = save;
export const PATCH = save;

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const one = req.nextUrl.searchParams.get("email");
    const body = one ? {} : ((await req.json().catch(() => ({}))) as Record<string, unknown>);
    const emails = (one ? [one] : Array.isArray(body.emails) ? body.emails : []).filter((e): e is string => typeof e === "string").map((e) => e.trim().toLowerCase());
    if (!emails.length) throw bad("Which address? Pass ?email= or { emails: [] }.");
    if (emails.length > MAX_ITEMS) throw bad(`At most ${MAX_ITEMS} addresses per request.`);
    const bad1 = emails.find((e) => !isRecipientEmail(e));
    if (bad1) throw bad(`${bad1}: not a valid email address.`);
    const cleared = await getNamesStore().remove(emails);
    invalidateAudience();
    const people = await namedPeople(emails);
    return NextResponse.json({ cleared, people }, { headers: NO_STORE });
  } catch (e) {
    return apiError(e);
  }
}
