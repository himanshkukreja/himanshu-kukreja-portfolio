/**
 * Week 5, day 2, the whole lesson (the saga pattern): a transfer that half-completes across
 * services, why two-phase commit blocks, the saga (T1..T4 with compensations, a pivot, forward vs
 * backward recovery, compensation rules), choreography vs orchestration, and Airbnb's booking saga.
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
/** regroup scenes into tabs: [["scene" | "scene.from.to", ...], id, label] */
const tabs = (V: Vr[], g: [string[], string, string][]): Vr[] =>
  g.map(([specs, id, label]) => ({
    id,
    label,
    s: specs.flatMap((sp) => {
      const [vid, a, b] = sp.split(".");
      const s = V.find((v) => v.id === vid)?.s ?? [];
      return a === undefined ? s : s.slice(Number(a), b === undefined ? undefined : Number(b));
    }),
  }));
const build = (V: Vr[], N: Record<string, Nd>) =>
  defineExplainer({
    w: 600,
    h: 320,
    variants: V.map((v) => ({ id: v.id, label: v.label, steps: v.s.map((s) => ({ caption: s.c, tween: s.tw ?? 1400, ms: s.ms ?? 3800, loop: s.lp })) })),
    Scene: (p: SceneProps) => <Overview V={V} N={N} p={p} />,
  });
/* ---------------------------------------------------------------- this lesson */

