/**
 * S3 erasure coding (side quest 8 · Deep Dive 1 / PUT flow / edge case 1): a 1 MB object is
 * Reed-Solomon encoded into 10 data + 6 parity shards (~100 KB each), placed at most 6 per AZ
 * (AZ-1: D1 D4 D7 P1 P4 D10 · AZ-2: D2 D5 D8 P2 P5 · AZ-3: D3 D6 D9 P3 P6), 1.6× overhead, and
 * bracketed before 200 OK. Losing AZ-1 leaves 10 of 16: a GET still decodes, and the repair
 * service rebuilds the 6 lost shards.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 296;
type Pt = { x: number; y: number };
const NAMES = ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "P1", "P2", "P3", "P4", "P5", "P6"];
const AZS = [
  ["D1", "D4", "D7", "P1", "P4", "D10"],
  ["D2", "D5", "D8", "P2", "P5"],
  ["D3", "D6", "D9", "P3", "P6"],
];
const AZX = [24, 212, 400];
const AZW = 176;
const AZY = 160;
const S = 30;
const strip = (i: number): Pt => ({ x: 24 + i * 34, y: 100 });
const where = NAMES.map((n) => {
  const az = AZS.findIndex((a) => a.includes(n));
  const slot = AZS[az].indexOf(n);
  return { az, pt: { x: AZX[az] + 25 + (slot % 3) * 48, y: AZY + 32 + Math.floor(slot / 3) * 42 } };
});
const ENC: Pt = { x: 300, y: 76 };
const lost = (i: number) => where[i].az === 0;

type Sh = { pt: Pt; o: number; tone: Tone; x?: boolean };
type Frame = { shards: Sh[]; toks: { from: Pt; to: Pt; p: number; tone: Tone }[]; rebuilt: number[]; obj: string; objT?: Tone; enc: string; encL: string; encT?: Tone; az1Down: boolean; read: string; readSub: string; readT?: Tone; objTok?: number };

const baseTone = (i: number): Tone => (i < 10 ? "lit" : "sky");
const center = (p: Pt): Pt => ({ x: p.x + S / 2, y: p.y + S / 2 });

function frame(variant: string, step: number, t: number): Frame {
  const placed = (i: number): Sh => ({ pt: where[i].pt, o: 1, tone: baseTone(i) });
  if (variant === "put") {
    if (step === 0)
      return {
        shards: NAMES.map((_, i) => {
          const p = ease(seg(t, 0.32 + i * 0.03, 0.52 + i * 0.03));
          return { pt: { x: lerp(ENC.x - S / 2, strip(i).x, p), y: lerp(ENC.y, strip(i).y, p) }, o: p > 0 ? 1 : 0, tone: baseTone(i) };
        }),
        toks: [],
        objTok: seg(t, 0, 0.3),
        rebuilt: [],
        obj: "PUT",
        enc: t > 0.3 ? "10 + 6" : "RS 10+6",
        encL: "Encode",
        encT: t > 0.3 && t < 1 ? "lit" : undefined,
        az1Down: false,
        read: "16 shards",
        readSub: "~100 KB each",
      };
    if (step === 1)
      return {
        shards: NAMES.map((_, i) => {
          const p = ease(seg(t, i * 0.04, i * 0.04 + 0.36));
          return { pt: { x: lerp(strip(i).x, where[i].pt.x, p), y: lerp(strip(i).y, where[i].pt.y, p) }, o: 1, tone: baseTone(i) };
        }),
        toks: [],
        rebuilt: [],
        obj: "PUT",
        enc: "10 + 6",
        encL: "Encode",
        az1Down: false,
        read: t > 0.5 ? "1.6×" : "16 shards",
        readSub: t > 0.5 ? "16 ÷ 10, not 3×" : "~100 KB each",
      };
    return {
      shards: NAMES.map((_, i) => placed(i)),
      toks: NAMES.map((_, i) => ({ from: center(where[i].pt), to: ENC, p: seg(t, i * 0.015, 0.45 + i * 0.015), tone: "ok" as Tone })),
      rebuilt: [],
      obj: t >= 0.85 ? "200 OK" : "PUT",
      objT: t >= 0.85 ? "ok" : undefined,
      enc: t >= 0.7 ? "checksum ✓" : "decode test",
      encL: "Verify",
      encT: t >= 0.7 ? "ok" : "lit",
      az1Down: false,
      read: "1.6×",
      readSub: "16 ÷ 10, not 3×",
    };
  }
  // lose an AZ
  if (step === 0)
    return {
      shards: NAMES.map((_, i) => (lost(i) ? { pt: where[i].pt, o: lerp(1, 0.25, seg(t, 0.2, 0.7)), tone: "bad", x: t > 0.5 } : placed(i))),
      toks: [],
      rebuilt: [],
      obj: "1 MB object",
      enc: "RS 10+6",
      encL: "Decode",
      az1Down: t > 0.2,
      read: t > 0.5 ? "10 / 16" : "16 / 16",
      readSub: "shards readable",
      readT: t > 0.5 ? "warn" : undefined,
    };
  const dead = (i: number): Sh => ({ pt: where[i].pt, o: 0.25, tone: "bad", x: true });
  if (step === 1)
    return {
      shards: NAMES.map((_, i) => (lost(i) ? dead(i) : placed(i))),
      toks: NAMES.map((_, i) => i)
        .filter((i) => !lost(i))
        .map((i, k) => ({ from: center(where[i].pt), to: ENC, p: seg(t, k * 0.02, 0.45 + k * 0.02), tone: "ok" as Tone })),
      rebuilt: [],
      obj: t >= 0.8 ? "rebuilt ✓" : "GET",
      objT: t >= 0.8 ? "ok" : undefined,
      enc: t >= 0.6 ? "any 10 of 16" : "checksums",
      encL: "Decode",
      encT: t >= 0.6 ? "ok" : "lit",
      az1Down: true,
      read: "10 / 16",
      readSub: "shards readable",
      readT: "warn",
    };
  const lostIdx = NAMES.map((_, i) => i).filter(lost);
  return {
    shards: NAMES.map((_, i) => (lost(i) ? dead(i) : placed(i))),
    toks: lostIdx.map((i, k) => ({ from: ENC, to: center(strip(i)), p: seg(t, 0.25 + k * 0.08, 0.5 + k * 0.08), tone: "lit" as Tone })),
    rebuilt: lostIdx.filter((_, k) => t >= 0.5 + k * 0.08),
    obj: "1 MB object",
    enc: t >= 1 ? "6 rebuilt" : "rebuilding",
    encL: "Repair",
    encT: t >= 1 ? "ok" : "lit",
    az1Down: true,
    read: t >= 1 ? "16 / 16" : "10 / 16",
    readSub: t >= 1 ? "redundancy restored" : "no spare shards",
    readT: t >= 1 ? "ok" : "bad",
  };
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = frame(variant, step, t);
  const put = variant === "put";
  return (
    <g>
      <Box x={24} y={20} w={124} h={56} label={narrow ? "1 MB" : "1 MB object"} sub={f.obj === "1 MB object" ? (put ? "PUT" : "stored") : f.obj} tone={f.objT} />
      <Box x={238} y={20} w={124} h={56} label={f.encL} sub={f.enc} tone={f.encT} />
      <path className="ax-wire" d={`M148 48H238`} />
      {f.objTok !== undefined && f.objTok > 0 && f.objTok < 1 && <Token x={lerp(148, 238, f.objTok)} y={48} s={11} />}
      {!narrow && (
        <Txt x={W - 24} y={30} k="k" anchor="end" tone="mute">
          {put ? "storage" : "durability"}
        </Txt>
      )}
      <Txt x={W - 24} y={narrow ? 60 : 66} k="d" anchor="end" tone={f.readT}>
        {f.read}
      </Txt>
      <Txt x={W - 24} y={88} k="s" anchor="end" tone={f.readT}>
        {f.readSub}
      </Txt>
      {/* the three AZs */}
      {AZX.map((x, a) => {
        const down = a === 0 && f.az1Down;
        return (
          <g key={a}>
            <rect className={down ? "sq-az down" : "sq-az"} x={x} y={AZY} width={AZW} height={124} />
            <Txt x={x + 12} y={AZY + 20} k="k" anchor="start" tone={down ? "bad" : "mute"}>
              {`AZ-${a + 1}`}
            </Txt>
            <Txt x={x + AZW - 12} y={AZY + 20} k="s" anchor="end" tone={down ? "bad" : "mute"}>
              {down ? (narrow ? "down" : "power lost") : `${AZS[a].length} shards`}
            </Txt>
          </g>
        );
      })}
      {put && step === 0 && (
        <Txt x={24} y={150} k="s" anchor="start" tone="mute">
          {narrow ? "D data · P parity" : "D = data shard · P = parity shard"}
        </Txt>
      )}
      {f.rebuilt.length > 0 && (
        <Txt x={24} y={146} k="s" anchor="start" tone="lit">
          {narrow ? "rebuilt elsewhere" : "rebuilt on healthy drives, in parallel"}
        </Txt>
      )}
      {f.rebuilt.map((i) => (
        <g key={`r${i}`}>
          <rect className="ax-box lit" x={strip(i).x} y={strip(i).y} width={S} height={S} />
          <text className="ax-s sq-sh" x={strip(i).x + S / 2} y={strip(i).y + S / 2 + 4} textAnchor="middle">
            {NAMES[i]}
          </text>
        </g>
      ))}
      {f.shards.map((s, i) => (
        <g key={i} opacity={s.o}>
          <rect className={`ax-box ${s.tone || ""}`} x={s.pt.x} y={s.pt.y} width={S} height={S} />
          <text className="ax-s sq-sh" x={s.pt.x + S / 2} y={s.pt.y + S / 2 + 4} textAnchor="middle">
            {NAMES[i]}
          </text>
          {s.x && <path className="sq-x" d={`M${s.pt.x + 4} ${s.pt.y + 4}L${s.pt.x + S - 4} ${s.pt.y + S - 4}M${s.pt.x + S - 4} ${s.pt.y + 4}L${s.pt.x + 4} ${s.pt.y + S - 4}`} />}
        </g>
      ))}
      {f.toks
        .filter((k) => k.p > 0 && k.p < 1)
        .map((k, i) => (
          <Token key={i} x={lerp(k.from.x, k.to.x, k.p)} y={lerp(k.from.y, k.to.y, k.p)} s={8} tone={k.tone} />
        ))}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.sq-az{fill:none;stroke:var(--ax-line);stroke-width:1.5}.sq-az.down{stroke:var(--ax-bad);stroke-dasharray:6 5}
