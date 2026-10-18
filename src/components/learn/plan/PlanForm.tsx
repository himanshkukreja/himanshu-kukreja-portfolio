"use client";

/**
 * Planner settings: interview date, study days, minutes per day, what to include, where to start.
 * A live preview says whether it fits before the interview, and what would make it fit.
 */
import { useMemo, useState } from "react";
import type { CourseMap } from "@/lib/learn/types";
import { lessonKey } from "@/lib/learn/types";
import type { LessonProgress } from "@/lib/learn/progress";
import { addDays, daysBetween, type PlanInclude, type PlanSettings, type Weekday } from "@/lib/learn/plan/schedule";
import { fmtDate, fmtMinutes, remainingWork } from "@/components/learn/progress/derive";
import type { LearningGoal } from "@/components/learn/progress/goal";
import { previewPlan } from "./usePlan";

const DOW: { d: Weekday; short: string; long: string }[] = [
  { d: 0, short: "M", long: "Mon" },
  { d: 1, short: "T", long: "Tue" },
  { d: 2, short: "W", long: "Wed" },
  { d: 3, short: "T", long: "Thu" },
  { d: 4, short: "F", long: "Fri" },
  { d: 5, short: "S", long: "Sat" },
  { d: 6, short: "S", long: "Sun" },
];

const INCLUDE: { k: keyof PlanInclude; label: string; hint: string }[] = [
  { k: "core", label: "Core lessons", hint: "every world's preview, days and foundations" },
  { k: "bosses", label: "Bosses", hint: "the interview capstone that ends each world" },
  { k: "trials", label: "Trials", hint: "~1 min a question, right after the lesson each part tests" },
  { k: "mocks", label: "Mock interviews", hint: "timed interview loops" },
  { k: "sideQuests", label: "Side quests", hint: "real systems end to end; planned after the core" },
];

type Props = {
  map: CourseMap;
  initial: PlanSettings;
  today: string;
  lessons: Record<string, LessonProgress>;
  done: Record<string, number>;
  goal: LearningGoal | null;
  editing: boolean;
  onSave: (s: PlanSettings) => void;
  onCancel: (() => void) | null;
};

