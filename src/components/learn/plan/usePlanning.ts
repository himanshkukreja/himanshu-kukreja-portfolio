"use client";

/**
 * The living plan's and the quiet nudges' shared state (lib/learner/planning-model.ts):
 *   struggles   the learner's open struggles (topics missed twice or more in 14 days), from GET /api/learn/planning, one
 *               request per page view shared by every component that asks (the dashboard's plan card and nudge line);
 *               guests and signed-out visitors get none (no personalisation)
 *   prefs       which nudges were dismissed and which recaps opened: the game flag `pref:nudges` (this browser for guests,
 *               the account's game_flags for signed-in learners; the newer copy wins across devices)
 *   recaps      the recap slots for the live plan
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGame } from "@/game/GameProvider";
import { userFetch } from "@/components/learn/progress/userFetch";
import { cleanNudgePrefs, NUDGE_FLAG, recapItems, withNudge, type NamedStruggle } from "@/lib/learner/planning-model";

type Got = { struggles: NamedStruggle[]; why: { text: string; week: string } | null };

let shared: { key: string; at: number; p: Promise<Got | null> } | null = null;

function load(key: string, query: string): Promise<Got | null> {
  if (shared && shared.key === key && Date.now() - shared.at < 60_000) return shared.p;
  const p = userFetch(`/api/learn/planning${query}`)
    .then(async (r) => (r.ok ? ((await r.json()) as Got) : null))
    .catch(() => null);
  shared = { key, at: Date.now(), p };
  return p;
}

/** Forget the shared answer (after a recap or a "why" line was made). */
export const refreshPlanning = () => {
  shared = null;
};

export function usePlanning(opts: { plan?: string | null; week?: string | null } = {}) {
  const { user, loading } = useAuth();
  const { flags, setFlag, hydrated } = useGame();
  const [got, setGot] = useState<{ key: string; v: Got | null } | null>(null);
  const q = opts.plan && opts.week ? `?plan=${encodeURIComponent(opts.plan)}&week=${opts.week}` : "";
  const key = user ? `${user.id}${q}` : "";

  useEffect(() => {
    if (!key) return;
    let off = false;
    load(key, q).then((v) => !off && setGot({ key, v }));
    return () => {
      off = true;
    };
  }, [key, q]);

  const prefs = useMemo(() => cleanNudgePrefs(hydrated ? flags[NUDGE_FLAG] : null), [flags, hydrated]);
  const mark = useCallback((what: "off" | "done", k: string) => setFlag(NUDGE_FLAG, withNudge(cleanNudgePrefs(flags[NUDGE_FLAG]), what, k, Date.now())), [flags, setFlag]);
  const data = got && got.key === key ? got.v : null;
  const struggles = useMemo(() => (user ? (data?.struggles ?? []) : []), [user, data]);
  const recaps = useMemo(() => (struggles.length ? recapItems(struggles, prefs) : null), [struggles, prefs]);
  return {
    /** null while loading (signed in); [] for guests */
    ready: !loading && (!user || (!!got && got.key === key)),
    signedIn: !!user,
    struggles,
    why: data?.why ?? null,
    prefs,
    recaps,
    dismiss: (k: string) => mark("off", k),
    opened: (k: string) => mark("done", k),
  };
}
