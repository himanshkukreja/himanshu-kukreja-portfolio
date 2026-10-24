/**
 * The whole side quest, Instagram feed and stories: the scale (3B monthly users, 70% of feeds missed
 * before ranking, 500M daily Stories users in 2019), the estimate (~700K feed pages/s at peak, ~300
 * reads per post, 350M ranking scores/s, ~5.7 PB of new media a day, ~20B inbox writes a day), the
 * architecture (media stored once and resized → time-sortable post IDs fanned out to inboxes → a
 * staged ranking funnel → a stories tray from an expiring index), the deep dives (media and video
 * encodings, IDs and hybrid fan-out, ranking in stages, stories) and scale and edge cases (huge
 * accounts, deletes and privacy, midnight on New Year's Eve).
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
  poster: { x: 16, y: 40, w: 88, h: 44, l: "Cousin" },
  meera: { x: 16, y: 152, w: 88, h: 44, l: "Meera" },
  api: { x: 128, y: 96, w: 92, h: 52, l: "API" },
  media: { x: 248, y: 40, w: 120, h: 40, l: "Media", n: "Media" },
  feed: { x: 248, y: 96, w: 120, h: 52, l: "Feed", n: "Feed" },
  tray: { x: 248, y: 156, w: 120, h: 40, l: "Stories tray", n: "Tray" },
  cdn: { x: 400, y: 40, w: 184, h: 44, l: "Blob store · CDN", n: "CDN" },
  inbox: { x: 400, y: 96, w: 184, h: 44, l: "Inboxes", n: "Inbox" },
  sidx: { x: 400, y: 152, w: 184, h: 44, l: "Story index", n: "Index" },
};
const E: [string, string][] = [
  ["poster", "api"],
  ["meera", "api"],
  ["api", "media"],
  ["api", "feed"],
  ["api", "tray"],
  ["media", "cdn"],
  ["feed", "inbox"],
  ["tray", "sidx"],
];
const ALL = { poster: 1, meera: 1, api: 1, media: 1, feed: 1, tray: 1, cdn: 1, inbox: 1, sidx: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "Instagram · the scale", on: { meera: "lit", api: 1, feed: 1 }, figs: [["3B", ["monthly users", "monthly"], "lit"], ["70%", ["of feeds missed, 2016", "missed"]], ["500M", ["daily Stories, 2019", "Stories/day"]]], note: ["Meta doesn't publish post volumes: the estimates assume them", "post volumes assumed"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["every size of every photo", "every size"], ["a ranked feed", "ranked feed"], ["a tray of unseen stories", "stories tray"], ["24 h, then the archive", "24 h, archive"], ["feed p99 < 500 ms", "p99 < 500 ms"], ["a 400M-follower post", "huge accounts"]],
      ctn: ["lit", "lit", "lit"],
    },
    { k: "reads dwarf writes", on: { meera: "lit", api: 1, feed: "lit", inbox: 1 }, fl: [["meera", "api"], ["api", "feed"], ["feed", "inbox"]], figs: [["~700K/s", ["feed pages, peak", "pages/s"]], ["~300×", ["reads per post", "reads/post"], "lit"], ["350M/s", ["ranking scores", "scores/s"], "warn"]], note: ["1.5 billion daily users × 10 opens × 2 pages (assumed)", "1.5B × 10 × 2 (assumed)"] },
    { k: "bytes dwarf everything", kt: "warn", on: { media: "warn", cdn: "warn" }, fl: [["media", "cdn", "warn"]], figs: [["~5.7 PB", ["new media a day", "media/day"], "warn"], ["~8 Tbps", ["media at peak", "egress"]], ["~20B", ["inbox writes a day", "inbox/day"]]] },
  ],
  arch: [
    { k: "1 · bytes first", on: { poster: "lit", api: 1, media: "lit", cdn: 1 }, sub: { media: ["4 sizes", "sizes"] }, fl: [["poster", "api"], ["api", "media"], ["media", "cdn"]], note: ["store the original once, by content; resize at upload", "store once, resize"] },
    { k: "2 · then the ID fans out", on: { poster: 1, api: 1, feed: "lit", inbox: "lit" }, sub: { feed: ["post ID", "ID"], inbox: ["420 inboxes", "420"] }, fl: [["api", "feed"], ["feed", "inbox"]], note: ["a time-sortable 64-bit ID, pushed in the background", "pushed in the background"] },
    { k: "3 · Meera opens the app", kt: "ok", on: { meera: "lit", api: 1, feed: "lit", inbox: 1, cdn: 1 }, sub: { feed: ["rank 1,500", "rank"] }, fl: [["meera", "api"], ["api", "feed"], ["inbox", "feed", "ok"]], note: ["inbox plus huge accounts, ranked in stages, then images from the CDN", "ranked, then the CDN"], nt: "ok" },
    { k: "4 · the stories tray", on: { meera: 1, api: 1, tray: "lit", sidx: "lit" }, sub: { sidx: ["24 h expiry", "24 h"] }, fl: [["api", "tray"], ["tray", "sidx"]], note: ["unseen accounts first; first frames prefetched before the tap", "unseen first, prefetched"] },
  ],
  deep: [
    { k: "1 · media, stored once", on: { api: 1, media: "lit", cdn: "lit" }, fl: [["api", "media"], ["media", "cdn"]], chips: [["the original, kept", "original"], ["1080, 640, 320, thumb", "sizes"], ["content-addressed keys", "hash keys"], ["hot, then warm", "hot → warm"]], ctn: [undefined, undefined, "lit", "sky"] },
    { k: "2 · video compute", kt: "ok", on: { media: "lit", cdn: 1 }, figs: [["80%+", ["compute on basic", "basic"], "warn"], ["94%", ["less, by repackaging", "saved"], "ok"], ["+33%", ["advanced coverage", "advanced"], "ok"]], note: ["repackaging took 0.36 s where a 720p encode took 86 CPU-seconds", "0.36 s vs 86 CPU-s"] },
    { k: "3 · IDs and fan-out", on: { api: 1, feed: "lit", inbox: "lit" }, fl: [["feed", "inbox"]], chips: [["41 bits of time", "41 · time"], ["13 bits of shard", "13 · shard"], ["10 bits of sequence", "10 · sequence"], ["huge accounts: pull", "huge: pull"]], ctn: [undefined, undefined, undefined, "warn"] },
    { k: "4 · the ranking funnel", on: { meera: 1, api: 1, feed: "lit", inbox: 1 }, fl: [["inbox", "feed"], ["feed", "api", "ok"]], figs: [["1,500", ["candidates", "candidates"]], ["300", ["after stage one", "stage one"], "lit"], ["10", ["on the page", "shown"], "ok"]], note: ["value = a weighted sum of five predictions", "five predictions → one value"] },
    { k: "5 · stories", on: { tray: "lit", sidx: "lit", meera: 1, api: 1 }, fl: [["tray", "sidx"]], chips: [["an index with 24 h expiry", "24 h index"], ["a seen set, 48 h", "seen set"], ["audience checked on read", "audience"], ["archived, not deleted", "archive"]], ctn: ["lit", undefined, "ok", "sky"] },
  ],
  scale: [
    { k: "a 400M-follower post", kt: "warn", on: { poster: "warn", api: 1, feed: "lit", cdn: 1 }, chips: [["no fan-out", "no fan-out"], ["merged at read time", "merged on read"], ["one hot media key", "one media key"], ["pre-warm the edges", "pre-warm"]], ctn: ["warn", "lit", undefined, "ok"] },
    { k: "deletes and privacy", on: { feed: "lit", inbox: 1, media: 1 }, chips: [["tombstone first", "tombstone"], ["dropped at hydrate", "read filter"], ["inboxes cleaned lazily", "lazy cleanup"], ["media purged after", "purge later"]], ctn: ["bad", "ok", undefined, undefined] },
    { k: "midnight, New Year's Eve", kt: "warn", on: { ...ALL, media: "warn", sidx: "warn" }, fl: [["poster", "api", "warn"], ["api", "media", "warn"], ["api", "tray"]], figs: [["40K/s", ["story frames", "frames/s"]], ["124 GB/s", ["ingest", "ingest"], "warn"], ["3.2M/s", ["seen-marks", "seen/s"], "warn"]], note: ["advanced encodings wait; expiry and audience checks never do", "never shed expiry or privacy"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, feed: "ok", cdn: "ok" }, fl: [["poster", "api"], ["api", "media"], ["media", "cdn", "ok"], ["inbox", "feed", "ok"]], cols: 3, chips: [["store bytes once", "bytes once"], ["move only IDs", "move IDs"], ["rank the twenty", "rank twenty"]], ctn: ["sky", "lit", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Instagram: 3 billion monthly users. People missed about 70% of their feeds before ranking, and 500 million used Stories daily in 2019.", tween: 1400 },
      { caption: "Store every photo at every size, rank each feed, show a tray of unseen stories that leave after 24 hours, and survive a 400-million-follower post.", tween: 1400 },
      { caption: "Assuming 1.5 billion daily users opening the feed 10 times: ~700,000 pages a second at peak, ~300 reads per post, 350 million ranking scores a second.", tween: 1400, loop: true },
      { caption: "Media dominates: ~5.7 PB of new photos, videos and story frames a day, ~8 Tbps of images at peak, and ~20 billion inbox writes a day.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "The cousin posts a baby photo: the media service stores the original once, by content, and makes four sizes served through the CDN.", tween: 1200, loop: true },
      { caption: "The post gets a time-sortable 64-bit ID, and background workers push that ID into her 420 followers' inboxes.", tween: 1200, loop: true },
      { caption: "Meera opens the app: her inbox and any huge accounts she follows give 1,500 candidates, ranked in stages; the photo comes from the CDN.", tween: 1200, loop: true },
      { caption: "The tray reads an index of stories with a 24-hour expiry, puts unseen accounts first and prefetches their first frames.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Media: keep the original, make 1080, 640, 320 and a thumbnail, name them by a hash of the bytes, and move them from hot to warm storage.", tween: 1400, loop: true },
      { caption: "Basic video encodings took over 80% of Instagram's video compute; repackaging instead of re-encoding cut that by 94% and grew advanced coverage 33%.", tween: 1400 },
      { caption: "IDs: 41 bits of time, 13 of shard, 10 of sequence. Normal accounts push IDs to inboxes; huge accounts are pulled at read time.", tween: 1400, loop: true },
      { caption: "Ranking: filters and a light model take 1,500 candidates to 300, a heavy model predicts five interactions, and rules pick the page of 10.", tween: 1400, loop: true },
      { caption: "Stories: an index entry expires at 24 hours, a seen set marks what Meera watched, audiences are checked on read, and media goes to the archive.", tween: 1400 },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "A 400-million-follower account posts: no fan-out, its post is merged into readers' candidates, and the CDN edges are warmed for one hot key.", tween: 1400 },
      { caption: "A delete is a tombstone: feed reads drop it at hydrate time at once, inboxes are cleaned up lazily and media is purged afterwards.", tween: 1400 },
      { caption: "Midnight on New Year's Eve: 40,000 story frames a second, 124 GB/s of ingest and 3.2 million seen-marks a second. Advanced encodings wait.", tween: 1400, loop: true },
      { caption: "The lesson: store bytes once, move only small IDs, and spend the compute on choosing which twenty posts to show.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
