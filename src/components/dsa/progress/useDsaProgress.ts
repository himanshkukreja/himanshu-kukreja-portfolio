"use client";

/**
 * DSA progress in the browser, from the existing progress system (no new tables needed):
 *
 *   game_done keys (src/game: synced to the account for signed-in learners, localStorage for guests)
 *     dsa:p:<problem>   accepted solve           dsa:c:<concept>   lesson complete
 *     dsa:s:<c>/<beat>  a beat (stage) read       dsa:cpq:<node>    checkpoint quiz passed
 *     dsa:lab:<lab>     a build-it lab passed (the structure/algorithm checkpoint needs it with the quiz)
 *   learning_progress rows with course_id 'dsa' (signed in) or the guest store hk.lesson.v1 ("dsa/<week>/<slug>")
 *     week <module>, lesson_slug <concept>    the concept's beats (completed_stages), status completed
 *     week 'problems', lesson_slug <problem>   status completed on an accepted solve; completed_stages = languages
 *
 * recordSolve() writes all of them for an accepted submission, plus the streak (record_learning_activity).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGame } from "@/game/GameProvider";
import { supabaseClient } from "@/lib/supabase-client";
import { readGuestLesson, readGuestProgress, recordLearningActivity, saveRemoteLesson, writeGuestLesson } from "@/components/learn/lesson/progress";
import { track } from "@/lib/track";
import { DSA_COURSE_ID, DSA_PROBLEMS_WEEK, dsaKeys, type DsaLang, type DsaLevel } from "@/lib/dsa/types";
import { awardKeys, solveBits } from "@/lib/dsa/rewards";
import { applyResets, resetTimes } from "@/lib/dsa/reset";
import { useDsaAward } from "@/components/dsa/rewards/useDsaBits";
import type { ProgressSignals } from "@/lib/dsa/map/progress";

type Row = { week: string; lesson_slug: string; status: string | null; completed_at?: string | number | null };

function fromGame(done: Record<string, number>) {
  const solved = new Set<string>();
  const concepts = new Set<string>();
  const checkpoints = new Set<string>();
  const labs = new Set<string>();
  for (const k of Object.keys(done)) {
    if (k.startsWith("dsa:p:")) solved.add(k.slice(6));
    else if (k.startsWith("dsa:c:")) concepts.add(k.slice(6));
    else if (k.startsWith("dsa:cpq:")) checkpoints.add(k.slice(8));
    else if (k.startsWith("dsa:lab:")) labs.add(k.slice(8));
  }
  return { solved, concepts, checkpoints, labs };
}

function fromRows(rows: Row[], into: { solved: Set<string>; concepts: Set<string> }, resets: Map<string, number>) {
  for (const r of rows) {
    if (r.status !== "completed") continue;
    // a problem reset after this row was completed is not solved (the account row is deleted by the reset; this guards a failed delete)
    if (r.week === DSA_PROBLEMS_WEEK) {
      const at = r.completed_at ? new Date(r.completed_at).getTime() || 0 : 0;
      if (at <= (resets.get(r.lesson_slug) ?? -1)) continue;
      into.solved.add(r.lesson_slug);
    } else into.concepts.add(r.lesson_slug);
  }
}

function guestRows(): Row[] {
  const out: Row[] = [];
  for (const [key, rec] of Object.entries(readGuestProgress())) {
    if (!key.startsWith(`${DSA_COURSE_ID}/`)) continue;
    const [, week, slug] = key.split("/");
    if (week && slug) out.push({ week, lesson_slug: slug, status: rec.completed ? "completed" : "in_progress", completed_at: rec.completedAt ?? null });
  }
  return out;
}

/** One read of the account's DSA rows per page, shared by every component that asks (lists render many). */
const shared: { key: string | null; rows: Row[] | null; inflight: Promise<Row[]> | null } = { key: null, rows: null, inflight: null };

