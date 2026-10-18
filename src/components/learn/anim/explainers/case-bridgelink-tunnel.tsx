/**
 * Case file "BridgeLink": the weekend-1 tunnel for device 1d752b81 (adb tcpip 5555, adb forward
 * tcp:5000 tcp:5555, bore local 5000 --to bore.pub → bore.pub:15750, adb connect from anywhere),
 * then self-healing: the health monitor's 1-second ping, auto-deactivation on unplug and the
 * connection monitor's auto-activation, ~2 seconds of downtime in all.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const Y = 100;
const BH = 66;
const DEV = { x: 8, w: 116 };
const BORE = { x: 164, w: 116 };
const HOST = { x: 320, w: 116 };
const PH = { x: 476, w: 116 };
const BOXES = [DEV, BORE, HOST, PH];
const MID = Y + BH / 2;
const HM = { x: 214, y: 240, w: 170, h: 58 };
const CM = { x: 16, y: 240, w: 168, h: 58 };
const SERIAL = "1d752b81";

function Scene({ variant, step, t, clock, narrow }: SceneProps) {
  const heal = variant === "heal";
  const lines: { text: string; tone?: Tone }[] = [];
  let hopHP: Tone = undefined; // host ↔ phone
  let hopBH: Tone = undefined; // bore ↔ host
  let hopDB: Tone = undefined; // dev ↔ bore
  let phoneTone: Tone = undefined;
  let phoneSub = narrow ? ":5555" : SERIAL;
  let boreSub = ":15750";
  let unplugged = false;
  const toks: { x: number; y: number; tone: Tone; o?: number }[] = [];
  // developer → phone along the row
  const travel = (p: number) => ({ x: lerp(DEV.x + DEV.w, PH.x, p), y: MID });
  if (!heal) {
    if (step === 0) {
      lines.push({ text: `$ adb -s ${SERIAL} tcpip 5555` });
      if (t > 0.4) lines.push({ text: narrow ? `$ adb forward tcp:5000 tcp:5555` : `$ adb -s ${SERIAL} forward tcp:5000 tcp:5555` });
      phoneTone = "lit";
      hopHP = t > 0.4 ? "lit" : undefined;
      boreSub = "—";
    } else if (step === 1) {
      lines.push({ text: "$ bore local 5000 --to bore.pub" });
      if (t > 0.5) lines.push({ text: "Listening at bore.pub:15750", tone: "ok" });
      hopHP = "ok";
      hopBH = "lit";
      boreSub = t > 0.5 ? ":15750" : "—";
    } else {
      lines.push({ text: "$ adb connect bore.pub:15750" });
      if (t > 0.3) lines.push({ text: "connected", tone: "ok" });
      hopHP = hopBH = hopDB = "ok";
      phoneTone = "ok";
      for (let i = 0; i < 6; i++) {
        const c = clock > 0 ? (clock * 0.3 + i / 6) % 1 : [0.028, 0.25, 0.47, 0.53, 0.75, 0.97][i];
        const back = c >= 0.5;
        const p = back ? 1 - (c - 0.5) * 2 : c * 2;
        const at = travel(p);
        // inside a box the packet is "in" that hop: only draw it on the wires
        const inBox = BOXES.some((b) => at.x > b.x - 4 && at.x < b.x + b.w + 4);
        toks.push({ ...at, y: MID + (back ? 7 : -7), tone: back ? "sky" : "lit", o: inBox ? 0 : 1 });
      }
    }
  } else {
    hopHP = hopBH = hopDB = "ok";
    phoneTone = "ok";
    phoneSub = "active";
    // the 1-second health ping: HM → phone and back
    const ping = (c: number, fail: boolean) => {
      const a = { x: HM.x + HM.w, y: HM.y + HM.h / 2 };
      const b = { x: PH.x + PH.w / 2, y: Y + BH };
      const p = c < 0.5 ? c * 2 : 2 - c * 2;
      if (fail && c >= 0.5) return null;
      return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), tone: (fail ? "bad" : c < 0.5 ? "sky" : "ok") as Tone };
    };
    if (step === 0) {
      lines.push({ text: `$ adb -s ${SERIAL} shell echo ping` });
      lines.push({ text: "ping", tone: "ok" });
      const k = ping(clock > 0 ? clock % 1 : t < 1 ? t : 0.25, false);
      if (k) toks.push(k);
    } else if (step === 1) {
      unplugged = true;
      const k = ping(seg(t, 0, 0.5) * 0.5, true);
      if (t < 0.5 && k) toks.push(k);
      const off = t > 0.6;
      lines.push({ text: `Device ${SERIAL} disconnected`, tone: "warn" });
      if (off) lines.push({ text: "tunnel stopped · state inactive", tone: "bad" });
      hopHP = "bad";
      hopBH = hopDB = off ? "mute" : "ok";
      phoneTone = "bad";
      phoneSub = off ? "inactive" : "no answer";
      boreSub = off ? "closed" : ":15750";
    } else {
      const back = t > 0.35;
      const up = t > 0.8;
      lines.push({ text: back ? `Auto-activating ${SERIAL}` : "plugged back in…", tone: "sky" });
      if (up) lines.push({ text: `${SERIAL} auto-activated · ~2 s down`, tone: "ok" });
      hopHP = back ? "ok" : "mute";
      hopBH = hopDB = up ? "ok" : "mute";
      phoneTone = up ? "ok" : back ? "sky" : undefined;
      phoneSub = up ? "active" : "inactive";
      boreSub = up ? ":15750" : "closed";
      if (t > 0.1 && t < 0.4) {
        const p = seg(t, 0.1, 0.4);
        toks.push({ x: lerp(CM.x + CM.w, HOST.x + HOST.w / 2, p), y: lerp(CM.y + 12, Y + BH, p), tone: "sky" });
      }
    }
  }
  const hop = (x1: number, x2: number, tone: Tone, broken = false) =>
    broken ? (
      <g>
        <Wire d={`M${x1} ${MID}H${(x1 + x2) / 2 - 5}`} tone="bad" />
        <Wire d={`M${(x1 + x2) / 2 + 5} ${MID}H${x2}`} tone="bad" />
      </g>
    ) : (
      <Wire d={`M${x1} ${MID}H${x2}`} tone={tone} dash={tone === "mute"} />
    );
  return (
    <g>
      <rect x={16} y={16} width={W - 32} height={58} className="bl-term" />
      {lines.map((l, i) => (
        <text key={i} x={28} y={40 + i * 22} className={`bl-cmd${l.tone ? ` ${l.tone}` : ""}`}>
          {l.text}
        </text>
      ))}
      <Box x={DEV.x} y={Y} w={DEV.w} h={BH} label="Developer" sub="anywhere" tone={hopDB === "ok" && !heal ? "lit" : undefined} />
      {hop(DEV.x + DEV.w, BORE.x, hopDB)}
      <Box x={BORE.x} y={Y} w={BORE.w} h={BH} label="bore.pub" sub={boreSub} tone={hopBH === "lit" ? "lit" : hopBH === "mute" ? undefined : hopBH} />
      {hop(BORE.x + BORE.w, HOST.x, hopBH)}
      <Box x={HOST.x} y={Y} w={HOST.w} h={BH} label="Host" sub="port 5000" tone={hopHP === "lit" ? "lit" : undefined} />
      {hop(HOST.x + HOST.w, PH.x, hopHP, unplugged)}
      <Box x={PH.x} y={Y} w={PH.w} h={BH} label="Device" sub={phoneSub} tone={phoneTone} />
      <Txt x={(HOST.x + HOST.w + PH.x) / 2} y={MID - 12} k="s" tone={unplugged ? "bad" : "mute"}>
        {unplugged ? "✗" : "USB"}
      </Txt>
      <Txt x={(PH.x + PH.w / 2)} y={Y + BH + 18} k="s" tone="mute">
        {heal || narrow ? "" : "tcp 5555"}
      </Txt>
      {!heal && (
        <g>
          <Txt x={W / 2} y={Y + BH + 64} k="s" tone="mute">
            {narrow ? "bore: a TCP tunnel" : "bore: a TCP tunnel that exposes a local port"}
          </Txt>
          <Txt x={(BORE.x + BORE.w + HOST.x) / 2} y={Y + BH + 18} k="s" tone={hopBH === "lit" ? "lit" : "mute"}>
            {step >= 1 ? "tunnel" : ""}
          </Txt>
        </g>
      )}
      {heal && (
        <g>
          <Box x={CM.x} y={CM.y} w={CM.w} h={CM.h} label={narrow ? "Connection" : "Connection monitor"} sub={narrow ? "watch 1 s" : "auto-activate · 1 s"} tone={step === 2 ? "sky" : undefined} />
          <Box x={HM.x} y={HM.y} w={HM.w} h={HM.h} label={narrow ? "Health" : "Health monitor"} sub={narrow ? "ping 1 s" : "ping every 1 s"} tone={step === 1 ? "bad" : step === 0 ? "sky" : undefined} />
          <path className="bl-ping" d={`M${HM.x + HM.w} ${HM.y + HM.h / 2}L${PH.x + PH.w / 2} ${Y + BH}`} />
          <path className="bl-ping" d={`M${CM.x + CM.w} ${CM.y + 12}L${HOST.x + HOST.w / 2} ${Y + BH}`} />
        </g>
      )}
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={10} tone={k.tone} opacity={k.o} />
      ))}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.bl-term{fill:var(--c-bg,#000);stroke:var(--ax-line);stroke-width:1.5}.bl-cmd{font:13px var(--ax-mono);fill:var(--ax-fg2)}.bl-cmd.ok{fill:var(--ax-ok-text)}.bl-cmd.bad{fill:var(--ax-bad-text)}.bl-cmd.warn{fill:var(--ax-amber)}.bl-cmd.sky{fill:var(--ax-sky)}.bl-ping{fill:none;stroke:var(--ax-line);stroke-width:1.5;stroke-dasharray:4 5}@container ax (max-width:520px){.bl-cmd{font-size:17px}}`,
  variants: [
    {
      id: "tunnel",
      label: "The tunnel",
      steps: [
        { caption: "adb tcpip 5555 puts the phone in TCP mode; adb forward maps the host's port 5000 to it.", tween: 1600, ms: 2600 },
        { caption: "bore local 5000 --to bore.pub exposes that port on the internet as bore.pub:15750.", tween: 1600, ms: 2600 },
        { caption: "From anywhere, adb connect bore.pub:15750: commands ride the tunnel down and the device answers back.", tween: 900, ms: 3600, loop: true },
      ],
    },
    {
      id: "heal",
      label: "Self-healing",
      steps: [
        { caption: "A health monitor checks every active device each second with adb shell echo ping.", tween: 1000, ms: 3000, loop: true },
        { caption: "USB unplugged: the ping fails, so the tunnel stops and the device is marked inactive within a second.", tween: 1600, ms: 3000 },
        { caption: "Plugged back in: the connection monitor spots the serial and recreates the tunnel. About 2 s down, zero developer action.", tween: 2000, ms: 3800 },
      ],
    },
  ],
  Scene,
});
