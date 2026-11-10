"use client";

/**
 * /dsa/stats, "My stats": the learner's own numbers, from the synced game store, their progress and this device's submit
 * history (src/lib/dsa/stats.ts does the counting). Plain SVG and CSS charts, no chart library. Signed out it shows what
 * this browser holds, with a quiet prompt to sign in and keep it.
 */
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useGame } from "@/game/GameProvider";
import { readRecord, STAGE_TITLE, VERDICT_LABEL, type Round } from "@/lib/dsa/interview";
import DsaCrumbs from "../DsaCrumbs";
import { useDsaProgress } from "../progress/useDsaProgress";
import { BeltSwatch } from "../rewards/BeltSwatch";
import { useDsaBits } from "../rewards/useDsaBits";
import { awardKeys, eventBits, SOLVE_BITS } from "@/lib/dsa/rewards";
import { computeStats, type Bar, type HistoryRow, type StatRow } from "@/lib/dsa/stats";
import { facetLabel } from "@/lib/dsa/taxonomy";

const LEVELS = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
] as const;
const LANG_LABEL: Record<string, string> = { python: "Python", javascript: "JavaScript", java: "Java", cpp: "C++" };

/** This device's submit history, per problem (dsa.history.<id>, written by the problem room). */
function useHistories(): Record<string, HistoryRow[]> | null {
  const [h, setH] = useState<Record<string, HistoryRow[]> | null>(null);
  useEffect(() => {
    const out: Record<string, HistoryRow[]> = {};
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i) || "";
        const m = k.match(/^dsa\.history\.(.+)$/);
        if (!m) continue;
        const rows = JSON.parse(window.localStorage.getItem(k) || "[]") as HistoryRow[];
        if (Array.isArray(rows) && rows.length) out[m[1]] = rows;
      }
    } catch {
      /* storage blocked: no device history */
    }
    // device state, readable only after hydration
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setH(out);
  }, []);
  return h;
}

/* ------------------------------------------------------------------ small parts */

