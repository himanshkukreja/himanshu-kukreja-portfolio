"use client";

/**
 * The metro map: the four course parts as coloured lines, topics as stations (SVG that scales to its width), the learner's
 * route bright and thick with everything else faded, "you are here" pulsing at the current station. The picture is SVG; the
 * stations are real buttons laid over it (a 44 px target each, roving tab stop, arrow keys follow the lines), with a
 * tooltip on hover and focus. A screen-reader list mirrors the whole map.
 */
import { useId, useRef, type KeyboardEvent } from "react";
import { LINE_NAME, LINE_TOKEN, TAGS, VIEW, type LineId } from "@/lib/dsa/metro/layout";
import { interchangeText, stepToward, type Metro, type Station } from "@/lib/dsa/metro/model";
import "./metro.css";

const tone = (l: LineId) => `var(${LINE_TOKEN[l]})`;
const R = 9;
const R_INTER = 12;

export function stateWords(s: Station): string {
  if (s.planned) return `Lessons on the way (${s.all} planned)`;
  if (s.state === "done") return `Done · ${s.total} of ${s.total} lessons`;
  if (s.state === "prog") return `In progress · ${s.done} of ${s.total} lessons done`;
  return `Not started · ${s.total} ${s.total === 1 ? "lesson" : "lessons"}`;
}

