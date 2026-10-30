/**
 * DEV-ONLY stand-in for handwritten notes on a passage: localStorage instead of content_notes, so the pad, the marker
 * in the lesson and the notebook's Notes tab can be built and tested without a session or the migration. On when
 * `next dev` runs and localStorage hk.ink.dev = "1" (the notebook pages' switch, see ./dev.ts). Loaded through a
 * dynamic import behind a `process.env.NODE_ENV === "development"` constant (passage.ts), so production never
 * reaches it; and it refuses to run there.
 */
import type { InkNoteBackend, InkNoteRow } from "./passage";
import { InkNoteError } from "./passage";

if (process.env.NODE_ENV !== "development") {
  throw new Error("ink notes dev store is dev-only");
}

const KEY = "hk.inknote.dev.db";

function load(): InkNoteRow[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as InkNoteRow[];
  } catch {
    // fall through
  }
  return [];
}
function store(rows: InkNoteRow[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    throw new InkNoteError("full", "The dev store is out of localStorage space.");
  }
}
const now = () => new Date().toISOString();
const wait = () => new Promise((r) => setTimeout(r, 60));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export const passageDevBackend: InkNoteBackend = {
  async listLesson(_u, courseId, week, lessonSlug) {
    await wait();
    return clone(load().filter((r) => r.course_id === courseId && r.week === week && r.lesson_slug === lessonSlug));
  },
  async listAll() {
    await wait();
    return clone(load().sort((a, b) => b.created_at.localeCompare(a.created_at)));
  },
  async insert(_u, a, ink) {
    await wait();
    const at = now();
    const row: InkNoteRow = {
      id: crypto.randomUUID(),
      course_id: a.courseId,
      week: a.week,
      lesson_slug: a.lessonSlug,
      note_text: "",
      note_type: "general",
      highlight_text: a.highlightText,
      highlight_offset: a.highlightOffset,
      color: "yellow",
      ink,
      created_at: at,
      updated_at: at,
    };
    store([...load(), row]);
    return clone(row);
  },
  async update(_u, id, patch) {
    await wait();
    const at = now();
    let hit = false;
    store(load().map((r) => (r.id === id ? ((hit = true), { ...r, ...patch, updated_at: at }) : r)));
    return hit ? at : null;
  },
  async remove(_u, id) {
    await wait();
    store(load().filter((r) => r.id !== id));
  },
  async restore(_u, row) {
    store([...load().filter((r) => r.id !== row.id), row]);
  },
};
