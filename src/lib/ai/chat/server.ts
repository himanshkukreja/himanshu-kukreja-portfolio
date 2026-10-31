import "server-only";
/**
 * The course chat's real dependencies: the smart-search engine and its publishing gate, the course map and
 * content (through the same cached GitHub / SDM_LOCAL_DIR layer the pages use), the question bank, and the
 * signed-in learner's own progress, saved paths and memory, always loaded by the verified user id.
 */
import { supabase } from "@/lib/supabase";
import { getLearningResource } from "@/lib/github";
import { getStorySource } from "@/lib/stories";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { getQuestDrills } from "@/lib/learn/drills/load";
import { getWeekQuestions } from "@/lib/learn/arena/bank";
import { listSavedPaths, type SavedPath } from "@/lib/learn/saved-paths";
import { getEngine, liveCheck } from "@/lib/search/smart/server";
import type { CourseMap } from "@/lib/learn/types";
import type { BankItem, ChatDeps, DesignCtx } from "./tools";
import { getMockInterview } from "@/lib/learn/mock/page-data";
import { canvasPrompts, FREE_RE, getDesign, myDesigns, promptBrief } from "@/lib/learn/canvas";
import { sketchSummary } from "@/lib/learn/mock/sketch";
import type { PageContext } from "./text";
import { buildSnapshot, type ProgressRaw, type ProgressSnapshot } from "./progress-model";
import { cleanMemory, emptyMemory, type ChatMemory } from "./memory-model";
import { dueReviewsFor, planFor } from "./reviewSeams";

const isMissing = (e: { code?: string; message?: string } | null) => !!e && (["42P01", "42703", "PGRST204", "PGRST205"].includes(e.code || "") || /does not exist|could not find the/i.test(e.message || ""));

/** One learner's raw progress and saved paths, kept a minute per instance (a chat sends a few messages a minute). */
const cache = new Map<string, { at: number; p: Promise<{ raw: ProgressRaw; flags: Record<string, unknown> }> }>();
function loadRaw(userId: string): Promise<{ raw: ProgressRaw; flags: Record<string, unknown> }> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = (async () => {
    const [profile, rows, trials, cards] = await Promise.all([
      supabase.from("user_profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("learning_progress").select("*").eq("user_id", userId).eq("course_id", COURSE_ID).limit(2000),
      supabase.from("trial_attempts").select("week, part, score, total, passed").eq("user_id", userId).eq("course_id", COURSE_ID).limit(1000),
      supabase.from("review_cards").select("front, week, lesson_slug, box, last_grade, due_at").eq("user_id", userId).eq("course_id", COURSE_ID).limit(500),
    ]);
    const prof = (profile.data ?? null) as (ProgressRaw["profile"] & { game_flags?: Record<string, unknown> | null }) | null;
    return {
      raw: {
        profile: prof ? { xp: prof.xp, game_done: prof.game_done, current_streak: prof.current_streak } : null,
        rows: (rows.data ?? []) as ProgressRaw["rows"],
        trials: trials.error ? [] : ((trials.data ?? []) as ProgressRaw["trials"]),
        cards: cards.error ? [] : ((cards.data ?? []) as ProgressRaw["cards"]),
      },
      flags: (prof?.game_flags && typeof prof.game_flags === "object" ? prof.game_flags : {}) as Record<string, unknown>,
    };
  })();
  cache.set(userId, { at: Date.now(), p });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  p.catch(() => cache.delete(userId));
  return p;
}

/** After a save, the next message should see it. */
export const forgetProgress = (userId: string) => cache.delete(userId);

/**
 * How long a message waits for each thing it loads before going on without it (a cold server builds them on first use;
 * they keep loading in the background, so the next message has them). The course search can't be done without:
 * past ENGINE_WAIT_MS the message ends at once with "still loading, ask again" (ChatWarmingError) instead of using up
 * the whole deadline before the model is ever called.
 */
export const ENGINE_WAIT_MS = 20_000;
const MAP_WAIT_MS = 8_000;
const CONTROLS_WAIT_MS = 5_000;
export const MEMORY_WAIT_MS = 5_000;
const BANK_WAIT_MS = 8_000;

/** The course search index isn't ready yet on this (cold) server. */
export class ChatWarmingError extends Error {
  constructor() {
    super("course search still loading");
    this.name = "ChatWarmingError";
  }
}

