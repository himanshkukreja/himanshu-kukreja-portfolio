/**
 * Case file "Handling Node Outages in Leader-Follower Replication" (StreamFlix): the leader in
 * US-East fails on Black Friday. With asynchronous replication the most up-to-date follower is
 * promoted and the write it never received is lost; with a synchronous standby (US-West, the
 * payments setup) the promoted node already has every confirmed write.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const APP = { x: 24, y: 126, w: 112, h: 58 };
const LEAD = { x: 196, y: 116, w: 156, h: 78 };
const FX = 424;
const FW = 152;
const FH = 78;
const FY = [20, 121, 222];
const NAMES = ["Follower 1", "Follower 2", "Follower 3"];
const REGION = ["US-West", "Europe", "US-East"];
const SLOT = 14;
const GAP = 6;

type Frame = {
  lead: number; // writes the leader holds
  f: number[]; // writes each follower holds
  leaderDown: boolean;
  promoted: number; // index of the promoted follower, -1 none
  lost: boolean; // write 4 lost
  status: string;
  statusTone: Tone;
  flow: boolean; // replication tokens flowing
  writeIn: number; // progress of the client write into the leader (0..1), -1 none
  ack: number; // sync ack progress back to the leader, -1 none
};

function frame(variant: string, step: number, t: number): Frame {
  const sync = variant === "sync";
  const e = ease(t);
  const base: Frame = { lead: 4, f: sync ? [4, 2, 3] : [3, 1, 2], leaderDown: false, promoted: -1, lost: false, status: "", statusTone: undefined, flow: false, writeIn: -1, ack: -1 };
  if (step === 0) {
    const fr = { ...base, flow: true, status: sync ? "write 4 = $9.99 Premium" : "async: reply now, copy later", statusTone: "lit" as Tone };
    fr.lead = t < 0.4 ? 3 : 4;
    fr.writeIn = t < 0.4 ? seg(t, 0, 0.4) : -1;
    if (sync) {
      fr.f = [t < 0.7 ? 3 : 4, 2, 3];
      fr.ack = t >= 0.7 && t < 1 ? seg(t, 0.7, 1) : -1;
      fr.status = t < 0.95 ? "waiting for US-West ack…" : "payment confirmed";
      fr.statusTone = t < 0.95 ? "warn" : "ok";
    }
    return fr;
  }
  if (step === 1) return { ...base, leaderDown: e > 0.3, status: "writes halted · detection 10-30 s", statusTone: "bad" };
  if (sync) return { ...base, leaderDown: true, promoted: 0, f: [4, e > 0.6 ? 4 : 2, e > 0.6 ? 4 : 3], status: "0 payments lost", statusTone: "ok" };
  if (step === 2) return { ...base, leaderDown: true, promoted: e > 0.5 ? 0 : -1, status: "most up-to-date: Follower 1", statusTone: "lit" };
  return { ...base, leaderDown: true, promoted: 0, f: [3, e > 0.5 ? 3 : 1, e > 0.5 ? 3 : 2], lost: true, status: "write 4 lost", statusTone: "bad" };
}

function Log({ cx, y, n, of = 4, lost }: { cx: number; y: number; n: number; of?: number; lost?: boolean }) {
  const w = of * SLOT + (of - 1) * GAP;
  const x0 = cx - w / 2;
  return (
    <g>
      {Array.from({ length: of }, (_, i) => (
        <rect key={i} x={x0 + i * (SLOT + GAP)} y={y} width={SLOT} height={SLOT} className={`fl-slot${i < n ? (lost && i === 3 ? " lost" : " on") : ""}`} />
      ))}
    </g>
  );
}

function Scene({ variant, step, t, clock, narrow }: SceneProps) {
  const sync = variant === "sync";
  const fr = frame(variant, step, t);
  const leadMid = { x: LEAD.x + LEAD.w, y: LEAD.y + LEAD.h / 2 };
  const fIn = (i: number) => ({ x: FX, y: FY[i] + FH / 2 });
  const wire = (i: number) => `M${leadMid.x} ${leadMid.y}C${leadMid.x + 40} ${leadMid.y} ${FX - 40} ${fIn(i).y} ${FX} ${fIn(i).y}`;
  const onWire = (i: number, p: number) => {
    const a = leadMid;
    const b = fIn(i);
    const c1 = { x: a.x + 40, y: a.y };
    const c2 = { x: b.x - 40, y: b.y };
    const u = 1 - p;
    return {
      x: u * u * u * a.x + 3 * u * u * p * c1.x + 3 * u * p * p * c2.x + p * p * p * b.x,
      y: u * u * u * a.y + 3 * u * u * p * c1.y + 3 * u * p * p * c2.y + p * p * p * b.y,
    };
  };
  const appOut = { x: APP.x + APP.w, y: APP.y + APP.h / 2 };
  const leadIn = { x: LEAD.x, y: LEAD.y + LEAD.h / 2 };
  const newLeader = fr.promoted >= 0;
  const toks: { x: number; y: number; tone: Tone }[] = [];
  if (fr.writeIn >= 0) toks.push({ x: lerp(appOut.x, leadIn.x, fr.writeIn), y: lerp(appOut.y, leadIn.y, fr.writeIn), tone: "lit" });
  if (sync && step === 0 && t >= 0.4 && t < 0.7) toks.push({ ...onWire(0, seg(t, 0.4, 0.7)), tone: "lit" });
  if (fr.ack >= 0) toks.push({ ...onWire(0, 1 - fr.ack), tone: "ok" });
  if (fr.flow && !fr.leaderDown) {
    [1, 2].concat(sync ? [] : [0]).forEach((i) => {
      const p = (clock * 0.45 + i * 0.33) % 1;
      if (clock > 0) toks.push({ ...onWire(i, p), tone: "sky" });
    });
  }
  const label = (i: number) => (newLeader && i === fr.promoted ? "New leader" : NAMES[i]);
  const sub = (i: number) => (narrow ? REGION[i] : sync && i === 0 ? "US-West · sync" : `${REGION[i]} · async`);
  return (
    <g>
      <Box x={APP.x} y={APP.y} w={APP.w} h={APP.h} label="App" sub={sync ? "payments" : "watchlist"} />
      <Wire d={`M${appOut.x} ${appOut.y}H${leadIn.x}`} arrow tone={fr.writeIn >= 0 ? "lit" : fr.leaderDown ? "mute" : undefined} />
      {newLeader && <Wire d={`M${appOut.x - 20} ${APP.y}V${FY[0] + FH / 2}H${FX}`} arrow tone="lit" />}
      {newLeader && (
        <Txt x={appOut.x - 12} y={FY[0] + FH / 2 - 8} k="s" anchor="start" tone="lit">
          {narrow ? "writes" : "writes now go here"}
        </Txt>
      )}
      {/* leader */}
      <rect x={LEAD.x} y={LEAD.y} width={LEAD.w} height={LEAD.h} className={`ax-box${fr.leaderDown ? " bad" : " lit"}`} />
      <Txt x={LEAD.x + LEAD.w / 2} y={LEAD.y + 24} tone={fr.leaderDown ? "bad" : undefined}>
        {fr.leaderDown ? "Leader ✗" : "Leader"}
      </Txt>
      <Txt x={LEAD.x + LEAD.w / 2} y={LEAD.y + 42} k="s">
        {fr.leaderDown ? "failed" : "US-East"}
      </Txt>
      <Log cx={LEAD.x + LEAD.w / 2} y={LEAD.y + 52} n={fr.lead} lost={fr.lost} />
      {fr.lost && (
        <Txt x={LEAD.x + LEAD.w / 2 + 40} y={LEAD.y + LEAD.h + 20} k="s" tone="bad">
          {narrow ? "4 lost" : "write 4 never copied"}
        </Txt>
      )}
      {/* followers */}
      {FY.map((y, i) => {
        const isNew = newLeader && i === fr.promoted;
        return (
          <g key={i}>
            <Wire d={wire(i)} dash={!(sync && i === 0)} tone={fr.leaderDown ? "mute" : sync && i === 0 ? "ok" : undefined} />
            <rect x={FX} y={y} width={FW} height={FH} className={`ax-box${isNew ? " lit" : ""}`} />
            <Txt x={FX + FW / 2} y={y + 24} tone={isNew ? "lit" : undefined}>
              {label(i)}
            </Txt>
            <Txt x={FX + FW / 2} y={y + 42} k="s">
              {sub(i)}
            </Txt>
            <Log cx={FX + FW / 2} y={y + 52} n={fr.f[i]} />
          </g>
        );
      })}
      {newLeader && (
        <path className="fl-resync" d={`M${FX + FW + 10} ${FY[0] + FH / 2}V${FY[2] + FH / 2}M${FX + FW + 4} ${FY[1] + FH / 2}H${FX + FW + 10}M${FX + FW + 4} ${FY[2] + FH / 2}H${FX + FW + 10}`} />
      )}
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={10} tone={k.tone} />
      ))}
      <Txt x={24} y={34} k="k" anchor="start">
        {narrow ? "write log 1-4" : "write log · writes 1-4"}
      </Txt>
      <Txt x={24} y={H - 22} k="k" anchor="start" tone={fr.statusTone}>
        {fr.status}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.fl-slot{fill:none;stroke:var(--ax-line);stroke-width:1.5}.fl-slot.on{fill:var(--ax-sky);stroke:var(--ax-sky)}.fl-slot.lost{fill:var(--ax-bad);stroke:var(--ax-bad)}.fl-resync{fill:none;stroke:var(--ax-accent);stroke-width:1.5;stroke-dasharray:4 4}`,
  variants: [
    {
      id: "async",
      label: "Async follower",
      steps: [
        { caption: "Write 4 lands on the leader and is acknowledged at once; replication copies writes to followers later.", tween: 1800, ms: 3000, loop: true },
        { caption: "2 AM, Black Friday: the leader fails. All writes halt while monitoring detects it, 10 to 30 seconds.", tween: 1200 },
        { caption: "Election picks the most up-to-date follower: Follower 1 has writes 1 to 3, so it is promoted.", tween: 1400 },
        { caption: "Write 4 never left the old leader: lost. Traffic moves to the new leader and followers resync.", tween: 1600, ms: 3600 },
      ],
    },
    {
      id: "sync",
      label: "Sync standby",
      steps: [
        { caption: "A $9.99 Premium purchase waits for the US-West sync follower to confirm before the user sees success.", tween: 2400, ms: 3000, loop: true },
        { caption: "The leader fails. The synchronous standby already holds every confirmed payment.", tween: 1200 },
        { caption: "Promote that standby: zero payment data lost. The price was latency, every write waited.", tween: 1600, ms: 3600 },
      ],
    },
  ],
  Scene,
});
