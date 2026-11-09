"use client";

/**
 * A world's roadmap as a campus (design "A · Campus map"): the world header (progress, "Continue"), one building per
 * region on a snaking footpath, and the selected building's panel (its current stretch: rooms, paving stones, the
 * front desk and the door), progress from useDsaProgress() through computeWorld() and campusOf().
 *
 * - Desktop (lg, 1024 px and up): three buildings a row, row 2 right to left; the footpath is an SVG (aria-hidden)
 *   drawn through the measured tile centres, teal where walked. The panel is a sticky aside.
 * - Phone and tablet: the same tiles in one column on a vertical path; the panel opens inline under the tapped
 *   building (tap again to fold it).
 * - The buildings are buttons in an ordered list (Tab, or the arrow keys along the path; Enter selects). States are
 *   words and icons, never colour alone. ?node=<id> opens that stop's building and stretch (the concept page links it).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeWorld, type NodeState } from "@/lib/dsa/map/progress";
import { campusOf, clock, type Building, type Campus as CampusModel, type StretchView } from "@/lib/dsa/map/campus";
import type { WorldNode, WorldSpec } from "@/lib/dsa/types";
import { useDsaProgress } from "../progress/useDsaProgress";

/** A concept's lecture: its page, the media folder's slug and the script hash its recording must match. */
export type LectureRef = { href: string; slug: string; source: string };

const COLS = 3;
const DESKTOP = "(min-width: 1024px)";

/** What the Academy calls its map; other worlds use their title. */
const PLACE: Record<string, string> = { academy: "The campus" };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function useDesktop(): boolean | null {
  const [desk, setDesk] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const on = () => setDesk(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desk;
}

/** Seconds of a lecture's recording, when it is published and made from this exact script (else null). */
const durations = new Map<string, number | null>();
function useLectureSeconds(base: string | null, lec: LectureRef | null): number | null {
  const key = lec ? `${lec.slug}@${lec.source}` : "";
  const ok = !!lec && !!base && /^https?:\/\//.test(base);
  const [, bump] = useState(0);
  useEffect(() => {
    if (!ok || !lec || !base || durations.has(key)) return;
    let off = false;
    fetch(`${base.replace(/\/$/, "")}/${lec.slug}/media.json`)
      .then((r) => (r.ok ? (r.json() as Promise<{ source?: string; duration?: number }>) : null))
      .then((m) => {
        durations.set(key, m && m.source === lec.source && m.duration ? m.duration : null);
        if (!off) bump((x) => x + 1);
      })
      .catch(() => durations.set(key, null));
    return () => {
      off = true;
    };
  }, [ok, base, lec, key]);
  return ok ? (durations.get(key) ?? null) : null;
}

/* ------------------------------------------------------------------ glyphs */

const Check = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="square" aria-hidden>
    <path d="M4 12.5l5 5L20 6.5" />
  </svg>
);
const Lock = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
    <rect x="5" y="11" width="14" height="9" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
const Hall = () => (
  <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden className="shrink-0">
    <path d="M4 20h16M6 20V9l6-5 6 5v11M10 20v-5h4v5" />
  </svg>
);

/* ------------------------------------------------------------------ building tiles */

function Segments({ fill, total, tone }: { fill: number; total: number; tone: "light" | "plate" }) {
  if (total <= 0) return null;
  return (
    <span aria-hidden className="flex gap-[3px]">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="h-[5px] flex-1"
          style={{
            background: i < fill ? (tone === "plate" ? "var(--c-plate-accent)" : "var(--c-signal)") : tone === "plate" ? "color-mix(in srgb, var(--c-plate-fg) 22%, transparent)" : "var(--c-line)",
          }}
        />
      ))}
    </span>
  );
}

