"use client";

/**
 * Lesson annotations: storage. One row per learner per lesson in public.lesson_annotations
 * (supabase/migrations/20261101_lesson_annotations.sql; RLS: a learner reads and writes only their own row), holding
 * { v: 1, marks: AnnotMark[] } (annotate.ts).
 *
 *   loadAnnotations(lessonKey, signedIn)   the marks to show: the account's row, or this device's copy
 *   saveAnnotations(lessonKey, doc)        upsert (debounced by the caller); an empty doc deletes the row
 *   local copies                           hk.annot.local:<key> (signed out, or saving not switched on yet) and
 *                                          hk.annot.backup:<key> (signed in, not saved yet: a dropped connection or a
 *                                          closed tab loses nothing; dropped once a save lands)
 *
 * Signed-out learners annotate on this device only. When they sign in, the device's marks are merged into their row
 * (by mark id) on the next lesson open and the local copy is cleared once that save lands.
 *
 * Dev stand-in: under `next dev` with localStorage hk.annot.dev = "1" (or the notebook's hk.ink.dev = "1"), the row
 * lives in localStorage instead (./annotateDev.ts). DEV is a build-time constant, so a production bundle never takes
 * that path (and annotateDev.ts throws if it is ever evaluated outside development).
 */
import { supabaseClient } from "@/lib/supabase-client";
import { ANNOT_LIMITS, annotBytes, emptyDoc, readDoc, type AnnotDoc, type AnnotMark } from "./annotate";

export type AnnotErrorCode = "auth" | "unavailable" | "full" | "network";
export class AnnotError extends Error {
  code: AnnotErrorCode;
  constructor(code: AnnotErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AnnotError";
  }
}

export type AnnotRow = { doc: AnnotDoc; updatedAt: string };

/** What the store needs: Supabase (below) or ./annotateDev.ts. */
export type AnnotBackend = {
  get(lessonKey: string): Promise<AnnotRow | null>;
  /** returns the new updated_at */
  put(lessonKey: string, doc: AnnotDoc): Promise<string>;
  remove(lessonKey: string): Promise<void>;
};

const DEV = process.env.NODE_ENV === "development";

/** Dev only: is the localStorage stand-in on? (always false in a production build) */
export function annotDevStore(): boolean {
  if (!DEV || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("hk.annot.dev") === "1" || window.localStorage.getItem("hk.ink.dev") === "1";
  } catch {
    return false;
  }
}

const FULL_MSG = "This lesson has as many marks as it can hold. Erase some to add more.";

function mapError(e: { code?: string; message?: string } | null | undefined): AnnotError {
  const msg = e?.message || "";
  if (e?.code === "PGRST205" || e?.code === "42P01" || /relation .* does not exist|schema cache/i.test(msg)) return new AnnotError("unavailable", "Saving marks to your account isn't switched on yet. They're kept on this device.");
  if (/lesson_annotations_size/.test(msg)) return new AnnotError("full", FULL_MSG);
  if (/JWT|not authenticated|row-level security/i.test(msg)) return new AnnotError("auth", "Sign in to keep your marks.");
  if (/fetch|network|Failed to/i.test(msg)) return new AnnotError("network", "You seem to be offline. Your marks are kept on this device and save when you're back.");
  return new AnnotError("network", msg || "Couldn't save your marks. They're kept on this device.");
}

const supabaseBackend: AnnotBackend = {
  async get(lessonKey) {
    const { data, error } = await supabaseClient.from("lesson_annotations").select("marks, updated_at").eq("lesson_key", lessonKey).maybeSingle();
    if (error) throw mapError(error);
    if (!data) return null;
    return { doc: readDoc((data as { marks: unknown }).marks), updatedAt: (data as { updated_at: string }).updated_at };
  },
  async put(lessonKey, doc) {
    const { data: s } = await supabaseClient.auth.getSession();
    const user_id = s.session?.user?.id;
    if (!user_id) throw new AnnotError("auth", "Sign in to keep your marks.");
    const { data, error } = await supabaseClient
      .from("lesson_annotations")
      .upsert({ user_id, lesson_key: lessonKey, marks: doc }, { onConflict: "user_id,lesson_key" })
      .select("updated_at")
      .single();
    if (error) throw mapError(error);
    return (data as { updated_at: string }).updated_at;
  },
  async remove(lessonKey) {
    const { error } = await supabaseClient.from("lesson_annotations").delete().eq("lesson_key", lessonKey);
    if (error) throw mapError(error);
  },
};

