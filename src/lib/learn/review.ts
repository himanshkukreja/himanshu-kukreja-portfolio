/**
 * Review queue (Daily standup): Leitner boxes 1-5, intervals 1 / 3 / 7 / 16 / 35 days.
 *
 * Storage
 * - Signed in: the `review_cards` table (migration 20261014_level_up.sql). If the table is not
 *   there yet (or any request fails), the card falls back to localStorage so nothing is lost.
 * - Guests: always localStorage (key `hk.review.v1`).
 *
 * Sources: missed / flagged trial questions (written by the trial screen through addReviewCard),
 * highlights turned into cards (notebook), interview reveal cards marked "review again"
 * (read from the renderer's localStorage key `hk.reveal.v1`).
 */
import { supabaseClient } from "@/lib/supabase-client";

export type ReviewSource = "trial_miss" | "trial_flag" | "highlight" | "interview";
export type ReviewGrade = "again" | "hard" | "good" | "easy";

/** Optional extras shown on the back of a card. Stored inside `back` as JSON when present. */
export type ReviewCardDetail = {
  /** trial cards: the option the learner picked, e.g. "A · Partial load balancing" */
  picked?: string;
  /** explanation shown under the answer */
  why?: string;
  /** interview cards: strong-answer key points */
  points?: { k: string; v: string }[];
  /** short context line, e.g. "W02 · Trial part 3 · Q57" */
  context?: string;
  /** short queue title, e.g. "Purpose of the HALF-OPEN state" */
  short?: string;
};

export type ReviewCardInput = {
  source: ReviewSource;
  /** unique per source, e.g. "week-02:q57" or a content_notes id */
  sourceRef: string;
  courseId: string;
  week?: string;
  lessonSlug?: string;
  /** stage id inside the lesson (e.g. "part-1") for "Open in lesson" */
  stage?: string;
  /** question, or for highlights the full highlighted sentence */
  front: string;
  /** answer, or for highlights the key phrase to blank out of `front` */
  back: string;
  detail?: ReviewCardDetail;
};

export type ReviewCard = {
  id: string;
  source: ReviewSource;
  sourceRef: string;
  courseId: string;
  week: string | null;
  lessonSlug: string | null;
  stage: string | null;
  front: string;
  back: string;
  detail: ReviewCardDetail;
  box: number;
  /** yyyy-mm-dd (local date) */
  dueAt: string;
  lastGrade: ReviewGrade | null;
  reviews: number;
  createdAt: string;
  /** where the card lives */
  storage: "remote" | "local";
};

export const LEITNER_INTERVALS = [1, 3, 7, 16, 35] as const;
export const REVIEW_XP_PER_CARD = 5;
export const REVIEW_STORAGE_KEY = "hk.review.v1";
export const REVEAL_STORAGE_KEY = "hk.reveal.v1";
/** window event fired whenever the local or remote queue changes */
export const REVIEW_CHANGED_EVENT = "hk:review-changed";

// ---------------------------------------------------------------- dates

export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return localDate(dt);
}

export function intervalForBox(box: number): number {
  return LEITNER_INTERVALS[Math.min(5, Math.max(1, box)) - 1];
}

/** Again → Box 1 · Hard → stays · Good → +1 · Easy → +2 (max Box 5). */
export function nextBox(grade: ReviewGrade, box: number): number {
  if (grade === "again") return 1;
  if (grade === "hard") return box;
  if (grade === "good") return Math.min(5, box + 1);
  return Math.min(5, box + 2);
}

export function schedule(grade: ReviewGrade, box: number, today: string = localDate()) {
  const to = nextBox(grade, box);
  const days = intervalForBox(to);
  return { box: to, days, dueAt: addDays(today, days) };
}

export function isDue(card: Pick<ReviewCard, "dueAt">, today: string = localDate()) {
  return card.dueAt <= today;
}

// ---------------------------------------------------------------- back <-> detail encoding

const DETAIL_MARK = '{"hk":1,';

function encodeBack(back: string, detail?: ReviewCardDetail): string {
  if (!detail || Object.keys(detail).length === 0) return back;
  return JSON.stringify({ hk: 1, a: back, d: detail });
}

