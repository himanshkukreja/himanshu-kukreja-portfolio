"use client";

/**
 * The learner's answer style (lib/ai/answerStyle.ts: Tutor, Simple, Detailed, Interview, Hinglish), remembered the
 * way the reading settings are: in this browser (localStorage, try/catch: blocked storage just means the default) and,
 * for a signed-in learner, in the game flags (pref:answer-style, synced to the account; the newer copy wins), so the
 * pick follows them to another device. One setting for the course chat and the in-lesson Ask AI panels.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useGame } from "@/game/GameProvider";
import { isAnswerStyle, type AnswerStyle } from "@/lib/ai/answerStyle";
import { track } from "@/lib/track";

const KEY = "hk.chat.style";
/** Game flag carrying the style to the account (src/lib/learn/saved-paths.ts mergeGameFlags: pref:* newer wins). */
export const STYLE_FLAG = "pref:answer-style";
const EVENT = "hk:answer-style";
type Stored = { style: AnswerStyle; updatedAt: number };

function readStored(): Stored {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || "null") as Partial<Stored> | null;
    if (v && isAnswerStyle(v.style)) return { style: v.style, updatedAt: Number(v.updatedAt) || 0 };
  } catch {
    /* blocked storage: the default */
  }
  return { style: "tutor", updatedAt: 0 };
}
function writeStored(s: Stored) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* blocked storage: this page view keeps it */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The style to send with a question now (outside React: the chat's send). */
export const readAnswerStyle = (): AnswerStyle => (typeof window === "undefined" ? "tutor" : readStored().style);

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

export function useAnswerStyle(): [AnswerStyle, (s: AnswerStyle, from?: string) => void] {
  const style = useSyncExternalStore(subscribe, readAnswerStyle, () => "tutor" as const);
  const { hydrated, flags, setFlag } = useGame();
  const synced = flags[STYLE_FLAG];
  useEffect(() => {
    if (!hydrated) return;
    const local = readStored();
    const r = synced && typeof synced === "object" ? (synced as Partial<Stored>) : null;
    const remote = r && isAnswerStyle(r.style) ? { style: r.style, updatedAt: Number(r.updatedAt) || 0 } : null;
    if (remote && remote.updatedAt > local.updatedAt) writeStored(remote);
    else if (local.updatedAt > (remote?.updatedAt ?? 0)) setFlag(STYLE_FLAG, local);
  }, [hydrated, synced, style, setFlag]);
  const set = useCallback((s: AnswerStyle, from = "chat") => {
    writeStored({ style: s, updatedAt: Date.now() });
    track("ai_answer_style", { style: s, from });
  }, []);
  return [style, set];
}
