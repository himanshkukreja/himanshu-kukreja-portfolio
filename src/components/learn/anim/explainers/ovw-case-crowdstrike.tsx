/**
 * The whole case file "CrowdStrike: one file, 8.5 million blue screens": a routine Channel File 291
 * push at 04:09 UTC to a sensor that lives in the kernel; the 21-fields-vs-20-inputs bug the
 * wildcards hid; the boot loop, the 78 minutes and the days of hands-on repair; then rings, stacked
 * checks and "config is code".
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

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

/** a grid of small machines; the first `bad` (in a scattered order) are red, the first `fixed` green */
function Fleet({ x, y, cols, rows, bad, fixed = 0, cw = 30, ch = 22 }: { x: number; y: number; cols: number; rows: number; bad: number; fixed?: number; cw?: number; ch?: number }) {
  const n = cols * rows;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const order = (i * 7) % n;
        const tone: Tone = order < fixed ? "ok" : order < bad ? "bad" : undefined;
        return <rect key={i} className={`ax-box ${tone || ""}`} x={x + (i % cols) * (cw + 6)} y={y + Math.floor(i / cols) * (ch + 6)} width={cw} height={ch} />;
      })}
    </g>
  );
}

function Update({ step, t, narrow }: SceneProps) {
  const e = ease(t);
  if (step === 0) {
    const p = lerp(166, 352, seg(t, 0.15, 0.8));
    return (
      <g>
        <Head k={["Fri 19 Jul 2024", "19 Jul 2024"]} c="04:09 UTC" narrow={narrow} />
        <Box x={16} y={93} w={150} h={60} label="CrowdStrike" sub="cloud" tone="lit" />
        <Wire d="M166 123H352" arrow tone="lit" />
        <Txt x={259} y={110} k="s" tone="lit">
          {narrow ? "File 291" : "Channel File 291"}
        </Txt>
        {t < 0.8 && <Token x={p} y={123} />}
        <Txt x={465} y={60} k="s">
          {narrow ? "Windows" : "Windows · Falcon"}
        </Txt>
        <Fleet x={360} y={70} cols={6} rows={4} bad={0} />
        <Chips items={["routine update", ["config file", "config"], ["Falcon on Windows", "Windows"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["where Falcon runs", "where it runs"]} narrow={narrow} />
        <Box x={16} y={56} w={260} h={70} label="User space" sub="browser · email" tone="sky" />
        <Box x={16} y={150} w={260} h={70} label="Kernel" sub={narrow ? "Falcon driver" : "Falcon driver · early boot"} tone="lit" />
        <Wire d="M276 91H340" arrow />
        <Wire d="M276 185H340" arrow tone="bad" />
        <g opacity={fade(t, 1)}>
          <Box x={340} y={56} w={244} h={70} label="App crashes" sub={narrow ? "reopen it" : "Windows closes it"} tone="ok" />
        </g>
        <g opacity={fade(t, 2)}>
          <Box x={340} y={150} w={244} h={70} label={narrow ? "PC stops" : "Machine stops"} sub="blue screen" tone="bad" />
        </g>
        <Chips items={[["kernel code cannot fail and restart like an app", "a kernel crash = the machine"]]} t={t} tone="warn" narrow={narrow} />
      </g>
    );
  }
  const slow = lerp(146, 297, e);
  const fast = lerp(146, 466, seg(t, 0.1, 0.7));
  return (
    <g>
      <Head k="two ways to update" narrow={narrow} />
      <Txt x={16} y={66} k="s" anchor="start">
        {narrow ? "Sensor Content · slow" : "Sensor Content · slow, certified"}
      </Txt>
      <Txt x={16} y={176} k="s" anchor="start" tone="lit">
        {narrow ? "Rapid Response · fast" : "Rapid Response Content · minutes"}
      </Txt>
      {[narrow ? ["Code", "Tests", "WHQL"] : ["Sensor code", "Release tests", "WHQL"], narrow ? ["Rule", "Validator", "File 291"] : ["Rule", "Validator", "File 291"]].map((row, r) =>
        row.map((l, i) => <Box key={l + r} x={16 + i * 144} y={r ? 186 : 76} w={130} h={44} label={l} tone={r && i === 2 ? "lit" : undefined} />),
      )}
      {[0, 1].map((r) => [0, 1, 2].map((i) => <Wire key={`${r}${i}`} d={`M${146 + i * 144} ${r ? 208 : 98}H${i === 2 ? 466 : 160 + i * 144}`} arrow tone={r ? "lit" : undefined} />))}
      <Box x={466} y={76} w={118} h={154} label="Sensor" tone={t > 0.7 ? "lit" : undefined} />
      <Token x={slow} y={98} tone="mute" />
      {t < 0.7 && <Token x={fast} y={208} />}
      <Chips items={[["“configuration data, not code”", "“not code”"]]} t={t} tone="warn" narrow={narrow} />
    </g>
  );
}

const CX = (i: number) => 27 + i * 26;
function Bug({ step, t, narrow }: SceneProps) {
  const f21: { tone: Tone; l: string } = step === 0 ? { tone: "lit", l: "" } : step === 1 ? { tone: "ok", l: "*" } : { tone: "bad", l: "x" };
  const read = step === 3 ? ease(seg(t, 0.1, 0.6)) : 0;
  return (
    <g>
      <Head k={["sensor 7.11 · IPC template", "IPC template"]} c={step < 2 ? (step ? "Mar–Apr" : "Feb 2024") : "Jul 19"} tone={step === 3 ? "bad" : undefined} narrow={narrow} />
      <Txt x={27} y={66} k="s" anchor="start">
        {narrow ? "rule: 21 fields" : "Template Type: 21 fields"}
      </Txt>
      <Txt x={571} y={66} k="s" anchor="end" tone={f21.tone}>
        field 21
      </Txt>
      {Array.from({ length: 21 }, (_, i) => (
        <rect key={i} className={`ax-box ${i === 20 ? f21.tone : ""}`} x={CX(i)} y={76} width={24} height={30} />
      ))}
      {f21.l && (
        <Txt x={CX(20) + 12} y={96} k="t" tone={f21.tone}>
          {f21.l}
        </Txt>
      )}
      <Txt x={27} y={146} k="s" anchor="start">
        {narrow ? "sensor: 20 inputs" : "sensor supplies: 20 values"}
      </Txt>
      {Array.from({ length: 20 }, (_, i) => (
        <rect key={i} className="ax-tok mute" x={CX(i)} y={156} width={24} height={30} opacity={0.75} />
      ))}
      <rect className={`ax-wire ax-dash ${step === 3 ? "bad" : ""}`} x={CX(20)} y={156} width={24} height={30} />
      {step === 1 && (
        <Txt x={300} y={128} k="s" tone="ok">
          {narrow ? "* = match anything" : "wildcard: box 21 is never read"}
        </Txt>
      )}
      {step === 2 && (
        <g opacity={fade(t, 1)}>
          <Box x={27} y={206} w={300} h={54} label={narrow ? "Validator" : "Content Validator"} sub={narrow ? "vs definition: ok" : "vs the definition: passes"} tone="ok" />
          <Txt x={350} y={238} k="s" anchor="start" tone="bad">
            {narrow ? "a real value" : "a real value in field 21"}
          </Txt>
        </g>
      )}
      {step === 3 && (
        <g>
          <Wire d={`M${CX(20) + 12} 106V156`} tone="bad" arrow />
          <Wire d={`M${CX(20) + 12} 186V${lerp(186, 206, read)}`} tone="bad" />
          <g opacity={fade(t, 3)}>
            <Box x={27} y={206} w={260} h={54} label={narrow ? "Named pipe" : "Next named pipe"} sub="rule runs" />
            <Box x={300} y={206} w={284} h={54} label="Blue screen" sub={narrow ? "csagent.sys" : "reads past the end"} tone="bad" />
          </g>
        </g>
      )}
      {step === 0 && <Chips items={[["sensor 7.11", "7.11"], ["named pipes (IPC)", "named pipes"], ["21 defined · 20 given", "21 vs 20"]]} t={t} narrow={narrow} />}
      {step === 1 && <Chips items={[["Mar 5: first rule", "Mar 5"], ["Apr: three more", "April"], ["all tests pass", "all pass"]]} t={t} tone="ok" narrow={narrow} />}
      {step === 2 && <Chips items={[["04:09 UTC: two new rules", "04:09 UTC"], ["validator: pass", "passes"]]} t={t} narrow={narrow} />}
      {step === 3 && <Chips items={[["index 0x14: the 21st item", "index 0x14"], ["no bounds check", "no check"]]} t={t} tone="bad" narrow={narrow} />}
    </g>
  );
}

const LOOP = [
  { l: "Crash", s: "blue screen", tone: "bad" as Tone },
  { l: "Restart", s: "file still on disk" },
  { l: "Driver loads", s: "reads File 291" },
];
function Spread({ step, t, clock, narrow }: SceneProps) {
  const e = ease(t);
  if (step === 0) {
    const q = (clock * 0.35) % 1;
    return (
      <g>
        <Head k="the boot loop" c={["after 04:09 UTC", "04:09+"]} tone="bad" narrow={narrow} />
        <Txt x={16} y={58} k="s" anchor="start">
          {narrow ? "got the file" : "online sensors that got the file"}
        </Txt>
        <Fleet x={16} y={70} cols={8} rows={5} bad={Math.round(40 * e)} cw={30} ch={24} />
        {LOOP.map((b, i) => (
          <Box key={b.l} x={360} y={56 + i * 70} w={190} h={52} label={b.l} sub={narrow ? undefined : b.s} tone={b.tone} />
        ))}
        <Wire d="M455 108V126" arrow />
        <Wire d="M455 178V196" arrow />
        <Wire d="M550 222H570V82H550" arrow tone="bad" />
        {clock > 0 && <Token x={570} y={lerp(222, 82, q)} tone="bad" />}
        <Chips items={[["next named-pipe event", "named pipe"], ["survives restart", "on reboot"], ["boot loop", "loop"]]} t={t} tone="bad" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k="78 minutes" c="04:09 → 05:27 UTC" tone="bad" narrow={narrow} />
        <Meter x={40} y={92} w={520} h={22} value={e} max={1} tone="bad" />
        <Txt x={40} y={140} k="s" anchor="start">
          04:09 push
        </Txt>
        <Txt x={560} y={140} k="s" anchor="end" tone="ok">
          05:27 revert
        </Txt>
        <Txt x={300} y={190} k="s">
          {narrow ? "2:09 pm in Sydney" : "2:09 pm Sydney · 9:39 am India · 5:09 am London"}
        </Txt>
        <Figs items={[["78 min", "file served"], ["8.5M", narrow ? "devices" : "devices (Microsoft)", "bad"], ["< 1%", narrow ? "of Windows" : "of all Windows"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  if (step === 2) {
    const steps = narrow
      ? [["Safe Mode", "boot"], ["BitLocker", "the key"], ["Delete", "file 291"], ["Restart", "normally"]]
      : [["Safe Mode", "or WinRE"], ["BitLocker", "48-digit key"], ["Delete", "C-00000291*.sys"], ["Restart", "normally"]];
    return (
      <g>
        <Head k={["the fix: by hand", "by hand"]} c={narrow ? "per machine" : "one machine at a time"} narrow={narrow} />
        {steps.map(([l, s], i) => (
          <g key={l} opacity={fade(t, i, 0.12)}>
            <Box x={16 + i * 148} y={56} w={130} h={58} label={l} sub={s} tone={i === 1 ? "warn" : i === 3 ? "ok" : undefined} />
            {i < 3 && <Wire d={`M${146 + i * 148} 85H${164 + i * 148}`} arrow />}
          </g>
        ))}
        <Fleet x={16} y={150} cols={15} rows={3} bad={45} fixed={Math.round(lerp(0, 6, seg(t, 0.4, 1)))} cw={32} ch={20} />
        <Chips items={[[">97% back · Jul 24", ">97% Jul 24"], ["~99% back · Jul 29", "~99% Jul 29"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k="the file vs the machines" c="the bill" tone="warn" narrow={narrow} />
      <Txt x={16} y={66} k="s" anchor="start" tone="ok">
        {narrow ? "fix the file: 78 min" : "fixing the file: 78 minutes"}
      </Txt>
      <Meter x={16} y={76} w={568} h={18} value={0.06 * e} max={1} tone="ok" />
      <Txt x={16} y={136} k="s" anchor="start" tone="bad">
        {narrow ? "fix the machines: days" : "fixing the machines: days"}
      </Txt>
      <Meter x={16} y={146} w={568} h={18} value={e} max={1} tone="bad" />
      <Txt x={300} y={214} k="s">
        {narrow ? "Delta reset 40,000 servers" : "Delta reset 40,000 servers by hand"}
      </Txt>
      <Figs items={[["$500M", narrow ? "Delta" : "Delta, 5 days"], ["5,000+", narrow ? "flights cut" : "Delta flights cancelled"], ["$5.4B", narrow ? "Fortune 500" : "Fortune 500 (estimate)", "bad"]]} t={t} narrow={narrow} />
    </g>
  );
}

const LAYERS: [string, string][] = [
  ["Build · input-count check", "input count"],
  ["Runtime · bounds check", "bounds check"],
  ["Tests · real value in every field", "real values"],
  ["Validator · fields ≤ inputs", "validator"],
  ["Rollout · rings + bake time", "rings"],
];
function Lesson({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k="staged rollout" c={narrow ? "illustrative" : "illustrative numbers"} narrow={narrow} />
        <Box x={16} y={70} w={100} h={56} label="Update" />
        <Box x={146} y={70} w={130} h={56} label="Ring 0" sub="canary" tone={t > 0.5 ? "bad" : "lit"} />
        <Box x={306} y={70} w={120} h={56} label="Ring 1" dim />
        <Box x={456} y={70} w={128} h={56} label="All" sub={narrow ? undefined : "every sensor"} dim />
        <Wire d="M116 98H146" arrow tone="lit" />
        <Wire d="M276 98H306" arrow dash />
        <Wire d="M426 98H456" arrow dash />
        <Txt x={291} y={62} k="s">
          bake
        </Txt>
        <Txt x={441} y={62} k="s">
          bake
        </Txt>
        <g opacity={fade(t, 3)}>
          <Wire d="M211 126V170" arrow tone="bad" />
          <Box x={146} y={170} w={130} h={56} label="Stop" sub="roll back" tone="bad" />
          <Txt x={306} y={204} k="s" anchor="start" tone="ok">
            {narrow ? "damage capped" : "the first ring caps the damage"}
          </Txt>
        </g>
        <Figs items={[["5,000", narrow ? "canary hit" : "hit with a canary", "ok"], ["8.5M", narrow ? "no rings" : "hit with no rings", "bad"], ["0.06%", narrow ? "of the hit" : "of the real impact"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["what CrowdStrike changed", "the fixes"]} c={narrow ? "stacked" : "stacked checks"} tone="ok" narrow={narrow} />
        {LAYERS.map(([l, n], i) => (
          <g key={l} opacity={fade(t, i, 0.12)}>
            <rect className="ax-box ok" x={16} y={50 + i * 46} width={568} height={36} />
            <Txt x={30} y={73 + i * 46} k="t" anchor="start">
              {narrow ? n : l}
            </Txt>
          </g>
        ))}
      </g>
    );
  }
  return (
    <g>
      <Head k="the lesson" tone="ok" narrow={narrow} />
      <Box x={16} y={60} w={240} h={60} label={narrow ? "Data" : "Data: field 21"} sub={narrow ? "no bug" : "no program in it"} tone="sky" />
      <Wire d="M256 90H330" arrow tone="lit" />
      <Box x={330} y={60} w={254} h={60} label={narrow ? "Code path" : "Untested code path"} sub="switched on" tone="bad" />
      <Txt x={300} y={186} k="d" tone="lit" opacity={fade(t, 1)}>
        config is code
      </Txt>
      <Chips items={[["test it like code", "test it"], ["roll out in rings", "rings"], ["plan offline recovery", "recovery"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "bug") return <Bug {...p} />;
  if (p.variant === "spread") return <Spread {...p} />;
  if (p.variant === "fix") return <Lesson {...p} />;
  return <Update {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "update",
      label: "The update",
      steps: [
        { caption: "Friday, July 19, 2024, 04:09 UTC. CrowdStrike pushes a routine update to Falcon on Windows: a small configuration file, Channel File 291.", tween: 1600 },
        { caption: "A normal app that crashes just closes. Falcon runs as a kernel driver loaded early in boot, so when it crashes, the whole machine crashes.", tween: 1400 },
        { caption: "Sensor code ships slowly, through testing and Microsoft certification. Rapid Response Content comes from the cloud in minutes, as channel files.", tween: 1800 },
      ],
    },
    {
      id: "bug",
      label: "21 vs 20",
      steps: [
        { caption: "Sensor 7.11 shipped in February 2024 with a template for named pipes. Its definition said 21 input fields, but the sensor only ever supplied 20.", tween: 1200 },
        { caption: "Every rule through April used a wildcard in field 21: match anything. The sensor never read the missing box, so tests passed.", tween: 900 },
        { caption: "On July 19 a new rule put a real value in field 21. The Content Validator checked it against the definition, which said 21 fields, so it passed.", tween: 1200 },
        { caption: "At the next named-pipe event the sensor reached for input 21, read past the end of its 20-item list, and the kernel crashed.", tween: 1600 },
      ],
    },
    {
      id: "spread",
      label: "78 minutes",
      steps: [
        { caption: "The file stayed on disk and the driver loads early in boot, so machines crashed, restarted, read it again and crashed again: a boot loop.", tween: 1800, loop: true },
        { caption: "CrowdStrike reverted the file at 05:27 UTC, 78 minutes later. Microsoft estimated about 8.5 million Windows devices were affected.", tween: 1800 },
        { caption: "A looping machine can't fetch a fix, so many were fixed by hand: Safe Mode, the BitLocker key, delete C-00000291*.sys, restart.", tween: 2000, ms: 3400 },
        { caption: "Fixing the file took 78 minutes; fixing the machines took days. Delta put its cost at about $500 million, Parametrix estimated $5.4 billion.", tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "fix",
      label: "Never again",
      steps: [
        { caption: "Rings send content to a small canary first, with bake time between. An illustrative 5,000-machine canary is about 0.06% of the real hit.", tween: 1600, ms: 3400 },
        { caption: "CrowdStrike now stacks checks: input counts at build time, a runtime bounds check, real values in every field, a stricter validator, rings.", tween: 1600, ms: 3400 },
        { caption: "The data held no bug, but it switched one on. Config is code: test it, ship it in rings, and plan recovery for machines that can't boot.", tween: 1200, ms: 3400 },
      ],
    },
  ],
  Scene,
});
