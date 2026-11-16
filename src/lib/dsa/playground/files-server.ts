import "server-only";
import { supabase } from "@/lib/supabase";
import type { DsaLang } from "@/lib/dsa/types";
import { byteLength, PROGRAM_LIMITS } from "./program";

/**
 * Named Playground files and read-only share links (table dsa_playground_files, supabase/migrations/
 * 20261116_dsa_playground_files.sql). BEHIND A FLAG: everything here is off unless DSA_PLAYGROUND_FILES=on, which the
 * owner sets only after applying the migration. Server-only, service role; every query is scoped to the learner.
 */
import { PLAYGROUND_FILES_ON } from "./files-flag";

export { PLAYGROUND_FILES_ON };

export const MAX_FILES = 200;
const TABLE = "dsa_playground_files";

export type PlaygroundFile = { id: string; name: string; language: DsaLang; code: string; stdin: string; shareSlug: string | null; updatedAt: string };
export type SharedFile = { name: string; language: DsaLang; code: string; stdin: string; sharedAt: string | null };

type Row = { id: string; name: string; language: DsaLang; code: string; stdin: string; share_slug: string | null; updated_at: string; shared_at?: string | null };
const toFile = (r: Row): PlaygroundFile => ({ id: r.id, name: r.name, language: r.language, code: r.code, stdin: r.stdin, shareSlug: r.share_slug, updatedAt: r.updated_at });

const LANGS = new Set(["python", "javascript", "java", "cpp"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isFileId = (s: unknown): s is string => typeof s === "string" && UUID.test(s);
export const isShareSlug = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{12,32}$/.test(s);

/** A file's fields from a request body, checked; or the reason they're refused. */
export function readFileInput(b: Record<string, unknown>): { name: string; language: DsaLang; code: string; stdin: string } | string {
  const name = typeof b.name === "string" ? b.name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80) : "";
  const language = typeof b.language === "string" && LANGS.has(b.language) ? (b.language as DsaLang) : null;
  const code = typeof b.code === "string" ? b.code : "";
  const stdin = typeof b.stdin === "string" ? b.stdin : "";
  if (!name) return "Give the file a name.";
  if (!language) return "language must be python, javascript, java or cpp.";
  if (byteLength(code) > PROGRAM_LIMITS.maxCodeBytes) return "Code is limited to 64 KB.";
  if (byteLength(stdin) > PROGRAM_LIMITS.maxStdinBytes) return "Input is limited to 64 KB.";
  return { name, language, code, stdin };
}

export async function listFiles(userId: string): Promise<PlaygroundFile[]> {
  const { data, error } = await supabase.from(TABLE).select("id, name, language, code, stdin, share_slug, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(MAX_FILES);
  if (error) throw new Error(error.message);
  return ((data || []) as Row[]).map(toFile);
}

export async function createFile(userId: string, f: { name: string; language: DsaLang; code: string; stdin: string }): Promise<PlaygroundFile | "full"> {
  const { count } = await supabase.from(TABLE).select("id", { count: "exact", head: true }).eq("user_id", userId);
  if ((count ?? 0) >= MAX_FILES) return "full";
  const { data, error } = await supabase.from(TABLE).insert({ user_id: userId, ...f }).select("id, name, language, code, stdin, share_slug, updated_at").single();
  if (error) throw new Error(error.message);
  return toFile(data as Row);
}

export async function updateFile(userId: string, id: string, f: { name: string; language: DsaLang; code: string; stdin: string }): Promise<PlaygroundFile | null> {
  const { data, error } = await supabase.from(TABLE).update(f).eq("id", id).eq("user_id", userId).select("id, name, language, code, stdin, share_slug, updated_at").maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toFile(data as Row) : null;
}

export async function deleteFile(userId: string, id: string): Promise<boolean> {
  const { error, count } = await supabase.from(TABLE).delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

function newSlug(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Share (a slug, kept if it already has one) or stop sharing (null). */
export async function setSharing(userId: string, id: string, on: boolean): Promise<string | null | "missing"> {
  const { data: cur, error: e1 } = await supabase.from(TABLE).select("share_slug").eq("id", id).eq("user_id", userId).maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!cur) return "missing";
  if (on && (cur as { share_slug: string | null }).share_slug) return (cur as { share_slug: string }).share_slug;
  const slug = on ? newSlug() : null;
  const { error } = await supabase.from(TABLE).update({ share_slug: slug, shared_at: on ? new Date().toISOString() : null }).eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
  return slug;
}

/** A shared file by its slug, for the read-only share page (no owner details leave the server). */
export async function getShared(slug: string): Promise<SharedFile | null> {
  if (!PLAYGROUND_FILES_ON || !isShareSlug(slug)) return null;
  const { data, error } = await supabase.from(TABLE).select("name, language, code, stdin, shared_at").eq("share_slug", slug).maybeSingle();
  if (error || !data) return null;
  const r = data as { name: string; language: DsaLang; code: string; stdin: string; shared_at: string | null };
  return { name: r.name, language: r.language, code: r.code, stdin: r.stdin, sharedAt: r.shared_at };
}
