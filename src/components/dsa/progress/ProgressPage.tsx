"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useDsaProgress } from "./useDsaProgress";
import { useLang } from "../concept/widgets";
import { openOnboarding } from "../onboarding/useOnboarding";
import DsaDaily from "../daily/DsaDaily";
import DsaBeltBadges from "../rewards/DsaBeltBadges";
import DsaLeaderboard from "../rewards/DsaLeaderboard";
import DsaStats from "../stats/DsaStats";
import ReadinessCard from "@/components/learn/progress/ReadinessCard";
import ShareProgress from "@/components/learn/progress/ShareProgress";
import CompanyPlanSection from "@/components/learn/plan/CompanyPlan";
import Reminders from "@/components/learn/progress/Reminders";
import WeeklyEmail from "@/components/learn/progress/WeeklyEmail";
import { DSA_LANGS, DSA_LANG_LABEL, type DsaLang } from "@/lib/dsa/types";
import { summarise, type ProgressPart, type ProgressProblem } from "@/lib/dsa/progress-summary";
import { istDate } from "@/lib/learn/arena/shared";
import type { StatRow } from "@/lib/dsa/stats";
import type { BadgeDef } from "@/lib/dsa/rewards";

/**
 * /dsa/progress (the Progress tab): summary, interview readiness (bands, never percentages), streak and daily history, plan,
 * belt and badges, leaderboard, stats, certificate, share and settings. Every part is the existing component; this page
 * only composes them and gives each an anchor (#readiness, #streak, #plan, #belt, #leaderboard, #stats, #certificate, #share, #settings).
 */

export type ProgressPageProps = { defs: BadgeDef[] | null; problems: ProgressProblem[]; parts: ProgressPart[]; lessonTotal: number; rows: StatRow[]; steps: { id: string; label: string }[]; plannedLessons: number };