export default function PlanForm(p: Props) {
  const [s, setS] = useState<PlanSettings>(p.initial);
  const set = <K extends keyof PlanSettings>(k: K, v: PlanSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const inc = (k: keyof PlanInclude, v: boolean) => setS((x) => ({ ...x, include: { ...x.include, [k]: v } }));

  const preview = useMemo(() => previewPlan(p.map, s, p.lessons, p.done, p.today), [p.map, s, p.lessons, p.done, p.today]);
  const core = useMemo(() => remainingWork(p.map, p.lessons), [p.map, p.lessons]);
  const doneCount = useMemo(() => Object.values(preview.status).filter((x) => x.done).length, [preview.status]);
  const firstOpen = useMemo(() => {
    const w = [...p.map.weeks].sort((a, b) => a.num - b.num).find((w) => [...w.lessons, ...(w.boss ? [w.boss] : [])].some((l) => p.lessons[lessonKey(l.week, l.slug)]?.status !== "completed"));
    return w?.key ?? null;
  }, [p.map.weeks, p.lessons]);

  const sch = preview.sch;
  const days = daysBetween(p.today, s.target);
  const nothing = !Object.values(s.include).some(Boolean);
  const perWeek = s.minutes * s.days.length;
  const goalPerWeek = p.goal?.unit === "minutes" ? p.goal.perWeek : null;

  return (
    <form
      className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (!nothing && s.days.length && days > 0) p.onSave(s);
      }}
    >
      <div className="flex min-w-0 flex-col gap-6">
        <Field label="interview date" htmlFor="plan-target">
          <input id="plan-target" type="date" required min={addDays(p.today, 1)} value={s.target} onChange={(e) => e.target.value && set("target", e.target.value)} className="min-h-12 w-full border border-line-strong bg-bg px-3 text-[16px] text-fg" />
          <span className="text-[13px] text-fg-3">{days > 0 ? `${days} days from today · the plan ends the day before` : "Pick a date after today."}</span>
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-mono text-[11px] uppercase tracking-label text-fg-3">days you can study · {s.days.length}/week</legend>
          <div className="grid grid-cols-7 gap-px border border-line-strong bg-line-strong">
            {DOW.map((x) => {
              const on = s.days.includes(x.d);
              return (
                <button
                  key={x.d}
                  type="button"
                  aria-pressed={on}
                  aria-label={x.long}
                  onClick={() => set("days", (on ? s.days.filter((d) => d !== x.d) : [...s.days, x.d]).sort() as Weekday[])}
                  className={`min-h-12 font-mono text-[13px] ${on ? "bg-fg font-semibold text-bg" : "bg-bg text-fg-3 hover:text-fg"}`}
                >
                  <span className="sm:hidden">{x.short}</span>
                  <span className="hidden sm:inline">{x.long}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "weekdays", days: [0, 1, 2, 3, 4] },
              { label: "every day", days: [0, 1, 2, 3, 4, 5, 6] },
              { label: "weekends", days: [5, 6] },
            ].map((o) => (
              <button key={o.label} type="button" onClick={() => set("days", o.days as Weekday[])} className="min-h-10 border border-line px-3 font-mono text-[12px] text-fg-3 hover:text-fg">
                {o.label}
              </button>
            ))}
          </div>
        </fieldset>

        <Field label="minutes per study day" htmlFor="plan-min">
          <div className="flex items-stretch gap-2">
            <button type="button" aria-label="Less" onClick={() => set("minutes", Math.max(15, s.minutes - 15))} className="grid min-h-12 w-12 place-items-center border border-line-strong font-mono text-lg text-fg hover:bg-surface-2">
              −
            </button>
            <input
              id="plan-min"
              inputMode="numeric"
              value={String(s.minutes)}
              onChange={(e) => set("minutes", Math.min(600, Number(e.target.value.replace(/\D/g, "")) || 0))}
              onBlur={() => set("minutes", Math.max(15, s.minutes))}
              className="min-h-12 w-full min-w-0 border border-line-strong bg-bg px-3 text-center font-display text-[24px] font-extrabold tracking-[-0.03em] text-fg"
            />
            <button type="button" aria-label="More" onClick={() => set("minutes", Math.min(600, s.minutes + 15))} className="grid min-h-12 w-12 place-items-center border border-line-strong font-mono text-lg text-fg hover:bg-surface-2">
              +
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[30, 45, 60, 90, 120].map((m) => (
              <button key={m} type="button" onClick={() => set("minutes", m)} className={`min-h-10 px-3 font-mono text-[12px] ${s.minutes === m ? "bg-surface-2 text-fg" : "border border-line text-fg-3 hover:text-fg"}`}>
                {fmtMinutes(m)}
              </button>
            ))}
          </div>
          <span className="text-[13px] text-fg-3">
            {fmtMinutes(perWeek)} a week
            {goalPerWeek ? ` · your weekly goal on the Progress page is ${fmtMinutes(goalPerWeek)}` : ""}
          </span>
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-mono text-[11px] uppercase tracking-label text-fg-3">what to include</legend>
          {INCLUDE.map((x) => (
            <label key={x.k} className="flex min-h-11 cursor-pointer items-start gap-3 text-[15px] text-fg-2">
              <input type="checkbox" checked={s.include[x.k]} onChange={(e) => inc(x.k, e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--c-signal)]" />
              <span className="flex flex-col">
                <span className="text-fg">{x.label}</span>
                <span className="text-[12.5px] text-fg-3">{x.hint}</span>
              </span>
            </label>
          ))}
          {s.include.mocks && (
            <div className="ml-7 grid grid-cols-2 gap-px border border-line bg-line">
              {(["worlds", "end"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={s.mocksAt === m} onClick={() => set("mocksAt", m)} className={`min-h-10 px-2 text-[13px] ${s.mocksAt === m ? "bg-fg font-semibold text-bg" : "bg-bg text-fg-3 hover:text-fg"}`}>
                  {m === "worlds" ? "after their world" : "in the final stretch"}
                </button>
              ))}
            </div>
          )}
          {nothing && <span className="text-[13px] text-bad-text">Pick at least one thing to study.</span>}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="revision days at the end" htmlFor="plan-rev">
            <select id="plan-rev" value={s.revision} onChange={(e) => set("revision", Number(e.target.value))} className="min-h-12 w-full border border-line-strong bg-bg px-3 text-[16px] text-fg">
              {[0, 1, 2, 3, 4, 5, 7].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "none" : `${n} day${n > 1 ? "s" : ""}`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="start from" htmlFor="plan-start">
            <select id="plan-start" value={s.startWeek ?? ""} onChange={(e) => set("startWeek", e.target.value || null)} className="min-h-12 w-full border border-line-strong bg-bg px-3 text-[16px] text-fg">
              <option value="">the beginning (W00)</option>
              {[...p.map.weeks]
                .sort((a, b) => a.num - b.num)
                .filter((w) => w.num > 0)
                .map((w) => (
                  <option key={w.key} value={w.key}>
                    W{w.code} · {w.title}
                    {w.key === firstOpen ? " (first unfinished)" : ""}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-[15px] text-fg-2">
          <input type="checkbox" checked={s.buffer} onChange={(e) => set("buffer", e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--c-signal)]" />
          <span className="flex flex-col">
            <span className="text-fg">A catch-up day each week</span>
            <span className="text-[12.5px] text-fg-3">The last study day of weeks with 3+ study days stays free. Used for lessons only if the plan wouldn&apos;t fit otherwise.</span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="session starts at (calendar)" htmlFor="plan-time">
            <input id="plan-time" type="time" step={900} value={s.time} onChange={(e) => /^\d{2}:\d{2}$/.test(e.target.value) && set("time", e.target.value)} className="min-h-12 w-full border border-line-strong bg-bg px-3 text-[16px] text-fg" />
          </Field>
          <Field label="calendar reminder" htmlFor="plan-alarm">
            <select id="plan-alarm" value={s.reminder} onChange={(e) => set("reminder", Number(e.target.value))} className="min-h-12 w-full border border-line-strong bg-bg px-3 text-[16px] text-fg">
              {[0, 5, 15, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "none" : `${n} min before`}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* preview */}
      <aside aria-label="Plan preview" className="flex min-w-0 flex-col gap-4 self-start border border-line-strong bg-surface p-5 lg:sticky lg:top-24">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">preview · from today</span>
        {sch.problem === "past" ? (
          <p className="m-0 text-[15px] text-bad-text">Pick an interview date after today.</p>
        ) : sch.problem === "no-days" ? (
          <p className="m-0 text-[15px] text-bad-text">Pick at least one study day.</p>
        ) : sch.problem === "nothing-left" ? (
          <p className="m-0 text-[15px] text-fg-2">Everything you picked is done. Add side quests or mocks, or start from an earlier world.</p>
        ) : (
          <>
            <span className={`font-display text-[30px] font-extrabold leading-none tracking-[-0.04em] ${sch.fits ? "text-fg" : "text-signal-text"}`}>{sch.fits ? "It fits." : "Doesn't fit yet."}</span>
            <dl className="m-0 grid grid-cols-2 gap-px border border-line bg-line">
              <Stat k="to study" v={fmtMinutes(sch.workMinutes)} />
              <Stat k="study days" v={String(sch.studyDays)} />
              <Stat k="content done by" v={sch.contentEnd ? fmtDate(sch.contentEnd, true) : "—"} />
              <Stat k="revision from" v={sch.stretchStart ? fmtDate(sch.stretchStart) : "—"} />
            </dl>
            {sch.fits ? (
              <p className="m-0 text-[14px] leading-relaxed text-fg-2">
                {sch.buffersLeft > 0 ? `${sch.buffersLeft} catch-up day${sch.buffersLeft > 1 ? "s" : ""} kept free. ` : ""}
                {sch.buffersUsed > 0 ? `${sch.buffersUsed} catch-up day${sch.buffersUsed > 1 ? "s" : ""} used for lessons to fit. ` : ""}
                {s.revision > 0 ? `${s.revision} revision day${s.revision > 1 ? "s" : ""} before the interview.` : ""}
              </p>
            ) : (
              <div className="flex flex-col gap-2 text-[14px] leading-relaxed text-fg-2">
                <p className="m-0">
                  {fmtMinutes(sch.overflowMinutes)} won&apos;t fit before {fmtDate(s.target)}. {preview.needMinutes ? `${fmtMinutes(preview.needMinutes)} a day would fit it all.` : "Even 8 hours a day wouldn't: pick a later date or study less."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {preview.needMinutes && (
                    <button type="button" onClick={() => set("minutes", preview.needMinutes!)} className="min-h-10 border border-signal px-3 font-mono text-[12px] text-signal-text hover:bg-surface-2">
                      use {fmtMinutes(preview.needMinutes)}/day
                    </button>
                  )}
                  {s.include.sideQuests && (
                    <button type="button" onClick={() => inc("sideQuests", false)} className="min-h-10 border border-line-strong px-3 font-mono text-[12px] text-fg hover:bg-surface-2">
                      drop side quests
                    </button>
                  )}
                  {s.days.length < 7 && (
                    <button type="button" onClick={() => set("days", [0, 1, 2, 3, 4, 5, 6])} className="min-h-10 border border-line-strong px-3 font-mono text-[12px] text-fg hover:bg-surface-2">
                      study every day
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        <p className="m-0 border-t border-line pt-3 text-[12.5px] leading-relaxed text-fg-3">
          {doneCount > 0 ? `${doneCount} item${doneCount > 1 ? "s" : ""} you've already finished are skipped. ` : ""}
          Core lessons + bosses left: {core.lessons} of {core.total}, ~{fmtMinutes(core.minutes)} of reading (same count as your Progress page).
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={nothing || !s.days.length || days <= 0 || sch.problem === "nothing-left"} className="min-h-12 bg-signal px-5 text-sm font-semibold text-on-signal hover:brightness-110 disabled:opacity-50">
            {p.editing ? "Save changes" : "Make my plan"}
          </button>
          {p.onCancel && (
            <button type="button" onClick={p.onCancel} className="min-h-12 border border-line-strong px-4 text-sm text-fg hover:bg-surface-2">
              Cancel
            </button>
          )}
        </div>
      </aside>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="font-mono text-[11px] uppercase tracking-label text-fg-3">
        {label}
      </label>
      {children}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col gap-1 bg-bg p-3">
      <dt className="font-mono text-[10.5px] uppercase tracking-label text-fg-3">{k}</dt>
      <dd className="m-0 font-display text-[18px] font-extrabold tracking-[-0.02em] text-fg">{v}</dd>
    </div>
  );
}
