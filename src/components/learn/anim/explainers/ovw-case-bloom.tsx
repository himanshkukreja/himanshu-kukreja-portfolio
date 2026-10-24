/**
 * The whole case file "Spam detection with a Bloom filter": GlobalForum's 10x spike against 1.2
 * billion known malicious URLs; why a database (120 GB+) falls over; how a Bloom filter sets and
 * checks bits (definitely clean, or maybe: verify); sizing it to 17.2 billion bits (2.15 GB) and
 * 10 hashes for 0.1%; the full flow, live updates and emergency mode; the cost and the lesson.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";


const W = 600;
const H = 340;
type L = string | readonly [string, string];
const pk = (l: L, n: boolean) => (typeof l === "string" ? l : n ? l[1] : l[0]);
const fade = (t: number, i = 0, n = 0.14) => ease(seg(t, 0.1 + i * n, 0.4 + i * n));

function Head({ k, c, tone, narrow }: { k: L; c?: L; tone?: Tone; narrow: boolean }) {
  return (
    <g>
      <Txt x={16} y={28} k="k" anchor="start" tone={tone}>
        {pk(k, narrow)}
      </Txt>
      {c && (
        <Txt x={W - 16} y={28} k="k" anchor="end" tone={tone || "mute"}>
          {pk(c, narrow)}
        </Txt>
      )}
    </g>
  );
}

function Chips({ items, t, y = 290, tone, narrow }: { items: L[]; t: number; y?: number; tone?: Tone; narrow: boolean }) {
  const w = (W - 32 - (items.length - 1) * 8) / items.length;
  return (
    <g>
      {items.map((l, i) => {
        const x = 16 + i * (w + 8);
        return (
          <g key={i} opacity={fade(t, i)}>
            <rect className={`ax-box ${tone || ""}`} x={x} y={y} width={w} height={32} />
            <Txt x={x + w / 2} y={y + 21} k="s" tone={tone}>
              {pk(l, narrow)}
            </Txt>
          </g>
        );
      })}
    </g>
  );
}

function Figs({ items, t, y = 288, narrow }: { items: [L, L, Tone?][]; t: number; y?: number; narrow: boolean }) {
  const w = W / items.length;
  return (
    <g>
      {items.map(([d, s, tone], i) => (
        <g key={i} opacity={fade(t, i, 0.18)}>
          <Txt x={w * (i + 0.5)} y={y} k="d" tone={tone}>
            {pk(d, narrow)}
          </Txt>
          <Txt x={w * (i + 0.5)} y={y + 28} k="s">
            {pk(s, narrow)}
          </Txt>
        </g>
      ))}
    </g>
  );
}

const NB = 24;
const BX = (i: number) => 24 + i * 23;
/** a toy bit array: `on` bits set, `hit` bits highlighted with a tone */
function Bits({ on, hit, tone, y = 150 }: { on: number[]; hit?: number[]; tone?: Tone; y?: number }) {
  return (
    <g>
      {Array.from({ length: NB }, (_, i) => {
        const set = on.includes(i);
        const h = hit?.includes(i);
        return (
          <g key={i}>
            <rect className={`ax-box ${h ? tone || "lit" : set ? "ok" : ""}`} x={BX(i)} y={y} width={20} height={30} />
            <Txt x={BX(i) + 10} y={y + 20} k="s" tone={h ? tone || "lit" : set ? "ok" : "mute"}>
              {set ? "1" : "0"}
            </Txt>
          </g>
        );
      })}
    </g>
  );
}
const SEEDED = [2, 5, 9, 13, 17, 20];