const H2 = "m-0 font-display text-[24px] font-bold tracking-[-0.02em] text-fg";
const LINK = "font-mono text-[12.5px] text-signal-text underline decoration-line-strong underline-offset-4 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text";

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-24 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-h`} className={H2}>
          {title}
        </h2>
        {note ? <span className="font-mono text-[12px] text-fg-3">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Bar({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
        <span className="min-w-0 truncate text-fg-2">{label}</span>
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-fg-3">
          {done} of {total}
        </span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} className="h-1.5 bg-line">
        <div className="h-full bg-signal transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

function Summary({ problems, parts, lessonTotal, plannedLessons }: Pick<ProgressPageProps, "problems" | "parts" | "lessonTotal" | "plannedLessons">) {
  const p = useDsaProgress();
  const s = useMemo(() => summarise({ problems, parts, concepts: p.concepts, solved: p.solved, checkpoints: p.checkpoints }), [problems, parts, p.concepts, p.solved, p.checkpoints]);
  const tile = (value: string, label: string) => (
    <div className="flex flex-col gap-1 bg-surface p-4">
      <span className="font-display text-[28px] font-extrabold leading-none tracking-[-0.03em] text-fg tabular-nums">{p.ready ? value : "–"}</span>
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{label}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
        {tile(`${s.lessons} of ${lessonTotal}`, "Lessons done")}
        {tile(`${s.solved} of ${s.problemsTotal}`, "Problems solved")}
        {tile(String(s.checkpoints), "Checkpoints passed")}
        {tile(`${s.byLevel.easy.solved}/${s.byLevel.medium.solved}/${s.byLevel.hard.solved}`, "Easy / medium / hard")}
      </div>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
        {s.parts.map((x) => (
          <Bar key={x.id} label={x.title} done={x.done} total={x.total} />
        ))}
      </ul>
      <p className="m-0 font-mono text-[12px] text-fg-3">Counts are lessons and problems that are ready{plannedLessons ? `; ${plannedLessons} more lessons are planned and not counted` : ""}.</p>
    </div>
  );
}

function Settings() {
  const { user, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [lang, setLang] = useLang();
  return (
    <div className="grid gap-px border border-line bg-line lg:grid-cols-2">
      <div className="flex flex-col gap-3 bg-surface p-4 sm:p-5">
        <label htmlFor="pg-lang" className="font-mono text-[11px] uppercase tracking-label text-fg-3">
          Code language
        </label>
        <select
          id="pg-lang"
          value={lang}
          onChange={(e) => setLang(e.target.value as DsaLang)}
          className="h-11 max-w-[260px] border border-line-strong bg-surface px-3 font-mono text-[14px] text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text"
        >
          {DSA_LANGS.map((l) => (
            <option key={l} value={l}>
              {DSA_LANG_LABEL[l]}
            </option>
          ))}
        </select>
        <p className="m-0 text-[13.5px] leading-snug text-fg-3">Used by lesson code, cheat sheets and the problem editor. Saved on this device.</p>
        <button type="button" onClick={openOnboarding} className={`${LINK} min-h-10 self-start text-left`}>
          Redo the welcome tour
        </button>
        <p className="m-0 text-[13.5px] leading-snug text-fg-3">
          The reading look (the Aa panel and the theme) follows the theme you pick in the header; there is nothing separate to set here.
        </p>
      </div>
      <div className="flex flex-col gap-4 bg-surface p-4 sm:p-5">
        <p className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">Reminders and email</p>
        <Reminders signedIn={!!user && !loading} onSignIn={openAuthModal} />
        <WeeklyEmail signedIn={!!user && !loading} />
        <Link href="/memory" className={`${LINK} self-start`}>
          What the tutor remembers about me →
        </Link>
      </div>
    </div>
  );
}

export default function ProgressPage(props: ProgressPageProps) {
  const { user, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const today = istDate();
  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1100px] flex-col gap-12 px-4 pb-24 pt-6 sm:px-6">
        <header className="flex flex-col gap-2">
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">Progress</span>
          <h1 className="m-0 font-display text-[32px] font-extrabold leading-none tracking-[-0.03em] text-fg sm:text-[40px]">
            How far you have come<span className="text-signal-text">.</span>
          </h1>
          {!loading && !user ? (
            <p className="m-0 text-[14px] text-fg-3">
              You are playing as a guest: this page shows what is saved in this browser.{" "}
              <button type="button" onClick={openAuthModal} className="min-h-10 text-signal-text underline decoration-line-strong underline-offset-4">
                Sign in free
              </button>{" "}
              to keep it on every device.
            </p>
          ) : null}
          <nav aria-label="On this page" className="-mx-4 overflow-x-auto px-4 pt-1 sm:mx-0 sm:px-0">
            <ul className="m-0 flex w-max list-none gap-2 p-0">
              {[["readiness", "Readiness"], ["streak", "Streak"], ["plan", "Plan"], ["belt", "Belt & badges"], ["leaderboard", "Leaderboard"], ["stats", "Stats"], ["certificate", "Certificate"], ["share", "Share"], ["settings", "Settings"]].map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="inline-flex min-h-10 items-center border border-line-strong bg-surface px-3 font-mono text-[12.5px] text-fg-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <Section id="summary" title="Summary">
          <Summary problems={props.problems} parts={props.parts} lessonTotal={props.lessonTotal} plannedLessons={props.plannedLessons} />
        </Section>

        <Section id="readiness" title="Interview readiness" note="a band per topic, never a percentage">
          {user ? (
            <ReadinessCard tracks={["dsa"]} id="readiness-card" />
          ) : (
            <p className="m-0 border border-dashed border-line-strong px-4 py-4 text-[14px] text-fg-2">
              Readiness is worked out from your solves, interview rounds and reviews on your account.{" "}
              <button type="button" onClick={openAuthModal} className="min-h-10 text-signal-text underline decoration-line-strong underline-offset-4">
                Sign in free
              </button>{" "}
              to see where you stand.
            </p>
          )}
        </Section>

        <Section id="streak" title="Streak and daily history">
          <DsaDaily embedded />
        </Section>

        <Section id="plan" title="Plan">
          <div className="flex flex-col gap-3 border border-line bg-surface p-4 sm:p-5">
            <p className="m-0 max-w-[62ch] text-[14.5px] leading-relaxed text-fg-2">Pick an interview date and get a day-by-day plan that includes the DSA lessons, a revision stretch and a calendar file (.ics). Fall behind and it adjusts.</p>
            <Link href="/plan" className="inline-flex min-h-11 items-center self-start bg-signal px-4 font-mono text-[13px] font-semibold text-on-signal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text">
              Open the study planner →
            </Link>
            <CompanyPlanSection today={today} />
          </div>
        </Section>

        <Section id="belt" title="Belt & badges">
          <DsaBeltBadges defs={props.defs} embedded />
        </Section>

        <div id="leaderboard" className="scroll-mt-24">
          <DsaLeaderboard />
        </div>

        <Section id="stats" title="Stats">
          <DsaStats rows={props.rows} steps={props.steps} embedded />
        </Section>

        <Section id="certificate" title="Certificate">
          <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface p-4 sm:p-5">
            <p className="m-0 max-w-[58ch] text-[14.5px] leading-relaxed text-fg-2">The Foundations certificate lists exactly what it needs. See what is done, claim it, and share a link anyone can verify.</p>
            <Link href="/dsa/certificate" className="inline-flex min-h-11 items-center border border-signal px-4 font-mono text-[13px] font-semibold text-signal-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text">
              See the requirements →
            </Link>
          </div>
        </Section>

        <div id="share" className="flex scroll-mt-24 flex-col gap-3">
          <ShareProgress />
          <Link href="/api/dsa/id-card" className={`${LINK} self-start`} target="_blank" rel="noopener">
            Make my learner ID card →
          </Link>
        </div>

        <Section id="settings" title="Settings">
          <Settings />
        </Section>
      </main>
    </div>
  );
}
