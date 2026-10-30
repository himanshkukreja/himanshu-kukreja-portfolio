"use client";

/**
 * Handwritten notes on a passage ("ink notes"): a content_notes row anchored to the selected passage the way a typed
 * note is (highlight_text + highlight_offset), with the learner's strokes in `ink` (supabase/migrations/
 * 20261101_ink_notes.sql). note_text is '' until "Turn into text", then the typed Markdown (the ink is kept).
 *
 * The pad is the notebook ink engine (components/learn/ink/InkCanvas) on a ruled sheet, so `ink.w × ink.h` is the
 * engine's page (PAGE_W × PAGE_H) and strokes are the same Stroke format. Drawing (thumbnails, the viewer, the image
 * sent to the AI) reuses render.ts and is cropped to the part of the pad that has writing on it.
 *
 * Storage: Supabase under row-level security (own rows), or, under `next dev` with localStorage hk.ink.dev = "1"
 * (the notebook pages' switch), the localStorage stand-in in ./passageDev.ts. DEV is a build-time constant, so a
 * production bundle never takes that path.
 *
 * Before the migration is applied the `ink` column doesn't exist: reads return no ink notes (everything else on
 * the page works as before) and writes say handwritten notes aren't switched on yet.
 */
import { supabaseClient } from "@/lib/supabase-client";
import { inkDevStore } from "./client";
import { pageBytes, strokeBox, unionBox, type Box } from "./geometry";
import { buildLayer, drawPaper, fillLayer, type InkTheme } from "./render";
import { PAGE_H, PAGE_W, type InkColor, type Paper, type Stroke } from "./types";

// ------------------------------------------------------------------ types

/** What `content_notes.ink` holds. */
export type InkNoteInk = { w: number; h: number; strokes: Stroke[] };

export type InkNoteRow = {
  id: string;
  course_id: string;
  week: string;
  lesson_slug: string;
  /** '' until converted; then the typed Markdown */
  note_text: string | null;
  note_type: string;
  highlight_text: string | null;
  highlight_offset: number | null;
  color: string;
  ink: InkNoteInk;
  created_at: string;
  updated_at: string;
};

export type InkNoteAnchor = { courseId: string; week: string; lessonSlug: string; highlightText: string; highlightOffset: number };

/** The paper the pad and every drawing of a note use. */
export const PAD_PAPER: Paper = "ruled";
/** The database check is 300,000 bytes of jsonb text; the browser stops a little before it. */
export const INK_NOTE_MAX_BYTES = 290_000;
export const emptyInk = (): InkNoteInk => ({ w: PAGE_W, h: PAGE_H, strokes: [] });

/** Bytes the ink takes in the database (jsonb text form; same estimate the notebook pages use, slightly over). */
export const inkBytes = (ink: Pick<InkNoteInk, "strokes">) => pageBytes(ink.strokes, []) + 40;

const TOOLS = new Set(["pen", "highlighter"]);
const COLORS = new Set<InkColor>(["ink", "signal", "teal", "grey", "red"]);

/** A stored `ink` value, checked: anything malformed becomes no ink (never throws on a bad row). */
export function parseInk(v: unknown): InkNoteInk | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { w?: unknown; h?: unknown; strokes?: unknown };
  if (!Array.isArray(o.strokes)) return null;
  const strokes: Stroke[] = [];
  for (const s of o.strokes as Partial<Stroke>[]) {
    if (!s || typeof s !== "object" || typeof s.id !== "string" || !TOOLS.has(String(s.tool)) || !Array.isArray(s.pts)) continue;
    strokes.push({
      id: s.id,
      tool: s.tool as Stroke["tool"],
      color: COLORS.has(s.color as InkColor) ? (s.color as InkColor) : "ink",
      size: typeof s.size === "number" && s.size > 0 && s.size < 100 ? s.size : 2.6,
      pts: s.pts.filter((n) => typeof n === "number"),
    });
  }
  const w = typeof o.w === "number" && o.w > 0 ? o.w : PAGE_W;
  const h = typeof o.h === "number" && o.h > 0 ? o.h : PAGE_H;
  return { w, h, strokes };
}

