/**
 * The whole case file "BridgeLink: remote Android testing": the (illustrative) Bangalore team whose
 * test phones sit on a shelf while developers work elsewhere; the idea that adb already works over
 * a network; the bore tunnel (adb tcpip, adb forward, bore local, adb connect) and its security
 * caveat; the tunnel manager, WiFi mode, one-second health and connection monitors, the platform
 * path; then where device farms still win, where it stands today, and the lesson.
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

const HOP: [string, string, string, Tone?][] = [
  ["Developer", "Dev", "anywhere", "sky"],
  ["bore.pub", "bore", ":15750", "lit"],
  ["Host :5000", "Host", "adb forward"],
  ["Phone", "Phone", ":5555", "ok"],
];
const HX = (i: number) => 16 + i * 148;
function Path({ t, narrow, tones, subs, flow = true }: { t: number; narrow: boolean; tones?: Tone[]; subs?: (string | undefined)[]; flow?: boolean }) {
  const q = flow ? ease(seg(t, 0.1, 0.9)) : 0;
  return (
    <g>
      {HOP.map(([l, n, s, tone], i) => (
        <g key={l}>
          {i > 0 && <Wire d={`M${HX(i) - 18} 100H${HX(i)}`} arrow tone="lit" />}
          <Box x={HX(i)} y={70} w={130} h={60} label={narrow ? n : l} sub={subs?.[i] ?? s} tone={tones?.[i] ?? tone} />
        </g>
      ))}
      {q > 0 && q < 1 && <Token x={lerp(146, HX(3), q)} y={100} />}
    </g>
  );
}

function Problem({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["an illustrative team · Bangalore", "Bangalore"]} c={["not a customer", "illustration"]} narrow={narrow} />
        <Box x={16} y={60} w={220} h={140} label="" tone="lit" />
        <Txt x={126} y={86} k="t">
          Koramangala
        </Txt>
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} className="ax-box ok" x={36 + (i % 4) * 48} y={104 + Math.floor(i / 4) * 44} width={36} height={36} />
        ))}
        {["HSR Layout", "Whitefield", "Indiranagar"].map((p, i) => (
          <g key={p} opacity={fade(t, i, 0.15)}>
            <Box x={400} y={56 + i * 52} w={184} h={42} label={narrow ? p.split(" ")[0] : p} tone="sky" />
            <Wire d={`M236 130H320V${77 + i * 52}H400`} dash />
          </g>
        ))}
        <Chips items={[["a Redmi-only crash", "Redmi-only bug"], ["10 minutes to fix", "10 min to fix"], ["an afternoon to verify", "a day to check"]]} t={seg(t, 0.4, 1)} tone="warn" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["the options today", "the options"]} tone="warn" narrow={narrow} />
        {[
          ["go to the office", "for every device-specific bug", "every bug"],
          ["courier phones", "and lose days to shipping", "days lost"],
          ["rent a device farm", "while your own phones sit idle", "own phones idle"],
        ].map(([k, v, n], i) => (
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
        <Chips items={[["use the phones you already own, from anywhere", "use your own phones"]]} t={seg(t, 0.5, 1)} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["the question", "the question"]} narrow={narrow} />
      <Box x={16} y={60} w={270} h={70} label={narrow ? "On the LAN" : "On the local network"} sub={narrow ? "adb works" : "adb connect works"} tone="ok" />
      <Box x={314} y={60} w={270} h={70} label={narrow ? "Over internet" : "Over the internet"} sub="why not?" tone="lit" />
      <Txt x={300} y={182} k="t" opacity={fade(t, 2)}>
        {narrow ? "adb connect 192.168.1.10:5555" : "adb connect 192.168.1.10:5555"}
      </Txt>
      <Chips items={[["ADB: full device control", "ADB controls it"], ["bore: a TCP tunnel", "bore tunnels it"]]} t={seg(t, 0.4, 1)} narrow={narrow} />
    </g>
  );
}

function Tunnel({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["the bore tunnel", "the tunnel"]} c="device 1d752b81" narrow={narrow} />
        <Path t={t} narrow={narrow} />
        {[
          ["1 · adb tcpip 5555", "tcpip 5555"],
          ["2 · adb forward tcp:5000 tcp:5555", "forward 5000"],
          ["3 · bore local 5000 --to bore.pub", "bore local 5000"],
          ["4 · adb connect bore.pub:15750", "connect :15750"],
        ].map(([w, n], i) => (
          <g key={w} opacity={fade(t, i, 0.12)}>
            <Txt x={narrow ? 16 + (i % 2) * 290 : 16} y={narrow ? 166 + Math.floor(i / 2) * 30 : 160 + i * 26} k="s" anchor="start" tone={i === 3 ? "lit" : undefined}>
              {narrow ? n : w}
            </Txt>
          </g>
        ))}
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["weekend 1 · the prototype", "prototype"]} c={["it worked", "it worked"]} tone="ok" narrow={narrow} />
        <rect className="ax-box ok" x={16} y={60} width={568} height={70} />
        <Txt x={36} y={90} k="t" anchor="start">
          {narrow ? "$ adb connect bore…" : "$ adb connect bore.pub:15750"}
        </Txt>
        <Txt x={36} y={116} k="s" anchor="start" tone="ok">
          connected
        </Txt>
        <Txt x={300} y={176} k="s" opacity={fade(t, 2)}>
          {narrow ? "a phone in another room" : "to a phone that wasn't plugged into this machine"}
        </Txt>
        <Chips items={[["manual", "manual"], ["fragile", "fragile"], ["but real", "but real"]]} t={seg(t, 0.4, 1)} tone="warn" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["a security caveat", "security"]} tone="warn" narrow={narrow} />
      <Path t={1} narrow={narrow} flow={false} tones={["sky", "warn", undefined, "ok"]} subs={[undefined, narrow ? "plaintext" : "not encrypted", undefined, narrow ? "RSA key" : "RSA key check"]} />
      <Txt x={300} y={172} k="s" opacity={fade(t, 1)}>
        {narrow ? "--secret: handshake only" : "bore's --secret only authenticates the handshake"}
      </Txt>
      <Chips items={[["wrap it in TLS, SSH or a VPN", "TLS, SSH or VPN"]]} t={seg(t, 0.3, 1)} tone="warn" narrow={narrow} />
    </g>
  );
}

function Platform({ step, t, clock, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["from tunnel hell to a manager", "tunnel manager"]} narrow={narrow} />
        <Box x={16} y={60} w={200} h={150} label="" tone="bad" />
        <Txt x={116} y={88} k="t" tone="bad">
          {narrow ? "Scripts" : "Shell scripts"}
        </Txt>
        {(narrow ? ["died", "clashed", "lost"] : ["processes died", "ports clashed", "which tunnel?"]).map((l, i) => (
          <Txt key={l} x={116} y={124 + i * 26} k="s">
            {l}
          </Txt>
        ))}
        <Wire d="M216 135H260" arrow tone="ok" />
        <rect className="ax-box ok" x={260} y={60} width={324} height={150} />
        <Txt x={422} y={88} k="t" tone="ok">
          tunnels.json
        </Txt>
        {(narrow ? ["URL · pid", "ADB port · type", "survives restarts"] : ["tunnel URL · pid", "ADB port · type", "survives restarts, cleans up"]).map((l, i) => (
          <Txt key={l} x={422} y={124 + i * 26} k="s" opacity={fade(t, i + 1)}>
            {l}
          </Txt>
        ))}
        <Chips items={[["one process knows every tunnel", "one process, all tunnels"]]} t={seg(t, 0.4, 1)} tone="ok" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["WiFi, no cable", "WiFi"]} c={["three steps", "3 steps"]} narrow={narrow} />
        {[
          ["USB", "adb tcpip 5555"],
          ["Read IP", "ip route"],
          ["Unplug", "adb connect :5555"],
        ].map(([l, s], i) => (
          <g key={l} opacity={fade(t, i, 0.18)}>
            <Box x={16 + i * 196} y={70} w={176} h={70} label={l} sub={narrow ? undefined : s} tone={i === 2 ? "ok" : undefined} />
            {i < 2 && <Wire d={`M${192 + i * 196} 105H${212 + i * 196}`} arrow />}
          </g>
        ))}
        <Txt x={300} y={186} k="s" opacity={fade(t, 3)}>
          {narrow ? "192.168.1.15:5555" : "adb connect 192.168.1.15:5555, then pull the cable"}
        </Txt>
      </g>
    );
  }
  if (step === 2) {
    const up = t < 0.33 || t >= 0.66;
    const q = clock > 0 ? (clock * 1) % 1 : 0;
    return (
      <g>
        <Head k={["is it still alive?", "health"]} c={["checked every second", "every 1 s"]} tone={up ? "ok" : "bad"} narrow={narrow} />
        <Box x={16} y={70} w={180} h={70} label={narrow ? "Health" : "Health monitor"} sub="every 1 s" tone="sky" />
        <Wire d="M196 105H400" arrow dash={!up} tone={up ? "ok" : "bad"} />
        {clock > 0 && up && <Token x={lerp(196, 400, q)} y={105} s={8} tone="ok" />}
        <Box x={400} y={70} w={184} h={70} label="Phone" sub={up ? "active" : "unplugged · inactive"} tone={up ? "ok" : "bad"} />
        {[
          ["unplug", "inactive ~1 s later", "bad"],
          ["plug back in", "active ~1 s later", "ok"],
        ].map(([k, v, tone], i) => (
          <g key={k} opacity={fade(t, i * 2 + 1)}>
            <rect className={`ax-box ${tone}`} x={16 + i * 292} y={176} width={276} height={46} />
            <Txt x={30 + i * 292} y={204} k="k" anchor="start" tone={tone as Tone}>
              {narrow ? (i ? "replug" : "unplug") : k}
            </Txt>
            <Txt x={278 + i * 292} y={204} k="s" anchor="end">
              {narrow ? (i ? "on ~1 s" : "off ~1 s") : v}
            </Txt>
          </g>
        ))}
        <Chips items={[["no developer action", "hands-off"]]} t={seg(t, 0.6, 1)} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["one adb command, end to end", "the platform"]} narrow={narrow} />
      <Path t={t} narrow={narrow} subs={[narrow ? "CLI" : "CLI · dashboard", narrow ? "API key" : "API-key secret", narrow ? "monitors" : "health + conn", "TCP 5555"]} />
      <Txt x={300} y={170} k="s" opacity={fade(t, 2)}>
        {narrow ? "NativeBridge tracks devices" : "the NativeBridge platform keeps the device registry"}
      </Txt>
      <Chips items={[["register", "register"], ["tunnel", "tunnel"], ["monitor", "monitor"], ["reconnect", "reconnect"]]} t={seg(t, 0.4, 1)} tone="ok" narrow={narrow} />
    </g>
  );
}

function Today({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["where a device farm still wins", "farms still win"]} tone="warn" narrow={narrow} />
        {[
          ["breadth", "hundreds of models you'll never buy", "more models"],
          ["maintenance", "batteries, OS updates, charging", "upkeep"],
          ["parallel CI", "one suite on 50 models at once", "big parallel CI"],
          ["security", "a managed service; here it's on you", "managed"],
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
        <Chips items={[["BridgeLink: the daily loop on your own phones", "the daily loop"]]} t={seg(t, 0.5, 1)} tone="ok" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["where it is today", "today"]} c="v0.3.0 · MIT" narrow={narrow} />
        <Box x={16} y={60} w={270} h={70} label={narrow ? "Install" : "PyPI · Homebrew"} sub={narrow ? "pip or brew" : "pip install bridgelink"} tone="ok" />
        <Box x={314} y={60} w={270} h={70} label={narrow ? "Open source" : "Open source"} sub={narrow ? "early, small" : "early and small"} tone="sky" />
        <Txt x={300} y={176} k="s" opacity={fade(t, 2)}>
          {narrow ? "next: pools, CI, teams" : "roadmap, no dates: device pools, reservations, CI/CD, teams"}
        </Txt>
        <Chips items={[["the core loop works", "core loop works"]]} t={seg(t, 0.4, 1)} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k="the lesson" tone="ok" narrow={narrow} />
      <Txt x={300} y={100} k="t">
        {narrow ? "ADB was already remote;" : "ADB was already remote; bore was already a tunnel."}
      </Txt>
      {narrow && (
        <Txt x={300} y={128} k="t">
          bore was a tunnel.
        </Txt>
      )}
      <Txt x={300} y={176} k="s" opacity={fade(t, 1)}>
        {narrow ? "the work: the unglamorous parts" : "the real work was in the unglamorous parts"}
      </Txt>
      <Chips items={[["lifecycles", "lifecycles"], ["health checks", "health"], ["reconnects", "reconnects"], ["clear output", "clear output"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "tunnel") return <Tunnel {...p} />;
  if (p.variant === "platform") return <Platform {...p} />;
  if (p.variant === "today") return <Today {...p} />;
  return <Problem {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "problem",
      label: "The problem",
      steps: [
        { caption: "An illustrative Bangalore team keeps its test phones in Koramangala but works across the city. A Redmi-only fix takes an afternoon to verify.", tween: 1400, ms: 3600 },
        { caption: "Their options: go to the office for every device bug, courier phones around, or rent a cloud device farm while their own phones sit idle.", tween: 1400 },
        { caption: "The question behind BridgeLink: ADB already works over a local network with adb connect. Why couldn't it work over the internet?", tween: 1200 },
      ],
    },
    {
      id: "tunnel",
      label: "The tunnel",
      steps: [
        { caption: "Put the phone in TCP mode, forward a host port to it, and let bore expose that port as bore.pub:15750. Then adb connect works from anywhere.", tween: 2000, ms: 3400 },
        { caption: "The first weekend, adb connect came back connected, to a phone that wasn't plugged into the machine. Manual and fragile, but it worked.", tween: 1200 },
        { caption: "A caveat: bore's secret only guards the handshake, and traffic isn't encrypted. ADB's RSA key check helps, but wrap it in TLS, SSH or a VPN.", tween: 1200, ms: 3400 },
      ],
    },
    {
      id: "platform",
      label: "The platform",
      steps: [
        { caption: "Shell scripts meant tunnels dying and ports clashing. One tunnel manager now tracks every tunnel in tunnels.json and survives restarts.", tween: 1400 },
        { caption: "WiFi mode drops the cable: adb tcpip 5555 over USB, read the phone's IP, adb connect to it, and unplug.", tween: 1400 },
        { caption: "A health monitor checks every device each second. Unplug a phone and it goes inactive; plug it back and it reactivates on its own.", tween: 2400, loop: true },
        { caption: "End to end: the developer's adb command goes through the NativeBridge platform and an API-key bore tunnel to the host, then the phone.", tween: 1800 },
      ],
    },
    {
      id: "today",
      label: "Today",
      steps: [
        { caption: "Device farms still win on breadth, maintenance, large parallel CI and managed security. BridgeLink is for the daily loop on phones you own.", tween: 1400 },
        { caption: "Today it's an early, small open-source CLI: version 0.3.0 on PyPI and Homebrew, MIT licensed. Pools, reservations and CI/CD are ideas, not dates.", tween: 1200 },
        { caption: "The lesson: ADB was already remote and bore already a tunnel. The real work was tunnel lifecycles, health checks, reconnects and clear output.", tween: 1200 },
      ],
    },
  ],
  Scene,
});