function Flood({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["GlobalForum · 3 AM", "3 AM"]} c={["10x traffic spike", "10x spike"]} tone="bad" narrow={narrow} />
        <Figs items={[["2B", narrow ? "checks/day" : "URL checks a day", "bad"], ["1.2B", narrow ? "bad URLs" : "known malicious URLs"], ["< 50 ms", narrow ? "per post" : "per message"]]} y={110} t={t} narrow={narrow} />
        <Txt x={300} y={186} k="s" opacity={fade(t, 3)}>
          {narrow ? "up from 200M a day" : "up from 200 million checks a day"}
        </Txt>
        <Chips items={[["5M new spam URLs an hour", "5M new/hour"], ["zero false negatives", "no misses"]]} t={seg(t, 0.4, 1)} tone="warn" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["the database approach", "a database"]} c={["falls over", "falls over"]} tone="bad" narrow={narrow} />
        <Box x={16} y={60} w={180} h={70} label="Messages" sub={narrow ? "2B/day" : "2B checks/day"} tone="sky" />
        <Wire d="M196 95H264" arrow tone="bad" />
        <Box x={264} y={52} w={320} h={86} label={narrow ? "spam_urls" : "spam_urls table"} sub={narrow ? "120 GB+ RAM" : "1.2B × 100 B = 120 GB+ RAM"} tone="bad" />
        <Chips items={[["query bottleneck", "bottleneck"], ["inserts block reads", "inserts block"], ["costly replicas", "costly"]]} t={t} tone="bad" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["set membership", "membership"]} narrow={narrow} />
      <Txt x={300} y={110} k="d" tone="lit">
        is q in S?
      </Txt>
      <Txt x={300} y={150} k="s">
        {narrow ? "in O(1), small memory" : "in O(1) time, with predictable memory"}
      </Txt>
      <Chips items={[["hash set: 120 GB+", "hash set: big"], ["DB index: slows", "index: slows"], ["cache: long tail", "cache: misses"]]} t={t} tone="warn" narrow={narrow} />
    </g>
  );
}

