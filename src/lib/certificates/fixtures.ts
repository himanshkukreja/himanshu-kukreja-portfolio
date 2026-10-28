import "server-only";
/**
 * Dev QA fixtures for certificates (only read when NODE_ENV !== "production" and CERT_FIXTURES=1;
 * see ./store.ts). Learners sign in with `Bearer fixture.<id>` tokens. Evidence is built against
 * the real course map; nothing here touches the database.
 *
 *   fx-cert-ready   everything done, nothing claimed yet (the full earn flow)
 *   fx-cert-mock    everything but the Hire mocks (best so far: Lean hire) — "one step left"
 *   fx-cert-world   first three worlds cleared, World 03 missing a trial part and its boss
 *   fx-grace        already certified: course SDM-7F3K-92QX + W02-4QX8 (public), W01-H7P2
 *                   (revoked), W00-ZK3P (private, so its page is a 404); shares /u/grace-h
 *   fx-priya, fx-rohan, fx-meera   more rows for the admin table
 */
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { courseEligibility, courseShape, evidenceSnapshot, MOCKS_NEEDED, worldEligibility, worldTopics, type CertCourse, type LearnerEvidence } from "./core";
import { signCertificate } from "./sign";
import type { LoadedLearner } from "./data";
import type { CertPatch, CertRow, CertStore, InsertResult, NewCert } from "./store";

if (process.env.NODE_ENV === "production") throw new Error("certificate fixtures are dev-only");

export const FIXTURE_PEOPLE: Record<string, { name: string; email: string }> = {
  "fx-cert-ready": { name: "Ada Lovelace", email: "ada@example.com" },
  "fx-cert-mock": { name: "Alan Turing", email: "alan@example.com" },
  "fx-cert-world": { name: "Katherine Johnson", email: "katherine@example.com" },
  "fx-grace": { name: "Grace Hopper", email: "grace@example.com" },
  "fx-priya": { name: "Priya Nair", email: "priya@example.com" },
  "fx-rohan": { name: "Rohan Gupta", email: "rohan@example.net" },
  "fx-meera": { name: "Meera Joshi", email: "meera@example.dev" },
};

const DAY = 86_400_000;
const T0 = Date.parse("2026-09-01T06:00:00.000Z");
const iso = (t: number) => new Date(t).toISOString();

function evidenceFor(course: CertCourse, o: { worlds: number; partialMissingPart?: number; mock: "hire" | "strong-hire" | "lean-hire" | null }): LearnerEvidence {
  const ev: LearnerEvidence = { lessons: {}, trials: {}, trialsRecordedOnly: [], bosses: {}, offers: {}, bestMock: null };
  let t = T0;
  course.worlds.forEach((w, i) => {
    const full = i < o.worlds;
    const partial = i === o.worlds && o.partialMissingPart !== undefined;
    if (!full && !partial) return;
    w.lessons.forEach((l) => (ev.lessons[`${l.week}/${l.slug}`] = { at: iso((t += DAY / 3)), seconds: 1500 + ((t / 1000) % 900) }));
    (w.trial?.parts || []).forEach((p) => {
      if (partial && p.n === o.partialMissingPart) {
        ev.trialsRecordedOnly!.push(`${w.trial!.week}|${p.n}`);
        return;
      }
      ev.trials[`${w.trial!.week}|${p.n}`] = { score: p.questions - (p.n % 3), total: p.questions, at: iso((t += 3_600_000)), seconds: p.questions * 31, source: "attempt" };
    });
    if (full && w.boss) {
      ev.lessons[`${w.boss.week}/${w.boss.slug}`] = { at: iso((t += DAY / 8)), seconds: 2400 };
      ev.bosses[w.key] = t += DAY / 4;
    }
  });
  // the last MOCKS_NEEDED mocks, all at the same verdict ("lean-hire": none count)
  if (o.mock && course.mocks[0]) {
    course.mocks.slice(-MOCKS_NEEDED).forEach((m, k) => {
      const r = { verdict: o.mock!, level: "senior", pct: (o.mock === "strong-hire" ? 0.88 : o.mock === "hire" ? 0.74 : 0.58) - k / 100, at: t + DAY * (k + 1) };
      if (!ev.bestMock || r.pct > ev.bestMock.pct) ev.bestMock = { id: m.id, ...r };
      if (o.mock !== "lean-hire") ev.offers[m.id] = r;
    });
  }
  return ev;
}

let shape: Promise<CertCourse> | null = null;
export function fixtureCourse(): Promise<CertCourse> {
  shape ??= getCourseMap(COURSE_ID).then((m) => {
    if (!m) throw new Error("course map unavailable");
    return courseShape(m);
  });
  return shape;
}

export async function fixtureLearner(userId: string): Promise<LoadedLearner | null> {
  const course = await fixtureCourse();
  const n = course.worlds.length;
  const name = FIXTURE_PEOPLE[userId]?.name ?? null;
  if (userId === "fx-cert-ready" || userId === "fx-grace" || userId === "fx-meera") return { evidence: evidenceFor(course, { worlds: n, mock: userId === "fx-meera" ? "strong-hire" : "hire" }), fullName: name };
  if (userId === "fx-cert-mock") return { evidence: evidenceFor(course, { worlds: n, mock: "lean-hire" }), fullName: name };
  if (userId === "fx-cert-world") return { evidence: evidenceFor(course, { worlds: 3, partialMissingPart: 4, mock: null }), fullName: name };
  if (userId === "fx-priya" || userId === "fx-rohan") return { evidence: evidenceFor(course, { worlds: 5, mock: null }), fullName: name };
  return null;
}

