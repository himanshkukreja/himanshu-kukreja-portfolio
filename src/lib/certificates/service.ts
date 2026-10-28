import "server-only";
/**
 * Certificates, end to end on the server: the learner's checklist, claiming (idempotent, with the
 * rules re-checked at issue time), the public verification view, the learner's own toggles and
 * the admin list / revoke / restore / stats.
 */
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { settingsForUser } from "@/lib/share/store";
import {
  checkCertName,
  courseEligibility,
  courseShape,
  evidenceLine,
  evidenceSnapshot,
  suggestCertName,
  uniqueCode,
  worldEligibility,
  worldTopics,
  type CertCourse,
  type CertificateView,
  type CertKind,
  type CertState,
  type CertStats,
  type Eligibility,
  type EvidenceSnapshot,
} from "./core";
import { signCertificate, signingSource, verifySignature } from "./sign";
import { loadLearner, type LoadedLearner } from "./data";
import { certFixtures, certStore, CertUnavailableError, type CertRow } from "./store";

export class CertError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly extra?: Record<string, unknown>
  ) {
    super(message);
  }
}

async function course(): Promise<CertCourse> {
  const map = await getCourseMap(COURSE_ID);
  if (!map) throw new CertError(503, "The course couldn't be loaded. Try again in a minute.");
  return courseShape(map);
}

async function learner(userId: string, c: CertCourse): Promise<LoadedLearner> {
  if (certFixtures()) {
    const fx = await (await import("./fixtures")).fixtureLearner(userId);
    if (fx) return fx;
  }
  try {
    return await loadLearner(userId, COURSE_ID, c);
  } catch (e) {
    console.error("[certificates] evidence", e instanceof Error ? e.message : e);
    throw new CertError(503, "Your progress couldn't be checked right now. Try again in a minute.");
  }
}

type WorldInfo = { key: string; num: number; code: string; title: string; topics: string[]; of?: number };

function worldInfo(row: CertRow, c: CertCourse | null): WorldInfo | null {
  if (row.kind !== "world") return null;
  const snap = (row.evidence as { world?: WorldInfo | null }).world;
  if (snap && typeof snap.title === "string") return snap;
  const w = c?.worlds.find((x) => x.key === row.world_key);
  const num = Number(row.code.slice(1, 3));
  return w ? { key: w.key, num: w.num, code: w.code, title: w.title, topics: worldTopics(w), of: c?.worlds.length } : { key: row.world_key || "", num, code: row.code.slice(1, 3), title: `World ${row.code.slice(1, 3)}`, topics: [] };
}

export function toView(row: CertRow, c: CertCourse | null): CertificateView {
  const stats = ((row.evidence as Partial<EvidenceSnapshot>).stats as CertStats | undefined) ?? null;
  return {
    code: row.code,
    kind: row.kind,
    world: worldInfo(row, c),
    name: row.display_name,
    issuedAt: new Date(row.issued_at).toISOString(),
    status: row.status,
    revokedAt: row.revoked_at,
    isPublic: row.is_public,
    linkedinAddedAt: row.linkedin_added_at,
    stats,
  };
}

/**
 * The verification page, its print + image routes and the middleware's existence check are cached
 * (on-demand ISR); every status change refreshes them so it shows at once.
 */
function refreshPublic(code: string) {
  try {
    revalidatePath(`/cert/${code}`, "layout");
    revalidatePath(`/api/cert/exists/${code}`);
  } catch (e) {
    // outside a request (scripts, tests): nothing is cached there
    console.warn("[certificates] revalidate", e instanceof Error ? e.message : e);
  }
}

const signedFields = (r: CertRow) => ({ code: r.code, userId: r.user_id, kind: r.kind, worldKey: r.world_key, displayName: r.display_name, issuedAt: r.issued_at });

/* ------------------------------------------------------------------ learner */

async function rowsFor(userId: string): Promise<{ available: boolean; rows: CertRow[] }> {
  try {
    return { available: true, rows: await (await certStore()).byUser(userId) };
  } catch (e) {
    if (e instanceof CertUnavailableError) return { available: false, rows: [] };
    throw e;
  }
}

async function metadataName(userId: string): Promise<string | null> {
  if (certFixtures()) return null;
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    const m = (data?.user?.user_metadata || {}) as { full_name?: unknown; name?: unknown };
    return typeof m.full_name === "string" ? m.full_name : typeof m.name === "string" ? m.name : null;
  } catch {
    return null;
  }
}

