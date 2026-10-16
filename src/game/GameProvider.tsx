"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LEVELS, QUEST_BY_ID, QUESTS, levelIndex } from "./catalog";
import { useAuth } from "@/contexts/AuthContext";
import { useGameSync } from "./useGameSync";
import { track } from "@/lib/track";

const STORAGE_KEY = "hk.game.v1";

type Toast = { id: number; xp: number; text: string; levelUp: boolean };

type Persisted = {
  xp: number;
  done: Record<string, number>;
  flags: Record<string, unknown>;
};

type GameContextValue = {
  hydrated: boolean;
  xp: number;
  done: Record<string, number>;
  flags: Record<string, unknown>;
  /** Complete a quest from the catalog once. Returns the XP gained (0 if already done). */
  award: (questId: string, label?: string) => number;
  /** Generic XP grant for repeatable actions (e.g. a correct trial answer). */
  grant: (xp: number, label: string) => void;
  /** One-time XP for things outside the quest catalog (e.g. "lesson:week-02/day-03"). Returns XP gained. */
  awardOnce: (key: string, xp: number, label: string) => number;
  setFlag: (key: string, value: unknown) => void;
  reset: () => void;
  toasts: Toast[];
  terminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
};

/** Exported for sandboxes (admin case-file preview) that need an in-memory game state. */
export type { GameContextValue };
export const GameContext = createContext<GameContextValue | null>(null);

const EMPTY: Persisted = { xp: 0, done: {}, flags: {} };

function load(): Persisted {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return { xp: Number(parsed.xp) || 0, done: parsed.done || {}, flags: parsed.flags || {} };
  } catch {
    return EMPTY;
  }
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const stateRef = useRef(state);
  const toastId = useRef(0);

  useEffect(() => {
    const saved = load();
    stateRef.current = saved;
    // Hydrate from localStorage after mount so server and client markup match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(saved);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage can be unavailable (private mode); the game still works for this visit
    }
  }, [state, hydrated]);

  const pushToast = useCallback((xp: number, text: string, levelUp: boolean) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, xp, text, levelUp }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), levelUp ? 5200 : 3800);
  }, []);

  // Every mutation goes through commit(): stateRef is the single synchronous source of truth,
  // so award / grant / setFlag can be called back to back without losing each other's writes.
  const commit = useCallback((next: Persisted) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const applyXp = useCallback(
    (next: Persisted, gained: number, label: string) => {
      const before = levelIndex(stateRef.current.xp);
      const after = levelIndex(next.xp);
      commit(next);
      if (after > before) {
        const l = LEVELS[after];
        pushToast(gained, `Level up · you are now ${l.code} · ${l.name}`, true);
      } else {
        pushToast(gained, label, false);
      }
    },
    [commit, pushToast]
  );

  const award = useCallback(
    (questId: string, label?: string) => {
      const quest = QUEST_BY_ID[questId];
      const cur = stateRef.current;
      if (!quest || cur.done[questId]) return 0;
      if (quest.group === "arcade" || quest.group === "play" || questId === "rush") track("play", { game: questId, result: "cleared" });
      const done = { ...cur.done, [questId]: Date.now() };
      let xp = cur.xp + quest.xp;
      let gained = quest.xp;
      let text = label || quest.label;
      // Clearing every arcade cartridge unlocks the hidden Completionist quest.
      if (quest.group === "arcade" && !done["arcade:all"]) {
        const carts = QUESTS.filter((q) => q.group === "arcade" && !q.hidden);
        if (carts.every((q) => done[q.id])) {
          const bonus = QUEST_BY_ID["arcade:all"];
          done["arcade:all"] = Date.now();
          xp += bonus.xp;
          gained += bonus.xp;
          text = "Completionist · every cartridge cleared";
        }
      }
      applyXp({ ...cur, xp, done }, gained, text);
      return gained;
    },
    [applyXp]
  );

  const grant = useCallback(
    (xp: number, label: string) => {
      if (xp <= 0) return;
      const cur = stateRef.current;
      applyXp({ ...cur, xp: cur.xp + xp }, xp, label);
    },
    [applyXp]
  );

  const awardOnce = useCallback(
    (key: string, xp: number, label: string) => {
      const cur = stateRef.current;
      if (!key || cur.done[key] || xp <= 0) return 0;
      applyXp({ ...cur, xp: cur.xp + xp, done: { ...cur.done, [key]: Date.now() } }, xp, label);
      return xp;
    },
    [applyXp]
  );

  const setFlag = useCallback(
    (key: string, value: unknown) => {
      const cur = stateRef.current;
      commit({ ...cur, flags: { ...cur.flags, [key]: value } });
    },
    [commit]
  );

  const reset = useCallback(() => {
    commit(EMPTY);
    setToasts([]);
  }, [commit]);

  // Signed-in visitors: merge with and persist to their profile (no-op for guests).
  const { user } = useAuth();
  useGameSync(user?.id ?? null, hydrated, state, commit);

  const value = useMemo<GameContextValue>(
    () => ({
      hydrated,
      xp: state.xp,
      done: state.done,
      flags: state.flags,
      award,
      grant,
      awardOnce,
      setFlag,
      reset,
      toasts,
      terminalOpen,
      setTerminalOpen,
    }),
    [hydrated, state, award, grant, awardOnce, setFlag, reset, toasts, terminalOpen]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside <GameProvider>");
  return ctx;
}