/* ------------------------------------------------------------------ store */

type Mem = { rows: Map<string, CertRow>; views: Map<string, number>; seeded: Promise<void> | null };
const g = globalThis as typeof globalThis & { __hkCertFx?: Mem };
const mem = (): Mem => (g.__hkCertFx ??= { rows: new Map(), views: new Map(), seeded: null });

async function seed(m: Mem) {
  const course = await fixtureCourse();
  const make = async (userId: string, code: string, kind: "course" | "world", worldNum: number | null, at: number, extra: Partial<CertRow> = {}) => {
    const learner = (await fixtureLearner(userId))!;
    const w = worldNum === null ? null : course.worlds.find((x) => x.num === worldNum) || null;
    const e = kind === "course" ? courseEligibility(course, learner.evidence) : worldEligibility(course, w!.key, learner.evidence)!;
    const evidence = { ...evidenceSnapshot(course, e, learner.evidence, new Date(at)), world: w ? { key: w.key, num: w.num, code: w.code, title: w.title, topics: worldTopics(w), of: course.worlds.length } : null };
    const issuedAt = iso(at);
    const name = FIXTURE_PEOPLE[userId].name;
    const row: CertRow = {
      id: `00000000-0000-4000-8000-${String(m.rows.size + 1).padStart(12, "0")}`,
      code,
      user_id: userId,
      kind,
      world_key: w?.key ?? null,
      display_name: name,
      issued_at: issuedAt,
      evidence,
      signature: signCertificate({ code, userId, kind, worldKey: w?.key ?? null, displayName: name, issuedAt }),
      status: "valid",
      revoked_at: null,
      revoke_reason: null,
      is_public: true,
      linkedin_added_at: null,
      created_at: issuedAt,
      updated_at: issuedAt,
      ...extra,
    };
    m.rows.set(row.id, row);
    return row;
  };
  const oct = (d: number) => Date.parse(`2026-10-${String(d).padStart(2, "0")}T08:30:00.000Z`);
  const a = await make("fx-grace", "SDM-7F3K-92QX", "course", null, oct(18), { linkedin_added_at: iso(oct(18) + 600_000) });
  const b = await make("fx-grace", "W02-4QX8", "world", 2, oct(12));
  await make("fx-grace", "W01-H7P2", "world", 1, oct(9), { status: "revoked", revoked_at: iso(oct(15)), revoke_reason: "QA fixture: revoked to test the public state" });
  await make("fx-grace", "W00-ZK3P", "world", 0, oct(5), { is_public: false });
  await make("fx-priya", "W02-QX8M", "world", 2, oct(11), { linkedin_added_at: iso(oct(11)) });
  await make("fx-rohan", "W04-ZK3T", "world", 4, oct(7));
  const c = await make("fx-meera", "SDM-2LMB-5TQA", "course", null, oct(1), { linkedin_added_at: iso(oct(2)) });
  m.views.set(a.id, 41);
  m.views.set(b.id, 9);
  m.views.set(c.id, 23);
}

export function fixtureStore(): CertStore {
  const m = mem();
  const ready = async () => {
    m.seeded ??= seed(m).catch((e) => {
      m.seeded = null;
      throw e;
    });
    await m.seeded;
  };
  const all = async () => {
    await ready();
    return [...m.rows.values()];
  };
  return {
    kind: "fixtures",
    async byUser(userId) {
      return (await all()).filter((r) => r.user_id === userId).sort((x, y) => x.issued_at.localeCompare(y.issued_at));
    },
    async byCode(code) {
      return (await all()).find((r) => r.code === code) ?? null;
    },
    async byId(id) {
      await ready();
      return m.rows.get(id) ?? null;
    },
    async codeTaken(code) {
      return (await all()).some((r) => r.code === code);
    },
    async insert(row: NewCert): Promise<InsertResult> {
      const rows = await all();
      if (rows.some((r) => r.code === row.code)) return { ok: false, conflict: "code" };
      if (rows.some((r) => r.user_id === row.user_id && r.kind === row.kind && (r.world_key ?? null) === (row.world_key ?? null))) return { ok: false, conflict: "user" };
      const now = new Date().toISOString();
      const full: CertRow = { ...row, id: crypto.randomUUID(), status: "valid", revoked_at: null, revoke_reason: null, linkedin_added_at: null, created_at: now, updated_at: now };
      m.rows.set(full.id, full);
      return { ok: true, row: full };
    },
    async remove(id: string) {
      await ready();
      m.rows.delete(id);
    },
    async update(id, patch: CertPatch) {
      await ready();
      const r = m.rows.get(id);
      if (!r) return null;
      const next = { ...r, ...patch, updated_at: new Date().toISOString() };
      m.rows.set(id, next);
      return next;
    },
    async list() {
      return (await all()).sort((x, y) => y.issued_at.localeCompare(x.issued_at));
    },
    async views() {
      await ready();
      return Object.fromEntries(m.views);
    },
    async bumpView(code) {
      const r = (await all()).find((x) => x.code === code && x.is_public);
      if (r) m.views.set(r.id, (m.views.get(r.id) || 0) + 1);
    },
  };
}
