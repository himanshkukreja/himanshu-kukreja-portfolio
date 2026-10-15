"use client";

import { useState } from "react";
import { addDays, localDate } from "@/lib/learn/review";
import { GOAL_STORAGE_KEY, type GoalUnit, type LearningGoal } from "./goal";
import { fmtDate, fmtMinutes, goalProgress, neededPace, projectDate, type Pace } from "./derive";
import { userJson } from "./userFetch";
import { Bar, Label, SectionHead } from "./ui";

type Props = {
  goal: LearningGoal | null;
  fallback: LearningGoal;
  source: "account" | "browser" | "none";
  signedIn: boolean;
  thisWeek: { minutes: number; lessons: number };
  pace: Pace;
  remaining: { minutes: number; lessons: number; total: number };
  avgLessonMinutes: number;
  estimated: boolean;
  onSaved: () => void;
};

export default function Goals(p: Props) {
  const [editing, setEditing] = useState(false);
  const goal = p.goal;
  return (
    <section aria-labelledby="goals-h" id="goals" className="flex min-w-0 scroll-mt-28 flex-col gap-4">
      <SectionHead id="goals-h" n="03" kicker="goals" title="Weekly goal" />
      <div className="flex flex-col gap-4 border border-line bg-surface p-4 sm:p-5">
        {goal && !editing ? <GoalView {...p} goal={goal} onEdit={() => setEditing(true)} /> : <GoalForm {...p} initial={goal || p.fallback} onDone={() => setEditing(false)} canCancel={!!goal} />}
      </div>
    </section>
  );
}

function GoalView(p: Props & { goal: LearningGoal; onEdit: () => void }) {
  const g = p.goal;
  const prog = goalProgress(g, p.thisWeek);
  const minutesUnit = g.unit === "minutes";
  const remaining = minutesUnit ? p.remaining.minutes : p.remaining.lessons;
  const recentRate = minutesUnit ? p.pace.minutesPerWeek : p.pace.lessonsPerWeek;
  const atPace = projectDate(remaining, recentRate);
  const atGoal = projectDate(remaining, g.perWeek);
  const need = g.target ? neededPace(remaining, g.target) : null;
  const onTrack = g.target && atPace ? atPace <= g.target : null;
  const fmt = (v: number) => (minutesUnit ? fmtMinutes(v) : `${Math.round(v * 10) / 10} lesson${v === 1 ? "" : "s"}`);

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label>this week</Label>
        <span className="font-mono text-[11px] text-fg-3">{p.source === "account" ? "saved to your account" : "saved in this browser"}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[40px] font-extrabold leading-none tracking-[-0.045em] text-fg">{minutesUnit ? fmtMinutes(prog.value) : prog.value}</span>
        <span className="font-mono text-[13px] text-fg-3">/ {minutesUnit ? fmtMinutes(g.perWeek) : `${g.perWeek} lessons`}</span>
        {prog.pct >= 100 && <span className="ml-auto bg-signal px-2 py-1 font-mono text-[11px] font-semibold tracking-label text-on-signal">GOAL MET</span>}
      </div>
      <Bar pct={prog.pct} className="h-2" label="This week's goal" />
      <dl className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-2">
        <div className="flex flex-col gap-1 bg-bg p-3.5">
          <dt className="font-mono text-[11px] uppercase tracking-label text-fg-3">projected finish · recent pace</dt>
          <dd className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-fg">{remaining <= 0 ? "Done" : atPace ? fmtDate(atPace, true) : "—"}</dd>
          <dd className="text-[12px] leading-snug text-fg-3">{recentRate > 0 ? `${fmt(recentRate)}/week over the last ${p.pace.weeksMeasured} weeks${p.estimated && minutesUnit ? " (est.)" : ""}` : "No pace yet: read a stage this week to start one."}</dd>
        </div>
        <div className="flex flex-col gap-1 bg-bg p-3.5">
          <dt className="font-mono text-[11px] uppercase tracking-label text-fg-3">{g.target ? `target · ${fmtDate(g.target, true)}` : "at your goal pace"}</dt>
          <dd className={`font-display text-[22px] font-extrabold tracking-[-0.03em] ${onTrack === false ? "text-signal-text" : "text-fg"}`}>
            {g.target ? (need === null ? "Date passed" : onTrack ? "On track" : `${fmt(need)}/wk`) : atGoal ? fmtDate(atGoal, true) : "—"}
          </dd>
          <dd className="text-[12px] leading-snug text-fg-3">
            {g.target
              ? need === null
                ? "Pick a new target date."
                : onTrack
                  ? `Keep ${fmt(need)}/week and you land on time.`
                  : `needed from now to finish on time${atGoal ? ` · at your goal you'd finish ${fmtDate(atGoal, true)}` : ""}`
              : `${fmt(remaining)} left in the core course`}
          </dd>
        </div>
      </dl>
      <span className="text-[13px] leading-snug text-fg-3">
        {p.remaining.lessons} of {p.remaining.total} core lessons and bosses left · ~{fmtMinutes(p.remaining.minutes)} of reading.
      </span>
      <button type="button" onClick={p.onEdit} className="min-h-11 self-start border border-line-strong px-4 text-sm text-fg hover:bg-surface-2">
        Change goal
      </button>
    </>
  );
}

