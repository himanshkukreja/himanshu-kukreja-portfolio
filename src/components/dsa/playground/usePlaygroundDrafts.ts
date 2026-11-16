"use client";

/**
 * The Playground's per-language drafts (src/lib/dsa/playground/drafts.ts): this device's copy, and for a signed-in
 * learner the account's (game flags `pref:dsa-pg:<lang>`); the newer one wins. Saves are debounced; a draft too big
 * for the flags stays on this device and `tooBig` says so.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { useAuth } from "@/contexts/AuthContext";
import { DSA_LANGS, type DsaLang } from "@/lib/dsa/types";
import { decodeDraft, draftFlagKey, draftLocalKey, fitsAccount, newerDraft, previousLocalKey, STARTERS, type Draft } from "@/lib/dsa/playground/drafts";

const local = {
  get(k: string): string | null {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) window.localStorage.removeItem(k);
      else window.localStorage.setItem(k, v);
    } catch {
      /* storage blocked */
    }
  },
};

export type Drafts = Record<DsaLang, Draft | null>;
const EMPTY: Drafts = { python: null, javascript: null, java: null, cpp: null };

export function usePlaygroundDrafts() {
  const { flags, setFlag, hydrated } = useGame();
  const { user } = useAuth();
  const [device, setDevice] = useState<Drafts>(EMPTY);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "device">("idle");
  const timers = useRef<Partial<Record<DsaLang, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    const next = { ...EMPTY };
    for (const l of DSA_LANGS) next[l] = decodeDraft(local.get(draftLocalKey(l)));
    // device state, readable only after hydration
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDevice(next);
    setReady(true);
  }, []);
  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach((x) => x && clearTimeout(x));
  }, []);

  /** the newer of this device's copy and the account's */
  const drafts = useMemo<Drafts>(() => {
    const out = { ...EMPTY };
    for (const l of DSA_LANGS) out[l] = newerDraft(device[l], user && hydrated ? decodeDraft(flags[draftFlagKey(l)]) : null);
    return out;
  }, [device, flags, hydrated, user]);

  const codeFor = useCallback((l: DsaLang) => drafts[l] ?? { ...STARTERS[l], updatedAt: 0 }, [drafts]);

  const write = useCallback(
    (l: DsaLang, d: Draft) => {
      local.set(draftLocalKey(l), JSON.stringify(d));
      setDevice((cur) => ({ ...cur, [l]: d }));
      if (user && fitsAccount(d)) {
        setFlag(draftFlagKey(l), d);
        setSaved("saved");
      } else setSaved(user ? "device" : "saved");
    },
    [setFlag, user],
  );

  /** Save as you type (debounced). */
  const save = useCallback(
    (l: DsaLang, code: string, stdin: string) => {
      setSaved("saving");
      const t = timers.current[l];
      if (t) clearTimeout(t);
      timers.current[l] = setTimeout(() => write(l, { code, stdin, updatedAt: Date.now() }), 700);
    },
    [write],
  );

  /** Save now (a language switch, a run, an incoming snippet). */
  const saveNow = useCallback(
    (l: DsaLang, code: string, stdin: string) => {
      const t = timers.current[l];
      if (t) clearTimeout(t);
      const cur = drafts[l] ?? STARTERS[l];
      if (cur.code === code && cur.stdin === stdin) return;
      write(l, { code, stdin, updatedAt: Date.now() });
    },
    [drafts, write],
  );

  /** Keep the draft an incoming snippet replaces, so "Bring back my draft" can restore it. */
  const keepPrevious = useCallback(
    (l: DsaLang) => {
      const d = drafts[l];
      if (d && d.code.trim()) local.set(previousLocalKey(l), JSON.stringify(d));
      return !!d && !!d.code.trim();
    },
    [drafts],
  );
  const takePrevious = useCallback((l: DsaLang): Draft | null => {
    const d = decodeDraft(local.get(previousLocalKey(l)));
    local.set(previousLocalKey(l), null);
    return d;
  }, []);

  return { ready: ready && hydrated, drafts, codeFor, save, saveNow, saved, keepPrevious, takePrevious, signedIn: !!user };
}
