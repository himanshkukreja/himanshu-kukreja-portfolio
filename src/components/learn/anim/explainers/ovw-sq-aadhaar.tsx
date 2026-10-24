/**
 * The whole side quest, Aadhaar: the mission and scale (1.45B numbers, 90M+ authentications a
 * day, < 200 ms), the impossible brute-force dedup (10^16 comparisons, 3,170 years a day), the two
 * paths (offline enrolment → registrar → CIDR → three ABIS; AUA → ASA → CIDR for a Yes/No), the
 * deep dives (full-gallery dedup, 2-of-3 consensus, the 200 ms budget, security and privacy, face
 * auth) and scale and edge cases (village camps, fallbacks, replayed and cloned fingerprints).
 */
import { at, Box, defineExplainer, ease, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone, type Variant } from "../kit";

const W = 600;
const H = 340;
/** a label with an optional shorter form for narrow stages: "both" or ["wide", "narrow"] */
type Two = string | [string, string];
type Nd = { x: number; y: number; w: number; h: number; l: string; n?: string };
type Fr = {
  /** kicker (top left) */
  k: Two;
  kt?: Tone;
  /** nodes in play (plain 1 or a tone); every other node is dimmed */
  on?: Record<string, Tone | 1>;
  sub?: Record<string, Two>;
  /** wires carrying traffic in this frame: [from, to, tone]; a reversed pair runs a wire backwards */
  fl?: [string, string, Tone?][];
  /** big figures: [figure, label, tone] */
  figs?: [string, Two, Tone?][];
  chips?: Two[];
  cols?: number;
  ct?: Tone;
  /** per-chip tones (override ct) */
  ctn?: Tone[];
  /** meters: [label, value, max, tone] */
  bars?: [Two, number, number, Tone?][];
  note?: Two;
  nt?: Tone;
};
type P = { x: number; y: number };
const pick = (v: Two | undefined, nr: boolean) => (v === undefined ? undefined : typeof v === "string" ? v : v[nr ? 1 : 0]);

/** a soft orthogonal curve from one box to the next, picked by their relative position */
function geo(a: Nd, b: Nd): P[] {
  const ay = a.y + a.h / 2;
  const by = b.y + b.h / 2;
  if (b.x >= a.x + a.w - 2 || b.x + b.w <= a.x + 2) {
    const r = b.x >= a.x + a.w - 2;
    const p0 = { x: r ? a.x + a.w : a.x, y: ay };
    const p3 = { x: r ? b.x : b.x + b.w, y: by };
    const m = (p0.x + p3.x) / 2;
    return [p0, { x: m, y: p0.y }, { x: m, y: p3.y }, p3];
  }
  const d = b.y > a.y;
  const p0 = { x: a.x + a.w / 2, y: d ? a.y + a.h : a.y };
  const p3 = { x: b.x + b.w / 2, y: d ? b.y : b.y + b.h };
  const m = (p0.y + p3.y) / 2;
  return [p0, { x: p0.x, y: m }, { x: p3.x, y: m }, p3];
}
const bz = (g: P[], u: number): P => {
  const v = 1 - u;
  const c = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return { x: g.reduce((s, p, i) => s + p.x * c[i], 0), y: g.reduce((s, p, i) => s + p.y * c[i], 0) };
};
const path = (g: P[]) => `M${g[0].x} ${g[0].y}C${g[1].x} ${g[1].y} ${g[2].x} ${g[2].y} ${g[3].x} ${g[3].y}`;

