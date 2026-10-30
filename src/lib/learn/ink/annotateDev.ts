/**
 * DEV-ONLY stand-in for the lesson_annotations table: localStorage instead of Supabase, so annotate mode can be built
 * and tested before the migration is applied. Used when `next dev` runs and localStorage hk.annot.dev = "1" (or the
 * notebook's hk.ink.dev = "1") (annotateStore.ts). Loaded through a dynamic import behind a
 * `process.env.NODE_ENV === "development"` constant, so production never reaches it; and it refuses to run there.
 *
 *   localStorage.setItem("hk.annot.dev", "1")   // on
 *   localStorage.removeItem("hk.annot.dev")     // off (the stand-in rows stay under hk.annot.dev.db)
 */
import { ANNOT_LIMITS, annotBytes, readDoc } from "./annotate";
import { AnnotError, type AnnotBackend } from "./annotateStore";

if (process.env.NODE_ENV !== "development") {
  throw new Error("annotation dev store is dev-only");
}

const DB_KEY = "hk.annot.dev.db";
type Row = { marks: unknown; updated_at: string; created_at: string };

function load(): Record<string, Row> {
  try {
    const raw = window.localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as Record<string, Row>;
  } catch {
    // fall through
  }
  return {};
}
function store(d: Record<string, Row>) {
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(d));
  } catch {
    throw new AnnotError("full", "The dev store is out of localStorage space.");
  }
}
const delay = () => new Promise((r) => setTimeout(r, 40));

export const annotDevBackend: AnnotBackend = {
  async get(lessonKey) {
    await delay();
    const row = load()[lessonKey];
    return row ? { doc: readDoc(row.marks), updatedAt: row.updated_at } : null;
  },
  async put(lessonKey, doc) {
    await delay();
    // the same bound the database checks
    if (annotBytes(doc) > ANNOT_LIMITS.serverBytes) throw new AnnotError("full", "lesson_annotations_size");
    const d = load();
    const at = new Date().toISOString();
    d[lessonKey] = { marks: doc, updated_at: at, created_at: d[lessonKey]?.created_at ?? at };
    store(d);
    return at;
  },
  async remove(lessonKey) {
    const d = load();
    delete d[lessonKey];
    store(d);
  },
};
