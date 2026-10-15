"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import { Dot, Prompt, container, h2Class } from "./ui";
import {
  ADMIT_DEFAULT,
  ADMIT_MAX,
  ADMIT_MIN,
  ADMIT_STEP,
  BOT_TELLS,
  FRESH_RUN,
  PHASES,
  PHASE_SEC,
  SEATS,
  SHIELDS,
  SHIELD_BY_ID,
  SLO_MS,
  WIN_SCORE,
  isOver,
  makeScenario,
  playPhase,
  scoreRun,
  telemetry,
  type RunState,
  type Scenario,
  type ShieldId,
} from "./tatkal-engine";

/** First scenario is fixed so server and client render the same telemetry; every retry rolls a new one. */
const FIRST_SEED = 20260805;
const SUB_STEPS = 5;
const SUB_MS = 190;

const statLabel = "font-mono text-[10px] uppercase tracking-label text-fg-3 sm:text-[11px]";
const statValue = "font-mono text-lg font-semibold tabular-nums sm:text-[22px]";

function clock(sec: number) {
  return `10:00:${String(Math.min(59, Math.max(0, Math.floor(sec)))).padStart(2, "0")}`;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function TatkalRush() {
  const { award } = useGame();
  const [scen, setScen] = useState<Scenario>(() => makeScenario(FIRST_SEED));
  const [run, setRun] = useState<RunState>(FRESH_RUN);
  const [admit, setAdmit] = useState(ADMIT_DEFAULT);
  const [shield, setShield] = useState<ShieldId>("none");
  const [sub, setSub] = useState(-1); // sub-step of the phase being played (-1: idle)
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(timer.current), []);

  const over = isOver(run);
  const playing = sub >= 0;
  const tel = over ? null : telemetry(scen, run);
  const score = scoreRun(run);
  const last = run.results[run.results.length - 1];
  const seatsToHumans = Math.round(run.results.reduce((a, r) => a + r.toHumans, 0));
  const seatsToBots = Math.round(run.results.reduce((a, r) => a + r.toBots, 0));
  const t = playing ? run.phase * PHASE_SEC + (sub * PHASE_SEC) / SUB_STEPS : run.soldAt ?? run.phase * PHASE_SEC;

  const finish = (next: RunState) => {
    const res = scoreRun(next);
    track("play", { game: "tatkal-rush", result: res.win ? "win" : "loss", score: res.total });
    if (res.win) award("rush", "Rush survivor · badge unlocked");
  };

  const go = () => {
    if (playing || over) return;
    const next = playPhase(scen, run, { admit, shield });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setRun(next);
      if (isOver(next)) finish(next);
      return;
    }
    let k = 0;
    setSub(0);
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      k += 1;
      if (k < SUB_STEPS) {
        setSub(k);
        return;
      }
      window.clearInterval(timer.current);
      setSub(-1);
      setRun(next);
      if (isOver(next)) finish(next);
    }, SUB_MS);
  };

  const retry = () => {
    window.clearInterval(timer.current);
    setSub(-1);
    setScen(makeScenario(Math.floor(Math.random() * 2 ** 31)));
    setRun(FRESH_RUN);
    setAdmit(ADMIT_DEFAULT);
    setShield("none");
  };

  const nudge = (d: number) => setAdmit((a) => Math.max(ADMIT_MIN, Math.min(ADMIT_MAX, a + d)));

  return (
    <div id="rush" className="min-w-0 flex-[1_1_540px] scroll-mt-24 border border-line-strong bg-surface">
      {/* Title bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5 font-mono text-[11px] uppercase tracking-label sm:px-[18px] sm:py-3.5 sm:text-xs">
        <span className="font-semibold text-signal-text">./tatkal-rush</span>
        <span className="tabular-nums text-fg" aria-live="off">
          {clock(t)} IST
        </span>
        <span className="text-fg-3">
          phase {Math.min(run.phase + (over ? 0 : 1), PHASES)}/{PHASES}
        </span>
      </div>

      <div className="flex flex-col gap-4 p-3 sm:p-[18px]">
        {/* Scoreboard */}
        <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
          <Stat label="seats_left" value={Math.round(run.left)} />
          <Stat label="to travellers" value={seatsToHumans} />
          <Stat label="to bots" value={seatsToBots} bad={seatsToBots > 0} />
          <Stat label={`score · win ≥ ${WIN_SCORE}`} value={run.results.length ? score.total : "—"} bad={run.results.length > 0 && score.total < 0} />
        </div>

        {/* Six phases of the window */}
        <ol className="m-0 grid list-none grid-cols-6 gap-1 p-0" aria-label="The 60-second window, phase by phase">
          {Array.from({ length: PHASES }, (_, i) => {
            const r = run.results[i];
            const cur = i === run.phase && !over;
            const fill = cur && playing ? (sub + 1) / SUB_STEPS : 0;
            const sold = r ? r.toHumans + r.toBots : 0;
            const h = r ? Math.min(100, (sold / 160) * 100) : 0;
            const botH = r && sold ? (r.toBots / sold) * h : 0;
            return (
              <li key={i} className="flex min-w-0 flex-col gap-1">
                <span
                  className={`relative flex h-16 flex-col justify-end overflow-hidden border sm:h-20 ${cur ? "border-signal" : "border-line"} bg-bg`}
                  aria-label={
                    r
                      ? `${clock(i * PHASE_SEC)}: ${Math.round(r.toHumans)} seats to travellers, ${Math.round(r.toBots)} to bots, p99 ${r.p99} ms${r.meltdown ? ", database meltdown" : ""}`
                      : `${clock(i * PHASE_SEC)}: not played`
                  }
                  role="img"
                >
                  {cur && playing && <span aria-hidden className="absolute inset-y-0 left-0 bg-signal/15" style={{ width: `${fill * 100}%` }} />}
                  {r && (
                    <>
                      <span aria-hidden className="block bg-bad" style={{ height: `${botH}%` }} />
                      <span aria-hidden className="block bg-fg" style={{ height: `${h - botH}%` }} />
                    </>
                  )}
                  {r && (r.meltdown || r.p99 > SLO_MS) && (
                    <span aria-hidden className="absolute left-0.5 top-0.5 bg-bad px-1 font-mono text-[9px] font-semibold text-[#000]">
                      {r.meltdown ? "DB✗" : "SLOW"}
                    </span>
                  )}
                </span>
                <span className={`truncate text-center font-mono text-[9.5px] sm:text-[10.5px] ${cur ? "text-signal-text" : "text-fg-3"}`}>
                  :{String(i * PHASE_SEC).padStart(2, "0")}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Last phase, in one line */}
        <div aria-live="polite" className="-my-1.5">
          {last && !over && (
            <p className="m-0 font-mono text-[12px] leading-relaxed text-fg-2">
              last 10 s: <span className="text-fg">{Math.round(last.toHumans)}</span> seats to travellers ·{" "}
              <span className={last.toBots >= 1 ? "text-bad-text" : ""}>{Math.round(last.toBots)} to bots</span> · {Math.round(last.blocked)} blocked ·{" "}
              <span className={last.errors >= 1 ? "text-bad-text" : ""}>{Math.round(last.errors)} × 503</span> · DB load {pct(last.load)} · p99{" "}
              <span className={last.p99 > SLO_MS ? "text-bad-text" : ""}>{last.p99} ms</span>
              {last.meltdown && <span className="font-semibold text-bad-text"> · DATABASE MELTDOWN: capacity crashes next phase</span>}
            </p>
          )}
        </div>

        {!over && tel && (
          <>
            {/* Door telemetry for the coming phase */}
            <div className="flex flex-col gap-2.5 border border-line bg-bg p-3 sm:p-3.5">
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
                door telemetry · {clock(run.phase * PHASE_SEC)} → {clock((run.phase + 1) * PHASE_SEC)}
              </span>
              <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2 text-[13px] text-fg-2">
                    suspicious sessions <span className={`font-mono text-[15px] font-semibold ${tel.share >= 0.3 ? "text-bad-text" : "text-fg"}`}>{pct(tel.share)}</span>
                  </span>
                  <span aria-hidden className="h-1.5 bg-surface-2">
                    <span className={`block h-full ${tel.share >= 0.3 ? "bg-bad" : "bg-fg-3"}`} style={{ width: pct(tel.share) }} />
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2 text-[13px] text-fg-2">
                    booking capacity{" "}
                    <span className={`font-mono text-[15px] font-semibold ${tel.capPerSec < 14 ? "text-bad-text" : "text-fg"}`}>≈ {tel.capPerSec}/s</span>
                  </span>
                  <span aria-hidden className="h-1.5 bg-surface-2">
                    <span className={`block h-full ${tel.capPerSec < 14 ? "bg-bad" : "bg-fg-3"}`} style={{ width: `${Math.min(100, (tel.capPerSec / 16) * 100)}%` }} />
                  </span>
                </div>
              </div>
              <p className="m-0 text-[13.5px] leading-snug text-fg-2">
                <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">tells · </span>
                {tel.share < 0.2 ? `mostly real travellers; the few bots show ${BOT_TELLS[tel.kind]}` : BOT_TELLS[tel.kind]}.
                {run.meltNext ? " The database is recovering from a meltdown." : tel.storm ? " Refresh storm: everyone is hammering “check availability”." : ""}
              </p>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-bg px-3 py-2.5 sm:px-3.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-mono text-sm font-semibold">
                  admit <span className="text-signal-text">{admit}</span>/s from the waiting room
                </span>
                <span className="text-[12.5px] leading-snug text-fg-3">Counts bots too. Shielded bots never reach booking; the rest eat capacity.</span>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => nudge(-ADMIT_STEP)}
                  disabled={playing || admit <= ADMIT_MIN}
                  aria-label="Admit fewer people per second"
                  className="h-11 w-11 border border-line-strong text-xl text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => nudge(ADMIT_STEP)}
                  disabled={playing || admit >= ADMIT_MAX}
                  aria-label="Admit more people per second"
                  className="h-11 w-11 border border-line-strong text-xl text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  +
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:gap-2" role="radiogroup" aria-label="Bot shield for this phase">
              {SHIELDS.map((s) => {
                const on = shield === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setShield(s.id)}
                    disabled={playing}
                    className={`flex min-h-11 flex-col items-start gap-1 px-3 py-2.5 text-left font-sans disabled:cursor-not-allowed sm:min-h-[84px] sm:p-3 ${
                      on ? "border border-signal bg-signal text-on-signal" : "border border-line-strong bg-bg text-fg hover:bg-surface-2"
                    }`}
                  >
                    <span className="font-mono text-xs font-semibold sm:text-[13px]">{s.name}</span>
                    <span className="text-[12px] leading-snug opacity-85 sm:text-[12.5px]">{s.what}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={go}
              disabled={playing}
              className="min-h-[52px] w-full bg-signal px-6 font-mono text-[15px] font-semibold text-on-signal hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:self-start"
            >
              {playing ? "running…" : `▶ run ${clock(run.phase * PHASE_SEC)} → :${String((run.phase + 1) * PHASE_SEC).padStart(2, "0")}`}
            </button>
          </>
        )}

        {over && (
          <div aria-live="polite" className={`flex animate-hk-in flex-col gap-3 p-4 sm:p-[18px] ${score.win ? "bg-signal text-on-signal" : "border border-bad bg-bg text-fg"}`}>
            <span className="font-mono text-xs uppercase tracking-label">
              {score.win ? "exit 0 · +150 XP · Rush survivor" : score.meltdowns ? "incident · SEV-1" : "exit 1 · not cleared"}
            </span>
            <span className="font-display text-[22px] font-bold leading-[1.1] tracking-[-0.02em] sm:text-[26px]">
              {score.win
                ? `Score ${score.total}. ${seatsToHumans} of ${SEATS} seats went to real travellers.`
                : score.meltdowns
                  ? `The database melted. Score ${score.total}.`
                  : `Score ${score.total}. You need ${WIN_SCORE}.`}
            </span>
            <table className="w-full border-collapse font-mono text-[12px] sm:text-[13px]">
              <tbody>
                {score.lines.map((l) => (
                  <tr key={l.label} className={`border-t ${score.win ? "border-on-signal/25" : "border-line"}`}>
                    <td className="py-1 pr-2">{l.label}</td>
                    <td className="py-1 pr-2 text-right opacity-80">{l.value}</td>
                    <td className="py-1 text-right font-semibold tabular-nums">{l.pts > 0 ? `+${l.pts}` : l.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <span className="text-[14.5px] leading-normal">{verdict(run, score.win)}</span>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={retry}
                className={`min-h-12 px-5 font-mono text-sm font-semibold ${score.win ? "bg-on-signal text-signal" : "bg-signal text-on-signal hover:brightness-110"}`}
              >
                ./tatkal-rush --new-morning
              </button>
              <Link
                href="/stories/irctc-tatkal-500-seats-2-million-users"
                className={`text-[14.5px] font-semibold underline ${score.win ? "text-on-signal" : "text-signal-text"}`}
              >
                How IRCTC actually does it →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: number | string; bad?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-bg px-2.5 py-2 sm:px-3.5 sm:py-3">
      <span className={`${statLabel} truncate`}>{label}</span>
      <span className={`${statValue} ${bad ? "text-bad-text" : "text-fg"}`}>{value}</span>
    </div>
  );
}

/** One line of post-mortem: the biggest thing that went wrong (or right). */
function verdict(run: RunState, win: boolean): string {
  const rs = run.results;
  const wrongShield = rs.find((r) => r.share >= 0.3 && SHIELD_BY_ID[r.shield].block[r.kind] < 0.9);
  const otpWasted = rs.find((r) => r.shield === "otp" && (r.share < 0.3 || r.kind !== "farm"));
  if (rs.some((r) => r.meltdown)) return "You admitted faster than booking could take. Watch the capacity reading: when a refresh storm halves it, the door has to slow down too.";
  if (wrongShield)
    return `A ${wrongShield.kind === "script" ? "script" : wrongShield.kind === "headless" ? "headless-browser" : "device-farm"} wave walked through your ${SHIELD_BY_ID[wrongShield.shield].name}. Each shield fits one kind of bot: read the tells.`;
  if (otpWasted) return "The OTP wall stops nearly everything, including 10% of real travellers and your p99. Save it for device farms, the one thing nothing cheaper catches.";
  if (rs.some((r) => r.errors >= 20)) return "Travellers got 503s: you let more people in than booking could serve. A waiting room only works if it admits at the rate the system can take.";
  if (run.soldAt === null) return "Nothing broke, but the window closed with seats unsold. Bots you block never reach booking, so during a wave you can admit faster.";
  return win
    ? "A waiting room that breathes with capacity, the cheapest shield that fits the bots in front of you, and one atomic counter for the seats. That is the shape of the real thing."
    : "Close. Admit right up to what booking can take, and pick the cheapest shield that stops the bots you can see.";
}

/** Home section: the boss fight, with room to breathe instead of squeezed beside the hero. */
export function RushSection() {
  const { done, hydrated } = useGame();
  const won = hydrated && !!done.rush;
  return (
    <section aria-labelledby="rush-h">
      <div className={`${container} grid items-start gap-8 pb-14 pt-14 sm:pb-20 sm:pt-[88px] lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-12`}>
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24">
          <Prompt>./tatkal-rush</Prompt>
          <h2 id="rush-h" className={h2Class}>
            Your turn: run the front door
            <Dot />
          </h2>
          <p className="m-0 text-base leading-relaxed text-fg-2 sm:text-[17px]">
            10:00 IST. Two million people and a few hundred thousand bots want 500 train seats. Every 10 seconds you read the door
            telemetry, set how fast the waiting room admits people, and pick one bot shield. Seats go out through one atomic
            counter, so nothing sells twice; the question is who gets them.
          </p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 font-mono text-[13px] leading-relaxed text-fg-3">
            <li>
              <span className="text-signal-text">score</span> · +1 per seat to a traveller, −2 per seat to a bot, −2 per traveller wrongly blocked,
              −½ per 503, −40 per phase over {SLO_MS} ms p99, −150 per meltdown, +6 per second sold out early
            </li>
            <li>
              <span className="text-signal-text">win</span> · {WIN_SCORE}+ points and the database never melts. Every morning is different.
            </li>
            <li>
              <span className="text-signal-text">loot</span> · +150 XP and the Rush survivor badge
            </li>
            <li>
              <span className="text-signal-text">status</span> · {won ? "cleared ✓" : "not cleared yet"}
            </li>
          </ul>
          <Link href="/stories/irctc-tatkal-500-seats-2-million-users" className="font-mono text-sm text-signal-text underline underline-offset-4">
            Spoilers: how IRCTC actually does it →
          </Link>
        </div>
        <TatkalRush />
      </div>
    </section>
  );
}