function tileBody(b: Building, campusStarted: boolean) {
  const code = b.region.code.toUpperCase();
  const st = b.stretches[b.focus];
  const stretchesDone = b.stretches.filter((s) => s.complete).length;
  const problems = b.stretches.reduce((a, s) => a + s.practice, 0);
  switch (b.state) {
    case "current":
      return {
        left: `${code} · ${campusStarted ? "You are here" : "Start here"}`,
        right: st && st.practice ? `${st.practiceDone} / ${st.practice}` : "",
        rightSr: st && st.practice ? `${st.practiceDone} of ${st.practice} problems in this stretch solved` : "",
        seg: st ? { fill: st.stepsDone, total: st.steps } : null,
        line: st ? `Stretch ${st.index + 1} · ${st.title}` : "",
      };
    case "cleared":
      return { left: code, right: "✓ Cleared", rightSr: "", seg: { fill: b.stretches.length, total: b.stretches.length }, line: "" };
    case "open":
      return {
        left: code,
        right: b.started ? "In progress" : "Open",
        rightSr: "",
        seg: { fill: stretchesDone, total: b.stretches.length },
        line: `${b.stretches.length} ${b.stretches.length === 1 ? "stretch" : "stretches"} · ${problems} problems`,
      };
    case "planned":
      return { left: code, right: "Soon", rightSr: "", seg: null, line: b.concepts.length ? `${b.concepts.length} concepts · being written` : "Being written" };
    default:
      return { left: code, right: "Later", rightSr: "", seg: null, line: "Opens later" };
  }
}

function Tile({
  b,
  campusStarted,
  selected,
  desktop,
  onSelect,
}: {
  b: Building;
  campusStarted: boolean;
  selected: boolean;
  desktop: boolean | null;
  onSelect: () => void;
}) {
  const t = tileBody(b, campusStarted);
  const cur = b.state === "current";
  const dim = b.state === "planned" || b.state === "later";
  const tone =
    cur
      ? "border-2 border-signal bg-[var(--c-plate)] p-[18px] text-[var(--c-plate-fg)] shadow-[8px_8px_0_var(--c-signal)] lg:max-w-[232px]"
      : b.state === "cleared"
        ? "border border-signal-text bg-surface p-3.5 text-fg lg:max-w-[200px]"
        : dim
          ? "border border-dashed border-line-strong bg-surface-2 p-3.5 text-fg-3 lg:max-w-[200px]"
          : "border border-line-strong bg-surface p-3.5 text-fg lg:max-w-[200px]";
  const headTone = cur ? "text-[var(--c-plate-accent)]" : b.state === "cleared" ? "text-signal-text" : "text-fg-3";
  const stretchesDone = b.stretches.filter((s) => s.complete).length;
  return (
    <button
      type="button"
      data-campus-tile
      onClick={onSelect}
      aria-pressed={desktop ? selected : undefined}
      aria-expanded={desktop === false ? selected : undefined}
      className={`relative z-[1] flex w-full flex-col gap-2 text-left outline-none transition-[outline-color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-signal ${tone} ${
        selected && !cur ? "outline outline-2 outline-offset-4 outline-fg" : ""
      }`}
    >
      <span className={`flex items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-label ${headTone}`}>
        <span>{t.left}</span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          {b.state === "planned" || b.state === "later" ? <Lock /> : null}
          <span aria-hidden={t.rightSr ? true : undefined}>{t.right}</span>
          {t.rightSr ? <span className="sr-only">{t.rightSr}</span> : null}
        </span>
      </span>
      <span className={`font-display font-extrabold leading-[1.05] tracking-[-0.02em] ${cur ? "text-[24px]" : "text-[20px]"} ${dim ? "text-fg-2" : ""}`}>{b.region.title}</span>
      {t.seg ? (
        <>
          <Segments fill={t.seg.fill} total={t.seg.total} tone={cur ? "plate" : "light"} />
          {!cur && <span className="sr-only">{`${stretchesDone} of ${b.stretches.length} stretches done.`}</span>}
        </>
      ) : null}
      {t.line ? <span className={`text-[13px] leading-snug ${cur ? "text-[var(--c-plate-fg-2)]" : dim ? "text-[12px]" : "text-fg-3"}`}>{t.line}</span> : null}
    </button>
  );
}

