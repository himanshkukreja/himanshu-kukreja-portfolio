/**
 * How far a learner got in each lecture, kept in the game engine's flags so it follows a signed-in
 * learner across devices (anonymous learners keep it in this browser). One flag per lecture,
 * `lec:<id>`, because the sync merges flags key by key: two devices never overwrite each other's
 * lectures.
 *   t  resume point (s)     m  furthest point reached (s)
 *   d  lecture length (s)   at last watched (epoch ms)     w  1 once watched to the end (≥ 90 %)
 */
export type LectureProgress = { t: number; m: number; d: number; at: number; w?: 1 };

export const progressKey = (slug: string) => `lec:${slug}`;

export function readProgress(flags: Record<string, unknown>, slug: string): LectureProgress | null {
  const v = flags[progressKey(slug)] as Partial<LectureProgress> | undefined;
  if (!v || typeof v !== "object" || typeof v.t !== "number") return null;
  return { t: v.t, m: Number(v.m) || v.t, d: Number(v.d) || 0, at: Number(v.at) || 0, ...(v.w ? { w: 1 as const } : {}) };
}

export const WATCHED_AT = 0.9;

export const isWatched = (p: LectureProgress | null) => !!p && (!!p.w || (p.d > 0 && p.m >= p.d * WATCHED_AT));

/** 0–100, how much of the lecture has been seen (furthest point). */
export const watchedPct = (p: LectureProgress | null) => (!p || !p.d ? 0 : isWatched(p) ? 100 : Math.min(100, Math.round((p.m / p.d) * 100)));

/** The next progress value for a lecture, from where the player is now. */
export function nextProgress(prev: LectureProgress | null, at: number, duration: number, ended = false): LectureProgress {
  const m = Math.max(prev?.m || 0, at);
  const w = !!prev?.w || ended || (duration > 0 && m >= duration * WATCHED_AT);
  return { t: ended ? 0 : Math.floor(at), m: Math.floor(m), d: Math.round(duration), at: Date.now(), ...(w ? { w: 1 as const } : {}) };
}
