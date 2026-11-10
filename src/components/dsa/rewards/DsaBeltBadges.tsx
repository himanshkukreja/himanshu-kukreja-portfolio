"use client";

/**
 * /dsa/progress, "Belt & badges": the learner's belt and Bits (with the ladder to Black), their mastery badges per
 * module and world, where their Bits came from, how Bits are earned, and DSA Mastery's own weekly / all-time board.
 * Everything comes from the game store in this browser (synced to the account when signed in); nothing is locked.
 */
import Link from "next/link";
import { Award, Lock } from "lucide-react";
import { useMemo } from "react";
import { useGame } from "@/game/GameProvider";
import { READY_ROUNDS, READY_SCORE, topicName, topicStats } from "@/lib/dsa/interview";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import {
  BELTS,
  BITS_TABLE,
  bitsLabel,
  badgeProgress,
  earnedBadges,
  KIND_LABEL,
  SOLVE_BITS,
  STREAK_BITS,
  type AwardKind,
  type BadgeDef,
} from "@/lib/dsa/rewards";
import DsaCrumbs from "../DsaCrumbs";
import { useDsaProgress } from "../progress/useDsaProgress";
import { useDsaBits } from "./useDsaBits";
import { BeltSwatch } from "./BeltSwatch";
import { useBadgeDefs } from "./DsaRewardsHost";
import DsaLeaderboard from "./DsaLeaderboard";

const LABEL = "font-mono text-[11px] uppercase tracking-label text-fg-3";

