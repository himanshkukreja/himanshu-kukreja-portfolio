"use client";

/**
 * /learn/plan: pick an interview date and get a day-by-day plan from the real course (lesson order
 * and minutes) and the learner's real progress. The plan recomputes from today on every visit, so
 * falling behind or racing ahead adjusts it; the page says by how much against the plan accepted.
 * Exports to any calendar (.ics) and per day to Google Calendar.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import type { CourseMap } from "@/lib/learn/types";
import { daysBetween, dayTitle, defaultSettings, type PlanDay, type PlanSettings } from "@/lib/learn/plan/schedule";
import { fmtDate, fmtMinutes } from "@/components/learn/progress/derive";
import { useProgressData } from "@/components/learn/progress/useProgressData";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { track } from "@/lib/track";
import PlanForm from "./PlanForm";
import { computePlan, usePlanRecord, useToday, type PlanView } from "./usePlan";
import { downloadIcs, googleDayLink } from "./exportPlan";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dow = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return WD[(new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7];
};

export default function PlannerClient({ map }: { map: CourseMap }) {
  const d = useProgressData(map);
  const today = useToday();
  const { hydrated, record, save, rebaseline, remove } = usePlanRecord();
  const [editing, setEditing] = useState(false);

  const view = useMemo(() => (record && today && d.ready ? computePlan(map, record, d.lessons, d.done, today) : null), [record, today, d.ready, map, d.lessons, d.done]);

  const initial = useMemo<PlanSettings | null>(() => {
    if (!today) return null;
    if (record) return record.settings;
    const s = defaultSettings(today, d.goal?.target);
    // the weekly goal (Progress page) seeds minutes per day: perWeek over 5 weekdays
    if (d.goal?.unit === "minutes") s.minutes = Math.min(240, Math.max(30, Math.round(d.goal.perWeek / 5 / 15) * 15));
    return s;
  }, [today, record, d.goal]);

  if (!today || !hydrated || !d.ready || !initial) {
    return (
      <main className="mx-auto flex max-w-[1320px] flex-col gap-6 px-4 pb-32 pt-8 sm:px-6 sm:pt-12 lg:pb-24">
        <div aria-busy="true" aria-label="Loading your plan" className="h-[200px] animate-pulse border border-line bg-surface" />
        <div className="h-[320px] animate-pulse border border-line bg-surface" />
      </main>
    );
  }

  const onSave = (s: PlanSettings) => {
    const rec = save(s, today, editing && record ? record.id : null);
    const items = computePlan(map, rec, d.lessons, d.done, today);
    track("plan_create", {
      edit: editing,
      days_to_interview: daysBetween(today, s.target),
      days_per_week: s.days.length,
      minutes: s.minutes,
      core: s.include.core,
      bosses: s.include.bosses,
      trials: s.include.trials,
      side_quests: s.include.sideQuests,
      mocks: s.include.mocks,
      mocks_at: s.mocksAt,
      revision: s.revision,
      buffer: s.buffer,
      start_week: s.startWeek,
      fits: items.live.fits,
      study_days: items.live.studyDays,
      work_minutes: items.live.workMinutes,
      signed_in: d.signedIn,
    });
    setEditing(false);
    window.scrollTo({ top: 0 });
  };

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 pb-32 pt-8 sm:px-6 sm:pt-12 lg:gap-12 lg:pb-24">
      <header className="flex flex-col gap-4">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">Learn · study planner</span>
        <h1 className="font-display text-[clamp(40px,6.4vw,88px)] font-extrabold leading-[0.9] tracking-tightest text-fg">
          {view && !editing ? (view.live.problem === "past" ? "Interview day has passed" : `Interview in ${daysBetween(today, view.settings.target)} days`) : "Plan to your interview"}
          <span className="text-signal-text">.</span>
        </h1>
        <p className="max-w-[720px] text-[16px] leading-relaxed text-fg-2 sm:text-[19px]">
          {view && !editing
            ? `${dow(view.settings.target)} ${fmtDate(view.settings.target, true)}. A day-by-day plan from the course's real lesson order and reading times, re-worked from today with what you've actually finished.`
            : "Pick your interview date and how much time you have. You get a day-by-day plan through the course, a final revision stretch, and a calendar file. Fall behind and it adjusts."}
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[12.5px] sm:text-[13px]">
          <SaveOfflineButton title="Study planner" kind="tool" url="/learn/plan" />
          <Link href="/learn/dashboard#goals" className="inline-flex min-h-10 items-center text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
            weekly goal on Progress →
          </Link>
          <Link href="/learn/numbers" className="inline-flex min-h-10 items-center text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
            numbers playground →
          </Link>
        </div>
      </header>

      {!view || editing ? (
        <PlanForm map={map} initial={editing && record ? record.settings : initial} today={today} lessons={d.lessons} done={d.done} goal={d.goal} editing={editing} onSave={onSave} onCancel={editing ? () => setEditing(false) : null} />
      ) : (
        <Plan view={view} signedIn={d.signedIn} onEdit={() => setEditing(true)} onRebaseline={() => rebaseline(today)} onDelete={remove} />
      )}
    </main>
  );
}

function Plan({ view, signedIn, onEdit, onRebaseline, onDelete }: { view: PlanView; signedIn: boolean; onEdit: () => void; onRebaseline: () => void; onDelete: () => void }) {
  const { live, today } = view;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const todayDay = live.days.find((d) => d.date === today) || null;
  const next = live.days.find((d) => d.date > today && d.type !== "buffer") || null;
  const sessions = live.days.filter((d) => d.date >= today && d.type !== "buffer").length;
  const earlier = view.baseline.days.filter((d) => d.date < today);
  return (
    <>
      <Status view={view} onRebaseline={onRebaseline} onEdit={onEdit} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <TodayCard day={todayDay} next={next} view={view} />
        <ExportCard view={view} signedIn={signedIn} />
      </div>

      <section aria-labelledby="days-h" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
              <span className="text-signal-text">{sessions}</span> sessions to go · {fmtMinutes(live.workMinutes)} of study
            </span>
            <h2 id="days-h" className="font-display text-[28px] font-extrabold leading-[1] tracking-[-0.035em] text-fg sm:text-[36px]">
              Day by day
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onEdit} className="min-h-11 border border-line-strong px-4 text-sm text-fg hover:bg-surface-2">
              Edit plan
            </button>
            {confirmDelete ? (
              <>
                <button type="button" onClick={onDelete} className="min-h-11 border border-bad px-4 text-sm text-bad-text hover:bg-surface-2">
                  Delete it
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-11 px-3 text-sm text-fg-3 hover:text-fg">
                  Keep
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-11 px-3 text-sm text-fg-3 underline-offset-4 hover:text-fg hover:underline">
                Delete plan
              </button>
            )}
          </div>
        </div>
        {earlier.length > 0 && (
          <details className="border border-line bg-surface">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 font-mono text-[13px] text-fg-3 hover:text-fg">
              earlier · {earlier.length} day{earlier.length > 1 ? "s" : ""} of the plan you set on {fmtDate(view.record.baseStart)}
            </summary>
            <ol className="m-0 flex list-none flex-col border-t border-line p-0">
              {earlier.map((d) => (
                <DayRow key={d.date} day={d} view={view} past />
              ))}
            </ol>
          </details>
        )}
        <ol className="m-0 flex list-none flex-col border border-line p-0">
          {live.days.map((d) => (
            <DayRow key={d.date} day={d} view={view} today={d.date === today} />
          ))}
          <li className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-surface-2 px-4 py-4">
            <span className="w-[92px] shrink-0 font-mono text-[12px] text-fg">
              {dow(view.settings.target)} {fmtDate(view.settings.target)}
            </span>
            <span className="font-display text-[18px] font-bold tracking-[-0.02em] text-signal-text">Interview day. You&apos;ve got this.</span>
          </li>
        </ol>
        {live.overflow.length > 0 && (
          <div className="flex flex-col gap-2 border border-dashed border-signal p-4">
            <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">doesn&apos;t fit before the interview · {fmtMinutes(live.overflowMinutes)}</span>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px] text-fg-2">
              {live.overflow.slice(0, 12).map((o) => (
                <li key={o.item.id}>
                  <Link href={o.item.href} className="hover:text-fg">
                    {o.item.tag} · {o.item.title}
                  </Link>{" "}
                  <span className="font-mono text-[12px] text-fg-3">{o.minutes} min</span>
                </li>
              ))}
              {live.overflow.length > 12 && <li className="text-fg-3">and {live.overflow.length - 12} more</li>}
            </ul>
          </div>
        )}
      </section>

      <Summary view={view} />
    </>
  );
}

function Status({ view, onRebaseline, onEdit }: { view: PlanView; onRebaseline: () => void; onEdit: () => void }) {
  const { drift: dr, live, settings: s } = view;
  if (live.problem === "past") {
    return (
      <div role="status" className="flex flex-col gap-3 border border-line-strong bg-surface p-5">
        <span className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-fg">Your interview date has passed.</span>
        <p className="m-0 text-[15px] text-fg-2">How did it go? Set a new date to keep going, or keep learning at your own pace.</p>
        <button type="button" onClick={onEdit} className="min-h-12 self-start bg-signal px-5 text-sm font-semibold text-on-signal">
          Set a new date
        </button>
      </div>
    );
  }
  const dayWord = (n: number) => `${n} study day${n === 1 ? "" : "s"}`;
  let tone: "ok" | "warn" = "ok";
  let head: string;
  let body: string;
  if (live.problem === "nothing-left") {
    head = "Everything in your plan is done.";
    body = "Only revision is left. Run the review queue daily until the interview, and try a mock interview again.";
  } else if (dr.status === "behind") {
    tone = "warn";
    head = `You're ${dayWord(dr.days)} behind — plan adjusted.`;
    body = `Against the plan you set on ${fmtDate(view.record.baseStart)}, ${fmtMinutes(dr.behindMinutes)} of planned study isn't done. Everything left now runs from today${live.fits ? (live.buffersUsed ? `, using ${live.buffersUsed} catch-up day${live.buffersUsed > 1 ? "s" : ""},` : "") + ` and you still finish the content by ${fmtDate(live.contentEnd, true)}.` : ", but it no longer fits before the interview."}`;
  } else if (dr.status === "ahead") {
    head = `You're ${dayWord(dr.days)} ahead.`;
    body = `The plan moved up: content done by ${fmtDate(live.contentEnd, true)}${live.buffersLeft ? `, with ${live.buffersLeft} catch-up day${live.buffersLeft > 1 ? "s" : ""} to spare` : ""}.`;
  } else if (dr.status === "slightly-behind") {
    head = "On track, just about.";
    body = `${fmtMinutes(dr.behindMinutes)} of earlier sessions is still open: less than a day, so nothing moved.`;
  } else if (!live.fits) {
    tone = "warn";
    head = "It doesn't all fit yet.";
    body = "You're keeping pace with your plan, but at this rate it runs past the interview. The plan below schedules what fits, in course order; the rest is listed at the end.";
  } else {
    head = "On track.";
    body = live.contentEnd ? `Content done by ${fmtDate(live.contentEnd, true)}, then ${s.revision ? `${s.revision} revision day${s.revision > 1 ? "s" : ""}` : "the interview"}.` : "Keep going.";
  }
  const unfit = !live.fits && live.problem === null;
  return (
    <div role="status" className={`flex flex-col gap-3 border p-5 ${tone === "warn" || unfit ? "border-signal bg-surface" : "border-line-strong bg-surface"}`}>
      <span className={`font-display text-[24px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[28px] ${tone === "warn" ? "text-signal-text" : "text-fg"}`}>{head}</span>
      <p className="m-0 max-w-[860px] text-[15px] leading-relaxed text-fg-2">{body}</p>
      {unfit && (
        <p className="m-0 max-w-[860px] text-[15px] leading-relaxed text-fg">
          At {fmtMinutes(s.minutes)} a day, {fmtMinutes(live.overflowMinutes)} doesn&apos;t fit before {fmtDate(s.target)}.{" "}
          {view.needMinutes ? `${fmtMinutes(view.needMinutes)} a day fits it all.` : "Pick a later date or study less."}
        </p>
      )}
      {(dr.status === "behind" || dr.status === "ahead" || unfit) && (
        <div className="flex flex-wrap gap-2">
          {(dr.status === "behind" || dr.status === "ahead") && (
            <button type="button" onClick={onRebaseline} className="min-h-11 bg-signal px-4 text-sm font-semibold text-on-signal hover:brightness-110">
              Keep the adjusted plan
            </button>
          )}
          {unfit && (
            <button type="button" onClick={onEdit} className="min-h-11 border border-line-strong px-4 text-sm text-fg hover:bg-surface-2">
              Change minutes or days
            </button>
          )}
          <span className="self-center text-[13px] text-fg-3">Re-download the calendar file after a change: it updates the same events.</span>
        </div>
      )}
    </div>
  );
}

function TodayCard({ day, next, view }: { day: PlanDay | null; next: PlanDay | null; view: PlanView }) {
  const study = day && day.type !== "buffer" ? day : null;
  const firstOpen = study?.entries.find((e) => !e.done) || null;
  const allDone = !!study && study.entries.length > 0 && !firstOpen && study.type !== "revision";
  return (
    <section aria-labelledby="today-h" className="flex min-w-0 flex-col gap-4 border border-line-strong bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="today-h" className="m-0 font-mono text-[11px] uppercase tracking-label text-signal-text">
          today · {dow(view.today)} {fmtDate(view.today)}
        </h2>
        {study && <span className="font-mono text-[12px] text-fg-3">{fmtMinutes(study.minutes)}</span>}
      </div>
      {study ? (
        <>
          <span className="font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg">{allDone ? "Today's session is done. Nice." : dayTitle(study)}</span>
          <ul className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
            {study.entries.map((e, i) => (
              <li key={`${e.id}-${i}`} className="flex items-center gap-3 bg-bg px-3 py-2.5">
                <span aria-label={e.done ? "done" : "to do"} className={`grid h-5 w-5 shrink-0 place-items-center border text-[12px] ${e.done ? "border-signal bg-signal text-on-signal" : "border-line-strong text-transparent"}`}>
                  ✓
                </span>
                <Link href={e.href} className={`flex min-w-0 flex-1 flex-col ${e.done ? "text-fg-3" : "text-fg"} hover:underline`}>
                  <span className="font-mono text-[11px] tracking-label text-fg-3">{e.tag}</span>
                  <span className="text-[15px] leading-snug">
                    {e.title}
                    {e.part ? ` · part ${e.part[0]} of ${e.part[1]}` : ""}
                  </span>
                </Link>
                <span className="shrink-0 font-mono text-[12px] text-fg-3">{e.minutes}m</span>
              </li>
            ))}
          </ul>
          {firstOpen && (
            <Link href={firstOpen.href} className="inline-flex min-h-12 items-center self-start bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110">
              {study.type === "revision" ? "Start revision →" : `Start: ${firstOpen.title.length > 38 ? `${firstOpen.title.slice(0, 36)}…` : firstOpen.title} →`}
            </Link>
          )}
        </>
      ) : (
        <>
          <span className="font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg">{day?.type === "buffer" ? "Catch-up day." : "No session today."}</span>
          <p className="m-0 text-[15px] leading-relaxed text-fg-2">
            {day?.type === "buffer" ? "Nothing new is planned: finish anything left from this week, run your review queue, or rest. " : "Rest, or get ahead: anything you finish now moves the plan up. "}
            {next ? `Next: ${dow(next.date)} ${fmtDate(next.date)} · ${dayTitle(next)}.` : ""}
          </p>
          {next?.entries[0] && (
            <Link href={next.entries[0].href} className="inline-flex min-h-12 items-center self-start border border-line-strong px-4 text-[15px] font-medium text-fg hover:bg-surface-2">
              Get ahead: {next.entries[0].title.length > 34 ? `${next.entries[0].title.slice(0, 32)}…` : next.entries[0].title} →
            </Link>
          )}
        </>
      )}
    </section>
  );
}

function ExportCard({ view, signedIn }: { view: PlanView; signedIn: boolean }) {
  const [done, setDone] = useState<{ days: number; cancelled: number; reexport: boolean } | null>(null);
  const [google, setGoogle] = useState(false);
  const { openAuthModal } = useAuthModal();
  const upcoming = view.live.days.filter((d) => d.date >= view.today);
  return (
    <section aria-labelledby="cal-h" className="flex min-w-0 flex-col gap-4 border border-line bg-surface p-5">
      <h2 id="cal-h" className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">
        calendar · {upcoming.length} sessions at {view.settings.time}
      </h2>
      <p className="m-0 text-[14px] leading-relaxed text-fg-2">One event per study day, with what to read and links. {view.settings.reminder ? `Reminder ${view.settings.reminder} min before.` : "No reminder."}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setDone(downloadIcs(view))} disabled={!upcoming.length} className="inline-flex min-h-12 items-center bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110 disabled:opacity-50">
          Download .ics
        </button>
        <button
          type="button"
          aria-expanded={google}
          onClick={() => {
            setGoogle((g) => !g);
            if (!google) track("plan_export", { format: "google_help", days: upcoming.length, drift: view.drift.status });
          }}
          className="inline-flex min-h-12 items-center border border-line-strong px-4 text-[15px] font-medium text-fg hover:bg-surface-2"
        >
          Add to Google Calendar
        </button>
      </div>
      {done && (
        <p role="status" className="m-0 text-[13px] text-fg-2">
          {done.reexport ? "Updated file downloaded" : "Downloaded"}: {done.days} sessions{done.cancelled ? `, ${done.cancelled} moved session${done.cancelled > 1 ? "s" : ""} marked cancelled` : ""}. Open it to add to Apple Calendar or Outlook.
        </p>
      )}
      <p className="m-0 text-[12.5px] leading-relaxed text-fg-3">
        Apple Calendar and Outlook: open the file. Re-download after a re-plan: events keep their IDs, so these apps update them instead of adding copies.
      </p>
      {google && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <span className="text-[15px] font-semibold text-fg">Google Calendar</span>
          <ol className="m-0 flex flex-col gap-1.5 pl-5 text-[14px] leading-relaxed text-fg-2">
            <li>Download the .ics above.</li>
            <li>
              On a computer, open{" "}
              <a href="https://calendar.google.com/calendar/r/settings/createcalendar" target="_blank" rel="noopener noreferrer" className="text-signal-text underline underline-offset-2">
                Create new calendar ↗
              </a>{" "}
              and make one called &ldquo;SDM study plan&rdquo; (optional, but it makes a re-plan easy).
            </li>
            <li>
              Open{" "}
              <a href="https://calendar.google.com/calendar/r/settings/export" target="_blank" rel="noopener noreferrer" className="text-signal-text underline underline-offset-2">
                Settings → Import &amp; export ↗
              </a>
              , pick the file and that calendar, then Import.
            </li>
          </ol>
          <p className="m-0 text-[12.5px] leading-relaxed text-fg-3">
            Google can&apos;t take a whole plan from a link, and its importer skips events it has seen before, so a re-imported file doesn&apos;t move them. After a re-plan, delete the &ldquo;SDM study plan&rdquo; calendar and import the new file into a fresh one. Or add sessions one at a time:
          </p>
          <ul className="m-0 flex max-h-[320px] list-none flex-col overflow-auto border border-line p-0">
            {upcoming.map((d) => (
              <li key={d.date} className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 last:border-b-0">
                <span className="min-w-0 text-[13.5px] leading-snug text-fg-2">
                  <span className="font-mono text-[12px] text-fg">
                    {dow(d.date)} {fmtDate(d.date)}
                  </span>{" "}
                  · {dayTitle(d)}
                </span>
                <a href={googleDayLink(d, view)} target="_blank" rel="noopener noreferrer" onClick={() => track("plan_export", { format: "google_day", days: 1, drift: view.drift.status })} className="shrink-0 font-mono text-[12px] text-signal-text underline underline-offset-2">
                  add ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!signedIn && (
        <p className="m-0 border-t border-line pt-3 text-[12.5px] text-fg-3">
          Saved in this browser.{" "}
          <button type="button" onClick={openAuthModal} className="text-fg underline underline-offset-2">
            Sign in
          </button>{" "}
          to keep the plan on every device.
        </p>
      )}
    </section>
  );
}

function DayRow({ day, view, today = false, past = false }: { day: PlanDay; view: PlanView; today?: boolean; past?: boolean }) {
  const badge = day.type === "buffer" ? "CATCH-UP" : day.type === "revision" ? "REVISION" : day.type === "mock" ? "MOCK" : null;
  const allDone = day.entries.length > 0 && day.entries.every((e) => e.done);
  return (
    <li className={`flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0 sm:flex-row sm:gap-4 ${today ? "bg-surface-2 shadow-[inset_3px_0_0_var(--c-signal)]" : past ? "bg-surface" : "bg-bg"}`}>
      <div className="flex items-baseline justify-between gap-3 sm:contents">
        <span className="flex shrink-0 items-baseline gap-2 font-mono text-[12px] text-fg sm:w-[92px] sm:flex-col sm:gap-0.5">
          <span>
            {dow(day.date)} {fmtDate(day.date)}
          </span>
          {today && <span className="text-[11px] tracking-label text-signal-text">TODAY</span>}
        </span>
        <DayMeta day={day} view={view} past={past} allDone={allDone} className="sm:hidden" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {badge && <span className="font-mono text-[11px] tracking-label text-signal-text">{badge}</span>}
        {day.type === "buffer" ? (
          <span className="text-[14px] text-fg-3">Free for catching up. Nothing new.</span>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {day.entries.map((e, i) => (
              <li key={`${e.id}-${i}`} className="flex items-baseline gap-2 text-[14px] leading-snug">
                <span aria-hidden className={`w-3 shrink-0 font-mono text-[12px] ${e.done ? "text-signal-text" : "text-fg-4"}`}>
                  {e.done ? "✓" : "·"}
                </span>
                <Link href={e.href} className={`min-w-0 ${e.done ? "text-fg-3 line-through decoration-fg-4" : "text-fg-2 hover:text-fg"}`}>
                  <span className="font-mono text-[11px] text-fg-3">{e.tag}</span> {e.title}
                  {e.part ? ` (${e.part[0]}/${e.part[1]})` : ""}
                </Link>
                <span className="ml-auto shrink-0 font-mono text-[11.5px] text-fg-3">{e.minutes}m</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <DayMeta day={day} view={view} past={past} allDone={allDone} className="hidden sm:flex sm:w-[110px] sm:justify-end" />
    </li>
  );
}

function DayMeta({ day, view, past, allDone, className }: { day: PlanDay; view: PlanView; past: boolean; allDone: boolean; className: string }) {
  return (
    <span className={`flex shrink-0 items-start gap-3 ${className}`}>
      <span className="font-mono text-[12px] text-fg-3">{allDone && !past ? "done ✓" : day.minutes ? fmtMinutes(day.minutes) : ""}</span>
      {!past && (
        <a href={googleDayLink(day, view)} target="_blank" rel="noopener noreferrer" aria-label={`Add ${fmtDate(day.date)} to Google Calendar`} className="font-mono text-[11.5px] text-fg-3 underline decoration-line-strong underline-offset-2 hover:text-fg">
          +gcal
        </a>
      )}
    </span>
  );
}

function Summary({ view }: { view: PlanView }) {
  const s = view.settings;
  const on = Object.entries({ "core lessons": s.include.core, bosses: s.include.bosses, trials: s.include.trials, "mock interviews": s.include.mocks, "side quests": s.include.sideQuests })
    .filter(([, v]) => v)
    .map(([k]) => k);
  return (
    <p className="m-0 max-w-[860px] border-t border-line pt-6 text-[13px] leading-relaxed text-fg-3">
      Your settings: {fmtMinutes(s.minutes)} on {s.days.map((d) => WD[d]).join(", ")} · {on.join(", ")}
      {s.include.mocks ? ` (mocks ${s.mocksAt === "end" ? "in the final stretch" : "after their world"})` : ""} · {s.revision} revision day{s.revision === 1 ? "" : "s"} · {s.buffer ? "a catch-up day each week" : "no catch-up days"}. Reading minutes come from each lesson&apos;s length; trial parts count about a minute a question. The plan recomputes from today with what you&apos;ve finished every time you open it.
    </p>
  );
}
