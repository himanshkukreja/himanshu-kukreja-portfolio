/**
 * The whole lesson, week 0 part 2 (infrastructure building blocks), layer by layer: the edge (CDN,
 * cache rules, DNS, load balancer and health checks), the application layer (stateless servers,
 * monolith first), the data layer (SQL vs NoSQL, cache-aside, object storage) and messaging.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
type Lines = [string, string];
const fade = (t: number, a = 0, b = 0.55) => ease(seg(t, a, b));
const nw = (narrow: boolean, a: string, b: string) => (narrow ? b : a);
/** readout line: "wide|narrow", or the first " · " part when narrow */
const nl = (s: string, narrow: boolean) => (s.includes("|") ? s.split("|")[narrow ? 1 : 0] : narrow ? s.split(" · ")[0] : s);
const Kick = ({ s, tone }: { s: string; tone?: Tone }) => <Txt x={20} y={30} k="k" anchor="start" tone={tone}>{s}</Txt>;
function Readout({ l, narrow, tone }: { l: Lines; narrow: boolean; tone?: Tone }) {
  return (
    <g>
      <Txt x={20} y={H - 38} k="s" anchor="start" tone={tone}>{nl(l[0], narrow)}</Txt>
      <Txt x={20} y={H - 14} k="s" anchor="start">{nl(l[1], narrow)}</Txt>
    </g>
  );
}
function Card({ x, y, w, h, title, lines, tone, o = 1 }: { x: number; y: number; w: number; h: number; title: string; lines: string[]; tone?: Tone; o?: number }) {
  return (
    <g opacity={o}>
      <rect className={`ax-box ${tone || ""}`} x={x} y={y} width={w} height={h} />
      <Txt x={x + 12} y={y + 24} k="k" anchor="start" tone={tone}>{title}</Txt>
      {lines.map((l, i) => <Txt key={i} x={x + 12} y={y + 50 + i * 24} k="s" anchor="start">{l}</Txt>)}
    </g>
  );
}
const hw = (x1: number, x2: number, y: number, tone?: Tone, dash?: boolean) => <Wire d={`M${x1} ${y}H${x2}`} tone={tone} dash={dash} arrow />;
/** elbow from (x1, y1) to (x2, y2) */
const fork = (x1: number, y1: number, x2: number, y2: number, tone?: Tone, dash?: boolean) => <Wire d={`M${x1} ${y1}H${(x1 + x2) / 2}V${y2}H${x2}`} tone={tone} dash={dash} arrow />;
const go = (p: number, x1: number, y1: number, x2: number, y2: number, tone?: Tone) => (p > 0 && p < 1 ? <Token x={lerp(x1, x2, p)} y={lerp(y1, y2, p)} tone={tone} /> : null);

