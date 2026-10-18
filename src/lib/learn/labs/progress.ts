"use client";

/**
 * Code-lab state in this browser (localStorage; every access guarded):
 *   hk.labs.v1            { [id]: { runs, failedRuns, passedAt?, revealedAt? } }
 *   hk.lab.code.<id>      { code, version, at }   the reader's code, autosaved
 *   hk.lab.font           editor font size (px)
 * "Cleared" also lives in the game state (done["lab:<id>"]), which syncs to a signed-in profile.
 */
import { useSyncExternalStore } from "react";

export type LabProgress = { runs: number; failedRuns: number; passedAt?: number; revealedAt?: number };

const KEY = "hk.labs.v1";
const codeKey = (id: string) => `hk.lab.code.${id}`;
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

export function loadCode(id: string): SavedCode | null {
  try {
    const raw = window.localStorage.getItem(codeKey(id));
    const v = raw ? (JSON.parse(raw) as SavedCode) : null;
    return v && typeof v.code === "string" ? v : null;
  } catch {
    return null;
  }
}

export function saveCode(id: string, code: string, version: string) {
  try {
    window.localStorage.setItem(codeKey(id), JSON.stringify({ code, version, at: Date.now() }));
  } catch {
    // not saved: the editor still has it
  }
}

export function clearCode(id: string) {
  try {
    window.localStorage.removeItem(codeKey(id));
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
