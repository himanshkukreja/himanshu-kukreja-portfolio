/**
 * The whole lesson, week 0 part 4 (networking): what "the client connects to the server" really
 * hides (DNS, TCP, TLS, HTTP, LB), the transport layer (TCP guarantees, head-of-line blocking,
 * UDP, port exhaustion), HTTP/1.1 → 2 → 3 plus push, and where latency comes from.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
type Lines = [string, string];
const fade = (t: number, a = 0, b = 0.55) => ease(seg(t, a, b));
const nw = (narrow: boolean, a: string, b: string) => (narrow ? b : a);
/** "wide|narrow", or the first " · " part when narrow */
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
      {lines.map((l, i) => <Txt key={i} x={x + 12} y={y + 52 + i * 26} anchor="start">{l}</Txt>)}
    </g>
  );
}

/* ---------------------------------------------------------------- 1 · one request, step by step */
const STRIP = ["DNS", "TCP", "TLS", "HTTP", "LB", "Back"];
type Msg = [text: string, short: string, back: boolean];
const JOURNEY: { k: string; srv: string; sub: string; on: number[]; m: Msg[]; l: Lines; tone?: Tone }[] = [
  { k: "\"the client connects to the server\"", srv: "Server", sub: "", on: [], m: [["a request?", "a request?", false]], l: ["each step can fail · each step has latency", "DNS → TCP → TLS → HTTP → LB → response|DNS → TCP → TLS → HTTP"] },
  { k: "1 · DNS resolution", srv: "Resolver", sub: "DNS", on: [0], m: [["www.example.com?", "name?", false], ["93.184.216.34", "IP", true]], l: ["full resolution 50-200ms · cached at resolver 1-10ms", "cached locally: under 1ms|cached: <1ms"] },
  { k: "2 · TCP three-way handshake", srv: "Server", sub: ":443", on: [1], m: [["SYN (seq=100)", "SYN", false], ["SYN-ACK", "SYN-ACK", true], ["ACK", "ACK", false]], l: ["1 RTT before the first request · NYC ↔ London ≈ 80ms|1 RTT before sending", "pooling and keep-alive skip it next time|pooling skips it"] },
  { k: "3 · TLS 1.3 handshake", srv: "Server", sub: "cert", on: [2], m: [["ClientHello + key share", "Hello", false], ["ServerHello + certificate", "Hello + cert", true], ["Finished", "Finished", false]], l: ["TLS 1.3: 1 RTT · TLS 1.2: 2 RTT · resumption: 0 RTT", "authentication · confidentiality · integrity"], tone: "ok" },
  { k: "4 · request, routing, response", srv: "LB → app", sub: "instance", on: [3, 4, 5], m: [["GET / · Host, cookies", "GET /", false], ["200 OK + body", "200 OK", true]], l: ["the load balancer picks an instance · same path back", "then CDN, HTTP/2-3, keep-alive and caching cut it down|then cut round trips"] },
];
function Journey({ step, t, narrow }: SceneProps) {
  const j = JOURNEY[Math.min(step, 4)];
  const n = j.m.length;
  return (
    <g>
      <Kick s={j.k} tone={j.tone} />
      {STRIP.map((s, i) => <Box key={s} x={20 + i * 95} y={44} w={85} h={32} label={s} tone={j.on.includes(i) ? "lit" : undefined} dim={step > 0 && !j.on.includes(i)} />)}
      <Box x={20} y={96} w={100} h={150} label="Client" />
      <Box x={480} y={96} w={100} h={150} label={narrow ? j.srv.replace("Resolver", "DNS").replace("LB → app", "LB") : j.srv} sub={narrow && j.srv === "Resolver" ? "resolver" : j.sub || undefined} tone={step === 0 ? undefined : "sky"} />
      {j.m.map(([a, b, back], i) => {
        const y = 136 + i * 40 - (n - 1) * 20 + (n === 1 ? 20 : 20);
        const q = ease(seg(t, i / n, (i + 0.9) / n));
        const [x1, x2] = back ? [480, 120] : [120, 480];
        return (
          <g key={a} opacity={q > 0 ? 1 : 0}>
            <Wire d={`M${x1} ${y}H${back ? x2 + 2 : x2 - 2}`} tone={back ? undefined : "lit"} dash={back} arrow />
            <Txt x={300} y={y - 8} k="s">{nw(narrow, a, b)}</Txt>
            {q < 1 && <Token x={lerp(x1, x2, q)} y={y} tone={back ? "sky" : undefined} />}
          </g>
        );
      })}
      <Readout narrow={narrow} l={j.l} tone={j.tone} />
    </g>
  );
}

