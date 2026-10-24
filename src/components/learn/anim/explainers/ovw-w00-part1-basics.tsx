/**
 * The whole lesson, week 0 part 1 (system design fundamentals): requirements → HLD → LLD with the
 * URL shortener, the four-step interview framework on the Twitter example, the diagram types, and
 * sync vs async communication with the four API styles.
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
/** a titled card with a few lines of small text */
function Card({ x, y, w, h, title, lines, tone, o = 1 }: { x: number; y: number; w: number; h: number; title: string; lines: string[]; tone?: Tone; o?: number }) {
  return (
    <g opacity={o}>
      <rect className={`ax-box ${tone || ""}`} x={x} y={y} width={w} height={h} />
      <Txt x={x + 14} y={y + 24} k="k" anchor="start" tone={tone}>{title}</Txt>
      {lines.map((l, i) => (
        <Txt key={i} x={x + 14} y={y + 52 + i * 26} anchor="start">{l}</Txt>
      ))}
    </g>
  );
}
const hw = (x1: number, x2: number, y: number, tone?: Tone, dash?: boolean) => <Wire d={`M${x1} ${y}H${x2}`} tone={tone} dash={dash} arrow />;

/* ---------------------------------------------------------------- 1 · design levels */
const SPEC = [["Requirements", "Reqs", "what to build"], ["HLD", "HLD", "major parts"], ["LLD", "LLD", "internals"], ["Build", "Build", "implementation"]];
function Levels({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.95));
  if (step === 0)
    return (
      <g>
        <Kick s="the system design spectrum" />
        {SPEC.map(([a, b, s], i) => (
          <g key={a}>
            {i > 0 && hw(i * 145 + 5, i * 145 + 20, 150)}
            <Box x={20 + i * 145} y={120} w={125} h={60} label={nw(narrow, a, b)} sub={narrow ? undefined : s} tone={i === 1 ? "lit" : i === 2 ? "sky" : undefined} />
          </g>
        ))}
        {p > 0 && p < 1 && <Token x={lerp(82, 518, p)} y={110} />}
        <Readout narrow={narrow} l={["HLD: what are the major components and how do they interact?|HLD: the major components", "LLD: how does each component work internally?|LLD: how each one works"]} />
      </g>
    );
  if (step === 1) {
    const api = [95, 140, 185];
    const rt: [number, string, string, Tone][] = [[80, "Cache · Redis", "Cache", "sky"], [136, "Database", "Database", "ok"], [192, "Counter · ID gen", "ID counter", undefined]];
    return (
      <g opacity={fade(t, 0, 0.3)}>
        <Kick s="HLD · URL shortener" />
        {hw(92, 108, 160)}
        {hw(172, 188, 160)}
        {api.map((y) => <Wire key={y} d={`M244 160H252V${y + 18}H262`} arrow />)}
        {rt.map(([y]) => <Wire key={y} d={`M358 158H368V${y + 22}H380`} arrow />)}
        <Box x={20} y={135} w={72} h={50} label="Users" />
        <Box x={108} y={135} w={64} h={50} label="CDN" />
        <Box x={188} y={135} w={56} h={50} label="LB" />
        {api.map((y, i) => <Box key={y} x={262} y={y} w={96} h={36} label={`API ${["1", "2", "N"][i]}`} tone="lit" />)}
        {rt.map(([y, a, b, tone]) => <Box key={y} x={380} y={y} w={200} h={44} label={nw(narrow, a, b)} tone={tone} />)}
        {p > 0 && p < 1 && <Token x={p < 0.5 ? lerp(92, 262, p * 2) : lerp(358, 380, p * 2 - 1)} y={p < 0.5 ? 160 : lerp(158, 102, p * 2 - 1)} />}
        <Readout narrow={narrow} l={["boxes and arrows · component names · data flow", "stateless API servers · cache for popular URLs"]} />
      </g>
    );
  }
  if (step === 2)
    return (
      <g>
        <Kick s="LLD · inside one component" tone="sky" />
        <Card x={20} y={52} w={270} h={200} tone="sky" title="table: urls" o={fade(t)} lines={narrow ? ["id  PK", "short_code", "  UNIQUE index", "click_count"] : ["id           BIGINT PK", "short_code   VARCHAR(10)", "  UNIQUE INDEX", "click_count  BIGINT"]} />
        <Card x={310} y={52} w={270} h={200} tone="lit" title="API contract" o={fade(t, 0.3, 0.8)} lines={["POST /api/v1/shorten", "  → 201 Created", "GET /abc123", "  → 302 Found"]} />
        <Readout narrow={narrow} l={["LLD: schemas · API contracts · algorithms · error handling", "resolve() returns the 302 fast · click count updates async"]} />
      </g>
    );
  return (
    <g>
      <Kick s="in the interview" />
      <g opacity={fade(t)}>
        <Box x={20} y={96} w={330} h={56} label={nw(narrow, "HLD · first 20-30 min", "HLD 20-30m")} tone="lit" />
        {!narrow && <Txt x={185} y={176} k="s">stakeholders · architects · PMs</Txt>}
      </g>
      <g opacity={fade(t, 0.35, 0.85)}>
        <Box x={360} y={96} w={220} h={56} label={nw(narrow, "LLD · last 15-20 min", "LLD 15-20m")} tone="sky" />
        {!narrow && <Txt x={470} y={176} k="s">developers · tech leads</Txt>}
        <Txt x={300} y={226} tone="lit">{nw(narrow, "\"Let's dive deeper into X\"", "\"dive deeper into X\"")}</Txt>
      </g>
      <Readout narrow={narrow} l={["start with the big picture (HLD) · most of the discussion", "then deep-dive 1-2 critical components (LLD)"]} />
    </g>
  );
}

