"use client";

/**
 * "Teach me" and "Explain it differently" on the page (lib/ai/teaching.ts has the rules).
 *
 *   useTeachMode / readTeachMode   the toggle, remembered like the answer style: in this browser (localStorage) and in
 *                                  the game flags (pref:teach-mode, the newer copy wins), and in the learner's memory
 *                                  prefs (PATCH /api/learn/ai/chat/memory { teach }), so the tutors know it too and a
 *                                  new device starts with it on. Memory off: the toggle still works for the session.
 *   learnerPrefs()                 the memory's prefs, read once a page view (the remembered "Teach me" and the style
 *                                  that worked); null for a guest or when memory is off
 *   recordWorkingStyle(pick, via)  the explanation style that worked, after "Explain it differently" and a thumbs-up
 *                                  ("thumbs-up") or the learner moving on ("moved-on"); once per answer
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useGame } from "@/game/GameProvider";
import { aiFetch } from "@/components/learn/ai/aiFetch";
import { userFetch } from "@/components/learn/progress/userFetch";
import { supabaseClient } from "@/lib/supabase-client";
import { hasTeachPref, workingStyleOf, type Restyle } from "@/lib/ai/teaching";
import { track } from "@/lib/track";

const KEY = "hk.chat.teach";
export const TEACH_FLAG = "pref:teach-mode";
const EVENT = "hk:teach-mode";
type Stored = { on: boolean; updatedAt: number };

function readStored(): Stored {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || "null") as Partial<Stored> | null;
    if (v && typeof v.on === "boolean") return { on: v.on, updatedAt: Number(v.updatedAt) || 0 };
  } catch {
    /* blocked storage: off */
  }
  return { on: false, updatedAt: 0 };
}
function writeStored(s: Stored) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* blocked storage: this page view keeps it */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Whether "Teach me" is on now (outside React: the chat's send). */
export const readTeachMode = (): boolean => (typeof window === "undefined" ? false : readStored().on);

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

/* ------------------------------------------------------------------ the memory's prefs, once a page view */

let prefsP: Promise<string[] | null> | null = null;
export function learnerPrefs(): Promise<string[] | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  prefsP ??= (async () => {
    const { data } = await supabaseClient.auth.getSession();
    if (!data.session) return null;
    const r = await userFetch("/api/learn/ai/chat/memory");
    if (!r.ok) return null;
    const b = (await r.json()) as { available?: boolean; paused?: boolean; memory?: { prefs?: string[] } };
    return b.available && !b.paused ? (b.memory?.prefs ?? []) : null;
  })().catch(() => null);
  return prefsP;
}
/** The style the learner's memory says works (for "Explain it differently" to avoid when it rotates), if known yet. */
let working: Restyle | null = null;
export const workingStyle = () => working;

export function useTeachMode(): [boolean, (on: boolean, from?: string) => void] {
  const on = useSyncExternalStore(subscribe, readTeachMode, () => false);
  const { hydrated, flags, setFlag } = useGame();
  const synced = flags[TEACH_FLAG];
  useEffect(() => {
    if (!hydrated) return;
    const local = readStored();
    const r = synced && typeof synced === "object" ? (synced as Partial<Stored>) : null;
    const remote = r && typeof r.on === "boolean" ? { on: r.on, updatedAt: Number(r.updatedAt) || 0 } : null;
    if (remote && remote.updatedAt > local.updatedAt) writeStored(remote);
    else if (local.updatedAt > (remote?.updatedAt ?? 0)) setFlag(TEACH_FLAG, local);
  }, [hydrated, synced, on, setFlag]);
  // never set on this device or account: the memory's pref decides (a learner who switched it on elsewhere)
  useEffect(() => {
    let off = false;
    void learnerPrefs().then((prefs) => {
      if (off || !prefs) return;
      working = workingStyleOf(prefs);
      if (readStored().updatedAt === 0 && hasTeachPref(prefs)) writeStored({ on: true, updatedAt: 1 });
    });
    return () => {
      off = true;
    };
  }, []);
  const set = useCallback((v: boolean, from = "chat") => {
    writeStored({ on: v, updatedAt: Date.now() });
    track("ai_teach_mode", { on: v, from });
    // the tutors' memory too (a quiet no-op for a guest or while memory is off)
    void aiFetch("/api/learn/ai/chat/memory", { method: "PATCH", body: JSON.stringify({ teach: v }) }).catch(() => null);
  }, []);
  return [on, set];
}

const recorded = new Set<string>();
/** The explanation style that worked for this answer (`key`: the answer's id), noted once in memory. */
export function recordWorkingStyle(pick: Restyle, via: "thumbs-up" | "moved-on", key: string) {
  if (recorded.has(key)) return;
  recorded.add(key);
  working = pick;
  track("ai_style_worked", { style: pick, via });
  void aiFetch("/api/learn/ai/chat/memory", { method: "PATCH", body: JSON.stringify({ style: { pick, via } }) }).catch(() => null);
}
