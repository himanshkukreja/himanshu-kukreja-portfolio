"use client";

/**
 * The run visualiser: four reusable views driven by the `viz.emit(...)` events a test run records
 * (src/lib/learn/labs/harness.ts, jsHarness.ts), mapped by the lab's `viz:` spec (resources/labs/README.md):
 *   timeline  counts or values per time bucket (allowed vs rejected per second, queue depth)
 *   ring      a hash ring: node positions and keys walking clockwise to their owner
 *   state     a state machine: states, transitions and what happened, step by step
 *   list      snapshots of a list, queue or map (LRU order, a log's partitions)
 * Colours are theme tokens only (every course theme; no purple), and every view fits a phone's width.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { HarnessResult, HarnessVizEvent } from "@/lib/learn/labs/harness";
import type { VizSpec, VizTone } from "@/lib/learn/labs/types";

const TONE: Record<VizTone, string> = {
  signal: "var(--c-signal)",
  ok: "var(--c-ok)",
  bad: "var(--c-bad)",
  link: "var(--c-code-num)",
  muted: "var(--c-fg-4)",
  fg: "var(--c-fg-2)",
};
/** categorical colours for nodes and lanes, in order (code palette tokens: they follow every theme) */
const CATS = ["var(--c-signal)", "var(--c-code-num)", "var(--c-code-fn)", "var(--c-code-var)", "var(--c-code-tag)", "var(--c-code-kw)", "var(--c-fg-3)"];

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : NaN);
const str = (v: unknown) => (v == null ? "" : typeof v === "string" ? v : JSON.stringify(v));

type Pick = { key: string; title: string; events: HarnessVizEvent[] };

export default function LabViz({ spec, result }: { spec: VizSpec; result: HarnessResult | null }) {
  const picks: Pick[] = useMemo(() => {
    if (!result?.viz) return [];
    return Object.entries(result.viz)
      .filter(([, evs]) => evs.length)
      .map(([key, events]) => {
        const [group, name] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
        const t = result.tests.find((x) => x.group === group && x.name === name);
        return { key, title: t?.title ?? name, events };
      });
  }, [result]);
  const preferred = picks.find((p) => spec.test && (p.key.endsWith(":" + spec.test) || p.title === spec.test))?.key ?? picks[0]?.key ?? "";
  const [chosen, setChosen] = useState<string | null>(null);
  const active = picks.find((p) => p.key === (chosen ?? preferred)) ?? picks[0];

  if (!result) return <p className="m-0 p-4 text-sm leading-relaxed text-fg-3">Run the tests to see this lab&apos;s {VIEW_NAME[spec.view]}. The tests record what your code does as it runs.</p>;
  if (!active)
    return (
      <p className="m-0 p-4 text-sm leading-relaxed text-fg-3">
        No events yet: the tests that draw this view {result.setup ? "didn't run (your code didn't load)" : "stopped before they recorded anything"}. Fix the first failure and run again.
      </p>
    );
  return (
    <div className="flex min-w-0 flex-col gap-3 p-3 sm:p-4" data-hk-viz={spec.view}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 font-mono text-[11px] uppercase tracking-label text-fg-3">{spec.title ?? VIEW_NAME[spec.view]}</span>
        {picks.length > 1 && (
          <select
            aria-label="Which test to visualise"
            value={active.key}
            onChange={(e) => setChosen(e.target.value)}
            className="ml-auto min-h-9 min-w-0 max-w-full border border-line bg-bg px-2 font-mono text-[11px] text-fg"
          >
            {picks.map((p) => (
              <option key={p.key} value={p.key}>
                {p.title}
              </option>
            ))}
          </select>
        )}
      </div>
      {picks.length <= 1 && <span className="text-[13px] text-fg-2">{active.title}</span>}
      {spec.view === "timeline" && <Timeline spec={spec} events={active.events} />}
      {spec.view === "ring" && <Ring key={active.key} spec={spec} events={active.events} />}
      {spec.view === "state" && <StateMachine key={active.key} spec={spec} events={active.events} />}
      {spec.view === "list" && <ListView key={active.key} spec={spec} events={active.events} />}
    </div>
  );
}

