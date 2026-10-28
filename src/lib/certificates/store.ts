import "server-only";
/**
 * Certificate storage: table `certificates` + `certificate_views` (migration
 * 20261019_certificates.sql), service role only.
 *
 * Dev QA fixtures: with NODE_ENV !== "production" AND CERT_FIXTURES=1 the same interface lives in
 * memory (./fixtures.ts), so the learner flow, /cert pages and /admin?preview=1 work end to end
 * without the database. Production never takes that branch.
 */
import { supabase } from "@/lib/supabase";
import { isMissing } from "./data";
import type { CertKind } from "./core";

export const certFixtures = () => process.env.NODE_ENV !== "production" && process.env.CERT_FIXTURES === "1";

export type CertRow = {
  id: string;
  code: string;
  user_id: string;
  kind: CertKind;
  world_key: string | null;
  display_name: string;
  issued_at: string;
  evidence: Record<string, unknown>;
  signature: string;
  status: "valid" | "revoked";
  revoked_at: string | null;
  revoke_reason: string | null;
  is_public: boolean;
  linkedin_added_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NewCert = Pick<CertRow, "code" | "user_id" | "kind" | "world_key" | "display_name" | "issued_at" | "evidence" | "signature" | "is_public">;
export type CertPatch = Partial<Pick<CertRow, "status" | "revoked_at" | "revoke_reason" | "is_public" | "linkedin_added_at">>;

export class CertUnavailableError extends Error {
  constructor() {
    super("Certificates aren't switched on for this site yet.");
  }
}

export type InsertResult = { ok: true; row: CertRow } | { ok: false; conflict: "code" | "user" };

export interface CertStore {
  kind: "supabase" | "fixtures";
  byUser(userId: string): Promise<CertRow[]>;
  byCode(code: string): Promise<CertRow | null>;
  byId(id: string): Promise<CertRow | null>;
  codeTaken(code: string): Promise<boolean>;
  insert(row: NewCert): Promise<InsertResult>;
  update(id: string, patch: CertPatch): Promise<CertRow | null>;
  /** the learner withdraws a certificate: the row and its view counts go (FK cascade) */
  remove(id: string): Promise<void>;
  list(): Promise<CertRow[]>;
  /** total verification views per certificate id since `day` (YYYY-MM-DD, inclusive) */
  views(sinceDay: string): Promise<Record<string, number>>;
  /** +1 view today for a public certificate, by code (no-op otherwise) */
  bumpView(code: string): Promise<void>;
}

const COLS = "id, code, user_id, kind, world_key, display_name, issued_at, evidence, signature, status, revoked_at, revoke_reason, is_public, linkedin_added_at, created_at, updated_at";

function fail(error: { code?: string; message?: string; details?: string | null }): never {
  if (isMissing(error)) throw new CertUnavailableError();
  throw new Error(error.message || "certificates query failed");
}

const supabaseStore: CertStore = {
  kind: "supabase",
  async byUser(userId) {
    const { data, error } = await supabase.from("certificates").select(COLS).eq("user_id", userId).order("issued_at", { ascending: true });
    if (error) fail(error);
    return (data || []) as CertRow[];
  },
  async byCode(code) {
    const { data, error } = await supabase.from("certificates").select(COLS).eq("code", code).maybeSingle();
    if (error) fail(error);
    return (data as CertRow | null) ?? null;
  },
  async byId(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data, error } = await supabase.from("certificates").select(COLS).eq("id", id).maybeSingle();
    if (error) fail(error);
    return (data as CertRow | null) ?? null;
  },
  async codeTaken(code) {
    const { count, error } = await supabase.from("certificates").select("id", { count: "exact", head: true }).eq("code", code);
    if (error) fail(error);
    return (count || 0) > 0;
  },
  async insert(row) {
    const { data, error } = await supabase.from("certificates").insert(row).select(COLS).single();
    if (error) {
      if (error.code === "23505") return { ok: false, conflict: /one_per_user/.test(`${error.message} ${error.details ?? ""}`) ? "user" : "code" };
      fail(error);
    }
    return { ok: true, row: data as CertRow };
  },
  async update(id, patch) {
    const { data, error } = await supabase.from("certificates").update(patch).eq("id", id).select(COLS).maybeSingle();
    if (error) fail(error);
    return (data as CertRow | null) ?? null;
  },
  async remove(id) {
    const { error } = await supabase.from("certificates").delete().eq("id", id);
    if (error) fail(error);
  },
  async list() {
    const { data, error } = await supabase.from("certificates").select(COLS).order("issued_at", { ascending: false }).limit(5000);
    if (error) fail(error);
    return (data || []) as CertRow[];
  },
  async views(sinceDay) {
    const { data, error } = await supabase.from("certificate_views").select("certificate_id, views").gte("day", sinceDay).limit(20000);
    if (error) {
      if (isMissing(error)) return {};
      throw new Error(error.message);
    }
    const out: Record<string, number> = {};
    ((data || []) as { certificate_id: string; views: number }[]).forEach((r) => (out[r.certificate_id] = (out[r.certificate_id] || 0) + (r.views || 0)));
    return out;
  },
  async bumpView(code) {
    await supabase.rpc("certificate_view_bump", { p_code: code });
  },
};

let fx: CertStore | null = null;

export async function certStore(): Promise<CertStore> {
  if (certFixtures()) {
    if (!fx) fx = (await import("./fixtures")).fixtureStore();
    return fx;
  }
  return supabaseStore;
}