/* ---------------------------------------------------------------- 1 · edge layer */
function Edge({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.95));
  if (step <= 1) {
    const cdn = step === 1;
    return (
      <g>
        <Kick s={cdn ? "CDN · serve from nearby" : "edge · user in Tokyo, origin in US-East"} tone={cdn ? "ok" : "warn"} />
        {cdn ? <g>{hw(120, 240, 158, "lit")}<Wire d="M360 158H460" dash arrow /><Txt x={410} y={146} k="s">{nw(narrow, "miss: 200ms", "miss")}</Txt></g> : <g>{hw(120, 460, 158, "bad")}<Txt x={290} y={146} k="s" tone="bad">200ms RTT</Txt></g>}
        <Box x={20} y={130} w={100} h={56} label="User" sub="Tokyo" />
        {cdn && <Box x={240} y={130} w={120} h={56} label="CDN edge" sub="HIT ~20ms" tone="ok" opacity={fade(t)} />}
        <Box x={460} y={130} w={120} h={56} label="Origin" sub="US-East" tone={cdn ? undefined : "warn"} dim={cdn} />
        {cdn ? go(p, 120, 158, 240, 158) : go(p, 120, 158, 460, 158, "bad")}
        <Readout narrow={narrow} tone={cdn ? "ok" : "warn"} l={cdn ? ["first request misses: ~220ms · then it is cached", "later requests ~20ms · origin load down 90%+"] : ["every request = 200ms+ · origin serves the whole world", "high bandwidth costs for the origin"]} />
      </g>
    );
  }
  if (step === 2)
    return (
      <g>
        <Kick s="what to cache" />
        <Card x={20} y={50} w={180} h={200} tone="ok" title="always" o={fade(t, 0, 0.4)} lines={["images, fonts", "CSS & JS", narrow ? "1-year TTL" : "app.a1b2c3d4.js", narrow ? "" : "1-year TTL"]} />
        <Card x={210} y={50} w={180} h={200} tone="warn" title="with care" o={fade(t, 0.25, 0.65)} lines={narrow ? ["catalog API", "1-5 min TTL"] : ["product catalog", "same for all users", "1-5 min TTL"]} />
        <Card x={400} y={50} w={180} h={200} tone="bad" title="never" o={fade(t, 0.5, 0.9)} lines={narrow ? ["carts", "logged-in data", "POST, PUT"] : ["carts, profiles", "authenticated APIs", "POST, PUT, DELETE", "real-time data"]} />
        <Readout narrow={narrow} l={["hashed filename changes = new URL = cache miss|new hash = new URL = fresh", "target: 95%+ cache hit ratio for static assets|95%+ hit ratio target"]} />
      </g>
    );
  if (step === 3) {
    const ch: [string, string, Tone][] = [["Browser", "Browser", undefined], ["Resolver", "Resolv.", "lit"], ["Root", "Root", undefined], [".com TLD", "TLD", undefined], ["ns1", "ns1", "ok"]];
    return (
      <g>
        <Kick s="DNS · the internet's phone book" />
        {ch.map(([a, b, tone], i) => (
          <g key={a} opacity={fade(t, i * 0.12, i * 0.12 + 0.35)}>
            {i > 1 && <Wire d={`M180 118V${108 - i * 4}H${68 + i * 112}V118`} tone="mute" arrow />}
            {i === 1 && hw(116, 132, 146)}
            <Box x={20 + i * 112} y={118} w={96} h={56} label={nw(narrow, a, b)} tone={tone} />
          </g>
        ))}
        <Txt x={300} y={214} tone="ok" opacity={fade(t, 0.6, 1)}>{nw(narrow, "www.example.com = 93.184.216.34", "= 93.184.216.34")}</Txt>
        <Readout narrow={narrow} l={["full resolution 50-200ms · cached at resolver 1-10ms · local <1ms", "DNS also does geo routing, failover and weighted canaries|also: geo routing, failover"]} />
      </g>
    );
  }
  const down = t > 0.5;
  const sv = [80, 140, 200];
  return (
    <g>
      <Kick s="load balancer · health checks" />
      {hw(130, 200, 168, "lit")}
      {sv.map((y, i) => <g key={y}>{fork(300, 168, 420, y + 20, i === 2 && down ? "bad" : undefined, i === 2 && down)}</g>)}
      <Box x={20} y={140} w={110} h={56} label={nw(narrow, "50K req/s", "50K/s")} sub={narrow ? undefined : "traffic"} />
      <Box x={200} y={140} w={100} h={56} label="LB" tone="lit" />
      {sv.map((y, i) => {
        const r = i === 2 && down ? "DOWN" : down ? "~25K/s" : "~17K/s";
        return <Box key={y} x={420} y={y} w={160} h={40} label={narrow ? `S${i + 1} ${r.replace("/s", "")}` : `Server ${i + 1} · ${r}`} tone={i === 2 && down ? "bad" : "ok"} />;
      })}
      <Readout narrow={narrow} tone={down ? "bad" : undefined} l={["GET /health every 30s · 3 failures in a row = removed", "L4 sees IP + port · L7 sees the full HTTP request"]} />
    </g>
  );
}

