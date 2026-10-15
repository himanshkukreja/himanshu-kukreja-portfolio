// Tatkal Rush: a pure, turn-based model of the 10:00:00 front door. No React, no DOM.
//
// The window is 60 seconds, played as six 10-second phases. Before each phase the operator reads the door
// telemetry (who is at the door, what booking capacity looks like) and sets two things:
//   · admission rate: people per second let out of the waiting room into booking (bots included)
//   · one bot shield: none / rate limit / behaviour check / OTP wall
// Every shield is right for one kind of bot and wrong (or too expensive) for the others, and admitting faster than
// booking can take melts the database. There is no setting that is safe for every phase: the scenario is random.
//
// Seats are taken with an atomic decrement on one counter (the case file's "bouncer"), so double booking is
// impossible by construction; the game is about who gets the 500 seats, how fast, and at what cost.

export const PHASES = 6;
export const PHASE_SEC = 10;
export const SEATS = 500;
/** Healthy booking capacity, bookings per second. */
export const CAPACITY = 16;
export const SLO_MS = 800;
export const ADMIT_MIN = 6;
export const ADMIT_MAX = 30;
export const ADMIT_STEP = 2;
export const ADMIT_DEFAULT = 10;
/** Score needed to clear the rush (and no meltdown). Tuned so a static setting almost never clears it. */
export const WIN_SCORE = 340;

export type BotKind = "script" | "headless" | "farm";
export type ShieldId = "none" | "limit" | "behave" | "otp";

export type Shield = {
  id: ShieldId;
  name: string;
  what: string;
  /** Share of each bot kind it stops. */
  block: Record<BotKind, number>;
  /** Share of real travellers it stops (false positives, or people who give up). */
  human: number;
  /** Added p99 for travellers who get through. */
  ms: number;
};

export const SHIELDS: Shield[] = [
  { id: "none", name: "no shield", what: "Free. Every bot walks in.", block: { script: 0, headless: 0, farm: 0 }, human: 0, ms: 0 },
  {
    id: "limit",
    name: "rate limit",
    what: "Token bucket per IP. Stops scripts; shared office IPs trip it (1%).",
    block: { script: 0.97, headless: 0.3, farm: 0.1 },
    human: 0.01,
    ms: 10,
  },
  {
    id: "behave",
    name: "behaviour check",
    what: "Typing speed, fingerprints. Stops headless bots; +90 ms, 3% false alarms.",
    block: { script: 0.6, headless: 0.97, farm: 0.3 },
    human: 0.03,
    ms: 90,
  },
  {
    id: "otp",
    name: "OTP wall",
    what: "Aadhaar OTP for everyone. Stops nearly all; +900 ms, 10% of travellers give up.",
    block: { script: 0.98, headless: 0.98, farm: 0.95 },
    human: 0.1,
    ms: 900,
  },
];

export const SHIELD_BY_ID = Object.fromEntries(SHIELDS.map((s) => [s.id, s])) as Record<ShieldId, Shield>;

export const BOT_TELLS: Record<BotKind, string> = {
  script: "datacenter IP ranges, no cookies, 40 requests/s from one IP",
  headless: "headless Chrome fingerprints, passenger form filled in 0.4 s",
  farm: "residential IPs, real phones, 37 accounts on one device",
};

export type Phase = { kind: BotKind; share: number; cap: number };
/** What the dashboard shows before a phase: the truth plus sensor noise. */
export type Telemetry = { kind: BotKind; share: number; capPerSec: number; storm: boolean };
export type Scenario = { seed: number; phases: Phase[]; noise: number[] };

export type Decision = { admit: number; shield: ShieldId };

export type PhaseResult = {
  admit: number;
  shield: ShieldId;
  kind: BotKind;
  share: number;
  load: number;
  p99: number;
  toHumans: number;
  toBots: number;
  blocked: number;
  errors: number;
  meltdown: boolean;
  degraded: boolean;
};

export type RunState = {
  phase: number;
  left: number;
  heat: number;
  meltNext: boolean;
  soldAt: number | null;
  results: PhaseResult[];
};

export const FRESH_RUN: RunState = { phase: 0, left: SEATS, heat: 0, meltNext: false, soldAt: null, results: [] };

function rng(seed: number) {
  let h = seed >>> 0 || 1;
  return () => {
    h ^= h << 13;
    h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5;
    h >>>= 0;
    return h / 4294967296;
  };
}

const KINDS: BotKind[] = ["script", "headless", "farm"];