/** `p`'s value, or `fallback` when it fails or takes longer than `ms` (`p` itself carries on). */
export function within<T>(p: Promise<T>, ms: number, fallback: T | (() => T), what: string): Promise<T> {
  const value = () => (typeof fallback === "function" ? (fallback as () => T)() : fallback);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[chat] ${what} not ready after ${ms} ms: going on without it`);
      resolve(value());
    }, ms);
  });
  return Promise.race([p.catch(() => value()), late]).finally(() => clearTimeout(timer));
}

export async function makeDeps(a: { origin: string; userId: string | null; page: PageContext | null }): Promise<{ deps: ChatDeps; map: CourseMap | null }> {
  const warming = Symbol("warming");
  const [engine, live, map] = await Promise.all([
    within<Awaited<ReturnType<typeof getEngine>> | typeof warming>(getEngine(a.origin), ENGINE_WAIT_MS, warming, "course search"),
    // a read failure must never hide content (lib/learn/controls.ts): late controls = everything live, as on an error
    within(liveCheck(), CONTROLS_WAIT_MS, () => () => true, "publishing controls"),
    within(getCourseMap().catch(() => null), MAP_WAIT_MS, null, "course map"),
  ]);
  if (engine === warming) throw new ChatWarmingError();
  const deps: ChatDeps = {
    engine,
    live,
    courseMap: async () => map,
    lessonMarkdown: async (week, slug) => (await getLearningResource(week, slug).catch(() => null))?.content ?? null,
    storyBody: async (slug) => (await getStorySource(slug).catch(() => null))?.body ?? null,
    drills: (slug) => getQuestDrills(slug, []),
    // one week at a time (never the whole course's bank on a cold server), and never more than BANK_WAIT_MS:
    // without it the practice tools still offer the lesson's checkpoints and drills
    questionBank: (week) => within(getWeekQuestions(week) as Promise<BankItem[]>, BANK_WAIT_MS, [] as BankItem[], `question bank (${week})`),
    progress: async (): Promise<ProgressSnapshot | null> => {
      if (!a.userId || !map) return null;
      return buildSnapshot((await loadRaw(a.userId)).raw, map);
    },
    savedPaths: async (): Promise<SavedPath[] | null> => {
      if (!a.userId) return null;
      return listSavedPaths((await loadRaw(a.userId)).flags);
    },
    page: a.page,
    mock: (slug) => getMockInterview(slug),
    design: async (key) => (a.userId ? latestDesign(a.userId, key) : null),
    // seams for lib/learn/review-due.ts and lib/learn/study-plan.ts (helper B): wired in reviewSeams.ts
    dueReviews: async () => (a.userId ? dueReviewsFor(a.userId) : null),
    studyPlan: async (p) => planFor(p),
  };
  return { deps, map };
}

/** The learner's design on the canvas, as /api/learn/ai/canvas-review reads it: this key, else their latest. */
async function latestDesign(userId: string, key?: string): Promise<DesignCtx | null> {
  const k = key ?? (await myDesigns(userId).catch(() => []))[0]?.prompt_key;
  if (!k) return null;
  const d = await getDesign(userId, k).catch(() => null);
  if (!d) return null;
  let brief = d.brief || d.title || "The learner's own system; infer the requirements from the drawing and notes.";
  let title = d.title || "My own design";
  if (!FREE_RE.test(k)) {
    const p = (await canvasPrompts().catch(() => [])).find((x) => x.key === k);
    if (p) {
      title = p.title;
      brief = await promptBrief(p).catch(() => brief);
    }
  }
  return { key: k, title, brief, drawing: sketchSummary(d.scene), notes: d.notes || "", updatedAt: d.updated_at };
}

/* ------------------------------------------------------------------ memory (table chat_memory) */

export type MemoryState = { available: boolean; paused: boolean; memory: ChatMemory };

/** The learner's memory row. `available: false` until the chat_memory migration is applied (the chat runs without memory). */
export async function loadMemory(userId: string): Promise<MemoryState> {
  const { data, error } = await supabase.from("chat_memory").select("memory, paused").eq("user_id", userId).maybeSingle();
  // a missing table (migration not applied yet) or any read error: the chat runs without memory
  if (error) return { available: false, paused: false, memory: emptyMemory() };
  const row = data as { memory: unknown; paused: boolean } | null;
  return { available: true, paused: !!row?.paused, memory: cleanMemory(row?.memory) };
}

export async function saveMemory(userId: string, memory: ChatMemory): Promise<boolean> {
  const { error } = await supabase.from("chat_memory").upsert({ user_id: userId, memory, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error && !isMissing(error)) console.error("[chat] memory save failed", error.message);
  return !error;
}

export async function clearMemory(userId: string): Promise<boolean> {
  const { error } = await supabase.from("chat_memory").delete().eq("user_id", userId);
  return !error;
}

export async function setMemoryPaused(userId: string, paused: boolean): Promise<boolean> {
  const { error } = await supabase.from("chat_memory").upsert({ user_id: userId, paused, ...(paused ? { memory: {} } : {}), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return !error;
}