/** GET /api/learn/certificates */
export async function learnerState(userId: string): Promise<CertState> {
  const c = await course();
  const [l, certs, meta] = await Promise.all([learner(userId, c), rowsFor(userId), metadataName(userId)]);
  const find = (kind: CertKind, world: string | null) => certs.rows.find((r) => r.kind === kind && (r.world_key ?? null) === world) ?? null;
  const courseCert = find("course", null);
  return {
    available: certs.available,
    signing: !!signingSource(),
    badges: !!(await import("./badges")).badgeKey(),
    suggestedName: suggestCertName(courseCert?.display_name, certs.rows[0]?.display_name, l.fullName, meta),
    course: { eligibility: courseEligibility(c, l.evidence), certificate: courseCert ? toView(courseCert, c) : null },
    worlds: c.worlds.map((w) => {
      const row = find("world", w.key);
      return { key: w.key, num: w.num, code: w.code, title: w.title, eligibility: worldEligibility(c, w.key, l.evidence)!, certificate: row ? toView(row, c) : null };
    }),
  };
}

/** POST /api/learn/certificates/claim — re-claiming returns the certificate already issued. */
export async function claim(userId: string, input: { kind?: unknown; world?: unknown; name?: unknown; isPublic?: unknown }): Promise<{ certificate: CertificateView; existing: boolean }> {
  const kind: CertKind | null = input.kind === "course" || input.kind === "world" ? input.kind : null;
  if (!kind) throw new CertError(400, "Unknown certificate.");
  const c = await course();
  const w = kind === "world" ? c.worlds.find((x) => x.key === input.world) : null;
  if (kind === "world" && !w) throw new CertError(400, "Unknown world.");
  const worldKey = w?.key ?? null;

  const store = await certStore();
  const existing = async () => (await store.byUser(userId)).find((r) => r.kind === kind && (r.world_key ?? null) === worldKey) ?? null;
  let prev: CertRow | null;
  try {
    prev = await existing();
  } catch (e) {
    if (e instanceof CertUnavailableError) throw new CertError(503, e.message, "unavailable");
    throw e;
  }
  if (prev) return { certificate: toView(prev, c), existing: true };

  const name = checkCertName(input.name);
  if (!name.ok) throw new CertError(400, name.error, "name");
  if (!signingSource()) throw new CertError(503, "Certificates can't be signed on this server yet.", "signing");

  // the rules, again, from the database (never from the request)
  const l = await learner(userId, c);
  const e: Eligibility | null = kind === "course" ? courseEligibility(c, l.evidence) : worldEligibility(c, worldKey!, l.evidence);
  if (!e || !e.eligible) throw new CertError(409, "Not every requirement is met yet.", "not_eligible", { eligibility: e });

  const evidence = { ...evidenceSnapshot(c, e, l.evidence), world: w ? { key: w.key, num: w.num, code: w.code, title: w.title, topics: worldTopics(w), of: c.worlds.length } : null };
  for (let i = 0; i < 5; i++) {
    const code = await uniqueCode(kind, w ? w.num : null, (x) => store.codeTaken(x));
    // ISO with milliseconds: Postgres keeps them exactly, so the row read back signs the same way
    const issuedAt = new Date().toISOString();
    const signature = signCertificate({ code, userId, kind, worldKey, displayName: name.name, issuedAt });
    const res = await store.insert({ code, user_id: userId, kind, world_key: worldKey, display_name: name.name, issued_at: issuedAt, evidence, signature, is_public: input.isPublic === true });
    if (res.ok) {
      refreshPublic(code);
      return { certificate: toView(res.row, c), existing: false };
    }
    if (res.conflict === "user") {
      const row = await existing();
      if (row) return { certificate: toView(row, c), existing: true };
    }
    // code collision: try another code
  }
  throw new CertError(500, "Couldn't issue the certificate. Try again.");
}

async function ownRow(userId: string, code: string): Promise<CertRow> {
  const row = await (await certStore()).byCode(code);
  if (!row || row.user_id !== userId) throw new CertError(404, "Certificate not found.");
  return row;
}

/** PATCH /api/learn/certificates/<code> { isPublic } */
export async function setPublic(userId: string, code: string, isPublic: boolean): Promise<CertificateView> {
  const row = await ownRow(userId, code);
  const next = await (await certStore()).update(row.id, { is_public: isPublic });
  refreshPublic(row.code);
  return toView(next || row, null);
}