export default function MetroMap({
  metro,
  hereId,
  routeIds,
  shownId,
  pinnedId,
  focusId,
  onShow,
  onPin,
  onFocusId,
  lineTitle,
}: {
  metro: Metro;
  hereId: string;
  routeIds: string[];
  /** the station whose tooltip is up (hover or focus), null for none */
  shownId: string | null;
  pinnedId: string;
  focusId: string;
  onShow: (id: string | null) => void;
  onPin: (id: string) => void;
  onFocusId: (id: string) => void;
  lineTitle: (l: LineId) => string;
}) {
  const uid = useId();
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const route = new Set(routeIds);
  const here = metro.byId.get(hereId);
  const pts = routeIds.map((id) => metro.byId.get(id)).filter((s): s is Station => !!s);
  const routePts = pts.map((s) => `${s.x},${s.y}`).join(" ");
  const shown = shownId ? metro.byId.get(shownId) : null;

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const dir = ({ ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as const)[e.key as "ArrowLeft"];
    if (e.key === "Escape") {
      onShow(null);
      return;
    }
    if (!dir) return;
    e.preventDefault();
    const to = stepToward(metro, id, dir);
    if (to) {
      onFocusId(to);
      refs.current.get(to)?.focus();
    }
  };

  return (
    <div className="relative w-full select-none" style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}>
      <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-labelledby={`${uid}-t ${uid}-d`}>
        <title id={`${uid}-t`}>DSA Mastery course map</title>
        <desc id={`${uid}-d`}>
          {`Four coloured lines, one per part of the course: ${metro.lines.map((l) => l.title).join(", ")}. ${metro.stations.length} stations, one per topic. Your route is the bright thick line; everything else is faded but open. A list of every station follows for screen readers.`}
        </desc>
        <defs>
          <filter id={`${uid}-blur`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id={`${uid}-glow`} x="-20%" y="-200%" width="140%" height="500%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
        </defs>

        {metro.links.map(([a, b]) => {
          const p = metro.byId.get(a)!;
          const q = metro.byId.get(b)!;
          return <line key={`${a}-${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} strokeWidth={2} strokeDasharray="2 6" strokeLinecap="round" opacity={0.4} style={{ stroke: "var(--c-fg-3)" }} />;
        })}

        {metro.edges.map((e) => {
          const p = metro.byId.get(e.from)!;
          const q = metro.byId.get(e.to)!;
          return (
            <g key={`${e.from}-${e.to}`}>
              {e.done ? <line className="metro-glow" x1={p.x} y1={p.y} x2={q.x} y2={q.y} strokeWidth={10} filter={`url(#${uid}-glow)`} style={{ stroke: tone(e.line) }} strokeLinecap="round" /> : null}
              <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} strokeWidth={9} strokeLinecap="round" opacity={e.done ? 0.65 : 0.35} style={{ stroke: tone(e.line) }} />
              {e.done ? <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} strokeWidth={2.5} strokeLinecap="round" opacity={0.4} style={{ stroke: "var(--c-bg)" }} /> : null}
            </g>
          );
        })}

        {/* the route: a paper casing, the bright line (drawn in on load and whenever the goal changes), a highlight */}
        {pts.length > 1 ? (
          <g key={routeIds.join(">")} aria-hidden>
            <polyline points={routePts} className="metro-line" strokeWidth={22} strokeLinejoin="round" opacity={0.92} style={{ stroke: "var(--c-bg)" }} />
            <polyline points={routePts} pathLength={1} className="metro-line metro-route" strokeWidth={14} strokeLinejoin="round" style={{ stroke: "var(--c-signal)" }} />
            <polyline points={routePts} pathLength={1} className="metro-line metro-route" strokeWidth={2.5} strokeLinejoin="round" opacity={0.55} style={{ stroke: "var(--c-on-signal)" }} />
          </g>
        ) : null}

        {TAGS.filter((t) => metro.lines.some((l) => l.id === t.line)).map((t) => {
          const text = (metro.lines.find((l) => l.id === t.line)?.title || LINE_NAME[t.line]).toUpperCase();
          const w = text.length * 7.4 + 22;
          return (
            <g key={t.line} transform={`translate(${t.x},${t.y})`} opacity={0.92}>
              <rect width={w} height={22} rx={11} style={{ fill: tone(t.line) }} />
              <text x={11} y={15} fontSize={11} fontWeight={600} letterSpacing={0.5} style={{ fill: "var(--c-m-on)", fontFamily: "var(--font-geist-mono), monospace" }}>
                {text}
              </text>
            </g>
          );
        })}

        {metro.stations.map((s) => {
          const inter = s.lines.length > 1;
          const r = inter ? R_INTER : R;
          const strong = route.has(s.id) || s.id === hereId || s.id === pinnedId;
          const circ = 2 * Math.PI * (r - 2);
          const pct = s.total ? s.done / s.total : 0;
          let tx = s.x;
          let ty = s.y;
          let anchor: "middle" | "start" | "end" = "middle";
          if (s.side === "a") ty = s.y - r - 11;
          else if (s.side === "b") ty = s.y + r + 21;
          else if (s.side === "r") {
            tx = s.x + r + 11;
            ty = s.y + 5;
            anchor = "start";
          } else {
            tx = s.x - r - 11;
            ty = s.y + 5;
            anchor = "end";
          }
          return (
            <g key={s.id} opacity={strong ? 1 : s.state === "done" ? 0.62 : 0.4} aria-hidden>
              {s.state === "done" ? <circle className="metro-halo" cx={s.x} cy={s.y} r={r + 7} filter={`url(#${uid}-blur)`} style={{ fill: tone(s.line) }} /> : null}
              {inter ? <circle cx={s.x} cy={s.y} r={r + 4} fill="none" strokeWidth={2} style={{ stroke: "var(--c-fg)" }} /> : null}
              <circle
                cx={s.x}
                cy={s.y}
                r={r}
                strokeWidth={s.state === "done" ? 3 : s.state === "prog" ? 4 : 3}
                style={{ fill: s.state === "done" ? tone(s.line) : "var(--c-surface)", stroke: s.state === "done" ? "var(--c-surface)" : s.state === "prog" ? "var(--c-line-strong)" : tone(s.line) }}
              />
              {s.state === "prog" ? (
                <circle cx={s.x} cy={s.y} r={r - 2} fill="none" strokeWidth={4} strokeLinecap="round" strokeDasharray={`${(pct * circ).toFixed(1)} ${circ.toFixed(1)}`} transform={`rotate(-90 ${s.x} ${s.y})`} style={{ stroke: tone(s.line) }} />
              ) : null}
              {s.state === "done" ? (
                <path d={`M${s.x - 4} ${s.y + 0.5} l3 3.2 l5.2 -6`} fill="none" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--c-m-on)" }} />
              ) : null}
              {s.id === pinnedId && s.id !== hereId ? <circle cx={s.x} cy={s.y} r={r + 10} fill="none" strokeWidth={2} strokeDasharray="3 4" style={{ stroke: "var(--c-fg)" }} /> : null}
              <text x={tx} y={ty} fontSize={15} fontWeight={600} textAnchor={anchor} paintOrder="stroke" strokeWidth={4} strokeLinejoin="round" style={{ fill: "var(--c-fg)", stroke: "var(--c-bg)", fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}>
                {s.label}
              </text>
            </g>
          );
        })}

        {/* "+N": the station has N extra practice lessons (streets, camp tents, sets); a small pill beside the dot, clear of the label and the "you are here" tag */}
        {metro.stations.map((s) => {
          const n = s.branches.length;
          if (!n) return null;
          const r = s.lines.length > 1 ? R_INTER : R;
          const text = `+${n}`;
          const w = 11 + text.length * 6.6;
          const above = s.side === "b";
          const side = s.side === "a" || s.side === "b";
          const cx = side ? s.x + r + 8 + w / 2 - 4 : s.x;
          const cy = side ? (above ? s.y - r - 3 : s.y + r + 5) : s.y + r + 13;
          return (
            <g key={`badge-${s.id}`} data-badge={s.id} aria-hidden transform={`translate(${cx},${cy})`}>
              <rect x={-w / 2} y={-8} width={w} height={16} rx={8} strokeWidth={1.25} style={{ fill: "var(--c-surface)", stroke: "var(--c-fg-3)" }} />
              <text x={0} y={4} fontSize={10.5} fontWeight={700} textAnchor="middle" style={{ fill: "var(--c-fg)", fontFamily: "var(--font-geist-mono), monospace" }}>
                {text}
              </text>
            </g>
          );
        })}

        {here ? (
          <g transform={`translate(${here.x},${here.y})`} aria-hidden>
            <circle cx={0} cy={0} r={11} fill="none" strokeWidth={3} className="metro-pulse" style={{ stroke: "var(--c-signal)" }} />
            <circle cx={0} cy={0} r={(here.lines.length > 1 ? R_INTER : R) + 8} fill="none" strokeWidth={2.5} style={{ stroke: "var(--c-signal)" }} />
            <g transform={`translate(0,${here.side === "a" ? -70 : -50})`}>
              <rect x={-52} y={0} width={104} height={22} rx={11} style={{ fill: "var(--c-signal)" }} />
              <path d="M-5 22 L0 29 L5 22 Z" style={{ fill: "var(--c-signal)" }} />
              <text x={0} y={15} fontSize={10.5} fontWeight={600} textAnchor="middle" letterSpacing={0.5} style={{ fill: "var(--c-on-signal)", fontFamily: "var(--font-geist-mono), monospace" }}>
                YOU ARE HERE
              </text>
            </g>
          </g>
        ) : null}
      </svg>

      {/* the stations as buttons over the picture */}
      {metro.stations.map((s) => {
        const tip = `${uid}-tip-${s.id}`;
        return (
          <button
            key={s.id}
            ref={(el) => {
              if (el) refs.current.set(s.id, el);
              else refs.current.delete(s.id);
            }}
            type="button"
            tabIndex={s.id === focusId ? 0 : -1}
            data-station={s.id}
            data-tour={s.id === hereId ? "station" : undefined}
            aria-label={`${s.label}${s.branches.length ? `, ${s.branches.length} more practice ${s.branches.length === 1 ? "lesson" : "lessons"}` : ""}. ${s.lines.map(lineTitle).join(" and ")}${s.lines.length > 1 ? " lines" : " line"}. ${stateWords(s)}.${s.id === hereId ? " You are here." : ""}`}
            aria-describedby={shownId === s.id ? tip : undefined}
            aria-pressed={pinnedId === s.id}
            onClick={() => onPin(s.id)}
            onMouseEnter={() => onShow(s.id)}
            onMouseLeave={() => onShow(null)}
            onFocus={() => {
              onShow(s.id);
              onFocusId(s.id);
            }}
            onBlur={() => onShow(null)}
            onKeyDown={(e) => onKey(e, s.id)}
            className="absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal-text"
            style={{ left: `${(s.x / VIEW.w) * 100}%`, top: `${(s.y / VIEW.h) * 100}%` }}
          />
        );
      })}

      {shown ? (
        <div
          id={`${uid}-tip-${shown.id}`}
          role="tooltip"
          className="metro-tip absolute z-20 w-[230px] rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-[12.5px] leading-snug text-fg shadow-[0_10px_30px_color-mix(in_srgb,var(--c-fg)_14%,transparent)]"
          style={{
            left: `${(shown.x / VIEW.w) * 100}%`,
            top: `${(shown.y / VIEW.h) * 100}%`,
            transform: `translate(${shown.x < 140 ? "-20%" : shown.x > 1120 ? "-80%" : "-50%"}, ${shown.y > 160 ? "calc(-100% - 26px)" : "28px"})`,
          }}
        >
          <span className="block text-[13.5px] font-semibold">
            {shown.label} · {shown.planned ? "lessons on their way" : `${shown.total} ${shown.total === 1 ? "lesson" : "lessons"} · ${shown.id === pinnedId ? "listed in the station card" : "click to see them"}`}
          </span>
          {shown.lines.length > 1 ? <span className="mt-0.5 block text-fg-2">{interchangeText(shown, lineTitle)}</span> : <span className="mt-0.5 block text-fg-3">{lineTitle(shown.line)} line</span>}
          <span className="mt-1 block text-fg-3">{stateWords(shown)}</span>
          {shown.branches.length ? <span className="mt-0.5 block text-fg-3">+{shown.branches.length} practice {shown.branches.length === 1 ? "lesson" : "lessons"}</span> : null}
        </div>
      ) : null}

      {/* the same map as a list, for screen readers */}
      <div className="sr-only">
        <h3>Course map as a list</h3>
        {metro.lines.map((l) => (
          <section key={l.id}>
            <h4>{l.title} line</h4>
            <ol>
              {metro.stations
                .filter((s) => s.lines.includes(l.id))
                .map((s) => (
                  <li key={s.id}>
                    {s.label}: {stateWords(s)}.{s.lines.length > 1 ? ` ${interchangeText(s, lineTitle)}` : ""}
                    {routeIds.includes(s.id) ? " On your route." : ""}
                    {s.id === hereId ? " You are here." : ""}
                    {s.href ? <a href={s.href}> Open {s.label}</a> : null}
                  </li>
                ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
