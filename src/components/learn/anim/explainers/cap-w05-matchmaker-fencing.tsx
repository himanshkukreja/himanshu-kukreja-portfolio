/**
 * Week 5 capstone (matchmaking · data flow and Deep Dive 1): the queue is a Redis sorted set scored
 * by ELO; every 500 ms the region's leader finds 10 players within ±100 and removes them with its
 * fencing token (a Lua check: token ≥ highest seen). Failover: leader A (token 42) stalls, its 10 s
 * etcd lease expires, B is elected with a higher token, and A's late removal with 42 is rejected.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 316;
const MM = [20, 140, 260].map((x) => ({ x, y: 48, w: 110, h: 54 }));
const ET = { x: 400, y: 48, w: 180, h: 54 };
const Q = { x: 20, y: 138, w: 560, h: 118 };
const AX0 = 60;
const AX1 = 540;
const AY = Q.y + 78;
const ex = (elo: number) => AX0 + ((elo - 1300) / 400) * (AX1 - AX0);
const PLAYERS = [1310, 1420, 1445, 1460, 1480, 1495, 1505, 1520, 1540, 1555, 1580, 1690];
const IN = (e: number) => e >= 1400 && e <= 1600;
const py = (i: number) => AY - 18 - (i % 2) * 14;

type Frame = {
  status: [string, string, string];
  tones: [Tone, Tone, Tone];
  leader: string;
  highest: string;
  highTone?: Tone;
  window: boolean;
  /** players still queued (tone per index), or null when removed */
  queued: (Tone | null)[];
  /** players flying to a matchmaker box: index of that box */
  fly?: number;
  lease?: number;
  reject?: boolean;
  note: string;
  noteTone?: Tone;
};

function loop(step: number, t: number): Frame {
  const d = (x: number) => t >= x;
  const base: Frame = { status: ["leader · 42", "standby", "standby"], tones: ["lit", undefined, undefined], leader: "A · rev 42", highest: "42", window: false, queued: PLAYERS.map(() => "mute"), note: "" };
  if (step === 0) return { ...base, queued: PLAYERS.map((_, i) => (t >= (i + 1) / 13 ? "sky" : null)), note: "queue join: ZADD by ELO", noteTone: "sky" };
  if (step === 1)
    return { ...base, window: d(0.3), queued: PLAYERS.map((e) => (d(0.6) && IN(e) ? "lit" : "sky")), note: d(0.6) ? "10 players within ±100 → 5v5" : "tick: every 500 ms", noteTone: "lit" };
  return {
    ...base,
    window: true,
    queued: PLAYERS.map((e) => (IN(e) ? (d(0.25) ? null : "ok") : "sky")),
    fly: 0,
    highTone: "ok",
    note: d(0.9) ? "42 ≥ 42: ZREM all 10" : "Lua: token 42 vs highest",
    noteTone: "ok",
  };
}

