import "server-only";
import { CODE_ALPHABET, checkCertName, type CertKind } from "@/lib/certificates/core";
import { certFixtures, certStore, CertUnavailableError, type CertRow } from "@/lib/certificates/store";
import { signCertificate, verifySignature } from "@/lib/certificates/sign";
import { getProblemIndex, getWorld } from "../load";
import { dsaLearnerData } from "../learner-data";
import {
  DSA_CERT_KIND,
  DSA_CERT_TRACK,
  DSA_CERT_WORLD,
  foundationsEligibility,
  isDsaCode,
  type DsaCertEvidence,
  type DsaCertView,
  type DsaEligibility,
} from "./rules";

/**
 * The DSA certificate on the server: the learner's state (requirements + any certificate), the claim (rules re-checked
 * against the database, never the browser), and the public verification view. Rows live in SD Mastery's
 * `certificates` table (kind 'dsa', world_key 'foundations', code DSA-XXXX-XXXX, signed like SD Mastery's). The table's
 * checks only allow SD Mastery kinds until supabase/migrations/20261109_dsa_launch_1b.sql is applied: until then a claim
 * answers "switching on soon" (none can be earned yet anyway: the Academy isn't finished).
 *
 * Dev QA: with CERT_FIXTURES=1 (never in production) the code DSA-7F3K-QA22 is a sample certificate, so the
 * verification page and its share image can be checked without the database.
 */

export class DsaCertError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const SAMPLE_CODE = "DSA-7F3K-QA22";
// stored kind: not one of SD Mastery's CertKind values (its own code paths filter by kind and never see these rows)
const KIND = DSA_CERT_KIND as unknown as CertKind;

function newCode(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
  let s = "";
  for (const b of bytes) s += CODE_ALPHABET[b & 31];
  return `DSA-${s.slice(0, 4)}-${s.slice(4)}`;
}

function viewOf(r: CertRow): DsaCertView {
  return {
    code: r.code,
    name: r.display_name,
    issuedAt: r.issued_at,
    status: r.status,
    isPublic: r.is_public,
    evidence: (r.evidence || {}) as Partial<DsaCertEvidence>,
    signature: verifySignature({ code: r.code, userId: r.user_id, kind: "dsa", worldKey: r.world_key, displayName: r.display_name, issuedAt: r.issued_at }, r.signature),
  };
}

async function eligibilityFor(userId: string) {
  const [spec, data] = await Promise.all([getWorld(DSA_CERT_WORLD), dsaLearnerData(userId)]);
  if (!spec) throw new DsaCertError(503, "The Academy map isn't available just now.");
  return { spec, data, eligibility: foundationsEligibility(spec, data.signals) };
}

async function mine(userId: string): Promise<{ available: boolean; row: CertRow | null }> {
  try {
    const rows = await (await certStore()).byUser(userId);
    return { available: true, row: rows.find((r) => String(r.kind) === DSA_CERT_KIND && r.world_key === DSA_CERT_TRACK) || null };
  } catch (e) {
    if (e instanceof CertUnavailableError) return { available: false, row: null };
    throw e;
  }
}

/** GET /api/dsa/certificate */
export async function dsaCertState(userId: string): Promise<{ available: boolean; eligibility: DsaEligibility; certificate: DsaCertView | null }> {
  const [{ eligibility }, own] = await Promise.all([eligibilityFor(userId), mine(userId)]);
  return { available: own.available, eligibility, certificate: own.row ? viewOf(own.row) : null };
}

