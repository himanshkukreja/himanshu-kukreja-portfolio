/**
 * Week 5, day 3, the whole lesson (saga orchestration deep dive): the limits of a hand-built
 * orchestrator, durable execution (history events, replay without re-running activities), Temporal's
 * architecture and its rules (deterministic workflows, side-effecting activities, signals, timers),
 * and evolving and running it: patched() versioning, Uber's Cadence scale, the checklist.
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

const row = (i: number): Nd => [16, 44 + i * 44, 568, 32, ""];
const N: Record<string, Nd> = {
  wf: [16, 124, 130, 52, "Workflow|Wf"],
  a1: [200, 48, 170, 46, "reserve_inventory|reserve"],
  a2: [200, 200, 170, 46, "charge_payment|charge"],
  hi: [430, 124, 154, 52, "History"],
  cl: [16, 124, 96, 52, "Client"],
  fe: [132, 124, 104, 52, "Frontend|Front"],
  hs: [262, 60, 120, 52, "History"],
  mt: [262, 196, 120, 52, "Matching|Match"],
  ww: [420, 60, 164, 52, "Workflow worker|Wf worker"],
  aw: [420, 196, 164, 52, "Activity worker|Act worker"],
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const arch = ["cl>fe", "fe>hs", "hs>mt", "mt>ww", "mt>aw"];

const V: Vr[] = [
  {
    id: "limits",
    label: "The limits",
    s: [
      {
        c: "Yesterday's orchestrator is ordinary code: if it crashes after reserving inventory and mid-way through the charge, its state is gone. Did the payment API get the request or not?",
        k: "normal code loses its place",
        on: { wf: "bad:crashed", a1: "ok:done", a2: "warn:sent?" },
        w: ["wf>a1:ok"],
        go: ["wf>a2:warn"],
        n: "bad:function state is lost on crash|state lost on crash",
      },
      {
        c: "It also can't wait hours for a human approval without holding connections or polling, can't change logic under in-flight sagas, and can't tell you where a saga is or replay it.",
        k: "four limitations",
        on: { t0: "bad:crash recovery · was the step half-executed?|crash recovery", t1: "warn:long-running · hours of human approval|long waits", t2: "warn:versioning · in-flight sagas run old code|versioning", t3: "warn:visibility · where is it, how long stuck?|visibility" },
        n: "the fix: a workflow engine like Temporal|fix: a workflow engine",
      },
    ],
  },
  {
    id: "durable",
    label: "Durable execution",
    s: [
      {
        c: "With durable execution, every step is recorded as an event: the workflow started for order-123, reserve_inventory was scheduled, then completed with reservation res-456.",
        k: "history as events",
        on: { wf: "order-123", a1: "ok:res-456", hi: "lit:3 events" },
        w: ["wf>a1:ok"],
        go: ["a1>hi:lit"],
        n: "event sourcing for workflow state|event-sourced state",
      },
      {
        c: "It crashes after charge_payment is scheduled. On recovery the workflow replays from the start, but reserve_inventory returns its stored result instead of running again.",
        k: "crash · replay",
        on: { wf: "warn:replaying", a1: "ok:stored result|stored", a2: "warn:scheduled", hi: "4 events" },
        w: ["wf>a1:ok"],
        go: ["hi>wf:sky"],
        n: "activities are NOT re-executed on replay|not re-executed",
      },
      {
        c: "Execution continues from where it left off: a worker picks up charge_payment. Activities themselves are retried at-least-once, so they must be idempotent.",
        k: "continue",
        on: { wf: "ok:resumed", a1: "ok:done", a2: "lit:running", hi: "" },
        w: ["wf>a1:ok"],
        go: ["wf>a2:lit"],
        n: "ok:the logic takes effect once|logic takes effect once",
      },
    ],
  },
  {
    id: "temporal",
    label: "Temporal",
    s: [
      {
        c: "Temporal's frontend takes client requests, the history service stores each workflow's events, and the matching service hands tasks from task queues to workers that poll for them.",
        k: "architecture",
        on: { cl: "", fe: "", hs: "events", mt: "task queues|queues", ww: "decides", aw: "does work|work" },
        w: arch,
        go: ["cl>fe:lit", "fe>hs:lit@0.2", "hs>mt:lit@0.4", "mt>aw:lit@0.6"],
        n: "scale workers independently per queue|scale workers per queue",
        tw: 2200,
      },
      {
        c: "Workflows are deterministic orchestration: no random numbers, clock reads, UUIDs or HTTP calls; use workflow.now() and friends. Activities do the real work, with timeouts and retries.",
        k: "workflows vs activities",
        on: { t0: "lit:workflow · same input → same decisions|workflow: deterministic", t1: "bad:never in a workflow · random, time, UUID, HTTP|no random / time / HTTP", t2: "ok:use workflow.random() · now() · uuid4()|use workflow.*()", t3: "sky:activity · side effects, timeouts, retries|activity: side effects" },
        n: "replay only works if decisions repeat|replay needs determinism",
      },
      {
        c: "Signals bring external events in, like a human approval, queries read status without blocking, and durable timers let a workflow wait for days. Long workflows continue-as-new to keep history small.",
        k: "signals, queries, timers",
        on: { cl: "lit:approve|signal", fe: "", hs: "ok:waiting", mt: "", ww: "ok:resumes", aw: "" },
        w: arch,
        go: ["cl>fe:lit", "fe>hs:lit@0.3"],
        n: "workflows can run for years|can run for years",
      },
    ],
  },
  {
    id: "evolve",
    label: "Evolve + run",
    s: [
      {
        c: "Changing a workflow under in-flight runs: wrap the change in workflow.patched(\"fraud-check-v2\"). Old histories replay with False and keep the old path; new runs get True and the fraud check.",
        k: "versioning",
        on: { t0: "warn:existing runs · patched() = False → old path|existing: old path", t1: "ok:new runs · patched() = True → fraud check|new: fraud check" },
        n: "deploy without breaking in-flight work|safe deploys",
      },
      {
        c: "Uber built Cadence, Temporal's origin: about 12 billion workflow executions a month, one workflow per trip or driver, signals for events like a rider cancelling, workflows running for months.",
        k: "case study · uber cadence",
        on: { t0: "sky:~12 billion executions / month|12B / month", t1: "sky:workflow per entity · trip, driver|per trip, per driver", t2: "sky:signals · rider cancelled, driver arrived|signals for events", t3: "sky:continue-as-new for months-long runs|continue-as-new" },
        n: "Netflix Conductor: JSON-defined alternative|Conductor: JSON DSL",
      },
      {
        c: "The default: a custom orchestrator for simple sagas, Temporal for complex workflows, continue-as-new for long-running ones, signals when a human is in the loop, and a timeout on every activity.",
        k: "default approach",
        on: { t0: "ok:simple sagas → custom orchestrator|simple: custom", t1: "ok:complex workflows → Temporal|complex: Temporal", t2: "ok:long-running → Temporal + continue-as-new|long: continue-as-new", t3: "ok:human in the loop → Temporal + signals|human: signals", t4: "ok:every activity has a timeout|timeouts everywhere" },
        n: "ok:code that survives anything|code that survives",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["limits", "durable"], "durable", "Durable execution"],
    [["temporal"], "temporal", "Temporal"],
    [["evolve"], "evolve", "Evolve + run"],
  ]),
  N,
);