const P = (i: number, label: string): Nd => [16 + i * 146, 196, 130, 52, label];
const row = (i: number): Nd => [16, 44 + i * 44, 568, 32, ""];
const N: Record<string, Nd> = {
  co: [228, 40, 144, 48, "Coordinator|Coord."],
  or: [228, 40, 144, 48, "Orchestrator|Orch."],
  a1: P(0, "Account"),
  a2: P(1, "Payment"),
  a3: P(2, "Inventory|Stock"),
  p1: P(0, "Inventory|Stock"),
  p2: P(1, "Payment"),
  p3: P(2, "Shipping|Ship"),
  p4: P(3, "Notify"),
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const chain = ["p1>p2", "p2>p3", "p3>p4"];

const V: Vr[] = [
  {
    id: "problem",
    label: "The problem",
    s: [
      {
        c: "In one database, a transfer is one transaction: debit A, credit B, commit. If anything fails, it rolls back automatically and the money never disappears.",
        k: "one database: ACID for free",
        on: { a1: "ok:debit + credit|1 txn" },
        x: [[16, 150, "BEGIN … COMMIT · or ROLLBACK|BEGIN … COMMIT"]],
        n: "ok:all or nothing|all or nothing",
      },
      {
        c: "Across microservices: the account service debited $100, the payment service charged the card, then the inventory service failed. These are different databases: there's nothing to roll back.",
        k: "microservices: no rollback",
        on: { a1: "ok:debited", a2: "ok:charged", a3: "bad:FAILED" },
        w: ["a1>a2:ok", "a2>a3:bad"],
        n: "bad:money taken, nothing reserved|charged, nothing reserved",
      },
    ],
  },
  {
    id: "twopc",
    label: "Why not 2PC",
    s: [
      {
        c: "Two-phase commit: a coordinator asks every participant to prepare, and each one holds its locks from prepare until the decision arrives.",
        k: "two-phase commit",
        on: { co: "lit:PREPARE", a1: "warn:locked", a2: "warn:locked", a3: "warn:locked" },
        go: ["co^a1:lit", "co^a2:lit", "co^a3:lit"],
        n: "everyone waits for the slowest|everyone waits",
      },
      {
        c: "If the coordinator crashes after prepare, the participants don't know whether to commit or abort, and stay locked. And Kafka, NoSQL stores and Stripe can't take part at all.",
        k: "blocking, in doubt",
        on: { co: "bad:crashed", a1: "bad:in doubt|doubt", a2: "bad:in doubt|doubt", a3: "bad:in doubt|doubt" },
        w: ["co^a1:bad", "co^a2:bad", "co^a3:bad"],
        n: "bad:you can't tell Stripe to prepare|Stripe can't prepare",
      },
    ],
  },
  {
    id: "saga",
    label: "The saga",
    s: [
      {
        c: "A saga is a sequence of local transactions: reserve inventory, create payment, ship the order, send confirmation. Each step commits on its own, and each has a compensation.",
        k: "T1 → T2 → T3 → T4",
        on: { p1: "ok:T1 reserve|T1", p2: "ok:T2 pay|T2", p3: "T3 ship", p4: "T4 confirm|T4" },
        w: chain,
        go: ["p1>p2:ok", "p2>p3:ok@0.4"],
        n: "no distributed locks|no distributed locks",
      },
      {
        c: "If payment fails, compensate what already happened: C1 releases the inventory. A compensation is a new transaction, like a refund record, not a rollback; history keeps both.",
        k: "backward recovery · compensate",
        on: { p1: "warn:C1 release|C1", p2: "bad:T2 failed|failed", p3: "dim", p4: "dim" },
        w: ["p1>p2:bad", "p2>p3", "p3>p4"],
        go: ["p2>p1:warn"],
        n: "semantic reversal, not a database undo|semantic undo",
      },
      {
        c: "Shipping is the pivot, the point of no return: you can't unship. Before it, compensate; after it, forward recovery, retrying the remaining steps until they succeed.",
        k: "the pivot · forward recovery",
        on: { p1: "ok:T1", p2: "ok:T2", p3: "lit:T3 PIVOT|pivot", p4: "warn:retry until ok|retry" },
        w: ["p1>p2:ok", "p2>p3:ok"],
        go: ["p3>p4:warn*2"],
        n: "before: compensate · after: must complete|compensate, then complete",
      },
      {
        c: "Compensations must undo the business effect, be idempotent with a compensation ID, do nothing if the step never ran, and never fail: retry them, and alert a human as a last resort.",
        k: "designing compensations",
        on: { t0: "ok:semantic · cancel_order, not DELETE|semantic", t1: "ok:idempotent · run twice = once|idempotent", t2: "ok:handle missing original · no-op|no-op if missing", t3: "warn:never fail · retry, then alert|never fail" },
        n: "a failed compensation is a stuck saga|failed compensation = stuck",
      },
    ],
  },
  {
    id: "coord",
    label: "Coordination",
    s: [
      {
        c: "Choreography: no coordinator. Services react to each other's events; on payment.failed, inventory releases its reservation and orders mark the order failed. Good for 2 to 4 steps.",
        k: "choreography · events",
        on: { p1: "warn:releases", p2: "bad:payment.failed|failed", p3: "", p4: "" },
        w: chain,
        go: ["p2>p1:bad"],
        n: "loose coupling, but the flow is hard to see|hard to see the flow",
      },
      {
        c: "Orchestration: a central orchestrator tells each service what to do and runs the compensations itself. Easier to follow and change; this lesson's default for anything non-trivial, 5+ steps.",
        k: "orchestration · commands",
        on: { or: "lit:runs the saga|in charge", p1: "ok:reserved", p2: "ok:charged", p3: "ok:created", p4: "" },
        w: ["or^p1:ok", "or^p2:ok", "or^p3:ok", "or^p4"],
        go: ["or^p1:lit", "or^p2:lit@0.3", "or^p3:lit@0.6"],
        n: "ok:start with orchestration|default: orchestrate",
        tw: 2200,
      },
    ],
  },
  {
    id: "real",
    label: "In practice",
    s: [
      {
        c: "Airbnb's booking: hold the dates, pre-authorize payment, wait up to 24 hours for the host, with a timer that compensates if they don't answer, then capture the payment, the pivot, and send emails.",
        k: "case study · airbnb booking",
        on: { t0: "ok:T1 hold dates · C1 release|hold dates", t1: "ok:T2 pre-authorize · C2 void|pre-auth", t2: "warn:T3 host confirms within 24 h · timer|host · 24 h", t3: "lit:T4 capture payment · PIVOT|capture · pivot", t4: "T5 confirmation emails · forward|emails" },
        n: "async steps need timeouts|async steps need timeouts",
      },
      {
        c: "Before shipping a saga, check: every step has an idempotency key, saga state is persisted to survive a crash, the pivot is clear, external calls time out, and compensations retry without limit.",
        k: "checklist",
        on: { t0: "ok:idempotency key on every step|idempotency keys", t1: "ok:saga state persisted|state persisted", t2: "ok:pivot clearly defined|clear pivot", t3: "ok:timeouts on external calls|timeouts", t4: "ok:compensation retries forever|retry compensations" },
        n: "ok:local transactions + compensation|local txns + compensation",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["problem", "twopc"], "why", "Why sagas"],
    [["saga"], "saga", "The saga"],
    [["coord", "real"], "coord", "Coordination"],
  ]),
  N,
);
