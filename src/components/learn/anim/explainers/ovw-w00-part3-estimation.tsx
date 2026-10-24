/**
 * The whole lesson, week 0 part 3 (back-of-the-envelope estimation): the numbers to memorize, then
 * the lesson's Twitter-like worked example end to end: traffic (4B reads/day → ~47K RPS → ~100K at
 * peak), storage (7 TB/day, 12.5 PB over 5 years), bandwidth (~15 Gbps egress, CDN) and sizing.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
/** "wide|narrow" text, or the first " · " part when narrow (readouts) */
const nl = (s: string, narrow: boolean, dot = true) => (s.includes("|") ? s.split("|")[narrow ? 1 : 0] : narrow && dot ? s.split(" · ")[0] : s);

/** one calculation frame: a kicker, a row of boxes (input → … → result), a big figure, two readout lines */
type B = [label: string, sub?: string, tone?: Tone];
type F = { k: string; f: B[]; big?: string; bt?: Tone; bs?: string; l: [string, string]; lt?: Tone; c: string; tw?: number; ms?: number };

function Calc({ fr, t, narrow }: { fr: F; t: number; narrow: boolean }) {
  const n = fr.f.length;
  const gap = 28;
  const bw = (560 - (n - 1) * gap) / n;
  const bx = (i: number) => 20 + i * (bw + gap);
  const each = 0.7 / n;
  const p = ease(seg(t, 0.05, 0.75));
  const tx = lerp(bx(0) + bw, bx(n - 1), p);
  const bo = ease(seg(t, 0.65, 1));
  return (
    <g>
      <Txt x={20} y={30} k="k" anchor="start">{nl(fr.k, narrow, false)}</Txt>
      {fr.f.map(([label, sub, tone], i) => (
        <g key={i} opacity={ease(seg(t, i * each, i * each + 0.3))}>
          {i > 0 && <Wire d={`M${bx(i) - gap} 120H${bx(i)}`} arrow />}
          <Box x={bx(i)} y={88} w={bw} h={64} label={nl(label, narrow, false)} sub={sub ? nl(sub, narrow, false) : undefined} tone={tone} />
        </g>
      ))}
      {n > 1 && p > 0 && p < 1 && <Token x={tx} y={120} />}
      {fr.big && <Txt x={300} y={212} k="d" tone={fr.bt ?? "lit"} opacity={bo}>{nl(fr.big, narrow, false)}</Txt>}
      {fr.bs && <Txt x={300} y={240} k="s" opacity={bo}>{nl(fr.bs, narrow, false)}</Txt>}
      <Txt x={20} y={H - 38} k="s" anchor="start" tone={fr.lt}>{nl(fr.l[0], narrow)}</Txt>
      <Txt x={20} y={H - 14} k="s" anchor="start">{nl(fr.l[1], narrow)}</Txt>
    </g>
  );
}

