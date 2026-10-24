/**
 * Interview problem 20, the whole problem (design a payment system): requirements (pay-in through
 * PSPs, refunds, ledger, payouts, reconciliation), the estimate (1M payments/day, 120/s peak,
 * ~300 GB/year of ledger), the design (state machine, PSP adapters, outbox → Kafka), never charging
 * twice (timeout = unknown, one idempotency key per hop, guarded transitions) and the double-entry
 * ledger with daily reconciliation.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

/* ---------------------------------------------------------------- overview engine (shared shape) */
type K = "t" | "s" | "k" | "d";
type Nd = [x: number, y: number, w: number, h: number, label: string];
type St = {
  c: string; // caption (narrated)
  k: string; // kicker, top left
  on: Record<string, string>; // visible nodes → "tone:sub|narrow sub" (tone: lit ok bad warn sky mute dim)
  w?: string[]; // wires "a>b:tone" (">" solid, "~" dashed, ")" vertical-then-horizontal, "^" horizontal-then-vertical)
  go?: string[]; // moving tokens "a>b:tone*count@delay"
  m?: [x: number, y: number, w: number, label: string, v: number, max: number, tone?: Tone];
  x?: [x: number, y: number, text: string, k?: K, anchor?: "start" | "middle" | "end"][];
  n: string; // bottom note "tone:text|narrow"
  tw?: number;
  ms?: number;
  lp?: boolean;
};
type Vr = { id: string; label: string; s: St[] };
type P = { x: number; y: number };
const TONES = ["lit", "ok", "bad", "warn", "sky", "mute", "dim"];
const nar = (s: string, n: boolean) => {
  const i = s.indexOf("|");
  return i < 0 ? s : n ? s.slice(i + 1) : s.slice(0, i);
};
const tn = (v: string): [Tone | "dim", string] => {
  const i = v.indexOf(":");
  const h = i < 0 ? v : v.slice(0, i);
  return TONES.includes(h) ? [h as Tone | "dim", i < 0 ? "" : v.slice(i + 1)] : [undefined, v];
};
const WR = /^(\w+)([>~)^])(\w+)(?::(\w+))?(?:\*(\d+))?(?:@([\d.]+))?$/;
function route(a: Nd, b: Nd, mode: string): P[] {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  if (mode === "^") {
    const qx = bx + bw / 2;
    const down = by > ay;
    const q = { x: qx, y: down ? by : by + bh };
    if (qx > ax && qx < ax + aw) return [{ x: qx, y: down ? ay + ah : ay }, q];
    const p = { x: qx > ax ? ax + aw : ax, y: ay + ah / 2 };
    return [p, { x: qx, y: p.y }, q];
  }
  if (mode === ")") {
    const qy = by + bh / 2;
    const p = { x: ax + aw / 2, y: qy > ay ? ay + ah : ay };
    return [p, { x: p.x, y: qy }, { x: bx > ax ? bx : bx + bw, y: qy }];
  }
  if (ax + aw <= bx || bx + bw <= ax) {
    const r = bx > ax;
    const p = { x: r ? ax + aw : ax, y: ay + ah / 2 };
    const q = { x: r ? bx : bx + bw, y: by + bh / 2 };
    const mx = (p.x + q.x) / 2;
    return p.y === q.y ? [p, q] : [p, { x: mx, y: p.y }, { x: mx, y: q.y }, q];
  }
  const d = by > ay;
  const p = { x: ax + aw / 2, y: d ? ay + ah : ay };
  const q = { x: bx + bw / 2, y: d ? by : by + bh };
  const my = (p.y + q.y) / 2;
  return p.x === q.x ? [p, q] : [p, { x: p.x, y: my }, { x: q.x, y: my }, q];
}
function along(pts: P[], f: number): P {
  const ls = pts.slice(1).map((q, i) => Math.abs(q.x - pts[i].x) + Math.abs(q.y - pts[i].y));
  let r = f * ls.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ls.length; i++) {
    if (r <= ls[i] || i === ls.length - 1) {
      const u = ls[i] ? Math.min(1, r / ls[i]) : 1;
      return { x: lerp(pts[i].x, pts[i + 1].x, u), y: lerp(pts[i].y, pts[i + 1].y, u) };
    }
    r -= ls[i];
  }
  return pts[0];
}
function Overview({ V, N, p }: { V: Vr[]; N: Record<string, Nd>; p: SceneProps }) {
  const v = V.find((x) => x.id === p.variant) ?? V[0];
  const s = v.s[Math.min(p.step, v.s.length - 1)];
  const pr = p.step > 0 ? v.s[p.step - 1] : undefined;
  const e = ease(p.t);
  const wires = [...(s.w ?? []), ...(s.go ?? [])].map((w) => WR.exec(w)).filter((m): m is RegExpExecArray => !!m && m[1] in s.on && m[3] in s.on && !!N[m[1]] && !!N[m[3]]);
  const toks = (s.go ?? []).flatMap((g, gi) => {
    const m = WR.exec(g);
    if (!m || !N[m[1]] || !N[m[3]]) return [];
    const pts = route(N[m[1]], N[m[3]], m[2]);
    const c = Number(m[5] ?? 1);
    return Array.from({ length: c }, (_, i) => {
      const d = Number(m[6] ?? 0); // start delay, as a fraction of the tween
      const u = seg(p.t, d + i * 0.1, d + (1 - d) * 0.6 + i * 0.1);
      const f = s.lp ? (p.clock * 0.5 + i / c) % 1 : 0.94 * u;
      return { ...along(pts, f), tone: (m[4] ?? "lit") as Tone, key: `${gi}-${i}`, o: s.lp || (u > 0 && u < 1) ? 1 : 0 };
    });
  });
  const mv = s.m && pr?.m && pr.m[3] === s.m[3] ? lerp(pr.m[4], s.m[4], e) : s.m?.[4] ?? 0;
  const [nt, ntext] = tn(s.n);
  return (
    <g>
      <Txt x={16} y={26} k="k" anchor="start">
        {nar(s.k, p.narrow)}
      </Txt>
      {wires.map((m, i) => {
        const pts = route(N[m[1]], N[m[3]], m[2]);
        const tone = m[4] as Tone;
        return <Wire key={i} d={`M${pts.map((q) => `${q.x} ${q.y}`).join("L")}`} tone={tone} dash={m[2] === "~"} arrow />;
      })}
      {Object.entries(s.on).map(([id, val]) => {
        const nd = N[id];
        if (!nd) return null;
        const [tone, sub] = tn(val);
        const fresh = pr && !(id in pr.on);
        const sb = sub ? nar(sub, p.narrow) : undefined;
        const thin = nd[3] < 36; // short boxes carry their state inline: "Payment · < 3 s"
        return (
          <Box key={id} x={nd[0]} y={nd[1]} w={nd[2]} h={nd[3]} label={thin && sb ? (nd[4] ? `${nar(nd[4], p.narrow)} · ${sb}` : sb) : nar(nd[4], p.narrow)} sub={thin ? undefined : sb} tone={tone === "dim" ? undefined : tone} dim={tone === "dim"} opacity={fresh ? e : undefined} />
        );
      })}
      {toks.map((k) => (
        <Token key={k.key} x={k.x} y={k.y} s={10} tone={k.tone} opacity={k.o} />
      ))}
      {s.m && (
        <g>
          <Txt x={s.m[0]} y={s.m[1] - 7} k="s" anchor="start">
            {nar(s.m[3], p.narrow)}
          </Txt>
          <Meter x={s.m[0]} y={s.m[1]} w={s.m[2]} h={10} value={mv} max={s.m[5]} tone={s.m[6]} />
        </g>
      )}
      {(s.x ?? []).map(([x, y, text, k, a], i) => {
        const [tone, body] = tn(text);
        return (
          <Txt key={i} x={x} y={y} k={k ?? "s"} anchor={a ?? "start"} tone={tone === "dim" ? "mute" : tone}>
            {nar(body, p.narrow)}
          </Txt>
        );
      })}
      <Txt x={16} y={304} anchor="start" tone={nt === "dim" ? "mute" : nt}>
        {nar(ntext, p.narrow)}
      </Txt>
    </g>
  );
}
const build = (V: Vr[], N: Record<string, Nd>) =>
  defineExplainer({
    w: 600,
    h: 320,
    variants: V.map((v) => ({ id: v.id, label: v.label, steps: v.s.map((s) => ({ caption: s.c, tween: s.tw ?? 1400, ms: s.ms ?? 3800, loop: s.lp })) })),
    Scene: (p: SceneProps) => <Overview V={V} N={N} p={p} />,
  });
