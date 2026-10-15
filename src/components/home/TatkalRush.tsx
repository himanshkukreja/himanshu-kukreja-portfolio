"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { Dot, Prompt, container, h2Class } from "./ui";

type ToggleKey = "cache" | "queue" | "limiter" | "lock";

type Config = { reps: number } & Record<ToggleKey, boolean>;

type Phase = "build" | "running" | "done";

type Sim = {
  phase: Phase;
  t: number;
  sold: number;
  dbl: number;
  total: number;
  dropped: number;
  p99: number;
  maxP99: number;
  rps: number;
  hist: number[];
};

const BUDGET = 100;
const REPLICA_COST = 15;
const MAX_REPLICAS = 6;
const TICK_MS = 260;
const SLO_MS = 500;

const COMPONENTS: { key: ToggleKey; name: string; desc: string; cost: number }[] = [
  { key: "cache", name: "redis.cache", desc: "Serve seat availability from memory, not the DB.", cost: 20 },
  { key: "queue", name: "waiting_room", desc: "Queue the surge instead of answering with 503s.", cost: 20 },
  { key: "limiter", name: "rate_limiter", desc: "Token bucket per user: thins out bots and refresh-spam.", cost: 15 },
  { key: "lock", name: "seat_lock", desc: "Atomic hold per seat before payment, released after 5 min.", cost: 10 },
];

const FRESH: Sim = { phase: "build", t: 0, sold: 0, dbl: 0, total: 0, dropped: 0, p99: 0, maxP99: 0, rps: 0, hist: [] };

function spent(c: Config) {
  return (c.reps - 1) * REPLICA_COST + COMPONENTS.reduce((sum, x) => sum + (c[x.key] ? x.cost : 0), 0);
}

/** One 2-second step of the 60-second window. Pure: same input, same output. */
function tick(s: Sim, c: Config): Sim {
  const t = s.t + 2;
  const demand = t < 12 ? 120000 + 8000 * t : 216000 * Math.exp(-(t - 12) / 10);
  const eff = demand * (c.limiter ? 0.55 : 1);
  const cap = c.reps * 20000 * (c.cache ? 2.5 : 1);
  const load = eff / cap;
  let drop = 0;
  let p99: number;
  if (c.queue) {
    p99 = 150 + 120 * Math.max(0, load - 0.7);
    if (load > 4) drop = 1 - 4 / load;
  } else {
    p99 = load <= 1 ? 110 + 150 * load : 260 + 1100 * (load - 1);
    drop = load > 1 ? 1 - 1 / load : 0;
  }
  p99 = Math.min(4000, Math.round(p99));
  const sell = Math.min(500 - s.sold, Math.round(70 * (1 - drop)));
  const dbl = c.lock || sell <= 0 ? 0 : Math.max(1, Math.round(sell * 0.05 * Math.min(load, 3)));
  return {
    phase: t >= 60 ? "done" : "running",
    t,
    rps: eff,
    p99,
    maxP99: Math.max(s.maxP99, p99),
    sold: s.sold + sell,
    dbl: s.dbl + dbl,
    total: s.total + eff * 2,
    dropped: s.dropped + eff * 2 * drop,
    hist: [...s.hist, p99].slice(-30),
  };
}

function dropRate(s: Sim) {
  return s.total ? s.dropped / s.total : 0;
}

function passed(s: Sim) {
  return s.dbl === 0 && dropRate(s) < 0.02 && s.maxP99 <= SLO_MS;
}

function fmt(n: number) {
  return n >= 1000000 ? (n / 1000000).toFixed(1) + "M" : n >= 1000 ? Math.round(n / 1000) + "k" : String(Math.round(n));
}

function result(s: Sim) {
  const rate = dropRate(s);
  if (s.dbl > 0)
    return {
      pass: false,
      tag: "incident · SEV-1",
      title: `${s.dbl} seats sold twice.`,
      body: "Concurrent checkouts raced on the same row. An atomic hold per seat is the one thing you can never skip.",
    };
  if (rate >= 0.02)
    return {
      pass: false,
      tag: "incident · SEV-2",
      title: `${Math.round(rate * 100)}% of users got a 503.`,
      body: "The fleet fell over around 10:00:10. Put a waiting room in front of the surge, or buy headroom with a cache.",
    };
  if (s.maxP99 > SLO_MS)
    return {
      pass: false,
      tag: "degraded",
      title: `Correct, but p99 hit ${s.maxP99} ms.`,
      body: "Cache seat availability or let the rate limiter thin out the bots.",
    };
  return {
    pass: true,
    tag: "exit 0 · +150 XP",
    title: `500 seats. Zero double bookings. p99 ${s.maxP99} ms.`,
    body: "That is the shape of the real thing: a waiting room, a token bucket for bots, and an atomic hold on every seat.",
  };
}

