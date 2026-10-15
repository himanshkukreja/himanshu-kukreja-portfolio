"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useGame } from "@/game/GameProvider";
import type { MCQAssessment } from "@/lib/mcq-parser";
import {
  bossXpKey,
  lessonXpKey,
  loadCompletedLessons,
  loadRemoteHistory,
  passMark,
  readLocalStore,
  trialXpKey,
  writeLocalStore,
  type PartRecord,
  type RemoteHistory,
  type RunState,
  type TrialPart,
} from "./engine";
import PartsStrip, { type PartView } from "./PartsStrip";
import TrialRun from "./TrialRun";
import PracticeView from "./PracticeView";

export type NavResource = { week: string; slug: string; title: string } | null;

export type TrialAppProps = {
  assessment: MCQAssessment;
  courseId: string;
  week: string;
  lessonSlug: string;
  /** "Week 02" */
  weekLabel: string;
  /** "Failure-first design" */
  weekTopic: string;
  parts: TrialPart[];
  nextResource?: NavResource;
  nextLabel?: string;
  comments?: React.ReactNode;
};

function mergeRecord(a?: PartRecord, b?: PartRecord): PartRecord | undefined {
  if (!a) return b;
  if (!b) return a;
  const last = !a.last ? b.last : !b.last ? a.last : a.last.at >= b.last.at ? a.last : b.last;
  return { best: Math.max(a.best, b.best), total: b.total || a.total, attempts: Math.max(a.attempts, b.attempts), passed: a.passed || b.passed, last };
}

/** Records, runs in progress and unlock state for one week's trial. */
function useTrialData(courseId: string, week: string) {
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const [ready, setReady] = useState(false);
  const [records, setRecords] = useState<Record<string, PartRecord>>({});
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [remoteOpen, setRemoteOpen] = useState<RemoteHistory["open"]>({});
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const local = readLocalStore(courseId, week);
    if (!userId) {
      Promise.resolve().then(() => {
        if (cancelled) return;
        setRecords(local.parts);
        setRuns(local.runs);
        setSynced(false);
        setReady(true);
      });
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      const [remote, done] = await Promise.all([loadRemoteHistory(userId, courseId, week), loadCompletedLessons(userId, courseId, week)]);
      if (cancelled) return;
      const merged: Record<string, PartRecord> = { ...local.parts };
      if (remote) {
        Object.entries(remote.parts).forEach(([k, rec]) => {
          merged[k] = mergeRecord(local.parts[k], rec) as PartRecord;
        });
        setRemoteOpen(remote.open);
      }
      setRecords(merged);
      setRuns(local.runs);
      setCompleted(done);
      setSynced(!!remote);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, userId, courseId, week]);

  // Write-through to localStorage (the source of truth for guests, a cache when signed in)
  const recordsRef = useRef(records);
  const runsRef = useRef(runs);
  const persist = useCallback(() => {
    writeLocalStore(courseId, week, { parts: recordsRef.current, runs: runsRef.current });
  }, [courseId, week]);

  const setRecord = useCallback(
    (n: number, rec: PartRecord) => {
      recordsRef.current = { ...recordsRef.current, [n]: rec };
      setRecords(recordsRef.current);
      persist();
    },
    [persist]
  );
  const setRun = useCallback(
    (n: number, run: RunState | null) => {
      const next = { ...runsRef.current };
      if (run) next[n] = run;
      else delete next[n];
      runsRef.current = next;
      setRuns(next);
      persist();
    },
    [persist]
  );
  useEffect(() => {
    recordsRef.current = records;
    runsRef.current = runs;
  }, [records, runs]);

  return { ready, records, runs, remoteOpen, completed, synced, userId, setRecord, setRun };
}