/**
 * DELETE /api/learn/certificates/<code> — the learner withdraws a certificate (DPDP: their data, their
 * call). Its verification page and QR code stop working at once; they can claim again while they still
 * meet the rules. A revoked certificate can't be withdrawn (that would clear the revocation).
 */
export async function withdraw(userId: string, code: string): Promise<void> {
  const row = await ownRow(userId, code);
  if (row.status === "revoked") throw new CertError(409, "A revoked certificate can't be withdrawn. Use the contact form on the site if you think it's a mistake.", "revoked");
  await (await certStore()).remove(row.id);
  refreshPublic(row.code);
}

/** POST /api/learn/certificates/<code>/linkedin — first press only. */
export async function markLinkedin(userId: string, code: string): Promise<void> {
  const row = await ownRow(userId, code);
  if (!row.linkedin_added_at) await (await certStore()).update(row.id, { linkedin_added_at: new Date().toISOString() });
}

/* ------------------------------------------------------------------ public */

export type PublicCert = {
  view: CertificateView;
  /** HMAC check of the stored record */
  signature: "ok" | "bad" | "unchecked";
  /** the learner's public progress page, only when it's switched on */
  profileHandle: string | null;
};

async function publicRow(code: string): Promise<CertRow | null> {
  try {
    const row = await (await certStore()).byCode(code);
    return row && row.is_public ? row : null;
  } catch (e) {
    if (e instanceof CertUnavailableError) return null;
    throw e;
  }
}

/** Is /cert/<code> a page? Unknown and private codes are the same 404. */
export async function certExists(code: string): Promise<boolean> {
  return !!(await publicRow(code));
}

export async function publicCertificate(code: string): Promise<PublicCert | null> {
  const row = await publicRow(code);
  if (!row) return null;
  const c = await course().catch(() => null);
  const share = await settingsForUser(row.user_id).catch(() => null);
  return {
    view: toView(row, c),
    signature: verifySignature(signedFields(row), row.signature),
    profileHandle: share?.settings?.enabled ? share.settings.handle : null,
  };
}

/** +1 verification view (one database call; ignored for unknown / private codes). */
export async function bumpView(code: string): Promise<void> {
  await (await certStore()).bumpView(code);
}

/* ------------------------------------------------------------------ Open Badges */

async function emailOf(userId: string): Promise<string | null> {
  if (certFixtures()) return (await import("./fixtures")).FIXTURE_PEOPLE[userId]?.email ?? null;
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

/** GET /api/learn/certificates/<code>/badge — the owner's Open Badges 3.0 credential (signed JWT). */
export async function ownBadge(userId: string, code: string): Promise<{ jwt: string; credential: unknown; assertion: string | null }> {
  const { badgeKey, ob3Credential, signOb3, assertionUrl } = await import("./badges");
  if (!badgeKey()) throw new CertError(503, "Open Badges aren't switched on yet.", "badges");
  const row = await ownRow(userId, code);
  if (row.status !== "valid") throw new CertError(409, "A revoked certificate has no badge.", "revoked");
  const c = await course().catch(() => null);
  const view = toView(row, c);
  const credential = ob3Credential(view, await emailOf(userId));
  return { jwt: signOb3(credential), credential, assertion: row.is_public ? assertionUrl(row.code) : null };
}

/** /cert/<code>/badge.json — the Open Badges 2.0 hosted assertion of a public certificate (null otherwise). */
export async function publicAssertion(code: string): Promise<Record<string, unknown> | null> {
  const row = await publicRow(code);
  if (!row) return null;
  const email = await emailOf(row.user_id);
  if (!email) return null;
  const { ob2Assertion } = await import("./badges");
  return ob2Assertion(toView(row, null), email);
}

/* ------------------------------------------------------------------ admin */

export type AdminCertRow = {
  id: string;
  code: string;
  kind: CertKind;
  label: string;
  name: string;
  email: string | null;
  userId: string;
  issuedAt: string;
  status: "valid" | "revoked";
  revokedAt: string | null;
  revokeReason: string | null;
  isPublic: boolean;
  linkedinAddedAt: string | null;
  views30d: number;
  evidence: string;
  flags: string[];
  signature: "ok" | "bad" | "unchecked";
};

export type AdminCerts = {
  available: boolean;
  stats: { course: number; world: number; revoked: number; views30d: number; linkedin: number };
  rows: AdminCertRow[];
};

async function emails(userIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!userIds.length) return out;
  if (certFixtures()) {
    const { FIXTURE_PEOPLE } = await import("./fixtures");
    userIds.forEach((id) => FIXTURE_PEOPLE[id] && (out[id] = FIXTURE_PEOPLE[id].email));
    return out;
  }
  const want = new Set(userIds);
  for (let page = 1; page <= 20 && want.size; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    data.users.forEach((u) => {
      if (want.has(u.id) && u.email) {
        out[u.id] = u.email;
        want.delete(u.id);
      }
    });
    if (data.users.length < 1000) break;
  }
  return out;
}