function Scene({ variant, step, t, clock, narrow: nr }: SceneProps) {
  const f = at(step, F[variant] || F[Object.keys(F)[0]]);
  const on = f.on || {};
  /** staggered fade-in for item i of n, always fully in by t = 1 */
  const fade = (i: number, n: number) => {
    const k = n > 1 ? Math.min(0.15, 0.5 / (n - 1)) : 0;
    return ease(seg(t, i * k, i * k + 0.5));
  };
  const xs = [[300], [160, 440], [100, 300, 500]][(f.figs?.length || 1) - 1] || [];
  const cols = f.cols || 2;
  const cw = (552 - (cols - 1) * 8) / cols;
  return (
    <g>
      <Txt x={16} y={26} k="k" anchor="start" tone={f.kt}>
        {pick(f.k, nr)}
      </Txt>
      {E.map(([a, b]) => {
        const live = a in on && b in on;
        const fl = f.fl?.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        return <Wire key={a + b} d={path(geo(N[a], N[b]))} tone={fl ? fl[2] || "lit" : undefined} arrow={live} opacity={live ? 1 : 0.3} />;
      })}
      {Object.entries(N).map(([id, n]) => {
        const s = on[id];
        return <Box key={id} x={n.x} y={n.y} w={n.w} h={n.h} label={nr ? n.n || n.l : n.l} sub={(nr && n.h < 40 ? undefined : pick(f.sub?.[id], nr)) || undefined} tone={s === 1 ? undefined : s} dim={!(id in on)} />;
      })}
      {f.fl?.map(([a, b, tone], i) => {
        const u = ((((t - 1) * 0.5 + clock * 0.55 + 0.5 + i * 0.17) % 1) + 1) % 1;
        const fwd = E.some((e) => e[0] === a && e[1] === b);
        const p = fwd ? bz(geo(N[a], N[b]), u) : bz(geo(N[b], N[a]), 1 - u);
        return <Token key={a + b} x={p.x} y={p.y} s={9} tone={tone || "lit"} />;
      })}
      {f.figs?.map(([d, l, tone], i) => (
        <g key={d + i} opacity={fade(i, f.figs?.length || 1)}>
          <Txt x={xs[i]} y={254} k="d" tone={tone}>
            {d}
          </Txt>
          <Txt x={xs[i]} y={278} k="s">
            {pick(l, nr)}
          </Txt>
        </g>
      ))}
      {f.chips?.map((c, i) => {
        const x = 24 + (i % cols) * (cw + 8);
        const y = 214 + Math.floor(i / cols) * 34;
        const tone = f.ctn?.[i] || f.ct || "lit";
        return (
          <g key={i} opacity={fade(i, f.chips?.length || 1)}>
            <rect className={`ax-box ${tone}`} x={x} y={y} width={cw} height={26} />
            <Txt x={x + cw / 2} y={y + 18} k="s" tone={tone}>
              {pick(c, nr)}
            </Txt>
          </g>
        );
      })}
      {f.bars?.map(([l, v, m, tone], i) => (
        <g key={i} opacity={fade(i, f.bars?.length || 1)}>
          <Txt x={24} y={232 + i * 28} k="s" anchor="start" tone={tone}>
            {pick(l, nr)}
          </Txt>
          <Meter x={nr ? 330 : 300} y={222 + i * 28} w={nr ? 246 : 276} h={12} value={v * ease(seg(t, 0.1, 0.8))} max={m} tone={tone || "sky"} />
        </g>
      ))}
      {f.note && (
        <Txt x={16} y={f.figs || f.chips || f.bars ? H - 12 : 244} k="s" anchor="start" tone={f.nt} opacity={ease(seg(t, 0.3, 0.8))}>
          {pick(f.note, nr)}
        </Txt>
      )}
    </g>
  );
}

const N: Record<string, Nd> = {
  bank: { x: 16, y: 52, w: 104, h: 46, l: "Bank (AUA)", n: "Bank" },
  asa: { x: 152, y: 52, w: 100, h: 46, l: "ASA" },
  kit: { x: 16, y: 146, w: 104, h: 46, l: "Enrol kit", n: "Kit" },
  reg: { x: 152, y: 146, w: 100, h: 46, l: "Registrar", n: "Reg" },
  cidr: { x: 290, y: 52, w: 132, h: 140, l: "CIDR" },
  a1: { x: 466, y: 52, w: 118, h: 40, l: "ABIS 1" },
  a2: { x: 466, y: 102, w: 118, h: 40, l: "ABIS 2" },
  a3: { x: 466, y: 152, w: 118, h: 40, l: "ABIS 3" },
};
const E: [string, string][] = [
  ["bank", "asa"],
  ["asa", "cidr"],
  ["kit", "reg"],
  ["reg", "cidr"],
  ["cidr", "a1"],
  ["cidr", "a2"],
  ["cidr", "a3"],
];
const AUTH = { bank: 1, asa: 1, cidr: "lit" } as const;
const DEDUP = { cidr: "lit", a1: 1, a2: 1, a3: 1 } as const;
const ABIS: [string, string, Tone?][] = [
  ["cidr", "a1"],
  ["cidr", "a2"],
  ["cidr", "a3"],
];