function failover(step: number, t: number): Frame {
  const d = (x: number) => t >= x;
  const queued = PLAYERS.map((e) => (IN(e) ? "lit" : "sky")) as Tone[];
  if (step === 0) return { status: ["leader · 42", "standby", "standby"], tones: ["lit", undefined, undefined], leader: "A · rev 42", highest: "42", window: false, queued, lease: 1 - 0.3 * Math.sin(t * Math.PI), note: "10 s lease, kept alive", noteTone: "lit" };
  if (step === 1)
    return {
      status: [d(0.1) ? "stalled" : "leader · 42", d(0.8) ? "leader · 43" : "standby", "standby"],
      tones: [d(0.1) ? "warn" : "lit", d(0.8) ? "lit" : undefined, undefined],
      leader: d(0.7) ? "B · rev 43" : d(0.6) ? "expired" : "A · rev 42",
      highest: "42",
      window: false,
      queued,
      lease: Math.max(0, 1 - seg(t, 0.1, 0.6)),
      note: d(0.7) ? "B elected with a higher token" : "A's keepalives stop",
      noteTone: d(0.7) ? "lit" : "warn",
    };
  if (step === 2)
    return {
      status: ["stalled", "leader · 43", "standby"],
      tones: ["warn", "lit", undefined],
      leader: "B · rev 43",
      highest: d(0.9) ? "43" : "42",
      highTone: d(0.9) ? "ok" : undefined,
      window: true,
      queued: PLAYERS.map((e) => (IN(e) ? (d(0.25) ? null : "ok") : "sky")),
      fly: 1,
      note: "B removes the 10 with token 43",
      noteTone: "ok",
    };
  return {
    status: [d(0.2) ? "awake, stale" : "stalled", "leader · 43", "standby"],
    tones: [d(0.85) ? "bad" : "warn", "lit", undefined],
    leader: "B · rev 43",
    highest: "43",
    highTone: "ok",
    window: false,
    queued: PLAYERS.map((e) => (IN(e) ? null : "sky")),
    reject: true,
    note: d(0.85) ? "42 < 43: rejected, no double-booking" : "A tries to remove with 42",
    noteTone: d(0.85) ? "bad" : "warn",
  };
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = variant === "failover" ? failover(step, t) : loop(step, t);
  const names = ["A", "B", "C"];
  const fly = f.fly !== undefined ? MM[f.fly] : null;
  const fp = ease(seg(t, 0, 0.25));
  const rej = f.reject ? seg(t, 0.2, 0.85) : 0;
  const RX = ex(1500);
  const RYY = AY - 40;
  const rx = lerp(MM[0].x + MM[0].w / 2, RX, Math.min(1, rej * 1.6));
  const ry = lerp(MM[0].y + MM[0].h, RYY, Math.min(1, rej * 1.6));
  return (
    <g>
      <Txt x={20} y={30} k="k" anchor="start">
        {narrow ? "region NA" : "matchmakers · region NA"}
      </Txt>
      <Txt x={W - 20} y={30} k="s" anchor="end">
        {narrow ? "5v5" : "5v5 · ELO 0–3000"}
      </Txt>
      {MM.map((m, i) => (
        <g key={i}>
          <Wire d={`M${m.x + m.w / 2} ${m.y + m.h}V${Q.y}`} opacity={f.tones[i] === "lit" ? 1 : 0.35} />
          <Box x={m.x} y={m.y} w={m.w} h={m.h} label={names[i]} sub={narrow ? f.status[i].replace(" · ", " ").replace("awake, stale", "awake") : f.status[i]} tone={f.tones[i]} />
        </g>
      ))}
      {f.lease !== undefined && <Meter x={MM[0].x} y={MM[0].y + MM[0].h + 6} w={MM[0].w} h={6} value={f.lease} max={1} tone={f.lease < 0.3 ? "bad" : "lit"} />}
      <Wire d={`M${MM[2].x + MM[2].w} ${ET.y + ET.h / 2}H${ET.x}`} dash />
      <Box x={ET.x} y={ET.y} w={ET.w} h={ET.h} label="etcd" sub={narrow ? f.leader.replace(" · rev ", " ") : `leader: ${f.leader}`} tone={f.leader === "expired" ? "warn" : undefined} />
      <rect className="ax-box" x={Q.x} y={Q.y} width={Q.w} height={Q.h} />
      <Txt x={Q.x + 12} y={Q.y + 22} k="k" anchor="start">
        {narrow ? "queue:{na}" : "Redis · queue:{na} (sorted set)"}
      </Txt>
      <Txt x={Q.x + Q.w - 12} y={Q.y + 22} k="s" anchor="end" tone={f.highTone}>
        {`highest token ${f.highest}`}
      </Txt>
      {f.window && <rect className="mf-win" x={ex(1400)} y={AY - 40} width={ex(1600) - ex(1400)} height={44} />}
      <line className="mf-axis" x1={AX0} x2={AX1} y1={AY} y2={AY} />
      {[1300, 1400, 1500, 1600, 1700].map((e) => (
        <g key={e}>
          <line className="mf-axis" x1={ex(e)} x2={ex(e)} y1={AY} y2={AY + 5} />
          {(e % 200 === 100 || !narrow) && (
            <Txt x={ex(e)} y={AY + 24} k="s">
              {String(e)}
            </Txt>
          )}
        </g>
      ))}
      {PLAYERS.map((e, i) => {
        const tone = f.queued[i];
        if (tone) return <Token key={i} x={ex(e)} y={py(i)} s={10} tone={tone} />;
        if (fly && fp < 1 && IN(e)) return <Token key={i} x={lerp(ex(e), fly.x + fly.w / 2, fp)} y={lerp(py(i), fly.y + fly.h, fp)} s={10} tone="ok" opacity={1 - fp * 0.5} />;
        return null;
      })}
      {f.reject && rej > 0 && rej < 1 && <Token x={rx} y={ry} s={11} tone={rej > 0.62 ? "bad" : "warn"} />}
      {f.reject && t >= 0.85 && (
        <g>
          <path className="mf-x" d={`M${RX - 7} ${RYY - 7}l14 14m0 -14l-14 14`} />
          <Txt x={RX + 16} y={RYY + 5} k="s" anchor="start" tone="bad">
            42 &lt; 43
          </Txt>
        </g>
      )}
      <Txt x={20} y={H - 16} anchor="start" tone={f.noteTone}>
        {f.note}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.mf-axis{stroke:var(--ax-line);stroke-width:1.5}.mf-win{fill:none;stroke:var(--ax-accent);stroke-width:1.5;stroke-dasharray:5 4}.mf-x{fill:none;stroke:var(--ax-bad);stroke-width:2.5}`,
  variants: [
    {
      id: "loop",
      label: "Match loop",
      steps: [
        { caption: "Players join queue:{na}, a Redis sorted set scored by ELO. Only the region's leader, A, runs matching.", tween: 2200 },
        { caption: "Every 500 ms the leader reads the queue and finds 10 players within ±100 ELO: a 5v5 match.", tween: 1600 },
        { caption: "It removes them with fencing token 42: one Lua script checks 42 ≥ the highest seen, then ZREMs all 10.", tween: 1800, ms: 3400 },
      ],
    },
    {
      id: "failover",
      label: "Leader failover",
      steps: [
        { caption: "Leader A holds /matchmaker/na/leader with a 10 s etcd lease, refreshed every 3.3 s. Its fencing token is 42.", tween: 1600 },
        { caption: "A stalls; its keepalives stop. After 10 s the lease expires and B is elected with a higher token, 43.", tween: 2400 },
        { caption: "B removes the next 10 players with token 43, so Redis now records 43 as the highest token.", tween: 1800 },
        { caption: "A wakes, still thinking it leads, and removes with token 42. 42 < 43: the script rejects it.", tween: 2200, ms: 3600 },
      ],
    },
  ],
  Scene,
});
