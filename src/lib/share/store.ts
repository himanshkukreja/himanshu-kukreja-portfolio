import "server-only";
/**
 * Share settings storage (table `share_profiles`, migration 20261016_share_profiles.sql) and the
 * signed-in learner gate for /api/learn/share/*. Service role only: the public page never reads
 * the table from the browser, and the user id always comes from a verified access token.
 *
 * Dev QA fixtures: with NODE_ENV !== "production" AND SHARE_FIXTURES=1, settings and referrals
 * live in memory and `Bearer fixture.<id>` tokens sign in fixture learners (see ./fixtures.ts).
 * Production never takes that branch.
 */
import { supabase } from "@/lib/supabase";
import { getLearner, type Learner } from "@/app/api/learn/_lib/auth";
import { cleanVisibility, type ShareSettings, type Visibility } from "./model";

export const shareFixtures = () => process.env.NODE_ENV !== "production" && process.env.SHARE_FIXTURES === "1";

type PgError = { code?: string; message?: string; details?: string | null } | null;

/** Missing table/column: the share migration isn't applied yet. */
export function isMissing(error: PgError): boolean {
  if (!error) return false;
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code || "")) return true;
  return /does not exist|could not find the/i.test(`${error.message ?? ""} ${error.details ?? ""}`);
}

export type Row = { user_id: string; enabled: boolean; handle: string; visibility: unknown; created_at?: string; updated_at?: string | null };

type FxStore = { settings: Map<string, Row>; referrals: Record<string, unknown>[] };
const g = globalThis as typeof globalThis & { __hkShareFx?: FxStore };

export function fxStore(): FxStore {
  if (!g.__hkShareFx) {
    g.__hkShareFx = { settings: new Map(), referrals: [] };
    // one learner who already shares (the "someone sent you this link" case)
    g.__hkShareFx.settings.set("fx-grace", {
      user_id: "fx-grace",
      enabled: true,
      handle: "grace-h",
      visibility: { name: "full", avatar: false, progress: true, tree: true, streak: true, scores: true, badges: true, milestones: true },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  return g.__hkShareFx;
}

const toSettings = (r: Row): ShareSettings => ({ enabled: !!r.enabled, handle: r.handle, visibility: cleanVisibility(r.visibility), updatedAt: r.updated_at ?? null });

/** Signed-in learner for the share APIs (fixture tokens in dev QA only). */
export async function shareLearner(request: Request): Promise<Learner | null> {
  if (shareFixtures()) {
    const h = request.headers.get("authorization") || "";
    const m = h.match(/^Bearer fixture\.([a-z0-9-]{2,40})$/);
    if (m) return { id: m[1], email: null };
  }
  return getLearner(request);
}

export async function settingsForUser(userId: string): Promise<{ available: boolean; settings: ShareSettings | null }> {
  if (shareFixtures()) {
    const r = fxStore().settings.get(userId);
    return { available: true, settings: r ? toSettings(r) : null };
  }
  const { data, error } = await supabase.from("share_profiles").select("user_id, enabled, handle, visibility, updated_at").eq("user_id", userId).maybeSingle();
  if (error) {
    if (isMissing(error)) return { available: false, settings: null };
    throw new Error(error.message);
  }
  return { available: true, settings: data ? toSettings(data as Row) : null };
}

/** Owner + settings of a handle (enabled or not). null = nobody has it (or the table is missing). */
export async function settingsForHandle(handle: string): Promise<{ userId: string; settings: ShareSettings } | null> {
  if (shareFixtures()) {
    for (const r of fxStore().settings.values()) if (r.handle === handle) return { userId: r.user_id, settings: toSettings(r) };
    return null;
  }
  const { data, error } = await supabase.from("share_profiles").select("user_id, enabled, handle, visibility, updated_at").eq("handle", handle).maybeSingle();
  if (error) {
    if (isMissing(error)) return null;
    throw new Error(error.message);
  }
  return data ? { userId: (data as Row).user_id, settings: toSettings(data as Row) } : null;
}

export class HandleTakenError extends Error {
  constructor() {
    super("That handle is taken.");
  }
}

export class ShareUnavailableError extends Error {
  constructor() {
    super("Sharing isn't switched on for this site yet.");
  }
}

export async function saveSettings(userId: string, s: { enabled: boolean; handle: string; visibility: Visibility }): Promise<ShareSettings> {
  const now = new Date().toISOString();
  if (shareFixtures()) {
    const st = fxStore().settings;
    for (const r of st.values()) if (r.handle === s.handle && r.user_id !== userId) throw new HandleTakenError();
    const prev = st.get(userId);
    const row: Row = { user_id: userId, enabled: s.enabled, handle: s.handle, visibility: s.visibility, created_at: prev?.created_at || now, updated_at: now };
    st.set(userId, row);
    return toSettings(row);
  }
  const owner = await settingsForHandle(s.handle);
  if (owner && owner.userId !== userId) throw new HandleTakenError();
  const { data, error } = await supabase
    .from("share_profiles")
    .upsert({ user_id: userId, enabled: s.enabled, handle: s.handle, visibility: s.visibility, updated_at: now }, { onConflict: "user_id" })
    .select("user_id, enabled, handle, visibility, updated_at")
    .single();
  if (error) {
    if (error.code === "23505") throw new HandleTakenError();
    if (isMissing(error)) throw new ShareUnavailableError();
    throw new Error(error.message);
  }
  return toSettings(data as Row);
}

/** First free variant of a handle: base, base-2, base-3 … (checked against the table). */
export async function freeHandle(base: string, userId: string, ok: (h: string) => boolean): Promise<string> {
  const cut = (h: string, suffix: string) => `${h.slice(0, 24 - suffix.length).replace(/-$/, "")}${suffix}`;
  for (let i = 1; i < 40; i++) {
    const h = i === 1 ? base : cut(base, `-${i}`);
    if (!ok(h)) continue;
    const owner = await settingsForHandle(h).catch(() => null);
    if (!owner || owner.userId === userId) return h;
  }
  return cut(base, `-${Math.random().toString(36).slice(2, 6)}`);
}