/* ---------------------------------------------------------------- 2 · transport: TCP, UDP, ports */
function Transport({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.9));
  if (step === 0) {
    const g: [string, string, string][] = [["reliable", "ACKs + retransmits", "ACK + retry"], ["ordered", "sequence numbers", "seq numbers"], ["flow control", "receive window", "recv window"], ["congestion ctl", "slow start, back off", "slow start"]];
    return (
      <g>
        <Kick s="TCP · the reliable protocol" tone="sky" />
        {g.map(([a, b, c], i) => <Box key={a} x={20 + (i % 2) * 290} y={52 + Math.floor(i / 2) * 76} w={270} h={62} label={a} sub={nw(narrow, b, c)} tone="sky" opacity={fade(t, i * 0.12, i * 0.12 + 0.4)} />)}
        {[0, 1, 2, 3, 4].map((i) => <Token key={i} x={lerp(40, 560, (p + i * 0.07) % 1)} y={226} label={String(i + 1)} opacity={p > 0 && p < 1 ? 1 : 0} />)}
        <Readout narrow={narrow} l={["a byte stream: no message boundaries · the app adds framing|a byte stream, no framing", "1 RTT to connect · TIME_WAIT after close"]} />
      </g>
    );
  }
  if (step === 1) {
    const st = ["ok", "bad", "warn", "warn", "warn"] as Tone[];
    return (
      <g>
        <Kick s="TCP head-of-line blocking" tone="bad" />
        <Txt x={20} y={104} k="s" anchor="start">sent</Txt>
        <Txt x={20} y={184} k="s" anchor="start">{nw(narrow, "app gets", "app")}</Txt>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <Box x={140 + i * 86} y={80} w={66} h={40} label={String(i + 1)} />
            <g opacity={fade(t, 0.2 + i * 0.1, 0.5 + i * 0.1)}>
              <Box x={140 + i * 86} y={160} w={66} h={40} label={i === 1 ? "?" : String(i + 1)} tone={st[i]} />
            </g>
          </g>
        ))}
        <Txt x={173} y={230} k="s" tone="bad" opacity={fade(t, 0.4, 0.8)}>{nw(narrow, "2 lost", "lost")}</Txt>
        <Txt x={430} y={230} k="s" tone="warn" opacity={fade(t, 0.6, 1)}>{nw(narrow, "3, 4, 5 wait for the resend", "3-5 wait")}</Txt>
        <Readout narrow={narrow} tone="bad" l={["HTTP/2 streams share one TCP connection: one loss blocks all|one loss blocks all streams", "this is why HTTP/3 uses QUIC over UDP|so HTTP/3 uses QUIC"]} />
      </g>
    );
  }
  if (step === 2)
    return (
      <g>
        <Kick s="UDP · the fast protocol" tone="lit" />
        <Wire d="M130 150H470" arrow />
        <Box x={20} y={122} w={110} h={56} label="Sender" sub={nw(narrow, "voice call", "call")} />
        <Box x={470} y={122} w={110} h={56} label="Receiver" sub={nw(narrow, "plays on", "plays")} tone="ok" />
        {[0, 1, 2, 3].map((i) => {
          const f = (p * 0.9 + i * 0.22) % 1;
          const lost = i === 1;
          return <Token key={i} x={lerp(140, lost ? 320 : 460, f)} y={lost ? 150 + Math.max(0, f - 0.5) * 120 : 150} tone={lost ? "bad" : "lit"} opacity={p > 0 && p < 1 ? 1 : 0} />;
        })}
        <Txt x={300} y={212} k="s" tone="bad">{nw(narrow, "a lost packet is skipped, not waited for", "lost: skipped")}</Txt>
        <Txt x={300} y={110} k="s">{nw(narrow, "no handshake · 8-byte header · datagrams", "no handshake")}</Txt>
        <Readout narrow={narrow} l={["late data is useless: better to skip than wait|skip, don't wait", "use it for calls, gaming, DNS and QUIC"]} />
      </g>
    );
  return (
    <g>
      <Kick s="ephemeral port exhaustion" tone="bad" />
      <Txt x={20} y={74} k="s" anchor="start">{nw(narrow, "ports needed: 500 conn/s × 60s TIME_WAIT", "needed: 500/s × 60s")}</Txt>
      <Meter x={20} y={84} w={560} h={18} value={30000 * fade(t, 0, 0.6)} max={32000} tone="bad" />
      <Txt x={580} y={126} k="t" anchor="end" tone="bad">30,000</Txt>
      <Txt x={20} y={156} k="s" anchor="start">{nw(narrow, "available: 49152-65535", "available")}</Txt>
      <Meter x={20} y={166} w={560} h={18} value={16000} max={32000} tone="warn" />
      <Txt x={300} y={208} k="t" anchor="end" tone="warn">~16,000</Txt>
      <Txt x={300} y={246} tone="bad" opacity={fade(t, 0.6, 1)}>{nw(narrow, "\"Cannot assign requested address\"", "\"Cannot assign address\"")}</Txt>
      <Readout narrow={narrow} l={["each closed connection holds its port through TIME_WAIT|ports held in TIME_WAIT", "fix: connection pooling · reuse connections"]} />
    </g>
  );
}

