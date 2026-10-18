/**
 * Case file "The Tatkal Gamble": at 10:00:00 ~2,000,000 people press Book Now for ~500 seats. A
 * bouncer counter that starts at 500 says yes ~500 times and an instant no to everyone else; each
 * yes becomes a 5-minute seat hold that either turns into a booking or expires back into the pool.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const BOUNCER = { x: 200, y: 116, w: 150, h: 92 };
const BOOK = { x: 420, y: 36, w: 156, h: 66 };
const NO = { x: 420, y: 222, w: 156, h: 66 };
const CROWD = 24;
const WIN = new Set([3, 9, 14, 20]); // the squares that get a yes
const home = (i: number) => ({ x: 34 + (i % 4) * 24, y: 82 + Math.floor(i / 4) * 30 });
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function Rush({ step, t, narrow }: SceneProps) {
  const e = ease(t);
  const count = step === 0 ? 500 : step === 1 ? Math.round(lerp(500, 0, seg(t, 0.1, 0.9))) : 0;
  const door = { x: BOUNCER.x - 18, y: BOUNCER.y + BOUNCER.h / 2 };
  const toks = Array.from({ length: CROWD }, (_, i) => {
    const h = home(i);
    const q = { x: door.x - (i % 4) * 7, y: door.y - 36 + Math.floor(i / 4) * 12 };
    const win = WIN.has(i);
    let p = { x: h.x, y: h.y };
    let tone: Tone = "mute";
    if (step === 0) {
      p = { x: lerp(h.x, q.x, seg(e, 0.15 + (i % 4) * 0.05, 1)), y: lerp(h.y, q.y, seg(e, 0.15, 1)) };
      tone = "warn";
    } else if (win) {
      const k = [...WIN].indexOf(i);
      const dst = { x: BOOK.x + 26 + k * 34, y: BOOK.y + BOOK.h + 16 };
      const u = step === 1 ? seg(t, 0.1 + k * 0.18, 0.3 + k * 0.18) : 1;
      p = { x: lerp(q.x, dst.x, u), y: lerp(q.y, dst.y, u) };
      tone = u > 0 ? "ok" : "warn";
    } else {
      const dst = { x: NO.x + 14 + (i % 7) * 20, y: NO.y - 42 + Math.floor(i / 7) * 9 };
      const u = step === 2 ? seg(t, 0.05 + (i / CROWD) * 0.4, 0.45 + (i / CROWD) * 0.5) : step > 2 ? 1 : 0;
      p = { x: lerp(q.x, dst.x, u), y: lerp(q.y, dst.y, u) };
      tone = u > 0 ? "bad" : "warn";
    }
    return { ...p, tone };
  });
  const kick = step === 0 ? "10:00:00" : step === 1 ? "10:00:05 · quota gone" : "10:00:10";
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start" tone={step === 2 ? "bad" : "lit"}>
        {kick}
      </Txt>
      <Txt x={24} y={64} k="s" anchor="start">
        {narrow ? "~2M people" : "~2,000,000 people"}
      </Txt>
      <rect x={BOUNCER.x} y={BOUNCER.y} width={BOUNCER.w} height={BOUNCER.h} className={`ax-box${count === 0 ? " bad" : " lit"}`} />
      <Txt x={BOUNCER.x + BOUNCER.w / 2} y={BOUNCER.y + 24}>
        Bouncer
      </Txt>
      <Txt x={BOUNCER.x + BOUNCER.w / 2} y={BOUNCER.y + 66} k="d" tone={count === 0 ? "bad" : "lit"}>
        {fmt(count)}
      </Txt>
      <Txt x={BOUNCER.x + BOUNCER.w / 2} y={BOUNCER.y + BOUNCER.h + 20} k="s">
        {narrow ? "above zero?" : "counter > 0 ?"}
      </Txt>
      <Wire d={`M${BOUNCER.x + BOUNCER.w} ${BOUNCER.y + 30}C390 ${BOUNCER.y + 30} 390 ${BOOK.y + BOOK.h / 2} ${BOOK.x} ${BOOK.y + BOOK.h / 2}`} arrow tone={step === 1 ? "ok" : undefined} />
      <Wire d={`M${BOUNCER.x + BOUNCER.w} ${BOUNCER.y + BOUNCER.h - 30}C390 ${BOUNCER.y + BOUNCER.h - 30} 390 ${NO.y + NO.h / 2} ${NO.x} ${NO.y + NO.h / 2}`} arrow tone={step >= 2 ? "bad" : undefined} />
      <Txt x={392} y={BOUNCER.y + 8} k="s" tone="ok">
        yes
      </Txt>
      <Txt x={392} y={BOUNCER.y + BOUNCER.h + 2} k="s" tone="bad">
        no
      </Txt>
      <Box x={BOOK.x} y={BOOK.y} w={BOOK.w} h={BOOK.h} label={narrow ? "Booking" : "Booking system"} sub={narrow ? "~500" : "berth · payment"} tone={step >= 1 ? "ok" : undefined} />
      <Box x={NO.x} y={NO.y} w={NO.w} h={NO.h} label="Told no" sub={step >= 2 ? (narrow ? "1,999,500" : "1,999,500 · in ms") : narrow ? "in ms" : "in milliseconds"} tone={step >= 2 ? "bad" : undefined} />
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={10} tone={k.tone} />
      ))}
    </g>
  );
}

const ROWS = [
  { y: 120, who: "Ananya" },
  { y: 222, who: "Another user" },
];
const SEAT = { x: 290, y: 40, s: 26, gap: 10 };
const seatX = (i: number) => SEAT.x + i * (SEAT.s + SEAT.gap);
const mmss = (f: number) => {
  const s = Math.round(f * 300);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Hold({ step, t, narrow }: SceneProps) {
  const e = ease(t);
  // remaining hold time (fraction of 5 minutes) for each row
  const a = step === 0 ? 1 : step === 1 ? lerp(1, 0.6, e) : 0.6;
  const b = step === 0 ? 1 : step === 1 ? lerp(1, 0.5, e) : step === 2 ? lerp(0.5, 0, seg(t, 0, 0.55)) : seg(t, 0.3, 0.8);
  const paid = step >= 1 && (step > 1 || t > 0.85);
  const expired = step === 2 && t > 0.55;
  const back = step === 2 ? seg(t, 0.6, 1) : step > 2 ? 1 : 0; // seat 2 returning to the pool
  const next = step === 3;
  const grab = next ? seg(t, 0, 0.5) : 0;
  const seatState = (i: number): string => {
    if (i === 0) return paid ? "ok" : "lit";
    if (i === 1) return next ? (grab >= 1 ? "lit" : "free") : back >= 1 ? "free" : "lit";
    return "gone";
  };
  const rowOut = [paid ? "Confirmed" : "Held", next ? (grab >= 1 ? "Held" : "…") : expired ? "Expired" : "Held"];
  const rowTone: Tone[] = [paid ? "ok" : "lit", next ? "lit" : expired ? "bad" : "lit"];
  // the seat token travelling: out to row B (start), back to pool (expiry), out again (next in line)
  const rowSeat = (r: number) => ({ x: 24 + 150 - 14, y: ROWS[r].y + 46 });
  const pool = { x: seatX(1) + SEAT.s / 2, y: SEAT.y + SEAT.s / 2 };
  const moving: { x: number; y: number; tone: Tone }[] = [];
  if (step === 0) {
    moving.push({ x: lerp(seatX(0) + SEAT.s / 2, rowSeat(0).x, seg(e, 0, 0.6)), y: lerp(pool.y, rowSeat(0).y, seg(e, 0, 0.6)), tone: "lit" });
    moving.push({ x: lerp(pool.x, rowSeat(1).x, seg(e, 0.3, 1)), y: lerp(pool.y, rowSeat(1).y, seg(e, 0.3, 1)), tone: "lit" });
  } else {
    moving.push({ ...rowSeat(0), tone: paid ? "ok" : "lit" });
    if (back > 0 && back < 1) moving.push({ x: lerp(rowSeat(1).x, pool.x, back), y: lerp(rowSeat(1).y, pool.y, back), tone: "bad" });
    else if (back === 0) moving.push({ ...rowSeat(1), tone: "lit" });
    if (next) moving.push({ x: lerp(pool.x, rowSeat(1).x, grab), y: lerp(pool.y, rowSeat(1).y, grab), tone: "lit" });
  }
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start">
        hold, then confirm
      </Txt>
      <Txt x={24} y={58} k="s" anchor="start">
        {narrow ? "seat pool" : "seat pool (Tatkal quota)"}
      </Txt>
      {Array.from({ length: 8 }, (_, i) => {
        const st = seatState(i);
        return <rect key={i} x={seatX(i)} y={SEAT.y} width={SEAT.s} height={SEAT.s} className={`tk-seat ${st}`} />;
      })}
      <Txt x={(seatX(2) + seatX(7) + SEAT.s) / 2} y={SEAT.y + SEAT.s + 18} k="s" tone="mute">
        {narrow ? "taken" : "taken by others"}
      </Txt>
      <Txt x={seatX(1) + SEAT.s / 2} y={SEAT.y + SEAT.s + 18} k="s" tone={seatState(1) === "free" ? "ok" : "mute"}>
        {seatState(1) === "free" ? "free" : ""}
      </Txt>
      {ROWS.map((r, i) => {
        const left = i === 0 ? a : b;
        const who = i === 1 && next ? "Next in line" : r.who;
        return (
          <g key={i}>
            <Box x={24} y={r.y} w={150} h={60} label={who} sub={i === 0 && step >= 1 ? (narrow ? "OTP + pay" : "OTP + payment") : "seat held"} tone={rowTone[i]} />
            <Txt x={196} y={r.y + 20} k="s" anchor="start" tone={left <= 0.001 ? "bad" : undefined}>
              {i === 0 && paid ? "paid in time" : `${mmss(left)} left`}
            </Txt>
            <Meter x={196} y={r.y + 30} w={narrow ? 200 : 220} h={12} value={left} max={1} tone={i === 0 && paid ? "ok" : left < 0.2 ? "bad" : "lit"} />
            <Box x={440} y={r.y} w={136} h={60} label={rowOut[i]} sub={i === 0 && paid ? (narrow ? "booked" : "permanent") : i === 1 && expired && !next ? (narrow ? "seat freed" : "seat → pool") : narrow ? "5 min" : "5-minute hold"} tone={rowTone[i]} dim={rowOut[i] === "…"} />
          </g>
        );
      })}
      {moving.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={12} tone={k.tone} />
      ))}
      {step === 3 && (
        <Txt x={W / 2} y={H - 8} k="k" tone="ok">
          {narrow ? "money = seats" : "money and seats always match"}
        </Txt>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "hold" ? <Hold {...p} /> : <Rush {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.tk-seat{fill:none;stroke:var(--ax-line);stroke-width:1.5}.tk-seat.lit{fill:var(--ax-accent);stroke:var(--ax-accent)}.tk-seat.ok{fill:var(--ax-ok);stroke:var(--ax-ok)}.tk-seat.free{fill:none;stroke:var(--ax-ok);stroke-width:2.5}.tk-seat.gone{fill:var(--ax-fg4);stroke:var(--ax-fg4);opacity:.45}`,
  variants: [
    {
      id: "rush",
      label: "10:00:00 rush",
      steps: [
        { caption: "10:00:00: about two million thumbs press Book Now at once. The bouncer's counter starts at 500.", tween: 1600, ms: 2600 },
        { caption: "Each yes ticks the counter down by one. Only those ~500 people reach the booking system.", tween: 2600, ms: 2800 },
        { caption: "At zero, the other 1,999,500 get an instant no, without ever touching a seat row.", tween: 2000, ms: 3600 },
      ],
    },
    {
      id: "hold",
      label: "5-minute hold",
      steps: [
        { caption: "A yes is a chance, not a ticket: one seat is held, invisible to everyone else, for five minutes.", tween: 1400, ms: 2800 },
        { caption: "Ananya verifies her OTP and pays in time, so her hold becomes a permanent booking.", tween: 1600, ms: 2800 },
        { caption: "Another hold runs out the clock: it expires automatically and the seat goes straight back to the pool.", tween: 2200, ms: 2800 },
        { caption: "The next person in line gets that seat. Money and seats always match.", tween: 1400, ms: 3600 },
      ],
    },
  ],
  Scene,
});