// ------------------------------------------------------------------ drawing

/** The part of the pad with writing on it: full width, from just above the first stroke to just below the last. */
export function inkCrop(ink: InkNoteInk, minH = 150): Box {
  let b: Box | null = null;
  for (const s of ink.strokes) b = unionBox(b, strokeBox(s));
  const h = ink.h || PAGE_H;
  if (!b) return { x1: 0, y1: 0, x2: ink.w || PAGE_W, y2: Math.min(h, minH) };
  let y1 = Math.max(0, b.y1 - 40);
  let y2 = Math.min(h, b.y2 + 40);
  if (y2 - y1 < minH) {
    const grow = (minH - (y2 - y1)) / 2;
    y1 = Math.max(0, y1 - grow);
    y2 = Math.min(h, y1 + minH);
  }
  return { x1: 0, y1, x2: ink.w || PAGE_W, y2 };
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Paper + highlighter + ink, in pad units, onto a context already scaled to pad units (render.ts helpers). */
export function drawInkNote(ctx: Ctx, ink: InkNoteInk, theme: InkTheme) {
  drawPaper(ctx, PAD_PAPER, theme);
  fillLayer(ctx, buildLayer(ink.strokes, "highlighter"), "highlighter", theme);
  fillLayer(ctx, buildLayer(ink.strokes, "pen"), "pen", theme);
}

/** Draw the cropped note onto a canvas `cssWidth` px wide (height follows the crop); returns the CSS height. */
export function paintInkNote(canvas: HTMLCanvasElement, ink: InkNoteInk, theme: InkTheme, cssWidth: number, crop = inkCrop(ink)): number {
  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const k = cssWidth / (crop.x2 - crop.x1);
  const cssH = Math.max(1, Math.round((crop.y2 - crop.y1) * k));
  canvas.width = Math.max(1, Math.round(cssWidth * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.setTransform(k * dpr, 0, 0, k * dpr, -crop.x1 * k * dpr, -crop.y1 * k * dpr);
    drawInkNote(ctx, ink, theme);
  }
  return cssH;
}

/**
 * The note as an image for "Turn into text": light theme (dark ink on white reads best), 1 px per pad unit,
 * cropped to the writing, so a three-line note is a small image (fewer tokens than a whole page). PNG, or WebP
 * when a dense note's PNG is over the convert route's cap.
 */
export async function inkNoteImage(ink: InkNoteInk, maxBytes = 1_400_000): Promise<{ mediaType: "image/png" | "image/webp"; data: string; bytes: number }> {
  const crop = inkCrop(ink, 220);
  const w = Math.round(crop.x2 - crop.x1);
  const h = Math.round(crop.y2 - crop.y1);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("render failed");
  ctx.setTransform(1, 0, 0, 1, -crop.x1, -crop.y1);
  drawInkNote(ctx, ink, "light");
  const blob = (type: string, q?: number) => new Promise<Blob | null>((res) => c.toBlob((b) => res(b), type, q));
  const b64 = (b: Blob) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ""));
      r.onerror = () => reject(r.error || new Error("read failed"));
      r.readAsDataURL(b);
    });
  const png = await blob("image/png");
  if (png && png.size <= maxBytes) return { mediaType: "image/png", data: await b64(png), bytes: png.size };
  for (const q of [0.9, 0.75]) {
    const w2 = await blob("image/webp", q);
    if (w2 && w2.type === "image/webp" && w2.size <= maxBytes) return { mediaType: "image/webp", data: await b64(w2), bytes: w2.size };
  }
  throw new Error("This note is too heavy to send.");
}

// ------------------------------------------------------------------ storage

