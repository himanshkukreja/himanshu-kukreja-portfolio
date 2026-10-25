"use client";

/** The AI interviewer conversation, per mock attempt and phase, kept in this browser. */
import { useCallback, useSyncExternalStore } from "react";

export type ChatMsg = { role: "user" | "assistant"; content: string };
type Store = Record<string, Record<string, ChatMsg[]>>;

const KEY = "hk.mock.ai";
const EVT = "hk:mock-ai";

function read(): Store {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "{}") as Store;
  } catch {
    return {};
  }
}
const getSnap = () => {
  try {
    return window.localStorage.getItem(KEY) || "{}";
  } catch {
    return "{}";
  }
};
const sub = (cb: () => void) => {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
};

export function attemptKey(slug: string, startedAt: number | null) {
  return `${slug}:${startedAt ?? 0}`;
}

export function useMockChats(attempt: string) {
  const raw = useSyncExternalStore(sub, getSnap, () => "{}");
  let all: Record<string, ChatMsg[]> = {};
  try {
    all = (JSON.parse(raw) as Store)[attempt] || {};
  } catch {
    all = {};
  }
  const setPhase = useCallback(
    (phaseId: string, msgs: ChatMsg[]) => {
      const s = read();
      // keep only the five most recent attempts
      const keys = Object.keys(s).filter((k) => k !== attempt);
      for (const k of keys.slice(0, Math.max(0, keys.length - 4))) delete s[k];
      s[attempt] = { ...(s[attempt] || {}), [phaseId]: msgs };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(s));
      } catch {
        /* storage full or blocked: the chat still works for this visit */
      }
      window.dispatchEvent(new Event(EVT));
    },
    [attempt],
  );
  return { chats: all, setPhase };
}