function Card({ title, note, children, className = "" }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col gap-4 border border-line bg-surface p-4 sm:p-5 ${className}`}>
      <div className="flex flex-col gap-1">
        <h2 className="m-0 font-mono text-[12px] font-semibold uppercase tracking-label text-fg">{title}</h2>
        {note ? <p className="m-0 text-[13px] leading-snug text-fg-3">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Tile({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border border-line bg-surface px-4 py-3">
      <span className="font-display text-[28px] font-extrabold leading-none tracking-[-0.03em] text-fg tabular-nums">{value}</span>
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{label}</span>
    </div>
  );
}

/** Horizontal bars: solved of total per row, a teal fill on a quiet track. */
function Bars({ rows, empty }: { rows: Bar[]; empty: string }) {
  if (!rows.length) return <p className="m-0 text-[14px] text-fg-3">{empty}</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-fg">{r.label}</span>
            <span className="shrink-0 font-mono text-[12px] tabular-nums text-fg-3">
              {r.solved}/{r.total}
            </span>
          </div>
          <div role="progressbar" aria-label={r.label} aria-valuemin={0} aria-valuemax={r.total} aria-valuenow={r.solved} className="h-2 w-full bg-surface-2">
            <div className="h-full bg-signal" style={{ width: `${r.total ? Math.max(r.solved ? 3 : 0, Math.round((r.solved / r.total) * 100)) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The last 26 weeks as a grid of days (columns are weeks, rows Monday to Sunday); more activity, a deeper teal. */
function Heatmap({ heat }: { heat: { date: string; count: number; future: boolean }[] }) {
  const cell = 11;
  const gap = 3;
  const weeks = Math.ceil(heat.length / 7);
  const max = Math.max(1, ...heat.map((d) => d.count));
  const w = weeks * (cell + gap) - gap;
  const h = 7 * (cell + gap) - gap;
  const month = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const labels: { x: number; t: string }[] = [];
  for (let c = 0; c < weeks; c++) {
    const d = heat[c * 7]?.date;
    if (d && (c === 0 || month(d) !== month(heat[(c - 1) * 7].date))) labels.push({ x: c * (cell + gap), t: month(d) });
  }
  const total = heat.reduce((a, d) => a + (d.count > 0 ? 1 : 0), 0);
  return (
    <svg viewBox={`0 0 ${w} ${h + 16}`} role="img" aria-label={`Activity over the last six months: ${total} active days`} className="block h-auto w-full max-w-[520px]">
      {labels.map((l) => (
        <text key={l.x} x={l.x} y={9} fontSize="9" fill="var(--c-fg-3)" fontFamily="var(--font-mono, monospace)">
          {l.t}
        </text>
      ))}
      {heat.map((d, i) =>
        d.future ? null : (
          <rect key={d.date} x={Math.floor(i / 7) * (cell + gap)} y={16 + (i % 7) * (cell + gap)} width={cell} height={cell} rx="1.5" fill={d.count ? "var(--c-signal)" : "var(--c-surface-2)"} fillOpacity={d.count ? 0.3 + 0.7 * Math.min(1, d.count / Math.max(3, max * 0.7)) : 1} stroke="var(--c-line)" strokeWidth="0.5">
            <title>{`${d.date}: ${d.count ? `${d.count} ${d.count === 1 ? "action" : "actions"}` : "no activity"}`}</title>
          </rect>
        ),
      )}
    </svg>
  );
}

/** Weekly columns (solves per week). */
function WeeklyBars({ weeks }: { weeks: { start: string; solves: number }[] }) {
  const max = Math.max(3, ...weeks.map((w) => w.solves));
  const bw = 14;
  const gap = 4;
  const h = 90;
  const total = weeks.reduce((a, w) => a + w.solves, 0);
  return (
    <svg viewBox={`0 0 ${weeks.length * (bw + gap) - gap} ${h + 14}`} role="img" aria-label={`Problems solved per week over ${weeks.length} weeks: ${total} in all`} className="block h-auto w-full">
      <line x1="0" x2={weeks.length * (bw + gap)} y1={h} y2={h} stroke="var(--c-line-strong)" strokeWidth="1" />
      {weeks.map((w, i) => {
        const bh = w.solves ? Math.max(3, (w.solves / max) * (h - 4)) : 0;
        return (
          <rect key={w.start} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} fill="var(--c-signal)">
            <title>{`Week of ${w.start}: ${w.solves} solved`}</title>
          </rect>
        );
      })}
      <text x="0" y={h + 11} fontSize="8" fill="var(--c-fg-3)">
        {weeks[0]?.start.slice(5)}
      </text>
      <text x={weeks.length * (bw + gap) - gap} y={h + 11} fontSize="8" textAnchor="end" fill="var(--c-fg-3)">
        {weeks[weeks.length - 1]?.start.slice(5)}
      </text>
    </svg>
  );
}

/** Total Bits at the end of each week, as a line. */
function BitsLine({ weeks }: { weeks: { start: string; bitsTotal: number }[] }) {
  const w = 320;
  const h = 90;
  const max = Math.max(1, ...weeks.map((x) => x.bitsTotal));
  const pts = weeks.map((x, i) => [(i / Math.max(1, weeks.length - 1)) * w, h - 4 - (x.bitsTotal / max) * (h - 12)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h + 14}`} role="img" aria-label={`Bits over the last ${weeks.length} weeks: ${weeks[weeks.length - 1]?.bitsTotal ?? 0} now`} className="block h-auto w-full">
      <line x1="0" x2={w} y1={h} y2={h} stroke="var(--c-line-strong)" strokeWidth="1" />
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="var(--c-signal)" fillOpacity="0.14" />
      <path d={line} fill="none" stroke="var(--c-signal)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <text x="0" y={h + 11} fontSize="8" fill="var(--c-fg-3)">
        {weeks[0]?.start.slice(5)}
      </text>
      <text x={w} y={h + 11} fontSize="8" textAnchor="end" fill="var(--c-fg-3)">
        {weeks[weeks.length - 1]?.start.slice(5)}
      </text>
    </svg>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------------ the page */

export default function DsaStats({ rows, steps }: { rows: StatRow[]; steps: { id: string; label: string }[] }) {
  const { user, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { done, hydrated, flags } = useGame();
  // interview rounds (the problem room's Interview tab saves them as flags dsa:iv:<problem>)
  const rounds = Object.entries(flags)
    .filter(([k]) => k.startsWith("dsa:iv:"))
    .flatMap(([k, v]) => (readRecord(v)?.rounds ?? []).map((r) => ({ ...r, problem: k.slice(7) })))
    .sort((a, b) => b.at - a.at) as (Round & { problem: string })[];
  const avgRound = rounds.length ? rounds.reduce((t, r) => t + r.overall, 0) / rounds.length : 0;
  const progress = useDsaProgress();
  const bits = useDsaBits();
  const histories = useHistories();
  const [clock] = useState(() => ({ now: Date.now(), tz: new Date().getTimezoneOffset() }));
  const ready = hydrated && progress.ready && histories !== null;

  const stats = useMemo(() => {
    if (!ready) return null;
    const solveBits: Record<string, number> = {};
    // a solve's Bits as recorded (a solve from before Bits existed has no event, so it is left out of first-try and no-hint counts)
    for (const id of progress.solved) {
      const b = eventBits(done, awardKeys.solve(id));
      if (b >= 0) solveBits[id] = b;
    }
    return computeStats({ done, solved: progress.solved, rows, histories: histories || {}, solveBits, tiers: SOLVE_BITS, awards: bits.awards, now: clock.now, tzOffsetMin: clock.tz });
  }, [ready, done, progress.solved, rows, histories, bits.awards, clock]);

  const stepLabel = useMemo(() => new Map(steps.map((s) => [s.id, s.label])), [steps]);
  const nothingYet = !!stats && stats.solved.total === 0 && stats.activity.activeDays === 0 && stats.lessons.steps === 0;

  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1100px] flex-col gap-8 px-4 pb-24 pt-8 sm:px-6">
        <header className="flex flex-col gap-2">
          <DsaCrumbs items={[{ href: "/dsa", label: "DSA Mastery" }, { label: "My stats" }]} />
          <h1 className="m-0 font-display text-[36px] font-extrabold leading-none tracking-[-0.03em] text-fg sm:text-[48px]">
            My stats<span className="text-signal-text">.</span>
          </h1>
          <p className="m-0 max-w-[680px] text-[16px] leading-relaxed text-fg-2">Your own numbers: what you have solved, how often you show up, and how far your Bits have taken you.</p>
          <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-fg-3">
            {!loading && !user && (
              <span>
                These are the numbers on this device.{" "}
                <button type="button" onClick={openAuthModal} className="min-h-10 text-signal-text underline decoration-line-strong underline-offset-4">
                  Sign in free
                </button>{" "}
                to keep them on every device.
              </span>
            )}
            <Link href="/dsa/progress" className="inline-flex min-h-10 items-center text-signal-text underline decoration-line-strong underline-offset-4">
              Belt &amp; badges →
            </Link>
          </p>
        </header>

        {!stats ? (
          <p role="status" className="m-0 font-mono text-[13px] text-fg-3">
            Counting your progress…
          </p>
        ) : nothingYet ? (
          <div className="flex flex-col items-start gap-3 border border-dashed border-line-strong px-5 py-10">
            <p className="m-0 font-display text-[22px] font-bold text-fg">Solve your first problem to see your stats</p>
            <p className="m-0 max-w-[52ch] text-[15px] leading-relaxed text-fg-2">Your solves, streaks, lessons and Bits will show up here as you go. A first Easy problem takes about ten minutes.</p>
            <Link href="/dsa/problems" className="inline-flex h-11 items-center bg-signal px-5 font-mono text-[13px] font-semibold text-on-signal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
              Pick a problem
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile value={stats.solved.total} label="Problems solved" />
              <Tile value={stats.activity.current} label="Day streak" />
              <Tile value={stats.activity.longest} label="Longest streak" />
              <Tile value={bits.bits.toLocaleString("en-US")} label="Bits" />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Problems solved" note={`${stats.solved.total} of ${stats.solved.bank} problems in the bank.`}>
                <Bars rows={LEVELS.map((l) => ({ id: l.id, label: l.label, ...stats.solved.byLevel[l.id] }))} empty="" />
              </Card>
              <Card title="Activity" note={`${plural(stats.activity.activeDays, "active day")} on record. Any lesson step, problem or submit counts.`}>
                <Heatmap heat={stats.activity.heat} />
                <p className="m-0 font-mono text-[12px] text-fg-3">
                  Current streak {plural(stats.activity.current, "day")} · longest {plural(stats.activity.longest, "day")}
                </p>
              </Card>
              <Card title="By data structure" note="Problems you solved, out of the bank.">
                <Bars rows={stats.solved.byStructure.map((b) => ({ ...b, label: facetLabel("structures", b.id) }))} empty="Solve a problem to fill this in." />
              </Card>
              <Card title="By algorithm">
                <Bars rows={stats.solved.byAlgorithm.map((b) => ({ ...b, label: facetLabel("algorithms", b.id) }))} empty="Solve a problem to fill this in." />
              </Card>
              <Card title="By course step" className="lg:col-span-2">
                <Bars rows={stats.solved.byStep.map((b) => ({ ...b, label: stepLabel.get(b.id) || b.id })).filter((b) => b.total > 0)} empty="" />
              </Card>
              <Card title="Solves over time" note="Problems solved each week, the last 26 weeks.">
                <WeeklyBars weeks={stats.weekly} />
              </Card>
              <Card title="Bits and belts" note="Your Bits at the end of each week.">
                <BitsLine weeks={stats.weekly} />
                <div className="flex flex-col gap-2">
                  <p className="m-0 flex items-center gap-2 text-[15px] text-fg">
                    <BeltSwatch belt={bits.belt.belt} size={24} />
                    <span className="font-semibold">{bits.belt.belt.name} belt</span>
                    <span className="font-mono text-[12px] text-fg-3">{bits.bits.toLocaleString("en-US")} Bits</span>
                  </p>
                  {bits.belt.next ? (
                    <>
                      <div role="progressbar" aria-label={`Progress to the ${bits.belt.next.name} belt`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={bits.belt.pct} className="h-2 w-full bg-surface-2">
                        <div className="h-full bg-signal" style={{ width: `${bits.belt.pct}%` }} />
                      </div>
                      <p className="m-0 font-mono text-[12px] text-fg-3">
                        {bits.belt.toNext.toLocaleString("en-US")} Bits to the {bits.belt.next.name} belt
                      </p>
                    </>
                  ) : (
                    <p className="m-0 font-mono text-[12px] text-fg-3">Top belt reached.</p>
                  )}
                </div>
              </Card>
              <Card title="Lessons">
                <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  {[
                    ["Lessons completed", stats.lessons.lessons],
                    ["Lesson steps done", stats.lessons.steps],
                    ["Checkpoint quizzes passed", stats.lessons.quizzes],
                    ["Labs built", stats.lessons.labs],
                    ["Dry runs done", stats.lessons.dryRuns],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex flex-col gap-0.5">
                      <dd className="m-0 font-display text-[24px] font-extrabold leading-none text-fg tabular-nums">{v}</dd>
                      <dt className="font-mono text-[11px] uppercase tracking-label text-fg-3">{k}</dt>
                    </div>
                  ))}
                </dl>
              </Card>
              <Card title="Videos" note="Lectures count when you watch to the end. Solution videos and clips are not tracked yet.">
                <p className="m-0 font-display text-[24px] font-extrabold leading-none text-fg tabular-nums">
                  {stats.videos.lectures} <span className="font-mono text-[11px] font-normal uppercase tracking-label text-fg-3">lectures watched to the end</span>
                </p>
              </Card>
              <Card title="Submissions" note="From the submits made on this device.">
                {stats.submissions.total ? (
                  <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                    {[
                      ["Submits", stats.submissions.total],
                      ["Acceptance rate", stats.submissions.rate == null ? "–" : `${stats.submissions.rate}%`],
                      ["Solved first try", stats.submissions.known ? stats.submissions.firstTry : "–"],
                      ["Solved with no hints", stats.submissions.known ? stats.submissions.noHints : "–"],
                    ].map(([k, v]) => (
                      <div key={k as string} className="flex flex-col gap-0.5">
                        <dd className="m-0 font-display text-[24px] font-extrabold leading-none text-fg tabular-nums">{v}</dd>
                        <dt className="font-mono text-[11px] uppercase tracking-label text-fg-3">{k}</dt>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="m-0 text-[14px] text-fg-3">Submit a solution on this device to see your acceptance rate.</p>
                )}
                {Object.keys(stats.submissions.languages).length > 0 && (
                  <p className="m-0 font-mono text-[12px] text-fg-3">
                    Languages:{" "}
                    {Object.entries(stats.submissions.languages)
                      .sort((a, b) => b[1] - a[1])
                      .map(([l, n]) => `${LANG_LABEL[l] || l} ${n}`)
                      .join(" · ")}
                  </p>
                )}
              </Card>
              <Card title="Interview rounds">
                {rounds.length ? (
                  <div className="flex flex-col gap-2">
                    <p className="m-0 text-[14px] text-fg-2">
                      {rounds.length} round{rounds.length === 1 ? "" : "s"} · average {avgRound.toFixed(1)} / 5
                    </p>
                    <ul className="m-0 flex list-none flex-col gap-1 p-0">
                      {rounds.slice(0, 5).map((r) => (
                        <li key={`${r.problem}-${r.at}`} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
                          <a href={`/dsa/problems/${r.problem}`} className="min-w-0 truncate text-fg underline decoration-line-strong underline-offset-4">
                            {r.problem.replace(/-/g, " ")}
                          </a>
                          <span className="font-mono text-[12px] text-fg-3">
                            {STAGE_TITLE[r.stage]} · {r.overall.toFixed(1)} · {VERDICT_LABEL[r.verdict]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="m-0 text-[14px] text-fg-3">No interview rounds yet. Open a problem&apos;s Interview tab to practise explaining it.</p>
                )}
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
