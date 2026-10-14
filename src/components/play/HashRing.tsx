"use client";

import { useState } from "react";
import { BTN_GHOST, MSG_BOX, RING_MAX_LOAD, type GameProps } from "./shared";

type NodeId = "n1" | "n2" | "n3" | "n4";
type RingNode = { id: NodeId; a: number };

const SIZE = 340; // design size of the ring box; everything is positioned in % of it so it scales down
const KEYS: number[] = Array.from({ length: 24 }, (_, k) => (k * 15 + 7 + ((k * 37) % 9)) % 360);
const BASE: RingNode[] = [
  { id: "n1", a: 20 },
  { id: "n2", a: 140 },
  { id: "n3", a: 250 },
];
const CANDIDATES = [0, 45, 90, 135, 180, 225, 270, 315];

const NODE_CLASS: Record<NodeId, string> = {
  n1: "bg-fg text-bg",
  n2: "bg-signal text-on-signal",
  n3: "bg-fg-4 text-bg",
  n4: "bg-ok text-[#000]",
};

/** Each key belongs to the next node clockwise (wrapping to the first). */
function owner(angle: number, nodes: RingNode[]): NodeId {
  const sorted = nodes.slice().sort((x, y) => x.a - y.a);
  return (sorted.find((x) => x.a >= angle) || sorted[0]).id;
}

function loads(nodes: RingNode[]) {
  const counts = {} as Record<NodeId, number>;
  nodes.forEach((n) => {
    counts[n.id] = 0;
  });
  KEYS.forEach((a) => {
    counts[owner(a, nodes)] += 1;
  });
  return { counts, max: Math.max(...nodes.map((n) => counts[n.id])) };
}

/** Polar position on the ring as % of the box. */
function pos(a: number, rad: number) {
  const r = ((a - 90) * Math.PI) / 180;
  return { left: `${((SIZE / 2 + rad * Math.cos(r)) / SIZE) * 100}%`, top: `${((SIZE / 2 + rad * Math.sin(r)) / SIZE) * 100}%` };
}

let MOD_MOVED = 0;
for (let k = 0; k < 24; k++) if (k % 3 !== k % 4) MOD_MOVED++;

export default function HashRing({ onWin }: GameProps) {
  const [ring4, setRing4] = useState<number | null>(null);

  const nodes: RingNode[] = ring4 === null ? BASE : [...BASE, { id: "n4", a: ring4 }];
  const owners = KEYS.map((a) => owner(a, nodes));
  const owners3 = KEYS.map((a) => owner(a, BASE));
  const moved = owners.filter((o, k) => o !== owners3[k]).length;
  const { counts, max: maxLoad } = loads(nodes);
  const taken = ring4 !== null;

  const place = (d: number) => {
    setRing4(d);
    const { max } = loads([...BASE, { id: "n4", a: d }]);
    if (max <= RING_MAX_LOAD) onWin(max, `max load ${max}`);
  };

  const msg =
    ring4 === null
      ? "Every key is on its node. Pick a spot for node 4."
      : `Consistent hashing moved ${moved} of 24 keys (highlighted). Hash mod N would have moved ${MOD_MOVED}. Max load ${maxLoad}${
          maxLoad <= RING_MAX_LOAD ? ", balanced. Cleared." : ", still lopsided. Remove it and try another spot."
        }`;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div
        role="group"
        aria-label={`Hash ring: 24 keys, ${nodes.length} nodes`}
        className="relative aspect-square w-full max-w-[340px] shrink-0"
      >
        <span aria-hidden className="absolute inset-[8.82%] rounded-full border-2 border-line" />
        {KEYS.map((a, k) => {
          const moved1 = owners[k] !== owners3[k];
          return (
            <span
              key={k}
              aria-hidden
              style={pos(a, 140)}
              className={`pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                NODE_CLASS[owners[k]].split(" ")[0]
              } ${moved1 ? "shadow-[0_0_0_3px_rgba(61,214,140,0.35)]" : ""}`}
            />
          );
        })}
        {CANDIDATES.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => place(d)}
            disabled={taken}
            aria-label={`Place node at ${d} degrees`}
            style={pos(d, 112)}
            className="group absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center disabled:cursor-not-allowed"
          >
            <span
              className={`grid h-[26px] w-[26px] place-items-center border border-dashed bg-bg font-mono text-sm leading-none ${
                taken ? "border-line text-line" : "border-signal text-signal-text group-hover:bg-surface-2"
              }`}
            >
              +
            </span>
          </button>
        ))}
        {nodes.map((n) => (
          <span
            key={n.id}
            aria-hidden
            style={pos(n.a, 140)}
            className={`pointer-events-none absolute grid h-[34px] w-[34px] -translate-x-1/2 -translate-y-1/2 place-items-center font-mono text-[11px] font-semibold ${NODE_CLASS[n.id]}`}
          >
            {n.id}
          </span>
        ))}
        <span className="pointer-events-none absolute left-1/2 top-1/2 w-[150px] -translate-x-1/2 -translate-y-1/2 text-center font-mono text-xs text-fg-3">
          24 keys
          <br />
          {nodes.length} nodes
        </span>
      </div>

      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2.5">
        <span className="text-[15px] leading-normal text-fg">
          Traffic doubled. Add a 4th cache node by clicking a <span className="text-signal-text">+</span> on the ring. Each key
          belongs to the next node clockwise.
        </span>
        <ul className="flex flex-col gap-2.5" aria-label="Keys per node">
          {nodes.map((n) => (
            <li key={n.id} className="flex items-center gap-2.5">
              <span aria-hidden className={`h-3 w-3 shrink-0 ${NODE_CLASS[n.id].split(" ")[0]}`} />
              <span className="w-14 font-mono text-[13px]">{n.id}</span>
              <span aria-hidden className="h-2.5 flex-grow bg-surface-2">
                <span
                  className={`block h-2.5 ${NODE_CLASS[n.id].split(" ")[0]}`}
                  style={{ width: `${Math.round((counts[n.id] / 12) * 100)}%` }}
                />
              </span>
              <span className="w-7 text-right font-mono text-[13px]">
                {counts[n.id]}
                <span className="sr-only"> keys</span>
              </span>
            </li>
          ))}
        </ul>
        <div className={`${MSG_BOX} text-sm leading-[1.55]`} aria-live="polite">
          {msg}
        </div>
        <button type="button" onClick={() => setRing4(null)} disabled={!taken} className={`${BTN_GHOST} min-h-11 self-start`}>
          remove node 4
        </button>
      </div>
    </div>
  );
}