.sq-sh{fill:var(--ax-fg)}
.sq-x{fill:none;stroke:var(--ax-bad);stroke-width:2.5}
@container ax (max-width:520px){.sq-sh{font-size:14px}}`,
  variants: [
    {
      id: "put",
      label: "Write",
      steps: [
        { caption: "PUT a 1 MB object: Reed-Solomon splits it into 10 data shards (~100 KB each) and computes 6 parity shards.", tween: 2200 },
        { caption: "The 16 shards spread across three AZs, at most 6 per AZ (6, 5, 5). Storage cost: 1.6×, not 3×.", tween: 2400 },
        { caption: "Bracketing: before the 200 OK, S3 checks the shards decode back to the original checksum, then commits the index.", tween: 2200, ms: 3400 },
      ],
    },
    {
      id: "az",
      label: "Lose an AZ",
      steps: [
        { caption: "AZ-1 loses power: its 6 shards (D1, D4, D7, D10, P1, P4) are unreachable. 10 of 16 remain.", tween: 1800 },
        { caption: "A GET reads the 10 surviving shards, verifies their checksums, and Reed-Solomon rebuilds the 1 MB object.", tween: 2200 },
        { caption: "No spare shards left, so the repair service rebuilds the 6 lost ones on healthy drives. Repair speed is durability.", tween: 2600, ms: 3600 },
      ],
    },
  ],
  Scene,
});
