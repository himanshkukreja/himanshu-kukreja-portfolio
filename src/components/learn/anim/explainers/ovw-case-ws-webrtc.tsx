/**
 * The whole case file "WebSockets vs WebRTC for video": ConnectNow's 3 AM demo, with video over
 * WebSockets at 240p, 2 to 5 s behind and 95% CPU at 50 calls; what WebSockets are good at (TCP,
 * text, a server in the middle); WebRTC's signaling, peer-to-peer UDP, STUN and TURN, and SFU/MCU
 * for groups; then the hybrid, its results and how to choose.
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

/** User A, a server in the middle, User B */
function Trio({ narrow, srv, mid, a, b, direct, relay }: { narrow: boolean; srv?: Tone; mid?: [string, string]; a?: Tone; b?: Tone; direct?: Tone; relay?: boolean }) {
  return (
    <g>
      <Box x={16} y={150} w={130} h={64} label="User A" tone={a || "sky"} />
      <Box x={454} y={150} w={130} h={64} label="User B" tone={b || "sky"} />
      <Box x={220} y={50} w={160} h={64} label={mid ? pk(mid, narrow) : "Server"} tone={srv} />
      {relay !== false && <Wire d="M81 150V82H220" arrow tone={srv === "bad" ? "bad" : undefined} />}
      {relay !== false && <Wire d="M380 82H519V150" arrow tone={srv === "bad" ? "bad" : undefined} />}
      {direct && <Wire d="M146 182H454" arrow tone={direct === "ok" ? "ok" : direct === "lit" ? "lit" : undefined} />}
    </g>
  );
}
const through = (t: number, tone?: Tone) => {
  const q = seg(t, 0.05, 0.95);
  if (q <= 0 || q >= 1) return null;
  const p = q * 2;
  const pts: [number, number][] = [[81, 150], [81, 82], [220, 82], [380, 82], [519, 82], [519, 150]];
  const k = Math.min(4.999, p * 2.5);
  const i = Math.floor(k);
  const f = k - i;
  return <Token x={lerp(pts[i][0], pts[i + 1][0], f)} y={lerp(pts[i][1], pts[i + 1][1], f)} tone={tone} s={9} />;
};

