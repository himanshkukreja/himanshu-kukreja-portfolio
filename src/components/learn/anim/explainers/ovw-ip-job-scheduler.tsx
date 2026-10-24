/**
 * Interview problem 17, the whole problem (design a distributed job scheduler): requirements (one-off,
 * delayed and cron jobs, retries, < 5 s start), the estimate (100M jobs, 5,800 runs/s, 10x at :00),
 * the design (Postgres with next_run_at, partitioned schedulers with etcd leases, Kafka, workers with
 * leases), finding due jobs (partitions, fencing, a timing wheel, the :00 spike) and the double run
 * (heartbeats, attempt numbers, the run key, misfire policies).
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
const part = (i: number): Nd => [16 + i * 146, 64, 130, 60, `${i * 256}–${i * 256 + 255}|P${i}`];
const slot = (i: number): Nd => [16 + i * 96, 70, 88, 56, `+${i + 1} s`];
const N: Record<string, Nd> = {
  api: [16, 50, 100, 52, "Job API|API"],
  db: [136, 50, 100, 52, "Postgres|PG"],
  sch: [256, 50, 100, 52, "Scheduler|Sched"],
  q: [376, 50, 92, 52, "Kafka"],
  w: [484, 50, 100, 52, "Worker"],
  e: [256, 160, 100, 52, "etcd"],
  dlq: [376, 160, 92, 52, "DLQ"],
  t: [484, 160, 100, 52, "Target"],
  a1: fig(0, 64, "100M jobs|100M"),
  a2: fig(1, 64, "5,800/s"),
  a3: fig(2, 64, "58,000/s|58K/s"),
  b1: fig(0, 190, "100 GB"),
  b2: fig(1, 190, "100 GB/day|100 GB/d"),
  b3: fig(2, 190, "3 TB"),
  p0: part(0),
  p1: part(1),
  p2: part(2),
  p3: part(3),
  w0: slot(0),
  w1: slot(1),
  w2: slot(2),
  w3: slot(3),
  w4: slot(4),
  w5: slot(5),
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const all = { api: "", db: "", sch: "", q: "", w: "", e: "", t: "" };
const wires = ["api>db", "sch>db", "sch~e", "sch>q", "q>w", "w>t"];
const parts = (a: string, b: string, c: string, d: string) => ({ p0: a, p1: b, p2: c, p3: d });

const V: Vr[] = [
  {
    id: "ask",
    label: "Ask + size",
    s: [
      {
        c: "Cron for a whole company: one-off, delayed and recurring jobs calling other teams' endpoints, retried with backoff, started within 5 s.",
        k: "phase 1 · requirements|requirements",
        on: { t0: "lit:run once · after a delay · on a cron schedule|once · delay · cron", t1: "targets: HTTP endpoints, container tasks|HTTP or containers", t2: "retries with backoff, then dead letter|retry, then DLQ", t3: "warn:start within 5 s, never silently skip|< 5 s, never skip", t4: "bad:a double run could bill someone twice|double run = harm" },
        n: "what can we actually guarantee?|what can we guarantee?",
      },
      {
        c: "100 million stored jobs and 500 million runs a day: about 5,800 a second, but ten times that when everyone's cron fires at :00.",
        k: "phase 2 · traffic|traffic",
        on: { a1: "stored|stored", a2: "average|avg", a3: "bad:at :00|:00" },
        w: ["a1>a2", "a2>a3:bad"],
        n: "the spike at :00 shapes the design|the :00 spike shapes it",
      },
      {
        c: "Definitions are about 100 GB; run history 100 GB a day, 3 TB for 30 days. Our side is cheap. The targets' side may not be.",
        k: "phase 2 · storage|storage",
        on: { a1: "", a2: "", a3: "", b1: "definitions|defs", b2: "run history|history", b3: "30 days|30 d" },
        w: ["a1>a2", "a2>a3", "b2>b3"],
        n: "one owner per run is the hard part|one owner per run",
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    s: [
      {
        c: "A scheduler holding a lease claims due jobs: in one transaction it records the run and advances next_run_at to the next night.",
        k: "phase 4 · claim + advance|claim",
        on: { ...all, sch: "lit:claim", db: "ok:run + next|run", e: "lease" },
        w: wires,
        go: ["sch>db:lit", "sch~e:sky"],
        n: "crash before commit = nothing happened|commit or nothing",
      },
      {
        c: "The run goes to Kafka through an outbox. A worker takes it, holds a 60-second lease with heartbeats, and calls the target.",
        k: "phase 4 · execute|execute",
        on: { ...all, q: "runnable|tasks", w: "lit:lease 60 s|lease", t: "ok:run key|key" },
        w: wires,
        go: ["sch>q:lit", "q>w:lit@0.3", "w>t:ok@0.55"],
        n: "the DB is the truth; the queue only delivers|DB is the truth",
      },
      {
        c: "A failure is retried with exponential backoff. After the last attempt the run goes to the dead-letter state and its owner is alerted.",
        k: "phase 4 · retry + dead letter|retry",
        on: { ...all, w: "warn:attempt 5|5th try", t: "bad:failing", dlq: "bad:dead" },
        w: [...wires, "w>dlq:bad"],
        go: ["w>t:bad", "w>dlq:bad@0.4"],
        n: "backoff with jitter, so retries don't sync|backoff + jitter",
      },
    ],
  },
  {
    id: "due",
    label: "Due jobs",
    s: [
      {
        c: "Jobs are split into 1,024 partitions by hash. Each scheduler holds etcd leases for some, and range-scans next_run_at in just those.",
        k: "deep dive 1 · partitions|partitions",
        on: parts("ok:sched A", "ok:sched A", "ok:sched B", "ok:sched C"),
        x: [[16, 170, "index on (partition, next_run_at)|index: (partition, time)"], [16, 200, "ok:due in the next 5 s = a short range scan|a short range scan"]],
        n: "no table scans, no single loop|no scans, no single loop",
      },
      {
        c: "Scheduler B dies. Its leases expire in seconds and A takes them over. Fencing tokens reject any late write from B's old lease.",
        k: "deep dive 1 · failover|failover",
        on: parts("ok:sched A", "ok:sched A", "warn:B → A", "ok:sched C"),
        x: [[16, 170, "bad:old lease holder writes → rejected|old lease → rejected"], [16, 200, "ok:conditional claim: WHERE next_run_at = $2|conditional claim"]],
        n: "one owner per partition, always|one owner, always",
      },
      {
        c: "For the next minute, a timing wheel: load what's due into one bucket per second, and fire each bucket as the hand reaches it.",
        k: "deep dive 1 · timing wheel|timing wheel",
        on: { w0: "lit:firing|fire", w1: "12 jobs|12", w2: "4 jobs|4", w3: "30 jobs|30", w4: "1 job|1", w5: "8 jobs|8" },
        x: [[16, 170, "loaded from the DB every few seconds|reloaded from the DB"], [16, 200, "ok:the DB stays the source of truth|DB stays the truth"]],
        n: "no polling delay for near-future jobs|no polling delay",
      },
      {
        c: "The :00 spike: claim runs a few seconds early, jitter jobs that allow a window, and give each team its own queue and quota.",
        k: "deep dive 1 · the spike|the spike",
        on: { t0: "ok:look-ahead: enqueue up to 5 s early|look-ahead 5 s", t1: "ok:jitter inside the job's allowed window|jitter in window", t2: "ok:per-team queues and quotas|per-team quotas", t3: "bad:not: re-scanning everything at 14:00|not: full scans" },
        n: "one team's 50,000 jobs can't starve another's 5|no team starves another",
      },
    ],
  },
  {
    id: "twice",
    label: "Runs twice",
    s: [
      {
        c: "A worker calls billing and dies before recording success. Did the call work? Nobody knows, so the run is retried: at-least-once.",
        k: "deep dive 2 · at-least-once|at-least-once",
        on: { ...all, w: "bad:died|dead", t: "warn:did it run?|?" },
        w: wires,
        go: ["w>t:warn"],
        n: "exactly-once over a network isn't on offer|no exactly-once here",
      },
      {
        c: "Each attempt gets a higher number. When a paused zombie worker wakes up, its writes as attempt 2 are rejected: attempt 3 owns it.",
        k: "deep dive 2 · fencing|fencing",
        on: { t0: "attempt 2 · lease expired during a GC pause|attempt 2 · paused", t1: "ok:attempt 3 · running, lease fresh|attempt 3 · running", t2: "bad:attempt 2 wakes · status write rejected|attempt 2 → rejected" },
        n: "leases need fencing to stop zombies|leases + fencing",
      },
      {
        c: "Every call carries the run key (job_id, scheduled_at). Billing stores the keys it has done, so a repeat returns the first result.",
        k: "deep dive 2 · the run key|run key",
        on: { ...all, w: "attempt 3|try 3", t: "ok:dedupe|dedupe" },
        w: wires,
        go: ["w>t:ok"],
        n: "ok:a double run becomes harmless|double run = harmless",
      },
      {
        c: "The whole answer: partitioned schedulers with leases, the DB as truth, at-least-once runs, fencing, run keys and misfire policies.",
        k: "the decision|decision",
        on: { t0: "ok:partitions + etcd leases + index on next_run_at|partitions + leases", t1: "ok:outbox → Kafka; the database is the truth|DB is the truth", t2: "ok:at-least-once + fencing + run keys|fencing + run keys", t3: "ok:misfire policy: run once · run all · skip|misfire policies", t4: "warn:gave up: a promise of exactly-once|gave up: exactly-once" },
        n: "honest guarantees, harmless repeats|honest guarantees",
      },
    ],
  },
];

export default build(V, N);