/* ---------------------------------------------------------------- 3 · HTTP evolution and push */
function Stack({ xs, t }: { xs: [string, Tone][]; t: number }) {
  return <g>{xs.map(([s, tone], i) => <Box key={s} x={20} y={56 + i * 44} w={130} h={36} label={s} tone={tone} opacity={fade(t, i * 0.1, i * 0.1 + 0.3)} />)}</g>;
}
function Http({ step, t, clock, narrow }: SceneProps) {
  const p = (ease(seg(t, 0, 1)) + clock * 0.3) % 1;
  const lane = (y: number, h = 36, tone?: Tone) => <rect className={`ax-box ${tone || ""}`} x={180} y={y} width={400} height={h} />;
  if (step === 0)
    return (
      <g>
        <Kick s="HTTP/1.1" />
        <Stack t={t} xs={[["HTTP/1.1", "lit"], ["TCP", undefined], ["IP", undefined]]} />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            {lane(60 + i * 56)}
            <Txt x={190} y={83 + i * 56} k="s" anchor="start">{`conn ${i + 1}`}</Txt>
            <Token x={300 + p * 40} y={78 + i * 56} tone="warn" />
            {[0, 1].map((k) => <Token key={k} x={420 + k * 40} y={78 + i * 56} tone="mute" />)}
          </g>
        ))}
        <Txt x={520} y={250} k="s" anchor="end">{nw(narrow, "the rest wait in line", "others wait")}</Txt>
        <Readout narrow={narrow} l={["one connection = one request at a time|one request at a time", "browsers open 6-8 connections · more handshakes, more memory"]} />
      </g>
    );
  if (step <= 2) {
    const h3 = step === 2;
    const sc: Tone[] = ["lit", "sky", "ok"];
    return (
      <g>
        <Kick s={h3 ? "HTTP/3 · QUIC over UDP" : "HTTP/2 · one connection, many streams"} tone={h3 ? "ok" : undefined} />
        <Stack t={t} xs={h3 ? [["HTTP/3", "ok"], ["QUIC", "ok"], ["UDP", undefined], ["IP", undefined]] : [["HTTP/2", "lit"], ["TCP", "warn"], ["IP", undefined]]} />
        {h3 ? (
          [0, 1, 2].map((i) => (
            <g key={i}>
              {lane(60 + i * 56, 36, sc[i])}
              <Txt x={190} y={83 + i * 56} k="s" anchor="start">{`stream ${i * 2 + 1}`}</Txt>
              {i === 1 ? <g><Token x={380} y={78 + i * 56} tone="bad" /><Txt x={396} y={83 + i * 56} k="s" anchor="start" tone="bad">lost</Txt></g> : [0, 1, 2].map((k) => <Token key={k} x={300 + ((p + k / 3) % 1) * 260} y={78 + i * 56} tone={sc[i]} />)}
            </g>
          ))
        ) : (
          <g>
            {lane(100, 60, "lit")}
            <Txt x={190} y={92} k="s" anchor="start">one TCP connection</Txt>
            {[0, 1, 2, 3, 4, 5].map((k) => <Token key={k} x={200 + ((p + k / 6) % 1) * 360} y={130} tone={sc[k % 3]} />)}
            <Txt x={380} y={196} k="s">{nw(narrow, "streams 1, 3, 5 interleaved", "streams interleaved")}</Txt>
          </g>
        )}
        <Readout narrow={narrow} tone={h3 ? "ok" : "warn"} l={h3 ? ["a lost packet only stalls its own stream|loss stalls one stream", "1-RTT setup, 0-RTT on resume · survives Wi-Fi → cellular"] : ["multiplexing · HPACK cuts headers 85-90% · binary", "but still TCP: one lost packet stalls every stream|still TCP underneath"]} />
      </g>
    );
  }
  return (
    <g>
      <Kick s="server push" />
      <Card x={20} y={52} w={270} h={200} tone="lit" title="WebSocket" o={fade(t)} lines={narrow ? ["Upgrade → 101", "both ways", "pub/sub to scale"] : ["Upgrade → 101", "both ways, persistent", "scale: Redis pub/sub"]} />
      <Card x={310} y={52} w={270} h={200} tone="sky" title="SSE" o={fade(t, 0.3, 0.8)} lines={narrow ? ["GET /events", "server → client", "auto-reconnect"] : ["GET /events", "server → client only", "auto-reconnect"]} />
      <Readout narrow={narrow} l={["WebSocket: chat, collaborative editing, gaming|WebSocket: chat, games", "SSE: news feeds, stock prices, notifications|SSE: feeds, prices"]} />
    </g>
  );
}

