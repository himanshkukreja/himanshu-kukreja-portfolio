"use client";

import { useState } from "react";
import { BTN_GHOST, BTN_PRIMARY, META, MSG_BOX, type GameProps } from "./shared";

const SEQ = ["user:7", "feed", "user:7", "cart:9", "feed", "img:1", "user:7", "cart:9", "img:2", "feed", "user:7", "img:1", "cart:9", "user:7"];
const SIZE = 3;

/** Hits an LRU cache of the same size gets on the fixed sequence: the score to match. */
function lruHits(): number {
  const c: string[] = [];
  let h = 0;
  SEQ.forEach((k) => {
    const i = c.indexOf(k);
    if (i >= 0) {
      h++;
      c.splice(i, 1);
      c.push(k);
    } else {
      if (c.length === SIZE) c.shift();
      c.push(k);
    }
  });
  return h;
}
const LRU = lruHits();

type S = { cache: string[]; ci: number; hits: number; pending: boolean; msg: string };

const INITIAL: S = {
  cache: [],
  ci: 0,
  hits: 0,
  pending: false,
  msg: "Press “next request”. On a miss with a full cache, you pick the victim.",
};

export default function CacheOrMiss({ onWin }: GameProps) {
  const [s, setS] = useState<S>(INITIAL);
  const done = s.ci >= SEQ.length;

  /** Applies end-of-sequence scoring once the last request has been handled. */
  const settle = (next: S) => {
    if (next.ci < SEQ.length) {
      setS(next);
      return;
    }
    if (next.hits >= LRU) {
      setS({
        ...next,
        msg: `${next.hits} hits vs LRU ${LRU}. You beat LRU by looking ahead: that is Bélády’s optimal algorithm, which real caches can’t do because they can’t see the future.`,
      });
      onWin(next.hits, `${next.hits} hits`);
    } else {
      setS({ ...next, msg: `${next.hits} hits vs LRU ${LRU}. LRU won. Evict what will be needed furthest in the future.` });
    }
  };

  const nextRequest = () => {
    if (s.ci >= SEQ.length || s.pending) return;
    const k = SEQ[s.ci];
    if (s.cache.includes(k)) {
      settle({ ...s, hits: s.hits + 1, ci: s.ci + 1, msg: `HIT · ${k} served from memory in 0.2 ms.` });
      return;
    }
    if (s.cache.length < SIZE) {
      settle({ ...s, cache: [...s.cache, k], ci: s.ci + 1, msg: `MISS · ${k} fetched from the DB (40 ms) and cached.` });
      return;
    }
    setS({ ...s, pending: true, msg: "MISS · cache is full. Click a slot to evict. Peek at what is coming next." });
  };

  const evict = (n: number) => {
    const c = s.cache.slice();
    const k = SEQ[s.ci];
    const gone = c[n];
    c[n] = k;
    settle({ ...s, cache: c, pending: false, ci: s.ci + 1, msg: `Evicted ${gone}, cached ${k}.` });
  };

  const peek = SEQ.slice(s.ci + 1, s.ci + 4);

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <span className={META}>
          cache size {SIZE} · request {Math.min(s.ci + 1, SEQ.length)}/{SEQ.length}
        </span>
        <span className="font-mono text-[13px] text-fg">
          your hits <span className="font-semibold text-signal-text">{s.hits}</span> · LRU would get {LRU}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-xs text-fg-3">incoming</span>
        <span
          className={`px-3 py-2 font-mono text-[15px] font-semibold ${
            s.pending ? "bg-bad text-[#000]" : "bg-signal text-on-signal"
          }`}
        >
          GET {done ? "—" : SEQ[s.ci]}
        </span>
        {peek.length > 0 && <span className="font-mono text-xs text-fg-3">then</span>}
        {peek.map((p, i) => (
          <span key={`${s.ci}-${i}`} className="border border-dashed border-line-strong px-2.5 py-1.5 font-mono text-[13px] text-fg-3">
            {p}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {[0, 1, 2].map((n) => {
          const key = s.cache[n];
          const nextUse = key ? SEQ.slice(s.ci + 1).indexOf(key) : -1;
          const hint = !key ? "" : nextUse < 0 ? "not needed again" : `needed in ${nextUse + 1}`;
          const style =
            s.pending && key
              ? "border-2 border-signal bg-bg text-fg hover:bg-surface-2"
              : key
                ? "border border-line-strong bg-bg text-fg"
                : "border border-dashed border-line-strong bg-transparent text-fg-4";
          return (
            <button
              key={n}
              type="button"
              onClick={() => evict(n)}
              disabled={!s.pending || !key}
              aria-label={`Evict ${key || "empty slot"}${hint ? `, ${hint}` : ""}`}
              className={`flex min-h-[110px] min-w-0 flex-col items-start gap-1.5 p-3 text-left sm:p-3.5 disabled:cursor-not-allowed disabled:opacity-[0.45] ${style}`}
            >
              <span className="font-mono text-[11px] opacity-70">slot {n + 1}</span>
              <span className="break-all font-mono text-lg font-semibold sm:text-xl">{key || "empty"}</span>
              <span className="text-xs">{hint}</span>
            </button>
          );
        })}
      </div>

      <div className={`${MSG_BOX} min-h-12 text-[15px] leading-normal`} aria-live="polite">
        {s.msg}
      </div>

      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={nextRequest} disabled={s.pending || done} className={`${BTN_PRIMARY} min-h-12`}>
          {done ? "done" : "next request"}
        </button>
        <button type="button" onClick={() => setS({ ...INITIAL, msg: "Fresh cache. Go again." })} className={`${BTN_GHOST} min-h-12`}>
          restart
        </button>
      </div>
    </>
  );
}
