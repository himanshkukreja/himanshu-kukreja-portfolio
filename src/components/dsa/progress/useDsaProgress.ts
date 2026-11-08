"use client";

/**
 * DSA progress in the browser, from the existing progress system (no new tables needed):
 *
 *   game_done keys (src/game: synced to the account for signed-in learners, localStorage for guests)
 *     dsa:p:<problem>   accepted solve           dsa:c:<concept>   lesson complete
 *     dsa:s:<c>/<beat>  a beat (stage) read       dsa:cpq:<node>    checkpoint quiz passed
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
import { DSA_COURSE_ID, DSA_PROBLEMS_WEEK, dsaKeys, problemXp, type DsaLang, type DsaLevel } from "@/lib/dsa/types";
import type { ProgressSignals } from "@/lib/dsa/map/progress";

type Row = { week: string; lesson_slug: string; status: string | null };

function fromGame(done: Record<string, number>) {
  const solved = new Set<string>();
  const concepts = new Set<string>();
  const checkpoints = new Set<string>();
  for (const k of Object.keys(done)) {
    if (k.startsWith("dsa:p:")) solved.add(k.slice(6));
    else if (k.startsWith("dsa:c:")) concepts.add(k.slice(6));
    else if (k.startsWith("dsa:cpq:")) checkpoints.add(k.slice(8));
  }
  return { solved, concepts, checkpoints };
}

function fromRows(rows: Row[], into: { solved: Set<string>; concepts: Set<string> }) {
  for (const r of rows) {
    if (r.status !== "completed") continue;
    if (r.week === DSA_PROBLEMS_WEEK) into.solved.add(r.lesson_slug);
    else into.concepts.add(r.lesson_slug);
  }
}

function guestRows(): Row[] {
  const out: Row[] = [];
  for (const [key, rec] of Object.entries(readGuestProgress())) {
    if (!key.startsWith(`${DSA_COURSE_ID}/`)) continue;
    const [, week, slug] = key.split("/");
    if (week && slug) out.push({ week, lesson_slug: slug, status: rec.completed ? "completed" : "in_progress" });
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
      const { data, error } = await supabaseClient.from("learning_progress").select("week, lesson_slug, status").eq("user_id", userId).eq("course_id", DSA_COURSE_ID);
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
    const g = fromGame(done);
    fromRows(rows, g);
    return { solved: g.solved, concepts: g.concepts, checkpoints: g.checkpoints, ready: hydrated && loaded, signedIn: !!userId };
  }, [done, rows, hydrated, loaded, userId]);
}

/** Record an accepted solve: XP once, the progress row (or guest record), the streak and the event. */
export function useRecordSolve() {
  const { user } = useAuth();
  const { awardOnce } = useGame();
  const userId = user?.id ?? null;
  return useCallback(
    async (p: { id: string; title: string; level: DsaLevel; lang: DsaLang; hintsUsed: number; editorialSeen: boolean }) => {
      const xp = awardOnce(dsaKeys.problem(p.id), problemXp(p.level), `${p.title} · solved`);
      track("dsa_submit", { problem: p.id, lang: p.lang, verdict: "AC", first: xp > 0, hints: p.hintsUsed });
      const prev = readGuestLesson(DSA_COURSE_ID, DSA_PROBLEMS_WEEK, p.id);
      const langs = Array.from(new Set([...(prev?.stages ?? []), p.lang]));
      const now = Date.now();
      writeGuestLesson(DSA_COURSE_ID, DSA_PROBLEMS_WEEK, p.id, { stages: langs, last: p.lang, completed: true, completedAt: prev?.completedAt ?? now, max: 100, updatedAt: now });
      if (!userId) return xp;
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
      return xp;
    },
    [awardOnce, userId],
  );
}