/* ---------------------------------------------------------------- 2 · application layer */
function App({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.95));
  if (step <= 1) {
    const sl = step === 1;
    const sv = [70, 130, 190];
    const target = sl ? 1 : 0;
    return (
      <g>
        <Kick s={sl ? "stateless · state lives outside" : "stateful · session in memory"} tone={sl ? "ok" : "bad"} />
        {hw(110, 150, 158)}
        {sv.map((y, i) => <g key={y}>{fork(240, 158, 290, y + 20, i === target ? "lit" : undefined)}</g>)}
        {sl && sv.map((y) => <g key={y}>{fork(420, y + 20, 450, 158, undefined, true)}</g>)}
        <Box x={20} y={130} w={90} h={56} label="User" />
        <Box x={150} y={130} w={90} h={56} label="LB" />
        {sv.map((y, i) => <Box key={y} x={290} y={y} w={130} h={40} label={`Server ${"ABC"[i]}`} sub={undefined} tone={i === 0 ? "bad" : i === target ? "ok" : undefined} />)}
        <Txt x={355} y={64} k="s" tone="bad">{sl ? "crashed: fine" : "crashed: session lost"}</Txt>
        {sl && <Box x={450} y={130} w={130} h={56} label="Redis" sub="sessions" tone="sky" opacity={fade(t)} />}
        {go(p, 240, 158, 290, sv[target] + 20)}
        <Readout narrow={narrow} tone={sl ? "ok" : "bad"} l={sl ? ["any server can handle any request · JWT + Redis", "sessions → Redis · user data → PostgreSQL · files → S3"] : ["the user must return to Server A · sticky sessions", "Server A crashes: the user is logged out"]} />
      </g>
    );
  }
  const svc = ["User", "Order", "Payment"];
  return (
    <g>
      <Kick s="monolith vs microservices" />
      <g opacity={fade(t, 0, 0.45)}>
        <rect className="ax-box lit" x={20} y={50} width={250} height={130} />
        <Txt x={145} y={74} k="k" tone="lit">monolith</Txt>
        <Box x={36} y={88} w={104} h={40} label="User" />
        <Box x={150} y={88} w={104} h={40} label="Order" />
        <Box x={36} y={136} w={218} h={34} label={nw(narrow, "shared database", "shared DB")} tone="sky" />
        <Txt x={145} y={206} k="s">{nw(narrow, "small team · MVP · move fast", "small team, MVP")}</Txt>
      </g>
      <g opacity={fade(t, 0.4, 0.85)}>
        {svc.map((s, i) => (
          <g key={s}>
            <Box x={300 + i * 96} y={70} w={88} h={50} label={nw(narrow, s, s === "Payment" ? "Pay" : s)} sub={narrow ? undefined : "service"} />
            <Wire d={`M${344 + i * 96} 120V136`} arrow />
            <Box x={300 + i * 96} y={136} w={88} h={34} label="DB" tone="sky" />
          </g>
        ))}
        <Txt x={440} y={206} k="s">{nw(narrow, "large team · clear boundaries", "big team, clear lines")}</Txt>
      </g>
      <Readout narrow={narrow} l={["\"start with a monolith, extract services when needed\"|monolith first", "microservices: independent scaling and deploys · complex ops"]} />
    </g>
  );
}

/* ---------------------------------------------------------------- 3 · data layer */
function Data({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const db: [string, string, string, Tone][] = [["PostgreSQL", "Postgres", "ACID · joins", "lit"], ["MongoDB", "Mongo", "documents", "sky"], ["Redis", "Redis", "key-value", "sky"], ["Cassandra", "Cassandra", "massive writes", "sky"], ["Neo4j", "Neo4j", "graph", "sky"]];
    return (
      <g>
        <Kick s="SQL vs NoSQL" />
        {db.map(([a, b, s, tone], i) => <Box key={a} x={i === 0 ? 20 : 20 + ((i - 1) % 2) * 290} y={i === 0 ? 50 : 116 + Math.floor((i - 1) / 2) * 70} w={i === 0 ? 560 : 270} h={56} label={nw(narrow, a, b)} sub={s} tone={tone} opacity={fade(t, i * 0.12, i * 0.12 + 0.35)} />)}
        <Readout narrow={narrow} l={["default: PostgreSQL · transactions, relationships, integrity", "NoSQL: document · key-value · wide-column · graph|document, KV, column, graph"]} />
      </g>
    );
  }
  if (step === 1) {
    const p = ease(seg(t, 0, 0.9));
    return (
      <g>
        <Kick s="caching · cache-aside" />
        {fork(130, 140, 250, 96, "lit")}
        {fork(130, 140, 250, 190, undefined, true)}
        <Box x={20} y={112} w={110} h={56} label="App" sub={nw(narrow, "1000 reqs", "1000")} />
        <Box x={250} y={70} w={150} h={52} label="Redis" sub="900 · 1ms" tone="ok" />
        <Box x={250} y={164} w={150} h={52} label="Database" sub="100 · 50ms" tone="warn" />
        {go(p, 140, 140, 250, 96, "ok")}
        <Txt x={500} y={110} k="d" tone="ok" opacity={fade(t, 0.5, 1)}>5.9ms</Txt>
        <Txt x={500} y={140} k="s" opacity={fade(t, 0.5, 1)}>{nw(narrow, "avg at 90% hits", "avg")}</Txt>
        <Meter x={430} y={164} w={140} h={12} value={5.9 * fade(t, 0.5, 1)} max={50} tone="ok" />
        <Meter x={430} y={190} w={140} h={12} value={50} max={50} tone="warn" />
        <Txt x={500} y={226} k="s">{nw(narrow, "vs 50ms · 8.5x faster", "8.5x faster")}</Txt>
        <Readout narrow={narrow} l={["check cache · on a miss read the DB, then cache it with a TTL|miss: read DB, cache with TTL", "on update: write the DB, then delete the cache key"]} />
      </g>
    );
  }
  return (
    <g>
      <Kick s="object storage · S3" />
      <rect className="ax-box sky" x={20} y={50} width={560} height={150} opacity={fade(t)} />
      <Txt x={36} y={76} k="k" anchor="start" tone="sky">{nw(narrow, "bucket: my-app-uploads", "bucket")}</Txt>
      {(narrow ? ["user123.jpg", "intro.mp4", "q3.pdf"] : ["images/profiles/user123.jpg", "videos/uploads/intro.mp4", "documents/reports/q3.pdf"]).map((o, i) => (
        <g key={o} opacity={fade(t, 0.2 + i * 0.15, 0.5 + i * 0.15)}>
          <Token x={44} y={104 + i * 32} s={8} tone="sky" />
          <Txt x={60} y={109 + i * 32} anchor="start">{o}</Txt>
        </g>
      ))}
      <Txt x={300} y={236} k="d" tone="ok" opacity={fade(t, 0.6, 1)}>11 nines</Txt>
      <Readout narrow={narrow} l={["user uploads · static assets · backups · data lakes", "cheap, HTTP access for the CDN · no partial updates|no partial updates"]} />
    </g>
  );
}

