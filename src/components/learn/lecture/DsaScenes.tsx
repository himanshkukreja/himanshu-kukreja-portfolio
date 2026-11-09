"use client";

/**
 * DSA Mastery's lecture scenes on the 16:9 stage: quote, array, trace, race and code. Same rules as Stage.tsx: every
 * motion is a function of `t` (seconds into the step), settling within INTRO (1.6 s, what the MP4 exporter captures
 * before it holds the last frame), sized in container units so the 1920x1080 render and a phone-width player show the
 * same picture. Their data is inlined by src/lib/dsa/lecture.ts; the accent is the stage's --lec-accent (DSA teal).
 */
import type { LectureCode, LectureScene, LectureStep, LectureTraceFrame } from "@/lib/learn/lecture/types";
import { clamp, easeInOut, easeOut, lerp, prog, TONE } from "./anim";

const W = "text-[#f3f2ee]";
export const ACC = "var(--lec-accent,#ff6b2b)";
export const accA = (a: number) => `rgb(var(--lec-accent-rgb, 255 107 43) / ${a})`;
export const INK = "var(--lec-ink,#120700)";

function Heading({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`m-0 text-center font-display text-[3cqw] font-extrabold leading-[1.05] tracking-[-0.03em] ${W} ${className}`}>{children}</h2>;
}

