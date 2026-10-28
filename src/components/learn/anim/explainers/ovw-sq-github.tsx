/**
 * The whole side quest, GitHub code hosting: the scale (1B repositories on five replicas each; 17.9B
 * pushes and 1.3B merged pull requests in a year; 124M Actions jobs a day), the estimate (~1,300
 * pushes/s, up to ~1.3M Git reads/s; 60+ follow-up tasks a push, ~78,000/s; ~430,000 busy runner VMs on
 * assumed 5-minute jobs), the architecture (Spokes acknowledging a push on a strict majority; one Kafka
 * event per push with independent consumers; one fresh VM per CI job; reads from the nearest in-sync
 * replica), the deep dives (majority locks, repair and per-reference quorums, the push pipeline and
 * merge queue, webhooks with per-host queues and breakers, Actions fair share and leases, Blackbird code
 * search by blob id) and edge cases (release day, a receiver down for four days, 2,000 agents on a monorepo).
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
  nandini: { x: 16, y: 40, w: 88, h: 44, l: "Nandini", n: "Dev" },
  agents: { x: 16, y: 96, w: 88, h: 48, l: "Agents" },
  search: { x: 16, y: 156, w: 88, h: 40, l: "Search" },
  proxy: { x: 128, y: 40, w: 92, h: 44, l: "Git proxy", n: "Proxy" },
  prs: { x: 128, y: 96, w: 92, h: 48, l: "PR sync", n: "PRs" },
  index: { x: 128, y: 156, w: 92, h: 40, l: "Index" },
  spokes: { x: 248, y: 40, w: 120, h: 44, l: "Spokes" },
  kafka: { x: 248, y: 96, w: 120, h: 48, l: "Kafka" },
  act: { x: 248, y: 156, w: 120, h: 40, l: "Actions" },
  fs: { x: 400, y: 40, w: 184, h: 44, l: "Five replicas", n: "Replicas" },
  hooks: { x: 400, y: 96, w: 184, h: 48, l: "Webhooks" },
  run: { x: 400, y: 156, w: 184, h: 40, l: "Runner VMs", n: "VMs" },
};
const E: [string, string][] = [
  ["nandini", "proxy"],
  ["agents", "proxy"],
  ["proxy", "spokes"],
  ["spokes", "fs"],
  ["spokes", "kafka"],
  ["kafka", "prs"],
  ["kafka", "hooks"],
  ["kafka", "act"],
  ["kafka", "index"],
  ["act", "run"],
  ["search", "index"],
];
const ALL = { nandini: 1, agents: 1, search: 1, proxy: 1, prs: 1, index: 1, spokes: 1, kafka: 1, act: 1, fs: 1, hooks: 1, run: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "GitHub · the scale", on: { nandini: "lit", spokes: 1, fs: 1 }, figs: [["1B", ["repositories", "repos"]], ["17.9B", ["pushes in a year", "pushes/year"], "lit"], ["124M", ["Actions jobs a day", "jobs a day"]]], note: ["each repository on five replicas; 1.3 billion merged pull requests a year", "5 replicas each"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["push, clone and fetch any repo", "push, clone, fetch"], ["never lose an acknowledged push", "never lose a push"], ["pull requests, a merge queue", "PRs, merge queue"], ["webhooks to millions of URLs", "webhooks"], ["CI from untrusted code, isolated", "isolated CI"], ["search all the code", "code search"]],
      ctn: ["lit", "lit", "lit"],
    },
    { k: ["~1,300 pushes a second", "~1,300 pushes/s"], on: { nandini: "lit", agents: "lit", proxy: "lit", spokes: "lit", fs: 1 }, fl: [["nandini", "proxy"], ["agents", "proxy"], ["proxy", "spokes"], ["spokes", "fs"]], figs: [["~1,300/s", ["pushes, average", "pushes/s"], "lit"], ["100–1,000", ["reads per write", "reads/write"]], ["~1.2M/s", ["Spokes operations", "Spokes ops"]]], note: ["3.35 billion pushes a month; designed for ~5,000 a second at peak", "design for ~5,000/s"] },
    { k: ["every push fans out", "the fan-out"], kt: "warn", on: { spokes: 1, kafka: "warn", prs: 1, hooks: 1, act: "lit", run: 1 }, fl: [["spokes", "kafka"], ["kafka", "prs"], ["kafka", "hooks"], ["kafka", "act"]], figs: [["60+", ["tasks per push", "tasks/push"]], ["~78K/s", ["background tasks", "tasks/s"], "warn"], ["~430K", ["runner VMs busy", "busy VMs"], "lit"]], note: ["VMs at an assumed 5 minutes a job; ~23,000 webhooks a second (assumed)", "assumed 5-min jobs"] },
  ],
  arch: [
    { k: ["1 · the write is a vote", "1 · the vote"], on: { nandini: 1, proxy: "lit", spokes: "lit", fs: "lit" }, sub: { fs: ["a strict majority", "majority"] }, fl: [["nandini", "proxy"], ["proxy", "spokes"], ["spokes", "fs"]], note: ["acknowledged only when a majority apply it with matching checksums", "a majority, or no push"] },
    { k: ["2 · the rest is an event", "2 · one event"], on: { spokes: 1, kafka: "lit", prs: "lit", hooks: "lit", act: "lit", index: "lit" }, fl: [["spokes", "kafka"], ["kafka", "prs"], ["kafka", "hooks"], ["kafka", "act"], ["kafka", "index"]], note: ["one Kafka event per push; independent consumers, each with its own retries", "independent consumers"] },
    { k: ["3 · CI on disposable machines", "3 · Actions"], on: { kafka: 1, act: "lit", run: "lit" }, sub: { run: ["one job each", "one job"] }, fl: [["kafka", "act"], ["act", "run"]], note: ["a queue per account; each hosted job on a fresh VM, destroyed after", "fresh VM per job"] },
    { k: ["4 · reads go to the nearest replica", "4 · reads"], on: { nandini: 1, agents: 1, proxy: "lit", spokes: 1, fs: "lit" }, fl: [["agents", "proxy"], ["proxy", "spokes"], ["spokes", "fs"]], note: ["nearest in-sync replica first; bitmaps work out what to send", "nearest in-sync replica"] },
  ],
  deep: [
    { k: ["1 · a billion repositories", "1 · Spokes"], on: { proxy: 1, spokes: "lit", fs: "lit" }, fl: [["proxy", "spokes"], ["spokes", "fs"]], chips: [["lock a majority, then apply", "majority lock"], ["checksums must match", "checksums"], ["losers are repaired", "repair losers"], ["2026: a quorum per reference", "per-ref quorum"]], ctn: ["lit", "ok", "warn", "sky"] },
    { k: ["2 · after the push", "2 · after the push"], on: { spokes: 1, kafka: "lit", prs: "lit" }, fl: [["spokes", "kafka"], ["kafka", "prs"]], figs: [["99.897%", ["fully processed, before", "before"], "warn"], ["99.999%", ["with one event a push", "after"], "ok"], ["−33%", ["merge queue wait", "queue wait"]]], note: ["test merges are derived: coalesce them and put user pushes first", "coalesce test merges"] },
    { k: ["3 · webhooks to the world", "3 · webhooks"], kt: "warn", on: { kafka: 1, hooks: "warn" }, fl: [["kafka", "hooks", "warn"]], chips: [["2XX within 10 s, or failed", "10 s timeout"], ["a queue and a cap per host", "queue per host"], ["a breaker on a dead host", "breaker"], ["same delivery id on redelivery", "delivery id"]], ctn: ["warn", "lit", "bad", "ok"] },
    { k: ["4 · Actions: fair and isolated", "4 · Actions"], on: { kafka: 1, act: "lit", run: "lit" }, fl: [["kafka", "act"], ["act", "run"]], figs: [["20", ["jobs at once, Free", "Free cap"]], ["6 h", ["per job", "per job"]], ["256", ["jobs per matrix", "matrix"], "lit"]], note: ["forks get no secrets; a lease epoch refuses a stale runner at once", "forks: no secrets"] },
    { k: ["5 · searching all the code", "5 · code search"], on: { kafka: 1, index: "lit", search: "lit" }, fl: [["kafka", "index"], ["search", "index"]], figs: [["~96 s", ["to grep 115 TB", "grep"], "bad"], ["15.5B", ["documents, by blob", "documents"]], ["~100 ms", ["p99 per shard", "p99/shard"], "ok"]], note: ["permissions in the query, and again on the results", "permissions checked twice"] },
  ],
  scale: [
    { k: ["Nandini's release day", "release day"], on: { nandini: "lit", proxy: 1, spokes: "lit", fs: 1, kafka: 1, act: "lit", run: 1 }, fl: [["nandini", "proxy"], ["proxy", "spokes"], ["spokes", "fs"], ["spokes", "kafka"], ["kafka", "act"], ["act", "run"]], figs: [["10:40", ["merge queue", "merge queue"]], ["11:02", ["tag on a majority", "tag push"], "lit"], ["24", ["jobs on fresh VMs", "release jobs"]]], note: ["then thousands of pipelines fetch the tag from the nearest replicas", "thousands fetch the tag"] },
    { k: ["a receiver down for four days", "receiver down"], kt: "bad", on: { kafka: 1, hooks: "bad" }, fl: [["kafka", "hooks", "bad"]], chips: [["down Friday to Tuesday", "down 4 days"], ["past the 3-day window", "past 3 days"], ["webhooks notify, not record", "not the record"], ["reconcile from the REST API", "read the API"]], ctn: ["bad", "warn", "sky", "ok"] },
    { k: ["2,000 agents on one monorepo", "2,000 agents"], kt: "warn", on: { ...ALL, agents: "warn", spokes: "warn", prs: "warn" }, fl: [["agents", "proxy", "warn"], ["proxy", "spokes"], ["spokes", "fs"], ["kafka", "prs"]], figs: [["~11/s", ["pushes to one repo", "pushes/s"], "warn"], ["3.3 s", ["lock time a second", "lock time"], "bad"], ["~300/h", ["merges into main", "merges/h"]]], note: ["a quorum per reference lets branches move in parallel; main stays serial", "per-ref locks; main serial"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, fs: "ok", kafka: "ok", run: "ok" }, fl: [["spokes", "fs", "ok"], ["spokes", "kafka"], ["act", "run", "ok"]], cols: 3, chips: [["vote on the ref", "vote on the ref"], ["the rest is an event", "then an event"], ["one job, one VM", "one job, one VM"]], ctn: ["lit", "sky", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "GitHub's Spokes serves a billion repositories, five replicas each by default; the year to September 2026 saw 17.9 billion pushes, 1.3 billion merged pull requests and 124 million Actions jobs a day.", tween: 1400 },
      { caption: "Host repositories of any size and never lose an acknowledged push, run pull requests and a merge queue, deliver webhooks to millions of endpoints, run CI from untrusted code in isolation, and search all the code.", tween: 1400 },
      { caption: "3.35 billion pushes a month is ~1,300 a second, designed for ~5,000 at peak; at 100 to 1,000 reads per write that is up to ~1.3 million reads a second, in line with Spokes' 100 billion+ operations a day.", tween: 1400, loop: true },
      { caption: "Each push wakes 60+ pieces of follow-up logic, ~78,000 background tasks a second, and at an assumed 5 minutes a job, Actions keeps ~430,000 runner VMs busy on average.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "The write is a vote: the Git proxy checks Nandini's key, the pack goes to the five replicas, and Spokes acknowledges the tag only when a strict majority apply it with matching checksums.", tween: 1200, loop: true },
      { caption: "Everything after the write reads one Kafka event per push: pull request sync, webhooks, workflow triggers and search indexing run as independent consumers with their own retries.", tween: 1200, loop: true },
      { caption: "Actions keeps each account's jobs in their own queue and runs each hosted job on a fresh virtual machine from a warm pool, destroyed afterwards, with a token for that repository only.", tween: 1200, loop: true },
      { caption: "Reads go to the nearest in-sync replica: most repositories see 100 to 1,000 reads for every write, and reachability bitmaps turn what to send into bitwise operations.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Each write locks a majority of replicas, so there are no concurrent writers and no primary to fail over; losers of a vote are repaired, and in 2026 GitHub is narrowing the quorum from the whole repository to each reference.", tween: 1400, loop: true },
      { caption: "One huge push job became one Kafka event with independent consumers, and fully processed pushes rose from ~99.897% to at least 99.999%; the merge queue tests each pull request against the newest main plus those ahead of it.", tween: 1400, loop: true },
      { caption: "A receiver must answer 2XX within 10 seconds or the delivery fails; each host gets its own queue, cap and breaker, so a dead receiver can't slow the rest, and a redelivery keeps its delivery id.", tween: 1400, loop: true },
      { caption: "Each account has a concurrency cap (20 jobs at once on the Free plan) and the scheduler picks across accounts; forks get no secrets, and a lease epoch refuses a runner still holding a revoked job.", tween: 1400, loop: true },
      { caption: "Grepping 115 TB on 2,048 cores would take ~96 seconds a query, so Blackbird indexed 15.5 billion documents at its 2023 beta, sharded by Git blob id, at about 100 ms p99 per shard, with permissions checked twice.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "At 10:40 the merge queue tests Nandini's last pull request against the newest main; at 11:02 her tag commits on a majority of replicas, 24 release jobs start on fresh VMs, and thousands of pipelines fetch the tag.", tween: 1400, loop: true },
      { caption: "A receiver is down from Friday to Tuesday, past the 3-day redelivery window: webhooks are a notification, not the record, so it reconciles by reading current state from the REST API.", tween: 1400, loop: true },
      { caption: "2,000 coding agents pushing every 3 minutes is ~11 pushes a second to one repository, 3.3 s of lock time a second under a repository-wide lock: a quorum per reference lets branches move in parallel, and only main stays serial.", tween: 1400, loop: true },
      { caption: "The lesson: split the push into the one small thing that needs agreement, the reference update, and everything else, which only needs an event; and run strangers' code on machines you throw away.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