/* ---------------------------------------------------------------- 2 · the four-step framework */
const PH = [["1 · Clarify", "Clarify", "3-5 min"], ["2 · Estimate", "Estimate", "5-7 min"], ["3 · HLD", "HLD", "15-20 min"], ["4 · Deep dive", "Deep dive", "10-15 min"]];
const NINES: [string, string, string, number][] = [["99%", "3.65 days/yr", "3.65 d", 4], ["99.9%", "8.76 hours/yr", "8.76 h", 3], ["99.99%", "52.6 min/yr", "52.6 min", 2], ["99.999%", "5.26 min/yr", "5.26 min", 1]];
function Framework({ step, t, narrow }: SceneProps) {
  const ph = [0, 0, 1, 2, 3][Math.min(step, 4)];
  const o = fade(t, 0.1, 0.6);
  const quad = (xs: string[], tone: Tone) => xs.map((s, i) => <Box key={s} x={20 + i * 142} y={150} w={132} h={60} label={s} tone={tone} opacity={fade(t, i * 0.12, i * 0.12 + 0.4)} />);
  const body =
    step === 0 ? (
      <g opacity={o}>
        <Card x={20} y={118} w={270} h={136} tone="sky" title="functional · does" lines={["post tweets", "view home timeline"]} />
        <Card x={310} y={118} w={270} h={136} tone="lit" title={nw(narrow, "non-functional · how well", "how well")} lines={["100M MAU", "1000:1 read/write", "P99 < 200ms feed"]} />
      </g>
    ) : step === 1 ? (
      <g>
        {NINES.map(([a, b, c, v], i) => (
          <g key={a} opacity={fade(t, i * 0.12, i * 0.12 + 0.4)}>
            <Txt x={20} y={142 + i * 34} anchor="start" tone={i === 2 ? "lit" : undefined}>{a}</Txt>
            <Meter x={130} y={131 + i * 34} w={290} h={14} value={v} max={4} tone={i === 2 ? "lit" : "warn"} />
            <Txt x={436} y={142 + i * 34} k="s" anchor="start">{nw(narrow, b, c)}</Txt>
          </g>
        ))}
      </g>
    ) : step === 2 ? (
      <g>{quad(["traffic", "storage", "bandwidth", "servers"], "lit")}</g>
    ) : step === 3 ? (
      <g opacity={o}>
        {hw(110, 136, 180)}
        {hw(226, 252, 180)}
        <Wire d="M342 180H360V150H380" arrow />
        <Wire d="M342 180H360V210H380" arrow />
        <Box x={20} y={155} w={90} h={50} label="Client" />
        <Box x={136} y={155} w={90} h={50} label="LB" />
        <Box x={252} y={155} w={90} h={50} label="API" tone="lit" />
        <Box x={380} y={128} w={200} h={44} label="Cache" tone="sky" />
        <Box x={380} y={188} w={200} h={44} label="Database" tone="ok" />
      </g>
    ) : (
      <g>{quad(["schema", "API", "algorithm", "failures"], "sky")}</g>
    );
  const rd: Lines[] = [
    ["\"Design a Twitter-like platform\" · ask before you build", "functional = what it does · non-functional = how well"],
    ["each extra nine cuts allowed downtime 10x", "typical: API < 100ms P99 · cache hit < 1ms P99"],
    ["traffic volume · storage · bandwidth", "then size servers and databases"],
    ["draw the architecture · core components · data flow", "discuss technology choices"],
    ["database schema · API design · critical-path algorithm", "handle edge cases and failures"],
  ];
  return (
    <g>
      <Kick s={["step 1 · requirements", "step 1 · non-functional numbers", "step 2 · back-of-envelope", "step 3 · high-level design", "step 4 · deep dive"][Math.min(step, 4)]} />
      {PH.map(([a, b, s], i) => <Box key={a} x={20 + i * 142} y={46} w={132} h={52} label={nw(narrow, a, b)} sub={s} tone={i === ph ? "lit" : undefined} dim={i > ph} />)}
      {body}
      <Readout narrow={narrow} l={rd[Math.min(step, 4)]} />
    </g>
  );
}

