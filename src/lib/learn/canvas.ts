import "server-only";
/**
 * Design canvas: draw an architecture for an interview problem, a world's capstone or your own idea,
 * keep notes, and get an AI staff-engineer review of what you drew. Designs are saved per learner per
 * prompt in canvas_designs (supabase/migrations/20261028_canvas_designs.sql), server-only.
 *
 * Prompt keys: problem:<slug> · capstone:<week key> · free:<random id>
 * The brief is cut from the article before any solution: a problem's mission + brief + requirements
 * (everything before "Phase 2"); a capstone's text up to its traffic estimates.
 */
import { supabase } from "@/lib/supabase";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { fetchMarkdownContent } from "@/lib/github";

export type CanvasPrompt = { key: string; kind: "problem" | "capstone"; title: string; group: string; href: string; path: string };

export async function canvasPrompts(): Promise<CanvasPrompt[]> {
  const map = await getCourseMap(COURSE_ID);
  if (!map) return [];
  const problems = (map.problems || []).map((l) => ({ key: `problem:${l.slug}`, kind: "problem" as const, title: l.title, group: "Interview problems", href: l.href, path: `resources/${l.week}/${l.slug}.md` }));
  const capstones = map.weeks
    .filter((w) => w.boss)
    .map((w) => ({ key: `capstone:${w.key}`, kind: "capstone" as const, title: w.boss!.title, group: `Capstones · W${w.code} ${w.title}`, href: w.boss!.href, path: `resources/${w.boss!.week}/${w.boss!.slug}.md` }));
  return [...problems, ...capstones];
}

export const FREE_RE = /^free:[a-z0-9]{8,24}$/;
export const isPromptKey = (k: string) => /^(problem:[a-z0-9-]{2,120}|capstone:[a-z0-9-]{2,120})$/.test(k) || FREE_RE.test(k);

/** Markdown → plain text for a brief: block markers, directives, images, code fences and emphasis gone. */
function plain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^:{2,}\s*anim\[[^\]]*\].*$/gm, "")
    .replace(/^:{3,}\s*[a-z-]+\[([^\]]*)\][^\n]*$/gm, "$1")
    .replace(/^:{3,}\s*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^---+$/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\s)\*([^*\n]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The brief for a problem or capstone, without the solution (≤ 3,000 characters). */
export async function promptBrief(p: CanvasPrompt): Promise<string> {
  const md = await fetchMarkdownContent(p.path).catch(() => "");
  if (!md) return p.title;
  return briefFromMarkdown(md, p.kind);
}

/** The brief cut from a problem's or capstone's markdown (pure: the AI eval builds briefs with it too). */
export function briefFromMarkdown(md: string, kind: CanvasPrompt["kind"]): string {
  let cut = md;
  if (kind === "problem") {
    const i = md.search(/^#\s+Phase 2\b/m);
    if (i > 0) cut = md.slice(0, i);
  } else {
    // a capstone: the interviewer's opening ask, then the functional and non-functional requirements
    // (not the "concepts you'll apply" table, which gives the answer away)
    const end = md.search(/^##\s+(Traffic Estimation|Storage Estimation|System Architecture|High-Level Design)/im);
    const head = end > 0 ? md.slice(0, end) : md;
    const ask = head.search(/\*\*Interviewer\*\*/);
    const reqs = head.search(/^##\s+Functional Requirements/im);
    const intro = ask >= 0 ? head.slice(ask, reqs > ask ? Math.min(reqs, ask + 1400) : ask + 1400) : "";
    cut = `${intro}\n\n${reqs >= 0 ? head.slice(reqs) : head}`;
  }
  // the interviewer/candidate dialogue before the requirements is the setup, keep it; drop quiz blocks
  cut = cut.replace(/```quiz[\s\S]*?```/g, "");
  return plain(cut).slice(0, 3000);
}

/* ------------------------------------------------------------------ store */

export type DesignRow = {
  id: string;
  user_id: string;
  prompt_key: string;
  title: string | null;
  brief: string | null;
  scene: string;
  notes: string;
  review: string | null;
  reviewed_at: string | null;
  reviews: number;
  created_at: string;
  updated_at: string;
};

const COLS = "id, user_id, prompt_key, title, brief, scene, notes, review, reviewed_at, reviews, created_at, updated_at";
const LIST_COLS = "id, prompt_key, title, reviewed_at, reviews, updated_at";

export async function myDesigns(userId: string) {
  const { data, error } = await supabase.from("canvas_designs").select(LIST_COLS).eq("user_id", userId).order("updated_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data || []) as Pick<DesignRow, "id" | "prompt_key" | "title" | "reviewed_at" | "reviews" | "updated_at">[];
}

export async function getDesign(userId: string, key: string): Promise<DesignRow | null> {
  const { data, error } = await supabase.from("canvas_designs").select(COLS).eq("user_id", userId).eq("prompt_key", key).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DesignRow | null) ?? null;
}

export async function saveDesign(userId: string, key: string, d: { scene?: string; notes?: string; title?: string | null; brief?: string | null }): Promise<DesignRow> {
  const row: Record<string, unknown> = { user_id: userId, prompt_key: key, updated_at: new Date().toISOString() };
  if (d.scene !== undefined) row.scene = d.scene;
  if (d.notes !== undefined) row.notes = d.notes;
  if (d.title !== undefined) row.title = d.title;
  if (d.brief !== undefined) row.brief = d.brief;
  const { data, error } = await supabase.from("canvas_designs").upsert(row, { onConflict: "user_id,prompt_key" }).select(COLS).single();
  if (error) throw new Error(error.message);
  return data as DesignRow;
}

export async function saveReview(id: string, review: string, reviews: number) {
  const { error } = await supabase.from("canvas_designs").update({ review, reviewed_at: new Date().toISOString(), reviews }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteDesign(userId: string, key: string) {
  const { error } = await supabase.from("canvas_designs").delete().eq("user_id", userId).eq("prompt_key", key);
  if (error) throw new Error(error.message);
}