function FinalTile({ node, selected, desktop, onSelect }: { node: WorldNode; selected: boolean; desktop: boolean | null; onSelect: () => void }) {
  return (
    <button
      type="button"
      data-campus-tile
      onClick={onSelect}
      aria-pressed={desktop ? selected : undefined}
      aria-expanded={desktop === false ? selected : undefined}
      className={`relative z-[1] flex w-full items-center gap-3.5 border-2 border-fg bg-surface px-4 py-3.5 text-left text-fg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-signal lg:max-w-[280px] ${
        selected ? "outline outline-2 outline-offset-4 outline-fg" : ""
      }`}
    >
      <Hall />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
          Final{node.building ? ` · ${node.building}` : ""}
          <span className="sr-only">, locked until every building review is cleared</span>
        </span>
        <span className="font-display text-[18px] font-extrabold leading-tight">
          {node.title}
          {node.badge ? " · certificate" : ""}
        </span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ the selected building */

type Stops = WorldSpec["theme"]["stops"];

function RowBox({ n, state, isNext }: { n: WorldNode; state: NodeState; isNext: boolean }) {
  const base = "grid h-[22px] w-[22px] shrink-0 place-items-center font-mono text-[11px]";
  if (state === "done") return <span className={`${base} bg-signal text-on-signal`}><Check /></span>;
  if (isNext) return <span className={`${base} border-2 border-signal text-signal-text`} aria-hidden>▶</span>;
  if (state === "locked") return <span className={`${base} border border-line-strong text-fg-4`}><Lock /></span>;
  if (state === "soon") return <span className={`${base} border border-dotted border-line-strong`} aria-hidden />;
  if (n.type === "checkpoint") return <span className={`${base} border border-line-strong text-fg-3`} aria-hidden>?</span>;
  if (n.type === "gate") return <span className={`${base} border border-line-strong text-[12px] text-fg-3`} aria-hidden>⌂</span>;
  return <span className={`${base} border border-line-strong`} aria-hidden />;
}

const SR_STATE: Record<NodeState, string> = { done: "done", current: "next", open: "open", locked: "locked", soon: "coming soon" };

function StretchRow({
  n,
  state,
  isNext,
  stops,
  after,
  regionTitle,
}: {
  n: WorldNode;
  state: NodeState;
  isNext: boolean;
  stops: Stops;
  after: { index: number; title: string } | null;
  regionTitle: string;
}) {
  let label: string;
  let meta = "";
  if (n.type === "concept") {
    label = `${cap(stops.concept || "lesson")} · ${n.title}`;
    meta = state === "soon" ? "soon" : "lesson";
  } else if (n.type === "practice") {
    label = n.title;
    meta = state === "soon" ? "soon" : `${n.required ? "" : "bonus · "}${n.level || ""}`;
  } else if (n.type === "checkpoint") {
    const k = (n.problems || []).length;
    label = `${cap(stops.checkpoint || "checkpoint")} · checkpoint (quiz${k ? ` + ${k} problems` : ""})`;
    meta = state === "soon" ? "soon" : `${Math.round((n.pass ?? 0.8) * 100)}% to pass`;
  } else {
    const door = cap(stops.gate || "gate");
    label = after ? `${door} to stretch ${after.index + 1} · ${after.title}` : `${door} out of ${regionTitle}`;
    meta = state === "done" ? "open" : "";
  }
  const link = !!n.href && state !== "locked" && state !== "soon" && n.type !== "gate";
  const why =
    state === "locked"
      ? n.type === "checkpoint"
        ? `: appears once ${Math.round((n.opensAt ?? 0.7) * 100)}% of this stretch's practice is solved`
        : n.type === "gate"
          ? ": opens when you pass the checkpoint"
          : ": opens when the door before it opens"
      : "";
  const cls = `flex min-h-11 items-center gap-3 border-t border-line px-3.5 py-3 ${isNext ? "bg-signal/10" : ""} ${state === "locked" || state === "soon" ? "text-fg-3" : "text-fg"}`;
  const body = (
    <>
      <RowBox n={n} state={state} isNext={isNext} />
      {/* label and meta wrap onto two lines when the row is narrow (the inline panel on a 320 px phone) */}
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className={`min-w-0 grow basis-[9rem] break-words text-[14px] leading-snug ${isNext ? "font-semibold" : ""}`}>
          {label}
          <span className="sr-only">
            {", "}
            {isNext ? "next" : SR_STATE[state]}
            {why}
          </span>
        </span>
        {meta || isNext ? (
          <span aria-hidden className={`shrink-0 font-mono text-[11px] ${isNext ? "text-signal-text" : "text-fg-3"}`}>
            {isNext ? "next" : meta}
          </span>
        ) : null}
      </span>
    </>
  );
  return (
    <li data-node-row={n.id}>
      {link ? (
        <Link href={n.href!} className={`${cls} outline-none hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal`}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

function primaryOf(st: StretchView, states: Record<string, NodeState>): { href: string; text: string } | null {
  const n = st.next;
  if (n?.href) {
    if (n.type === "practice") return { href: n.href, text: "Solve the next problem" };
    if (n.type === "concept") return { href: n.href, text: "Read the lesson" };
    if (n.type === "checkpoint") return { href: n.href, text: "Take the checkpoint" };
  }
  const extra = st.nodes.find((x) => x.type === "practice" && x.href && (states[x.id] === "open" || states[x.id] === "current"));
  if (extra?.href) return { href: extra.href, text: "Solve the next problem" };
  const lesson = st.nodes.find((x) => x.type === "concept" && x.href);
  if (st.complete && lesson?.href) return { href: lesson.href, text: "Review the lesson" };
  return null;
}

function lectureOf(st: StretchView, states: Record<string, NodeState>, lectures: Record<string, LectureRef>): LectureRef | null {
  const withLecture = st.nodes.filter((n) => n.type === "concept" && n.ref && lectures[n.ref]);
  const pick = withLecture.find((n) => states[n.id] !== "done") || withLecture[0];
  return pick?.ref ? lectures[pick.ref] : null;
}

function LectureButton({ lec, base }: { lec: LectureRef; base: string | null }) {
  const secs = useLectureSeconds(base, lec);
  return (
    <Link
      href={lec.href}
      className="inline-flex min-h-12 items-center justify-center whitespace-nowrap border border-line-strong px-4 font-mono text-[14px] text-fg hover:border-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
    >
      <span aria-hidden>▶&nbsp;</span>Lecture{secs ? ` ${clock(secs)}` : null}
    </Link>
  );
}

function BuildingPanel({
  spec,
  b,
  stretchIdx,
  onStretch,
  states,
  lectures,
  mediaBase,
  headingId,
  compact = false,
}: {
  spec: WorldSpec;
  b: Building;
  stretchIdx: number;
  onStretch: (i: number) => void;
  states: Record<string, NodeState>;
  lectures: Record<string, LectureRef>;
  mediaBase: string | null;
  headingId: string;
  /** inline under its tile (phone): the tile already shows the code and name, so they are for screen readers only */
  compact?: boolean;
}) {
  const r = b.region;
  const stops = spec.theme.stops;
  const topic = r.line || (r.module || "").replace(/^m\d+-/, "").replace(/-/g, " ");
  const eyebrow = topic ? `${r.code.toUpperCase()} · ${topic}` : r.code.toUpperCase();
  const intro = r.intro || r.objective;
  const st = b.stretches[stretchIdx] || b.stretches[0];
  const full = b.state !== "planned" && b.state !== "later" && !!st;
  const primary = full ? primaryOf(st, states) : null;
  const lec = full ? lectureOf(st, states, lectures) : null;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-signal-text">{eyebrow}</span>
        <h2 id={headingId} className={compact ? "sr-only" : "m-0 font-display text-[28px] font-extrabold leading-none tracking-[-0.03em] text-fg xl:text-[34px]"}>
          {r.title}
        </h2>
        {intro ? <p className="m-0 text-[14px] leading-relaxed text-fg-2">{intro}</p> : null}
      </div>

      {full ? (
        <>
          <div className="flex flex-col border border-line bg-surface">
            <div className="flex items-baseline justify-between gap-3 bg-surface-2 px-3.5 py-2.5 font-mono text-[11px] uppercase tracking-label text-fg-2">
              <span>
                Stretch {st.index + 1} · {st.title}
              </span>
              <span className="shrink-0">
                <span aria-hidden>
                  {st.stepsDone} / {st.steps}
                </span>
                <span className="sr-only">
                  {st.stepsDone} of {st.steps} stops done
                </span>
              </span>
            </div>
            <ol className="m-0 list-none p-0">
              {st.nodes.map((n) => {
                const after = n.type === "gate" ? b.stretches[st.index + 1] : null;
                return (
                  <StretchRow
                    key={n.id}
                    n={n}
                    state={states[n.id] || "locked"}
                    isNext={st.next?.id === n.id}
                    stops={stops}
                    after={after ? { index: after.index, title: after.title } : null}
                    regionTitle={r.title}
                  />
                );
              })}
            </ol>
          </div>

          {primary || lec ? (
            <div className="flex flex-wrap gap-2.5">
              {primary ? (
                <Link
                  href={primary.href}
                  className="inline-flex min-h-12 min-w-[9rem] flex-1 basis-0 items-center justify-center bg-signal px-3 py-2 text-center font-mono text-[14px] text-on-signal hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                >
                  {primary.text}
                </Link>
              ) : null}
              {lec ? <LectureButton lec={lec} base={mediaBase} /> : null}
            </div>
          ) : null}

          {b.stretches.length > 1 || r.boss ? (
            <ul className="m-0 flex list-none flex-col gap-0.5 border-t border-line p-0 pt-3 font-mono text-[12px] text-fg-3">
              {b.stretches.map((s) =>
                s.index === st.index ? null : (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onStretch(s.index)}
                      className="flex min-h-9 w-full items-center justify-between gap-3 text-left hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
                    >
                      <span>
                        Stretch {s.index + 1} · {s.title}
                        <span className="sr-only">: show it</span>
                      </span>
                      <span className="shrink-0">{s.complete ? "✓" : `${s.stepsDone}/${s.steps}`}</span>
                    </button>
                  </li>
                ),
              )}
              {r.boss ? (
                <li className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1">
                  <span>Building review · {r.boss.title}</span>
                  <span className="inline-flex shrink-0 items-center gap-1">
                    <Lock />
                    after every {stops.checkpoint || "checkpoint"}
                  </span>
                </li>
              ) : null}
            </ul>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col border border-dashed border-line-strong bg-surface-2">
          <div className="px-3.5 py-2.5 font-mono text-[11px] uppercase tracking-label text-fg-2">
            {b.state === "later" ? `Opens with ${spec.title}` : "Being written"}
          </div>
          {b.state === "later" ? (
            <p className="m-0 border-t border-line px-3.5 py-3 text-[14px] leading-relaxed text-fg-2">{spec.atLaunch || "This world opens later."}</p>
          ) : b.concepts.length ? (
            <ol className="m-0 list-none p-0">
              {b.concepts.map((n) => (
                <li key={n.id} className="flex min-h-11 items-center gap-3 border-t border-line px-3.5 py-2.5 text-fg-2">
                  <span aria-hidden className="h-[22px] w-[22px] shrink-0 border border-dotted border-line-strong" />
                  <span className="min-w-0 flex-1 text-[14px]">
                    {cap(stops.concept || "lesson")} · {n.title}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-fg-3">soon</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="m-0 border-t border-line px-3.5 py-3 text-[14px] text-fg-2">Its lessons and problems are being written.</p>
          )}
          {r.boss && b.state === "planned" ? (
            <p className="m-0 border-t border-line px-3.5 py-2.5 font-mono text-[12px] text-fg-3">Building review · {r.boss.title}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function FinalPanel({ spec, node, headingId }: { spec: WorldSpec; node: WorldNode; headingId: string }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-signal-text">Final{node.building ? ` · ${node.building}` : ""}</span>
      <h2 id={headingId} className="m-0 font-display text-[28px] font-extrabold leading-none tracking-[-0.03em] text-fg xl:text-[34px]">
        {node.title}
      </h2>
      <p className="m-0 text-[14px] leading-relaxed text-fg-2">
        Opens when every building review in {spec.title} is cleared.
        {node.badge ? ` Pass it for the ${node.badge} certificate.` : ""}
      </p>
      <p className="m-0 inline-flex items-center gap-1.5 font-mono text-[12px] text-fg-3">
        <Lock /> Locked
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ the footpath (desktop) */

function Footpath({ list, walked, deps }: { list: React.RefObject<HTMLOListElement | null>; walked: boolean[]; deps: string }) {
  const [geo, setGeo] = useState<{ w: number; h: number; pts: { x: number; y: number }[] }>({ w: 0, h: 0, pts: [] });
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const mq = window.matchMedia(DESKTOP);
    const measure = () => {
      if (!mq.matches) return setGeo((g) => (g.pts.length ? { w: 0, h: 0, pts: [] } : g));
      const box = el.getBoundingClientRect();
      const pts = Array.from(el.querySelectorAll<HTMLElement>("[data-campus-tile]")).map((t) => {
        const b = t.getBoundingClientRect();
        return { x: Math.round(b.left - box.left + b.width / 2), y: Math.round(b.top - box.top + b.height / 2) };
      });
      setGeo({ w: Math.round(box.width), h: Math.round(box.height), pts });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.querySelectorAll("[data-campus-tile]").forEach((t) => ro.observe(t));
    mq.addEventListener("change", measure);
    measure();
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", measure);
    };
  }, [list, deps]);
  const { w, h, pts } = geo;
  if (pts.length < 2) return null;
  const all = pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  return (
    <svg aria-hidden className="pointer-events-none absolute left-0 top-0 hidden lg:block" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={all} fill="none" stroke="var(--c-line-strong)" strokeWidth={14} strokeLinecap="square" strokeLinejoin="miter" />
      {pts.slice(1).map((p, i) =>
        walked[i] ? <path key={i} d={`M${pts[i].x} ${pts[i].y} L${p.x} ${p.y}`} fill="none" stroke="var(--c-signal)" strokeWidth={14} strokeLinecap="square" /> : null,
      )}
      <path d={all} fill="none" stroke="var(--c-bg)" strokeWidth={2} strokeDasharray="6 10" />
    </svg>
  );
}

/* ------------------------------------------------------------------ the world */

type Sel = number | "final";

function WorldHeader({ spec, model, progress, frontier }: { spec: WorldSpec; model: CampusModel | null; progress: ReturnType<typeof useDsaProgress>; frontier: WorldNode | null }) {
  const stops = spec.theme.stops;
  const stopLine =
    stops.concept && stops.practice && stops.checkpoint && stops.gate
      ? ` ${cap(stops.concept)}s teach, ${stops.practice}s are problems, the ${stops.checkpoint} checks you, the ${stops.gate} opens the next stretch.`
      : "";
  const ids = useMemo(() => {
    const practice = new Set<string>();
    const concepts = new Set<string>();
    for (const r of spec.regions)
      for (const st of r.stretches)
        for (const n of st.nodes) {
          if (n.type === "practice" && n.ref) practice.add(n.ref);
          if (n.type === "checkpoint") (n.problems || []).forEach((p) => practice.add(p.id));
          if (n.type === "concept" && n.ref) concepts.add(n.ref);
        }
    return { practice, concepts };
  }, [spec]);
  const solved = [...ids.practice].filter((id) => progress.solved.has(id)).length;
  const lessons = [...ids.concepts].filter((id) => progress.concepts.has(id)).length;
  const n = spec.regions.length;
  const cleared = model?.cleared ?? 0;
  return (
    <header className="flex flex-col gap-6 border-b border-line pb-6 xl:flex-row xl:items-end xl:justify-between xl:gap-8">
      <div className="flex min-w-0 flex-col gap-2.5">
        <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-signal-text">
          World {spec.order}
          {spec.division ? ` · ${spec.division}` : ""}
          {spec.subtitle ? ` · ${spec.subtitle}` : ""}
        </span>
        <h1 className="m-0 font-display text-[44px] font-extrabold leading-none tracking-[-0.04em] text-fg sm:text-[56px]">
          {PLACE[spec.id] || spec.title}
          <span className="text-signal">.</span>
        </h1>
        <p className="m-0 max-w-[620px] text-[16px] leading-normal text-fg-2">
          {spec.theme.map}
          {stopLine}
        </p>
      </div>
      {spec.open && n > 0 ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6 xl:shrink-0">
          <div className="flex min-w-0 flex-col gap-2 sm:min-w-[240px]">
            <div className="flex justify-between gap-3 font-mono text-[12px] text-fg-3">
              <span>{spec.title} progress</span>
              <span className="text-fg">
                {cleared} of {n} buildings
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`${spec.title} buildings cleared`}
              aria-valuemin={0}
              aria-valuemax={n}
              aria-valuenow={cleared}
              className="flex h-2 bg-surface-2"
            >
              <div className="bg-signal" style={{ width: `${Math.round((cleared / n) * 100)}%` }} />
            </div>
            <div className="font-mono text-[12px] text-fg-3" aria-live="polite">
              {progress.ready ? (
                <>
                  {solved} {solved === 1 ? "problem" : "problems"} solved · {lessons} {lessons === 1 ? "lesson" : "lessons"} done
                  {!progress.signedIn ? " · on this device" : ""}
                </>
              ) : (
                "Loading your progress…"
              )}
            </div>
          </div>
          {frontier?.href ? (
            <Link
              href={frontier.href}
              aria-busy={!progress.ready}
              className={`inline-flex min-h-12 items-center justify-center bg-signal px-[22px] py-2 text-center sm:whitespace-nowrap font-mono text-[14px] font-medium text-on-signal hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
                progress.ready ? "" : "invisible"
              }`}
            >
              {model?.started ? "Continue" : "Start"}: {frontier.title} →
            </Link>
          ) : null}
        </div>
      ) : !spec.open ? (
        <div className="flex max-w-[420px] flex-col gap-2">
          <span className="inline-flex items-center gap-1.5 self-start border border-line-strong px-2 py-1 font-mono text-[11px] uppercase tracking-label text-fg-3">
            <Lock /> Opens later
          </span>
          {spec.atLaunch ? <p className="m-0 text-[14px] leading-relaxed text-fg-2">{spec.atLaunch}</p> : null}
        </div>
      ) : null}
    </header>
  );
}

export default function Campus({ spec, lectures, mediaBase }: { spec: WorldSpec; lectures: Record<string, LectureRef>; mediaBase: string | null }) {
  const progress = useDsaProgress();
  const world = useMemo(() => computeWorld(spec, progress), [spec, progress]);
  const model = useMemo(() => campusOf(spec, world), [spec, world]);
  const desktop = useDesktop();
  const listRef = useRef<HTMLOListElement>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [stretchSel, setStretchSel] = useState<number | null>(null);
  const [folded, setFolded] = useState(false);

  const frontier = useMemo(() => {
    if (!world.frontier) return null;
    return spec.regions.flatMap((r) => r.stretches.flatMap((s) => s.nodes)).find((n) => n.id === world.frontier!.nodeId) || null;
  }, [world.frontier, spec.regions]);

  const fallback = model.current >= 0 ? model.current : Math.max(0, model.buildings.findIndex((b) => b.state === "open"));
  const shown: Sel = sel ?? fallback;
  const shownB = shown === "final" ? null : model.buildings[shown] || null;
  const stretchIdx = shownB ? (stretchSel ?? shownB.focus) : 0;

  const select = useCallback(
    (s: Sel) => {
      if (desktop === false && s === shown && !folded) return setFolded(true);
      setSel(s);
      setStretchSel(null);
      setFolded(false);
    },
    [desktop, shown, folded],
  );

  // ?node=<id>: open that stop's building and stretch, and focus its row
  const pendingRow = useRef<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("node");
    if (!id) return;
    const ri = spec.regions.findIndex((r) => r.stretches.some((s) => s.nodes.some((n) => n.id === id)));
    if (ri < 0) return;
    pendingRow.current = id;
    // the URL is only readable after hydration (the page is prerendered)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSel(ri);
    setStretchSel(spec.regions[ri].stretches.findIndex((s) => s.nodes.some((n) => n.id === id)));
  }, [spec]);
  useEffect(() => {
    const id = pendingRow.current;
    if (!id || desktop === null) return;
    const row = document.querySelector<HTMLElement>(`[data-node-row="${CSS.escape(id)}"]`);
    if (!row) return;
    pendingRow.current = null;
    row.scrollIntoView({ block: "center" });
    const target = row.querySelector<HTMLElement>("a") || row;
    if (target === row) row.tabIndex = -1; // a locked stop is not a link: focus its row
    target.focus({ preventScroll: true });
  }, [desktop, sel, stretchSel]);

  const onKey = (e: React.KeyboardEvent<HTMLOListElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-campus-tile]") || []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? Math.min(items.length - 1, at + 1) : Math.max(0, at - 1);
    items[next]?.focus();
  };

  const headingId = `campus-panel-${spec.id}`;
  const panel =
    shown === "final" ? (
      spec.final ? <FinalPanel spec={spec} node={spec.final} headingId={headingId} /> : null
    ) : shownB ? (
      <BuildingPanel
        spec={spec}
        b={shownB}
        stretchIdx={stretchIdx}
        onStretch={setStretchSel}
        states={world.states}
        lectures={lectures}
        mediaBase={mediaBase}
        headingId={headingId}
        compact={desktop === false}
      />
    ) : null;

  const n = model.buildings.length;
  const place = (i: number) => {
    const row = Math.floor(i / COLS);
    const k = i % COLS;
    return { gridRow: row + 1, gridColumn: (row % 2 === 0 ? k : COLS - 1 - k) + 1 };
  };
  // the phone path: the rail above a tile belongs to the segment arriving, below it to the one leaving
  const walkedIn = (i: number) => i > 0 && model.walked[i - 1];
  const walkedOut = (i: number) => model.walked[i] ?? false;
  const inline = desktop === false && !folded;

  const rail = (i: number, last: boolean) => (
    <span aria-hidden className="lg:hidden">
      {i > 0 && <span className="absolute left-[9px] top-0 h-[30px] w-[6px]" style={{ background: walkedIn(i) ? "var(--c-signal)" : "var(--c-line-strong)" }} />}
      {!last && <span className="absolute bottom-0 left-[9px] top-[30px] w-[6px]" style={{ background: walkedOut(i) ? "var(--c-signal)" : "var(--c-line-strong)" }} />}
      <span className="absolute left-[6px] top-[24px] h-3 w-3 border-2 border-line-strong bg-bg" />
    </span>
  );

  return (
    <section aria-label={`${spec.title} map`} className="flex flex-col gap-6">
      <WorldHeader spec={spec} model={model} progress={progress} frontier={frontier} />

      {n === 0 ? (
        <div className="flex flex-col gap-2 border border-dashed border-line-strong bg-surface-2 p-6">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{spec.open ? "Map coming soon" : "Opens later"}</span>
          <p className="m-0 max-w-[640px] text-[15px] leading-relaxed text-fg-2">{spec.audience}</p>
          {spec.atLaunch ? <p className="m-0 max-w-[640px] font-mono text-[12px] text-fg-3">At launch: {spec.atLaunch}</p> : null}
        </div>
      ) : (
        <div className="border border-line bg-surface lg:grid lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_420px]">
          <div
            className="relative min-w-0 px-4 py-6 sm:px-6 lg:px-6 lg:py-12 xl:px-12"
            style={{ backgroundColor: "var(--c-bg)", backgroundImage: "radial-gradient(var(--c-line-strong) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
          >
            <div className="relative">
              <Footpath list={listRef} walked={model.walked} deps={`${spec.id}:${n}`} />
              <ol
                ref={listRef}
                onKeyDown={onKey}
                aria-label={`${spec.title}: buildings in order`}
                className="relative m-0 flex list-none flex-col p-0 lg:grid lg:grid-cols-3 lg:gap-x-4 lg:gap-y-16 xl:gap-x-6"
              >
                {model.buildings.map((b, i) => {
                  const selected = shown === i;
                  const last = i === n - 1 && !spec.final;
                  return (
                    <li key={b.region.id} style={place(i)} className="relative pb-4 pl-9 lg:flex lg:items-center lg:justify-center lg:p-0">
                      {rail(i, last)}
                      <Tile b={b} campusStarted={model.started} selected={selected} desktop={desktop} onSelect={() => select(i)} />
                      {inline && selected ? (
                        <div role="region" aria-labelledby={headingId} className="mt-3 border border-line bg-surface p-3 sm:p-5">
                          {panel}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
                {spec.final ? (
                  <li style={place(n)} className="relative pl-9 lg:flex lg:items-center lg:justify-center lg:p-0">
                    {rail(n, true)}
                    <FinalTile node={spec.final} selected={shown === "final"} desktop={desktop} onSelect={() => select("final")} />
                    {inline && shown === "final" ? (
                      <div role="region" aria-labelledby={headingId} className="mt-3 border border-line bg-surface p-3 sm:p-5">
                        {panel}
                      </div>
                    ) : null}
                  </li>
                ) : null}
              </ol>
            </div>

            <div className="mt-8 inline-flex flex-wrap gap-x-5 gap-y-2 border border-line bg-surface px-3.5 py-2.5 font-mono text-[11px] text-fg-3 lg:mt-12">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-1 w-3.5 bg-signal" />
                walked
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-1 w-3.5 bg-line-strong" />
                ahead
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 border border-dashed border-line-strong bg-surface-2" />
                being written
              </span>
            </div>
          </div>

          {desktop !== false ? (
            <aside aria-labelledby={headingId} className="hidden border-l border-line lg:block">
              <div className="p-6 lg:sticky lg:top-[var(--hk-header-h,61px)] lg:max-h-[calc(100svh-var(--hk-header-h,61px))] lg:overflow-y-auto xl:p-8">{panel}</div>
            </aside>
          ) : null}
        </div>
      )}
    </section>
  );
}
