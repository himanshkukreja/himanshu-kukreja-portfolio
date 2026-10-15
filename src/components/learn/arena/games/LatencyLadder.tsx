"use client";

/**
 * Latency Ladder: five operations, shuffled; tap them fastest → slowest. Numbers are the course's own
 * table (W00 · Part 3 · "latency numbers every engineer should know"). Ladders keep coming until the
 * 90 s clock runs out. +20 per rung in the right place, +30 for a perfect ladder.
 */
import { useMemo, useState } from "react";
import { PRACTICE_GAMES } from "@/lib/learn/arena/games";
import { rng, shuffled } from "@/lib/learn/arena/shared";
import GameShell, { type BoardApi } from "./GameShell";
import { BTN, BTN_GHOST } from "../ui";

type Op = { id: string; label: string; ns: number; human: string };

export const LATENCY: Op[] = [
  { id: "l1", label: "L1 cache reference", ns: 0.5, human: "0.5 ns" },
  { id: "branch", label: "Branch mispredict", ns: 5, human: "5 ns" },
  { id: "l2", label: "L2 cache reference", ns: 7, human: "7 ns" },
  { id: "mutex", label: "Mutex lock / unlock", ns: 25, human: "25 ns" },
  { id: "mem", label: "Main memory reference", ns: 100, human: "100 ns" },
  { id: "snappy", label: "Compress 1 KB with Snappy", ns: 3_000, human: "3 µs" },
  { id: "net1k", label: "Send 1 KB over a 1 Gbps network", ns: 10_000, human: "10 µs" },
  { id: "ssd4k", label: "Read 4 KB randomly from SSD", ns: 150_000, human: "150 µs" },
  { id: "mem1m", label: "Read 1 MB sequentially from memory", ns: 250_000, human: "250 µs" },
  { id: "dc", label: "Round trip within the same datacenter", ns: 500_000, human: "0.5 ms" },
  { id: "ssd1m", label: "Read 1 MB sequentially from SSD", ns: 1_000_000, human: "1 ms" },
  { id: "seek", label: "HDD disk seek", ns: 10_000_000, human: "10 ms" },
  { id: "hdd1m", label: "Read 1 MB sequentially from HDD", ns: 20_000_000, human: "20 ms" },
  { id: "wan", label: "Packet round trip, California → Netherlands → California", ns: 150_000_000, human: "150 ms" },
];

const GAME = PRACTICE_GAMES.find((g) => g.id === "arena:latency")!;
const RUNG = 20;
const PERFECT = 30;
const SIZE = 5;

/** Five ops at least 2× apart (fair to order), shuffled. */
function deal(seed: number): Op[] {
  const rand = rng(seed);
  for (let attempt = 0; attempt < 50; attempt++) {
    const pick: Op[] = [];
    for (const op of shuffled(LATENCY, rand)) {
      if (pick.every((p) => Math.max(p.ns, op.ns) / Math.min(p.ns, op.ns) >= 2)) pick.push(op);
      if (pick.length === SIZE) break;
    }
    if (pick.length === SIZE) return shuffled(pick, rand);
  }
  return LATENCY.filter((_, i) => i % 3 === 0).slice(0, SIZE);
}

