"use client";

/**
 * A world's progress map (plan §4.3): each region is a building on the campus, its stretches a serpentine road of
 * stops: concept rooms, practice paving stones, the checkpoint desk, the gate and the region's boss.
 *
 * - The road is a decorative SVG (a smooth Catmull-Rom path, aria-hidden); the stops are real links and buttons
 *   positioned over it, inside an ordered list, so they are focusable and read in order by screen readers.
 * - States never rely on colour alone: an icon and a word (done ✓, current ●, open ○, locked padlock, soon).
 * - Keyboard: Tab or the arrow keys move between stops; Enter opens one. A side panel (desktop) or the card under the
 *   map (phone) shows the focused stop and the next action; "Jump to current" scrolls to the frontier.
 * - Layout follows the container's width: 3 stops a row on a phone, 4 on a tablet, 6 on a desktop.
 * - Progress comes from useDsaProgress() through computeWorld() (src/lib/dsa/map/progress.ts).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeWorld, STATE_LABEL, type NodeState, type WorldProgress } from "@/lib/dsa/map/progress";
import type { WorldNode, WorldRegion, WorldSpec } from "@/lib/dsa/types";
import { useDsaProgress } from "../progress/useDsaProgress";

const ROW_H = 132;
const TOP = 46;

const TYPE_LABEL: Record<WorldNode["type"], string> = {
  concept: "Concept",
  practice: "Practice",
  checkpoint: "Checkpoint",
  gate: "Gate",
  boss: "Boss",
  side: "Side path",
  service: "Review stop",
};

const LEVEL_SHORT: Record<string, string> = { easy: "E", medium: "M", hard: "H" };

function colsFor(w: number) {
  if (w < 520) return 3;
  if (w < 900) return 4;
  return 6;
}

/** Catmull-Rom through the points, as cubic Béziers. */
function roadPath(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/* ------------------------------------------------------------------ glyphs (inline, currentColor) */

function Glyph({ node, state }: { node: WorldNode; state: NodeState }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "square" as const, "aria-hidden": true };
  if (state === "done")
    return (
      <svg {...common}>
        <path d="M4 12.5l5 5L20 6.5" />
      </svg>
    );
  if (state === "locked")
    return (
      <svg {...common}>
        <rect x="5" y="11" width="14" height="9" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    );
  if (node.type === "practice") return <span className="font-mono text-[13px] font-bold">{LEVEL_SHORT[node.level || "medium"]}</span>;
  if (node.type === "concept")
    return (
      <svg {...common}>
        <path d="M4 5h7v14H4zM13 5h7v14h-7z" />
      </svg>
    );
  if (node.type === "checkpoint")
    return (
      <svg {...common}>
        <path d="M6 12l4 4 8-8" />
      </svg>
    );
  if (node.type === "gate")
    return (
      <svg {...common}>
        <path d="M5 21V5h14v16M9 21V9h6v12" />
      </svg>
    );
  if (node.type === "boss")
    return (
      <svg {...common}>
        <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function shapeClass(node: WorldNode): string {
  if (node.type === "practice") return "h-11 w-11 rounded-full";
  if (node.type === "checkpoint") return "h-12 w-12 rotate-45";
  if (node.type === "gate") return "h-11 w-9";
  if (node.type === "boss") return "h-14 w-14";
  return "h-12 w-12";
}

function stateClass(state: NodeState): string {
  switch (state) {
    case "done":
      return "border-2 border-fg bg-fg text-bg";
    case "current":
      return "border-2 border-signal bg-signal text-on-signal shadow-[0_0_0_5px_var(--c-dsa-hl)]";
    case "open":
      return "border-2 border-signal bg-bg text-signal-text";
    case "locked":
      return "border-2 border-dashed border-line-strong bg-surface text-fg-3";
    default:
      return "border-2 border-dotted border-line-strong bg-bg text-fg-4";
  }
}

const STATE_WORD: Record<NodeState, string> = { done: "Done", current: "You are here", open: "Open", locked: "Locked", soon: "Soon" };

/* ------------------------------------------------------------------ one region */

type Selected = { node: WorldNode; region: WorldRegion } | null;

function RegionRoad({
  region,
  progress,
  cols,
  width,
  onSelect,
  selectedId,
}: {
  region: WorldRegion;
  progress: WorldProgress;
  cols: number;
  width: number;
  onSelect: (s: Selected) => void;
  selectedId: string | null;
}) {
  const nodes = useMemo(() => [...region.stretches.flatMap((s) => s.nodes), ...(region.boss ? [region.boss] : [])], [region]);
  const cellW = width / cols;
  const pts = nodes.map((_, i) => {
    const row = Math.floor(i / cols);
    const k = i % cols;
    const col = row % 2 === 0 ? k : cols - 1 - k;
    return { x: col * cellW + cellW / 2, y: row * ROW_H + TOP };
  });
  const rows = Math.max(1, Math.ceil(nodes.length / cols));
  const height = rows * ROW_H;
  const listRef = useRef<HTMLOListElement>(null);

  const onKey = (e: React.KeyboardEvent<HTMLOListElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-map-node]") || []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? Math.min(items.length - 1, at + 1) : Math.max(0, at - 1);
    items[next]?.focus();
  };

  if (!width) return <div style={{ height }} />;
  return (
    <div className="relative" style={{ height }}>
      <svg aria-hidden className="pointer-events-none absolute inset-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path d={roadPath(pts)} fill="none" stroke="var(--c-line-strong)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
        <path d={roadPath(pts)} fill="none" stroke="var(--c-bg)" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
        <path d={roadPath(pts)} fill="none" stroke="var(--c-line-strong)" strokeWidth={1.5} strokeDasharray="6 8" />
      </svg>
      <ol ref={listRef} onKeyDown={onKey} className="m-0 list-none p-0" aria-label={`${region.title}: stops in order`}>
        {nodes.map((n, i) => {
          const state = progress.states[n.id] || "locked";
          const p = pts[i];
          const label = `${TYPE_LABEL[n.type]}: ${n.title}${n.level ? `, ${n.level}` : ""}. ${STATE_LABEL[state]}${state === "locked" && n.type !== "concept" ? (n.type === "checkpoint" ? ", appears at 70% of this stretch's practice" : ", opens after the checkpoint") : ""}.`;
          const inner = (
            <>
              <span className={`relative grid shrink-0 place-items-center ${shapeClass(n)} ${stateClass(state)}`}>
                <span className={n.type === "checkpoint" ? "-rotate-45" : ""}>
                  <Glyph node={n} state={state} />
                </span>
                {state === "current" && <span aria-hidden className="absolute -inset-2 border-2 border-signal motion-safe:animate-ping motion-safe:[animation-duration:2.2s]" />}
              </span>
              <span className="mt-1.5 line-clamp-2 text-center text-[12px] leading-tight text-fg-2" style={{ maxWidth: Math.max(80, cellW - 10) }}>
                {n.type === "gate" ? "Gate" : n.title}
              </span>
              <span className={`font-mono text-[10px] uppercase tracking-label ${state === "current" ? "text-signal-text" : "text-fg-4"}`}>{STATE_WORD[state]}</span>
            </>
          );
          const cls = `absolute flex min-h-11 min-w-11 -translate-x-1/2 flex-col items-center outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-signal ${
            selectedId === n.id ? "z-10" : ""
          }`;
          const style = { left: p.x, top: p.y - 24 };
          const sel = () => onSelect({ node: n, region });
          return (
            <li key={n.id} data-node-id={n.id}>
              {n.href && state !== "locked" ? (
                <Link href={n.href} data-map-node aria-label={label} className={cls} style={style} onFocus={sel} onMouseEnter={sel}>
                  {inner}
                </Link>
              ) : (
                <button type="button" data-map-node aria-label={label} className={cls} style={style} onFocus={sel} onClick={sel}>
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ detail */

function NodeDetail({ sel, state }: { sel: NonNullable<Selected>; state: NodeState }) {
  const { node, region } = sel;
  const action =
    node.href && state !== "locked"
      ? { href: node.href, text: node.type === "concept" ? (state === "done" ? "Review the lesson" : "Open the lesson") : node.type === "practice" ? (state === "done" ? "Solve it again" : "Solve it") : "Take the quiz" }
      : null;
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">
        {region.title} · {TYPE_LABEL[node.type]}
        {node.level ? ` · ${node.level}` : ""}
      </p>
      <h3 className="m-0 font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-fg">{node.type === "gate" ? "The gate to the next stretch" : node.title}</h3>
      <p className="m-0 flex items-center gap-2 text-[14px] text-fg-2">
        <span className={`inline-grid h-5 w-5 place-items-center ${stateClass(state)}`} aria-hidden />
        {STATE_WORD[state]}
        {state === "locked" && node.type === "checkpoint" ? ": appears once 70% of this stretch's practice is solved." : ""}
        {state === "locked" && node.type === "practice" ? ": opens when the gate before it opens." : ""}
        {state === "locked" && node.type === "gate" ? ": opens when you pass the checkpoint." : ""}
        {state === "locked" && node.type === "boss" ? ": unlocks when every checkpoint in this building is passed." : ""}
        {state === "soon" ? ": this stop is being written." : ""}
      </p>
      {node.type === "checkpoint" && node.problems && node.problems.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-fg-2">
          <li className="font-mono text-[11px] uppercase tracking-label text-fg-3">Plus two mixed problems</li>
          {node.problems.map((p) => (
            <li key={p.id}>
              {p.title}
              {!p.built ? <span className="text-fg-4"> · soon</span> : null}
            </li>
          ))}
        </ul>
      )}
      {action && (
        <Link href={action.href} className="inline-flex min-h-11 items-center self-start bg-signal px-4 text-[15px] font-semibold text-on-signal hover:opacity-90">
          {action.text} →
        </Link>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the map */

export default function WorldMap({ spec }: { spec: WorldSpec }) {
  const progress = useDsaProgress();
  const world = useMemo(() => computeWorld(spec, progress), [spec, progress]);
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [sel, setSel] = useState<Selected>(null);
  // regions with nothing built yet start folded, so the open buildings lead the map
  const [unfolded, setUnfolded] = useState<Record<string, boolean>>({});
  const hasBuilt = (r: WorldRegion) => r.stretches.some((st) => st.nodes.some((n) => n.built && n.type !== "gate"));

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const frontier = useMemo(() => {
    if (!world.frontier) return null;
    const region = spec.regions.find((r) => r.id === world.frontier!.regionId);
    const node = region?.stretches.flatMap((s) => s.nodes).find((n) => n.id === world.frontier!.nodeId);
    return region && node ? { node, region } : null;
  }, [world.frontier, spec.regions]);
  const shown = sel ?? frontier;
  const cols = colsFor(width);

  const jump = useCallback(() => {
    if (!world.frontier) return;
    const li = host.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(world.frontier.nodeId)}"] [data-map-node]`);
    li?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    li?.focus({ preventScroll: true });
  }, [world.frontier]);

  // ?node=<id> deep links focus that stop
  useEffect(() => {
    if (!width) return;
    const id = new URLSearchParams(window.location.search).get("node");
    if (!id) return;
    const el = host.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"] [data-map-node]`);
    el?.scrollIntoView({ block: "center" });
    el?.focus({ preventScroll: true });
  }, [width]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
      <div ref={host} className="flex min-w-0 flex-col gap-6">
        {spec.regions.map((r) => {
          const rp = world.regions[r.id];
          return (
            <section key={r.id} aria-labelledby={`rg-${r.id}`} className="border border-line bg-surface">
              <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
                    {r.code.toUpperCase()} · {r.module.replace(/^m\d+-/, "").replace(/-/g, " ")}
                    {r.status === "in-progress" ? " · open now" : r.detail === "outline" ? " · being written" : ""}
                  </span>
                  <h3 id={`rg-${r.id}`} className="m-0 font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-fg sm:text-[26px]">
                    {r.title}
                  </h3>
                  {r.intro && <p className="m-0 max-w-[640px] text-[14px] leading-relaxed text-fg-2">{r.intro}</p>}
                </div>
                {rp && (
                  <div className="flex min-w-[140px] flex-col items-end gap-1">
                    <span className="font-mono text-[12px] text-fg-2">
                      {rp.done}/{rp.total} stops · {rp.pct}%
                    </span>
                    <span aria-hidden className="h-1.5 w-full bg-line">
                      <span className="block h-full bg-signal" style={{ width: `${rp.pct}%` }} />
                    </span>
                  </div>
                )}
              </header>
              {!hasBuilt(r) && !unfolded[r.id] ? (
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <p className="m-0 text-[14px] text-fg-3">
                    {r.stretches.reduce((a, st) => a + st.nodes.filter((n) => n.type !== "gate").length, 0) + (r.boss ? 1 : 0)} stops, being written:{" "}
                    {r.stretches
                      .flatMap((st) => st.nodes.filter((n) => n.type === "concept"))
                      .slice(0, 4)
                      .map((n) => n.title)
                      .join(", ")}
                    …
                  </p>
                  <button
                    type="button"
                    onClick={() => setUnfolded((u) => ({ ...u, [r.id]: true }))}
                    aria-expanded={false}
                    className="min-h-11 border border-line-strong px-3 font-mono text-[12px] uppercase tracking-label text-fg-2 hover:text-fg"
                  >
                    Show the road
                  </button>
                </div>
              ) : (
                <>
              {r.stretches.length > 1 || r.detail === "full" ? (
                <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 font-mono text-[11px] uppercase tracking-label text-fg-3 sm:px-5">
                  {r.stretches.map((s, i) => (
                    <span key={s.id}>
                      Stretch {i + 1}: {s.title}
                    </span>
                  ))}
                </p>
              ) : null}
              <div className="px-1 pb-2 pt-1 sm:px-3">
                <RegionRoad region={r} progress={world} cols={cols} width={Math.max(0, width - (width < 640 ? 10 : 26))} onSelect={setSel} selectedId={shown?.node.id ?? null} />
              </div>
                </>
              )}
              {r.side.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
                  <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Side paths</span>
                  {r.side.map((n) => (
                    <span key={n.id} className="border border-dotted border-line-strong px-2 py-1 text-[12px] text-fg-3">
                      {n.title} · soon
                    </span>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <aside aria-label="Selected stop" className="lg:sticky lg:top-[calc(var(--hk-header-h,61px)+16px)] lg:self-start">
        <div className="flex flex-col gap-4 border border-line bg-surface p-5">
          <p className="m-0 font-mono text-[11px] uppercase tracking-label text-signal-text">{sel ? "Selected stop" : "Your next step"}</p>
          {shown ? <NodeDetail sel={shown} state={world.states[shown.node.id] || "locked"} /> : <p className="m-0 text-[14px] text-fg-2">Every open stop is done. New stops open with each wave.</p>}
          <p className="m-0 border-t border-line pt-3 font-mono text-[12px] text-fg-3">
            {progress.ready ? `${world.done} of ${world.total} required stops done` : "Loading your progress…"}
            {!progress.signedIn && progress.ready ? " · on this device" : ""}
          </p>
        </div>
      </aside>

      {world.frontier && (
        <button
          type="button"
          onClick={jump}
          className="fixed bottom-24 left-1/2 z-30 min-h-11 -translate-x-1/2 border border-line-strong bg-bg px-4 font-mono text-[12px] uppercase tracking-label text-fg shadow-sm lg:hidden"
        >
          Jump to current ↓
        </button>
      )}
    </div>
  );
}