let devBackend: Promise<AnnotBackend> | null = null;
async function db(): Promise<AnnotBackend> {
  if (DEV && annotDevStore()) {
    devBackend ||= import("./annotateDev").then((m) => m.annotDevBackend);
    return devBackend;
  }
  return supabaseBackend;
}

// ------------------------------------------------------------------ device copies

const LOCAL = (k: string) => `hk.annot.local:${k}`;
const BACKUP = (k: string) => `hk.annot.backup:${k}`;
type Copy = { doc: AnnotDoc; at: number };

function read(key: string): Copy | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const c = JSON.parse(raw) as Copy;
    return { doc: readDoc(c.doc), at: Number(c.at) || 0 };
  } catch {
    return null;
  }
}
function write(key: string, doc: AnnotDoc): boolean {
  try {
    if (!doc.marks.length) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify({ doc, at: Date.now() } satisfies Copy));
    return true;
  } catch {
    return false;
  }
}
function drop(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** This device's marks (signed out, or the account store isn't there yet). */
export const saveLocal = (lessonKey: string, doc: AnnotDoc) => write(LOCAL(lessonKey), doc);
export const writeBackup = (lessonKey: string, doc: AnnotDoc) => write(BACKUP(lessonKey), doc);
export const dropBackup = (lessonKey: string) => drop(BACKUP(lessonKey));
export const dropLocal = (lessonKey: string) => drop(LOCAL(lessonKey));

/** Union by id, keeping a's order then b's new marks (by time). */
export function mergeMarks(a: AnnotMark[], b: AnnotMark[]): AnnotMark[] {
  const ids = new Set(a.map((m) => m.id));
  const extra = b.filter((m) => !ids.has(m.id));
  return extra.length ? [...a, ...extra].sort((x, y) => x.at - y.at) : a;
}

// ------------------------------------------------------------------ load / save

/**
 * Where the marks live this session: "account" (saved to the learner's row), "device" (signed out, or the table isn't
 * there yet: localStorage only).
 */
export type AnnotWhere = "account" | "device";

export type Loaded = {
  doc: AnnotDoc;
  where: AnnotWhere;
  /** the doc differs from what is saved (a device copy was used or merged in): save it */
  dirty: boolean;
  /** device marks from a signed-out session were merged in: clear hk.annot.local once saved */
  mergedLocal: boolean;
  /** a sentence for the toolbar when the marks are not going to the account */
  note: string | null;
};

export async function loadAnnotations(lessonKey: string, signedIn: boolean): Promise<Loaded> {
  const local = read(LOCAL(lessonKey));
  if (!signedIn && !annotDevStore()) {
    return { doc: local?.doc ?? emptyDoc(), where: "device", dirty: false, mergedLocal: false, note: "Sign in to keep your marks. For now they're kept on this device only." };
  }
  const backup = read(BACKUP(lessonKey));
  try {
    const row = await (await db()).get(lessonKey);
    let doc = row?.doc ?? emptyDoc();
    let dirty = false;
    // the unsaved copy wins unless the row was saved (from another device) after it was made
    if (backup && (!row || backup.at > (Date.parse(row.updatedAt) || 0))) {
      doc = backup.doc;
      dirty = true;
    } else if (backup) dropBackup(lessonKey);
    let mergedLocal = false;
    if (local && local.doc.marks.length) {
      doc = { v: 1, marks: mergeMarks(doc.marks, local.doc.marks) };
      dirty = true;
      mergedLocal = true;
    }
    return { doc, where: "account", dirty, mergedLocal, note: null };
  } catch (e) {
    const ae = e instanceof AnnotError ? e : mapError(e as { message?: string });
    if (ae.code === "unavailable" || ae.code === "auth") {
      return { doc: mergeDocs(local?.doc, backup?.doc), where: "device", dirty: false, mergedLocal: false, note: ae.message };
    }
    // offline: this device's copy, saved when the connection is back
    return { doc: mergeDocs(backup?.doc, local?.doc), where: "account", dirty: !!backup || !!local, mergedLocal: !!local, note: null };
  }
}

function mergeDocs(a?: AnnotDoc, b?: AnnotDoc): AnnotDoc {
  return { v: 1, marks: mergeMarks(a?.marks ?? [], b?.marks ?? []) };
}

/** Save the whole doc to the account (an empty one deletes the row). Throws AnnotError. */
export async function saveAnnotations(lessonKey: string, doc: AnnotDoc): Promise<void> {
  if (annotBytes(doc) > ANNOT_LIMITS.bytes) throw new AnnotError("full", FULL_MSG);
  const b = await db();
  if (!doc.marks.length) await b.remove(lessonKey);
  else await b.put(lessonKey, doc);
}
