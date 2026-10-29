/**
 * Whole-lesson overview (week 11, day 4 · evaluation and guardrails), on MegaMart Assist. A week
 * with two failures (a vibe-checked prompt, a seller's hidden line); three layers on three clocks.
 * Golden sets: 2,000 cases × 6 calls = 12,000 calls, ~40 min and ~$190 a run (judges ~84%), ±1.6
 * points (±5 for a 200-case slice), a 2-point per-slice gate. Judges: MT-Bench biases (65.0% vs
 * 23.8% position consistency, 91.3% padding), swap-and-agree, references, kappa; RAG metrics and
 * faithful ≠ correct (the 212 answers, 0.91 → 0.78 recall); online outcomes and A/B (~8,100 per
 * arm). Injection: a poisoned seller policy, the image leak, 95% is failing, the lethal trifecta,
 * email_return_label(order_id). Defense in depth: six layers, the tool gate (₹5,000), taint and
 * confirmation, PII tokenising, Air Canada ($812.02). The degradation ladder and "answers without
 * actions".
 */
import { Box, defineExplainer, ease, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone, type Variant } from "../kit";

const W = 600;
const H = 340;
/** a label with an optional shorter form for narrow stages: "both" or ["wide", "narrow"] */
type Two = string | [string, string];
type Nd = { x: number; y: number; w: number; h: number; l: string; n?: string };
/** an edge: from, to, and optional port offsets (y for side-by-side boxes, x for stacked ones) */
type Ed = [string, string, number?, number?];
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

/* the stage grid: four columns, three rows of boxes above the figures */
const CX = [16, 124, 260, 404];
const CW = [88, 116, 124, 180];
const RY = [40, 96, 156];
const RH = [44, 48, 40];
const nd = (c: number, r: number, l: string, n?: string, rows = 1): Nd => ({ x: CX[c], y: RY[r], w: CW[c], h: RY[r + rows - 1] + RH[r + rows - 1] - RY[r], l, n });

/** a soft orthogonal curve from one box to the next, picked by their relative position */
function geo(a: Nd, b: Nd, oa = 0, ob = 0): P[] {
  if (b.x >= a.x + a.w - 2 || b.x + b.w <= a.x + 2) {
    const r = b.x >= a.x + a.w - 2;
    const p0 = { x: r ? a.x + a.w : a.x, y: a.y + a.h / 2 + oa };
    const p3 = { x: r ? b.x : b.x + b.w, y: b.y + b.h / 2 + ob };
    const m = (p0.x + p3.x) / 2;
    return [p0, { x: m, y: p0.y }, { x: m, y: p3.y }, p3];
  }
  const d = b.y > a.y;
  const p0 = { x: a.x + a.w / 2 + oa, y: d ? a.y + a.h : a.y };
  const p3 = { x: b.x + b.w / 2 + ob, y: d ? b.y : b.y + b.h };
  const m = (p0.y + p3.y) / 2;
  return [p0, { x: p0.x, y: m }, { x: p3.x, y: m }, p3];
}
const bz = (g: P[], u: number): P => {
  const v = 1 - u;
  const c = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return { x: g.reduce((s, p, i) => s + p.x * c[i], 0), y: g.reduce((s, p, i) => s + p.y * c[i], 0) };
};
const path = (g: P[]) => `M${g[0].x} ${g[0].y}C${g[1].x} ${g[1].y} ${g[2].x} ${g[2].y} ${g[3].x} ${g[3].y}`;
const ends = (e: Ed) => geo(N[e[0]], N[e[1]], e[2], e[3]);

