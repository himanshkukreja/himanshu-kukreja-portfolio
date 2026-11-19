"use client";

/**
 * Telling SD Mastery learners that DSA Mastery is live (the slim bar under the header, the "new" dot on the course switch and the
 * hub's "Now live" card). All three share this state and one gate:
 *   - gate: DSA_FULL (NEXT_PUBLIC_DSA_MODE on / beta / full). While DSA is "soon" (production until release) nothing shows,
 *     so no promo ever points at the coming-soon page.
 *   - dismissed: the bar's close button; kept per device in localStorage and in the account's game flags (promo:dsa:dismissed)
 *   - visited: any /dsa page opened; the bar and the dot stop once the learner has been (localStorage + game flag promo:dsa:visited)
 * Storage reads and writes are wrapped: private windows and blocked storage just mean the bar returns on the next visit.
 */
import { useCallback, useEffect, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { DSA_FULL } from "@/lib/dsa/flags";

export const DSA_PROMO_ON = DSA_FULL;
export const PROMO_DISMISSED = "promo:dsa:dismissed";
export const PROMO_VISITED = "promo:dsa:visited";
const LS = { [PROMO_DISMISSED]: "hk.promo.dsa.dismissed", [PROMO_VISITED]: "hk.promo.dsa.visited" } as const;

const readLs = (k: string) => {
  try {
    return window.localStorage.getItem(k) === "1";
  } catch {
    return false;
  }
};
const writeLs = (k: string) => {
  try {
    window.localStorage.setItem(k, "1");
  } catch {
    // storage blocked: the account flag (signed in) or the next visit decides
  }
};

/** `ready` is false until the browser and the game state have loaded (nothing renders before it, so nothing flashes). */
export function useDsaPromo() {
  const { flags, hydrated, setFlag } = useGame();
  const [mounted, setMounted] = useState(false);
  const [local, setLocal] = useState({ dismissed: false, visited: false });
  useEffect(() => {
    // browser-only storage, read after mount so the server render and the first client render match
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal({ dismissed: readLs(LS[PROMO_DISMISSED]), visited: readLs(LS[PROMO_VISITED]) });
    setMounted(true);
  }, []);
  const dismissed = local.dismissed || !!flags[PROMO_DISMISSED];
  const visited = local.visited || !!flags[PROMO_VISITED];
  const mark = useCallback(
    (key: typeof PROMO_DISMISSED | typeof PROMO_VISITED) => {
      writeLs(LS[key]);
      setLocal((l) => ({ ...l, [key === PROMO_DISMISSED ? "dismissed" : "visited"]: true }));
      setFlag(key, Date.now());
    },
    [setFlag],
  );
  return {
    ready: DSA_PROMO_ON && mounted && hydrated,
    dismissed,
    visited,
    dismiss: useCallback(() => mark(PROMO_DISMISSED), [mark]),
    markVisited: useCallback(() => mark(PROMO_VISITED), [mark]),
  };
}