const V: { id: string; label: string; s: F[] }[] = [
  { id: "numbers", label: "Numbers", s: [
    { k: "time · 1 day ≈ 100,000 s", f: [["86,400 s", "one day"], ["≈ 100,000", "round it"], ["÷ 100,000", "per day → /s|day → /s", "lit"]], big: "100M/day ≈ 1,000/s", bs: "1 billion/day ≈ 10,000/s|1B/day ≈ 10,000/s", l: ["1 year ≈ 30 million seconds", "every 10 powers of 2 ≈ 3 powers of 10|2^10 ≈ 1 thousand"],
      c: "Start with numbers worth memorizing. A day is 86,400 seconds; call it 100,000. So 100 million a day is about 1,000 per second, and a billion a day is about 10,000." },
    { k: "latency · the ratios matter", f: [["memory", "100 ns", "ok"], ["SSD|SSD", "150 µs", "sky"], ["HDD seek|HDD", "10 ms", "warn"], ["CA ↔ NL|CA↔NL", "150 ms", "bad"]], big: "memory ≈ 1,000x SSD|RAM ≈ 1,000x SSD", bs: "SSD ≈ 70x faster than HDD for random reads|SSD ≈ 70x HDD", l: ["datacenter round trip 0.5 ms · cross-continent 150 ms", "cache aggressively · minimize round trips · use a CDN"],
      c: "Latency: main memory is 100 nanoseconds, an SSD read 150 microseconds, an HDD seek 10 milliseconds, and a packet to the Netherlands and back 150 milliseconds. The ratios drive design.", tw: 1600, ms: 3800 },
    { k: "capacity · rules of thumb", f: [["1 KB", "per record"], ["5,000/s", "per server"], ["Gbps ÷ 8", "= GB/s"]], big: "10 Gbps = 1.25 GB/s", bs: "network is in bits, storage in bytes|bits vs bytes", l: ["PostgreSQL 10-50K queries/s · Redis 100K+ ops/s|Postgres 10-50K q/s", "when in doubt, estimate 1 KB per record"],
      c: "Rules of thumb: when in doubt, a record is 1 KB; a simple API server handles about 5,000 requests a second; and divide gigabits by 8 to get gigabytes." },
  ] },
  { id: "traffic", label: "Traffic", s: [
    { k: "worked example · Twitter-like|Twitter-like", f: [["200M DAU", "daily users"], ["20 views", "per user|per user"], ["0.5 posts", "per user"]], bs: "four estimates: traffic → storage → bandwidth → servers|traffic, storage, BW, servers", l: ["given: 500M monthly, 200M daily active users", "step 1: daily volume = DAU × actions per user|daily = DAU × actions"],
      c: "Now the lesson's worked example, a Twitter-like service: 200 million daily users, each viewing 20 tweets and posting half a tweet a day. Every design needs four estimates." },
    { k: "step 1 · daily volume", f: [["200M × 20|200M×20", "views|views"], ["4B / day|4B/day", "reads", "lit"], ["200M × 0.5|200M×0.5", "posts|posts"], ["100M / day|100M/day", "writes|writes", "sky"]], big: "40 : 1", bs: "read/write ratio · read-heavy|read-heavy", l: ["4 billion reads and 100 million writes a day", "so optimize the read path first|optimize reads first"],
      c: "Step 1, daily volume: 200 million times 20 is 4 billion reads a day; times half is 100 million writes. That is a 40 to 1 read-to-write ratio." },
    { k: "step 2 · per second", f: [["4B ÷ 100K|4B÷100K", "reads|reads"], ["40,000/s", "read RPS|reads", "lit"], ["100M ÷ 100K|100M÷100K", "writes|writes"], ["1,000/s", "write RPS|writes", "sky"]], big: "~47,000 RPS", bs: "precise: 4B ÷ 86,400 = 46,296 reads/s|4B ÷ 86,400 = 46,296", l: ["RPS = daily actions ÷ 100,000", "round to nice numbers"],
      c: "Step 2, divide by 100,000: about 40,000 reads and 1,000 writes a second. With the precise 86,400 it is about 46,000 reads, so roughly 47,000 requests a second on average." },
    { k: "step 3 · peak", f: [["~47K/s", "average"], ["× 2", "peak factor"], ["~94K/s", "peak", "bad"]], big: "design for ~100K RPS|~100K RPS", bt: "bad", bs: "normal 2x · viral 3x · flash sale 5-10x|normal 2x · viral 3x", l: ["pitfall: forgetting peak traffic", "\"average is 10K, peak 20-30K: design for 30K\"|design for the peak"], lt: "bad",
      c: "Step 3, peak: a normal app peaks at about twice its average, so about 94,000. Design for roughly 100,000 requests a second. Viral apps peak at 3x, flash sales at 5 to 10x." },
  ] },
  { id: "storage", label: "Storage & BW", s: [
    { k: "storage · per day", f: [["30 GB", "text · 300 B|text"], ["2 TB", "10% images|images", "warn"], ["5 TB", "1% videos|videos", "bad"]], big: "≈ 7 TB / day", bs: "100M tweets/day · media dominates|media dominates", l: ["images 200 KB · videos 5 MB · tweet text 300 bytes|image 200 KB · video 5 MB", "storage = objects × size × retention × replication|objects × size × retention"],
      c: "Storage: 100 million tweets a day at 300 bytes is 30 GB of text. But 10% carry a 200 KB image and 1% a 5 MB video: 2 TB plus 5 TB. About 7 TB a day; media dominates." },
    { k: "storage · over 5 years", f: [["7 TB/day", "new data|new"], ["× 365", "a year|a year"], ["2.5 PB", "per year|per year"], ["× 5", "years|years"]], big: "≈ 12.5 PB", bs: "media is 99%+ of storage|media 99%+", l: ["text DB, 3x replicated: 165 TB · S3 replicates media itself", "don't forget indexes (+20-30%), logs and backups|+ indexes, logs, backups"],
      c: "Times 365 is 2.5 petabytes a year, about 12.5 over five years. The text database, replicated 3x, is only 165 TB; media goes to S3, which replicates internally." },
    { k: "bandwidth · egress", f: [["46K reads/s", "read RPS|reads"], ["× 2 KB", "92 MB/s"], ["20% × 200 KB", "1,840 MB/s|images", "warn"]], big: "≈ 15 Gbps", bt: "warn", bs: "about 30 Gbps at peak|peak ≈ 30 Gbps", l: ["egress = read RPS × response size", "ingress is small: ~24 MB/s ≈ 200 Mbps|ingress ≈ 200 Mbps"],
      c: "Bandwidth: 46,000 reads a second at 2 KB is 92 MB a second, but images on 20% of reads add 1,840. Egress is about 1.9 GB a second, around 15 Gbps, and 30 at peak." },
    { k: "the CDN takes the images", f: [["~15 Gbps", "egress", "warn"], ["CDN", "90% image hits|90% hits", "ok"], ["~2.2 Gbps", "origin", "ok"]], big: "~280 MB/s at origin|~280 MB/s", bt: "ok", bs: "92 MB/s + 10% of 1,840 MB/s|92 + 184 MB/s", l: ["numbers should lead to design decisions", "this is why a CDN is essential"], lt: "ok",
      c: "That is why the CDN is essential. With a 90% hit rate for images, the origin sends 92 plus 184 MB a second, about 280 MB, roughly 2.2 Gbps: much more manageable." },
  ] },
  { id: "sizing", label: "Sizing", s: [
    { k: "API servers", f: [["100K/s", "peak RPS|peak"], ["÷ (5K × 0.7)", "per server|per server"], ["29", "servers", "lit"]], big: "→ 30-35 servers|30-35 servers", bs: "round up for availability|round up", l: ["servers = peak RPS ÷ (RPS per server × 70%)|peak ÷ (RPS × 70%)", "target 70% utilization: leave headroom|leave 30% headroom"],
      c: "Servers: peak RPS divided by capacity times a 70% utilization target. 100,000 over 5,000 times 0.7 is 29; round up to 30 to 35 for availability." },
    { k: "database", f: [["46K/s", "read RPS|reads"], ["÷ 30,000", "per DB|per DB"], ["2", "read replicas|replicas", "sky"]], big: "1 primary + 2 replicas|1 + 2 replicas", bs: "3 DB servers|3 DB servers", l: ["read replicas = read RPS ÷ 30,000", "writes: one primary · shard above 10,000 writes/s|shard above 10K writes/s"],
      c: "Database: 46,000 reads a second over about 30,000 queries per database is two read replicas, plus one primary for writes. Shard writes only above about 10,000 a second." },
    { k: "cache", f: [["30 GB/day", "text|text"], ["× 7 days", "hot data|hot"], ["210 GB", "to hold", "ok"]], big: "256 GB Redis", bt: "ok", bs: "aim for a 90%+ hit rate|90%+ hits", l: ["cache memory = hot data size", "or cache ~20% of the data (80/20 rule)|or ~20% of data"],
      c: "Cache: memory equals the hot data. Keeping the last 7 days of text, 30 GB a day, is 210 GB, so a 256 GB Redis cluster, aiming for a 90% or better hit rate." },
    { k: "presenting it", f: [["assume", "state it first|first"], ["show math|math", "step by step|steps"], ["round", "~10K|~10K"], ["so what?", "→ design", "lit"]], big: "under 5 minutes", bt: undefined, bs: "then move on to the design|then move on", l: ["\"10 KB × 10K RPS = 100 MB/s\": convert units|convert units", "forget peaks, replication or media and the design breaks|watch peaks, replicas, media"],
      c: "In the interview: state assumptions first, show the math step by step, round to nice numbers, and say what it means for the design. Keep it under five minutes.", ms: 3600 },
  ] },
];

function Scene(p: SceneProps) {
  const v = V.find((x) => x.id === p.variant) ?? V[0];
  return <Calc fr={v.s[Math.min(p.step, v.s.length - 1)]} t={p.t} narrow={p.narrow} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: V.map((v) => ({ id: v.id, label: v.label, steps: v.s.map((s) => ({ caption: s.c, tween: s.tw ?? 1600, ms: s.ms ?? 3600 })) })),
  Scene,
});