const VIEW_NAME: Record<VizSpec["view"], string> = { timeline: "timeline", ring: "hash ring", state: "state machine", list: "list" };

/** The element's width in CSS pixels, so a chart's viewBox matches it and its text stays readable on a phone. */
export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const cw = Math.round(entries[0]?.contentRect.width ?? 0);
      if (cw > 0) setW(Math.max(260, cw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

// ------------------------------------------------------------------------------------------ scrubber

/** Step through a run's events; a new run (a new events array) jumps to its last step. */
function useSteps(n: number, source: unknown) {
  const [i, setI] = useState(n);
  const [playing, setPlaying] = useState(false);
  const [seen, setSeen] = useState(source);
  if (seen !== source) {
    setSeen(source);
    setI(n);
    setPlaying(false);
  }
  useEffect(() => {
    if (!playing) return;
    const iv = window.setInterval(() => {
      setI((x) => {
        if (x >= n) {
          setPlaying(false);
          return x;
        }
        return x + 1;
      });
    }, 550);
    return () => window.clearInterval(iv);
  }, [playing, n]);
  return { i: Math.min(i, n), setI, playing, setPlaying };
}

function Scrubber({ i, n, setI, playing, setPlaying, label }: { i: number; n: number; setI: (f: (x: number) => number) => void; playing: boolean; setPlaying: (p: boolean) => void; label: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <button type="button" aria-label="Previous step" onClick={() => setI((x) => Math.max(1, x - 1))} className="grid h-9 w-9 place-items-center border border-line text-fg-2 hover:text-fg">
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play from the start"}
        onClick={() => {
          if (!playing && i >= n) setI(() => 1);
          setPlaying(!playing);
        }}
        className="grid h-9 w-9 place-items-center border border-line text-fg-2 hover:text-fg"
      >
        {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
      </button>
      <button type="button" aria-label="Next step" onClick={() => setI((x) => Math.min(n, x + 1))} className="grid h-9 w-9 place-items-center border border-line text-fg-2 hover:text-fg">
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
      <input
        type="range"
        min={1}
        max={Math.max(1, n)}
        value={Math.max(1, i)}
        onChange={(e) => setI(() => Number(e.target.value))}
        aria-label="Step"
        className="min-w-[80px] flex-1 accent-[var(--c-signal)]"
      />
      <span className="font-mono text-[11px] text-fg-3" aria-live="polite">
        {label}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ timeline

function Timeline({ spec, events }: { spec: Extract<VizSpec, { view: "timeline" }>; events: HarnessVizEvent[] }) {
  const { buckets, maxY, series } = useMemo(() => {
    const series = spec.series.map((s, k) => ({ ...s, color: s.tone ? TONE[s.tone] : CATS[k % CATS.length] }));
    const map = new Map<number, number[]>();
    for (const e of events) {
      const x = num(e.data[spec.x]);
      if (!Number.isFinite(x)) continue;
      const b = Math.floor(x / spec.bucket + 1e-9);
      series.forEach((s, k) => {
        if (e.type !== s.event) return;
        if (s.where && !Object.entries(s.where).every(([f, v]) => e.data[f] === v)) return;
        const row = map.get(b) ?? series.map(() => (spec.style === "lines" ? NaN : 0));
        if (s.value) {
          const v = num(e.data[s.value]);
          if (Number.isFinite(v)) row[k] = v; // a gauge: the last value in the bucket
        } else row[k] = (Number.isFinite(row[k]) ? row[k] : 0) + 1;
        map.set(b, row);
      });
    }
    const keys = [...map.keys()].sort((a, b) => a - b);
    const lo = keys[0] ?? 0;
    const hi = keys[keys.length - 1] ?? 0;
    const buckets: { b: number; vals: number[] }[] = [];
    for (let b = lo; b <= hi && buckets.length < 400; b++) buckets.push({ b, vals: map.get(b) ?? series.map(() => (spec.style === "lines" ? NaN : 0)) });
    const maxY = Math.max(1, ...buckets.map((r) => (spec.style === "bars" ? r.vals.reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0) : Math.max(0, ...r.vals.filter(Number.isFinite)))));
    return { buckets, maxY, series };
  }, [events, spec]);

  const [box, W] = useWidth<HTMLDivElement>(640);
  if (!buckets.length) return <p className="m-0 text-sm text-fg-3">No events matched this view&apos;s series.</p>;
  const H = W < 480 ? 190 : 220;
  const pad = { l: 34, r: 8, t: 10, b: 26 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const bw = iw / buckets.length;
  const y = (v: number) => pad.t + ih - (v / maxY) * ih;
  const ticks = niceTicks(maxY);
  const label = (b: number) => {
    const v = b * spec.bucket;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };
  const every = Math.max(1, Math.ceil(buckets.length / Math.max(4, Math.floor(W / 56))));
  return (
    <div ref={box} className="flex min-w-0 flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${spec.title ?? "Timeline"}: ${series.map((s) => s.label).join(", ")} per ${spec.bucket === 1 ? "" : spec.bucket + " "}${spec.xLabel ?? "unit"}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--c-line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--c-fg-3)" fontFamily="var(--font-geist-mono), monospace">
              {t}
            </text>
          </g>
        ))}
        {spec.style === "bars"
          ? buckets.map((r, k) => {
              let acc = 0;
              return (
                <g key={r.b}>
                  {r.vals.map((v, s) => {
                    if (!v) return null;
                    const y0 = y(acc);
                    acc += v;
                    const y1 = y(acc);
                    return <rect key={s} x={pad.l + k * bw + bw * 0.12} width={Math.max(1, bw * 0.76)} y={y1} height={Math.max(0, y0 - y1)} fill={series[s].color}><title>{`${spec.xLabel ?? spec.x} ${label(r.b)}: ${series[s].label} ${v}`}</title></rect>;
                  })}
                </g>
              );
            })
          : series.map((s, k) => {
              const pts = buckets.map((r, i) => (Number.isFinite(r.vals[k]) ? `${pad.l + i * bw + bw / 2},${y(r.vals[k])}` : null)).filter(Boolean);
              return <polyline key={k} points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" />;
            })}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--c-line-strong)" />
        {buckets.map((r, k) =>
          k % every === 0 ? (
            <text key={r.b} x={pad.l + k * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--c-fg-3)" fontFamily="var(--font-geist-mono), monospace">
              {label(r.b)}
            </text>
          ) : null
        )}
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-fg-2">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="text-fg-4">
          x: {spec.xLabel ?? spec.x}
          {spec.bucket !== 1 ? ` (per ${spec.bucket})` : ""} · y: {spec.yLabel ?? (series.some((s) => s.value) ? "value" : "count")}
        </span>
      </div>
    </div>
  );
}

function niceTicks(max: number): number[] {
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000].find((s) => max / s <= 5) ?? Math.ceil(max / 5);
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}