function BeltHero() {
  const { ready, bits, belt } = useDsaBits();
  const n = ready ? bits : 0;
  return (
    <section aria-labelledby="belt-h" className="grid gap-px border border-line bg-line lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="flex min-w-0 flex-col gap-4 bg-surface p-5 sm:p-6">
        <h2 id="belt-h" className={LABEL}>
          Your belt
        </h2>
        <div className="flex items-center gap-4">
          <BeltSwatch belt={belt.belt} size={64} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-display text-[34px] font-extrabold leading-none tracking-[-0.03em] text-fg sm:text-[40px]">{belt.belt.name} belt</span>
            <span className="font-mono text-[13px] text-signal-text">{bitsLabel(n)}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div aria-hidden className="h-2 bg-surface-2">
            <div className="h-2 bg-signal transition-[width] duration-500" style={{ width: `${belt.pct}%` }} />
          </div>
          <span className="text-[14px] text-fg-2">
            {belt.next ? (
              <>
                {belt.toNext.toLocaleString("en-US")} Bits to the <strong className="text-fg">{belt.next.name} belt</strong>.
              </>
            ) : (
              "The top belt. Every Bit from here is a bonus."
            )}
          </span>
        </div>
        <p className="m-0 text-[13px] text-fg-3">{belt.belt.line}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-3 bg-surface p-5 sm:p-6">
        <h2 className={LABEL}>The belts</h2>
        <ol className="m-0 flex list-none flex-col gap-px p-0">
          {BELTS.map((b, i) => {
            const here = i === belt.index;
            const past = i < belt.index;
            return (
              <li key={b.id} className={`flex items-center gap-3 px-2 py-1.5 ${here ? "bg-[var(--c-dsa-hl)]" : ""}`} aria-current={here ? "step" : undefined}>
                <BeltSwatch belt={b} size={26} />
                <span className={`min-w-[64px] text-[15px] ${here ? "font-semibold text-fg" : past ? "text-fg-2" : "text-fg-3"}`}>{b.name}</span>
                <span className="font-mono text-[12px] tabular-nums text-fg-3">{b.min.toLocaleString("en-US")}+</span>
                <span className="ml-auto hidden text-right text-[12.5px] text-fg-3 sm:inline">{b.line}</span>
                {past && <span className="sr-only">(reached)</span>}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function BadgeTile({ d, earned, prog }: { d: BadgeDef; earned: boolean; prog: { done: number; total: number } }) {
  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  return (
    <li
      className={`flex min-w-0 flex-col gap-2 p-3.5 ${earned ? "border-2 border-signal bg-[var(--c-dsa-hl)]" : d.ready ? "border border-line-strong bg-surface" : "border border-dashed border-line-strong bg-bg"}`}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center ${earned ? "bg-signal text-on-signal" : "bg-surface-2 text-fg-3"}`}>
          <Award className="h-4 w-4" />
        </span>
        <span className="flex min-w-0 flex-col">
          {d.code && <span className="font-mono text-[10.5px] uppercase tracking-label text-fg-3">{d.code}</span>}
          <span className="truncate text-[14.5px] font-semibold leading-tight text-fg">{d.name}</span>
        </span>
      </div>
      {earned ? (
        <span className="font-mono text-[12px] text-signal-text">Earned · +{d.bits} Bits</span>
      ) : d.ready ? (
        <>
          <div aria-hidden className="h-1.5 bg-surface-2">
            <div className="h-1.5 bg-signal" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-mono text-[11.5px] text-fg-3">
            {prog.done} of {prog.total} · +{d.bits} Bits
          </span>
        </>
      ) : (
        <span className="font-mono text-[11.5px] text-fg-3">Coming soon: still being written</span>
      )}
    </li>
  );
}

function Badges({ defs }: { defs: BadgeDef[] | null }) {
  const progress = useDsaProgress();
  const { earned, prog } = useMemo(() => (defs ? { earned: earnedBadges(defs, progress), prog: badgeProgress(defs, progress) } : { earned: new Set<string>(), prog: {} as Record<string, { done: number; total: number }> }), [defs, progress]);
  const worlds = useMemo(() => {
    const m = new Map<string, { world: BadgeDef | null; mods: BadgeDef[] }>();
    for (const d of defs || []) {
      const w = m.get(d.world) || { world: null, mods: [] };
      if (d.kind === "world") w.world = d;
      else w.mods.push(d);
      m.set(d.world, w);
    }
    return [...m.values()].filter((w) => w.mods.some((x) => x.ready) || w.world);
  }, [defs]);
  const count = earned.size;
  return (
    <section aria-labelledby="badges-h" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="badges-h" className="m-0 font-display text-[26px] font-extrabold tracking-[-0.03em] text-fg">
          Mastery badges
        </h2>
        <span className="font-mono text-[12px] text-fg-3">{defs ? `${count} earned` : "loading…"}</span>
      </div>
      <p className="m-0 max-w-[680px] text-[15px] leading-relaxed text-fg-2">
        Finish every lesson, practice problem and checkpoint in a module to earn its badge. Earn every module badge in a world for the world badge.
      </p>
      {!defs ? (
        <div aria-busy="true" aria-label="Loading badges" className="h-[140px] animate-pulse bg-surface-2" />
      ) : (
        worlds.map((w) => {
          const title = w.world?.name || "Badges";
          return (
            <div key={title} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="m-0 font-mono text-[12px] uppercase tracking-label text-fg-2">{title}</h3>
                {w.world && (
                  <span className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[11px] ${earned.has(w.world.id) ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-3"}`}>
                    {earned.has(w.world.id) ? <Award className="h-3 w-3" aria-hidden /> : <Lock className="h-3 w-3" aria-hidden />}
                    world badge · {earned.has(w.world.id) ? "earned" : `+${w.world.bits} Bits`}
                  </span>
                )}
              </div>
              <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 min-[420px]:grid-cols-2 lg:grid-cols-4">
                {w.mods.map((d) => (
                  <BadgeTile key={d.id} d={d} earned={earned.has(d.id)} prog={prog[d.id] || { done: 0, total: d.need.length }} />
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}

/** "Interview-ready" per topic: three or more interview rounds scoring 4 or better (rounds are saved with the account). */
function InterviewReady() {
  const { flags, hydrated } = useGame();
  const stats = useMemo(() => topicStats(hydrated ? flags : {}), [flags, hydrated]);
  return (
    <section aria-labelledby="iv-h" className="flex min-w-0 flex-col gap-3">
      <h2 id="iv-h" className={LABEL}>
        Interview-ready
      </h2>
      {!stats.length ? (
        <p className="m-0 border border-dashed border-line-strong px-4 py-4 text-[14px] text-fg-2">
          Finish interview rounds in a problem&apos;s Interview tab. A topic becomes Interview-ready after {READY_ROUNDS} rounds scoring {READY_SCORE} or more.
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <li key={s.topic} className={`flex min-w-0 flex-col gap-1.5 border p-3 ${s.ready ? "border-signal bg-surface" : "border-line bg-surface"}`}>
              <span className="break-words text-[14.5px] font-semibold text-fg">{topicName(s.topic)}</span>
              <span className={`inline-flex items-center gap-1.5 self-start font-mono text-[11px] ${s.ready ? "border border-signal bg-signal px-1.5 py-0.5 text-on-signal" : "text-fg-3"}`}>
                {s.ready ? <Award className="h-3 w-3" aria-hidden /> : null}
                {s.ready ? "Interview-ready" : `${Math.min(s.strong, READY_ROUNDS)} of ${READY_ROUNDS} strong rounds`}
              </span>
              <span className="font-mono text-[11.5px] text-fg-3">
                {s.rounds} round{s.rounds === 1 ? "" : "s"} played
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const KIND_ORDER: AwardKind[] = ["solve", "daily", "streak", "beat", "lesson", "check", "quiz", "trace", "lab", "lecture", "explain", "interview", "revise", "review", "badge", "welcome"];

function Breakdown() {
  const { ready, bits, byKind } = useDsaBits();
  const rows = KIND_ORDER.filter((k) => (byKind[k] || 0) > 0);
  return (
    <section aria-labelledby="from-h" className="flex min-w-0 flex-col gap-3 border border-line bg-surface p-5 sm:p-6">
      <h2 id="from-h" className={LABEL}>
        Where your Bits came from
      </h2>
      {!ready ? (
        <div aria-busy="true" className="h-[80px] animate-pulse bg-surface-2" />
      ) : !rows.length ? (
        <p className="m-0 text-[15px] text-fg-2">
          Nothing yet. <Link href="/dsa" className="text-signal-text underline decoration-line-strong underline-offset-4">Start a lesson</Link> or{" "}
          <Link href="/dsa/daily" className="text-signal-text underline decoration-line-strong underline-offset-4">solve today&apos;s problem</Link> to earn your first Bits.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((k) => {
            const v = byKind[k] || 0;
            return (
              <li key={k} className="flex flex-col gap-1">
                <span className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span className="text-fg-2">{KIND_LABEL[k]}</span>
                  <span className="font-mono tabular-nums text-fg">{v.toLocaleString("en-US")}</span>
                </span>
                <span aria-hidden className="h-1 bg-surface-2">
                  <span className="block h-1 bg-signal" style={{ width: `${bits ? Math.max(2, Math.round((v / bits) * 100)) : 0}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function HowToEarn() {
  const rows: [string, string][] = [
    ["Solve a problem (Easy · Medium · Hard)", `${SOLVE_BITS.easy.base} · ${SOLVE_BITS.medium.base} · ${SOLVE_BITS.hard.base}`],
    ["…on your first submit", `+${SOLVE_BITS.easy.firstTry} · +${SOLVE_BITS.medium.firstTry} · +${SOLVE_BITS.hard.firstTry}`],
    ["…without opening a hint", `+${SOLVE_BITS.easy.noHints} · +${SOLVE_BITS.medium.noHints} · +${SOLVE_BITS.hard.noHints}`],
    ["…after opening the editorial", "a quarter of the base"],
    ["Read a lesson beat · finish the lesson", `${BITS_TABLE.beat} · ${BITS_TABLE.lesson}`],
    ["Pass a checkpoint quiz", `${BITS_TABLE.checkpointQuiz}`],
    ["Pass a build-it lab", `${BITS_TABLE.lab}`],
    ["Watch a lecture to the end", `${BITS_TABLE.lecture}`],
    ["Quick check right first time · dry run", `${BITS_TABLE.quickCheck} · ${BITS_TABLE.dryRun}`],
    ["Explain it back (partly · solid)", `${BITS_TABLE.explainPartial} · ${BITS_TABLE.explainSolid}`],
    ["Finish an interview round (scored 4+)", `${BITS_TABLE.interviewRound} (${BITS_TABLE.interviewRound + BITS_TABLE.interviewStrong})`],
    ["Today's daily problem", `+${BITS_TABLE.daily}`],
    ["Daily streak of " + STREAK_BITS.map((s) => s.days).join(", ") + " days", STREAK_BITS.map((s) => s.bits).join(", ")],
    ["Module badge · world badge", `${BITS_TABLE.moduleBadge} · ${BITS_TABLE.worldBadge}`],
  ];
  return (
    <section aria-labelledby="earn-h" className="flex min-w-0 flex-col gap-3 border border-line bg-surface p-5 sm:p-6">
      <h2 id="earn-h" className={LABEL}>
        How to earn Bits
      </h2>
      <dl className="m-0 flex flex-col gap-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 text-[14px] last:border-0">
            <dt className="min-w-0 text-fg-2">{k}</dt>
            <dd className="m-0 shrink-0 text-right font-mono text-[12.5px] tabular-nums text-fg">{v}</dd>
          </div>
        ))}
      </dl>
      <details className="text-[12.5px] text-fg-3">
        <summary className="cursor-pointer font-mono text-[12px]">Small print</summary>
        <p className="m-0 mt-2 leading-relaxed">
          Only Accepted solves count, once per problem. Every award counts once, however often you repeat it. Belts show progress only: nothing in DSA Mastery is ever locked. Bits are separate from System Design Mastery&apos;s XP.
        </p>
      </details>
    </section>
  );
}

export default function DsaBeltBadges({ defs: initial }: { defs: BadgeDef[] | null }) {
  const defs = useBadgeDefs(initial);
  const { user, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1100px] flex-col gap-8 px-4 pb-24 pt-8 sm:px-6">
        <header className="flex flex-col gap-2">
          <DsaCrumbs items={[{ href: "/dsa", label: "DSA Mastery" }, { label: "Belt & badges" }]} />
          <h1 className="m-0 font-display text-[36px] font-extrabold leading-none tracking-[-0.03em] text-fg sm:text-[48px]">
            Belt &amp; badges<span className="text-signal-text">.</span>
          </h1>
          <p className="m-0 max-w-[680px] text-[16px] leading-relaxed text-fg-2">
            Every lesson, problem and daily solve earns Bits. Bits move you up the belts, from White to Black. Belts show how far you have come; they never lock anything.
          </p>
          {!loading && !user && (
            <p className="m-0 text-[14px] text-fg-3">
              Your Bits are saved in this browser.{" "}
              <button type="button" onClick={openAuthModal} className="text-signal-text underline decoration-line-strong underline-offset-4">
                Sign in free
              </button>{" "}
              to keep them on every device and appear on the leaderboard.
            </p>
          )}
        </header>
        <BeltHero />
        <Badges defs={defs} />
        <InterviewReady />
        <div className="grid gap-6 lg:grid-cols-2">
          <Breakdown />
          <HowToEarn />
        </div>
        <DsaLeaderboard />
      </main>
    </div>
  );
}