export default function TrialApp(props: TrialAppProps) {
  const { assessment, courseId, week, lessonSlug, parts } = props;
  const params = useSearchParams();
  const base = `/learn/${courseId}/${week}/${lessonSlug}`;
  const hrefFor = useCallback((n: number) => `${base}?part=${n}`, [base]);
  const data = useTrialData(courseId, week);
  const { done, hydrated } = useGame();
  const [now, setNow] = useState(0);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const lessonDone = useCallback(
    (p: TrialPart) => {
      if (!p.lesson) return true;
      if (p.boss && done[bossXpKey(week)]) return true;
      return !!done[lessonXpKey(week, p.lesson.slug)] || data.completed.has(p.lesson.slug);
    },
    [done, week, data.completed]
  );

  const partNum = Number(params.get("part"));
  const view = params.get("view");
  const selected = Number.isInteger(partNum) && partNum >= 1 && partNum <= parts.length ? partNum : null;

  const views: PartView[] = useMemo(() => {
    const base = parts.map((p): PartView => {
      const rec = data.records[p.n];
      const passed = !!rec?.passed || !!done[trialXpKey(week, p.n)];
      const locked = !passed && !rec?.attempts && !data.runs[p.n] && !lessonDone(p);
      let state: PartView["state"];
      if (passed) state = "pass";
      else if (locked) state = "lock";
      else if (rec?.last && !rec.last.passed) state = "fail";
      else state = "open";
      return { part: p, state, record: rec ? { ...rec, passed } : passed ? { best: 0, total: p.count, attempts: 0, passed } : undefined, locked };
    });
    // On the hub, the first part still to clear is the current one
    const cur = selected === null ? base.findIndex((v) => v.state === "open" || v.state === "fail") : -1;
    return base.map((v, k) => (k === cur && v.state === "open" ? { ...v, state: "cur" } : v));
  }, [parts, data.records, data.runs, done, week, lessonDone, selected]);

  const ready = data.ready && hydrated;

  if (view === "all" && selected === null) {
    return (
      <PracticeView assessment={assessment} courseId={courseId} week={week} lessonSlug={lessonSlug} hubHref={base} comments={props.comments} />
    );
  }

  if (selected !== null) {
    const part = parts[selected - 1];
    const nextPart = parts[selected] ?? null;
    let continueHref: string = base;
    let continueLabel = "Back to the week's trials";
    if (nextPart?.lesson) {
      continueHref = `/learn/${courseId}/${week}/${nextPart.lesson.slug}`;
      continueLabel = nextPart.boss ? `Continue: the boss · ${nextPart.lesson.title}` : `Continue: ${nextPart.lesson.label} · ${nextPart.lesson.title}`;
    } else if (nextPart) {
      continueHref = hrefFor(nextPart.n);
      continueLabel = `Next: Part ${nextPart.n} trial`;
    } else if (props.nextResource) {
      continueHref = `/learn/${courseId}/${props.nextResource.week}/${props.nextResource.slug}`;
      continueLabel = `${props.nextLabel || "Continue"}: ${props.nextResource.title}`;
    }
    return (
      <TrialRun
        key={`${week}:${selected}`}
        ready={ready}
        part={part}
        questions={assessment.sections[selected - 1]?.questions ?? []}
        partsCount={parts.length}
        courseId={courseId}
        week={week}
        lessonSlug={lessonSlug}
        weekLabel={props.weekLabel}
        weekTopic={props.weekTopic}
        hubHref={base}
        hrefFor={hrefFor}
        continueHref={continueHref}
        continueLabel={continueLabel}
        views={views}
        now={now}
        userId={data.userId}
        synced={data.synced}
        record={views[selected - 1]?.record}
        locked={views[selected - 1]?.locked ?? false}
        initialRun={data.runs[selected] ?? null}
        remoteOpen={data.remoteOpen[selected] ?? null}
        onRecord={data.setRecord}
        onRun={data.setRun}
        allRecords={data.records}
      />
    );
  }

  return <TrialHub {...props} views={views} hrefFor={hrefFor} now={now} ready={ready} base={base} />;
}

function TrialHub({
  assessment,
  weekLabel,
  weekTopic,
  views,
  hrefFor,
  now,
  ready,
  base,
  comments,
}: TrialAppProps & { views: PartView[]; hrefFor: (n: number) => string; now: number; ready: boolean; base: string }) {
  const total = assessment.totalQuestions;
  const k = views.length;
  const cleared = views.filter((v) => v.state === "pass").length;
  const cur = views.find((v) => v.state === "cur") || views.find((v) => v.state === "fail") || views.find((v) => v.state !== "pass");
  const avg = k ? Math.round(total / k) : 0;

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-5">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">
          {weekLabel} · {weekTopic} · {k} {k === 1 ? "trial" : "trials"}
        </span>
        <h1 className="m-0 font-display text-[clamp(52px,7vw,104px)] font-extrabold leading-[0.86] tracking-tightest text-fg">
          Trials<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 max-w-[640px] text-[19px] leading-relaxed text-fg-2">
          {total} questions in {k} parts of about {avg}. Each part tests one lesson: pass it with 80% to clear it, and anything you miss goes to your review queue.
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-px border border-line bg-line">
          <Stat value={ready ? `${cleared}/${k}` : "–"} label="parts cleared" />
          <Stat value={String(total)} label="questions this week" />
          <Stat value="80%" label="pass mark per part" />
          <Stat value="+100" label="XP per first pass" accent />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {cur && (
            <Link
              href={hrefFor(cur.part.n)}
              className="inline-flex min-h-[56px] w-full items-center justify-center gap-3 bg-signal px-6 text-center text-[17px] font-semibold text-on-signal no-underline hover:opacity-90 sm:w-auto sm:justify-start sm:text-left"
            >
              {cleared === k ? "Retake a part" : `${cur.state === "fail" ? "Retry" : "Start"} Part ${cur.part.n} · ${cur.part.title}`} <span aria-hidden="true">▶</span>
            </Link>
          )}
          <Link
            href={`${base}?view=all`}
            className="inline-flex min-h-[56px] w-full items-center justify-center border border-line-strong px-4 text-[15px] text-fg no-underline hover:border-fg-3 sm:w-auto"
          >
            Practice all {total} on one page
          </Link>
        </div>
        <span className="text-[13px] text-fg-3">Practice mode is untimed and awards no XP. Its answers are kept separately from your trial attempts.</span>
      </section>

      <section aria-labelledby="parts-h" className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="parts-h" className="m-0 font-display text-[32px] font-bold tracking-[-0.025em] text-fg">
            {weekLabel} trials
          </h2>
          <span className="text-sm text-fg-3">
            {total} questions in {k} parts · each part counts toward the week
          </span>
        </div>
        <div className={ready ? "" : "opacity-60"} aria-busy={!ready}>
          <PartsStrip views={views} hrefFor={hrefFor} now={now} />
        </div>
        <span className="text-[13px] leading-relaxed text-fg-3">
          A part opens when you mark its lesson complete. Pass mark is {views[0] ? `${passMark(views[0].part.count)} of ${views[0].part.count}` : "80%"} for a {views[0]?.part.count ?? 25}-question part; after a fail it rests for 10 minutes.
        </span>
      </section>

      {comments}
    </div>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1 bg-bg px-[18px] py-4">
      <span className={`font-mono text-[28px] font-semibold ${accent ? "text-signal-text" : "text-fg"}`}>{value}</span>
      <span className="text-[13px] text-fg-3">{label}</span>
    </div>
  );
}