/* ---------------------------------------------------------------- 3 · diagrams */
const LANES = [["Client", "Client"], ["API Gateway", "Gateway"], ["Auth Service", "Auth"], ["Database", "DB"]];
const MSG: [number, number, string, string, boolean][] = [[0, 1, "POST /login", "login", false], [1, 2, "validate", "check", false], [2, 3, "find user", "find", false], [3, 2, "user data", "user", true], [2, 1, "JWT token", "JWT", true], [1, 0, "200 OK + token", "200 OK", true]];
function Diagrams({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const col = (x: number, w: number, head: string, xs: string[], tone?: Tone) => (
      <g>
        <Txt x={x + w / 2} y={64} k="s">{head}</Txt>
        {xs.map((s, i) => <Box key={s} x={x} y={74 + i * 46} w={w} h={36} label={s} tone={tone} />)}
      </g>
    );
    return (
      <g opacity={fade(t, 0, 0.4)}>
        <Kick s="architecture diagram" />
        {hw(96, 120, 158)}
        {hw(250, 274, 158)}
        {hw(404, 428, 92)}
        <Wire d="M404 184H416V230H428" dash arrow />
        <Box x={20} y={132} w={76} h={52} label={nw(narrow, "Clients", "Users")} />
        {col(120, 130, "edge", ["CDN", "WAF", "LB", "API GW"])}
        {col(274, 130, "app", narrow ? ["Svc A", "Svc B", "Svc C"] : ["Service A", "Service B", "Service C"], "lit")}
        {col(428, 152, "data", ["Cache", "Primary", "Replica", "Queue"], "sky")}
        <Readout narrow={narrow} l={["components and how they connect · used in HLD", "solid arrow = sync call · dashed = async"]} />
      </g>
    );
  }
  if (step === 1)
    return (
      <g>
        <Kick s="sequence diagram · login" />
        {LANES.map(([a, b], i) => (
          <g key={a}>
            <Box x={20 + i * 145} y={44} w={125} h={36} label={nw(narrow, a, b)} />
            <Wire d={`M${82 + i * 145} 80V268`} tone="mute" dash />
          </g>
        ))}
        {MSG.map(([a, b, l, s, back], i) => {
          const y = 104 + i * 30;
          const x1 = 82 + a * 145;
          const x2 = 82 + b * 145;
          return (
            <g key={l} opacity={fade(t, i * 0.13, i * 0.13 + 0.2)}>
              <Wire d={`M${x1} ${y}H${x2 + (x2 > x1 ? -4 : 4)}`} dash={back} tone={back ? undefined : "lit"} arrow />
              <Txt x={(x1 + x2) / 2} y={y - 6} k="s">{nw(narrow, l, s)}</Txt>
            </g>
          );
        })}
        <Readout narrow={narrow} l={["interactions over time · request and response, in order", "solid = request · dashed = response"]} />
      </g>
    );
  const ent: [string, string, string, Tone][] = [["USER", "USER", "PK id", "sky"], ["ORDER", "ORDER", "FK user_id", "lit"], ["ORDER_ITEM", "ITEM", "FK order_id", "warn"], ["PRODUCT", "PRODUCT", "price · stock", "sky"]];
  return (
    <g>
      <Kick s="entity-relationship diagram" />
      {ent.map(([a, b, s, tone], i) => (
        <g key={a} opacity={fade(t, i * 0.15, i * 0.15 + 0.4)}>
          <Box x={20 + i * 146} y={120} w={122} h={60} label={nw(narrow, a, b)} sub={narrow ? undefined : s} tone={tone} />
          {i > 0 && (i < 3 ? hw(i * 146 - 4, i * 146 + 20, 150) : <Wire d={`M${i * 146 + 20} 150H${i * 146 - 4}`} arrow />)}
          {i > 0 && <Txt x={i * 146 + 8} y={110} k="s">1:N</Txt>}
        </g>
      ))}
      <Readout narrow={narrow} l={["tables and relationships · used in LLD", "Product M:N Order via the ORDER_ITEM junction table"]} />
    </g>
  );
}

