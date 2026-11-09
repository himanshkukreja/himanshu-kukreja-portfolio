"use client";

/**
 * The re-solve queue in the browser (src/lib/dsa/revise.ts has the rule): this device's submit history from the problem
 * room (`dsa.history.<id>`, `dsa.editorial.<id>`), plus the account's submits for signed-in learners (GET
 * /api/dsa/revise, one request per page view and user, shared by the hub card and /dsa/revise).
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { userFetch } from "@/components/learn/progress/userFetch";
import { localDay, resolveSchedule, type ResolveItem, type SubmitEvent } from "@/lib/dsa/revise";

export function readLocalSubmits(): { events: SubmitEvent[]; early: Set<string> } {
  const events: SubmitEvent[] = [];
  const early = new Set<string>();
  try {
    const ls = window.localStorage;
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i) || "";
      if (k.startsWith("dsa.history.")) {
        const id = k.slice(12);
        try {
          const rows = JSON.parse(ls.getItem(k) || "[]") as { at?: number; verdict?: string }[];
          if (Array.isArray(rows)) for (const r of rows) if (r && typeof r.at === "number" && typeof r.verdict === "string") events.push({ p: id, v: r.verdict, at: r.at });
        } catch {
          /* a damaged entry: skip it */
        }
      } else if (k.startsWith("dsa.editorial.") && ls.getItem(k) === "early") early.add(k.slice(14));
    }
  } catch {
    /* storage blocked */
  }
  return { events, early };
}

type Remote = { events: SubmitEvent[]; editorial: string[] };
let shared: { uid: string; at: number; p: Promise<Remote | null> } | null = null;

function remote(uid: string): Promise<Remote | null> {
  if (shared && shared.uid === uid && Date.now() - shared.at < 30_000) return shared.p;
  const p = userFetch("/api/dsa/revise")
    .then((r) => (r.ok ? (r.json() as Promise<Remote>) : null))
    .catch(() => null);
  shared = { uid, at: Date.now(), p };
  return p;
}

export function useResolves(): { ready: boolean; due: ResolveItem[]; upcoming: ResolveItem[]; done: ResolveItem[] } {
  const { user, loading } = useAuth();
  const uid = user?.id ?? null;
  const [state, setState] = useState<{ key: string; events: SubmitEvent[]; early: string[]; today: string } | null>(null);
  const key = uid || "guest";

  useEffect(() => {
    if (loading) return;
    let off = false;
    const local = readLocalSubmits();
    void (uid ? remote(uid) : Promise.resolve(null)).then((r) => {
      if (off) return;
      setState({ key, events: [...local.events, ...(r?.events || [])], early: [...local.early, ...(r?.editorial || [])], today: localDay(Date.now()) });
    });
    return () => {
      off = true;
    };
  }, [uid, loading, key]);

  return useMemo(() => {
    const cur = state && state.key === key ? state : null;
    if (!cur) return { ready: false, due: [], upcoming: [], done: [] };
    const items = resolveSchedule(cur.events, new Set(cur.early), cur.today);
    return { ready: true, due: items.filter((i) => i.state === "due"), upcoming: items.filter((i) => i.state === "upcoming"), done: items.filter((i) => i.state === "done") };
  }, [state, key]);
}