// ------------------------------------------------------------------------------------------ ring

function Ring({ spec, events }: { spec: Extract<VizSpec, { view: "ring" }>; events: HarnessVizEvent[] }) {
  const steps = events.filter((e) => e.type === spec.events.node || e.type === spec.events.remove || e.type === spec.events.key);
  const n = steps.length;
  const { i, setI, playing, setPlaying } = useSteps(n, events);
  const colorOf = useMemo(() => {
    const ids: string[] = [];
    for (const e of events) if (e.type === spec.events.node && !ids.includes(str(e.data.id))) ids.push(str(e.data.id));
    return (id: string) => CATS[Math.max(0, ids.indexOf(id)) % CATS.length];
  }, [events, spec.events.node]);

  const state = useMemo(() => {
    const nodes: { id: string; pos: number }[] = [];
    const keys = new Map<string, { key: string; pos: number; node: string }>();
    let last: HarnessVizEvent | null = null;
    for (const e of steps.slice(0, i)) {
      last = e;
      if (e.type === spec.events.node) nodes.push({ id: str(e.data.id), pos: num(e.data.pos) });
      else if (e.type === spec.events.remove) {
        const id = str(e.data.id);
        for (let k = nodes.length - 1; k >= 0; k--) if (nodes[k].id === id) nodes.splice(k, 1);
      } else keys.set(str(e.data.key), { key: str(e.data.key), pos: num(e.data.pos), node: str(e.data.node) });
    }
    return { nodes, keys: [...keys.values()], last };
  }, [steps, i, spec.events]);

  const S = 300;
  const c = S / 2;
  const R = 112;
  const ang = (pos: number) => ((pos / spec.space) % 1) * Math.PI * 2 - Math.PI / 2;
  const at = (pos: number, r: number) => [c + r * Math.cos(ang(pos)), c + r * Math.sin(ang(pos))] as const;
  const counts = new Map<string, number>();
  for (const k of state.keys) counts.set(k.node, (counts.get(k.node) ?? 0) + 1);
  const owners = [...new Set(state.nodes.map((x) => x.id))];
  const lastLabel = state.last
    ? state.last.type === spec.events.node
      ? `node ${str(state.last.data.id)} placed at ${((num(state.last.data.pos) / spec.space) * 360).toFixed(0)}°`
      : state.last.type === spec.events.remove
        ? `node ${str(state.last.data.id)} removed`
        : `key "${str(state.last.data.key)}" → ${str(state.last.data.node)}`
    : "";
  /** the position a key walked to: its owner's first position clockwise from the key */
  const ownerPos = (k: { pos: number; node: string }) => {
    const mine = state.nodes.filter((x) => x.id === k.node).map((x) => x.pos);
    if (!mine.length) return null;
    const after = mine.filter((p) => p >= k.pos).sort((a, b) => a - b);
    return after[0] ?? Math.min(...mine);
  };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid min-w-0 items-center gap-3 sm:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto h-auto w-full max-w-[300px]" role="img" aria-label={`Hash ring: ${state.nodes.length} node positions, ${state.keys.length} keys`}>
          <circle cx={c} cy={c} r={R} fill="none" stroke="var(--c-line-strong)" strokeWidth={2} />
          {state.keys.map((k) => {
            const op = ownerPos(k);
            const [kx, ky] = at(k.pos, R - 26);
            const [ox, oy] = op == null ? [kx, ky] : at(op, R);
            const col = colorOf(k.node);
            return (
              <g key={k.key}>
                <line x1={kx} y1={ky} x2={ox} y2={oy} stroke={col} strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
                <circle cx={kx} cy={ky} r={4} fill="var(--c-bg)" stroke={col} strokeWidth={2}>
                  <title>{`${k.key} → ${k.node}`}</title>
                </circle>
              </g>
            );
          })}
          {state.nodes.map((x, k) => {
            const [nx, ny] = at(x.pos, R);
            return (
              <rect key={k} x={nx - 5} y={ny - 5} width={10} height={10} fill={colorOf(x.id)} stroke="var(--c-bg)" strokeWidth={1.5}>
                <title>{`${x.id} at ${((x.pos / spec.space) * 360).toFixed(1)}°`}</title>
              </rect>
            );
          })}
          <text x={c} y={c - 4} textAnchor="middle" fontSize={12} fill="var(--c-fg-2)" fontFamily="var(--font-geist-mono), monospace">
            {state.nodes.length} positions
          </text>
          <text x={c} y={c + 14} textAnchor="middle" fontSize={12} fill="var(--c-fg-3)" fontFamily="var(--font-geist-mono), monospace">
            {state.keys.length} keys
          </text>
        </svg>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 font-mono text-[12px]">
          {owners.map((id) => (
            <li key={id} className="flex items-center gap-2 text-fg-2">
              <span aria-hidden className="inline-block h-3 w-3 shrink-0" style={{ background: colorOf(id) }} />
              <span className="text-fg">{id}</span>
              <span className="text-fg-3">
                {state.nodes.filter((x) => x.id === id).length} pos · {counts.get(id) ?? 0} keys
              </span>
            </li>
          ))}
          <li className="mt-1 text-[11px] leading-snug text-fg-4">Squares are node positions (virtual nodes); circles are keys, each walking clockwise to the next position.</li>
        </ul>
      </div>
      <Scrubber i={i} n={n} setI={setI} playing={playing} setPlaying={setPlaying} label={`${i}/${n} · ${lastLabel}`} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------ state machine

function StateMachine({ spec, events }: { spec: Extract<VizSpec, { view: "state" }>; events: HarnessVizEvent[] }) {
  const steps = events.filter((e) => e.type === spec.event || (spec.note && e.type === spec.note));
  const n = steps.length;
  const { i, setI, playing, setPlaying } = useSteps(n, events);
  const view = useMemo(() => {
    let cur: string | null = null;
    const trans = new Map<string, number>();
    const strip: { state: string; notes: string[] }[] = [];
    let last: HarnessVizEvent | null = null;
    for (const e of steps.slice(0, i)) {
      last = e;
      if (e.type === spec.event) {
        const to = str(e.data.to);
        const from: string | null = e.data.from != null ? str(e.data.from) : e.data.frm != null ? str(e.data.frm) : cur;
        if (from != null && from !== to) trans.set(`${from}>${to}`, (trans.get(`${from}>${to}`) ?? 0) + 1);
        cur = to;
        strip.push({ state: to, notes: [] });
      } else {
        const text = str(e.data.label ?? e.data.note ?? e.data.text ?? JSON.stringify(e.data));
        if (!strip.length) strip.push({ state: cur ?? "", notes: [] });
        strip[strip.length - 1].notes.push(text);
      }
    }
    return { cur, trans, strip, last };
  }, [steps, i, spec.event]);

  const st = spec.states;
  const tone = (id: string) => TONE[st.find((s) => s.id === id)?.tone ?? "fg"];
  const name = (id: string) => st.find((s) => s.id === id)?.label ?? id;
  const [box, W] = useWidth<HTMLDivElement>(600);
  const H = 150;
  const bw = Math.min(150, (W - 40) / st.length - (W < 480 ? 12 : 24));
  const xs = st.map((_, k) => 20 + (k + 0.5) * ((W - 40) / st.length));
  const cy = 62;
  return (
    <div ref={box} className="flex min-w-0 flex-col gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`State machine, now ${view.cur ? name(view.cur) : "not started"}`}>
        <defs>
          <marker id="hk-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--c-fg-3)" />
          </marker>
        </defs>
        {[...view.trans.entries()].map(([k, count]) => {
          const [a, b] = k.split(">");
          const ia = st.findIndex((s) => s.id === a);
          const ib = st.findIndex((s) => s.id === b);
          if (ia < 0 || ib < 0) return null;
          const fwd = ib > ia;
          const x1 = xs[ia] + (fwd ? bw / 2 : -bw / 2) * 0.2;
          const x2 = xs[ib] - (fwd ? bw / 2 : -bw / 2) * 0.2;
          const lift = (fwd ? -1 : 1) * (26 + Math.abs(ib - ia) * 12);
          const my = cy + lift;
          const path = `M ${x1} ${cy + (fwd ? -18 : 18)} Q ${(x1 + x2) / 2} ${my + (fwd ? -6 : 6)} ${x2} ${cy + (fwd ? -18 : 18)}`;
          return (
            <g key={k}>
              <path d={path} fill="none" stroke="var(--c-fg-3)" strokeWidth={1.5} markerEnd="url(#hk-arrow)" />
              <text x={(x1 + x2) / 2} y={my + (fwd ? -8 : 18)} textAnchor="middle" fontSize={11} fill="var(--c-fg-3)" fontFamily="var(--font-geist-mono), monospace">
                ×{count}
              </text>
            </g>
          );
        })}
        {st.map((s, k) => {
          const on = view.cur === s.id;
          return (
            <g key={s.id}>
              <rect x={xs[k] - bw / 2} y={cy - 18} width={bw} height={36} fill={on ? tone(s.id) : "var(--c-surface)"} stroke={tone(s.id)} strokeWidth={on ? 0 : 2} />
              <text x={xs[k]} y={cy + 5} textAnchor="middle" fontSize={W < 420 ? 11.5 : 13} fontWeight={600} fill={on ? "var(--c-bg)" : "var(--c-fg)"} fontFamily="var(--font-geist-mono), monospace">
                {s.label ?? s.id}
              </text>
            </g>
          );
        })}
      </svg>
      <ol className="m-0 flex min-w-0 list-none flex-wrap gap-1 p-0" aria-label="States over time">
        {view.strip.map((seg, k) => (
          <li key={k} className="flex min-w-0 max-w-full flex-col gap-1 border-l-4 bg-raised px-2 py-1.5" style={{ borderColor: tone(seg.state) }}>
            <span className="font-mono text-[11px] font-semibold text-fg">{name(seg.state)}</span>
            {seg.notes.map((t, j) => (
              <span key={j} className="break-words font-mono text-[11px] text-fg-3">
                {t}
              </span>
            ))}
          </li>
        ))}
      </ol>
      <Scrubber
        i={i}
        n={n}
        setI={setI}
        playing={playing}
        setPlaying={setPlaying}
        label={`${i}/${n}${view.last ? ` · ${view.last.type === spec.event ? `→ ${name(str(view.last.data.to))}` : str(view.last.data.label ?? view.last.type)}` : ""}`}
      />
    </div>
  );
}

// ------------------------------------------------------------------------------------------ list / queue / map

function ListView({ spec, events }: { spec: Extract<VizSpec, { view: "list" }>; events: HarnessVizEvent[] }) {
  const steps = events.filter((e) => e.type === spec.event);
  const n = steps.length;
  const { i, setI, playing, setPlaying } = useSteps(n, events);
  const lanes = useMemo(() => {
    const m = new Map<string, HarnessVizEvent>();
    for (const e of steps.slice(0, i)) m.set(str(e.data.lane ?? ""), e);
    return [...m.entries()];
  }, [steps, i]);
  const last = steps[i - 1];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {lanes.map(([lane, e], li) => {
        const items: unknown[] = Array.isArray(e.data.items) ? (e.data.items as unknown[]) : [];
        const entries = e.data.entries && typeof e.data.entries === "object" ? Object.entries(e.data.entries as Record<string, unknown>) : null;
        const hit = e.data.hit != null ? str(e.data.hit) : null;
        const evicted = e.data.evicted != null ? str(e.data.evicted) : null;
        return (
          <div key={lane || li} className="flex min-w-0 flex-col gap-1.5">
            {lane && <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{lane}</span>}
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {spec.head && <span className="font-mono text-[10px] uppercase tracking-label text-fg-4">{spec.head} →</span>}
              {entries
                ? entries.map(([k, v]) => (
                    <span key={k} className={`inline-flex max-w-full items-center gap-1 border px-2 py-1 font-mono text-[12px] ${hit === k ? "border-signal bg-[color-mix(in_srgb,var(--c-signal)_14%,transparent)] text-fg" : "border-line text-fg-2"}`}>
                      <span className="text-fg">{k}</span>
                      <span className="text-fg-4">:</span>
                      <span className="break-all">{str(v)}</span>
                    </span>
                  ))
                : items.map((it, k) => {
                    const s = str(it);
                    return (
                      <span key={k} className={`inline-flex min-w-[2.25rem] max-w-full items-center justify-center break-all border px-2 py-1 font-mono text-[13px] ${hit === s ? "border-signal bg-[color-mix(in_srgb,var(--c-signal)_14%,transparent)] font-semibold text-fg" : "border-line text-fg-2"}`}>
                        {s}
                      </span>
                    );
                  })}
              {!items.length && !entries?.length && <span className="font-mono text-[12px] text-fg-4">(empty)</span>}
              {spec.tail && <span className="font-mono text-[10px] uppercase tracking-label text-fg-4">← {spec.tail}</span>}
              {evicted && (
                <span className="inline-flex items-center gap-1 border border-dashed border-bad px-2 py-1 font-mono text-[12px] text-bad-text line-through" title="evicted">
                  {evicted}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <Scrubber i={i} n={n} setI={setI} playing={playing} setPlaying={setPlaying} label={`${i}/${n}${last?.data.note ? ` · ${str(last.data.note)}` : ""}`} />
    </div>
  );
}