export class InkNoteError extends Error {
  code: "auth" | "unavailable" | "full" | "not_found" | "network";
  constructor(code: InkNoteError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "InkNoteError";
  }
}

/** What the reader and the notebook need from storage: Supabase (below) or ./passageDev.ts. */
export type InkNoteBackend = {
  listLesson(userId: string, courseId: string, week: string, lessonSlug: string): Promise<InkNoteRow[]>;
  listAll(userId: string): Promise<InkNoteRow[]>;
  insert(userId: string, anchor: InkNoteAnchor, ink: InkNoteInk): Promise<InkNoteRow>;
  /** returns the new updated_at; null when the row is gone */
  update(userId: string, id: string, patch: { ink?: InkNoteInk; note_text?: string }): Promise<string | null>;
  remove(userId: string, id: string): Promise<void>;
  /** undo a delete: put the row back as it was */
  restore(userId: string, row: InkNoteRow): Promise<void>;
};

const DEV = process.env.NODE_ENV === "development";
const COLS = "id, course_id, week, lesson_slug, note_text, note_type, highlight_text, highlight_offset, color, ink, created_at, updated_at";

type PgError = { code?: string; message?: string; details?: string | null } | null;
/** The `ink` column (or the table) isn't there: the migration isn't applied yet. */
export const inkMissing = (e: PgError) => !!e && (["42703", "42P01", "PGRST204", "PGRST205"].includes(e.code || "") || /column .*ink.* does not exist|could not find the 'ink' column/i.test(`${e.message ?? ""} ${e.details ?? ""}`));

function mapError(e: PgError): InkNoteError {
  const msg = e?.message || "";
  if (inkMissing(e)) return new InkNoteError("unavailable", "Handwritten notes aren't switched on yet. Typed notes work as usual.");
  if (/content_notes_ink_size/.test(msg)) return new InkNoteError("full", "This note is full. Start another note to keep writing.");
  if (/JWT|not authenticated|row-level security/i.test(msg)) return new InkNoteError("auth", "Sign in to keep handwritten notes.");
  if (/fetch|network|Failed to/i.test(msg)) return new InkNoteError("network", "You seem to be offline. Your note is kept on this device and saves when you're back.");
  return new InkNoteError("network", msg || "Couldn't save the note. It's kept on this device.");
}

const toRows = (data: unknown): InkNoteRow[] =>
  ((data as (Omit<InkNoteRow, "ink"> & { ink: unknown })[] | null) || []).flatMap((r) => {
    const ink = parseInk(r.ink);
    return ink ? [{ ...r, ink }] : [];
  });

const supabaseBackend: InkNoteBackend = {
  async listLesson(userId, courseId, week, lessonSlug) {
    const { data, error } = await supabaseClient
      .from("content_notes")
      .select(COLS)
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("week", week)
      .eq("lesson_slug", lessonSlug)
      .not("ink", "is", null);
    if (error) {
      if (inkMissing(error)) return [];
      throw mapError(error);
    }
    return toRows(data);
  },
  async listAll(userId) {
    const { data, error } = await supabaseClient.from("content_notes").select(COLS).eq("user_id", userId).not("ink", "is", null).order("created_at", { ascending: false });
    if (error) {
      if (inkMissing(error)) return [];
      throw mapError(error);
    }
    return toRows(data);
  },
  async insert(userId, a, ink) {
    const { data, error } = await supabaseClient
      .from("content_notes")
      .insert({
        user_id: userId,
        course_id: a.courseId,
        week: a.week,
        lesson_slug: a.lessonSlug,
        highlight_text: a.highlightText,
        highlight_offset: a.highlightOffset,
        note_text: "",
        note_type: "general",
        color: "yellow",
        is_private: true,
        ink,
      })
      .select(COLS)
      .single();
    if (error || !data) throw mapError(error);
    const [row] = toRows([data]);
    if (!row) throw new InkNoteError("network", "Couldn't save the note.");
    return row;
  },
  async update(userId, id, patch) {
    const { data, error } = await supabaseClient.from("content_notes").update(patch).eq("id", id).eq("user_id", userId).select("updated_at").maybeSingle();
    if (error) throw mapError(error);
    return (data as { updated_at?: string } | null)?.updated_at ?? null;
  },
  async remove(userId, id) {
    const { error } = await supabaseClient.from("content_notes").delete().eq("id", id).eq("user_id", userId);
    if (error) throw mapError(error);
  },
  async restore(userId, row) {
    const { error } = await supabaseClient.from("content_notes").insert({ ...row, user_id: userId, is_private: true });
    if (error) throw mapError(error);
  },
};