function Demo({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["ConnectNow · 3 AM", "3 AM"]} c={["the investor demo", "demo prep"]} tone="bad" narrow={narrow} />
        <Figs items={[["240p", narrow ? "pixelated" : "and pixelated", "bad"], ["2–5 s", narrow ? "delay" : "of delay", "bad"], ["95%", narrow ? "CPU, 50 calls" : "CPU at 50 calls", "bad"]]} y={120} t={t} narrow={narrow} />
        <Chips items={[["text chat: flawless", "chat: fine"], ["video: unwatchable", "video: broken"]]} y={210} t={seg(t, 0.4, 1)} tone="warn" narrow={narrow} />
      </g>
    );
  }
  if (step === 2) {
    return (
      <g>
        <Head k={["the showdown", "showdown"]} narrow={narrow} />
        <rect className="ax-box bad" x={16} y={50} width={270} height={170} />
        <Txt x={151} y={76} k="k" tone="bad">
          {narrow ? "client-server" : "client-server"}
        </Txt>
        <Box x={36} y={160} w={70} h={40} label="A" tone="sky" />
        <Box x={196} y={160} w={70} h={40} label="B" tone="sky" />
        <Box x={106} y={92} w={90} h={40} label="Srv" tone="bad" />
        <Wire d="M71 160V112H106" arrow tone="bad" />
        <Wire d="M196 112H231V160" arrow tone="bad" />
        <rect className="ax-box ok" x={314} y={50} width={270} height={170} />
        <Txt x={449} y={76} k="k" tone="ok">
          {narrow ? "peer to peer" : "peer to peer"}
        </Txt>
        <Box x={334} y={160} w={70} h={40} label="A" tone="sky" />
        <Box x={494} y={160} w={70} h={40} label="B" tone="sky" />
        <Box x={404} y={92} w={90} h={40} label="Sig" tone="sky" dim />
        <Wire d="M404 180H494" arrow tone="ok" />
        <Chips items={[["all media via the server", "via server"], ["media goes direct", "direct"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["video over WebSockets", "via WebSockets"]} c={["every frame via server", "all via server"]} tone="bad" narrow={narrow} />
      <Trio narrow={narrow} srv="bad" mid={["Server · CPU", "Server"]} />
      {through(t, "bad")}
      <Txt x={300} y={140} k="s" tone="bad">
        {narrow ? "decode, forward" : "processes and forwards every frame"}
      </Txt>
      <Chips items={[["all bandwidth paid by you", "you pay bandwidth"], ["each user multiplies load", "load multiplies"]]} t={seg(t, 0.3, 1)} tone="bad" narrow={narrow} />
    </g>
  );
}

function Ws({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["WebSockets", "WebSockets"]} c={["over TCP", "TCP"]} tone="sky" narrow={narrow} />
        <Box x={16} y={70} w={150} h={64} label="Browser" tone="sky" />
        <Box x={434} y={70} w={150} h={64} label="Server" tone="sky" />
        <Wire d="M166 92H434" arrow />
        <Txt x={300} y={84} k="s">
          {narrow ? "HTTP upgrade" : "HTTP request: Upgrade"}
        </Txt>
        <g opacity={fade(t, 2)}>
          <Wire d="M166 116H434" tone="ok" />
          <Txt x={300} y={150} k="s" tone="ok">
            {narrow ? "an open line, both ways" : "then one open line, both sides talk anytime"}
          </Txt>
        </g>
        <Chips items={[["every message arrives", "delivered"], ["in order", "in order"], ["low overhead", "light"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["where WebSockets shine", "text, live"]} tone="ok" narrow={narrow} />
        <Box x={16} y={56} w={270} h={80} label="Slack" sub={narrow ? "~500 ms worldwide" : "messages worldwide in ~500 ms"} tone="ok" />
        <Box x={314} y={56} w={270} h={80} label="Discord" sub={narrow ? "chat, presence" : "text chat and presence"} tone="ok" />
        <Txt x={300} y={186} k="s" opacity={fade(t, 2)}>
          {narrow ? "chat · editing · live prices" : "chat · collaborative editing · live scores and prices"}
        </Txt>
        <Chips items={[["server sees everything", "server in charge"], ["auth, logging, moderation", "auth + moderation"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["but not for video", "not for video"]} tone="bad" narrow={narrow} />
      {[
        ["server CPU", "processes every frame", "every frame"],
        ["bandwidth", "all video flows through you", "all through you"],
        ["memory", "buffers streams for each user", "buffers"],
        ["scaling", "each user multiplies the load", "load multiplies"],
      ].map(([k, v, n], i) => (
        <g key={k} opacity={fade(t, i, 0.14)}>
          <rect className="ax-box bad" x={16} y={50 + i * 54} width={568} height={44} />
          <Txt x={30} y={77 + i * 54} k="k" anchor="start" tone="bad">
            {k}
          </Txt>
          <Txt x={570} y={77 + i * 54} k="s" anchor="end">
            {narrow ? n : v}
          </Txt>
        </g>
      ))}
      <Chips items={[["200–500 ms+, seconds under loss", "seconds under loss"]]} t={seg(t, 0.5, 1)} tone="bad" narrow={narrow} />
    </g>
  );
}

function Rtc({ step, t, clock, narrow }: SceneProps) {
  if (step === 0) {
    const q = clock > 0 ? (clock * 0.7) % 1 : 0;
    return (
      <g>
        <Head k={["WebRTC · peer to peer", "WebRTC"]} c="UDP" tone="ok" narrow={narrow} />
        <Trio narrow={narrow} srv="sky" mid={["Signaling", "Signal"]} direct={t > 0.5 ? "ok" : undefined} />
        {t <= 0.5 && through(t * 2, "sky")}
        {clock > 0 && <Token x={lerp(146, 454, q)} y={182} tone="ok" />}
        <Txt x={300} y={140} k="s" tone="sky">
          {narrow ? "offer / answer" : "SDP offer and answer"}
        </Txt>
        <Txt x={300} y={206} k="s" tone="ok" opacity={t > 0.5 ? 1 : 0}>
          {narrow ? "media direct" : "media goes direct"}
        </Txt>
        <Chips items={[["~100–300 ms", "~100–300 ms"], ["built-in codecs", "codecs"], ["adaptive bitrate", "adaptive"]]} t={seg(t, 0.4, 1)} tone="ok" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["getting through NAT", "NAT"]} c={["STUN and TURN", "STUN · TURN"]} tone="warn" narrow={narrow} />
        <Box x={16} y={60} w={270} h={80} label="STUN" sub={narrow ? "find public IP" : "finds your public address"} tone="ok" />
        <Box x={314} y={60} w={270} h={80} label="TURN" sub={narrow ? "relay fallback" : "relays when direct fails"} tone="warn" />
        <Txt x={151} y={176} k="s" tone="ok" opacity={fade(t, 2)}>
          {narrow ? "cheap, usually works" : "cheap · direct when possible"}
        </Txt>
        <Txt x={449} y={176} k="s" tone="warn" opacity={fade(t, 2)}>
          {narrow ? "~10–20% of calls" : "~10–20% of connections"}
        </Txt>
        <Chips items={[["signaling server needed", "needs signaling"], ["more moving parts", "more complex"]]} t={seg(t, 0.4, 1)} tone="warn" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["groups: mesh, SFU, MCU", "group calls"]} narrow={narrow} />
      {[
        ["Mesh", "all to all", "all to all", "bad"],
        ["SFU", "upload once, 50+", "upload once", "ok"],
        ["MCU", "mixes, high CPU", "mixes, CPU", "warn"],
      ].map(([k, v, n, tone], i) => (
        <g key={k} opacity={fade(t, i, 0.16)}>
          <Box x={16 + i * 196} y={60} w={176} h={120} label={k} sub={narrow ? n : v} tone={tone as Tone} />
        </g>
      ))}
      <Chips items={[["Google Meet routes groups via SFUs", "Meet uses SFUs"]]} t={seg(t, 0.5, 1)} narrow={narrow} />
    </g>
  );
}

function Hybrid({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["the hybrid", "hybrid"]} c={["best of both", "both"]} tone="ok" narrow={narrow} />
        <Trio narrow={narrow} srv="sky" mid={["WebSocket srv", "WS server"]} direct="ok" />
        <Txt x={300} y={140} k="s" tone="sky">
          {narrow ? "chat · signaling" : "chat · presence · signaling"}
        </Txt>
        <Txt x={300} y={206} k="s" tone="ok">
          {narrow ? "WebRTC media" : "WebRTC: video and audio"}
        </Txt>
        <Chips items={[["WebSockets for text", "WS: text"], ["WebRTC for media", "RTC: media"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    const rows: [string, string, string][] = [
      ["latency", "2–5 s", "< 100 ms"],
      ["server CPU", "95% · 50 users", "15% · 500 users"],
      ["bandwidth", "$0.50/user-h", "$0.05/user-h"],
      ["quality", "240p", "1080p adaptive"],
    ];
    return (
      <g>
        <Head k={["before → after", "before → after"]} tone="ok" narrow={narrow} />
        {rows.map(([k, a, b], i) => (
          <g key={k} opacity={fade(t, i, 0.14)}>
            <rect className="ax-box" x={16} y={50 + i * 54} width={568} height={44} />
            <Txt x={30} y={77 + i * 54} k="k" anchor="start" tone="mute">
              {k}
            </Txt>
            <Txt x={330} y={77 + i * 54} k="s" tone="bad">
              {narrow ? a.replace(" · ", "·").replace(" users", "") : a}
            </Txt>
            <Txt x={570} y={77 + i * 54} k="s" anchor="end" tone="ok">
              {narrow ? b.replace(" · ", "·").replace(" users", "") : b}
            </Txt>
          </g>
        ))}
        <Chips items={[["Series A funded", "Series A"]]} t={seg(t, 0.5, 1)} tone="ok" narrow={narrow} />
      </g>
    );
  }
  if (step === 2) {
    return (
      <g>
        <Head k={["choose by the payload", "choose"]} narrow={narrow} />
        <Box x={16} y={56} w={270} h={150} label="" tone="sky" />
        <Txt x={151} y={88} k="t" tone="sky">
          WebSockets
        </Txt>
        {(narrow ? ["chat", "editing", "live prices"] : ["chat apps", "collaborative editing", "live scores, prices"]).map((l, i) => (
          <Txt key={l} x={151} y={122 + i * 26} k="s">
            {l}
          </Txt>
        ))}
        <Box x={314} y={56} w={270} h={150} label="" tone="ok" />
        <Txt x={449} y={88} k="t" tone="ok">
          WebRTC
        </Txt>
        {(narrow ? ["video calls", "screen share", "voice"] : ["video conferencing", "screen sharing", "voice chat"]).map((l, i) => (
          <Txt key={l} x={449} y={122 + i * 26} k="s">
            {l}
          </Txt>
        ))}
        <Chips items={[["Discord uses both", "Discord: both"]]} t={seg(t, 0.4, 1)} narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k="the lesson" tone="ok" narrow={narrow} />
      <Box x={16} y={60} w={270} h={80} label="Text" sub={narrow ? "every msg, in order" : "every message, in order"} tone="sky" />
      <Box x={314} y={60} w={270} h={80} label="Video" sub={narrow ? "speed first" : "speed over guarantees"} tone="ok" />
      <Txt x={151} y={176} k="t" tone="sky" opacity={fade(t, 1)}>
        {narrow ? "TCP · WS" : "TCP · WebSockets"}
      </Txt>
      <Txt x={449} y={176} k="t" tone="ok" opacity={fade(t, 2)}>
        {narrow ? "UDP · RTC" : "UDP · WebRTC"}
      </Txt>
      <Chips items={[["pick the transport that matches the data", "match the data"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "ws") return <Ws {...p} />;
  if (p.variant === "rtc") return <Rtc {...p} />;
  if (p.variant === "hybrid") return <Hybrid {...p} />;
  return <Demo {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "demo",
      label: "The demo",
      steps: [
        { caption: "3 AM before ConnectNow's investor demo: chat is flawless, but video over WebSockets is 240p, 2 to 5 seconds behind, with CPU at 95% on 50 calls.", tween: 1400, ms: 3400 },
        { caption: "The reason: every video frame travels through the server, which processes and forwards it, and pays for all that bandwidth.", tween: 2200 },
        { caption: "The real choice is client-server, where all media goes through you, or peer to peer, where a server only introduces the two users.", tween: 1200 },
      ],
    },
    {
      id: "ws",
      label: "WebSockets",
      steps: [
        { caption: "A WebSocket upgrades one HTTP request into a permanent, two-way line over TCP. Every message arrives, in order.", tween: 1400 },
        { caption: "That suits text: Slack delivers messages worldwide in about 500 ms, and a server in the middle can handle auth, logging and moderation.", tween: 1400 },
        { caption: "For video it hurts: the server touches every frame and carries all the bandwidth, and latency runs 200 to 500 ms+, seconds under packet loss.", tween: 1400, ms: 3400 },
      ],
    },
    {
      id: "rtc",
      label: "WebRTC",
      steps: [
        { caption: "WebRTC uses a signaling server only to swap an offer and answer. Then media flows peer to peer over UDP, about 100 to 300 ms end to end.", tween: 2000, loop: true },
        { caption: "Most devices sit behind NAT. STUN finds a public address for a direct path; when that fails, about 10 to 20% of the time, TURN relays.", tween: 1400 },
        { caption: "Direct connections don't scale to big groups. An SFU takes one upload and forwards it to many; an MCU mixes one stream at a high CPU cost.", tween: 1400 },
      ],
    },
    {
      id: "hybrid",
      label: "The hybrid",
      steps: [
        { caption: "ConnectNow's fix uses both: WebSockets for chat, presence and signaling, WebRTC for video and audio.", tween: 1200 },
        { caption: "Video latency fell from 2 to 5 seconds to under 100 ms, CPU from 95% at 50 users to 15% at 500, and bandwidth cost by ten times.", tween: 1600, ms: 3400 },
        { caption: "Choose by the payload: WebSockets for chat, editing and live prices, WebRTC for calls, screen sharing and voice. Discord uses both.", tween: 1400 },
        { caption: "The lesson: text needs every message, in order; video needs speed over guaranteed delivery. Pick the transport that matches your data.", tween: 1400 },
      ],
    },
  ],
  Scene,
});
