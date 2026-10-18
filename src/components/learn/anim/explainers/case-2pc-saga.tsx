/**
 * Case file "The Great Travel Booking Disaster" (WonderTravel): Book Everything across Flight
 * (US-East), Hotel (Europe) and Car (Asia-Pacific). 2PC: PREPARE locks all three, the coordinator
 * crashes at 12:15 AM and everything stays locked. Saga: each service commits locally and
 * publishes an event; when the car fails, the hotel and the flight are cancelled in reverse.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 342;
const CO = { x: 220, y: 30, w: 160, h: 62 };
const SY = 206;
const SW = 168;
const SH = 76;
const SX = [16, 216, 416];
const SVC = [
  { name: "Flight", region: "US-East", item: "JFK→NRT", short: "JFK→NRT" },
  { name: "Hotel", region: "Europe", item: "Tokyo room", short: "Tokyo" },
  { name: "Car", region: "Asia-Pacific", item: "Camry", short: "Camry" },
];

type St = { text: string; tone: Tone };

function Scene({ variant, step, t, narrow }: SceneProps) {
  const saga = variant === "saga";
  const st: St[] = SVC.map(() => ({ text: "", tone: undefined }));
  const toks: { x: number; y: number; tone: Tone; label?: string }[] = [];
  const top = (i: number) => ({ x: SX[i] + SW / 2, y: SY });
  const coB = (i: number) => ({ x: CO.x + 40 + i * 40, y: CO.y + CO.h });
  const along = (a: { x: number; y: number }, b: { x: number; y: number }, p: number) => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });
  let coTone: Tone = "lit";
  let coSub = saga ? "no coordinator" : "Coordinator";
  let banner: St | null = null;
  if (!saga) {
    if (step === 0) {
      SVC.forEach((_, i) => {
        const p = seg(t, i * 0.12, 0.6 + i * 0.12);
        if (p > 0 && p < 1) toks.push({ ...along(coB(i), top(i), p), tone: "lit", label: i === 0 && !narrow ? "PREPARE" : undefined });
        st[i] = p >= 1 ? { text: "reserving", tone: "warn" } : { text: "", tone: undefined };
      });
      coSub = "PREPARE";
    } else if (step === 1) {
      SVC.forEach((_, i) => {
        const p = seg(t, i * 0.12, 0.6 + i * 0.12);
        if (p > 0 && p < 1) toks.push({ ...along(top(i), coB(i), p), tone: "warn", label: i === 0 && !narrow ? "PREPARED" : undefined });
        st[i] = { text: "LOCKED", tone: "warn" };
      });
      coSub = t > 0.9 ? "3 / 3 PREPARED" : "waiting…";
    } else {
      SVC.forEach((_, i) => (st[i] = { text: "LOCKED", tone: step === 3 ? "bad" : "warn" }));
      coTone = "bad";
      coSub = "CRASHED";
      banner = step === 2 ? { text: narrow ? "12:15 AM · no COMMIT" : "12:15 AM · coordinator gone before COMMIT", tone: "bad" } : { text: narrow ? "2,000 stuck · 4 h unlock" : "2,000 stuck · 6,000 items · 4 h manual unlock", tone: "bad" };
    }
  } else {
    coTone = undefined;
    const done = (i: number) => (st[i] = { text: narrow ? "booked ✓" : "committed ✓", tone: "ok" });
    if (step === 0) {
      if (t > 0.5) done(0);
      else st[0] = { text: "booking…", tone: "lit" };
    } else if (step === 1) {
      done(0);
      if (t > 0.5) done(1);
      else st[1] = { text: "booking…", tone: "lit" };
    } else if (step === 2) {
      done(0);
      done(1);
      st[2] = t > 0.4 ? { text: "failed ✗", tone: "bad" } : { text: "booking…", tone: "lit" };
    } else {
      st[2] = { text: "failed ✗", tone: "bad" };
      st[1] = t > 0.4 ? { text: "cancelled", tone: "warn" } : { text: narrow ? "booked ✓" : "committed ✓", tone: "ok" };
      st[0] = t > 0.85 ? { text: "cancelled", tone: "warn" } : { text: narrow ? "booked ✓" : "committed ✓", tone: "ok" };
      if (t >= 1) banner = { text: narrow ? "self-healed · no locks" : "self-healed · nothing locked, nothing half-booked", tone: "ok" };
    }
  }
  // saga events travel on the event line under the coordinator
  const EV = 150;
  const evs: { from: number; to: number; p: number; label: string; tone: Tone }[] = [];
  if (saga) {
    if (step === 0) evs.push({ from: 0, to: 1, p: seg(t, 0.55, 1), label: "FlightBooked", tone: "ok" });
    if (step === 1) evs.push({ from: 1, to: 2, p: seg(t, 0.55, 1), label: "HotelBooked", tone: "ok" });
    if (step === 2) evs.push({ from: 2, to: 1, p: seg(t, 0.5, 1), label: "CarBookingFailed", tone: "bad" });
    if (step === 3) {
      evs.push({ from: 1, to: 0, p: seg(t, 0.45, 0.85), label: "HotelCancelled", tone: "warn" });
    }
  }
  const lastEvent = saga ? ["FlightBooked", "HotelBooked", "CarBookingFailed", t > 0.85 ? "FlightCancelled" : "HotelCancelled"][step] : "";
  return (
    <g>
      {!saga ? (
        <>
          <Box x={CO.x} y={CO.y} w={CO.w} h={CO.h} label={coTone === "bad" ? (narrow ? "Coord. ✗" : "Coordinator ✗") : "Coordinator"} sub={coSub === "Coordinator" ? "2PC" : coSub} tone={coTone} />
          {SVC.map((_, i) => (
            <Wire key={i} d={`M${coB(i).x} ${coB(i).y}C${coB(i).x} ${CO.y + CO.h + 50} ${top(i).x} ${SY - 50} ${top(i).x} ${SY}`} dash={coTone === "bad"} tone={coTone === "bad" ? "mute" : undefined} />
          ))}
        </>
      ) : (
        <>
          <Txt x={W / 2} y={44} k="k">
            {narrow ? "local commits + events" : "each step commits locally · services talk in events"}
          </Txt>
          <line x1={SX[0] + SW / 2} x2={SX[2] + SW / 2} y1={EV} y2={EV} className="sg-bus" />
          <Txt x={W / 2} y={EV - 12} k="s" tone="mute">
            event stream
          </Txt>
          {SVC.map((_, i) => (
            <line key={i} x1={SX[i] + SW / 2} x2={SX[i] + SW / 2} y1={EV} y2={SY} className="sg-bus" />
          ))}
          {lastEvent && (
            <Txt x={W / 2} y={EV + 30} k="s" tone={step === 2 ? "bad" : step === 3 ? "warn" : "ok"}>
              {lastEvent}
            </Txt>
          )}
          {evs
            .filter((e) => e.p > 0 && e.p < 1)
            .map((e, i) => (
              <Token key={i} x={lerp(SX[e.from] + SW / 2, SX[e.to] + SW / 2, e.p)} y={EV} s={12} tone={e.tone} />
            ))}
        </>
      )}
      {SVC.map((s, i) => (
        <g key={s.name}>
          <Box x={SX[i]} y={SY} w={SW} h={SH} label={s.name} sub={narrow ? s.short : `${s.region} · ${s.item}`} tone={st[i].tone} />
          <Txt x={SX[i] + SW / 2} y={SY + SH + 22} k="s" tone={st[i].tone}>
            {st[i].text}
          </Txt>
        </g>
      ))}
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={11} tone={k.tone} label={k.label} />
      ))}
      {banner && (
        <Txt x={W / 2} y={H - 10} k="k" tone={banner.tone}>
          {banner.text}
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.sg-bus{stroke:var(--ax-line);stroke-width:1.5;stroke-dasharray:5 6}`,
  variants: [
    {
      id: "2pc",
      label: "2PC",
      steps: [
        { caption: "Phase 1, PREPARE: the coordinator asks Flight, Hotel and Car to reserve the seat, the Tokyo room and the Camry.", tween: 1800, ms: 2400 },
        { caption: "All three answer PREPARED, and each keeps its resource locked until the coordinator decides.", tween: 1600, ms: 2600 },
        { caption: "12:15 AM: the coordinator crashes before sending COMMIT. Seats, rooms and cars stay locked, waiting.", tween: 1000, ms: 3000 },
        { caption: "2,000 transactions stuck in prepared state: 6,000 items unusable and 4 hours of manual unlocking.", tween: 900, ms: 3600 },
      ],
    },
    {
      id: "saga",
      label: "Saga",
      steps: [
        { caption: "Saga: Flight books in its own local transaction, commits at once and publishes FlightBooked.", tween: 1600, ms: 2400 },
        { caption: "Hotel books and publishes HotelBooked. No lock is held across services.", tween: 1600, ms: 2400 },
        { caption: "The car booking fails: CarBookingFailed. Instead of waiting, the saga undoes what already committed.", tween: 1600, ms: 2800 },
        { caption: "Compensations run in reverse: cancel the hotel, then the flight. Nothing stays locked or half-booked.", tween: 2400, ms: 3600 },
      ],
    },
  ],
  Scene,
});