/* ---------------------------------------------------------------- this problem */

const row = (i: number): Nd => [16, 44 + i * 44, 568, 32, ""];
const fig = (i: number, y: number, label: string): Nd => [16 + i * 199, y, 170, 60, label];
const N: Record<string, Nd> = {
  ck: [16, 50, 100, 52, "Checkout|Order"],
  ps: [136, 50, 100, 52, "Payments|Pay"],
  ad: [256, 50, 100, 52, "Adapter"],
  psp: [376, 50, 92, 52, "PSP"],
  bk: [484, 50, 100, 52, "Bank"],
  db: [136, 150, 100, 52, "Postgres|PG"],
  k: [16, 230, 100, 52, "Kafka"],
  rc: [376, 150, 92, 52, "Recon"],
  a1: fig(0, 64, "1M/day"),
  a2: fig(1, 64, "12/s"),
  a3: fig(2, 64, "120/s"),
  b1: fig(0, 190, "4 entries|4 rows"),
  b2: fig(1, 190, "800 MB/day|800 MB/d"),
  b3: fig(2, 190, "300 GB/yr"),
  s1: [16, 64, 130, 56, "CREATED|NEW"],
  s2: [162, 64, 130, 56, "PROCESSING|PROC"],
  s3: [308, 64, 130, 56, "SUCCEEDED|OK"],
  s4: [454, 64, 130, 56, "FAILED|FAIL"],
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const all = { ck: "", ps: "", ad: "", psp: "", bk: "", db: "", k: "", rc: "" };
const wires = ["ck>ps", "ps>ad", "ad>psp", "psp>bk", "ps>db", "db>k", "k>ck", "psp~rc", "rc>db"];

const V: Vr[] = [
  {
    id: "ask",
    label: "Ask + size",
    s: [
      {
        c: "Charge through payment providers, refund, pay sellers, keep a ledger and reconcile daily. Never charge twice, never lose a payment.",
        k: "phase 1 · requirements|requirements",
        on: { t0: "lit:pay-in through PSPs · refunds · payouts|pay-in · refunds · payouts", t1: "ok:card numbers stay with the PSP: tokens only|tokens, no card data", t2: "double-entry ledger, never edited|double-entry ledger", t3: "daily reconciliation with every PSP|daily reconciliation", t4: "bad:fail a payment rather than charge twice|fail > double charge" },
        n: "correctness over availability|correctness first",
      },
      {
        c: "A million payments a day is 12 a second, about 120 at a sale peak. Each writes around 4 ledger entries: about 300 GB a year.",
        k: "phase 2 · volume|volume",
        on: { a1: "payments", a2: "average|avg", a3: "warn:peak", b1: "per payment|each", b2: "ledger|ledger", b3: "ok:keep 7+ years|7+ yrs" },
        w: ["a1>a2", "a2>a3", "b1>b2", "b2>b3"],
        n: "ok:one relational database is plenty|one database is plenty",
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    s: [
      {
        c: "Checkout creates pay_31 with an idempotency key. It's marked PROCESSING before the PSP is ever called.",
        k: "phase 4 · create|create",
        on: { ...all, ps: "lit:pay_31", db: "ok:PROCESSING|PROC" },
        w: wires,
        go: ["ck>ps:lit", "ps>db:lit@0.3"],
        n: "write down your intent before acting|intent first",
      },
      {
        c: "The adapter charges through the PSP, passing pay_31 as the PSP's own idempotency key. The PSP talks to the card network or bank.",
        k: "phase 4 · charge|charge",
        on: { ...all, ad: "lit:key pay_31|key", psp: "charge", bk: "ok:debit" },
        w: wires,
        go: ["ps>ad:lit", "ad>psp:lit@0.25", "psp>bk:ok@0.5"],
        n: "one key per hop|one key per hop",
      },
      {
        c: "Success is written with its ledger entries and an outbox row in one transaction. The relay publishes it; the order is marked paid.",
        k: "phase 4 · record + publish|record",
        on: { ...all, db: "ok:1 txn", k: "ok:succeeded|paid", ck: "ok:paid" },
        w: wires,
        go: ["ps>db:ok", "db>k:ok@0.3", "k>ck:ok@0.55"],
        n: "published if and only if committed|published iff committed",
      },
    ],
  },
  {
    id: "twice",
    label: "Never twice",
    s: [
      {
        c: "The PSP call times out. That means unknown, not failed: the card may be charged and only the reply lost. A new charge could bill twice.",
        k: "deep dive 1 · the timeout|timeout",
        on: { ...all, ad: "warn:timeout", psp: "warn:charged?|?" },
        w: wires,
        go: ["ad>psp:warn"],
        n: "bad:never retry as a brand-new charge|no new charge",
      },
      {
        c: "Retry with the same key pay_31: if the first charge went through, the PSP returns it instead of charging again. Or ask for its status.",
        k: "deep dive 1 · same key|same key",
        on: { ...all, ad: "lit:same key|retry", psp: "ok:deduped|dedupe" },
        w: wires,
        go: ["ad>psp:lit", "ad>psp:ok@0.5"],
        n: "ok:the retry is safe because the key is the same|same key = safe retry",
      },
      {
        c: "One key per hop: the client's key, our payment ID at the PSP, the PSP's event ID on webhooks, and the outbox event ID downstream.",
        k: "deep dive 1 · every hop|every hop",
        on: { t0: "ok:client → us · Idempotency-Key, unique in our table|client → us", t1: "ok:us → PSP · payment_id as the PSP's key|us → PSP", t2: "ok:PSP → us · event ID + signature on webhooks|PSP → us", t3: "ok:us → orders · outbox event ID|us → orders" },
        n: "every retry anywhere is safe|every retry is safe",
      },
      {
        c: "Transitions are guarded: SUCCEEDED only from PROCESSING. The API reply and the webhook race; the first wins, the second does nothing.",
        k: "deep dive 1 · state machine|state machine",
        on: { s1: "", s2: "lit:sent", s3: "ok:first wins|wins", s4: "dim:" },
        w: ["s1>s2", "s2>s3:ok"],
        x: [[16, 170, "ok:UPDATE … SET status='SUCCEEDED' WHERE status='PROCESSING'|WHERE status = PROCESSING"], [16, 200, "duplicate webhook → 0 rows → no-op|duplicate → no-op"]],
        n: "SUCCEEDED never goes back; refunds are new records|refunds are new records",
      },
    ],
  },
  {
    id: "ledger",
    label: "Ledger",
    s: [
      {
        c: "Double-entry: a ₹1,000 payment debits PSP receivable 1,000 and credits the seller 970 and our fee 30. It sums to zero.",
        k: "deep dive 2 · pay-in|pay-in",
        on: { t0: "lit:debit · PSP receivable · ₹1,000|DR receivable 1,000", t1: "credit · seller payable · ₹970|CR seller 970", t2: "credit · platform fee revenue · ₹30|CR fee 30", t3: "ok:debits = credits · written once, never edited|sums to zero" },
        n: "balances are sums of entries, not columns|balances are sums",
      },
      {
        c: "Next day the PSP settles ₹980 and keeps a ₹20 fee: debit bank 980 and fees 20, credit PSP receivable 1,000. Balanced again.",
        k: "deep dive 2 · settlement|settlement",
        on: { t0: "debit · bank account · ₹980|DR bank 980", t1: "debit · PSP fees expense · ₹20|DR PSP fees 20", t2: "lit:credit · PSP receivable · ₹1,000|CR receivable 1,000", t3: "ok:receivable back to zero: the money arrived|receivable = 0" },
        n: "a bug shows up as a ledger that won't balance|bugs can't hide",
      },
      {
        c: "Every day each PSP's settlement file is matched line by line against the ledger. Mismatches are fixed by new entries or go to finance ops.",
        k: "deep dive 2 · reconciliation|reconciliation",
        on: { ...all, psp: "settlement|file", rc: "lit:match|match", db: "ok:ledger" },
        w: wires,
        go: ["psp~rc:sky", "rc>db:lit@0.4"],
        n: "a day closes only when every line is explained|every line explained",
      },
      {
        c: "The whole answer: tokens not cards, a guarded state machine, one idempotency key per hop, a double-entry ledger, daily reconciliation.",
        k: "the decision|decision",
        on: { t0: "ok:PSP tokens, no raw card data|tokens, no card data", t1: "ok:guarded state machine + outbox|state machine + outbox", t2: "ok:one idempotency key per hop|key per hop", t3: "ok:append-only double-entry ledger + reconciliation|ledger + recon", t4: "warn:gave up: availability during incidents|gave up: availability" },
        n: "prove where every rupee went|prove every rupee",
      },
    ],
  },
];

export default build(V, N);
