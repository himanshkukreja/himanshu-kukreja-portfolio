/**
 * The whole side quest, Gmail: the scale (1.5B monthly users; nearly 15B unwanted emails blocked a day;
 * more than 99.9% of spam kept out; 15 GB per account), the estimate (~60B messages a day, ~1.4M/s and
 * ~830 Gbps at peak; ~3.75 EB of mail, ~5.9 EB of disk tiered against ~11 EB at three copies), the
 * architecture (an SMTP edge that refuses cheaply; a delivery queue written to 3 zones before 250 OK; a
 * filter after acceptance; a mailbox plane partitioned by user with blobs by hash and a per-mailbox
 * index), the deep dives (dedup keys and 4xx backpressure, the filter funnel and RETVec, SPF, DKIM,
 * DMARC and the 2024 bulk-sender rules, tiering and an offline copy, search and quotas per mailbox) and
 * edge cases (Meera's deadline evening, a mailing list that breaks DKIM, a bad storage release).
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
  sender: { x: 16, y: 40, w: 88, h: 44, l: "Sender" },
  dns: { x: 16, y: 96, w: 88, h: 48, l: "DNS" },
  reports: { x: 16, y: 156, w: 88, h: 40, l: "Reports", n: "Flags" },
  mx: { x: 128, y: 40, w: 92, h: 44, l: "MX edge", n: "MX" },
  queue: { x: 128, y: 96, w: 92, h: 48, l: "Queue" },
  filter: { x: 128, y: 156, w: 92, h: 40, l: "Filter" },
  rep: { x: 248, y: 40, w: 120, h: 44, l: "Reputation", n: "Rep" },
  mbx: { x: 248, y: 96, w: 120, h: 48, l: "Mailbox" },
  blob: { x: 248, y: 156, w: 120, h: 40, l: "Blob store", n: "Blobs" },
  meera: { x: 400, y: 40, w: 184, h: 44, l: "Meera" },
  idx: { x: 400, y: 96, w: 184, h: 48, l: "Search index", n: "Index" },
  bak: { x: 400, y: 156, w: 184, h: 40, l: "Offline backup", n: "Backup" },
};
const E: [string, string][] = [
  ["sender", "mx"],
  ["sender", "dns"],
  ["rep", "mx"],
  ["mx", "queue"],
  ["queue", "filter"],
  ["reports", "filter"],
  ["filter", "mbx"],
  ["mbx", "idx"],
  ["mbx", "blob"],
  ["blob", "bak"],
  ["meera", "mbx"],
];
const ALL = { sender: 1, dns: 1, reports: 1, mx: 1, queue: 1, filter: 1, rep: 1, mbx: 1, blob: 1, meera: 1, idx: 1, bak: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "Gmail · the scale", on: { meera: "lit", mbx: 1, filter: 1 }, figs: [["1.5B", ["people a month", "monthly users"], "lit"], ["~15B", ["unwanted emails a day", "blocked a day"]], ["99.9%+", ["of spam kept out", "kept out"]]], note: ["15 GB per account, shared with Drive and Photos", "15 GB per account"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["accept SMTP from anyone", "SMTP from anyone"], ["never lose accepted mail", "never lose mail"], ["classify every message", "classify all"], ["authenticate senders", "authenticate"], ["keep mail for years", "years of mail"], ["search a mailbox in < 1 s", "search < 1 s"]],
      ctn: ["lit", "lit", "lit"],
    },
    { k: ["~60 billion messages a day", "~60B a day"], on: { sender: "lit", mx: "lit", queue: 1, rep: 1 }, fl: [["sender", "mx"], ["mx", "queue"]], figs: [["~60B", ["messages a day", "a day"]], ["~1.4M/s", ["at a 2× peak", "peak"], "lit"], ["~830", ["Gbps at peak", "Gbps"]]], note: ["assumed 30 wanted per mailbox a day, plus ~15 billion unwanted", "a quarter is unwanted"] },
    { k: ["years of mail, never lost", "storage"], kt: "warn", on: { mbx: 1, blob: "warn", bak: 1 }, figs: [["~3.75 EB", ["of mail (assumed)", "of mail"]], ["~50T", ["messages", "messages"]], ["~5.9 EB", ["of disk, tiered", "tiered"], "ok"]], note: ["against ~11 EB at three full copies; ~2.5 PB of new mail a day", "vs ~11 EB at 3 copies"] },
  ],
  arch: [
    { k: ["1 · refuse cheaply at the edge", "1 · the SMTP edge"], on: { sender: 1, dns: 1, mx: "lit", rep: "lit", queue: 1 }, sub: { rep: ["IP, domain", "IP, domain"] }, fl: [["sender", "dns"], ["sender", "mx"], ["rep", "mx"]], note: ["IP reputation, recipient, size, SPF and DKIM before the full verdict", "cheap checks first"] },
    { k: ["2 · 250 OK is a promise", "2 · 250 OK"], on: { mx: 1, queue: "lit", sender: 1 }, sub: { queue: ["3 zones", "3 zones"] }, fl: [["sender", "mx"], ["mx", "queue"]], note: ["written to 3 zones, acknowledged by 2, before the sender hears 250 OK", "2 of 3 zones, then 250"] },
    { k: ["3 · filter after accepting", "3 · the filter"], on: { queue: 1, filter: "lit", reports: 1, mbx: 1 }, fl: [["queue", "filter"], ["reports", "filter"], ["filter", "mbx"]], note: ["accepted mail goes to Spam, never to nowhere", "Spam, never nowhere"] },
    { k: ["4 · everything partitioned by mailbox", "4 · per mailbox"], on: { filter: 1, mbx: "lit", idx: "lit", blob: "lit", meera: 1 }, sub: { mbx: ["per user", "per user"] }, fl: [["filter", "mbx"], ["mbx", "idx"], ["mbx", "blob"], ["meera", "mbx"]], note: ["metadata, index and quotas on the user's shard; bodies as blobs, by hash", "one user, one shard"] },
  ],
  deep: [
    { k: ["1 · accept, queue, never lose", "1 · the front door"], on: { sender: 1, mx: "lit", queue: "lit" }, fl: [["sender", "mx"], ["mx", "queue"]], chips: [["250 only after 2 zones", "2 zones, then 250"], ["a message key dedups retries", "dedup retries"], ["overloaded? answer 451", "451: try later"], ["senders' disks are the buffer", "senders buffer"]], ctn: ["lit", "ok", "warn", "sky"] },
    { k: ["2 · fifteen billion no's a day", "2 · spam, phishing"], kt: "warn", on: { queue: 1, filter: "warn", reports: "lit", mbx: 1 }, fl: [["queue", "filter"], ["reports", "filter"], ["filter", "mbx"]], figs: [["+38%", ["detection, RETVec", "detection"], "ok"], ["−19.4%", ["false positives", "false pos."]], ["−83%", ["TPU use", "TPU"], "lit"]], note: ["cheap signals first, models on what's left; unsure gets a warning", "cheap first, then models"] },
    { k: ["3 · who sent this?", "3 · SPF, DKIM, DMARC"], on: { sender: 1, dns: "lit", mx: "lit", rep: 1 }, fl: [["sender", "dns"], ["sender", "mx"], ["rep", "mx"]], chips: [["SPF: is this IP allowed?", "SPF: the IP"], ["DKIM: does the key verify?", "DKIM: the key"], ["DMARC: aligned with From:", "DMARC: From:"], ["5,000+/day: DMARC, unsubscribe", "bulk rules"]], ctn: ["sky", "sky", "lit", "warn"] },
    { k: ["4 · cheap, but never lost", "4 · storage"], on: { mbx: 1, blob: "lit", bak: "lit" }, fl: [["mbx", "blob"], ["blob", "bak"]], bars: [[["3 full copies · ~11 EB", "3 copies · 11 EB"], 11, 11, "warn"], [["tiered, 6 + 3 coding · ~5.9 EB", "tiered · 5.9 EB"], 5.9, 11, "ok"]], note: ["replicas fail independently, bugs don't: keep a copy software can't reach", "bugs hit every replica"] },
    { k: ["5 · search and quotas, per mailbox", "5 · search, quotas"], on: { meera: "lit", mbx: "lit", idx: "lit" }, fl: [["meera", "mbx"], ["mbx", "idx"]], figs: [["~66 MB", ["index per mailbox", "per mailbox"], "lit"], ["< 1 s", ["search p99", "search"]], ["452", ["\"mailbox full\"", "mailbox full"], "warn"]], note: ["one shard per query; limits are counted on the mailbox's own shard", "no query spans users"] },
  ],
  scale: [
    { k: ["Meera's evening", "the evening"], on: { sender: 1, mx: 1, queue: "lit", filter: "lit", mbx: 1, idx: 1 }, fl: [["sender", "mx"], ["mx", "queue"], ["queue", "filter"], ["filter", "mbx"]], figs: [["9:40", ["Ravi's scan, < 2 s", "the scan"]], ["9:41", ["fake refund: Spam", "to Spam"], "warn"], ["9:55", ["search, < 1 s", "search"], "ok"]], note: ["at 11:58 a 452 \"mailbox full\"; the retry 30 minutes later gets in", "452, then the retry gets in"] },
    { k: ["a mailing list breaks DKIM", "list breaks DKIM"], kt: "warn", on: { sender: "warn", dns: 1, mx: 1, filter: 1 }, fl: [["sender", "mx", "warn"], ["sender", "dns"]], chips: [["\"[RWA]\" and a footer added", "subject edited"], ["DKIM breaks, DMARC fails", "DMARC fails"], ["list rewrites From:, signs", "list signs"], ["or ARC records the results", "ARC headers"]], ctn: ["warn", "bad", "ok", "sky"] },
    { k: ["deadline night, a bad release", "a bad release"], kt: "bad", on: { ...ALL, blob: "bad", mbx: "warn", bak: "ok" }, fl: [["sender", "mx"], ["mx", "queue"], ["mbx", "blob", "bad"]], figs: [["1.6×", ["normal inbound", "inbound"]], ["0.4%", ["canary mailboxes hit", "canary hit"], "bad"], ["25×", ["blob purges", "purges"], "warn"]], note: ["roll back, freeze purges, defer their mail with a 4xx instead of bouncing", "roll back, freeze purges"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, queue: "ok", bak: "ok", mbx: "ok" }, fl: [["mx", "queue", "ok"], ["blob", "bak", "ok"], ["filter", "mbx"]], cols: 3, chips: [["250 is a promise", "250 is a promise"], ["an offline copy", "offline copy"], ["a shard per mailbox", "per mailbox"]], ctn: ["lit", "sky", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Google said 1.5 billion people use Gmail every month (2019) and that it blocks nearly 15 billion unwanted emails a day, keeping more than 99.9% of spam, phishing and malware out of inboxes.", tween: 1400 },
      { caption: "Accept mail from any server on the internet and never lose it once accepted, classify every message, authenticate senders, keep mail for years, and search a whole mailbox in under a second.", tween: 1400 },
      { caption: "On stated assumptions, 30 wanted messages a mailbox a day plus ~15 billion unwanted is ~60 billion a day: ~1.4 million a second at a 2× peak and ~830 Gbps, a quarter of it mail nobody wants.", tween: 1400, loop: true },
      { caption: "At an assumed 2.5 GB a mailbox that is ~3.75 EB of mail, ~50 trillion messages: ~11 EB of disk at three full copies, or ~5.9 EB if older mail is erasure-coded.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "The SMTP edge refuses at the cheapest moment: IP reputation at connection, an unknown recipient at RCPT TO, the message size, and SPF and DKIM, all before the full spam verdict.", tween: 1200, loop: true },
      { caption: "\"250 OK\" is when the sender deletes its copy, so the message is written to the delivery queue in 3 zones and acknowledged by 2 first; from then on it's ours to deliver or bounce.", tween: 1200, loop: true },
      { caption: "The spam and phishing filter runs on the queued copy, after acceptance, using authentication, reputation, content and the user's own signals; accepted mail goes to Spam, never to nowhere.", tween: 1200, loop: true },
      { caption: "The mailbox plane is partitioned by user: labels and threads in a strongly consistent store, bodies and attachments stored once by hash as blobs, and one search index per mailbox.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Never answer 250 before the message is in two zones; a key of Message-ID, body hash and recipient turns a sender's retry into a no-op; and under load the edge answers 451, so senders' queues hold the mail.", tween: 1400, loop: true },
      { caption: "The filter is a funnel: cheap reputation and authentication first, content models on what's left; moving Gmail's classifier to RETVec raised detection 38%, cut false positives 19.4% and cut TPU use 83%.", tween: 1400, loop: true },
      { caption: "SPF checks the sending IP, DKIM the signature, and DMARC ties a pass to the From: domain people see; since 2024, senders of more than 5,000 a day to Gmail also need DMARC, an aligned From: and one-click unsubscribe.", tween: 1400, loop: true },
      { caption: "Recent mail keeps three replicas, older mail is erasure-coded 6 + 3: ~5.9 EB of disk instead of ~11 EB. A bug runs on every replica, as in 2011, so slow purges, cell-by-cell rollouts and an offline copy keep mail safe.", tween: 1400, loop: true },
      { caption: "Nobody searches anyone else's mail, so each mailbox has its own ~66 MB index on its own shard; quotas and limits live there too, and a full mailbox answers a temporary 452 so the sender retries.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "Ravi's scan is written to 3 zones and accepted in under 2 s, the fake refund is filed in Spam with a warning, Meera's search takes under a second, and at 11:58 a \"mailbox full\" 452 is retried and gets in.", tween: 1400, loop: true },
      { caption: "A residents' list adds \"[RWA]\" and a footer, so DKIM breaks and DMARC fails: the list rewrites From: to its own domain and signs, or adds ARC headers; lists are never exempted from DMARC.", tween: 1400, loop: true },
      { caption: "Deadline night: inbound is 1.6× normal and a storage canary leaves 0.4% of its mailboxes unreadable, so stop the release, freeze purges, restore references from tombstones and defer affected mail instead of bouncing it.", tween: 1400, loop: true },
      { caption: "The lesson: say 250 only when the message is safe, keep a copy your own software can't reach, and partition everything by mailbox, so 1.5 billion mailboxes become a billion and a half small, independent systems.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
