/**
 * The whole case file "iOS Bridge: iOS simulators on any OS": the simulator only runs on a Mac, so
 * an (illustrative) team of eight queues for one MacBook; the idea of a "scrcpy for iOS" on top of
 * Meta's idb; the ~100 ms-per-frame screenshot prototype and the WebRTC engine that keeps only the
 * newest frame (45 to 90 FPS presets); Electron clients, scaled taps, session recovery and the CLI;
 * then what it doesn't replace, where it is today, and the lesson.
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

function Why({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["the constraint", "the constraint"]} c={["macOS + Xcode only", "Mac only"]} tone="warn" narrow={narrow} />
        <Box x={220} y={60} w={160} h={80} label="MacBook" sub={narrow ? "the only one" : "the one shared Mac"} tone="lit" />
        {Array.from({ length: 7 }, (_, i) => (
          <g key={i} opacity={fade(t, i, 0.08)}>
            <rect className="ax-box sky" x={36 + i * 78} y={190} width={60} height={40} />
            <Txt x={66 + i * 78} y={215} k="s" tone="sky">
              {i % 2 ? "Linux" : "Win"}
            </Txt>
          </g>
        ))}
        <Wire d="M66 190V166H300V140" arrow dash />
        <Txt x={300} y={258} k="s" opacity={fade(t, 4)}>
          {narrow ? "an illustrative team of 8" : "an illustrative React Native team of eight"}
        </Txt>
        <Chips items={[["a queue for iOS", "a queue"], ["CI as a simulator", "CI as simulator"], ["Mac in the office", "Mac in office"]]} t={seg(t, 0.5, 1)} tone="warn" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["if Android can do it…", "the gap"]} narrow={narrow} />
        <Box x={16} y={60} w={270} h={80} label="Android" sub={narrow ? "ADB + scrcpy" : "ADB control + scrcpy viewer"} tone="ok" />
        <Box x={314} y={60} w={270} h={80} label="iOS" sub={narrow ? "idb + ???" : "Meta's idb + ??? (no viewer)"} tone="warn" />
        <Txt x={300} y={184} k="t" tone="lit" opacity={fade(t, 2)}>
          {narrow ? "build a scrcpy for iOS" : "build the missing “scrcpy for iOS”"}
        </Txt>
        <Chips items={[["idb: touch, apps, video", "idb: touch, apps"], ["MIT, open source", "open source"]]} t={seg(t, 0.4, 1)} narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["the vision", "the vision"]} c={["one Mac, any OS", "one Mac"]} tone="ok" narrow={narrow} />
      <Box x={16} y={70} w={180} h={110} label={narrow ? "Mac" : "Mac server"} sub={narrow ? "simulators" : "hosts simulators"} tone="lit" />
      {["Windows", "Linux", "macOS", "Browser"].map((c, i) => (
        <g key={c} opacity={fade(t, i, 0.12)}>
          <Wire d={`M196 125H240V${70 + i * 44}H404`} arrow tone="ok" />
          <Box x={404} y={52 + i * 44} w={180} h={36} label={c} tone="sky" />
        </g>
      ))}
      <Chips items={[["touch and gestures", "touch"], ["app installs", "installs"], ["recording", "recording"]]} t={seg(t, 0.4, 1)} tone="ok" narrow={narrow} />
    </g>
  );
}

function Stream({ step, t, clock, narrow }: SceneProps) {
  if (step === 0) {
    const parts: [string, number][] = [
      ["subprocess", 50],
      ["PNG", 30],
      ["base64", 20],
    ];
    let x = 16;
    return (
      <g>
        <Head k={["the prototype · screenshots", "screenshots"]} c={["~100 ms a frame", "~100 ms"]} tone="bad" narrow={narrow} />
        <Txt x={16} y={68} k="s" anchor="start">
          {narrow ? "simctl screenshot → WebSocket" : "simctl screenshot → PNG → base64 → WebSocket"}
        </Txt>
        {parts.map(([l, ms], i) => {
          const w = (568 * ms) / 100;
          const el = (
            <g key={l} opacity={fade(t, i, 0.18)}>
              <rect className={`ax-box ${i === 0 ? "bad" : "warn"}`} x={x} y={84} width={w - 4} height={56} />
              <Txt x={x + (w - 4) / 2} y={108} k="t">
                {narrow && i === 0 ? "proc" : l}
              </Txt>
              <Txt x={x + (w - 4) / 2} y={128} k="s">
                ~{ms} ms
              </Txt>
            </g>
          );
          x += w;
          return el;
        })}
        <Figs items={[["10 FPS", narrow ? "at best" : "at best, in theory", "bad"], ["a few", narrow ? "FPS in practice" : "FPS in practice, laggy"]]} y={232} t={seg(t, 0.4, 1)} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    const q = clock > 0 ? (clock * 1.2) % 1 : 0;
    return (
      <g>
        <Head k={["the WebRTC engine", "WebRTC"]} c={["newest frame wins", "newest wins"]} tone="ok" narrow={narrow} />
        <Box x={16} y={80} w={140} h={70} label="Capture" sub="frames" tone="sky" />
        <Wire d="M156 115H210" arrow />
        <rect className="ax-box lit" x={210} y={80} width={150} height={70} />
        <Txt x={285} y={106} k="t">
          {narrow ? "Queue = 1" : "Queue · size 1"}
        </Txt>
        <Txt x={285} y={132} k="s" tone="bad">
          {narrow ? "drop old" : "old frame dropped"}
        </Txt>
        <Wire d="M360 115H414" arrow tone="ok" />
        <Box x={414} y={80} w={170} h={70} label="WebRTC" sub={narrow ? "to viewer" : "to the viewer"} tone="ok" />
        {clock > 0 && <Token x={lerp(156, 414, q)} y={115} tone={q < 0.45 ? "mute" : "ok"} />}
        {[45, 60, 75, 90].map((f, i) => (
          <g key={f} opacity={fade(t, i, 0.12)}>
            <Box x={16 + i * 146} y={190} w={130} h={44} label={`${f} FPS`} tone={i === 3 ? "lit" : undefined} />
          </g>
        ))}
        <Chips items={[["real rate depends on Mac and network", "depends on network"]]} t={seg(t, 0.5, 1)} narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["control goes back", "control"]} c={["scaled taps", "scaled taps"]} narrow={narrow} />
      <Box x={16} y={70} w={200} h={110} label={narrow ? "Viewer" : "Desktop viewer"} sub="click at (x, y)" tone="sky" />
      <Wire d="M216 125H380" arrow tone="lit" />
      <Txt x={298} y={112} k="s" tone="lit">
        {narrow ? "control WS" : "control WebSocket"}
      </Txt>
      <Txt x={298} y={150} k="s">
        {narrow ? "× scale" : "× stream / canvas"}
      </Txt>
      <Box x={380} y={70} w={204} h={110} label="Simulator" sub={narrow ? "tap" : "tap, right spot"} tone="ok" />
      <Chips items={[["screen sizes", "sizes"], ["DPI scaling", "DPI"], ["orientation", "orientation"]]} t={t} narrow={narrow} />
    </g>
  );
}

function Build({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["clients everywhere", "clients"]} narrow={narrow} />
        {[
          ["Electron", "Win · Linux · Mac", "3 OSes"],
          ["Browser", "no install", "no install"],
          ["CLI", "on PyPI", "on PyPI"],
        ].map(([l, s, n], i) => (
          <g key={l} opacity={fade(t, i, 0.16)}>
            <Box x={16 + i * 196} y={70} w={176} h={90} label={l} sub={narrow ? n : s} tone={i === 0 ? "sky" : i === 1 ? "ok" : "lit"} />
          </g>
        ))}
        <Chips items={[["platform-specific build configs", "per-platform builds"]]} t={seg(t, 0.5, 1)} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["surviving restarts", "restarts"]} c="sessions.json" tone="ok" narrow={narrow} />
        <Box x={16} y={60} w={170} h={70} label={narrow ? "Restart" : "Server restart"} tone="warn" />
        <Wire d="M186 95H220" arrow />
        <Box x={220} y={60} w={180} h={70} label={narrow ? "Compare" : "Compare udids"} sub={narrow ? "vs stored" : "stored vs running"} />
        <Wire d="M400 95H434" arrow tone="ok" />
        <Box x={434} y={60} w={150} h={70} label="Recovered" sub={narrow ? "orphans" : "orphaned sims"} tone="ok" />
        <Txt x={300} y={180} k="s" opacity={fade(t, 2)}>
          {narrow ? "resume where you left off" : "developers resume exactly where they left off"}
        </Txt>
        <Chips items={[["ios-bridge stream: finds the session", "auto-detects session"]]} t={seg(t, 0.4, 1)} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["a CLI that guesses right", "the CLI"]} tone="ok" narrow={narrow} />
      <rect className="ax-box lit" x={16} y={56} width={568} height={130} />
      {[
        ["$ ios-bridge stream", "finds the single session"],
        ["$ ios-bridge list", "shows all sessions, full IDs"],
        ["$ ios-bridge terminate", "smart session detection"],
      ].map(([c, d], i) => (
        <g key={c} opacity={fade(t, i, 0.16)}>
          <Txt x={36} y={92 + i * 36} k="t" anchor="start">
            {c}
          </Txt>
          {!narrow && (
            <Txt x={570} y={92 + i * 36} k="s" anchor="end">
              {d}
            </Txt>
          )}
        </g>
      ))}
      <Chips items={[["no more pasting long session IDs", "no long IDs"]]} t={seg(t, 0.4, 1)} tone="ok" narrow={narrow} />
    </g>
  );
}

function Now({ step, t, narrow }: SceneProps) {
  if (step === 0) {
  return (
    <g>
      <Head k={["what it doesn't replace", "limits"]} tone="warn" narrow={narrow} />
      {[
        ["builds and signing", "still need macOS", "need macOS"],
        ["one Mac", "RAM and CPU cap the sessions", "has limits"],
        ["simulators", "aren't devices: camera, Bluetooth", "aren't devices"],
        ["the network", "far away means more lag", "distance = lag"],
      ].map(([k, v, n], i) => (
        <g key={k} opacity={fade(t, i, 0.14)}>
          <rect className="ax-box warn" x={16} y={50 + i * 54} width={568} height={44} />
          <Txt x={30} y={77 + i * 54} k="k" anchor="start" tone="warn">
            {k}
          </Txt>
          <Txt x={570} y={77 + i * 54} k="s" anchor="end">
            {narrow ? n : v}
          </Txt>
        </g>
      ))}
    </g>
  );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["where it is today", "today"]} c="MIT · open source" narrow={narrow} />
        {[
          ["CLI", "ios-bridge-cli 1.0.10", "1.0.10", "lit"],
          ["Clients", "Electron + web", "app + web", "sky"],
          ["Streams", "WebSocket and WebRTC", "WS + WebRTC", "ok"],
        ].map(([l, s, n, tone], i) => (
          <g key={l} opacity={fade(t, i, 0.16)}>
            <Box x={16 + i * 196} y={70} w={176} h={80} label={l} sub={narrow ? n : s} tone={tone as Tone} />
          </g>
        ))}
        <Txt x={300} y={196} k="s" opacity={fade(t, 3)}>
          {narrow ? "next: H.264, scale, testing" : "ideas, no dates: H.264 from idb, more simulators, Appium and XCTest"}
        </Txt>
      </g>
    );
  }
  return (
    <g>
      <Head k="the lesson" tone="ok" narrow={narrow} />
      <Txt x={300} y={100} k="t">
        {narrow ? "the hard part isn't the API:" : "the hard part of remote tooling isn't the API:"}
      </Txt>
      <Txt x={300} y={140} k="t" tone="lit" opacity={fade(t, 1)}>
        {narrow ? "screenshots that feel real" : "it's making screenshots feel like a device"}
      </Txt>
      <Chips items={[["drop stale frames", "drop stale"], ["map the clicks", "map clicks"], ["survive restarts", "survive restarts"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "stream") return <Stream {...p} />;
  if (p.variant === "build") return <Build {...p} />;
  if (p.variant === "now") return <Now {...p} />;
  return <Why {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "why",
      label: "The problem",
      steps: [
        { caption: "The iOS Simulator only runs on a Mac with Xcode. Picture an illustrative team of eight, mostly on Windows and Linux, queueing for one MacBook.", tween: 1600 },
        { caption: "Android had ADB for control and scrcpy for viewing. iOS had Meta's idb but no interactive viewer, so the idea was a scrcpy for iOS.", tween: 1400 },
        { caption: "The vision: one Mac hosts the simulators, and anyone on Windows, Linux, macOS or a browser uses them with touch, app installs and recording.", tween: 1400 },
      ],
    },
    {
      id: "stream",
      label: "Streaming",
      steps: [
        { caption: "The first version sent screenshots over a WebSocket: ~50 ms subprocess, ~30 ms PNG, ~20 ms base64. 10 FPS at best, and choppy in practice.", tween: 1600 },
        { caption: "The WebRTC engine keeps a one-frame queue: a new frame replaces the old one, so the viewer always gets the newest. Presets aim for 45 to 90 FPS.", tween: 1400, loop: true },
        { caption: "Clicks go back over a control WebSocket, scaled from the viewer's canvas to the simulator's screen, so a tap lands in the right place.", tween: 1200 },
      ],
    },
    {
      id: "build",
      label: "Making it real",
      steps: [
        { caption: "Clients run everywhere: an Electron app for Windows, Linux and macOS, a browser interface with nothing to install, and a CLI.", tween: 1400 },
        { caption: "After a server restart, iOS Bridge compares running simulators with its stored sessions and recovers the orphans, so work isn't lost.", tween: 1400 },
        { caption: "The CLI guesses right: ios-bridge stream finds the single running session, so nobody pastes long session IDs.", tween: 1200 },
      ],
    },
    {
      id: "now",
      label: "Today",
      steps: [
        { caption: "It doesn't replace a Mac: builds and signing still need macOS, one Mac has limits, simulators aren't devices, and distance adds lag.", tween: 1400 },
        { caption: "Today it's open source under MIT: ios-bridge-cli 1.0.10 on PyPI, an Electron app and a browser view, streaming over WebSocket or WebRTC.", tween: 1400 },
        { caption: "The lesson: the hard part isn't the API, it's making screenshots feel like a device. Drop stale frames, map clicks, survive restarts.", tween: 1200 },
      ],
    },
  ],
  Scene,
});