const F: Record<string, Fr[]> = {
  why: [
    { k: "Aadhaar · the scale", on: { cidr: "lit" }, figs: [["1.45B", ["Aadhaar numbers", "numbers"]], ["90M+", ["authentications/day", "auths a day"], "lit"], ["< 200 ms", ["per 1:1 check", "per check"]]], note: ["each person enrolled exactly once", "each person exactly once"] },
    {
      k: "requirements",
      on: { bank: 1, kit: 1, cidr: 1 },
      chips: [["guarantee uniqueness", "uniqueness"], ["640,000 villages", "640K villages"], ["enrolment works offline", "offline"], ["fingerprint, iris, OTP", "finger, iris, OTP"], ["Yes / No, no personal data", "Yes / No only"], ["99.9%+ available", "99.9%+"]],
      ctn: ["lit", undefined, undefined, undefined, "ok"],
    },
    { k: "brute force is impossible", kt: "bad", on: { kit: 1, cidr: "bad" }, figs: [["10B", ["templates on file", "templates"]], ["10^16", ["comparisons a day", "a day"]], ["3,170", ["years per enrol day", "years a day"], "bad"]], note: ["1M enrolments a day × 10B templates at 100,000 matches/s", "1M a day × 10B templates"] },
    { k: "authentication and storage", on: AUTH, fl: [["bank", "asa"], ["asa", "cidr"]], figs: [["~1,040", ["auths/s average", "avg/s"]], ["~3,000", ["at a 3x peak", "peak/s"], "lit"], ["~20 PB", ["stored, 3 copies", "stored"], "sky"]], note: ["templates ~360 TB · raw images ~7 PB", "templates ~360 TB"] },
  ],
  arch: [
    { k: "enrolment: capture", on: { kit: "lit", reg: 1 }, sub: { kit: ["encrypted", "sealed"], reg: ["checks", "checks"] }, fl: [["kit", "reg"]], note: ["3–5 MB packet · only CIDR can decrypt · HMAC shows tampering", "only CIDR can decrypt"] },
    { k: "enrolment: dedup", on: { kit: 1, reg: 1, ...DEDUP }, sub: { cidr: ["2 of 3 agree", "2 of 3"] }, fl: [["reg", "cidr"], ...ABIS], note: ["UNIQUE → a 12-digit number · DUPLICATE → rejected", "unique → a 12-digit number"] },
    { k: "authentication: request", on: AUTH, sub: { bank: ["PID block", "PID"], asa: ["leased line", "line"], cidr: ["1:1 match", "1:1"] }, fl: [["bank", "asa"], ["asa", "cidr"]], note: ["CIDR: two active-active data centres, never on the internet", "never on the internet"] },
    { k: "authentication: answer", kt: "ok", on: { ...AUTH, bank: "ok" }, sub: { bank: ["Yes / No", "Y / N"], cidr: ["signed reply", "signed"] }, fl: [["cidr", "asa", "ok"], ["asa", "bank", "ok"]], note: ["identity data only through e-KYC, with consent", "e-KYC only with consent"], nt: "ok" },
  ],
  deep: [
    {
      k: "1 · dedup at billion scale",
      on: DEDUP,
      sub: { cidr: ["full gallery", "full"] },
      fl: ABIS,
      chips: [["demographic blocking: 72,000x", "blocking: 72,000x"], ["fraudsters change names", "names can lie"], ["fingerprint + iris fusion", "finger + iris"], ["search every template", "search all"]],
      ctn: [undefined, "bad", "ok", "lit"],
    },
    {
      k: "2 · three vendors vote",
      on: { cidr: "lit", a1: "ok", a2: "ok", a3: "bad" },
      sub: { a1: ["UNIQUE", "UNIQUE"], a2: ["UNIQUE", "UNIQUE"], a3: ["DUPLICATE", "DUP"], cidr: ["follow 2 of 3", "2 of 3"] },
      chips: [["3/3 UNIQUE → accept", "3/3 → accept"], ["3/3 DUPLICATE → reject", "3/3 → reject"], ["2/3 agree → majority", "2/3 → majority"], ["mixed → manual review", "mixed → human"]],
      ctn: ["ok", "bad", "lit", "warn"],
    },
    {
      k: "3 · spending 200 ms",
      on: AUTH,
      fl: [["bank", "asa"], ["asa", "cidr"]],
      cols: 3,
      chips: [["network 50 ms", "network 50"], ["crypto 30 ms", "crypto 30"], ["lookup 20 ms", "lookup 20"], ["1:1 match 80 ms", "match 80"], ["overhead 20 ms", "other 20"]],
      ctn: [undefined, undefined, undefined, "lit"],
      ct: "mute",
    },
    { k: "4 · security and privacy", kt: "ok", on: { ...AUTH, kit: 1 }, sub: { cidr: ["keys in HSM", "HSM"] }, chips: [["2048-bit PKI at capture", "PKI at capture"], ["AES-256 at rest", "AES-256"], ["16-digit Virtual ID", "Virtual ID"], ["a token per agency", "token per AUA"]], ct: "ok" },
    { k: "5 · face authentication", on: { bank: "lit", asa: 1, cidr: 1 }, sub: { bank: ["face", "face"], cidr: ["liveness", "live?"] }, fl: [["bank", "asa"], ["asa", "cidr"]], figs: [["2021", "launched"], ["~280M", ["a month, late 2025", "a month"], "lit"], ["500+ cr", ["total, Sep 2026", "total"]]], note: ["contactless, for worn or faded fingerprints", "for worn fingerprints"] },
  ],
  scale: [
    { k: "enrolment at village scale", on: { kit: "lit", reg: 1 }, sub: { kit: ["offline", "offline"] }, figs: [["60–80K", "stations (2014)"], ["~50", ["per station a day", "per station"]], ["1M+", "enrolments a day", "lit"]], note: ["packets wait encrypted, up to 30 days, or go by USB", "30-day upload buffer"] },
    { k: "genuine people fail too", kt: "warn", on: { bank: "warn", asa: 1, cidr: 1 }, sub: { bank: ["worn prints", "worn"] }, cols: 4, chips: [["another finger", "finger"], "iris", "OTP", "face"], ct: "ok", note: ["fall back, don't lower the threshold for everyone", "fall back, keep thresholds"] },
    {
      k: "no password reset for fingers",
      kt: "bad",
      on: { bank: "bad", asa: 1, cidr: "lit" },
      sub: { bank: ["replay", "replay"], cidr: ["rejects stale", "reject"] },
      fl: [["bank", "asa", "bad"], ["asa", "cidr", "bad"]],
      chips: [["signed, timestamped captures", "signed captures"], ["liveness detection", "liveness"], ["per-device anomalies", "anomalies"], ["residents can lock", "resident lock"]],
    },
    { k: "the takeaway", kt: "ok", on: { bank: 1, asa: 1, kit: 1, reg: 1, cidr: "ok", a1: 1, a2: 1, a3: 1 }, sub: { cidr: ["Yes / No out", "Y / N"] }, fl: [["bank", "asa"], ["asa", "cidr"], ["reg", "cidr"]], chips: [["1:1 auth · sync · ms", "1:1 · fast"], ["1:N dedup · async · days", "1:N · async"]], ctn: ["lit", "sky"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Aadhaar: 1.45 billion numbers issued, 90 million+ authentications a day, each answered in under 200 ms, every person enrolled exactly once.", tween: 1400 },
      { caption: "Prove uniqueness, enrol across 640,000 villages, often offline, verify by fingerprint, iris or OTP, and answer only Yes or No.", tween: 1400 },
      { caption: "Brute force: 1 million enrolments a day against 10 billion templates is 10^16 comparisons. At 100,000 a second, 3,170 years per day.", tween: 1400 },
      { caption: "Authentication is modest: ~1,040 a second, ~3,000 at peak. Templates are ~360 TB; with raw images and 3 copies, ~20 PB.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Enrolment: an offline-capable laptop captures 10 fingerprints, 2 irises and a photo, and encrypts the packet at capture time.", tween: 1200, loop: true },
      { caption: "The registrar uploads packets to CIDR, which sends each to three ABIS vendors in parallel. 2 of 3 must agree, or a human decides.", tween: 1400, loop: true },
      { caption: "Authentication: a bank, the AUA, sends the encrypted PID block through a licensed ASA over leased lines. CIDR is never on the internet.", tween: 1200, loop: true },
      { caption: "CIDR does the 1:1 match itself and returns only a signed Yes or No with a transaction ID: no biometrics, no scores, no personal data.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Blocking by gender, age, state and name cuts the search 72,000-fold, but a fraudster just changes their name. So ABIS searches every template.", tween: 1400, loop: true },
      { caption: "Three independent algorithms vote: 3 of 3 accept or reject, 2 of 3 follow the majority, and a mixed result goes to manual adjudication.", tween: 1400 },
      { caption: "The 200 ms budget: 50 network, 30 crypto, 20 lookup, 20 overhead, and the biggest slice, 80 ms, for the 1:1 biometric match.", tween: 1400, loop: true },
      { caption: "2048-bit PKI at capture, AES-256 at rest with keys in HSMs. A 16-digit Virtual ID and per-agency tokens stop services tracking anyone.", tween: 1400 },
      { caption: "Face authentication launched in 2021 and reached about 280 million a month by late 2025: contactless, with liveness checks against photos.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "At the 2014 peak, 60,000 to 80,000 stations doing ~50 enrolments a day added 1 million+ people daily, with 30 days to upload.", tween: 1400 },
      { caption: "Genuine people fail too, with worn prints or cataracts. Don't lower thresholds for everyone; fall back to another finger, iris, OTP or face.", tween: 1400 },
      { caption: "You can't reset a fingerprint, so rotate what you can: signed, timestamped captures stop replays, liveness stops fakes, residents can lock.", tween: 1400, loop: true },
      { caption: "The design: 1:1 authentication is fast and synchronous, 1:N dedup is slow and asynchronous, and only a Yes or No ever leaves CIDR.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
