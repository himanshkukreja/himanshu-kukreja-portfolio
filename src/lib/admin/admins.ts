import "server-only";
/**
 * Who is an admin. Two kinds:
 *   owners  OWNER_EMAIL (always, even when a deployment's env lacks ADMIN_EMAIL) plus every ADMIN_EMAIL entry
 *           (comma-separated): admins who may also add and remove admins. In code and env, never in the table.
 *   added   rows of public.admin_users, managed by an owner at /admin/admins: every admin power but managing admins.
 *
 * The table is read at most once a minute per server instance (a module cache, re-read by the first request that finds
 * it stale, concurrent ones sharing that read; a change made here clears it at once on this instance, other instances
 * catch up within the minute). Until the migration is applied (or if the read fails) the list is the owners alone, so nothing breaks;
 * a failed read keeps the last good list rather than dropping everyone added.
 */
import { supabase } from "@/lib/supabase";

const OWNER_EMAIL = "kukreja.him@gmail.com";
const TTL = 60_000;

export const normEmail = (e: string | null | undefined) => (e || "").trim().toLowerCase();
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The owners: OWNER_EMAIL and ADMIN_EMAIL's entries (sync, from code and env). */
export const ownerEmails = () => [...new Set([OWNER_EMAIL, ...(process.env.ADMIN_EMAIL || "").split(",")].map(normEmail).filter(Boolean))];
export const isOwnerEmail = (email: string | null | undefined) => !!email && ownerEmails().includes(normEmail(email));

export type AdminRow = { email: string; added_by: string; added_at: string; note: string | null };

type Cache = { at: number; rows: AdminRow[]; table: boolean };
let cache: Cache | null = null;
let inflight: Promise<Cache> | null = null;
let warned = false;

/** A missing table: Postgres 42P01, or PostgREST's "not in the schema cache" (PGRST205/PGRST204). */
const missingTable = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message || ""));

async function load(): Promise<Cache> {
  const { data, error } = await supabase.from("admin_users").select("email, added_by, added_at, note").order("added_at", { ascending: true }).limit(500);
  if (error) {
    if (!warned) {
      warned = true;
      console.warn(missingTable(error) ? "[admins] admin_users not found: env owners only until the migration is applied" : `[admins] admin_users read failed: ${error.message}`);
    }
    // keep what we knew (a blip shouldn't sign every added admin out); before any good read, owners only
    return { at: Date.now(), rows: cache?.rows ?? [], table: missingTable(error) ? false : (cache?.table ?? false) };
  }
  warned = false;
  return { at: Date.now(), rows: ((data ?? []) as AdminRow[]).map((r) => ({ ...r, email: normEmail(r.email) })), table: true };
}

/** The added admins (cached a minute). `table` false: admin_users isn't there yet (env owners only). */
export async function addedAdmins(fresh = false): Promise<{ rows: AdminRow[]; table: boolean }> {
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache;
  inflight ??= load().finally(() => {
    inflight = null;
  });
  cache = await inflight;
  return cache;
}

/** Forget the cached list (after an add or remove on this instance). */
export function invalidateAdmins() {
  cache = null;
  idCache = null;
}

/** Every admin email: the owners and the added admins (cached a minute). */
export async function adminEmails(): Promise<string[]> {
  const { rows } = await addedAdmins();
  return [...new Set([...ownerEmails(), ...rows.map((r) => r.email)])];
}

/**
 * Sync view for code that can't await: the owners plus the added admins as last read (owners only before the first
 * read on this instance). Prefer `adminEmails()`.
 */
export const adminEmailsSync = () => [...new Set([...ownerEmails(), ...(cache?.rows ?? []).map((r) => r.email)])];

export async function isAdminEmail(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const e = normEmail(email);
  if (ownerEmails().includes(e)) return true;
  return (await addedAdmins()).rows.some((r) => r.email === e);
}

/* ───────────────────── admin accounts' user ids (for "external users only") ───────────────────── */

let idCache: { at: number; key: string; ids: string[] } | null = null;

/**
 * The user ids of every admin's site account (owners and added admins), so the admin AI and chat views can leave
 * their calls out. Matched by email over the auth users (the auth API has no lookup by email; the user base is
 * small, read in pages of 1000, at most 20 pages), cached a minute.
 */
export async function adminUserIds(): Promise<string[]> {
  const emails = await adminEmails();
  const key = emails.slice().sort().join(",");
  if (idCache && idCache.key === key && Date.now() - idCache.at < TTL) return idCache.ids;
  const want = new Set(emails);
  const ids: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const u of data.users) if (want.has(normEmail(u.email))) ids.push(u.id);
    if (data.users.length < 1000) break;
  }
  idCache = { at: Date.now(), key, ids };
  return ids;
}

/* ─────────────────────────────── changes (owner only) ─────────────────────────────── */

export type AuditRow = { id: number; at: string; actor: string; action: "admin.add" | "admin.remove"; target: string; note: string | null };

/** One audit row per change. Never fails the change itself: a missing table or a failed write is logged only. */
async function audit(actor: string, action: AuditRow["action"], target: string, note: string | null) {
  const { error } = await supabase.from("admin_audit").insert({ actor, action, target, note });
  if (error) console.warn(`[admins] audit write failed (${action} ${target} by ${actor}): ${error.message}`);
}

export async function recentAudit(limit = 50): Promise<AuditRow[] | null> {
  const { data, error } = await supabase.from("admin_audit").select("id, at, actor, action, target, note").order("at", { ascending: false }).limit(limit);
  return error ? null : ((data ?? []) as AuditRow[]);
}

export type ChangeResult = { ok: true } | { ok: false; status: number; error: string };

export async function addAdmin(actor: string, rawEmail: string, rawNote?: string | null): Promise<ChangeResult> {
  const email = normEmail(rawEmail);
  const note = (rawNote || "").trim().slice(0, 200) || null;
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, status: 400, error: "That isn't a valid email address." };
  if (isOwnerEmail(email)) return { ok: false, status: 409, error: `${email} is an owner already.` };
  const { error } = await supabase.from("admin_users").insert({ email, added_by: actor, note });
  if (error) {
    if (missingTable(error)) return { ok: false, status: 503, error: "The admin_users table isn't there yet: apply supabase/migrations/20261101_admin_users.sql first." };
    if (error.code === "23505") return { ok: false, status: 409, error: `${email} is an admin already.` };
    return { ok: false, status: 500, error: error.message };
  }
  invalidateAdmins();
  await audit(actor, "admin.add", email, note);
  return { ok: true };
}

export async function removeAdmin(actor: string, rawEmail: string): Promise<ChangeResult> {
  const email = normEmail(rawEmail);
  if (isOwnerEmail(email)) return { ok: false, status: 403, error: "An owner can't be removed here (owners live in the code and the ADMIN_EMAIL env)." };
  const { data, error } = await supabase.from("admin_users").delete().eq("email", email).select("email");
  if (error) return { ok: false, status: missingTable(error) ? 503 : 500, error: missingTable(error) ? "The admin_users table isn't there yet." : error.message };
  if (!data?.length) return { ok: false, status: 404, error: `${email} isn't an added admin.` };
  invalidateAdmins();
  await audit(actor, "admin.remove", email, null);
  return { ok: true };
}