let devBackend: InkNoteBackend | null = null;
async function backend(): Promise<InkNoteBackend> {
  if (DEV && inkDevStore()) {
    if (!devBackend) devBackend = (await import("./passageDev")).passageDevBackend;
    return devBackend;
  }
  return supabaseBackend;
}

/** The dev stand-in is on (always false in a production build). */
export const inkNotesDev = (): boolean => DEV && inkDevStore();

export async function listLessonInkNotes(userId: string, courseId: string, week: string, lessonSlug: string): Promise<InkNoteRow[]> {
  return (await backend()).listLesson(userId, courseId, week, lessonSlug);
}
export async function listAllInkNotes(userId: string): Promise<InkNoteRow[]> {
  return (await backend()).listAll(userId);
}
export async function createInkNote(userId: string, anchor: InkNoteAnchor, ink: InkNoteInk): Promise<InkNoteRow> {
  if (inkBytes(ink) > INK_NOTE_MAX_BYTES) throw new InkNoteError("full", "This note is full. Start another note to keep writing.");
  return (await backend()).insert(userId, anchor, ink);
}
export async function updateInkNote(userId: string, id: string, patch: { ink?: InkNoteInk; note_text?: string }): Promise<string | null> {
  if (patch.ink && inkBytes(patch.ink) > INK_NOTE_MAX_BYTES) throw new InkNoteError("full", "This note is full. Start another note to keep writing.");
  if (typeof patch.note_text === "string") patch = { ...patch, note_text: patch.note_text.slice(0, 20000) };
  return (await backend()).update(userId, id, patch);
}
export async function deleteInkNote(userId: string, id: string): Promise<void> {
  return (await backend()).remove(userId, id);
}
export async function restoreInkNote(userId: string, row: InkNoteRow): Promise<void> {
  return (await backend()).restore(userId, row);
}

// ------------------------------------------------------------------ this device's unsaved copy

const BACKUP = (key: string) => `hk.inknote.backup:${key}`;
export type InkNoteBackup = { ink: InkNoteInk; at: number; anchor?: InkNoteAnchor };

/** The backup key: the row id once saved, else the passage (a note written offline before its first save). */
export const backupKey = (id: string | null, a: Pick<InkNoteAnchor, "courseId" | "week" | "lessonSlug" | "highlightOffset">) => id || `new:${a.courseId}/${a.week}/${a.lessonSlug}@${a.highlightOffset}`;

export function readInkBackup(key: string): InkNoteBackup | null {
  try {
    const raw = window.localStorage.getItem(BACKUP(key));
    if (!raw) return null;
    const b = JSON.parse(raw) as InkNoteBackup;
    const ink = parseInk(b?.ink);
    return ink ? { ...b, ink } : null;
  } catch {
    return null;
  }
}
export function writeInkBackup(key: string, b: InkNoteBackup) {
  try {
    window.localStorage.setItem(BACKUP(key), JSON.stringify(b));
  } catch {
    // storage full or blocked: the network save is still tried
  }
}
export function dropInkBackup(key: string) {
  try {
    window.localStorage.removeItem(BACKUP(key));
  } catch {
    // ignore
  }
}