/* ---------------------------------------------------------------- 4 · latency */
function Latency({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.2, 0.95));
  if (step === 0) {
    const c: [string, string, string, Tone][] = [["propagation", "speed of light", "physics", "lit"], ["transmission", "size ÷ bandwidth", "size/bw", undefined], ["processing", "µs per hop", "µs/hop", undefined], ["queuing", "highly variable", "variable", "warn"]];
    return (
      <g>
        <Kick s="latency = 4 components" />
        {c.map(([a, b, s, tone], i) => <Box key={a} x={20 + i * 145} y={48} w={125} h={56} label={nw(narrow, a, ["propagate", "transmit", "process", "queuing"][i])} sub={nw(narrow, b, s)} tone={tone} opacity={fade(t, i * 0.1, i * 0.1 + 0.3)} />)}
        <Wire d="M110 172H490" tone="lit" />
        <Box x={20} y={150} w={90} h={44} label="NYC" />
        <Box x={490} y={150} w={90} h={44} label="London" />
        {p > 0 && p < 1 && <Token x={lerp(110, 490, p)} y={172} />}
        <Txt x={300} y={162} k="s">5,500 km fiber</Txt>
        <Txt x={300} y={240} tone="lit" opacity={fade(t, 0.7, 1)}>{nw(narrow, "minimum RTT ≈ 55 ms", "min RTT ≈ 55 ms")}</Txt>
        <Readout narrow={narrow} l={["light in fiber ≈ 200,000 km/s · just physics", "the only fix for distance is moving closer|move closer to users"]} />
      </g>
    );
  }
  if (step === 1)
    return (
      <g>
        <Kick s="bandwidth vs latency" />
        <Txt x={20} y={74} k="s" anchor="start">1 MB on 100 Mbps</Txt>
        <Meter x={20} y={84} w={480} h={16} value={80 * fade(t, 0, 0.6)} max={80} tone="warn" />
        <Txt x={580} y={98} anchor="end" tone="warn">80 ms</Txt>
        <Txt x={20} y={136} k="s" anchor="start">1 MB on 1 Gbps</Txt>
        <Meter x={20} y={146} w={480} h={16} value={8 * fade(t, 0.2, 0.7)} max={80} tone="ok" />
        <Txt x={580} y={160} anchor="end" tone="ok">8 ms</Txt>
        <Txt x={300} y={218} opacity={fade(t, 0.6, 1)}>{nw(narrow, "100 MB at 800 Mbps + 50 ms = 1,050 ms", "50 + 1,000 = 1,050 ms")}</Txt>
        <Readout narrow={narrow} l={["bandwidth = capacity · throughput = actual rate · latency = delay|bandwidth ≠ throughput", "bandwidth-delay product: 1 Gbps × 100 ms = 12.5 MB in flight|BDP: 12.5 MB in flight"]} />
      </g>
    );
  const s: [string, string, string, Tone][] = [["move closer", "CDN, multi-region", "CDN", "lit"], ["fewer trips", "pooling, HTTP/2-3", "pooling", "lit"], ["smaller data", "gzip, protobuf", "gzip", "sky"], ["parallelize", "async I/O", "async", "sky"], ["cache", "browser, CDN, app", "everywhere", "ok"]];
  return (
    <g>
      <Kick s="reducing latency" tone="ok" />
      {s.map(([a, b, c, tone], i) => <Box key={a} x={i < 3 ? 20 + i * 190 : 115 + (i - 3) * 190} y={i < 3 ? 56 : 140} w={180} h={64} label={a} sub={nw(narrow, b, c)} tone={tone} opacity={fade(t, i * 0.1, i * 0.1 + 0.35)} />)}
      <Readout narrow={narrow} l={["connection pooling · TLS session resumption · DNS prefetching|pooling, TLS resumption", "compress, paginate, cache at every layer|cache at every layer"]} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "transport") return <Transport {...p} />;
  if (p.variant === "http") return <Http {...p} />;
  if (p.variant === "latency") return <Latency {...p} />;
  return <Journey {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    { id: "journey", label: "One request", steps: [
      { caption: "When you say the client connects to the server, you gloss over a chain of steps: DNS, TCP, TLS, the HTTP request, load balancer routing and the response. Each can fail; each adds latency.", tween: 1200, ms: 4000 },
      { caption: "First, DNS: the resolver turns www.example.com into an IP address. A full resolution takes 50 to 200 milliseconds; from the resolver's cache, 1 to 10.", tween: 1600 },
      { caption: "Then the TCP three-way handshake: SYN, SYN-ACK, ACK. It costs one round trip before the first request, about 80 milliseconds from New York to London.", tween: 2000 },
      { caption: "Then TLS secures it. TLS 1.3 needs one round trip, TLS 1.2 two, and a resumed session none. It gives authentication, confidentiality and integrity.", tween: 2000 },
      { caption: "Only now does the HTTP request go out. The load balancer routes it to an instance, and the response comes back the same way.", tween: 1600 },
    ] },
    { id: "transport", label: "TCP & UDP", steps: [
      { caption: "TCP is reliable and ordered, using acknowledgments, retransmissions and sequence numbers, with flow control and congestion control built in. But it is a byte stream: the app frames messages.", tween: 1600, ms: 3800 },
      { caption: "Ordered delivery has a cost: if packet 2 is lost, packets 3, 4 and 5 wait for its retransmission. Over HTTP/2 that one loss blocks every stream.", tween: 1600 },
      { caption: "UDP has no handshake and an 8-byte header, and lost packets are not resent. For a voice call that's right: late data is useless, so skip it rather than wait.", tween: 1800 },
      { caption: "Ports run out too. At 500 new connections a second, each held 60 seconds in TIME_WAIT, you need 30,000 ports but only about 16,000 exist. Connection pooling fixes it.", tween: 1400, ms: 3800 },
    ] },
    { id: "http", label: "HTTP 1 → 3", steps: [
      { caption: "HTTP/1.1 sends one request at a time per connection, so the rest wait behind a slow one. Browsers open 6 to 8 connections, paying for more handshakes and memory.", tween: 1400, loop: true },
      { caption: "HTTP/2 multiplexes many streams over one TCP connection, with binary framing and HPACK header compression. But it is still TCP, so one lost packet stalls all streams.", tween: 1400, loop: true },
      { caption: "HTTP/3 runs on QUIC over UDP. A lost packet only affects its own stream, setup takes one round trip or zero on resume, and connections survive a switch from Wi-Fi to cellular.", tween: 1400, ms: 3800, loop: true },
      { caption: "For server push: WebSocket upgrades an HTTP connection into a persistent two-way channel, scaled with Redis pub/sub. SSE is simpler when only the server needs to push.", tween: 1200 },
    ] },
    { id: "latency", label: "Latency", steps: [
      { caption: "Latency is propagation plus transmission plus processing plus queuing. Light in fiber covers New York to London, 5,500 km, in no less than about 55 milliseconds round trip.", tween: 1600 },
      { caption: "Transmission depends on bandwidth: 1 MB takes 80 milliseconds on 100 Mbps but 8 on 1 Gbps. Bandwidth is capacity; throughput is what you actually get.", tween: 1400 },
      { caption: "To reduce latency: move closer with a CDN, cut round trips with pooling and HTTP/2 or 3, send less data, parallelize, and cache aggressively at every layer.", tween: 1200, ms: 3600 },
    ] },
  ],
  Scene,
});
