"use client";

/** War stories, this browser only: best war-room run per slug and the real stories you have read. */

const RUNS = "hk.war.runs";
const READ = "hk.war.read";
export const WAR_EVENT = "hk:war";

type Runs = Record<string, { wrong: number; at: string }>;

function get<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function put(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(WAR_EVENT));
  } catch {
    /* storage blocked: the run still counts for XP */
  }
}

export const readRuns = (): Runs => get<Runs>(RUNS, {});

/** Keeps the run with the fewest wrong calls; returns the best. */
export function saveRun(slug: string, wrong: number): { wrong: number } {
  const runs = readRuns();
  const prev = runs[slug];
  if (!prev || wrong < prev.wrong) {
    runs[slug] = { wrong, at: new Date().toISOString() };
    put(RUNS, runs);
    return { wrong };
  }
  return { wrong: prev.wrong };
}

export const readStoriesRead = (): string[] => get<string[]>(READ, []);

export function markStoryRead(slug: string) {
  const read = readStoriesRead();
  if (!read.includes(slug)) put(READ, [...read, slug]);
}