const statLabel = "font-mono text-[10px] uppercase tracking-label text-fg-3 sm:text-[11px]";
const statValue = "font-mono text-xl font-semibold sm:text-[26px]";

export default function TatkalRush() {
  const { award } = useGame();
  const [config, setConfig] = useState<Config>({ reps: 1, cache: false, queue: false, limiter: false, lock: false });
  const [sim, setSim] = useState<Sim>(FRESH);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(timer.current), []);

  const running = sim.phase === "running";
  const done = sim.phase === "done";
  const used = spent(config);
  const left = BUDGET - used;

  // Changing the stack after a run puts the board back into build mode (last run's bars stay for comparison).
  const edit = (next: Config) => {
    if (running) return;
    setConfig(next);
    if (done) setSim((s) => ({ ...FRESH, hist: s.hist }));
  };

  const toggle = (key: ToggleKey) => {
    const next = { ...config, [key]: !config[key] };
    if (!config[key] && spent(next) > BUDGET) return;
    edit(next);
  };

  const repUpOff = running || config.reps >= MAX_REPLICAS || used + REPLICA_COST > BUDGET;
  const repDownOff = running || config.reps <= 1;

  const start = () => {
    window.clearInterval(timer.current);
    const cfg = config;
    let cur: Sim = { ...FRESH, phase: "running" };
    setSim(cur);
    timer.current = window.setInterval(() => {
      cur = tick(cur, cfg);
      setSim(cur);
      if (cur.phase === "done") {
        window.clearInterval(timer.current);
        if (passed(cur)) award("rush", "Rush survivor · badge unlocked");
      }
    }, TICK_MS);
  };

  const res = done ? result(sim) : null;
  const build = sim.phase === "build";
  const bad = (on: boolean) => (on ? "text-bad-text" : "text-fg");

  return (
    <div id="rush" className="min-w-0 flex-[1_1_540px] scroll-mt-24 border border-line-strong bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5 font-mono text-[11px] uppercase tracking-label sm:px-[18px] sm:py-3.5 sm:text-xs">
        <span className="font-semibold text-signal-text">./tatkal-rush</span>
        <span className="text-fg-3" aria-live="off">
          10:00:{String(Math.min(sim.t, 59)).padStart(2, "0")} IST
        </span>
        <span className="text-fg-3">
          budget <span className="text-fg">{left}</span>/{BUDGET} cr
        </span>
      </div>

      <div className="flex flex-col gap-4 p-3 sm:p-[18px]">
        <p className="m-0 text-[15px] leading-normal text-fg-2">
          2,000,000 users. 500 seats. Window opens at 10:00. Provision the stack, hit run, survive 60 seconds without selling a
          seat twice.
        </p>

        <div className="grid grid-cols-3 gap-px border border-line bg-line sm:grid-cols-[repeat(auto-fit,minmax(min(110px,100%),1fr))]">
          <div className="flex flex-col gap-1 bg-bg px-2.5 py-2.5 sm:px-3.5 sm:py-3">
            <span className={statLabel}>seats_left</span>
            <span className={`${statValue} text-fg`}>{500 - sim.sold}</span>
          </div>
          <div className="flex flex-col gap-1 bg-bg px-2.5 py-2.5 sm:px-3.5 sm:py-3">
            <span className={statLabel}>p99</span>
            <span className={`${statValue} ${bad(sim.p99 > SLO_MS)}`}>{build ? "—" : `${sim.p99}ms`}</span>
          </div>
          <div className="hidden flex-col gap-1 bg-bg px-3.5 py-3 sm:flex">
            <span className={statLabel}>req/s</span>
            <span className={`${statValue} text-fg`}>{build ? "—" : fmt(sim.rps)}</span>
          </div>
          <div className="hidden flex-col gap-1 bg-bg px-3.5 py-3 sm:flex">
            <span className={statLabel}>http_503</span>
            <span className={`${statValue} ${bad(sim.dropped > 0)}`}>{fmt(sim.dropped)}</span>
          </div>
          <div className="flex flex-col gap-1 bg-bg px-2.5 py-2.5 sm:px-3.5 sm:py-3">
            <span className={statLabel}>double_booked</span>
            <span className={`${statValue} ${bad(sim.dbl > 0)}`}>{sim.dbl}</span>
          </div>
        </div>

        <div
          className="relative flex h-28 items-end gap-[3px] border border-line bg-bg px-2.5 pt-2.5"
          role="img"
          aria-label={
            sim.hist.length
              ? `p99 latency over the 60-second window, peak ${Math.max(...sim.hist)} ms against a 500 ms SLO`
              : "p99 latency over the 60-second window, not run yet"
          }
        >
          <span aria-hidden className="absolute inset-x-0 bottom-[12.5%] border-t border-dashed border-fg-4" />
          <span aria-hidden className="absolute bottom-[calc(12.5%+4px)] right-2 font-mono text-[10px] text-fg-3">
            SLO 500ms
          </span>
          {Array.from({ length: 30 }, (_, k) => {
            const v = sim.hist[k];
            const h = v ? Math.max(4, Math.min(100, v / 40)) : 2;
            return (
              <span
                key={k}
                aria-hidden
                className={`flex-1 ${v ? (v > SLO_MS ? "bg-bad" : "bg-fg") : "bg-surface-2"}`}
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-bg px-3.5 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-sm font-semibold">replicas: {config.reps}</span>
            <span className="text-[13px] text-fg-3">20k req/s each behind the LB · 15 cr per extra</span>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => edit({ ...config, reps: config.reps - 1 })}
              disabled={repDownOff}
              aria-label="Remove a replica"
              className="h-11 w-11 border border-line-strong text-xl text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => edit({ ...config, reps: config.reps + 1 })}
              disabled={repUpOff}
              aria-label="Add a replica"
              className="h-11 w-11 border border-line-strong text-xl text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45"
            >
              +
            </button>
          </div>
        </div>

        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] sm:gap-2 sm:overflow-visible sm:px-0 sm:pb-0">
          {COMPONENTS.map((c) => {
            const on = config[c.key];
            const can = on || used + c.cost <= BUDGET;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => toggle(c.key)}
                disabled={running || !can}
                aria-pressed={on}
                className={`flex min-h-11 shrink-0 flex-col items-start gap-1.5 px-3 py-2.5 text-left font-sans disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-[92px] sm:p-3.5 ${
                  on ? "border border-signal bg-signal text-on-signal" : "border border-line-strong bg-bg text-fg hover:bg-surface-2"
                }`}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold sm:text-sm">{c.name}</span>
                  <span className={`whitespace-nowrap font-mono text-xs ${on ? "font-semibold text-on-signal" : "text-fg-3"}`}>
                    {on ? `ON · ${c.cost} cr` : `${c.cost} cr`}
                  </span>
                </span>
                <span className="hidden text-[13px] leading-snug opacity-85 sm:block">{c.desc}</span>
              </button>
            );
          })}
        </div>

        <div aria-live="polite">
          {res && (
            <div
              className={`flex animate-hk-in flex-col gap-2 p-[18px] ${
                res.pass ? "bg-signal text-on-signal" : "border border-bad bg-bg text-fg"
              }`}
            >
              <span className="font-mono text-xs uppercase tracking-label">{res.tag}</span>
              <span className="font-display text-[22px] font-bold leading-[1.1] tracking-[-0.02em] sm:text-[26px]">{res.title}</span>
              <span className="text-[15px] leading-normal">{res.body}</span>
              <Link
                href="/stories/irctc-tatkal-500-seats-2-million-users"
                className={`text-[15px] font-semibold underline ${res.pass ? "text-on-signal" : "text-signal-text"}`}
              >
                Read how IRCTC actually does it →
              </Link>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={start}
            disabled={running}
            className="min-h-[52px] w-full bg-signal px-6 font-mono text-[15px] font-semibold text-on-signal hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
          >
            {running ? "running…" : done ? "./tatkal-rush --retry" : "./tatkal-rush --start"}
          </button>
          <span className="text-[13px] text-fg-3">Zero double bookings: +150 XP and the Rush survivor badge.</span>
        </div>
      </div>
    </div>
  );
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
            Your turn: survive the rush
            <Dot />
          </h2>
          <p className="m-0 text-base leading-relaxed text-fg-2 sm:text-[17px]">
            10:00 IST. Two million people want 500 train seats. You get 100 credits and 60 seconds. Sell every seat without
            selling one twice.
          </p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 font-mono text-[13px] text-fg-3">
            <li>
              <span className="text-signal-text">win</span> · zero double bookings, under 2% errors, p99 ≤ 500 ms
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
