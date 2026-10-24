/**
 * Interview problem 15, the whole problem (design a metrics monitoring and alerting system):
 * requirements (labels, queries, rules, retention tiers), the estimate (50M series, 5M points/s,
 * 16 B → ~1.5 B a point), the design (agents → gateway → Kafka → TSDB, a query path, a separate
 * alert path), the storage deep dive (chunks, compression, label index, rollups, cardinality) and
 * reliable alerting (pending → firing, grouping, the watchdog).
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
  ag: [16, 50, 100, 52, "Agents"],
  gw: [136, 50, 100, 52, "Gateway|Gate"],
  k: [256, 50, 100, 52, "Kafka"],
  ts: [376, 50, 92, 52, "TSDB"],
  os: [484, 50, 100, 52, "S3"],
  ae: [256, 140, 100, 52, "Evaluator|Eval"],
  q: [376, 140, 92, 52, "Query"],
  gf: [484, 140, 100, 52, "Dashboards|Dash"],
  am: [256, 226, 100, 52, "Alert mgr|Mgr"],
  pg: [376, 226, 92, 52, "Pager"],
  a1: fig(0, 64, "100K hosts|100K"),
  a2: fig(1, 64, "50M series|50M"),
  a3: fig(2, 64, "5M pts/s|5M/s"),
  b1: fig(0, 190, "16 B → 1.5 B|1.5 B"),
  b2: fig(1, 190, "650 GB/day|650 GB/d"),
  b3: fig(2, 190, "4.5 TB"),
  s1: fig(0, 64, "Pending"),
  s2: fig(1, 64, "Firing"),
  s3: fig(2, 64, "Resolved"),
  g1: fig(0, 190, "200 alerts|200"),
  g2: fig(1, 190, "Group|Group"),
  g3: fig(2, 190, "1 page"),
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const all = { ag: "", gw: "", k: "", ts: "", os: "", ae: "", q: "", gf: "", am: "", pg: "" };
const wires = ["ag>gw", "gw>k", "k>ts", "ts>os", "gf>q", "q>ts", "k>ae", "ae>am", "am>pg"];

const V: Vr[] = [
  {
    id: "ask",
    label: "Ask + size",
    s: [
      {
        c: "Collect labelled metrics from every host, chart them, and page on-call within a minute of a real problem. Keep a year of history.",
        k: "phase 1 · requirements|requirements",
        on: { t0: "lit:counters, gauges, histograms, with labels|labelled metrics", t1: "queries: rate, sum by, percentiles|rate · sum by · p99", t2: "warn:alert rules, a page within a minute|alerts < 1 min", t3: "raw 10 s for 7 days · 1 min for 30 · 1 h for a year|7 d · 30 d · 1 y", t4: "ok:alerting must work on the worst day|alerting first" },
        n: "write-heavy: far more points in than queries out|write-heavy",
      },
      {
        c: "100,000 hosts with about 500 series each is 50 million series. Collected every 10 seconds, that's 5 million points a second.",
        k: "phase 2 · ingest|ingest",
        on: { a1: "× 500 series|× 500", a2: "active series|series", a3: "warn:every 10 s|10 s" },
        w: ["a1>a2", "a2>a3"],
        n: "an append-only write path, not a general database|append-only writes",
      },
      {
        c: "A raw point is 16 bytes; compressed, about 1.5. That's 650 GB a day and 4.5 TB for the raw week, instead of about 48 TB.",
        k: "phase 2 · storage|storage",
        on: { a1: "", a2: "", a3: "", b1: "ok:compressed|per point", b2: "raw per day|per day", b3: "ok:raw week, not 48 TB|7 days" },
        w: ["a1>a2", "a2>a3", "b1>b2", "b2>b3"],
        n: "ok:compression is worth 10x|compression = 10x",
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    s: [
      {
        c: "Agents batch every 10 seconds and push to a gateway, which appends to Kafka by series ID. Writers keep a 2-hour head and flush blocks to S3.",
        k: "phase 4 · ingest path|ingest",
        on: { ...all, gw: "limits", k: "ok:buffer", ts: "lit:2 h head|head" },
        w: wires,
        go: ["ag>gw:lit", "gw>k:lit@0.2", "k>ts:lit@0.4", "ts>os:lit@0.6"],
        n: "Kafka absorbs the backlog if the store slows|Kafka absorbs slowdowns",
        tw: 2000,
      },
      {
        c: "Dashboards ask the query service, which finds series through a label index and reads the head for recent data, S3 blocks for older.",
        k: "phase 4 · query path|queries",
        on: { ...all, q: "ok:index", gf: "refresh 10 s|10 s" },
        w: wires,
        go: ["gf>q:ok", "q>ts:ok@0.3"],
        n: "recent data in under a second|recent: < 1 s",
      },
      {
        c: "Alerts get their own path: an evaluator consumes the stream every 30 seconds and hands firing alerts to the alert manager.",
        k: "phase 4 · alert path|alerts",
        on: { ...all, ae: "lit:every 30 s|30 s", am: "route", pg: "warn:page" },
        w: wires,
        go: ["k>ae:lit", "ae>am:lit@0.3", "am>pg:warn@0.55"],
        n: "ok:a slow dashboard can never delay a page|dashboards can't delay pages",
      },
    ],
  },
  {
    id: "store",
    label: "Storage",
    s: [
      {
        c: "Points arrive in order and look alike. Store timestamps as delta-of-delta, usually one bit, and XOR each value with the last.",
        k: "deep dive 1 · compression|compression",
        on: { t0: "series = metric name + labels → one ID|series = name + labels", t1: "points stored together in 2-hour chunks|2-hour chunks", t2: "ok:timestamps: delta-of-delta, mostly 0 → 1 bit|time: Δ of Δ ≈ 1 bit", t3: "ok:values: XOR with the previous float|values: XOR", t4: "lit:16 B → about 1.5 B per point, lossless|16 B → ~1.5 B" },
        n: "regular data compresses well|regular data compresses",
      },
      {
        c: "An inverted index maps each label to its series IDs. A query intersects those sets, then reads only the matching chunks.",
        k: "deep dive 1 · label index|label index",
        on: { t0: "service=\"checkout\" → {7, 12, 31, 90, …}|checkout → {7,12,31}", t1: "status=\"500\" → {12, 31, 44, …}|500 → {12,31,44}", t2: "ok:both → {12, 31}: read two series|both → {12,31}" },
        n: "postings lists, like a search engine|like a search index",
      },
      {
        c: "Old data is rolled up to 1 minute and 1 hour, keeping min, max, sum and count. A year chart reads 8,760 points, not 3 million.",
        k: "deep dive 1 · rollups|rollups",
        on: { t0: "raw 10 s · 7 days · 4.5 TB|raw · 7 d", t1: "1-minute rollups · 30 days · 13 TB|1 min · 30 d", t2: "1-hour rollups · 1 year · 2.6 TB|1 h · 1 y", t3: "ok:keep max: spikes stay visible|keep max = spikes" },
        n: "averages stay right, spikes stay visible|right averages, real spikes",
      },
      {
        c: "The trap: a user_id label on a 10-million-user service creates millions of series. Writer memory and the index blow up first.",
        k: "deep dive 1 · cardinality|cardinality",
        on: { t0: "bad:http_requests_total{user_id=…} · 10M users|user_id label · 10M", t1: "ok:defence: series limits per metric at the gateway|limits at the gateway", t2: "ok:labels must have bounded values|bounded labels only" },
        m: [16, 230, 568, "series count|series", 100, 100, "bad"],
        n: "",
      },
    ],
  },
  {
    id: "alert",
    label: "Alerting",
    s: [
      {
        c: "A rule goes pending when its condition first holds, and fires only if it still holds after its for duration, say 5 minutes.",
        k: "deep dive 2 · states|states",
        on: { s1: "warn:condition true|true", s2: "bad:still true at 5 min|5 min", s3: "ok:condition clears|clears" },
        w: ["s1>s2:bad", "s2>s3:ok"],
        n: "one bad scrape pages nobody|one blip ≠ a page",
      },
      {
        c: "If 200 hosts fill their disks at once, the alert manager groups them: on-call gets one notification, retried until acknowledged.",
        k: "deep dive 2 · grouping|grouping",
        on: { s1: "", s2: "", s3: "", g1: "warn:disk full|disk", g2: "lit:dedupe · route|route", g3: "ok:on-call|ack" },
        w: ["s1>s2", "s2>s3", "g1>g2:warn", "g2>g3:ok"],
        n: "silences cover planned maintenance|silence maintenance",
      },
      {
        c: "Who watches the watcher? An always-firing watchdog alert feeds an outside dead man's switch. If it goes quiet, that service pages.",
        k: "deep dive 2 · watchdog|watchdog",
        on: { ...all, ae: "ok:watchdog", am: "", pg: "external|ext." },
        w: wires,
        go: ["ae>am:ok", "am>pg:ok@0.4"],
        n: "and absent() fires when a service stops reporting|absent() for silence",
      },
      {
        c: "The whole answer: push into Kafka, compressed chunks with a label index, rollups for history, and an alert path all of its own.",
        k: "the decision|decision",
        on: { t0: "ok:push via gateway, Kafka as the buffer|push + Kafka buffer", t1: "ok:compressed 2-hour chunks + label index|chunks + label index", t2: "ok:raw 7 d · 1 min 30 d · 1 h 1 y|raw · 1 min · 1 h", t3: "ok:separate alert path, for clauses, watchdog|own alert path", t4: "warn:gave up: 10-second detail after a week|gave up: old detail" },
        n: "alerting first, dashboards second|alerting first",
      },
    ],
  },
];

export default build(V, N);