function GoalForm(p: Props & { initial: LearningGoal; onDone: () => void; canCancel: boolean }) {
  const [unit, setUnit] = useState<GoalUnit>(p.initial.unit);
  const [perWeek, setPerWeek] = useState<number>(p.initial.perWeek);
  const [target, setTarget] = useState<string>(p.initial.target || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const step = unit === "minutes" ? 15 : 1;
  const min = unit === "minutes" ? 15 : 1;
  const today = localDate();

  const switchUnit = (u: GoalUnit) => {
    if (u === unit) return;
    setUnit(u);
    setPerWeek(u === "minutes" ? Math.max(15, Math.round((perWeek * p.avgLessonMinutes) / 15) * 15) : Math.max(1, Math.round(perWeek / Math.max(1, p.avgLessonMinutes))));
  };

  const save = async (clear = false) => {
    setBusy(true);
    setErr(null);
    const goal: LearningGoal | null = clear ? null : { unit, perWeek: Math.max(min, Math.round(perWeek)), target: target || null, setAt: Date.now() };
    try {
      if (p.signedIn) {
        await userJson("/api/learn/goal", { method: "PUT", body: JSON.stringify({ goal }) });
      }
      try {
        if (goal) window.localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(goal));
        else window.localStorage.removeItem(GOAL_STORAGE_KEY);
      } catch {
        // storage blocked: the account copy still holds it for signed-in learners
      }
      p.onSaved();
      p.onDone();
    } catch (e) {
      setErr((e as Error).message || "Could not save your goal");
    } finally {
      setBusy(false);
    }
  };

  const suggested = unit === "minutes" ? [60, 150, 300] : [2, 4, 7];

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="text-[14px] leading-relaxed text-fg-2">Pick a weekly rhythm. The page projects your finish date from it and from your real pace.</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-mono text-[11px] uppercase tracking-label text-fg-3">measure in</legend>
        <div className="grid grid-cols-2 gap-px border border-line-strong bg-line-strong">
          {(["minutes", "lessons"] as const).map((u) => (
            <button key={u} type="button" aria-pressed={unit === u} onClick={() => switchUnit(u)} className={`min-h-11 text-sm ${unit === u ? "bg-fg font-semibold text-bg" : "bg-bg text-fg-2 hover:text-fg"}`}>
              {u === "minutes" ? "Minutes / week" : "Lessons / week"}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2">
        <label htmlFor="goal-n" className="font-mono text-[11px] uppercase tracking-label text-fg-3">
          per week
        </label>
        <div className="flex items-stretch gap-2">
          <button type="button" aria-label="Less" onClick={() => setPerWeek((v) => Math.max(min, v - step))} className="grid min-h-12 w-12 place-items-center border border-line-strong font-mono text-lg text-fg hover:bg-surface-2">
            −
          </button>
          <input
            id="goal-n"
            inputMode="numeric"
            value={String(perWeek)}
            onChange={(e) => setPerWeek(Math.max(0, Math.min(unit === "minutes" ? 3000 : 50, Number(e.target.value.replace(/\D/g, "")) || 0)))}
            className="min-h-12 w-full min-w-0 border border-line-strong bg-bg px-3 text-center font-display text-[24px] font-extrabold tracking-[-0.03em] text-fg"
          />
          <button type="button" aria-label="More" onClick={() => setPerWeek((v) => v + step)} className="grid min-h-12 w-12 place-items-center border border-line-strong font-mono text-lg text-fg hover:bg-surface-2">
            +
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {suggested.map((s) => (
            <button key={s} type="button" onClick={() => setPerWeek(s)} className={`min-h-10 px-3 font-mono text-[12px] ${perWeek === s ? "bg-surface-2 text-fg" : "border border-line text-fg-3 hover:text-fg"}`}>
              {unit === "minutes" ? fmtMinutes(s) : `${s} lessons`}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="goal-t" className="font-mono text-[11px] uppercase tracking-label text-fg-3">
          target finish date · optional
        </label>
        <div className="flex gap-2">
          <input id="goal-t" type="date" min={addDays(today, 1)} value={target} onChange={(e) => setTarget(e.target.value)} className="min-h-12 w-full min-w-0 border border-line-strong bg-bg px-3 text-[15px] text-fg" />
          {target && (
            <button type="button" onClick={() => setTarget("")} className="min-h-12 shrink-0 border border-line px-3 text-sm text-fg-3 hover:text-fg">
              Clear
            </button>
          )}
        </div>
      </div>
      {err && (
        <p role="alert" className="text-sm text-bad-text">
          {err}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || perWeek < min} className="min-h-12 bg-signal px-5 text-sm font-semibold text-on-signal hover:brightness-110 disabled:opacity-50">
          {busy ? "Saving…" : "Save goal"}
        </button>
        {p.canCancel && (
          <>
            <button type="button" onClick={p.onDone} className="min-h-12 border border-line-strong px-4 text-sm text-fg hover:bg-surface-2">
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={() => void save(true)} className="min-h-12 px-3 text-sm text-fg-3 underline-offset-4 hover:text-fg hover:underline">
              Remove goal
            </button>
          </>
        )}
      </div>
      <span className="text-[12px] text-fg-3">{p.signedIn ? "Saved to your account." : "Saved in this browser. Sign in to keep it on every device."}</span>
    </form>
  );
}