function decodeBack(raw: string): { back: string; detail: ReviewCardDetail } {
  if (raw && raw.startsWith(DETAIL_MARK)) {
    try {
      const parsed = JSON.parse(raw) as { a?: string; d?: ReviewCardDetail };
      return { back: parsed.a || "", detail: parsed.d || {} };
    } catch {
      // not ours, show as text
    }
  }
  return { back: raw, detail: {} };
}

// ---------------------------------------------------------------- local storage

type LocalCard = Omit<ReviewCard, "storage">;

function readLocal(): LocalCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REVIEW_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { cards?: LocalCard[] };
    return Array.isArray(parsed.cards) ? parsed.cards : [];
  } catch {
    return [];
  }
}

function writeLocal(cards: LocalCard[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify({ cards }));
  } catch {
    // storage unavailable (private mode): the session still works in memory
  }
}

function emitChanged() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(REVIEW_CHANGED_EVENT));
  } catch {
    // ignore
  }
}

function localId() {
  return "local-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// ---------------------------------------------------------------- remote (review_cards)

type Row = {
  id: string;
  source: ReviewSource;
  source_ref: string;
  course_id: string;
  week: string | null;
  lesson_slug: string | null;
  stage: string | null;
  front: string;
  back: string;
  box: number;
  due_at: string;
  last_grade: ReviewGrade | null;
  reviews: number;
  created_at: string;
};

/** Remembers for this page view whether the review_cards table answered; avoids hammering a missing table. */
let remoteState: "unknown" | "ok" | "missing" = "unknown";

/** review_cards not created yet (migration 20261014_level_up.sql not applied). */
function isMissingTable(e: unknown): boolean {
  const err = (e || {}) as { code?: string; message?: string };
  if (["42P01", "PGRST205", "PGRST204", "42703"].includes(err.code || "")) return true;
  return /does not exist|could not find the/i.test(err.message || "");
}

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabaseClient.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

function fromRow(r: Row): ReviewCard {
  const { back, detail } = decodeBack(r.back);
  return {
    id: r.id,
    source: r.source,
    sourceRef: r.source_ref,
    courseId: r.course_id,
    week: r.week,
    lessonSlug: r.lesson_slug,
    stage: r.stage,
    front: r.front,
    back,
    detail,
    box: r.box,
    dueAt: (r.due_at || "").slice(0, 10),
    lastGrade: r.last_grade,
    reviews: r.reviews || 0,
    createdAt: r.created_at,
    storage: "remote",
  };
}

// ---------------------------------------------------------------- public API

/**
 * Add a card to the learner's review queue. Safe to call repeatedly: a card with the same
 * (source, sourceRef) is not duplicated. Never throws.
 */
export async function addReviewCard(input: ReviewCardInput): Promise<{
  ok: boolean;
  storage: "remote" | "local";
  duplicate: boolean;
}> {
  const front = (input.front || "").trim();
  const back = (input.back || "").trim();
  if (!front || !input.sourceRef || !input.courseId) return { ok: false, storage: "local", duplicate: false };
  const encodedBack = encodeBack(back, input.detail);

  const userId = await currentUserId();
  if (userId && remoteState !== "missing") {
    try {
      const { data: existing, error: selErr } = await supabaseClient
        .from("review_cards")
        .select("id")
        .eq("user_id", userId)
        .eq("source", input.source)
        .eq("source_ref", input.sourceRef)
        .limit(1);
      if (selErr) throw selErr;
      remoteState = "ok";
      if (existing && existing.length) return { ok: true, storage: "remote", duplicate: true };
      const { error } = await supabaseClient.from("review_cards").insert({
        user_id: userId,
        source: input.source,
        source_ref: input.sourceRef,
        course_id: input.courseId,
        week: input.week ?? null,
        lesson_slug: input.lessonSlug ?? null,
        stage: input.stage ?? null,
        front,
        back: encodedBack,
        box: 1,
        due_at: localDate(),
      });
      if (error) {
        // another tab / a double click added the same card between the select and the insert
        if ((error as { code?: string }).code === "23505") return { ok: true, storage: "remote", duplicate: true };
        throw error;
      }
      emitChanged();
      return { ok: true, storage: "remote", duplicate: false };
    } catch (e) {
      // Only a missing table disables the remote queue for this page; a network blip used to
      // flip it too, sending every later card of the session into this browser's storage only.
      if (isMissingTable(e)) remoteState = "missing";
      // fall through to localStorage
    }
  }

  const cards = readLocal();
  if (cards.some((c) => c.source === input.source && c.sourceRef === input.sourceRef)) {
    return { ok: true, storage: "local", duplicate: true };
  }
  const { back: b, detail } = decodeBack(encodedBack);
  cards.push({
    id: localId(),
    source: input.source,
    sourceRef: input.sourceRef,
    courseId: input.courseId,
    week: input.week ?? null,
    lessonSlug: input.lessonSlug ?? null,
    stage: input.stage ?? null,
    front,
    back: b,
    detail,
    box: 1,
    dueAt: localDate(),
    lastGrade: null,
    reviews: 0,
    createdAt: new Date().toISOString(),
  });
  writeLocal(cards);
  emitChanged();
  return { ok: true, storage: "local", duplicate: false };
}

/** True when a card with this source/ref is already in the local queue (sync, local only). */
export function hasLocalReviewCard(source: ReviewSource, sourceRef: string): boolean {
  return readLocal().some((c) => c.source === source && c.sourceRef === sourceRef);
}

// ---------------------------------------------------------------- interview reveal cards (hk.reveal.v1)

/**
 * The renderer stores "review again" marks on interview reveal cards in localStorage.
 * The exact shape is owned by the renderer, so this reads it defensively. Accepted shapes:
 *  - { [key]: "again" | "knew" | { status|mark|state: "again"|..., q|question|front, a|answer|back, week, slug, stage, course } }
 *  - { items|cards: [ { key|id, ...same fields } ] }
 *  - [ ...same items ]
 * Keys like "week-02/day-01-timeout-hell#question-1" give week/slug when fields are missing.
 */
type RevealItem = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function revealIsAgain(v: unknown): boolean {
  if (typeof v === "string") return /again|review|unsure|no/i.test(v);
  if (v && typeof v === "object") {
    const o = v as RevealItem;
    const mark = o.status ?? o.mark ?? o.state ?? o.result ?? o.value;
    if (typeof mark === "string") return /again|review|unsure/i.test(mark);
    if (o.again === true || o.reviewAgain === true) return true;
  }
  return false;
}

function parseRevealKey(key: string) {
  // "course/week-02/day-01/question-1", "week-02/day-01-x#q1", "week-02:day-01:q1"
  const week = key.match(/week-\d+[a-z0-9-]*/i)?.[0];
  const parts = key.split(/[/#:|]/).filter(Boolean);
  const wi = parts.findIndex((p) => /^week-\d+/i.test(p));
  const slug = wi >= 0 ? parts[wi + 1] : undefined;
  return { week, slug };
}

export function readInterviewRevealCards(courseId: string): ReviewCardInput[] {
  if (typeof window === "undefined") return [];
  let raw: unknown;
  try {
    const s = window.localStorage.getItem(REVEAL_STORAGE_KEY);
    if (!s) return [];
    raw = JSON.parse(s);
  } catch {
    return [];
  }
  const entries: [string, unknown][] = [];
  if (Array.isArray(raw)) {
    raw.forEach((it, i) => entries.push([str((it as RevealItem)?.key) || str((it as RevealItem)?.id) || String(i), it]));
  } else if (raw && typeof raw === "object") {
    const o = raw as RevealItem;
    const list = (Array.isArray(o.items) ? o.items : Array.isArray(o.cards) ? o.cards : null) as unknown[] | null;
    if (list) list.forEach((it, i) => entries.push([str((it as RevealItem)?.key) || str((it as RevealItem)?.id) || String(i), it]));
    else Object.entries(o).forEach(([k, v]) => entries.push([k, v]));
  }
  const out: ReviewCardInput[] = [];
  for (const [key, val] of entries) {
    if (!revealIsAgain(val)) continue;
    const o = (val && typeof val === "object" ? val : {}) as RevealItem;
    const parsed = parseRevealKey(key);
    const q = str(o.q) || str(o.question) || str(o.front) || str(o.title);
    if (!q) continue; // a mark without the question text cannot make a card
    const a = str(o.a) || str(o.answer) || str(o.back) || "Open the lesson to compare with the strong answer.";
    out.push({
      source: "interview",
      sourceRef: key,
      courseId: str(o.course) || str(o.courseId) || courseId,
      week: str(o.week) || parsed.week,
      lessonSlug: str(o.slug) || str(o.lessonSlug) || parsed.slug,
      stage: str(o.stage) || str(o.stageId),
      front: q,
      back: a,
      detail: { why: str(o.intent) || str(o.why) },
    });
  }
  return out;
}

/** Copy any interview "review again" marks into the queue (idempotent). */
export async function importInterviewRevealCards(courseId: string): Promise<number> {
  const cards = readInterviewRevealCards(courseId);
  let added = 0;
  for (const c of cards) {
    const r = await addReviewCard(c);
    if (r.ok && !r.duplicate) added++;
  }
  return added;
}

// ---------------------------------------------------------------- loading / grading

export async function loadReviewCards(): Promise<{ cards: ReviewCard[]; storage: "remote" | "local" | "mixed" }> {
  const local: ReviewCard[] = readLocal().map((c) => ({ ...c, storage: "local" as const }));
  const userId = await currentUserId();
  if (!userId || remoteState === "missing") return { cards: local, storage: "local" };
  try {
    const { data, error } = await supabaseClient
      .from("review_cards")
      .select("*")
      .eq("user_id", userId)
      .order("due_at", { ascending: true })
      .limit(2000);
    if (error) throw error;
    remoteState = "ok";
    const remote = ((data || []) as Row[]).map(fromRow);
    const seen = new Set(remote.map((c) => c.source + "|" + c.sourceRef));
    const merged = remote.concat(local.filter((c) => !seen.has(c.source + "|" + c.sourceRef)));
    return { cards: merged, storage: local.length ? "mixed" : "remote" };
  } catch (e) {
    if (isMissingTable(e)) remoteState = "missing";
    return { cards: local, storage: "local" };
  }
}

/** Number of cards due today or earlier (used by the course nav badge). */
export async function countDueReviewCards(): Promise<number> {
  const { cards } = await loadReviewCards();
  const today = localDate();
  return cards.filter((c) => c.dueAt <= today).length;
}

/** Grade a card and persist its new box / due date. Returns the updated card. */
export async function gradeReviewCard(card: ReviewCard, grade: ReviewGrade): Promise<ReviewCard> {
  const today = localDate();
  const s = schedule(grade, card.box, today);
  const next: ReviewCard = { ...card, box: s.box, dueAt: s.dueAt, lastGrade: grade, reviews: card.reviews + 1 };
  if (card.storage === "remote") {
    try {
      const { error } = await supabaseClient
        .from("review_cards")
        .update({ box: next.box, due_at: next.dueAt, last_grade: grade, reviews: next.reviews })
        .eq("id", card.id);
      if (error) throw error;
      emitChanged();
      return next;
    } catch {
      // keep the grade locally rather than losing it
      const cards = readLocal().filter((c) => !(c.source === card.source && c.sourceRef === card.sourceRef));
      const { storage: _s, ...rest } = next;
      void _s;
      cards.push({ ...rest, id: localId() });
      writeLocal(cards);
      emitChanged();
      return { ...next, storage: "local" };
    }
  }
  const cards = readLocal().map((c) => (c.id === card.id ? { ...c, box: next.box, dueAt: next.dueAt, lastGrade: grade, reviews: next.reviews } : c));
  writeLocal(cards);
  emitChanged();
  return next;
}

export async function removeReviewCard(card: Pick<ReviewCard, "id" | "storage">): Promise<void> {
  if (card.storage === "remote") {
    try {
      await supabaseClient.from("review_cards").delete().eq("id", card.id);
    } catch {
      // ignore
    }
  } else {
    writeLocal(readLocal().filter((c) => c.id !== card.id));
  }
  emitChanged();
}
