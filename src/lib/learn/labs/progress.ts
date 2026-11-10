"use client";

/**
 * Code-lab state in this browser (localStorage; every access guarded):
 *   hk.labs.v1                 { [id]: { runs, failedRuns, passedAt?, revealedAt?, stage?, deltas?, chaosAt?, scaleAt? } }
 *   hk.lab.code.<id>           { code, version, at }   the reader's Python code, autosaved (v1 key, kept)
 *   hk.lab.code.<id>.<lang>    the same for JavaScript / TypeScript
 *   hk.lab.lang                the language the reader last picked
 *   hk.labs.iv.v1              { [id]: { live?, best?, history } }   interview-mode runs
 *   hk.lab.font                editor font size (px)
 * "Cleared" and an interview pass also live in the game state (done["lab:<id>"], done["lab-iv:<id>"]),
 * which syncs to a signed-in profile.
 */
import { useSyncExternalStore } from "react";
import type { LabLang } from "./types";

export type LabProgress = {
  runs: number;
  failedRuns: number;
  passedAt?: number;
  revealedAt?: number;
  /** projects: the highest unlocked stage (0-based) */
  stage?: number;
  /** projects: per language, the highest stage whose starter delta is already in the reader's code */
  deltas?: Partial<Record<LabLang, number>>;
  /** last time every chaos test / the scale run passed */
  chaosAt?: number;
  scaleAt?: number;
};

const KEY = "hk.labs.v1";
const codeKey = (id: string, lang: LabLang = "python") => (lang === "python" ? `hk.lab.code.${id}` : `hk.lab.code.${id}.${lang}`);
const LANG_KEY = "hk.lab.lang";
const FONT_KEY = "hk.lab.font";
const EVENT = "hk:labs-changed";

function readAll(): Record<string, LabProgress> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Record<string, LabProgress>) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

let cache: Record<string, LabProgress> | null = null;

function snapshot(): Record<string, LabProgress> {
  cache ??= readAll();
  return cache;
}

function subscribe(cb: () => void) {
  const on = () => {
    cache = null;
    cb();
  };
  window.addEventListener(EVENT, on);
  window.addEventListener("storage", on);
  return () => {
    window.removeEventListener(EVENT, on);
    window.removeEventListener("storage", on);
  };
}

const EMPTY: Record<string, LabProgress> = {};

export function useLabProgress(): Record<string, LabProgress> {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

export function updateLab(id: string, fn: (p: LabProgress) => LabProgress) {
  const all = readAll();
  all[id] = fn(all[id] ?? { runs: 0, failedRuns: 0 });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage full or blocked: progress lives for this visit only
  }
  cache = all;
  window.dispatchEvent(new Event(EVENT));
}

export type SavedCode = { code: string; version: string; at: number };

export function loadCode(id: string, lang: LabLang = "python"): SavedCode | null {
  try {
    const raw = window.localStorage.getItem(codeKey(id, lang));
    const v = raw ? (JSON.parse(raw) as SavedCode) : null;
    return v && typeof v.code === "string" ? v : null;
  } catch {
    return null;
  }
}

export function saveCode(id: string, code: string, version: string, lang: LabLang = "python") {
  try {
    window.localStorage.setItem(codeKey(id, lang), JSON.stringify({ code, version, at: Date.now() }));
  } catch {
    // not saved: the editor still has it
  }
}

export function clearCode(id: string, lang: LabLang = "python") {
  try {
    window.localStorage.removeItem(codeKey(id, lang));
  } catch {
    // nothing to clear
  }
}

export const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20];

export function loadFont(): number {
  try {
    const n = Number(window.localStorage.getItem(FONT_KEY));
    return FONT_SIZES.includes(n) ? n : 14;
  } catch {
    return 14;
  }
}

export function saveFont(n: number) {
  try {
    window.localStorage.setItem(FONT_KEY, String(n));
  } catch {
    // keep it for this visit
  }
}

const SUGGEST_KEY = "hk.lab.suggest";