/** POST /api/dsa/certificate { name, isPublic } */
export async function claimDsaCert(userId: string, input: { name?: unknown; isPublic?: unknown }): Promise<{ certificate: DsaCertView; existing: boolean }> {
  const own = await mine(userId);
  if (!own.available) throw new DsaCertError(503, "Certificates aren't switched on for this site yet.");
  if (own.row) return { certificate: viewOf(own.row), existing: true };
  const name = checkCertName(input.name);
  if (!name.ok) throw new DsaCertError(422, name.error);
  const { eligibility, data } = await eligibilityFor(userId);
  if (!eligibility.eligible) throw new DsaCertError(403, "The certificate needs every part of the Academy finished, including its building reviews and the Launch week final.");
  const bank = await getProblemIndex();
  const level = new Map(bank.map((p) => [p.id, p.level]));
  const solvedByLevel = { easy: 0, medium: 0, hard: 0 };
  for (const id of data.signals.solved) {
    const l = level.get(id);
    if (l) solvedByLevel[l]++;
  }
  const req = Object.fromEntries(eligibility.requirements.map((r) => [r.id, r.done]));
  const evidence: DsaCertEvidence = {
    track: DSA_CERT_TRACK,
    lessons: req.lessons || 0,
    problems: req.practice || 0,
    checkpoints: req.checkpoints || 0,
    reviews: req.reviews || 0,
    languages: [...new Set([...data.langs.values()].flatMap((s) => [...s]))].sort(),
    solvedByLevel,
  };
  const store = await certStore();
  for (let i = 0; i < 6; i++) {
    const code = newCode();
    const issuedAt = new Date().toISOString();
    const signature = signCertificate({ code, userId, kind: "dsa", worldKey: DSA_CERT_TRACK, displayName: name.name, issuedAt });
    let res;
    try {
      res = await store.insert({ code, user_id: userId, kind: KIND, world_key: DSA_CERT_TRACK, display_name: name.name, issued_at: issuedAt, evidence, signature, is_public: input.isPublic !== false });
    } catch (e) {
      // the table's checks don't know kind 'dsa' until the 20261109_dsa_launch_1b migration is applied
      if (e instanceof CertUnavailableError || /check constraint/i.test((e as Error).message || "")) throw new DsaCertError(503, "DSA certificates are switching on soon.");
      throw e;
    }
    if (res.ok) return { certificate: viewOf(res.row), existing: false };
    if (res.conflict === "user") {
      const again = await mine(userId);
      if (again.row) return { certificate: viewOf(again.row), existing: true };
    }
  }
  throw new DsaCertError(500, "Couldn't issue the certificate. Please try again.");
}

function sampleRow(): CertRow {
  const issuedAt = "2027-02-14T08:30:00.000Z";
  const base = { code: SAMPLE_CODE, userId: "fx-dsa-sample", kind: "dsa" as const, worldKey: DSA_CERT_TRACK, displayName: "Ada Lovelace", issuedAt };
  return {
    id: "00000000-0000-4000-8000-0000000d5a01",
    code: SAMPLE_CODE,
    user_id: base.userId,
    kind: KIND,
    world_key: DSA_CERT_TRACK,
    display_name: base.displayName,
    issued_at: issuedAt,
    evidence: { track: DSA_CERT_TRACK, lessons: 42, problems: 118, checkpoints: 18, reviews: 9, languages: ["java", "python"], solvedByLevel: { easy: 46, medium: 61, hard: 11 } },
    signature: signCertificate(base),
    status: "valid",
    revoked_at: null,
    revoke_reason: null,
    is_public: true,
    linkedin_added_at: null,
    created_at: issuedAt,
    updated_at: issuedAt,
  };
}

/** The public verification view of a DSA code, or null (unknown, private, or not a DSA code: all the same 404). */
export async function publicDsaCert(raw: string): Promise<DsaCertView | null> {
  const code = (raw || "").trim().toUpperCase();
  if (!isDsaCode(code)) return null;
  if (certFixtures() && code === SAMPLE_CODE) return viewOf(sampleRow());
  let row: CertRow | null = null;
  try {
    row = await (await certStore()).byCode(code);
  } catch (e) {
    if (e instanceof CertUnavailableError) return null;
    throw e;
  }
  if (!row || String(row.kind) !== DSA_CERT_KIND || !row.is_public) return null;
  return viewOf(row);
}
