"use client";

import { useState } from "react";
import { BTN_GHOST, BTN_INVERT, type GameProps } from "./shared";

type Name = "A" | "B";
type Thread = { pc: number; local: number | "–"; done: boolean; out: string };
/** m1: mission 1 (double-book without the lock) done this session. contended: a thread hit the lock this round. */
type S = { seats: number; lock: boolean; holder: Name | ""; A: Thread; B: Thread; sold: Name[]; msg: string; m1: boolean; contended: boolean };

const FRESH: Thread = { pc: 0, local: "–", done: false, out: "" };
const STEPS = ["SELECT seats_left", "IF seats_left > 0", "UPDATE seats_left = local − 1", "charge card ₹1,245"];

const INITIAL: S = {
  seats: 1,
  lock: false,
  holder: "",
  A: FRESH,
  B: FRESH,
  sold: [],
  msg: "Two people hit “Book” for the last seat. You are the scheduler: step the threads in any order.",
  m1: false,
  contended: false,
};

export default function RaceCondition({ onWin }: GameProps) {
  const [s, setS] = useState<S>(INITIAL);

  const runStep = (name: Name) => {
    const T: Thread = { ...s[name] };
    if (T.done) return;
    const other: Name = name === "A" ? "B" : "A";
    let seats = s.seats;
    let holder = s.holder;
    const sold = s.sold.slice();
    let msg = "";

    if (T.pc === 0) {
      if (s.lock && holder && holder !== name) {
        setS({ ...s, contended: true, msg: `Thread ${name} is waiting: thread ${holder} holds the row lock.` });
        return;
      }
      if (s.lock) holder = name;
      T.local = seats;
      msg = `${name} read seats_left = ${seats}${s.lock ? " and locked the row." : "."}`;
    } else if (T.pc === 1) {
      if (typeof T.local === "number" && T.local <= 0) {
        T.done = true;
        T.out = "sold out";
        if (holder === name) holder = "";
        msg = `${name} sees 0 seats and shows “sold out”.`;
      } else msg = `${name} thinks a seat is free.`;
    } else if (T.pc === 2) {
      seats = (typeof T.local === "number" ? T.local : seats) - 1;
      msg = `${name} wrote seats_left = ${seats}.`;
    } else if (T.pc === 3) {
      sold.push(name);
      T.done = true;
      T.out = "paid";
      if (holder === name) holder = "";
      msg = `${name} charged the card. Ticket issued.`;
    }
    if (!T.done) T.pc += 1;

    const bothDone = T.done && s[other].done;
    let won = false;
    let m1 = s.m1;
    if (bothDone) {
      if (sold.length === 2) {
        m1 = true;
        msg = "DOUBLE BOOKED. seats_left is 0, but two people paid for one berth. Mission 1 done. Now turn on the row lock and run the same interleaving.";
      } else if (s.lock && !s.m1) {
        msg = "One sale, but you haven't broken it yet. Mission 1 first: turn the lock off and get both threads to pay.";
      } else if (s.lock && !s.contended) {
        msg = "One sale, but you ran the threads one after the other: that never races. Interleave them again (step B while A is mid-booking) and watch the lock hold.";
      } else if (s.lock) {
        msg = "Same interleaving, one ticket: B had to wait for A's row lock, then read 0. The lock made read-check-write atomic. Cleared.";
        won = true;
      } else {
        msg = "Only one sale this time. Interleave the reads so both threads see seats_left = 1.";
      }
    }
    setS({ ...s, [name]: T, seats, holder, sold, msg, m1 });
    if (won) onWin(1, "both missions");
  };

  const toggleLock = () =>
    setS({
      ...INITIAL,
      m1: s.m1,
      lock: !s.lock,
      msg: !s.lock ? "Lock on. Try to double-book now." : "Lock off. Chaos allowed.",
    });

  const reset = () => setS({ ...INITIAL, m1: s.m1, lock: s.lock, msg: "Seat restored. Go again." });

  const doubled = s.sold.length === 2;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[13px] text-fg-3">
          train 12951 · coach B2 · seats_left = <span className="text-lg font-semibold text-fg">{s.seats}</span>
        </span>
        <button
          type="button"
          onClick={toggleLock}
          aria-pressed={s.lock}
          className={`min-h-11 border px-3.5 font-mono text-[13px] ${
            s.lock ? "border-signal bg-signal text-on-signal" : "border-line-strong bg-transparent text-fg hover:bg-surface-2"
          }`}
        >
          {s.lock ? "SELECT … FOR UPDATE: on" : "row lock: off"}
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3">
        {(["A", "B"] as Name[]).map((name) => {
          const T = s[name];
          return (
            <div key={name} className="flex flex-col gap-2 border border-line-strong bg-bg p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono font-semibold text-fg">
                  thread {name}
                  {name === "A" ? " · Ananya" : " · a bot"}
                </span>
                <span className="font-mono text-xs text-fg-3">local = {T.local}</span>
              </div>
              <ol className="flex flex-col">
                {STEPS.map((t, k) => {
                  const ticked = k < T.pc || (T.done && k <= T.pc);
                  const current = k === T.pc && !T.done;
                  return (
                    <li
                      key={t}
                      aria-current={current ? "step" : undefined}
                      className={`whitespace-pre-wrap px-2 py-1.5 font-mono text-[13px] ${
                        current ? "bg-surface-2 text-signal-text" : k < T.pc ? "text-fg" : "text-fg-4"
                      }`}
                    >
                      {ticked ? "✓ " : current ? "▶ " : "  "}
                      {t}
                    </li>
                  );
                })}
              </ol>
              <button
                type="button"
                onClick={() => runStep(name)}
                disabled={T.done}
                className={`${BTN_INVERT} mt-1 min-h-11`}
              >
                {T.done ? T.out : `step ${name}`}
              </button>
            </div>
          );
        })}
      </div>

      <div
        aria-live="polite"
        className={`px-3.5 py-3 text-[15px] leading-normal ${
          doubled ? "bg-bad font-semibold text-[#000]" : "border border-line bg-bg text-fg"
        }`}
      >
        {s.msg}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={reset} className={`${BTN_GHOST} min-h-11`}>
          reset seat to 1
        </button>
        <span className="font-mono text-xs text-fg-3">
          mission 1 (double-book) {s.m1 ? "✓" : "·"} · mission 2 (lock holds under a race) {s.lock ? "armed" : "·"}
        </span>
      </div>
    </>
  );
}