/** basic code suggestions in the editor: on unless the reader turned them off */
export function loadSuggest(): boolean {
  try {
    return window.localStorage.getItem(SUGGEST_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveSuggest(on: boolean) {
  try {
    window.localStorage.setItem(SUGGEST_KEY, on ? "on" : "off");
  } catch {
    // keep it for this visit
  }
}

export function loadLang(): LabLang | null {
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    return v === "python" || v === "javascript" || v === "typescript" ? v : null;
  } catch {
    return null;
  }
}

export function saveLang(lang: LabLang) {
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    // keep it for this visit
  }
}

// ------------------------------------------------------------------------------------------------
// interview mode

export type InterviewFollowUp = { title: string; tests: boolean; passed: boolean; answered: boolean; covered: boolean | null };
export type InterviewResult = {
  at: number;
  lang: LabLang;
  ms: number;
  targetMs: number;
  runs: number;
  failedRuns: number;
  followUps: InterviewFollowUp[];
  score: number;
  grade: string;
  passed: boolean;
};
export type InterviewLive = { startedAt: number; lang: LabLang; runs: number; failedRuns: number; baseMs: number | null; followIdx: number; followUps: InterviewFollowUp[] };
export type InterviewRecord = { live?: InterviewLive; best?: InterviewResult; history: InterviewResult[] };

const IV_KEY = "hk.labs.iv.v1";
const IV_EVENT = "hk:labs-iv-changed";

function readIv(): Record<string, InterviewRecord> {
  try {
    const raw = window.localStorage.getItem(IV_KEY);
    const v = raw ? (JSON.parse(raw) as Record<string, InterviewRecord>) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

let ivCache: Record<string, InterviewRecord> | null = null;
const ivSnapshot = () => (ivCache ??= readIv());
function ivSubscribe(cb: () => void) {
  const on = () => {
    ivCache = null;
    cb();
  };
  window.addEventListener(IV_EVENT, on);
  window.addEventListener("storage", on);
  return () => {
    window.removeEventListener(IV_EVENT, on);
    window.removeEventListener("storage", on);
  };
}
const IV_EMPTY: Record<string, InterviewRecord> = {};

export function useInterviews(): Record<string, InterviewRecord> {
  return useSyncExternalStore(ivSubscribe, ivSnapshot, () => IV_EMPTY);
}

export function updateInterview(id: string, fn: (r: InterviewRecord) => InterviewRecord) {
  const all = readIv();
  all[id] = fn(all[id] ?? { history: [] });
  try {
    window.localStorage.setItem(IV_KEY, JSON.stringify(all));
  } catch {
    // this visit only
  }
  ivCache = all;
  window.dispatchEvent(new Event(IV_EVENT));
}

/**
 * The interview score, out of 100: passing the tests 45, time against the target 20 (full inside it, down
 * to nothing at twice it), clean runs 10 (each failed run costs 2), follow-ups 25 (shared between them; a
 * tested one counts when its tests pass, a discussion one when the reader covered the strong answer, half
 * when they answered but missed some). Labs without follow-ups give their 25 to time and runs.
 */
export function scoreInterview(r: Pick<InterviewResult, "ms" | "targetMs" | "failedRuns" | "followUps">): { score: number; grade: string } {
  const time = r.ms <= r.targetMs ? 1 : Math.max(0, 1 - (r.ms - r.targetMs) / r.targetMs);
  const runs = Math.max(0, 1 - r.failedRuns * 0.2);
  const fu = r.followUps.length ? r.followUps.reduce((a, f) => a + (f.tests ? (f.passed ? 1 : 0) : f.covered ? 1 : f.answered ? 0.5 : 0), 0) / r.followUps.length : null;
  const score = Math.round(45 + (fu == null ? 32 * time + 23 * runs : 20 * time + 10 * runs + 25 * fu));
  const grade = score >= 88 ? "Strong hire" : score >= 75 ? "Hire" : score >= 60 ? "Lean hire" : "Keep practising";
  return { score: Math.min(100, score), grade };
}