const dayMinus = (n: number) => new Date(Date.now() + 330 * 60_000 - n * 86_400_000).toISOString().slice(0, 10);

export async function adminList(q = ""): Promise<AdminCerts> {
  const store = await certStore();
  let rows: CertRow[];
  try {
    rows = await store.list();
  } catch (e) {
    if (e instanceof CertUnavailableError) return { available: false, stats: { course: 0, world: 0, revoked: 0, views30d: 0, linkedin: 0 }, rows: [] };
    throw e;
  }
  const [mail, views] = await Promise.all([emails([...new Set(rows.map((r) => r.user_id))]), store.views(dayMinus(30))]);
  const all: AdminCertRow[] = rows.map((r) => {
    const ev = r.evidence as Partial<EvidenceSnapshot> & { world?: WorldInfo | null };
    return {
      id: r.id,
      code: r.code,
      kind: r.kind,
      label: r.kind === "course" ? "Course" : `World ${r.code.slice(1, 3)}${ev.world?.title ? ` · ${ev.world.title}` : ""}`,
      name: r.display_name,
      email: mail[r.user_id] ?? null,
      userId: r.user_id,
      issuedAt: new Date(r.issued_at).toISOString(),
      status: r.status,
      revokedAt: r.revoked_at,
      revokeReason: r.revoke_reason,
      isPublic: r.is_public,
      linkedinAddedAt: r.linkedin_added_at,
      views30d: views[r.id] || 0,
      evidence: evidenceLine(r.kind, ev),
      flags: Array.isArray(ev.flags) ? ev.flags.filter((f): f is string => typeof f === "string") : [],
      signature: verifySignature(signedFields(r), r.signature),
    };
  });
  const needle = q.trim().toLowerCase();
  const filtered = needle ? all.filter((r) => [r.name, r.email || "", r.code, r.label].some((s) => s.toLowerCase().includes(needle))) : all;
  return {
    available: true,
    stats: {
      course: all.filter((r) => r.kind === "course" && r.status === "valid").length,
      world: all.filter((r) => r.kind === "world" && r.status === "valid").length,
      revoked: all.filter((r) => r.status === "revoked").length,
      views30d: Object.values(views).reduce((a, b) => a + b, 0),
      linkedin: all.filter((r) => !!r.linkedinAddedAt).length,
    },
    rows: filtered,
  };
}

export async function adminSetStatus(id: string, action: "revoke" | "restore", reason: string): Promise<CertRow> {
  const store = await certStore();
  const row = await store.byId(id);
  if (!row) throw new CertError(404, "Certificate not found.");
  let next: CertRow | null;
  if (action === "revoke") {
    const r = reason.trim().slice(0, 500);
    if (!r) throw new CertError(400, "Give a reason (kept private, never shown publicly).");
    next = await store.update(id, { status: "revoked", revoked_at: new Date().toISOString(), revoke_reason: r });
  } else {
    next = await store.update(id, { status: "valid", revoked_at: null, revoke_reason: null });
  }
  refreshPublic(row.code);
  return next || row;
}

const csvCell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  // spreadsheet formula injection: a leading = + - @ is made inert
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export async function adminCsv(): Promise<string> {
  const { rows } = await adminList();
  const head = ["code", "kind", "certificate", "name", "email", "issued_at", "status", "revoked_at", "revoke_reason", "public", "linkedin_added_at", "views_30d", "evidence", "flags", "signature"];
  const lines = rows.map((r) => [r.code, r.kind, r.label, r.name, r.email, r.issuedAt, r.status, r.revokedAt, r.revokeReason, r.isPublic ? "yes" : "no", r.linkedinAddedAt, r.views30d, r.evidence, r.flags.join("; "), r.signature].map(csvCell).join(","));
  return [head.join(","), ...lines].join("\n");
}