/** a trace or step value, short: null "–", [1, 2], {4: 2, 7: 1} */
export function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "–";
  if (Array.isArray(v)) return `[${v.map(fmtVal).join(", ")}]`;
  if (typeof v === "object")
    return `{${Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${k}: ${fmtVal(x)}`)
      .join(", ")}}`;
  return String(v);
}

/* ---------- quote ---------- */

export function QuoteScene({ s, t, first }: { s: LectureScene; t: number; first: boolean }) {
  const words = (s.text || "").split(/\s+/).filter(Boolean);
  const name = s.person?.name || s.who || "";
  const role = s.person?.role || "";
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const step = Math.min(0.03, 0.55 / Math.max(1, words.length));
  const markE = first ? prog(t, 0, 0.4) : 1;
  const byE = first ? prog(t, 0.35 + words.length * step, 0.4) : 1;
  return (
    <figure className="relative m-0 flex w-[76%] flex-col gap-[3.2cqh] border-l-[0.35cqw] py-[1cqh] pl-[3cqw]" style={{ borderColor: ACC }}>
      <span aria-hidden className="absolute -top-[5.5cqw] left-[1.6cqw] font-display text-[10cqw] font-extrabold leading-none" style={{ color: ACC, opacity: 0.85 * markE }}>
        “
      </span>
      <blockquote className={`m-0 font-display text-[3.5cqw] font-bold leading-[1.18] tracking-[-0.02em] ${W}`}>
        {words.map((w, k) => {
          const e = first ? prog(t, 0.2 + k * step, 0.35) : 1;
          return (
            <span key={k}>
              <span className="inline-block" style={{ opacity: e, transform: `translateY(${(1 - e) * 1.2}cqh)` }}>
                {w}
              </span>
              {k < words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </blockquote>
      <figcaption className="flex items-center gap-[1.3cqw]" style={{ opacity: byE, transform: `translateX(${(1 - byE) * -1.5}cqw)` }}>
        <span className="grid h-[4.4cqw] w-[4.4cqw] place-items-center rounded-full border-[0.22cqw] bg-[#141416] font-mono text-[1.5cqw] font-semibold" style={{ borderColor: ACC, color: ACC }}>
          {initials}
        </span>
        <span className="flex flex-col gap-[0.3cqh]">
          <span className={`text-[2cqw] font-semibold leading-tight ${W}`}>{name}</span>
          {role && <span className="font-mono text-[1.2cqw] uppercase tracking-[0.1em] text-[#8a8a90]">{role}</span>}
        </span>
      </figcaption>
    </figure>
  );
}

/* ---------- the array strip (array scenes and traces) ---------- */

export type Strip = {
  window?: [number, number] | null;
  mark?: number[];
  pointers?: Record<string, number>;
  leaving?: number | null;
  joining?: number | null;
};

/**
 * Cells with their indexes, the window as a box that slides from where the previous step had it, marked cells, the
 * value leaving (struck through, red) and joining (filled), and named pointers under the cells that glide too.
 */
/** Room the strip keeps below its cells for the whole scene (so it doesn't jump between steps): pointer rows, the leaves/joins line. */
export type Room = { pointers: number; legend: boolean };
export const roomFor = (strips: Strip[], legend: boolean): Room => {
  let rows = 0;
  for (const x of strips) {
    const at = Object.values(x.pointers || {});
    for (const a of at) rows = Math.max(rows, at.filter((b) => b === a).length);
  }
  return { pointers: rows, legend };
};

/** `k` scales the strip's fixed sizes (cell cap, gaps, labels): 1 on the 16:9 stage, larger on the 9:16 short. */
export function ArrayStrip({ values, now, before, t, first, width, room, k = 1 }: { values: unknown[]; now: Strip; before: Strip | null; t: number; first: boolean; width: number; room: Room; k?: number }) {
  const n = Math.max(1, values.length);
  const gap = 0.7 * k;
  const cell = Math.min(7.5 * k, (width - gap * (n - 1)) / n);
  const x = (i: number) => i * (cell + gap);
  const long = Math.max(...values.map((v) => fmtVal(v).length), 1);
  const font = Math.min(cell * 0.42, (cell * 1.25) / long);
  const valid = (w?: [number, number] | null) => (w && w[1] >= w[0] ? w : null);
  const win = valid(now.window);
  const winBefore = valid(before?.window);
  const move = easeInOut(t / 0.7);
  const box = (w: [number, number]) => ({ l: x(w[0]) - 0.45 * k, w: x(w[1]) - x(w[0]) + cell + 0.9 * k });
  const bNow = win ? box(win) : null;
  const bWas = winBefore ? box(winBefore) : null;
  const winE = win ? (bWas ? 1 : prog(t, 0.05, 0.45)) : bWas ? 1 - prog(t, 0, 0.3) : 0;
  const bx = bNow && bWas ? { l: lerp(bWas.l, bNow.l, move), w: lerp(bWas.w, bNow.w, move) } : (bNow ?? bWas);
  const marks = new Set(now.mark || []);
  const marksBefore = new Set(before?.mark || []);
  const ptrs = Object.entries(now.pointers || {});
  const total = x(n - 1) + cell;
  const dimmed = !!win || marks.size > 0;
  const ptrRows = room.pointers ? (1.2 + 2.6 * room.pointers) * k : 0;
  return (
    <div className="relative" style={{ width: `${total}cqw`, height: `${cell + 2.6 * k + ptrRows + (room.legend ? 2.6 * k : 0)}cqw` }}>
      {bx && winE > 0 && (
        <div
          className="absolute"
          style={{
            left: `${bx.l}cqw`,
            width: `${bx.w}cqw`,
            top: `${-0.45 * k}cqw`,
            height: `${cell + 0.9 * k}cqw`,
            border: `${0.28 * k}cqw solid ${ACC}`,
            background: accA(0.12),
            boxShadow: `0 0 ${2.2 * k}cqw ${accA(0.28)}`,
            opacity: winE,
          }}
        />
      )}
      {values.map((v, i) => {
        const inWin = !!win && i >= win[0] && i <= win[1];
        const marked = marks.has(i);
        const leaving = now.leaving === i;
        const joining = now.joining === i;
        const enterE = first ? prog(t, 0.05 + i * 0.05, 0.35) : 1;
        const freshMark = marked && !marksBefore.has(i);
        const pop = (freshMark || (joining && before?.joining !== i)) ? 1 + 0.08 * Math.sin(Math.PI * clamp(t / 0.45)) : 1;
        const lit = joining || marked;
        const bg = lit ? ACC : leaving ? TONE.bad.bg : "#141416";
        const border = leaving ? TONE.bad.line : lit ? ACC : inWin ? accA(0.7) : "#3a3a40";
        const color = lit ? INK : leaving ? TONE.bad.fg : inWin || !dimmed ? "#f3f2ee" : "#a3a3a8";
        return (
          <div key={i} className="absolute top-0 flex flex-col items-center" style={{ left: `${x(i)}cqw`, width: `${cell}cqw`, opacity: enterE * (dimmed && !inWin && !lit && !leaving ? 0.6 : 1), transform: `translateY(${(1 - enterE) * 1.5}cqh)` }}>
            <div
              className="grid place-items-center border-solid font-display font-extrabold tabular-nums"
              style={{ width: `${cell}cqw`, height: `${cell}cqw`, fontSize: `${font}cqw`, borderWidth: `${0.2 * k}cqw`, background: bg, borderColor: border, color, transform: `scale(${pop})`, textDecoration: leaving ? "line-through" : undefined }}
            >
              {fmtVal(v)}
            </div>
            <span className="font-mono text-[#8a8a90]" style={{ marginTop: `${0.6 * k}cqw`, fontSize: `${1.1 * k}cqw` }}>
              {i}
            </span>
          </div>
        );
      })}
      {ptrs.map(([name, at], j) => {
        const was = before?.pointers?.[name];
        const pos = was !== undefined && was !== at ? lerp(x(was), x(at), move) : x(at);
        const e = was === undefined ? prog(t, 0.15, 0.4) : 1;
        // two pointers on one cell: the second sits lower
        const stack = ptrs.slice(0, j).filter(([, a]) => a === at).length;
        return (
          <div
            key={name}
            className="absolute flex flex-col items-center font-mono font-semibold uppercase tracking-[0.06em]"
            style={{ left: `${pos}cqw`, width: `${cell}cqw`, top: `${cell + 2.6 * k + (stack ? (1.2 + stack * 1.6) * k : 0)}cqw`, color: ACC, opacity: e, fontSize: `${1.15 * k}cqw` }}
          >
            {stack === 0 && <span className="leading-none">▲</span>}
            <span className="leading-tight">{name}</span>
          </div>
        );
      })}
      {(now.leaving != null || now.joining != null) && (
        <div className="absolute left-0 right-0 flex justify-center font-mono uppercase tracking-[0.08em]" style={{ top: `${cell + 2.8 * k + ptrRows}cqw`, gap: `${2 * k}cqw`, fontSize: `${1.1 * k}cqw`, opacity: prog(t, 0.2, 0.4) }}>
          {now.leaving != null && <span style={{ color: TONE.bad.fg }}>✕ {fmtVal(values[now.leaving])} leaves</span>}
          {now.joining != null && <span style={{ color: ACC }}>+ {fmtVal(values[now.joining])} joins</span>}
        </div>
      )}
    </div>
  );
}

export function ArrayScene({ s, st, prevSt, t, first }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  const values = s.values || [];
  const strip = (x: LectureStep): Strip => ({ window: x.window ?? null, mark: x.mark, pointers: x.pointers });
  return (
    <div className="flex w-full flex-col items-center gap-[5cqh]">
      {s.heading && <Heading>{s.heading}</Heading>}
      <ArrayStrip values={values} now={strip(st)} before={prevSt ? strip(prevSt) : null} t={t} first={first} width={76} room={roomFor(s.steps.map(strip), false)} />
    </div>
  );
}

/* ---------- code ---------- */

const KW = new Set(
  "def for in range while if elif else return and or not None True False class import from public private static final int long void const auto vector let var function new break continue len max min sum".split(" "),
);

/** one line of code, coloured: comments (with the [n] marker in the accent), strings, numbers, keywords */
function CodeLine({ text }: { text: string }) {
  const at = text.search(/(?:#|\/\/)/);
  const code = at >= 0 ? text.slice(0, at) : text;
  const comment = at >= 0 ? text.slice(at) : "";
  const parts = code.split(/("[^"]*"|'[^']*'|\b\d+\b|\b[A-Za-z_]\w*\b)/g);
  const cm = comment.match(/^((?:#|\/\/)\s*)(\[\d+\])?(.*)$/);
  return (
    <>
      {parts.map((p, k) =>
        !p ? null : /^["']/.test(p) ? (
          <span key={k} className="text-[#e6c07b]">
            {p}
          </span>
        ) : /^\d+$/.test(p) ? (
          <span key={k} className="text-[#f0a868]">
            {p}
          </span>
        ) : KW.has(p) ? (
          <span key={k} className="text-[#8ab4f8]">
            {p}
          </span>
        ) : (
          <span key={k}>{p}</span>
        ),
      )}
      {cm && (
        <span className="text-[#8a8a90]">
          {cm[1]}
          {cm[2] && (
            <span className="font-semibold" style={{ color: ACC }}>
              {cm[2]}
            </span>
          )}
          {cm[3]}
        </span>
      )}
    </>
  );
}

/**
 * The template with the step markers' lines lit (a bar and a tint) and the rest dimmed, easing from the previous
 * step's markers. Long lines wrap under their own indent, so nothing runs off the panel.
 */
export function CodePanel({ code, markers, before, t, font, lang, k = 1 }: { code: LectureCode; markers: number[]; before: number[] | null; t: number; font: number; lang?: string; k?: number }) {
  const lines = code.source.split("\n");
  const litSet = (m: number[]) => new Set(m.flatMap((n) => code.lines[n - 1] || []));
  const now = litSet(markers);
  const was = before ? litSet(before) : new Set<number>();
  const e = easeOut(t / 0.55);
  const anyNow = now.size > 0;
  const anyWas = was.size > 0;
  const level = (set: Set<number>, any: boolean, i: number) => (any ? (set.has(i) ? 1 : 0) : 0.5);
  return (
    <div className="relative w-full border border-[#2a2a2e] bg-[#0f0f11] font-mono" style={{ fontSize: `${font}cqw`, lineHeight: 1.55, paddingTop: `${1.2 * k}cqw`, paddingBottom: `${1.2 * k}cqw` }}>
      {lang && (
        <span className="absolute font-mono uppercase tracking-[0.12em] text-[#6a6a70]" style={{ right: `${k}cqw`, top: `${0.7 * k}cqw`, fontSize: `${0.95 * k}cqw` }}>
          {lang}
        </span>
      )}
      {lines.map((ln, i) => {
        const v = lerp(level(was, anyWas, i), level(now, anyNow, i), before ? e : anyNow ? e : 1);
        const indent = ln.length - ln.trimStart().length;
        const opacity = anyNow || anyWas ? 0.38 + 0.62 * v : 1;
        return (
          <div key={i} className="relative flex" style={{ background: accA(0.13 * v), opacity, paddingRight: `${1.4 * k}cqw` }}>
            <span aria-hidden className="absolute bottom-0 left-0 top-0" style={{ background: ACC, opacity: v, width: `${0.3 * k}cqw` }} />
            <span className="w-[3.2em] shrink-0 select-none pr-[1em] text-right text-[#55555b]">{i + 1}</span>
            <span className={`min-w-0 whitespace-pre-wrap break-words ${W}`} style={{ paddingLeft: `${indent}ch` }}>
              <CodeLine text={ln.trimStart() || " "} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function CodeScene({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number }) {
  const code = s.code;
  if (!code) return <Heading>{s.heading}</Heading>;
  const n = code.source.split("\n").length;
  // the panel's type: as large as fits the stage's height (about 31cqw of lines), never above 1.5cqw
  const font = clamp(31 / (n * 1.55), 0.85, 1.5);
  return (
    <div className="flex w-[84%] flex-col gap-[2.2cqh]">
      <div className="flex flex-col gap-[0.8cqh]">
        <Heading className="!text-left">{s.heading}</Heading>
        {code.label && <span className="font-mono text-[1.25cqw] text-[#a3a3a8]">{code.label}</span>}
      </div>
      <CodePanel code={code} markers={st.markers || []} before={prevSt ? prevSt.markers || [] : null} t={t} font={font} lang={s.lang} />
    </div>
  );
}

/* ---------- trace ---------- */

/** The variables of a frame, each a tile; the one a prediction asks for shows "?", values that just changed glow. */
export function VarTiles({ vars, frame, prev, hide, reveal, t, k = 1 }: { vars: string[]; frame: LectureTraceFrame; prev: LectureTraceFrame | null; hide: string | null; reveal: string | null; t: number; k?: number }) {
  return (
    <div className="flex flex-wrap justify-center" style={{ gap: `${k}cqw` }}>
      {vars.map((v) => {
        const val = frame.state[v];
        const changed = (!!prev && fmtVal(prev.state[v]) !== fmtVal(val)) || reveal === v;
        const glow = changed ? 1 - clamp((t - 0.25) / 1.1) : 0;
        const hidden = hide === v;
        const text = hidden ? "?" : fmtVal(val);
        return (
          <div
            key={v}
            className="flex flex-col items-center gap-[0.4cqh] border py-[1cqh]"
            style={{
              minWidth: `${8.5 * k}cqw`,
              paddingLeft: `${1.2 * k}cqw`,
              paddingRight: `${1.2 * k}cqw`,
              borderColor: hidden ? ACC : changed ? accA(0.75) : "#2a2a2e",
              borderStyle: hidden ? "dashed" : "solid",
              background: hidden ? accA(0.08) : `color-mix(in srgb, #141416, ${ACC} ${Math.round(glow * 22)}%)`,
            }}
          >
            <span className="font-mono uppercase tracking-[0.1em] text-[#8a8a90]" style={{ fontSize: `${k}cqw` }}>
              {v}
            </span>
            <span className={`font-display font-extrabold tabular-nums leading-none ${hidden ? "" : W}`} style={{ fontSize: `${(text.length > 14 ? 1.4 : text.length > 7 ? 1.9 : 2.5) * k}cqw`, color: hidden ? ACC : undefined }}>
              {text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TraceScene({ s, st, prevSt, t, first }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  const tr = s.traceData;
  if (!tr || !tr.frames.length) return <Heading>{s.heading}</Heading>;
  const k = clamp(st.frame ?? 0, 0, tr.frames.length - 1);
  const f = tr.frames[k];
  const pk = prevSt ? clamp(prevSt.frame ?? 0, 0, tr.frames.length - 1) : null;
  const pf = pk != null ? tr.frames[pk] : null;
  // "Predict …" with the frame's question on screen: its answer stays hidden until the next step says it
  const predicting = !!f.ask && /\bpredict\b/i.test(st.say);
  // …and the step after, on the same frame, says it: that value glows in
  const revealing = !predicting && pk === k && !!f.ask && !!prevSt && /\bpredict\b/i.test(prevSt.say);
  const strip = (x: LectureTraceFrame): Strip => ({ window: x.view.window, pointers: x.view.pointers, leaving: x.view.leaving, joining: x.view.joining });
  const noteE = predicting ? 0 : pk === k ? 1 : prog(t, 0.35, 0.4);
  const code = tr.code;
  return (
    <div className="flex w-full flex-col items-center gap-[3cqh]">
      {s.heading && <Heading>{s.heading}</Heading>}
      <div className={`flex w-full items-center ${code ? "justify-between gap-[3cqw]" : "justify-center"}`}>
        <div className={`flex flex-col items-center gap-[3.2cqh] ${code ? "w-[52%]" : "w-[80%]"}`}>
          <ArrayStrip values={tr.values} now={strip(f)} before={pf ? strip(pf) : null} t={t} first={first} width={code ? 46 : 70} room={roomFor(tr.frames.map(strip), true)} />
          <VarTiles vars={tr.vars} frame={f} prev={pf && pk !== k ? pf : null} hide={predicting ? f.ask || null : null} reveal={revealing ? f.ask || null : null} t={t} />
          <p className="m-0 min-h-[2.4em] max-w-full text-center font-mono text-[1.2cqw] leading-snug text-[#a3a3a8]" style={{ opacity: noteE }}>
            {f.note}
          </p>
        </div>
        {code && (
          <div className="w-[44%]">
            <CodePanel code={code} markers={f.marker ? [f.marker] : []} before={pf ? (pf.marker ? [pf.marker] : []) : null} t={t} font={1.05} lang={tr.lang} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- race ---------- */

const nf = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * The measured race: per input size, one bar per version, to scale within that size (so the gap reads as the ratio,
 * and grows down the rows), growing with their counters on the scene's first step; the gap at the largest size closes it.
 */
export function RaceScene({ s, t, first }: { s: LectureScene; t: number; first: boolean }) {
  const r = s.raceData;
  if (!r || !r.sizes.length) return <Heading>{s.heading}</Heading>;
  const last = r.sizes.length - 1;
  const bad = r.series.find((x) => x.tone === "bad");
  const good = r.series.find((x) => x.tone === "good");
  const ratio = bad && good && good.counts[last] ? Math.round(bad.counts[last] / good.counts[last]) : null;
  const colour = (tone: string) => (tone === "bad" ? TONE.bad.line : tone === "good" ? ACC : TONE.neutral.line);
  const endE = first ? prog(t, 1.15, 0.35) : 1;
  return (
    <div className="flex w-[86%] flex-col gap-[2.6cqh]">
      {s.heading && <Heading>{s.heading}</Heading>}
      <div className="flex flex-wrap justify-center gap-x-[2.4cqw] gap-y-[0.6cqh]">
        {r.series.map((x) => (
          <span key={x.label} className="flex items-center gap-[0.7cqw] text-[1.35cqw] text-[#d6d5d0]">
            <span className="inline-block h-[1.1cqw] w-[1.1cqw]" style={{ background: colour(x.tone) }} />
            {x.label}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-[2cqh]">
        {r.sizes.map((n, si) => (
          <div key={n} className="grid items-center gap-x-[1.4cqw]" style={{ gridTemplateColumns: "11cqw minmax(0,1fr)" }}>
            <span className={`text-right font-mono text-[1.3cqw] ${si === last ? W : "text-[#8a8a90]"}`}>n = {nf(n)}</span>
            <div className="flex flex-col gap-[0.6cqh]">
              {r.series.map((x) => {
                const e = first ? prog(t, 0.15 + si * 0.1, 1.0) : 1;
                const c = x.counts[si] ?? 0;
                const rowMax = Math.max(1, ...r.series.map((y) => y.counts[si] ?? 0));
                const w = (c / rowMax) * 100;
                return (
                  <div key={x.label} className="flex items-center gap-[0.8cqw]">
                    <span className="h-[1.9cqw] min-w-[0.2cqw]" style={{ width: `${Math.max(0.6, w * 0.8 * e)}%`, background: colour(x.tone), boxShadow: x.tone === "good" ? `0 0 1.2cqw ${accA(0.35)}` : undefined }} />
                    <span className={`font-mono text-[1.25cqw] tabular-nums ${W}`}>{nf(c * e)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-baseline justify-center gap-x-[1.4cqw] gap-y-[0.6cqh]" style={{ opacity: endE, transform: `translateY(${(1 - endE) * 1}cqh)` }}>
        {ratio && ratio > 1 && (
          <span className="px-[1cqw] py-[0.3cqh] font-mono text-[1.35cqw] font-semibold uppercase tracking-[0.06em]" style={{ background: ACC, color: INK }}>
            about {nf(ratio)}× less work at n = {nf(r.sizes[last])}
          </span>
        )}
        <span className="font-mono text-[1.1cqw] text-[#8a8a90]">{r.unit ? `${r.unit} · ` : ""}measured · bars to scale within each size</span>
      </div>
    </div>
  );
}
