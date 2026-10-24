/**
 * Interview problem 16, the whole problem (design an ad click aggregation system): requirements
 * (fresh per-ad counts, billing-grade correctness, late clicks), the estimate (1B clicks/day,
 * 50,000/s peak, 200 GB/day raw), the design (tracker → Kafka → Flink → ClickHouse, raw archive →
 * Spark reconciliation), the exactly-once chain (click_id, dedupe, checkpoints, overwrite sink) and
 * time and hot ads (event-time windows, watermarks, salted two-stage aggregation).
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
const min = (i: number, label: string): Nd => [16 + i * 146, 70, 130, 56, label];
const salt = (i: number): Nd => [16 + i * 146, 64, 130, 52, i === 2 ? "…" : `ad_77 · ${i === 3 ? 15 : i}|salt ${i === 3 ? 15 : i}`];
const N: Record<string, Nd> = {
  u: [16, 50, 96, 52, "User"],
  ct: [128, 50, 100, 52, "Tracker"],
  k: [244, 50, 100, 52, "Kafka"],
  f: [360, 50, 100, 52, "Flink"],
  ch: [476, 50, 108, 52, "ClickHouse|CH"],
  s3: [244, 150, 100, 52, "S3"],
  sp: [360, 150, 100, 52, "Spark"],
  q: [476, 150, 108, 52, "Query"],
  a1: fig(0, 64, "1B/day"),
  a2: fig(1, 64, "11,600/s|11.6K/s"),
  a3: fig(2, 64, "50,000/s|50K/s"),
  b1: fig(0, 190, "200 GB/day|200 GB/d"),
  b2: fig(1, 190, "6 TB"),
  b3: fig(2, 190, "29 GB/day|29 GB/d"),
  m0: min(0, "10:00"),
  m1: min(1, "10:01"),
  m2: min(2, "10:02"),
  m3: min(3, "10:03"),
  h0: salt(0),
  h1: salt(1),
  h2: salt(2),
  h3: salt(3),
  mg: [200, 200, 200, 52, "Merge"],
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const all = { u: "", ct: "", k: "", f: "", ch: "", s3: "", sp: "", q: "" };
const wires = ["u>ct", "ct>k", "k>f", "f>ch", "k>s3", "s3>sp", "sp>ch", "q>ch"];
const mins = { m0: "", m1: "", m2: "", m3: "" };

const V: Vr[] = [
  {
    id: "ask",
    label: "Ask + size",
    s: [
      {
        c: "Advertisers pay per click and watch counts live. Dashboards can be rough for a moment, but the invoice must count each click exactly once.",
        k: "phase 1 · requirements|requirements",
        on: { t0: "lit:per-ad, per-minute counts within a minute|counts in < 1 min", t1: "top N ads in the last M minutes|top N, last M min", t2: "bad:billing: exactly once, no double counts|billing: exactly once", t3: "warn:late clicks counted in the right minute|late clicks counted", t4: "keep raw events for audits|keep raw events" },
        n: "fast and correct are two different jobs|fast ≠ correct",
      },
      {
        c: "A billion clicks a day is about 11,600 a second on average and around 50,000 at peak.",
        k: "phase 2 · traffic|traffic",
        on: { a1: "clicks", a2: "average|avg", a3: "warn:peak" },
        w: ["a1>a2", "a2>a3"],
        n: "about 10 MB/s into Kafka at peak|~10 MB/s at peak",
      },
      {
        c: "At 200 bytes each that's 200 GB of raw clicks a day, 6 TB for 30 days. The per-minute aggregates are only about 29 GB a day.",
        k: "phase 2 · storage|storage",
        on: { a1: "", a2: "", a3: "", b1: "raw", b2: "30 days hot|30 d", b3: "ok:aggregates|aggs" },
        w: ["a1>a2", "a2>a3", "b1>b2"],
        n: "volume is moderate; the semantics are hard|the semantics are hard",
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    s: [
      {
        c: "Fast path: the tracker logs the click to Kafka and redirects; Flink dedupes and counts per minute; counts land in ClickHouse.",
        k: "phase 4 · fast path|fast path",
        on: { ...all, ct: "lit:log + 302|302", f: "1-min|1-min", ch: "ok:fresh" },
        w: wires,
        go: ["u>ct:lit", "ct>k:lit@0.2", "k>f:lit@0.4", "f>ch:ok@0.6"],
        n: "dashboards within a minute|fresh in < 1 min",
        tw: 2000,
      },
      {
        c: "Truth path: raw clicks are archived to S3, and an hourly Spark job recomputes the counts, overwrites them and marks them final.",
        k: "phase 4 · truth path|truth path",
        on: { ...all, s3: "raw", sp: "lit:hourly", ch: "ok:final" },
        w: wires,
        go: ["k>s3:sky", "s3>sp:sky@0.3", "sp>ch:ok@0.55"],
        n: "lambda-style: fast stream, authoritative batch|fast + authoritative",
      },
      {
        c: "Queries read ClickHouse. Each answer says which minutes are final, and invoices only ever use final rows.",
        k: "phase 4 · reads|reads",
        on: { ...all, q: "ok:final_until|final" },
        w: wires,
        go: ["q>ch:ok"],
        n: "ok:a counting bug? fix it and recompute history|bug? recompute",
      },
    ],
  },
  {
    id: "once",
    label: "Exactly once",
    s: [
      {
        c: "Duplicates come from everywhere: double taps, a tracker retrying Kafka, a crashed processor re-reading, a retried write to the store.",
        k: "deep dive 1 · duplicates|duplicates",
        on: { t0: "bad:client · double tap, retried redirect|client retries", t1: "bad:tracker · write times out, writes again|tracker retries", t2: "bad:processor · crash, re-read from old offset|processor re-reads", t3: "bad:sink · retried increment adds twice|sink re-adds" },
        n: "exactly once is a chain, not a feature|a chain, not a feature",
      },
      {
        c: "A click_id is minted when the ad is served and signed into the link. Kafka's idempotent producer and Flink's seen-ID set drop the copies.",
        k: "deep dive 1 · stable IDs|stable IDs",
        on: { ...all, ct: "ok:idempotent|idemp.", f: "ok:seen IDs|seen" },
        w: wires,
        go: ["u>ct:warn*2", "ct>k:ok@0.3", "k>f:ok@0.5"],
        n: "every copy carries the same click_id|same click, same ID",
      },
      {
        c: "Flink snapshots counts, seen IDs and Kafka offsets as one checkpoint. After a crash it restores all three and re-reads from there.",
        k: "deep dive 1 · checkpoints|checkpoints",
        on: { ...all, k: "ok:offsets", f: "warn:restored|restore" },
        w: wires,
        go: ["k>f:ok*2"],
        n: "ok:nothing lost, nothing counted twice|none lost, none doubled",
      },
      {
        c: "The sink overwrites: (ad_123, 10:00) = 412. Writing 412 twice still gives 412; adding 5 twice would give 10.",
        k: "deep dive 1 · overwrite|overwrite",
        on: { t0: "ok:set (ad_123, 10:00) = 412 · twice → 412|set = 412 → 412", t1: "bad:add 5 to (ad_123, 10:00) · twice → +10|add 5 → +10", t2: "ok:and batch recompute catches anything left|batch = safety net" },
        n: "idempotent writes make retries safe|retries are safe",
      },
    ],
  },
  {
    id: "time",
    label: "Time + hot ads",
    s: [
      {
        c: "A phone in a tunnel taps at 10:00:30 and the event arrives at 10:04. Counting by event time puts it in 10:00, where it belongs.",
        k: "deep dive 2 · event time|event time",
        on: { m0: "ok:+1 late click|+1 late", m1: "", m2: "", m3: "warn:arrived here|arrived" },
        w: ["m3~m2:warn", "m2~m1:warn", "m1~m0:ok"],
        n: "arrival time would shift clicks during lag|arrival time = wrong minute",
      },
      {
        c: "A watermark says a minute is probably complete, so its count is published. Late clicks within a few minutes update the row.",
        k: "deep dive 2 · watermarks|watermarks",
        on: { ...mins, m0: "ok:published|done", m1: "ok:published|done", m2: "lit:watermark|wm", m3: "open" },
        x: [[16, 170, "ok:within allowed lateness → upsert the row|late → upsert"], [16, 200, "warn:later than that → side output → the batch job|very late → batch"]],
        n: "dashboards tick up; the batch makes it final|batch makes it final",
      },
      {
        c: "One viral ad overloads its Flink task. Salt the key into 16 sub-keys, count each slice per minute, then merge the parts.",
        k: "deep dive 2 · hot ads|hot ads",
        on: { h0: "", h1: "", h2: "", h3: "", mg: "ok:ad_77 total|total" },
        w: ["h0)mg", "h1>mg", "h2>mg", "h3)mg"],
        go: ["h0)mg:lit", "h1>mg:lit", "h2>mg:lit", "h3)mg:lit"],
        n: "the salt comes from click_id, so dedupe stays exact|salt from click_id",
      },
      {
        c: "The whole answer: a stream for freshness, raw events and batch for truth, an exactly-once chain, event-time windows, salted hot keys.",
        k: "the decision|decision",
        on: { t0: "ok:Flink stream for fresh counts|stream: fresh", t1: "ok:raw archive + hourly batch for final counts|batch: final", t2: "ok:click_id · dedupe · checkpoints · overwrite|exactly-once chain", t3: "ok:event-time windows, watermarks, lateness|event-time windows", t4: "warn:gave up: one simple pipeline|gave up: one pipeline" },
        n: "fast for dashboards, right for invoices|fast + right",
      },
    ],
  },
];

export default build(V, N);
