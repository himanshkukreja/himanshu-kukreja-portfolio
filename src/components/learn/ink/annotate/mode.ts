"use client";

/**
 * Annotate mode, shared between the reading tools' Annotate button and the layer on the lesson (no React here):
 *   on     the mode is on (the toolbar shows; the pen / mouse writes on the lesson)
 *   show   "show my marks" (remembered on this device)
 *   ready  a lesson with annotations is mounted (the button only shows there)
 */
import { useSyncExternalStore } from "react";
import type { InkColor } from "@/lib/learn/ink/types";

export const ANNOT_COLORS: InkColor[] = ["signal", "red", "teal", "ink", "grey"];
/** pen widths in CSS px */
export const ANNOT_PEN_SIZES = [1.8, 2.8, 4.4] as const;
/** highlighter width in CSS px */
export const ANNOT_MARKER_SIZE = 16;

type State = { on: boolean; show: boolean; ready: number };
const SHOW_KEY = "hk.annot.show";

let state: State = { on: false, show: true, ready: 0 };
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function init() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    state = { ...state, show: window.localStorage.getItem(SHOW_KEY) !== "0" };
  } catch {
    // storage unavailable
  }
}

export function getAnnotate(): State {
  init();
  return state;
}
const SERVER: State = { on: false, show: true, ready: 0 };

export function subscribeAnnotate(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setAnnotating(on: boolean) {
  init();
  if (state.on === on) return;
  // turning the mode on shows the marks
  state = { ...state, on, show: on ? true : state.show };
  emit();
}

export const toggleAnnotating = () => setAnnotating(!getAnnotate().on);

export function setShowMarks(show: boolean) {
  init();
  state = { ...state, show };
  try {
    window.localStorage.setItem(SHOW_KEY, show ? "1" : "0");
  } catch {
    // storage unavailable
  }
  emit();
}

/** A lesson layer is mounted (returns the unregister function). */
export function registerAnnotateHost(): () => void {
  state = { ...state, ready: state.ready + 1 };
  emit();
  return () => {
    state = { ...state, ready: Math.max(0, state.ready - 1), on: state.ready <= 1 ? false : state.on };
    emit();
  };
}

export function useAnnotate(): State {
  return useSyncExternalStore(subscribeAnnotate, getAnnotate, () => SERVER);
}