function Filter({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const hits = [4, 11, 18];
    const p = ease(seg(t, 0.15, 0.7));
    return (
      <g>
        <Head k={["a Bloom filter · insert", "insert"]} c={["k hashes set k bits", "set bits"]} narrow={narrow} />
        <Box x={200} y={52} w={200} h={52} label={narrow ? "bad URL" : "malicious URL"} tone="bad" />
        {hits.map((b, i) => (
          <g key={b}>
            <Wire d={`M${270 + i * 30} 104L${BX(b) + 10} 150`} arrow tone="lit" />
            {p > 0 && p < 1 && <Token x={lerp(270 + i * 30, BX(b) + 10, p)} y={lerp(104, 150, p)} s={7} />}
          </g>
        ))}
        <Bits on={p >= 1 ? [...SEEDED, ...hits] : SEEDED} hit={p >= 1 ? hits : []} tone="lit" />
        <Chips items={[["10–15 bits per item", "10–15 bits/item"], ["vs ~800 bits stored", "vs ~800 bits"]]} t={seg(t, 0.5, 1)} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    const clean = [3, 11, 19];
    const maybe = [5, 13, 20];
    const a = t < 0.5;
    const probe = a ? clean : maybe;
    return (
      <g>
        <Head k={["a Bloom filter · check", "check"]} c={a ? ["any 0: clean", "a 0: clean"] : ["all 1: maybe", "all 1: maybe"]} tone={a ? "ok" : "warn"} narrow={narrow} />
        <Box x={200} y={52} w={200} h={52} label={a ? (narrow ? "URL A" : "a new URL") : narrow ? "URL B" : "another URL"} tone={a ? "ok" : "warn"} />
        {probe.map((b, i) => (
          <Wire key={b} d={`M${270 + i * 30} 104L${BX(b) + 10} 150`} arrow tone={a ? "ok" : "lit"} />
        ))}
        <Bits on={[...SEEDED, 4, 11, 18]} hit={probe} tone={a ? "ok" : "warn"} />
        <Box x={16} y={210} w={270} h={56} label={narrow ? "A zero" : "Any bit 0"} sub={narrow ? "definitely clean" : "definitely clean: post it"} tone="ok" />
        <Box x={314} y={210} w={270} h={56} label={narrow ? "All ones" : "All bits 1"} sub={narrow ? "maybe: verify" : "maybe: verify in the DB"} tone="warn" />
      </g>
    );
  }
  return (
    <g>
      <Head k={["sizing it", "sizing"]} c="n = 1.2B · p = 0.1%" narrow={narrow} />
      <Txt x={300} y={80} k="s">
        {narrow ? "m = −n·ln p / (ln 2)²" : "m = −n × ln(p) / (ln 2)²   ·   k = (m/n) × ln 2"}
      </Txt>
      <Figs items={[["17.2B", narrow ? "bits" : "bits in the array"], ["2.15 GB", narrow ? "of memory" : "of memory", "ok"], ["10", narrow ? "hashes" : "hash functions", "lit"]]} y={160} t={t} narrow={narrow} />
      <Chips items={[["vs 120 GB+ to store every URL", "vs 120 GB+"]]} t={seg(t, 0.5, 1)} tone="ok" narrow={narrow} />
    </g>
  );
}

function System({ step, t, clock, narrow }: SceneProps) {
  if (step === 0) {
    const q = clock > 0 ? (clock * 0.5) % 1 : 0;
    return (
      <g>
        <Head k={["the full flow", "the flow"]} narrow={narrow} />
        <Box x={16} y={90} w={110} h={64} label="Post" sub="message" tone="sky" />
        <Wire d="M126 122H152" arrow />
        <Box x={152} y={90} w={120} h={64} label={narrow ? "Extract" : "Extractor"} sub="URLs" />
        <Wire d="M272 122H298" arrow />
        <Box x={298} y={90} w={120} h={64} label="Bloom" sub={narrow ? "10 hashes" : "10 hashes"} tone="lit" />
        <Wire d="M418 108H444V76H460" arrow tone="ok" />
        <Wire d="M418 136H444V180H460" arrow tone="warn" />
        <Box x={460} y={48} w={124} h={56} label="Post it" sub="99.9%" tone="ok" />
        <Box x={460} y={152} w={124} h={56} label="Verify" sub={narrow ? "0.1%" : "0.1% · DB"} tone="warn" />
        {clock > 0 && <Token x={lerp(126, 460, q)} y={q < 0.88 ? 122 : 76} s={8} tone="ok" />}
        <Chips items={[["no DB for 99.9%", "99.9% no DB"], ["sub-10 ms", "sub-10 ms"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["keeping it current", "updates"]} c={["3.6M+ threats a day", "3.6M+/day"]} narrow={narrow} />
        <Box x={16} y={60} w={150} h={64} label="Feeds" sub={narrow ? "every 5 min" : "polled every 5 min"} tone="sky" />
        <Wire d="M166 92H210" arrow tone="lit" />
        <Box x={210} y={60} w={170} h={64} label={narrow ? "Buffer" : "Fast buffer"} sub="instantly" tone="lit" />
        <Box x={414} y={60} w={170} h={64} label={narrow ? "Primary" : "Primary filter"} sub={narrow ? "checked too" : "checked as well"} tone="ok" />
        <Box x={16} y={170} w={250} h={64} label={narrow ? "Rebuild" : "Rebuild from DB"} sub={narrow ? "every 24 h" : "every 24 hours, new key"} tone="ok" />
        <Wire d="M266 202H414" arrow tone="ok" />
        <Box x={414} y={170} w={170} h={64} label={narrow ? "Swap" : "Atomic swap"} tone="ok" />
        <Wire d="M499 170V124" arrow tone="ok" />
        <Chips items={[["new buffer before the snapshot: nothing dropped", "nothing dropped"]]} t={seg(t, 0.4, 1)} tone="ok" narrow={narrow} />
      </g>
    );
  }
  const rows: [string, string, string][] = [
    ["pattern pre-filter", "regexes for obvious attack URLs", "patterns"],
    ["trust Bloom hits", "skip DB verify, accept ~0.1% wrongly blocked", "skip verify"],
    ["longer cache TTL", "1 hour for frequent lookups", "1 h cache"],
  ];
  return (
    <g>
      <Head k={["emergency mode", "emergency"]} c={["> 10,000 req/s", "> 10K/s"]} tone="warn" narrow={narrow} />
      {rows.map(([k, v, n], i) => (
        <g key={k} opacity={fade(t, i, 0.16)}>
          <rect className="ax-box warn" x={16} y={52 + i * 58} width={568} height={46} />
          <Txt x={30} y={80 + i * 58} k="t" anchor="start">
            {k}
          </Txt>
          <Txt x={570} y={80 + i * 58} k="s" anchor="end">
            {narrow ? n : v}
          </Txt>
        </g>
      ))}
      <Chips items={[["keep the same filter: resizing lets threats through", "same filter, no resize"]]} t={seg(t, 0.4, 1)} tone="warn" narrow={narrow} />
    </g>
  );
}

function Payoff({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["the cost", "the cost"]} c={["illustrative estimate", "estimate"]} narrow={narrow} />
        <Txt x={16} y={70} k="s" anchor="start" tone="bad">
          {narrow ? "database: $45,000/mo" : "database approach: $45,000 a month"}
        </Txt>
        <rect className="ax-fill bad" x={16} y={82} width={568 * ease(t)} height={22} />
        <Txt x={16} y={146} k="s" anchor="start" tone="ok">
          {narrow ? "Bloom: $3,200/mo" : "Bloom filter approach: $3,200 a month"}
        </Txt>
        <rect className="ax-fill ok" x={16} y={158} width={(568 * 3200 * ease(t)) / 45000} height={22} />
        <Figs items={[["$41,800", narrow ? "saved/month" : "saved a month", "ok"], ["2.15 GB", narrow ? "vs 120 GB+" : "memory, vs 120 GB+"]]} y={262} t={seg(t, 0.3, 1)} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["what it bought", "results"]} tone="ok" narrow={narrow} />
        <Figs items={[["99.9%", narrow ? "no DB query" : "of queries skip the DB", "ok"], ["< 10 ms", narrow ? "in spikes" : "even in spikes", "ok"], ["0", narrow ? "known missed" : "known threats missed", "lit"]]} y={140} t={t} narrow={narrow} />
        <Chips items={[["no false negatives", "no misses"], ["few false positives", "few false alarms"]]} t={seg(t, 0.4, 1)} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k="the lesson" tone="ok" narrow={narrow} />
      <Txt x={300} y={110} k="t">
        {narrow ? "some false positives: fine" : "tolerate some false positives,"}
      </Txt>
      <Txt x={300} y={150} k="d" tone="lit" opacity={fade(t, 1)}>
        {narrow ? "no misses" : "never a false negative"}
      </Txt>
      <Chips items={[["a smarter filter, not a bigger hammer", "smarter, not bigger"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "filter") return <Filter {...p} />;
  if (p.variant === "system") return <System {...p} />;
  if (p.variant === "payoff") return <Payoff {...p} />;
  return <Flood {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "flood",
      label: "The flood",
      steps: [
        { caption: "3 AM at GlobalForum: a 10x spike takes URL checks from 200 million to 2 billion a day, against 1.2 billion known malicious URLs.", tween: 1600 },
        { caption: "A database lookup can't keep up: storing 1.2 billion URLs at about 100 bytes each needs 120 GB+ of RAM, and hourly inserts block reads.", tween: 1400 },
        { caption: "The real question is set membership: is this URL in the bad set? It needs a constant-time answer with predictable memory.", tween: 1200 },
      ],
    },
    {
      id: "filter",
      label: "Bloom filter",
      steps: [
        { caption: "A Bloom filter is a bit array. Each malicious URL is run through several hash functions, and each one sets a bit to 1.", tween: 1800 },
        { caption: "To check a URL, hash it the same way. Any 0 means definitely clean. All 1s means maybe, so verify it. Known threats never slip through.", tween: 2400, ms: 3400 },
        { caption: "For 1.2 billion URLs at a 0.1% false-positive rate, the math gives about 17.2 billion bits, 2.15 GB, and 10 hash functions.", tween: 1400 },
      ],
    },
    {
      id: "system",
      label: "The system",
      steps: [
        { caption: "Each message's URLs go through the Bloom filter. 99.9% end there and post at once; the 0.1% that might match are checked in the database.", tween: 1200, loop: true },
        { caption: "3.6M+ new threats a day land in a fast buffer at once, and the main filter is rebuilt from the database every 24 hours and swapped in.", tween: 1400 },
        { caption: "Above 10,000 requests a second, emergency mode adds pattern filters, trusts Bloom hits without the database and caches longer.", tween: 1400 },
      ],
    },
    {
      id: "payoff",
      label: "The payoff",
      steps: [
        { caption: "Estimated cost falls from about $45,000 a month to $3,200: 2.15 GB of filter instead of 120 GB+ of stored URLs.", tween: 1600 },
        { caption: "99.9% of checks never touch the database, responses stay under 10 ms in spikes, and no known malicious URL gets through.", tween: 1400 },
        { caption: "The lesson: accept a few false positives, never a false negative, and a simple filter beats a bigger database.", tween: 1200 },
      ],
    },
  ],
  Scene,
});