function Board({ api }: { api: BoardApi }) {
  const [n, setN] = useState(0);
  const [seedBase] = useState(() => Math.random() * 1e9);
  const cards = useMemo(() => deal(api.round * 7919 + n * 104729 + Math.floor(seedBase)), [api.round, n, seedBase]);
  const [placed, setPlaced] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const order = useMemo(() => cards.slice().sort((a, b) => a.ns - b.ns), [cards]);

  const place = (id: string) => {
    if (checked || !api.running) return;
    setPlaced((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const check = () => {
    if (placed.length !== SIZE || checked) return;
    const right = placed.filter((id, i) => order[i].id === id).length;
    api.addScore(right * RUNG + (right === SIZE ? PERFECT : 0), right === SIZE ? "perfect ladder" : `${right} of ${SIZE} rungs right`);
    setChecked(true);
  };

  const nextLadder = () => {
    setPlaced([]);
    setChecked(false);
    setN((x) => x + 1);
  };

  const byId = (id: string) => cards.find((c) => c.id === id)!;
  const right = checked ? placed.filter((id, i) => order[i].id === id).length : 0;

  return (
    <section aria-label={`Ladder ${n + 1}`} className="flex flex-col gap-4">
      <p className="m-0 text-[15px] text-fg-2">
        Ladder {n + 1}. Tap the operations from <b className="text-fg">fastest</b> to <b className="text-fg">slowest</b>. Tap a placed one to take it back.
      </p>

      <ol className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Your ladder, fastest first">
        {Array.from({ length: SIZE }, (_, i) => {
          const id = placed[i];
          const op = id ? byId(id) : null;
          const ok = checked && op ? order[i].id === op.id : null;
          return (
            <li key={i} className="flex items-stretch gap-2">
              <span className="grid w-9 shrink-0 place-items-center border border-line font-mono text-xs text-fg-3">{i + 1}</span>
              {op ? (
                <button
                  type="button"
                  onClick={() => place(op.id)}
                  disabled={checked}
                  aria-label={`${op.label}, rung ${i + 1}${checked ? (ok ? ", correct" : `, wrong, should be ${order[i].label}`) : ". Tap to take back"}`}
                  className={`flex min-h-12 flex-1 items-center justify-between gap-3 border px-3 py-2 text-left text-[15px] text-fg ${
                    ok === null ? "border-line-strong bg-surface-2" : ok ? "border-ok bg-ok/10 motion-safe:animate-[sd-arena-pop_0.25s_ease-out]" : "border-bad bg-bad/10 motion-safe:animate-[sd-arena-shake_0.42s_ease-in-out]"
                  }`}
                >
                  <span className="min-w-0">{op.label}</span>
                  {checked && <span className="shrink-0 font-mono text-xs text-fg-2">{op.human}</span>}
                </button>
              ) : (
                <span className="flex min-h-12 flex-1 items-center border border-dashed border-line px-3 font-mono text-xs text-fg-4">{i === 0 ? "fastest" : i === SIZE - 1 ? "slowest" : "·"}</span>
              )}
            </li>
          );
        })}
      </ol>

      {!checked ? (
        <>
          <ul className="m-0 grid list-none grid-cols-1 gap-1.5 p-0 sm:grid-cols-2" aria-label="Operations to place">
            {cards
              .filter((c) => !placed.includes(c.id))
              .map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => place(c.id)}
                    disabled={!api.running}
                    className="flex min-h-12 w-full items-center border border-line bg-surface px-3 py-2 text-left text-[15px] text-fg hover:border-signal"
                  >
                    {c.label}
                  </button>
                </li>
              ))}
          </ul>
          <button type="button" onClick={check} disabled={placed.length !== SIZE} className={`${BTN} self-start`}>
            Lock it in
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-3 border border-line bg-surface p-4" aria-live="polite">
          <p className="m-0 font-mono text-sm font-semibold text-fg">
            {right === SIZE ? `Perfect ladder · +${SIZE * RUNG + PERFECT}` : `${right}/${SIZE} rungs · +${right * RUNG}`}
          </p>
          <ol className="m-0 flex list-none flex-col gap-1 p-0 font-mono text-xs text-fg-2">
            {order.map((o, i) => (
              <li key={o.id} className="flex justify-between gap-3">
                <span>
                  {i + 1}. {o.label}
                </span>
                <span className="shrink-0 text-fg">{o.human}</span>
              </li>
            ))}
          </ol>
          <button type="button" onClick={nextLadder} className={`${BTN_GHOST} self-start`} autoFocus>
            Next ladder →
          </button>
        </div>
      )}
    </section>
  );
}

export default function LatencyLadder() {
  return (
    <GameShell
      game={GAME}
      seconds={GAME.seconds || 90}
      rules={
        <ul className="m-0 grid list-none gap-1.5 p-0">
          <li>■ Five operations per ladder. Tap them fastest first.</li>
          <li>■ +{RUNG} per rung in the right place, +{PERFECT} for a perfect ladder.</li>
          <li>■ As many ladders as you can in {GAME.seconds} seconds.</li>
          <li>■ The numbers are the course&apos;s own table: orders of magnitude, not benchmarks.</li>
        </ul>
      }
      Board={Board}
    />
  );
}