/* ---------------------------------------------------------------- 4 · communication */
function Comms({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.95));
  if (step <= 1) {
    const sync = step === 0;
    const tok = p > 0 && p < 1 ? (sync ? { x: p < 0.5 ? lerp(130, 245, p * 2) : lerp(245, 130, p * 2 - 1), y: p < 0.5 ? 140 : 166 } : p < 0.5 ? { x: lerp(130, 245, p * 2), y: 148 } : { x: lerp(355, 470, p * 2 - 1), y: 148 }) : null;
    return (
      <g>
        <Kick s={sync ? "synchronous · request-response" : "asynchronous · message-based"} tone={sync ? "sky" : "lit"} />
        {sync ? (
          <g>
            {hw(130, 245, 140, "lit")}
            <Wire d="M245 166H130" arrow />
            <Box x={20} y={120} w={110} h={56} label="Client" sub="waiting…" tone="warn" />
            <Box x={245} y={120} w={110} h={56} label="Server" sub={nw(narrow, "processing", "busy")} tone="sky" />
          </g>
        ) : (
          <g>
            {hw(130, 245, 148, "lit")}
            {hw(355, 470, 148, "lit", true)}
            <Box x={20} y={120} w={110} h={56} label={nw(narrow, "Producer", "Prod.")} sub="continues" tone="ok" />
            <Box x={245} y={120} w={110} h={56} label="Queue" sub="ACK" tone="lit" />
            <Box x={470} y={120} w={110} h={56} label={nw(narrow, "Consumer", "Cons.")} sub={nw(narrow, "processing", "later")} />
          </g>
        )}
        {tok && <Token {...tok} />}
        <Readout narrow={narrow} l={sync ? ["simple · immediate feedback", "but the client is blocked · tight coupling"] : ["loose coupling · producer not blocked", "queue buffers spikes · retry and replay possible"]} tone={sync ? "warn" : "ok"} />
      </g>
    );
  }
  if (step === 2)
    return (
      <g>
        <Kick s="when to use each" />
        <Card x={20} y={52} w={270} h={200} tone="sky" title="sync when" o={fade(t)} lines={narrow ? ["login, checkout", "fast ops", "check balance"] : ["login, checkout, search", "fast (< 100ms)", "check balance first"]} />
        <Card x={310} y={52} w={270} h={200} tone="lit" title="async when" o={fade(t, 0.3, 0.8)} lines={narrow ? ["video, reports", "emails, push", "order fan-out"] : ["video, reports", "emails, push", "order → inventory,", "  shipping, email"]} />
        <Readout narrow={narrow} l={["the user needs the answer now: sync", "slow work, events and spikes: async"]} />
      </g>
    );
  const api: [string, string, string, Tone][] = [["REST", "/users/123 · CRUD, public APIs", "CRUD, public", "sky"], ["GraphQL", "one endpoint · exact fields", "exact fields", "lit"], ["gRPC", "binary protobuf · internal", "internal, fast", "ok"], ["WebSocket", "full-duplex · server push", "server push", "warn"]];
  return (
    <g>
      <Kick s="API styles" />
      {api.map(([a, b, c, tone], i) => <Box key={a} x={20 + (i % 2) * 290} y={70 + Math.floor(i / 2) * 90} w={270} h={70} label={a} sub={nw(narrow, b, c)} tone={tone} opacity={fade(t, i * 0.15, i * 0.15 + 0.4)} />)}
      <Readout narrow={narrow} l={["REST simple · GraphQL flexible · gRPC fast", "WebSocket: chat, live updates, gaming"]} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "framework") return <Framework {...p} />;
  if (p.variant === "diagrams") return <Diagrams {...p} />;
  if (p.variant === "comms") return <Comms {...p} />;
  return <Levels {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    { id: "levels", label: "HLD & LLD", steps: [
        { caption: "System design runs from requirements through high-level design and low-level design to implementation. HLD asks what the major components are; LLD asks how each one works inside.", tween: 1600, ms: 3600 },
        { caption: "The URL shortener's HLD: users, a CDN, a load balancer, stateless API servers, a Redis cache for popular URLs, the database and a counter service for IDs.", tween: 1600, ms: 3600 },
        { caption: "Its LLD zooms into one piece: the urls table with a unique index on short_code, and the API contract, POST to shorten and a 302 redirect, with the click count updated asynchronously.", tween: 1200, ms: 3800 },
        { caption: "In the interview, HLD takes the first 20 to 30 minutes; then you drill into one or two critical components when the interviewer says: let's dive deeper into X.", tween: 1200 }, ] },
    { id: "framework", label: "Framework", steps: [
        { caption: "Step 1, clarify requirements. For a Twitter-like platform: posting and viewing the timeline are functional; 100M monthly users, a 1000:1 read ratio and P99 under 200ms are non-functional.", tween: 1200, ms: 4000 },
        { caption: "Non-functional numbers matter. 99.9% availability allows 8.76 hours of downtime a year; each extra nine cuts that by 10x, down to 52.6 minutes, then 5.26.", tween: 1400 },
        { caption: "Step 2, back-of-envelope estimation in 5 to 7 minutes: traffic, storage and bandwidth, then the servers and databases to handle them.", tween: 1200 },
        { caption: "Step 3, the high-level design, 15 to 20 minutes: draw the architecture, name the core components, show the data flow and justify the technology choices.", tween: 1200 },
        { caption: "Step 4, the deep dive: database schema, API design, the algorithm on the critical path, and how edge cases and failures are handled.", tween: 1200 }, ] },
    { id: "diagrams", label: "Diagrams", steps: [
        { caption: "The architecture diagram is the most common: an edge layer, an application layer and a data layer. Solid arrows are synchronous calls, dashed arrows asynchronous.", tween: 1000, ms: 3400 },
        { caption: "A sequence diagram shows interactions over time: the login request goes client, API gateway, auth service, database, and the JWT token comes back.", tween: 1800 },
        { caption: "An entity-relationship diagram shows tables for low-level design: a user has many orders, and products relate to orders many-to-many through ORDER_ITEM.", tween: 1400 }, ] },
    { id: "comms", label: "Sync & async", steps: [
        { caption: "Synchronous communication: the client sends a request and waits for the response. Simple, with immediate feedback, but the client is blocked and tightly coupled.", tween: 1600 },
        { caption: "Asynchronous: the producer puts a message on a queue, gets an ACK and carries on. A consumer processes it later. Loosely coupled, but eventually consistent.", tween: 1600 },
        { caption: "Use sync when the user needs an answer now, like login, checkout or checking a balance before a transfer. Use async for slow work, notifications and fan-out like order placed.", tween: 1200, ms: 3800 },
        { caption: "Then pick an API style: REST for CRUD and public APIs, GraphQL for exactly the fields a client needs, gRPC for fast internal calls, WebSocket for server push.", tween: 1400, ms: 3600 }, ] },
  ],
  Scene,
});