function Scene({ variant, step, t, clock, narrow: nr }: SceneProps) {
  const f = (F[variant] || F[Object.keys(F)[0]])[Math.min(step, (F[variant] || F[Object.keys(F)[0]]).length - 1)];
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
      {E.map((e) => {
        const [a, b] = e;
        const live = a in on && b in on;
        const fl = f.fl?.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        return <Wire key={a + b} d={path(ends(e))} tone={fl ? fl[2] || "lit" : undefined} arrow={live} opacity={live ? 1 : 0.3} />;
      })}
      {Object.entries(N).map(([id, n]) => {
        const s = on[id];
        return <Box key={id} x={n.x} y={n.y} w={n.w} h={n.h} label={nr ? n.n || n.l : n.l} sub={(nr ? undefined : pick(f.sub?.[id], nr)) || undefined} tone={s === 1 ? undefined : s} dim={!(id in on)} />;
      })}
      {f.fl?.map(([a, b, tone], i) => {
        const e = E.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        if (!e) return null;
        const u = ((((t - 1) * 0.5 + clock * 0.55 + 0.5 + i * 0.17) % 1) + 1) % 1;
        const p = bz(ends(e), e[0] === a ? u : 1 - u);
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
  cust: nd(0, 0, "Customer", "Cust"),
  guard: nd(1, 0, "Guardrails", "Guards"),
  assist: nd(2, 0, "Assist"),
  model: nd(3, 0, "Provider"),
  evil: nd(0, 1, "Attacker", "Exfil"),
  gate: nd(1, 1, "Tool gate", "Gate"),
  seller: nd(2, 1, "Seller policy", "Seller"),
  index: nd(3, 1, "pgvector + BM25", "Index"),
  humans: nd(0, 2, "Humans"),
  api: nd(1, 2, "Refunds API", "Refunds"),
  evals: nd(2, 2, "Golden set", "Golden"),
  judge: nd(3, 2, "LLM judge", "Judge"),
};
const E: Ed[] = [
  ["cust", "guard"],
  ["guard", "assist"],
  ["assist", "model"],
  ["index", "assist", 0, 10],
  ["seller", "index"],
  ["cust", "evil"],
  ["assist", "gate"],
  ["gate", "api"],
  ["evals", "judge"],
];

const F: Record<string, Fr[]> = {
  evals: [
    {
      k: ["Mon 11:00 · a vibe check ships", "a vibe check ships"],
      kt: "warn",
      on: { cust: 1, guard: 1, assist: "warn", model: 1, seller: "bad" },
      sub: { assist: ["new prompt", "new prompt"], seller: ["a hidden line", "hidden line"] },
      fl: [
        ["cust", "guard"],
        ["guard", "assist"],
        ["assist", "model"],
      ],
      chips: [
        ["Mon · 15 chats look better", "15 chats look better"],
        ["Tue · handoffs 22% → 15%", "handoffs 22% → 15%"],
        ["Wed · a refund no policy says", "Wed · invented refund"],
        ["Thu · a seller's hidden line", "Thu · a hidden line"],
      ],
      ctn: ["warn", "warn", "bad", "bad"],
      note: ["Thu 10:00 rollback: nothing measured answers against policy", "nothing measured the answers"],
      nt: "bad",
    },
    {
      k: ["three layers, three clocks", "three clocks"],
      on: { assist: "lit", guard: "ok", evals: "lit", judge: 1, cust: 1 },
      fl: [
        ["cust", "guard"],
        ["guard", "assist"],
      ],
      cols: 1,
      chips: [
        ["offline evals · before a change ships · predictable regressions", "offline · before it ships"],
        ["online measurement · real traffic · what the golden set missed", "online · on real traffic"],
        ["runtime guardrails · every request · the single bad request", "guardrails · every request"],
      ],
      ctn: ["lit", "sky", "ok"],
      note: ["every production failure becomes a golden-set case", "failures become golden cases"],
    },
    {
      k: ["the golden set", "golden cases"],
      on: { evals: "lit", judge: 1, humans: 1 },
      sub: { evals: ["2,000 cases", "2,000"] },
      fl: [["evals", "judge"]],
      chips: [
        ["sampled traffic, PII removed", "sampled traffic"],
        ["edge cases", "edge cases"],
        ["adversarial: injection, haggling", "adversarial"],
        ["incidents: never-regress", "never-regress"],
      ],
      ctn: ["sky", "sky", "warn", "bad"],
      note: ["versioned with the code, part held back from prompt tuning", "versioned, part held out"],
    },
    {
      k: ["what one full run costs", "one full run"],
      on: { evals: "lit", judge: "warn", model: 1 },
      sub: { judge: ["Opus 5.5, 5 calls", "5 calls"], model: ["1 call a case", "1 call"] },
      fl: [["evals", "judge", "warn"]],
      figs: [
        ["12,000", ["calls a run", "calls a run"]],
        ["~$190", ["~40 min a run", "~40 min"], "lit"],
        ["~84%", ["of it is the judges", "the judges"], "warn"],
      ],
      note: ["~$3,000 a month: a 200-case smoke set per PR, the full set nightly", "smoke per PR, full nightly"],
    },
    {
      k: ["what 2,000 cases can resolve", "resolution"],
      kt: "warn",
      on: { evals: "lit", judge: 1 },
      bars: [
        [["2,000 cases · ±1.6 points", "2,000 · ±1.6 pts"], 1.6, 5, "ok"],
        [["a 200-case slice · ±5 points", "200 slice · ±5 pts"], 5, 5, "warn"],
      ],
      note: ["gate each slice on drops of 2 points or more; read the flipped cases", "gate on drops ≥ 2 points"],
    },
  ],
  judge: [
    {
      k: ["LLM-as-judge: test it for bias", "judge biases"],
      kt: "warn",
      on: { judge: "warn", evals: 1 },
      fl: [["evals", "judge", "warn"]],
      figs: [
        ["65.0%", ["GPT-4, both orders", "GPT-4 consistent"]],
        ["23.8%", ["Claude-v1, both orders", "Claude-v1"], "bad"],
        ["91.3%", ["padded answers won", "padding won"], "warn"],
      ],
      note: ["MT-Bench, 2023 models: what to test your judge for, not today's rates", "2023 models: test yours"],
    },
    {
      k: ["measure the instrument", "mitigations"],
      kt: "ok",
      on: { judge: "ok", humans: "lit", evals: 1 },
      fl: [["evals", "judge", "ok"]],
      chips: [
        ["swap the order, require agreement", "swap, require agreement"],
        ["a reference: 14 of 20 → 3 of 20", "reference: 14 → 3 of 20"],
        ["a different model judges", "a different model"],
        ["kappa against two humans", "kappa vs humans"],
      ],
      ctn: ["ok", "ok", "sky", "lit"],
      note: ["GPT-4 agreed with experts 85%, above humans with each other (81%)", "GPT-4 85%, humans 81%"],
    },
    {
      k: ["score retrieval and generation apart", "two stages, two scores"],
      on: { index: "sky", assist: 1, model: "lit" },
      fl: [
        ["index", "assist", "sky"],
        ["assist", "model"],
      ],
      chips: [
        ["context recall · retrieval", "recall · retrieval"],
        ["context precision · retrieval", "precision · retrieval"],
        ["faithfulness · generation", "faithfulness · gen"],
        ["answer relevancy · generation", "relevancy · gen"],
      ],
      ctn: ["sky", "sky", "lit", "lit"],
      note: ["recall@k from expected sources: exact, free, the first number to check", "recall@k: free, check first"],
    },
    {
      k: ["faithful isn't correct", "faithful ≠ correct"],
      kt: "bad",
      on: { index: "warn", assist: 1, model: "warn" },
      sub: { index: ["superseded rule", "stale"] },
      fl: [
        ["index", "assist", "warn"],
        ["assist", "model", "warn"],
      ],
      figs: [
        ["212", ["answers faithful to a stale rule", "faithful, stale"], "bad"],
        ["0.91 → 0.78", ["recall with 300-token chunks", "recall, 300 tokens"], "warn"],
      ],
      note: ["faithfulness rose 0.95 → 0.97 on thinner context: don't ship", "faithfulness rose: don't ship"],
      nt: "bad",
    },
    {
      k: ["online: outcomes over thumbs", "online measurement"],
      on: { cust: 1, guard: 1, assist: "lit", judge: "sky", evals: 1 },
      fl: [
        ["cust", "guard"],
        ["guard", "assist"],
      ],
      chips: [
        ["repeat contacts within 7 days", "repeat contacts"],
        ["handoffs, both directions", "handoffs, both ways"],
        ["a judge on ~1% of answers", "judges on ~1%"],
        ["faithfulness ≥ 0.95 over 7 days", "faithful ≥ 0.95, 7 d"],
      ],
      ctn: ["lit", "warn", "sky", "ok"],
      note: ["A/B by customer: ~8,100 rated per arm, ~17 days at 10%", "A/B: ~17 days at 10%"],
    },
  ],
  inject: [
    {
      k: ["Thu 09:10 · a seller's hidden line", "a poisoned policy"],
      kt: "bad",
      on: { seller: "bad", index: "warn", assist: 1, model: "warn" },
      sub: { seller: ["edited by it", "edited"], index: ["ranked first", "first"] },
      fl: [
        ["seller", "index", "bad"],
        ["index", "assist", "bad"],
        ["assist", "model", "warn"],
      ],
      cols: 1,
      chips: [
        ["a seller edits its return policy, adds a hidden instruction", "a hidden line in a policy"],
        ["re-indexed, retrieved, ranked first for a speaker question", "retrieved, ranked first"],
        ["direct: the user attacks · indirect: third-party text does", "indirect, not direct"],
      ],
      ctn: ["bad", "warn", "sky"],
    },
    {
      k: ["exfiltration through an image", "the image leak"],
      kt: "bad",
      on: { cust: "warn", guard: 1, assist: 1, model: "warn", evil: "bad" },
      sub: { evil: ["its server", "server"] },
      fl: [
        ["assist", "guard", "bad"],
        ["guard", "cust", "bad"],
        ["cust", "evil", "bad"],
      ],
      cols: 1,
      chips: [
        ["the answer includes a markdown image", "a markdown image"],
        ["its web address carries the phone number and address", "URL: phone, address"],
        ["the browser fetches it, no click needed", "fetched, no click"],
      ],
      ctn: ["warn", "bad", "bad"],
      note: ["EchoLeak, 2025: three bypasses, every layer had a hole", "EchoLeak: every layer had a hole"],
    },
    {
      k: ["95% is a failing grade", "95% is failing"],
      kt: "warn",
      on: { guard: "warn", assist: 1, model: "warn" },
      sub: { guard: ["a classifier", "classifier"] },
      figs: [
        ["95%", ["of attacks caught: failing", "caught: failing"], "bad"],
        ["1", ["success the attacker needs", "success needed"], "warn"],
      ],
      note: ["so make a fooled model unable to do harm", "make a fooled model harmless"],
      nt: "ok",
    },
    {
      k: "the lethal trifecta",
      kt: "bad",
      on: { assist: "lit", index: "warn", cust: 1, evil: "bad", api: 1 },
      cols: 3,
      chips: [
        ["private data", "private data"],
        ["untrusted content", "untrusted text"],
        ["a way out", "a way out"],
      ],
      ctn: ["sky", "warn", "bad"],
      note: ["the first two are the product, so the third leg has to go", "remove the third leg"],
      nt: "ok",
    },
    {
      k: ["an email tool puts the leg back", "the email tool"],
      on: { assist: 1, gate: "lit", api: "ok", cust: 1 },
      sub: { gate: ["order id only", "order id"] },
      fl: [
        ["assist", "gate"],
        ["gate", "api", "ok"],
      ],
      cols: 1,
      chips: [
        ["send_email(to, subject, body): the to field leaks", "send_email: to leaks"],
        ["email_return_label(order_id): the server fills the address", "email_return_label(order_id)"],
        ["a per-customer rate limit and an audit log", "rate limit, audit log"],
      ],
      ctn: ["bad", "ok", "sky"],
    },
  ],
  defend: [
    {
      k: ["a guardrail at each trust boundary", "defense in depth"],
      on: { cust: 1, guard: "lit", assist: 1, model: 1, index: "sky", gate: "lit", api: "ok" },
      sub: { guard: ["screen, filter", "screen"], index: ["this customer", "scoped"] },
      fl: [
        ["cust", "guard"],
        ["guard", "assist"],
        ["index", "assist", "sky"],
        ["assist", "gate"],
        ["gate", "api", "ok"],
      ],
      cols: 3,
      chips: [
        ["1 · input screen", "1 · screen"],
        ["2 · scoped retrieval", "2 · scoped"],
        ["3 · untrusted as data", "3 · labelled"],
        ["4 · tool gate", "4 · tool gate"],
        ["5 · customer confirms", "5 · confirm"],
        ["6 · output filter", "6 · filter"],
      ],
      ctn: ["sky", "sky", "sky", "lit", "ok", "lit"],
    },
    {
      k: ["the model never picks the amount", "the tool gate"],
      on: { assist: 1, gate: "lit", api: "ok" },
      sub: { gate: ["allow-list", "allow-list"], api: ["checks again", "checks"] },
      fl: [
        ["assist", "gate"],
        ["gate", "api", "ok"],
      ],
      chips: [
        ["allow-list: unknown tools denied", "allow-list only"],
        ["not your order: denied", "not your order: denied"],
        ["amount from allowed_amount()", "amount set by code"],
        ["over ₹5,000: a person", "over ₹5,000: a person"],
      ],
      ctn: ["lit", "bad", "ok", "warn"],
      note: ["the refunds API checks again: a gate bug isn't a breach", "the API checks again"],
    },
    {
      k: ["a tainted turn: a person confirms", "taint, then confirm"],
      on: { cust: "ok", guard: 1, assist: 1, index: "warn", gate: "lit" },
      sub: { gate: ["confirm first", "confirm"] },
      fl: [
        ["index", "assist", "warn"],
        ["assist", "gate"],
        ["assist", "guard", "ok"],
        ["guard", "cust", "ok"],
      ],
      cols: 1,
      chips: [
        ["read untrusted text? every side effect needs a confirm", "untrusted read: confirm"],
        ["\"Refund ₹2,499 to the card ending 4412 for order 7781?\"", "\"Refund ₹2,499, order 7781?\""],
        ["the server's exact action, never the model's description", "the server's action"],
      ],
      ctn: ["warn", "ok", "lit"],
    },
    {
      k: ["PII: tokenise, redact, retain", "PII handling"],
      on: { cust: 1, guard: "lit", assist: 1, model: 1 },
      sub: { guard: ["[PHONE_1]", "[PHONE_1]"], model: ["sees tokens", "tokens"] },
      fl: [
        ["cust", "guard"],
        ["guard", "assist", "lit"],
        ["assist", "model"],
      ],
      chips: [
        ["never fetch what they can't see", "never fetch it"],
        ["[PHONE_1] goes to the model", "[PHONE_1] to the model"],
        ["redact before logs and evals", "redact before storing"],
        ["retention and deletion", "retention, deletion"],
      ],
      ctn: ["ok", "lit", "sky", "sky"],
      note: ["detection misses some: access control and retention back it up", "detection misses some"],
    },
    {
      k: ["Air Canada: the bot's words are yours", "Air Canada, 2024"],
      kt: "warn",
      on: { assist: "lit", model: "warn", index: "sky", api: 1, humans: 1 },
      fl: [
        ["index", "assist", "sky"],
        ["assist", "model"],
      ],
      chips: [
        ["facts from systems, not prose", "facts from systems"],
        ["citations verified in code", "citations verified"],
        ["grounding check: refunds, policy", "grounding check"],
        ["\"I don't know\", then a handoff", "I don't know: hand off"],
      ],
      ctn: ["ok", "ok", "lit", "sky"],
      note: ["Moffatt v. Air Canada: $812.02, and its chatbot's words were its own", "Air Canada paid $812.02"],
      nt: "bad",
    },
  ],
  degrade: [
    {
      k: ["the degradation ladder", "degraded modes"],
      on: { cust: 1, assist: "lit", model: "warn", humans: "sky" },
      sub: { model: ["5xx, timeout", "5xx"] },
      fl: [["assist", "model", "warn"]],
      chips: [
        ["1 · full assistant, tools", "1 · full, with tools"],
        ["2 · evaluated fallback model", "2 · fallback model"],
        ["3 · answers without actions", "3 · answers only"],
        ["4 · cached answer, articles", "4 · no generation"],
        ["5 · human handoff", "5 · human handoff"],
      ],
      ctn: ["ok", "sky", "lit", "warn", "warn"],
      note: ["fail closed for actions, fail soft for information", "actions closed, info soft"],
      nt: "ok",
    },
    {
      k: ["a fallback nobody evaluated", "an untested fallback"],
      kt: "warn",
      on: { assist: 1, model: "sky", evals: "lit", judge: 1 },
      sub: { model: ["fallback model", "fallback"] },
      fl: [
        ["assist", "model", "sky"],
        ["evals", "judge"],
      ],
      cols: 1,
      chips: [
        ["behind a timeout budget and a circuit breaker", "timeout, breaker"],
        ["the same golden set and guardrail tests as the primary", "the same evals, the same tests"],
        ["or it's untested code that runs only in incidents", "else: runs only in incidents"],
      ],
      ctn: ["sky", "ok", "bad"],
    },
    {
      k: ["the injection screen is down 20 min", "screen down 20 min"],
      kt: "warn",
      on: { cust: 1, guard: "bad", assist: "lit", index: 1, gate: "warn", humans: "sky" },
      sub: { guard: ["timing out", "down"], gate: ["actions off", "no actions"] },
      fl: [
        ["index", "assist"],
        ["assist", "guard", "ok"],
        ["guard", "cust", "ok"],
      ],
      cols: 3,
      chips: [
        ["skip it: no", "skip it: no"],
        ["block all: no", "block all: no"],
        ["answers only: yes", "answers only"],
      ],
      ctn: ["bad", "bad", "ok"],
      note: ["a missing layer must cost capability, not safety", "cost capability, not safety"],
      nt: "ok",
    },
  ],
};

const V: Variant[] = [
  {
    id: "evals",
    label: "Golden sets",
    steps: [
      {
        caption:
          "Monday at MegaMart: a prompt edit passes a vibe check of 15 chats and ships to everyone. Handoffs fall from 22% to 15% and the dashboard turns green, but by Wednesday Assist promises refunds no policy allows, and on Thursday a seller's hidden line is leaking customers' data.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Quality and safety are properties of the system, not the model. Outputs vary, every change is global and errors look like successes, so check on three clocks: offline evals before a change ships, online measurement on real traffic, and runtime guardrails on every request.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Each golden case records what a good response must satisfy, not one exact answer: the behaviour, facts that must and mustn't appear, sources to cite, and tags for intent and language. Cases come from sampled traffic, edge cases, adversarial attempts and incidents, which never leave.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "2,000 cases × (1 assistant call + 5 judge calls) is 12,000 calls: about 40 minutes at 25 at a time and ~$190 a run, ~84% of it the Opus 5.5 judges. So tier it: a 200-case smoke set (~$19) on each prompt PR, the full set before releases and nightly, about $3,000 a month.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "At an 85% pass rate, 2,000 cases resolve about ±1.6 points and a 200-case slice about ±5, too coarse to see a 1-point change. Gate each intent-and-language slice on drops of 2 points or more, keep never-regress cases at 100%, compare case by case and read the cases that flipped.",
        tween: 1400,
      },
    ],
  },
  {
    id: "judge",
    label: "Judges & metrics",
    steps: [
      {
        caption:
          "Zheng et al. (MT-Bench, 2023) measured judge biases. Shown two answers in both orders, GPT-4 gave the same verdict 65.0% of the time and Claude-v1 23.8%; a list padded with a rephrased copy of itself won over Claude-v1 and GPT-3.5 in 91.3% of cases. Test your own judge for these.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Swap the answers and count a win only if it survives both orders; give a reference (maths failures fell from 14 of 20 to 3 of 20); judge with a different model, on binary rubrics. Then calibrate against two human raters with Cohen's kappa, per slice, before trusting it.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "A RAG answer fails in retrieval or in generation, and one end-to-end score can't say which. RAGAS scores context recall and precision for retrieval, faithfulness and answer relevancy for generation; plain recall@k against each case's expected sources is free and the first number to check.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Faithful isn't correct: on Day 3's Tuesday, 212 answers faithfully cited the superseded 30-day rule and would all score 1.0. Re-chunking from 800 to 300 tokens dropped context recall from 0.91 to 0.78 while faithfulness rose to 0.97: faithful, incomplete answers. Score correctness against a reference too.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "On real traffic, trust outcomes first: repeat contacts within 7 days, handoffs watched in both directions, then thumbs and a judge on ~1% of answers, with an SLO such as faithfulness ≥ 0.95 over 7 days. A thumbs A/B test needs ~8,100 rated conversations per arm: ~17 days at 10% of traffic.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "inject",
    label: "Injection",
    steps: [
      {
        caption:
          "Indirect injection: any seller can edit its own return policy, so the index holds text an attacker can write. The poisoned policy is re-indexed, retrieved for 'can I return this speaker' and ranked first, and the model can't tell text to read from text to obey.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The answer carried a markdown image whose web address held the customer's phone number and address, and each customer's browser fetched it from the attacker's server, no click needed. In EchoLeak (2025), Microsoft 365 Copilot had classifiers, a link filter and a CSP, and each had a hole.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Models can't reliably rank instructions by where they came from, and a guardrail that catches '95% of attacks' is, in Willison's words, a failing grade in web security: the attacker gets unlimited tries and needs one success. So the goal changes: make a fooled model unable to do harm.",
        tween: 1400,
      },
      {
        caption:
          "Willison's lethal trifecta: access to private data, exposure to untrusted content and a way to communicate externally. MegaMart Assist has the first two by design, so the third leg has to go: no output channel may carry data anywhere but MegaMart's own approved destinations.",
        tween: 1400,
      },
      {
        caption:
          "Product asks for send_email(to, subject, body) to send return labels, and a poisoned policy could then email order history to the attacker. Ship email_return_label(order_id) instead: the server checks the order is the customer's and fills in the address; the model only picks the order.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "defend",
    label: "Defense in depth",
    steps: [
      {
        caption:
          "A guardrail at each trust boundary: an input screen with PII tokenised, retrieval scoped to this customer, untrusted text only inside tool results, a tool gate, the customer's confirmation for side effects, and an output filter that allow-lists links and images and checks citations.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The tool gate rejects unknown tools and other customers' orders, computes the refund with refund_policy.allowed_amount() and hands anything over ₹5,000 to a person. The model never chooses whose order, the amount or a destination, and the refunds API checks permissions again.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Taint tracking: once a turn has read a seller policy, ticket summary or upload, side effects need the customer's confirmation. Confirm only side effects, so people don't learn to tap OK, and show the exact action as the server sees it: 'Refund ₹2,499 to the card ending 4412 for order 7781?'",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "PII sits in prompts, retrieved tickets, logs, eval sets and the provider. The best redaction is never fetching it; then tokenise before the model ([PHONE_1] goes in, the controller restores it), redact before storing logs, traces and eval cases, and cover them with retention and deletion.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "In Moffatt v. Air Canada (2024) the airline said its chatbot was responsible for its own words, and was ordered to pay $812.02. So hard facts come from systems, citations are verified in code, refund and policy answers get a grounding check before they're shown, and 'I don't know' hands off.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "degrade",
    label: "Degraded modes",
    steps: [
      {
        caption:
          "Each rung is worse for the customer and safer for MegaMart: the full assistant, a fallback model behind a breaker, answers without actions, no generation (a cached answer or help articles), then a human with the conversation attached. Fail closed for actions, fail soft for information.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The fallback, a smaller model or a second provider with its own prompt variant, sits behind a timeout budget and a circuit breaker. It must pass the same golden set and guardrail tests as the primary: an unevaluated fallback is untested code that only runs during incidents.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The injection screen times out for 20 minutes. Skipping it is when an attacker strikes, and blocking everything turns a guardrail outage into a full outage. Switch to answers without actions: policy answers continue, side-effect tools are off and refund requests go to agents.",
        tween: 1400,
        loop: true,
      },
    ],
  },
];


export default defineExplainer({ w: W, h: H, variants: V, Scene });
