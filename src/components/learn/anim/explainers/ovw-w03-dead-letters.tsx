/**
 * Week 3, day 4, the whole lesson (dead letters and poison pills): the 4-hour crash loop on message
 * #4,521,892, the failure taxonomy (transient, permanent, poison) and where each goes, the DLQ
 * lifecycle (retries, DLQ with context, fix, idempotent replay), and operating it: preserved retry
 * counts, versioned replays, depth alerts and retention.
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

const N: Record<string, Nd> = {
  pr: [16, 128, 96, 48, "Producer|Prod."],
  top: [134, 128, 114, 48, "orders"],
  con: [270, 128, 124, 48, "Consumer|Cons."],
  k8s: [270, 228, 124, 46, "Kubernetes|K8s"],
  rt: [270, 40, 124, 46, "retry topics|retries"],
  dv: [430, 40, 154, 46, "validation"],
  dt: [430, 128, 154, 48, "transient"],
  dp: [430, 216, 154, 46, "poison"],
  dlq: [430, 128, 154, 48, "orders.dlq|DLQ"],
  eng: [430, 228, 154, 46, "Engineer|Eng."],
  rp: [136, 228, 108, 46, "Replay|Replay"],
};
const main = ["pr>top", "top>con"];

const V: Vr[] = [
  {
    id: "spiral",
    label: "The spiral",
    s: [
      {
        c: "Message #4,521,892 has invalid JSON in its items field. The consumer throws, crashes, Kubernetes restarts it, and it fetches the same message again.",
        k: "00:00 · the poison pill",
        on: { pr: "", top: "bad:#4,521,892", con: "bad:crash", k8s: "warn:restart" },
        w: main,
        go: ["con>k8s:bad", "k8s>con:warn", "top>con:bad"],
        n: "bad:crash · restart · same message · crash|crash, restart, repeat",
        tw: 2000,
      },
      {
        c: "Four hours and about 50 restarts later, on-call wakes up: 50,000 messages stuck behind the pill, customers can't check out, $847,000 lost.",
        k: "04:00 · 50 restarts later",
        on: { pr: "", top: "bad:50,000 stuck|50K stuck", con: "bad:crash loop|loop", k8s: "bad:every 5 min|5 min" },
        w: ["pr>top", "top>con:bad", "con>k8s:bad"],
        m: [136, 202, 108, "stuck|stuck", 1, 1, "bad"],
        x: [[584, 90, "bad:$847,000", "d", "end"]],
        n: "bad:one message froze the pipeline|one message froze it all",
      },
    ],
  },
  {
    id: "classify",
    label: "Classify",
    s: [
      {
        c: "Transient failures, like a database timeout or a 429, are worth retrying: retry topics with 1 s, 10 s and 60 s delays, then back to orders.",
        k: "transient · retry with backoff",
        on: { pr: "", top: "", con: "warn:DB timeout|timeout", rt: "warn:1s · 10s · 60s|1s·10s·60s" },
        w: main,
        go: ["con>rt:warn", "rt>top:warn"],
        n: "after N retries, assume permanent|then assume permanent",
      },
      {
        c: "Permanent failures, like bad JSON or a missing field, will never succeed: no retry, straight to the validation DLQ, where the data can be fixed.",
        k: "permanent · DLQ immediately",
        on: { pr: "", top: "", con: "missing field|bad field", dv: "lit:fix the data|fix data", dt: "dim", dp: "dim" },
        w: main,
        go: ["con>dv:lit"],
        n: "retrying bad data changes nothing|retry won't help",
      },
      {
        c: "Poison pills crash or hang the consumer. Quarantine them at once, caught by a processing timeout of about twice normal time, and page someone.",
        k: "poison · quarantine now",
        on: { pr: "", top: "", con: "bad:hangs", dv: "", dt: "", dp: "bad:page on-call|page" },
        w: main,
        go: ["con>dp:bad"],
        n: "ok:the queue keeps moving|queue keeps moving",
      },
    ],
  },
  {
    id: "lifecycle",
    label: "Lifecycle",
    s: [
      {
        c: "An order arrives with items as a string. Attempt 1: ValueError, items not a list. Attempts 2 and 3 fail the same way.",
        k: "attempts 1, 2, 3",
        on: { pr: "", top: "", con: "bad:ValueError ×3|×3", rt: "warn:attempt 3|3rd" },
        w: main,
        go: ["con>rt:warn*3"],
        n: "same error every time|same error",
      },
      {
        c: "Max retries exceeded: it moves to orders.dlq with full context: the original message, the error and stack trace, retry count, topic, partition and offset.",
        k: "to the DLQ, with context",
        on: { pr: "", top: "", con: "", dlq: "lit:+ error context|+ context" },
        w: main,
        go: ["con>dlq:lit"],
        n: "enough to debug without other systems|debug from the DLQ alone",
      },
      {
        c: "An engineer inspects the message, finds the bug in the producer and fixes it. A DLQ is an operational tool, not a graveyard.",
        k: "investigate",
        on: { pr: "warn:bug fixed|fixed", top: "", con: "", dlq: "1 message", eng: "ok:found it" },
        w: main,
        go: ["dlq>eng:sky"],
        n: "build the tooling from day one|tooling from day one",
      },
      {
        c: "Replay republishes the fixed message to orders and it succeeds. Each replay checks the idempotency key first, so a payment is never charged twice.",
        k: "replay, idempotently",
        on: { pr: "", top: "ok:", con: "ok:processed", dlq: "ok:empty", rp: "ok:checks id" },
        w: main,
        go: ["dlq)rp:ok", "rp>top:ok", "top>con:ok"],
        n: "ok:payments: never auto-replay unreviewed|never auto-replay payments",
      },
    ],
  },
  {
    id: "operate",
    label: "Operate",
    s: [
      {
        c: "An infinite retry loop: each consumer resets the retry count to 0. Read it from the message headers, increment it, and enforce the maximum.",
        k: "edge case · infinite retry",
        on: { pr: "", top: "", con: "bad:count = 0", rt: "bad:forever" },
        w: main,
        go: ["con>rt:bad", "rt>top:bad"],
        n: "retry_count lives in the headers|count in headers",
      },
      {
        c: "Replay can fail with a new bug: the format evolved and old messages lack the new price field. Version messages and migrate them on replay.",
        k: "edge case · replay fails again",
        on: { pr: "", top: "", con: "bad:no price field|no price", dlq: "warn:v1 messages|v1", rp: "warn:migrate v1|migrate" },
        w: main,
        go: ["dlq)rp:warn", "rp>top:warn"],
        n: "include the schema version|keep schema version",
      },
      {
        c: "Monitor it: DLQ depth warns at 100 and is critical at 1,000, and the oldest message must not pass 24 hours. Keep 7 days hot, 90 days in S3.",
        k: "monitor and retain",
        on: { pr: "", top: "ok:", con: "ok:", dv: "fix data", dt: "auto-retry", dp: "page" },
        w: [...main, "con>dv", "con>dt", "con>dp"],
        m: [136, 220, 248, "DLQ depth · alert 100 / 1,000|depth 100/1,000", 0.12, 1, "ok"],
        n: "ok:a DLQ is a signal, not a black hole|a signal, not a black hole",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["spiral", "classify"], "classify", "Spiral + classify"],
    [["lifecycle"], "lifecycle", "Lifecycle"],
    [["operate"], "operate", "Operate"],
  ]),
  N,
);