function remoteRows(userId: string): Promise<Row[]> {
  if (shared.key === userId && shared.rows) return Promise.resolve(shared.rows);
  if (shared.key === userId && shared.inflight) return shared.inflight;
  shared.key = userId;
  shared.rows = null;
  shared.inflight = (async () => {
    try {
      const { data, error } = await supabaseClient.from("learning_progress").select("week, lesson_slug, status, completed_at").eq("user_id", userId).eq("course_id", DSA_COURSE_ID);
      const rows = !error && data ? (data as Row[]) : [];
      if (shared.key === userId) shared.rows = rows;
      return rows;
    } catch {
      return [];
    } finally {
      shared.inflight = null;
    }
  })();
  return shared.inflight;
}

export type DsaProgress = ProgressSignals & { ready: boolean; signedIn: boolean };

/** Everything the map and the problem lists need to mark nodes done. */
export function useDsaProgress(): DsaProgress {
  const { user } = useAuth();
  const { done, hydrated } = useGame();
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const userId = user?.id ?? null;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const guest = guestRows();
      if (!userId) {
        if (alive) {
          setRows(guest);
          setLoaded(true);
        }
        return;
      }
      const remote = await remoteRows(userId);
      if (alive) setRows([...guest, ...remote]);
      if (alive) setLoaded(true);
    };
    void load();
    const onLocal = () => {
      shared.rows = null;
      void load();
    };
    window.addEventListener("hk:lesson-progress", onLocal);
    return () => {
      alive = false;
      window.removeEventListener("hk:lesson-progress", onLocal);
    };
  }, [userId]);

  return useMemo(() => {
    const g = fromGame(applyResets(done));
    fromRows(rows, g, resetTimes(done));
    return { solved: g.solved, concepts: g.concepts, checkpoints: g.checkpoints, labs: g.labs, ready: hydrated && loaded, signedIn: !!userId };
  }, [done, rows, hydrated, loaded, userId]);
}

export type SolveResult = { bits: number; parts: { label: string; bits: number }[]; first: boolean };

/**
 * Record an accepted (judge or harness verified) solve: the problem's Bits once (src/lib/dsa/rewards.ts solveBits: the
 * level's base, +first try, +no hints; a quarter of the base when the editorial was opened first), the map's solved
 * key, the progress row (or guest record), the streak and the event. Never SD Mastery XP.
 */
export function useRecordSolve() {
  const { user } = useAuth();
  const { grant } = useDsaAward();
  const userId = user?.id ?? null;
  return useCallback(
    async (p: { id: string; title: string; level: DsaLevel; lang: DsaLang; hintsUsed: number; editorialSeen: boolean; firstTry: boolean }): Promise<SolveResult> => {
      const s = solveBits({ level: p.level, firstTry: p.firstTry, noHints: p.hintsUsed === 0, editorialFirst: p.editorialSeen });
      const gained = grant(awardKeys.solve(p.id), s.bits, `${p.title} · solved`, { also: [dsaKeys.problem(p.id)] });
      const res: SolveResult = { bits: gained, parts: s.parts, first: gained > 0 };
      track("dsa_submit", { problem: p.id, lang: p.lang, verdict: "AC", first: gained > 0, hints: p.hintsUsed, bits: gained });
      const prev = readGuestLesson(DSA_COURSE_ID, DSA_PROBLEMS_WEEK, p.id);
      const langs = Array.from(new Set([...(prev?.stages ?? []), p.lang]));
      const now = Date.now();
      writeGuestLesson(DSA_COURSE_ID, DSA_PROBLEMS_WEEK, p.id, { stages: langs, last: p.lang, completed: true, completedAt: prev?.completedAt ?? now, max: 100, updatedAt: now });
      if (!userId) return res;
      const iso = new Date().toISOString();
      await saveRemoteLesson({
        userId,
        course: DSA_COURSE_ID,
        week: DSA_PROBLEMS_WEEK,
        slug: p.id,
        stages: langs,
        lastStage: p.lang,
        completed: true,
        progress: 100,
        timeSpent: 0,
        startedAt: null,
        completedAt: prev?.completedAt ? new Date(prev.completedAt).toISOString() : iso,
        contentVersion: "",
      });
      await recordLearningActivity(userId);
      return res;
    },
    [grant, userId],
  );
}
