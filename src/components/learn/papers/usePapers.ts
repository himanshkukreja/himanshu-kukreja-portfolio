"use client";

/**
 * Written papers in the browser: the paper index (which weeks and quests have a paper; one cached request per tab,
 * /learn/papers/index.json) and a learner's record for a paper (the game flag `paper:<key>`).
 */
import { useEffect, useSyncExternalStore } from "react";
import { useGame } from "@/game/GameProvider";
import { paperFlagKey, readRecord, type PaperIndexEntry, type PaperRecord } from "@/lib/learn/papers/types";

let index: PaperIndexEntry[] | null = null;
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();

function load() {
  if (index || loading) return;
  loading = fetch("/learn/papers/index.json")
    .then((r) => (r.ok ? (r.json() as Promise<PaperIndexEntry[]>) : []))
    .catch(() => [] as PaperIndexEntry[])
    .then((list) => {
      index = Array.isArray(list) ? list : [];
      subs.forEach((f) => f());
    })
    .finally(() => {
      loading = null;
    });
}

/** Every paper that exists (null while loading). */
export function usePaperIndex(): PaperIndexEntry[] | null {
  useEffect(load, []);
  return useSyncExternalStore(
    (cb) => (subs.add(cb), () => subs.delete(cb)),
    () => index,
    () => null
  );
}

/** The paper for a week folder or a side quest's slug, if there is one. */
export function usePaperFor(key: string | null | undefined): PaperIndexEntry | null {
  const all = usePaperIndex();
  return (key && all?.find((p) => p.key === key)) || null;
}

/** The learner's record for a paper (empty until the game state is read). */
export function usePaperRecord(key: string): PaperRecord {
  const { flags } = useGame();
  return readRecord(flags[paperFlagKey(key)]);
}