export function makeScenario(seed: number): Scenario {
  const r = rng(seed);
  // One refresh storm (everyone hammering "check availability") somewhere in phases 2–5 halves booking capacity.
  const storm = 1 + Math.floor(r() * 4);
  const phases: Phase[] = [];
  for (let p = 0; p < PHASES; p++) {
    const kind = KINDS[Math.floor(r() * 3)];
    const share = p === 0 ? 0.45 + r() * 0.15 : r() < 0.55 ? 0.5 + r() * 0.25 : 0.08 + r() * 0.08;
    phases.push({ kind, share, cap: p === storm ? 0.5 : p === storm + 1 ? 0.75 : 1 });
  }
  return { seed, phases, noise: Array.from({ length: PHASES * 2 }, () => r() - 0.5) };
}

export function telemetry(s: Scenario, run: RunState): Telemetry | null {
  const ph = s.phases[run.phase];
  if (!ph) return null;
  const share = Math.max(0.02, Math.min(0.95, ph.share * (1 + s.noise[run.phase * 2] * 0.3)));
  const cap = CAPACITY * ph.cap * (run.meltNext ? 0.35 : 1) * (1 + s.noise[run.phase * 2 + 1] * 0.2);
  return { kind: ph.kind, share, capPerSec: Math.max(1, Math.round(cap)), storm: ph.cap < 1 };
}

/** Plays one 10-second phase. Pure. */
export function playPhase(s: Scenario, run: RunState, d: Decision): RunState {
  const ph = s.phases[run.phase];
  if (!ph || run.left <= 0) return run;
  const sh = SHIELD_BY_ID[d.shield];
  const n = d.admit * PHASE_SEC;
  const humansIn = n * (1 - ph.share) * (1 - sh.human);
  const botsIn = n * ph.share * (1 - sh.block[ph.kind]);
  const blocked = n * (1 - ph.share) * sh.human;
  // Bots that get through also hammer availability, eating booking capacity.
  const cap = Math.max(10, CAPACITY * PHASE_SEC * ph.cap * (run.meltNext ? 0.35 : 1) - botsIn * 0.8);
  const arrivals = humansIn + botsIn;
  const load = arrivals / cap;
  const served = Math.min(arrivals, cap);
  const sold = Math.min(run.left, served);
  const fh = arrivals ? humansIn / arrivals : 1;
  const errors = Math.max(0, arrivals - cap) * fh;
  const p99 = Math.round(120 + sh.ms + (load <= 1 ? 300 * load ** 3 : 300 + 900 * (load - 1)));
  let heat = load > 1.15 ? run.heat + (load - 1) : Math.max(0, run.heat - 0.3);
  const meltdown = heat >= 0.6;
  if (meltdown) heat = 0;
  const left = run.left - sold;
  const soldAt = run.soldAt ?? (left <= 0.5 ? run.phase * PHASE_SEC + (served > 0 ? (PHASE_SEC * run.left) / served : PHASE_SEC) : null);
  return {
    phase: run.phase + 1,
    left: left <= 0.5 ? 0 : left,
    heat,
    meltNext: meltdown,
    soldAt,
    results: [
      ...run.results,
      {
        admit: d.admit,
        shield: d.shield,
        kind: ph.kind,
        share: ph.share,
        load,
        p99,
        toHumans: sold * fh,
        toBots: sold * (1 - fh),
        blocked,
        errors,
        meltdown,
        degraded: run.meltNext,
      },
    ],
  };
}

export function isOver(run: RunState): boolean {
  return run.phase >= PHASES || run.left <= 0;
}

export type ScoreLine = { label: string; value: string; pts: number };

export function scoreRun(run: RunState): { total: number; lines: ScoreLine[]; win: boolean; meltdowns: number } {
  const sum = (f: (r: PhaseResult) => number) => run.results.reduce((a, r) => a + f(r), 0);
  const humans = Math.round(sum((r) => r.toHumans));
  const bots = Math.round(sum((r) => r.toBots));
  const blocked = Math.round(sum((r) => r.blocked));
  const errors = Math.round(sum((r) => r.errors));
  const slow = run.results.filter((r) => r.p99 > SLO_MS).length;
  const meltdowns = run.results.filter((r) => r.meltdown).length;
  const early = run.soldAt !== null ? Math.max(0, Math.round(60 - run.soldAt)) : 0;
  const lines: ScoreLine[] = [
    { label: "seats to travellers", value: `${humans}`, pts: humans },
    { label: "seats to tout bots", value: `${bots}`, pts: -2 * bots },
    { label: "travellers wrongly blocked", value: `${blocked}`, pts: -2 * blocked },
    { label: "travellers served a 503", value: `${errors}`, pts: -Math.round(errors / 2) },
    { label: `phases over the ${SLO_MS} ms p99`, value: `${slow}`, pts: -40 * slow },
    { label: "database meltdowns", value: `${meltdowns}`, pts: -150 * meltdowns },
    { label: "sold out early", value: run.soldAt !== null ? `${early} s spare` : "not sold out", pts: 6 * early },
  ];
  const total = lines.reduce((a, l) => a + l.pts, 0);
  return { total, lines, win: total >= WIN_SCORE && meltdowns === 0, meltdowns };
}
