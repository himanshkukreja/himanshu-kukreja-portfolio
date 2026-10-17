/**
 * Admin-set recipient names (public.email_names, supabase/migrations/20261017_email_names.sql).
 * Server-only. Email-only display names for newsletter merge tags + listings; they never touch
 * user_profiles.
 *
 * Fails soft: until the migration is applied every read returns "no overrides" (ready: false) and
 * writes throw NamesMissingError (503 with an "apply migration" message).
 *
 *   supabase (default)  public.email_names via the service role
 *   file (dev only)     EMAIL_STORE=file (or EMAIL_NAMES_STORE=file; EMAIL_NAMES_STORE=supabase forces the
 *                       table even with the file campaign store): a local JSON file (EMAIL_NAMES_FILE, else
 *                       `${EMAIL_STORE_FILE}.names.json`) so the flow can be tested without the DB.
 */
import fs from "fs";
import { supabase } from "@/lib/supabase";

export const NAMES_MIGRATION = "supabase/migrations/20261017_email_names.sql";

export class NamesMissingError extends Error {
  status = 503;
  code = "names-missing";
  constructor() {
    super(`Recipient names need the email_names table. Apply ${NAMES_MIGRATION} in the Supabase SQL editor, then try again.`);
  }
}

export type NameOverride = { email: string; name: string; updatedBy: string | null; updatedAt: string };

export interface NamesStore {
  kind: "supabase" | "file";
  /** Every override + whether the table exists (false → treat as no overrides). */
  all(): Promise<{ ready: boolean; map: Map<string, NameOverride> }>;
  /** Overrides for a few addresses, fresh (no cache): used per send batch. null = couldn't read (use the cached set). */
  get(emails: string[]): Promise<Map<string, NameOverride> | null>;
  upsert(rows: { email: string; name: string }[], by: string | null): Promise<NameOverride[]>;
  remove(emails: string[]): Promise<number>;
}

type Err = { code?: string; message?: string } | null;
const isMissing = (e: Err) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message || ""));
const lc = (s: string) => s.toLowerCase().trim();
type Row = { email: string; name: string; updated_by: string | null; updated_at: string };
const toOverride = (r: Row): NameOverride => ({ email: lc(r.email), name: r.name, updatedBy: r.updated_by, updatedAt: r.updated_at });
const PAGE = 1000;

const supabaseNames: NamesStore = {
  kind: "supabase",
  async all() {
    const map = new Map<string, NameOverride>();
    for (let from = 0; from < 2_000_000; from += PAGE) {
      const { data, error } = await supabase.from("email_names").select("email, name, updated_by, updated_at").range(from, from + PAGE - 1);
      if (error) {
        if (isMissing(error)) return { ready: false, map: new Map() };
        console.error("[campaigns] email_names read failed", error.message);
        return { ready: true, map }; // transient: fall back to profile names rather than failing a send
      }
      for (const r of (data || []) as Row[]) map.set(lc(r.email), toOverride(r));
      if (!data || data.length < PAGE) break;
    }
    return { ready: true, map };
  },
  async get(emails) {
    const out = new Map<string, NameOverride>();
    const list = [...new Set(emails.map(lc))].filter(Boolean);
    for (let i = 0; i < list.length; i += 200) {
      const { data, error } = await supabase.from("email_names").select("email, name, updated_by, updated_at").in("email", list.slice(i, i + 200));
      if (error) {
        if (isMissing(error)) return out; // no table → no overrides
        console.error("[campaigns] email_names read failed", error.message);
        return null;
      }
      for (const r of (data || []) as Row[]) out.set(lc(r.email), toOverride(r));
    }
    return out;
  },
  async upsert(rows, by) {
    if (!rows.length) return [];
    const now = new Date().toISOString();
    const payload = rows.map((r) => ({ email: lc(r.email), name: r.name, updated_by: by, updated_at: now }));
    const { data, error } = await supabase.from("email_names").upsert(payload, { onConflict: "email" }).select("email, name, updated_by, updated_at");
    if (error) {
      if (isMissing(error)) throw new NamesMissingError();
      throw new Error(`email_names write failed: ${error.message}`);
    }
    return ((data || []) as Row[]).map(toOverride);
  },
  async remove(emails) {
    const list = [...new Set(emails.map(lc))].filter(Boolean);
    if (!list.length) return 0;
    const { data, error } = await supabase.from("email_names").delete().in("email", list).select("email");
    if (error) {
      if (isMissing(error)) throw new NamesMissingError();
      throw new Error(`email_names delete failed: ${error.message}`);
    }
    return (data || []).length;
  },
};

function fileNames(path: string): NamesStore {
  const load = (): Record<string, NameOverride> => {
    try {
      return JSON.parse(fs.readFileSync(path, "utf8")) as Record<string, NameOverride>;
    } catch {
      return {};
    }
  };
  const save = (db: Record<string, NameOverride>) => fs.writeFileSync(path, JSON.stringify(db, null, 1));
  return {
    kind: "file",
    async all() {
      return { ready: true, map: new Map(Object.entries(load())) };
    },
    async get(emails) {
      const db = load();
      return new Map(emails.map(lc).filter((e) => db[e]).map((e) => [e, db[e]]));
    },
    async upsert(rows, by) {
      const db = load();
      const now = new Date().toISOString();
      const out = rows.map((r) => (db[lc(r.email)] = { email: lc(r.email), name: r.name, updatedBy: by, updatedAt: now }));
      save(db);
      return out;
    },
    async remove(emails) {
      const db = load();
      let n = 0;
      for (const e of emails.map(lc)) {
        if (!db[e]) continue;
        delete db[e];
        n++;
      }
      save(db);
      return n;
    },
  };
}

let fileSingleton: NamesStore | null = null;

export function getNamesStore(): NamesStore {
  const mode = process.env.EMAIL_NAMES_STORE || process.env.EMAIL_STORE;
  if (process.env.NODE_ENV !== "production" && mode === "file" && (process.env.EMAIL_NAMES_FILE || process.env.EMAIL_STORE_FILE)) {
    fileSingleton ??= fileNames(process.env.EMAIL_NAMES_FILE || `${process.env.EMAIL_STORE_FILE}.names.json`);
    return fileSingleton;
  }
  return supabaseNames;
}
