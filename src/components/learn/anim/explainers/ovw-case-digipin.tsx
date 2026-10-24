/**
 * The whole case file "DIGIPIN: a location service for every 4 m square": Priya lost in Dharavi;
 * ~205 billion 4 m × 4 m codes over 3.28M km², 500M+ lookups a day; GeoHash zooming from 5,000 km
 * to ~4.8 m (TE7UD2EVV + check K) and how the real India Post DIGIPIN differs; the request path,
 * spatial search, cache layers, state partitions and regions; floods, Diwali and the benchmarks.
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

function Need({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const p = ease(seg(t, 0.1, 0.9));
    return (
      <g>
        <Head k={["Mumbai · Dharavi", "Dharavi"]} c={["“Building No. 42, Lane 7”", "Lane 7?"]} tone="warn" narrow={narrow} />
        {Array.from({ length: 6 }, (_, i) => (
          <line key={i} className="ax-wire" x1={60 + i * 90} x2={40 + i * 96} y1={50} y2={230} />
        ))}
        {Array.from({ length: 4 }, (_, i) => (
          <line key={i} className="ax-wire" x1={30} x2={580} y1={70 + i * 50} y2={80 + i * 46} />
        ))}
        <Token x={lerp(60, 400, p)} y={lerp(210, 170, p) + Math.sin(p * 18) * 14} s={14} tone="warn" label={narrow ? undefined : "Priya"} />
        <Box x={450} y={90} w={60} h={40} label="?" tone="bad" />
        <Chips items={[["30 minutes asking locals", "30 min lost"], ["unmarked lanes", "no numbers"]]} t={seg(t, 0.4, 1)} tone="warn" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["a code for every 4 m square", "every 4 m square"]} narrow={narrow} />
        <Txt x={300} y={100} k="d" tone="lit">
          TE7UD2EVVK
        </Txt>
        <Txt x={300} y={130} k="s">
          {narrow ? "10 characters, one spot" : "10 characters for one exact spot"}
        </Txt>
        <Figs items={[["3.28M km²", "India"], ["16 m²", narrow ? "per code" : "per code (4 m × 4 m)"], ["~205B", narrow ? "codes" : "unique codes", "lit"]]} y={220} t={t} narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["the requirements", "requirements"]} narrow={narrow} />
      <Figs items={[["500M+", narrow ? "lookups/day" : "lookups a day"], ["50,000/s", narrow ? "peak" : "festival or emergency peak", "warn"], ["< 50 ms", narrow ? "per lookup" : "to resolve a location", "ok"]]} y={130} t={t} narrow={narrow} />
      <Chips items={[["navigation", "navigation"], ["delivery", "delivery"], ["emergencies", "emergency"]]} t={seg(t, 0.4, 1)} narrow={narrow} />
    </g>
  );
}

const ZOOM: [string, string, string][] = [
  ["T", "~5,000 km", "continent"],
  ["TE7", "~156 km", "region"],
  ["TE7UD2", "~1.2 × 0.6 km", "neighbourhood"],
  ["TE7UD2EVV", "~4.8 m", "the spot"],
];
function Geo({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const lvl = Math.min(3, Math.floor(ease(t) * 4));
    return (
      <g>
        <Head k={["GeoHash · zoom in", "GeoHash"]} c={["each character narrows", "narrows"]} narrow={narrow} />
        {[0, 1, 2, 3].map((i) => {
          const s = 180 / Math.pow(2, i);
          return <rect key={i} className={`ax-box ${i === lvl ? "lit" : ""}`} x={40 + (180 - s)} y={50 + (180 - s) / 2} width={s} height={s} opacity={i <= lvl ? 1 : 0.2} />;
        })}
        {ZOOM.map(([c, sz, u], i) => (
          <g key={c} opacity={i <= lvl ? 1 : 0.25}>
            <Txt x={270} y={76 + i * 46} k="t" anchor="start" tone={i === lvl ? "lit" : undefined}>
              {c}
            </Txt>
            <Txt x={584} y={76 + i * 46} k="s" anchor="end">
              {narrow ? sz : `${sz} · ${u}`}
            </Txt>
          </g>
        ))}
        <Chips items={[["9 characters ≈ 4.8 m", "9 chars ≈ 4.8 m"], ["+ check character K", "+ check K"]]} t={seg(t, 0.6, 1)} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["why GeoHash fits", "why GeoHash"]} tone="ok" narrow={narrow} />
        {[
          ["neighbours share a prefix", "shared prefix", "TE7UD2… ≈ same area", "TE7UD2…"],
          ["deterministic", "deterministic", "same lat/lon, same code", "same input"],
          ["sortable", "sortable", "sorting keeps nearby together", "keeps locality"],
        ].map(([k, nk, v, nv], i) => (
          <g key={k} opacity={fade(t, i, 0.16)}>
            <rect className="ax-box ok" x={16} y={52 + i * 58} width={568} height={46} />
            <Txt x={30} y={80 + i * 58} k="t" anchor="start">
              {narrow ? nk : k}
            </Txt>
            <Txt x={570} y={80 + i * 58} k="s" anchor="end">
              {narrow ? nv : v}
            </Txt>
          </g>
        ))}
        <Chips items={[["boundary points can differ from the first character", "edges can differ"]]} t={seg(t, 0.5, 1)} tone="warn" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["the real DIGIPIN", "real DIGIPIN"]} c={["India Post, May 2025", "India Post"]} tone="sky" narrow={narrow} />
      {Array.from({ length: 16 }, (_, i) => (
        <rect key={i} className={`ax-box ${i === 6 ? "sky" : ""}`} x={40 + (i % 4) * 44} y={56 + Math.floor(i / 4) * 44} width={40} height={40} />
      ))}
      <Txt x={240} y={90} k="t" anchor="start" tone="sky">
        {narrow ? "4 × 4, ten times" : "a 4 × 4 grid, ten times"}
      </Txt>
      <Txt x={240} y={120} k="s" anchor="start">
        {narrow ? "16 symbols a level" : "one of 16 symbols per level"}
      </Txt>
      <Txt x={240} y={150} k="s" anchor="start">
        {narrow ? "cells ~3.8 m" : "cells of roughly 3.8 m"}
      </Txt>
      <Txt x={240} y={180} k="s" anchor="start" tone="ok">
        {narrow ? "no lookup DB" : "needs no lookup database"}
      </Txt>
      <Chips items={[["this design: GeoHash-style", "this: GeoHash-style"]]} t={seg(t, 0.4, 1)} tone="sky" narrow={narrow} />
    </g>
  );
}

const PATH: [string, string, Tone?][] = [
  ["App", "App"],
  ["Edge CDN", "CDN"],
  ["API", "API"],
  ["Geo svc", "Geo"],
  ["Redis", "Redis", "ok"],
  ["PostGIS", "DB", "lit"],
];
function Sys({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const q = ease(seg(t, 0.05, 0.95));
    const w = 84;
    const gap = (568 - 6 * w) / 5;
    return (
      <g>
        <Head k={["the request path", "the path"]} c="(lat, lon) → code" narrow={narrow} />
        {PATH.map(([l, n, tone], i) => (
          <g key={l}>
            {i > 0 && <Wire d={`M${16 + i * (w + gap) - gap} 112H${16 + i * (w + gap)}`} arrow />}
            <Box x={16 + i * (w + gap)} y={84} w={w} h={56} label={narrow ? n : l.split(" ")[0]} sub={narrow ? undefined : i === 1 ? "CDN" : i === 5 ? "index" : undefined} tone={tone} />
          </g>
        ))}
        {q > 0 && q < 1 && <Token x={lerp(16 + w, 16 + 5 * (w + gap), q)} y={112} />}
        <Chips items={[["cache hit stops early", "hits stop early"], ["miss: spatial index", "miss: index"]]} t={seg(t, 0.4, 1)} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["spatial search", "spatial search"]} narrow={narrow} />
        <circle className="ax-wire lit" cx={130} cy={140} r={80} />
        <Token x={130} y={140} s={10} />
        <Txt x={130} y={246} k="s" tone="lit">
          {narrow ? "within 500 m" : "all within 500 m"}
        </Txt>
        <rect className="ax-box ok" x={300} y={60} width={160} height={160} />
        <Txt x={380} y={146} k="t" tone="ok">
          te7ud2
        </Txt>
        <Txt x={472} y={110} k="s" anchor="start">
          {narrow ? "prefix" : "one prefix"}
        </Txt>
        <Txt x={472} y={134} k="s" anchor="start">
          {narrow ? "~1.2 km" : "≈ a 1.2 km area"}
        </Txt>
        <Chips items={[["radius queries", "radius"], ["bounding boxes", "boxes"], ["prefix pre-filter", "prefixes"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  if (step === 2) {
    const layers: [string, string, Tone][] = [
      ["client", "app and browser caches", "sky"],
      ["CDN", "edge locations, regional cache", "ok"],
      ["application", "Redis cluster, app cache", "lit"],
      ["database", "PostgreSQL + PostGIS, replicas", "warn"],
    ];
    return (
      <g>
        <Head k={["four cache layers", "cache layers"]} narrow={narrow} />
        {layers.map(([k, v, tone], i) => (
          <g key={k} opacity={fade(t, i, 0.14)}>
            <rect className={`ax-box ${tone}`} x={16 + i * 20} y={50 + i * 54} width={568 - i * 40} height={44} />
            <Txt x={30 + i * 20} y={77 + i * 54} k="k" anchor="start" tone={tone}>
              {k}
            </Txt>
            <Txt x={570 - i * 20} y={77 + i * 54} k="s" anchor="end">
              {narrow ? v.split(",")[0] : v}
            </Txt>
          </g>
        ))}
        <Chips items={[["most lookups never reach the database", "most never hit the DB"]]} t={seg(t, 0.5, 1)} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["partitions and regions", "scale out"]} narrow={narrow} />
      {["MH", "DL", "KA", "…"].map((s, i) => (
        <Box key={s} x={16 + i * 72} y={60} w={62} h={50} label={s} tone={i < 3 ? "lit" : undefined} />
      ))}
      <Txt x={16} y={136} k="s" anchor="start">
        {narrow ? "one partition per state" : "partitioned by state, each with its own indexes"}
      </Txt>
      {[
        ["Mumbai", "primary", "lit"],
        ["Bangalore", "DR standby", "warn"],
        ["Delhi", "read-only", "sky"],
      ].map(([c, r, tone], i) => (
        <g key={c} opacity={fade(t, i + 1)}>
          <Box x={16 + i * 196} y={160} w={176} h={60} label={c} sub={r} tone={tone as Tone} />
        </g>
      ))}
      <Chips items={[["read from replicas", "read replicas"], ["write to the master", "one writer"]]} t={seg(t, 0.4, 1)} narrow={narrow} />
    </g>
  );
}

function Load({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["a flood, like Chennai 2015", "a flood"]} c={["hypothetical", "hypothetical"]} tone="warn" narrow={narrow} />
        <Box x={16} y={70} w={180} h={80} label="SMS" sub={narrow ? "a DIGIPIN" : "stranded: a DIGIPIN"} tone="sky" />
        <Wire d="M196 110H240" arrow tone="warn" />
        <Box x={240} y={70} w={150} h={80} label="Lookup" sub="10,000/s" tone="warn" />
        <Wire d="M390 110H434" arrow tone="ok" />
        <Box x={434} y={70} w={150} h={80} label="Rescue" sub={narrow ? "exact spot" : "the exact spot"} tone="ok" />
        <Chips items={[["24-hour cache", "24 h cache"], ["simplified queries", "simple queries"], ["all cache layers first", "cache first"]]} t={t} tone="warn" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["the Diwali rush", "Diwali"]} c="100,000/s" tone="warn" narrow={narrow} />
        <Figs items={[["100,000", narrow ? "lookups/s" : "DIGIPIN lookups a second", "warn"]]} y={110} t={t} narrow={narrow} />
        <Chips items={[["pre-compute zones", "pre-compute"], ["cache at the edge", "edge cache"], ["route by state", "by state"]]} y={200} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["the benchmarks", "benchmarks"]} c={["actual vs target", "vs target"]} tone="ok" narrow={narrow} />
      <Figs items={[["12 ms", narrow ? "vs < 50 ms" : "lookup, target < 50 ms", "ok"], ["25,000", narrow ? "QPS vs 10K" : "QPS, target 10,000", "ok"]]} y={110} t={t} narrow={narrow} />
      <Figs items={[["94%", narrow ? "cache hits" : "cache hit rate", "ok"], ["99.95%", narrow ? "available" : "availability"]]} y={210} t={seg(t, 0.3, 1)} narrow={narrow} />
      <Chips items={[["one precise, shareable code for every place", "one code per place"]]} t={seg(t, 0.5, 1)} tone="ok" narrow={narrow} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "geo") return <Geo {...p} />;
  if (p.variant === "sys") return <Sys {...p} />;
  if (p.variant === "load") return <Load {...p} />;
  return <Need {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "need",
      label: "The problem",
      steps: [
        { caption: "Priya, a delivery driver in Dharavi, has “Building No. 42, Lane 7” and unmarked lanes. She loses 30 minutes asking locals.", tween: 2400 },
        { caption: "Give every 4 m × 4 m square a code like TE7UD2EVVK. Across India's 3.28 million km², that's about 205 billion codes.", tween: 1400 },
        { caption: "The service must handle 500 million+ lookups a day, peaks of 50,000 a second, and resolve a location in under 50 ms.", tween: 1400 },
      ],
    },
    {
      id: "geo",
      label: "GeoHash",
      steps: [
        { caption: "GeoHash turns latitude and longitude into a string, and every character narrows the cell: T is ~5,000 km, TE7UD2EVV is about 4.8 m.", tween: 2400, ms: 3400 },
        { caption: "Nearby places usually share a prefix, the same coordinates always give the same code, and sorting codes keeps nearby places together.", tween: 1400 },
        { caption: "The real India Post DIGIPIN is different: it splits a box over India into a 4 × 4 grid ten times, for ~3.8 m cells, with no lookup database.", tween: 1400, ms: 3400 },
      ],
    },
    {
      id: "sys",
      label: "The system",
      steps: [
        { caption: "A lookup goes from the app through the edge CDN and API to the GeoService, which tries Redis before PostgreSQL with PostGIS.", tween: 2000 },
        { caption: "Spatial search answers “everything within 500 m”, and a GeoHash prefix like te7ud2 pre-filters an area of about 1.2 km.", tween: 1200 },
        { caption: "Caches stack up: on the phone and browser, at CDN edges, in Redis and the app, with the database and its replicas last.", tween: 1400 },
        { caption: "The table is partitioned by state, reads go to replicas, and regions split roles: Mumbai primary, Bangalore standby, Delhi read-only.", tween: 1400 },
      ],
    },
    {
      id: "load",
      label: "Under load",
      steps: [
        { caption: "In a flood like Chennai's in 2015, rescuers might need 10,000 lookups a second. Emergency mode caches for 24 hours and simplifies queries.", tween: 1400 },
        { caption: "For a Diwali rush of 100,000 lookups a second, delivery zones are pre-computed, cached at the edge, and routed by state.", tween: 1400 },
        { caption: "The benchmarks: 12 ms average lookups against a 50 ms target, 25,000 queries a second, a 94% cache hit rate and 99.95% availability.", tween: 1400 },
      ],
    },
  ],
  Scene,
});