/* ---------------------------------------------------------------- 4 · messaging */
const CON: [string, string][] = [["Inventory", "Inventory"], ["Email", "Email"], ["Analytics", "Analytics"]];
function Messaging({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.95));
  if (step === 0)
    return (
      <g>
        <Kick s="the synchronous chain" tone="bad" />
        {[0, 1, 2].map((i) => <g key={i}>{hw(145 + i * 145, 165 + i * 145, 150, i === 1 ? "bad" : undefined)}</g>)}
        <Box x={20} y={122} w={125} h={56} label="Order" tone="lit" />
        {CON.map(([a, b], i) => <Box key={a} x={165 + i * 145} y={122} w={125} h={56} label={nw(narrow, a, b)} sub={i === 1 ? "down" : undefined} tone={i === 1 ? "bad" : undefined} dim={i === 2} />)}
        {go(p, 145, 150, 310, 150)}
        <Readout narrow={narrow} tone="bad" l={["Order calls Inventory calls Email calls Analytics", "slow, coupled · one failure breaks all"]} />
      </g>
    );
  if (step === 1)
    return (
      <g>
        <Kick s="event-driven · emit and move on" tone="ok" />
        {hw(130, 210, 150, "lit")}
        {CON.map((c, i) => <g key={i}>{fork(330, 150, 440, 80 + i * 70, undefined, true)}</g>)}
        <Box x={20} y={122} w={110} h={56} label="Order" sub={nw(narrow, "OrderCreated", "event")} tone="lit" />
        <Box x={210} y={122} w={120} h={56} label="Event bus" sub="Kafka" tone="sky" />
        {CON.map(([a, b], i) => <Box key={a} x={440} y={56 + i * 70} w={140} h={48} label={nw(narrow, a, b)} sub={i === 1 ? "catches up" : undefined} tone={i === 1 ? "warn" : "ok"} opacity={fade(t, 0.2 + i * 0.1, 0.6 + i * 0.1)} />)}
        {go(p, 130, 150, 210, 150)}
        <Readout narrow={narrow} tone="ok" l={["services don't know each other · easy to add consumers", "failure isolation · replay · but eventual consistency"]} />
      </g>
    );
  const q = ease(seg(t, 0.2, 0.9));
  return (
    <g>
      <Kick s="work queue vs pub-sub" />
      <g opacity={fade(t, 0, 0.4)}>
        {fork(130, 100, 180, 76, "lit")}
        {fork(130, 100, 180, 124)}
        <Box x={20} y={72} w={110} h={56} label="Queue" sub="[3][2][1]" tone="lit" />
        <Box x={180} y={56} w={110} h={40} label="Worker 1" />
        <Box x={180} y={104} w={110} h={40} label="Worker 2" />
        <Txt x={150} y={170} k="s">{nw(narrow, "each message → ONE consumer", "one consumer")}</Txt>
        {go(q, 130, 100, 180, 76)}
      </g>
      <g opacity={fade(t, 0.35, 0.8)}>
        {[0, 1, 2].map((i) => <g key={i}>{fork(420, 100, 470, 64 + i * 36, "sky")}</g>)}
        <Box x={310} y={72} w={110} h={56} label="Topic" tone="sky" />
        {["A", "B", "C"].map((s, i) => <Box key={s} x={470} y={50 + i * 36} w={110} h={28} label={`Sub ${s}`} />)}
        <Txt x={445} y={170} k="s">{nw(narrow, "each message → ALL subscribers", "all subscribers")}</Txt>
      </g>
      <Readout narrow={narrow} l={["work queue: background jobs, tasks · SQS, RabbitMQ", "pub-sub: events and notifications · Kafka keeps a log to replay"]} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "app") return <App {...p} />;
  if (p.variant === "data") return <Data {...p} />;
  if (p.variant === "messaging") return <Messaging {...p} />;
  return <Edge {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    { id: "edge", label: "Edge", steps: [
      { caption: "The edge layer is the first thing users touch. A user in Tokyo fetching from a US-East origin pays about 200ms on every request, and the origin serves the whole world.", tween: 1600, ms: 3600 },
      { caption: "A CDN edge in Tokyo fixes that. The first request misses and takes about 220ms; after that it is cached, about 20ms, and origin load drops by 90% or more.", tween: 1400, ms: 3600 },
      { caption: "Cache static assets for a year with a content hash in the filename; cache shared API responses for 1 to 5 minutes; never cache carts, logged-in data or writes.", tween: 1400, ms: 3800 },
      { caption: "DNS turns a name into an IP: browser, resolver, root, .com TLD, then the authoritative name server. Full resolution takes 50 to 200ms; cached, under a millisecond.", tween: 1600, ms: 3600 },
      { caption: "A load balancer spreads 50,000 requests a second across three servers, about 17K each. Server 3 fails its health checks, is removed, and the other two take about 25K each.", tween: 1600, ms: 3800 },
    ] },
    { id: "app", label: "App layer", steps: [
      { caption: "A stateful server keeps the session in memory, so the user must come back to Server A. When Server A crashes, the session is lost and the user is logged out.", tween: 1200 },
      { caption: "Keep servers stateless: sessions go to Redis and the client carries a JWT. Any server can handle any request, so Server A crashing changes nothing.", tween: 1400 },
      { caption: "Start with a monolith when the team is small and requirements are unclear. Move to microservices, each with its own database, when boundaries are clear and teams are large.", tween: 1400, ms: 3600 },
    ] },
    { id: "data", label: "Data layer", steps: [
      { caption: "PostgreSQL is the default: ACID transactions, joins and integrity. NoSQL fits other shapes: MongoDB documents, Redis key-value, Cassandra for massive writes, Neo4j graphs.", tween: 1400, ms: 3600 },
      { caption: "Cache-aside with Redis: at a 90% hit rate, 900 of 1,000 requests take 1ms and 100 take 50ms. The average is 5.9ms, 8.5 times faster, and database load drops by 90%.", tween: 1400, ms: 3800 },
      { caption: "Files go to object storage like S3: virtually unlimited, 11 nines of durability, cheap, and served over HTTP to the CDN. You replace whole objects; there are no partial updates.", tween: 1200 },
    ] },
    { id: "messaging", label: "Messaging", steps: [
      { caption: "Without messaging, Order calls Inventory, which calls Email, which calls Analytics: a synchronous chain that is slow, coupled, and breaks completely when one service fails.", tween: 1400 },
      { caption: "Event-driven: the order service emits OrderCreated to a Kafka event bus. Inventory, Email and Analytics consume it on their own, so one failure stays isolated.", tween: 1400, ms: 3600 },
      { caption: "Two patterns: a work queue gives each message to one consumer, for background jobs; pub-sub delivers each message to every subscriber, for events and notifications.", tween: 1400, ms: 3600 },
    ] },
  ],
  Scene,
});
