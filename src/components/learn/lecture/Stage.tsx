"use client";

/**
 * The lecture's 16:9 stage, drawn for one moment: step `i`, `t` seconds into it. Every animation is
 * a function of `t` (no CSS transitions), so the live player (t from the narration's clock) and the
 * MP4 exporter (t set frame by frame) show exactly the same thing.
 *
 * Flowcharts/state machines render once per scene; lit nodes, the dimming of the rest, packets along
 * `flow` edges and the camera (`focus`) are applied to that SVG. Sequences re-render per step and
 * draw their newest arrows in.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { mermaidConfig, prepareMermaidSource } from "@/lib/diagrams/mermaid-theme";
import { loadMermaid } from "@/lib/offline/lazy";
import { type FlatStep, type Lecture, type LectureScene, type LectureStep, type Tone } from "@/lib/learn/lecture/types";
import { clamp, countUp, easeInOut, easeOut, lerp, prog, TONE } from "./anim";

type MermaidApi = Awaited<ReturnType<typeof loadMermaid>>;
let mermaidP: Promise<MermaidApi> | null = null;
let seq = 0;
const svgCache = new Map<string, string>();

export async function renderSvg(src: string): Promise<string> {
  const hit = svgCache.get(src);
  if (hit) return hit;
  if (!mermaidP) {
    mermaidP = loadMermaid().then((m) => {
      const cfg = mermaidConfig("dark");
      const font = window.getComputedStyle(document.body).fontFamily;
      // video-sized sequences: tighter rows and bigger type than the article's
      m.initialize({
        ...cfg,
        themeVariables: { ...cfg.themeVariables, fontFamily: font },
        sequence: { ...cfg.sequence, messageMargin: 26, boxMargin: 6, noteMargin: 8, actorMargin: 70, height: 46, messageFontSize: 17, actorFontSize: 17, noteFontSize: 15, wrap: true, width: 170 },
      });
      return m;
    });
  }
  const m = await mermaidP;
  const { svg } = await m.render(`lec-${++seq}`, prepareMermaidSource(src, "dark"));
  svgCache.set(src, svg);
  return svg;
}

/** The Mermaid source a step needs: always the whole diagram (sequences reveal their messages in place). */
export function diagramFor(s: LectureScene, st: LectureStep): string | null {
  void st;
  return s.diagram ? s.diagram.trim() : null;
}

const W = "text-[#f3f2ee]";

export type QuizState = { picked: number | null };

type Props = {
  lecture: Lecture;
  flat: FlatStep[];
  i: number;
  t: number;
  /** this step's length in seconds (quiz countdown, packet loops) */
  dur: number;
  quest: { title: string; code: string } | null;
  interactive?: boolean;
  quiz?: QuizState;
  onPick?: (k: number) => void;
  /** tells the exporter the step's diagram is drawn */
  onReady?: (i: number) => void;
  caption?: string | null;
  /** the Ask panel's [[show]]: these flowchart/state nodes are lit instead of the step's highlight and
   *  focus (no packets), easing in with CSS; unset (always, in record mode) means the step as authored */
  extraHighlight?: string[];
  /** course player: open the lecture a "↩ Recall" chip points to */
  onRef?: (lecture: string) => void;
  /** the share of the stage's width a panel covers on the right (Ask): the scene shrinks into what is
   *  still visible, and the captions move clear of it */
  cover?: number;
};

export default function Stage({ lecture, flat, i, t, dur, quest, interactive, quiz, onPick, onReady, caption, extraHighlight, onRef, cover = 0 }: Props) {
  const cur = flat[i];
  const prev = i > 0 && flat[i - 1].scene === cur.scene ? flat[i - 1] : null;
  const s = cur.s;
  const st = cur.st;
  const enter = cur.step === 0 ? prog(t, 0, 0.55) : 1;
  const total = flat.length;
  const hasDiagram = s.kind === "flowchart" || s.kind === "state" || s.kind === "sequence";

  useEffect(() => {
    if (!hasDiagram) onReady?.(i);
  }, [hasDiagram, i, onReady]);
  // fit the scene's box (4%..96% of the width) into the part left of the panel
  const fit = cover > 0 ? Math.max(0.4, (1 - cover - 0.05) / 0.92) : 1;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0b0c] [container-type:size]">
      {/* backdrop: a faint grid and a warm glow, so the stage never looks like a blank slide */}
      <div aria-hidden className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(#1a1a1d_1px,transparent_1px),linear-gradient(90deg,#1a1a1d_1px,transparent_1px)] [background-size:4cqw_4cqw]" />
      <div aria-hidden className="absolute -left-[20%] -top-[30%] h-[80%] w-[60%] rounded-full bg-[radial-gradient(closest-side,rgba(255,107,43,0.10),transparent)]" />

      <div className="absolute left-[3%] top-[4%] z-10 flex items-center gap-[1cqw] font-mono text-[1.15cqw] uppercase tracking-[0.12em] text-[#ff6b2b]">
        <span className="inline-block h-[0.6cqw] w-[0.6cqw] bg-[#ff6b2b]" />
        {String(cur.scene + 1).padStart(2, "0")} · {s.title}
      </div>
      {lecture.cast ? (
        <CallBar cast={lecture.cast} who={st.who} t={t} />
      ) : (
        quest && (
          <div className="absolute right-[3%] top-[4%] z-10 font-mono text-[1cqw] uppercase tracking-[0.12em] text-[#8a8a90]">
            {quest.code} · {quest.title}
          </div>
        )
      )}

      <div
        className="absolute inset-x-[4%] bottom-[17%] top-[10%] flex items-center justify-center"
        style={{
          opacity: enter,
          transform: `translateY(${(1 - enter) * 1.2}cqh) scale(${(0.985 + 0.015 * enter) * fit})`,
          ...(fit < 1 ? { transformOrigin: "0 50%", transition: "transform .3s ease" } : {}),
        }}
      >
        {s.kind === "title" && <TitleScene s={s} st={st} t={t} first={cur.step === 0} fallback={lecture.title} />}
        {s.kind === "numbers" && <NumbersScene s={s} k={cur.step} t={t} />}
        {s.kind === "list" && <ListScene s={s} st={st} prevSt={prev?.st ?? null} t={t} />}
        {s.kind === "compare" && <CompareScene s={s} st={st} prevSt={prev?.st ?? null} t={t} />}
        {s.kind === "quiz" && <QuizScene s={s} k={cur.step} t={t} dur={dur} interactive={!!interactive} quiz={quiz} onPick={onPick} />}
        {s.kind === "chart" && <ChartScene s={s} st={st} prevSt={prev?.st ?? null} t={t} />}
        {s.kind === "timeline" && <TimelineScene s={s} st={st} prevSt={prev?.st ?? null} t={t} />}
        {s.kind === "phone" && <PhoneScene s={s} st={st} prevSt={prev?.st ?? null} t={t} />}
        {hasDiagram && <DiagramScene key={s.id} s={s} st={st} prevSt={prev?.st ?? null} t={t} i={i} onReady={onReady} show={extraHighlight} />}
      </div>

      <div className="absolute inset-x-[6%] bottom-[4.5%] flex flex-col items-center gap-[0.8cqh]" style={cover > 0 ? { right: `${cover * 100 + 2}%`, left: "2%" } : undefined}>
        {st.ref && (
          <RefChip label={st.ref.label} e={prog(t, 0.35, 0.4)} onClick={interactive && onRef ? () => onRef(st.ref!.lecture) : undefined} />
        )}
        {st.caption && (
          <span
            className="bg-[#ff6b2b] px-[1cqw] py-[0.4cqh] font-mono text-[1.15cqw] font-semibold uppercase tracking-[0.08em] text-[#120700]"
            style={{ opacity: prog(t, 0.1, 0.35), transform: `translateY(${(1 - prog(t, 0.1, 0.35)) * 0.8}cqh)` }}
          >
            {st.caption}
          </span>
        )}
        {caption && <p className={`m-0 max-w-[92%] text-center text-[1.6cqw] leading-snug ${W} [text-shadow:0_1px_8px_rgba(0,0,0,0.95)]`}>{caption}</p>}
      </div>

      {/* watermark */}
      <div aria-hidden className="absolute bottom-[1.6%] right-[1.6%] font-mono text-[0.95cqw] tracking-[0.06em] text-[#f3f2ee] opacity-[0.28]">
        <span className="text-[#ff6b2b]">~</span>/himanshukukreja.in/learn
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[0.35cqh] bg-[#1d1d20]">
        <div className="h-full bg-[#ff6b2b]" style={{ width: `${((i + Math.min(1, t / Math.max(dur, 0.1))) / total) * 100}%` }} />
      </div>
    </div>
  );
}

/** Mock interview videos: the two people on the call, the one speaking lit up with a voice meter. */
function CallBar({ cast, who, t }: { cast: NonNullable<Lecture["cast"]>; who?: "interviewer" | "candidate"; t: number }) {
  const people = [
    { key: "interviewer" as const, ...cast.interviewer, role: cast.interviewer.title || "Interviewer" },
    { key: "candidate" as const, ...cast.candidate, role: cast.candidate.title || "Candidate" },
  ];
  return (
    <div className="absolute right-[3%] top-[3%] z-10 flex gap-[0.8cqw]">
      {people.map((p) => {
        const on = who === p.key;
        const initials = p.name
          .split(/\s+/)
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        return (
          <div
            key={p.key}
            className="flex items-center gap-[0.7cqw] border px-[0.8cqw] py-[0.5cqh]"
            style={{ borderColor: on ? "#ff6b2b" : "#2a2a2e", background: on ? "rgba(255,107,43,0.10)" : "rgba(20,20,22,0.85)", transition: "border-color .25s, background .25s" }}
          >
            <span
              className="grid h-[2.6cqw] w-[2.6cqw] place-items-center rounded-full font-mono text-[1cqw] font-semibold"
              style={{ background: p.key === "interviewer" ? "#2b2b30" : "#3a2418", color: on ? "#ff8a4c" : "#cfcfd4", boxShadow: on ? "0 0 0 0.18cqw #ff6b2b" : "none" }}
            >
              {initials}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[1.05cqw] font-semibold" style={{ color: on ? "#f3f2ee" : "#a3a3a8" }}>
                {p.name}
              </span>
              <span className="font-mono text-[0.8cqw] uppercase tracking-[0.1em] text-[#8a8a90]">{p.role}</span>
            </span>
            {/* voice meter: moves while this person speaks */}
            <span className="flex h-[1.6cqw] items-end gap-[0.18cqw]" aria-hidden>
              {[0, 1, 2, 3].map((b) => (
                <span
                  key={b}
                  className="w-[0.28cqw]"
                  style={{ background: on ? "#ff6b2b" : "#3a3a40", height: on ? `${30 + 70 * Math.abs(Math.sin(t * (6 + b * 1.7) + b))}%` : "20%" }}
                />
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** "↩ Recall · label": this step leans on an earlier lesson (a link in the course player) */
function RefChip({ label, e, onClick }: { label: string; e: number; onClick?: () => void }) {
  const cls = "flex items-center gap-[0.6cqw] border border-[#3a3a40] bg-[#141416]/90 px-[0.9cqw] py-[0.35cqh] font-mono text-[1cqw] tracking-[0.04em] text-[#d6d5d0]";
  const body = (
    <>
      <span className="text-[#ff6b2b]">↩ recall</span>
      <span>·</span>
      <span>{label}</span>
      {onClick && <span className="text-[#ff6b2b]">→</span>}
    </>
  );
  const style = { opacity: e, transform: `translateY(${(1 - e) * 0.8}cqh)` };
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} cursor-pointer hover:border-[#ff6b2b]`} style={style} title="Open that lecture">
      {body}
    </button>
  ) : (
    <span className={cls} style={style}>
      {body}
    </span>
  );
}

/* ---------- scenes ---------- */

function TitleScene({ s, st, t, first, fallback }: { s: LectureScene; st: LectureStep; t: number; first: boolean; fallback: string }) {
  const heading = (s.heading || fallback).replace(/[.!?]$/, "");
  const end = /[!?]$/.test(s.heading || "") ? (s.heading || "").slice(-1) : ".";
  const words = heading.split(/\s+/);
  void st;
  return (
    <h2 className={`m-0 max-w-[82%] text-center font-display text-[5.4cqw] font-extrabold leading-[0.98] tracking-[-0.04em] ${W}`}>
      {words.map((w, k) => {
        const e = first ? prog(t, 0.15 + k * 0.07, 0.45) : 1;
        return (
          <span key={k}>
            <span className="inline-block" style={{ opacity: e, transform: `translateY(${(1 - e) * 2}cqh)` }}>
              {w}
            </span>
            {k < words.length - 1 ? " " : ""}
          </span>
        );
      })}
      <span className="text-[#ff6b2b]" style={{ opacity: first ? prog(t, 0.2 + words.length * 0.07, 0.3) : 1 }}>
        {end}
      </span>
    </h2>
  );
}

function NumbersScene({ s, k, t }: { s: LectureScene; k: number; t: number }) {
  const nums = s.numbers || [];
  return (
    <div className="flex w-full flex-col items-center gap-[4cqh]">
      {s.heading && <h2 className={`m-0 text-center font-display text-[3.4cqw] font-extrabold tracking-[-0.03em] ${W}`}>{s.heading}</h2>}
      <div className="grid w-full gap-[1.6cqw]" style={{ gridTemplateColumns: `repeat(${Math.min(3, Math.max(2, nums.length))}, minmax(0, 1fr))` }}>
        {nums.map((n, j) => {
          const on = j <= k;
          const fresh = j === k;
          const e = fresh ? prog(t, 0.05, 0.9) : 1;
          const pop = fresh ? 1 + 0.04 * Math.sin(Math.PI * clamp(t / 0.5)) : 1;
          return (
            <div
              key={j}
              className="flex flex-col gap-[0.8cqh] border p-[1.8cqw]"
              style={{
                borderColor: on ? "#ff6b2b" : "#2a2a2e",
                background: on ? "#1a0f08" : "transparent",
                opacity: on ? 1 : 0.32,
                transform: `scale(${pop})`,
                boxShadow: fresh ? `0 0 ${3 * (1 - clamp(t / 1.2))}cqw rgba(255,107,43,0.35)` : "none",
              }}
            >
              <span className={`font-display text-[4cqw] font-extrabold leading-none tracking-[-0.03em] ${W} tabular-nums`}>{fresh ? countUp(n.value, e) : n.value}</span>
              <span className="text-[1.35cqw] leading-snug text-[#a3a3a8]">{n.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** how many items a reveal shows now, and how many the step before showed (to animate the new ones) */
export function revealed(st: LectureStep, prevSt: LectureStep | null, all: number): [number, number] {
  const now = st.reveal ?? all;
  const before = prevSt ? (prevSt.reveal ?? all) : 0;
  return [now, Math.min(before, now)];
}

export function Item({ fresh, t, k0, children, className = "", style }: { fresh: boolean; t: number; k0: number; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const e = fresh ? prog(t, 0.12 + k0 * 0.12, 0.45) : 1;
  return (
    <div className={className} style={{ ...style, opacity: e, transform: `translateX(${(1 - e) * -2.5}cqw)` }}>
      {children}
    </div>
  );
}

function ListScene({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number }) {
  const points = (s.points || []) as string[];
  const [now, before] = revealed(st, prevSt, points.length);
  return (
    <div className="flex w-[78%] flex-col gap-[2.6cqh]">
      <h2 className={`m-0 font-display text-[3.3cqw] font-extrabold tracking-[-0.03em] ${W}`}>{s.heading}</h2>
      <div className="flex flex-col gap-[1.6cqh]">
        {points.slice(0, now).map((p, k) => (
          <Item key={k} fresh={k >= before} t={t} k0={k - before} className="flex items-baseline gap-[1.4cqw] border-l-[0.3cqw] border-[#ff6b2b] bg-[#141416] px-[1.6cqw] py-[1.4cqh]">
            <span className="font-mono text-[1.4cqw] text-[#ff6b2b]">{String(k + 1).padStart(2, "0")}</span>
            <span className={`text-[2cqw] leading-snug ${W}`}>{p}</span>
          </Item>
        ))}
      </div>
    </div>
  );
}

function CompareScene({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number }) {
  const L = s.left || { title: "", points: [] };
  const R = s.right || { title: "", points: [] };
  const all = L.points.length + R.points.length;
  const [now, before] = revealed(st, prevSt, all);
  const col = (side: typeof L, offset: number, fallbackTone: Tone) => {
    const tone = TONE[side.tone || fallbackTone];
    const shownHere = clamp(now - offset, 0, side.points.length);
    const head = offset === 0 ? (now > 0 ? 1 : 0.35) : now > L.points.length ? 1 : 0.35;
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-[1.4cqh] border p-[1.8cqw]" style={{ borderColor: tone.line, background: tone.bg, opacity: head }}>
        <span className="font-mono text-[1.25cqw] uppercase tracking-[0.1em]" style={{ color: tone.fg }}>
          {side.title}
        </span>
        {side.points.slice(0, shownHere).map((p, k) => (
          <Item key={k} fresh={offset + k >= before} t={t} k0={offset + k - before} className={`text-[1.75cqw] leading-snug ${W}`}>
            <span style={{ color: tone.fg }}>{(side.tone || fallbackTone) === "bad" ? "✕ " : (side.tone || fallbackTone) === "good" ? "✓ " : "· "}</span>
            {p}
          </Item>
        ))}
      </div>
    );
  };
  return (
    <div className="flex w-[88%] flex-col gap-[2.6cqh]">
      <h2 className={`m-0 text-center font-display text-[3.1cqw] font-extrabold tracking-[-0.03em] ${W}`}>{s.heading}</h2>
      <div className="flex items-stretch gap-[2cqw]">
        {col(L, 0, "bad")}
        <div className="flex items-center font-display text-[2.4cqw] font-extrabold text-[#ff6b2b]">vs</div>
        {col(R, L.points.length, "good")}
      </div>
    </div>
  );
}

function QuizScene({ s, k, t, dur, interactive, quiz, onPick }: { s: LectureScene; k: number; t: number; dur: number; interactive: boolean; quiz?: QuizState; onPick?: (k: number) => void }) {
  const opts = s.options || [];
  const reveal = k >= 1 || (interactive && quiz?.picked != null);
  const picked = quiz?.picked ?? null;
  const left = dur - t;
  const countdown = !interactive && k === 0 && left <= 3.2 ? Math.max(1, Math.ceil(left - 0.2)) : null;
  return (
    <div className="flex w-[80%] flex-col gap-[2.4cqh]">
      <span className="font-mono text-[1.3cqw] uppercase tracking-[0.14em] text-[#ff6b2b]">checkpoint · your turn</span>
      <h2 className={`m-0 font-display text-[3cqw] font-extrabold leading-[1.1] tracking-[-0.03em] ${W}`}>{s.question}</h2>
      <div className="grid grid-cols-2 gap-[1.4cqw]">
        {opts.map((o, j) => {
          const e = k === 0 ? prog(t, 0.25 + j * 0.15, 0.4) : 1;
          const right = j === s.answer;
          const tone = reveal ? (right ? TONE.good : picked === j ? TONE.bad : TONE.neutral) : TONE.neutral;
          const dim = reveal && !right && picked !== j;
          const Tag = interactive && !reveal ? "button" : "div";
          return (
            <Tag
              key={j}
              {...(Tag === "button" ? { type: "button" as const, onClick: () => onPick?.(j) } : {})}
              className={`flex items-start gap-[1cqw] border p-[1.5cqw] text-left ${interactive && !reveal ? "cursor-pointer hover:border-[#ff6b2b]" : ""}`}
              style={{ borderColor: tone.line, background: tone.bg, opacity: e * (dim ? 0.45 : 1), transform: `translateY(${(1 - e) * 1.5}cqh)` }}
            >
              <span className="font-mono text-[1.5cqw] font-semibold" style={{ color: reveal && right ? TONE.good.fg : "#ff6b2b" }}>
                {reveal && right ? "✓" : reveal && picked === j ? "✕" : String.fromCharCode(65 + j)}
              </span>
              <span className={`text-[1.7cqw] leading-snug ${W}`}>{o}</span>
            </Tag>
          );
        })}
      </div>
      <div className="min-h-[7cqh]">
        {reveal ? (
          <p className="m-0 text-[1.7cqw] leading-snug text-[#c9c8c2]" style={{ opacity: k >= 1 ? prog(t, 0.2, 0.5) : 1 }}>
            <strong className="text-[#7ee2a8]">{picked == null || picked === s.answer ? "Right: " : "Not quite: "}</strong>
            {s.explain}
          </p>
        ) : countdown ? (
          <div className="flex items-center gap-[1cqw] font-mono text-[1.6cqw] text-[#ff6b2b]">
            <span className="grid h-[4.4cqw] w-[4.4cqw] place-items-center rounded-full border-[0.3cqw] border-[#ff6b2b] font-display text-[2.4cqw] font-extrabold">{countdown}</span>
            pause and pick one
          </div>
        ) : interactive ? (
          <p className="m-0 font-mono text-[1.4cqw] text-[#8a8a90]">pick an answer to carry on</p>
        ) : null}
      </div>
    </div>
  );
}

function ChartScene({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number }) {
  const pts = (s.points || []) as { label: string; value: number; tone?: Tone }[];
  const [now, before] = revealed(st, prevSt, pts.length);
  const max = Math.max(...pts.map((p) => p.value), 1);
  const fmt = (v: number) => `${v >= 1000 ? v.toLocaleString("en-IN") : Number.isInteger(v) ? v : v.toFixed(1)}${s.unit ? ` ${s.unit}` : ""}`;
  const Wd = 100;
  const Ht = 52;
  const xy = (k: number, v: number) => [6 + (k * (Wd - 12)) / Math.max(1, pts.length - 1), Ht - 4 - (v / max) * (Ht - 12)] as const;
  return (
    <div className="flex w-[84%] flex-col gap-[2.4cqh]">
      <h2 className={`m-0 text-center font-display text-[3cqw] font-extrabold tracking-[-0.03em] ${W}`}>{s.heading}</h2>
      {s.type === "line" ? (
        <svg viewBox={`0 0 ${Wd} ${Ht + 8}`} className="h-[48cqh] w-full overflow-visible">
          {[0.25, 0.5, 0.75, 1].map((g) => (
            <line key={g} x1={0} x2={Wd} y1={Ht - 4 - g * (Ht - 12)} y2={Ht - 4 - g * (Ht - 12)} stroke="#222226" strokeWidth={0.2} />
          ))}
          {pts.slice(0, now).map((p, k) => {
            const [x, y] = xy(k, p.value);
            const fresh = k >= before;
            const e = fresh ? prog(t, 0.1 + (k - before) * 0.25, 0.6) : 1;
            const tone = TONE[p.tone || "hot"];
            const prevPt = k > 0 ? xy(k - 1, pts[k - 1].value) : null;
            return (
              <g key={k}>
                {prevPt && <line x1={prevPt[0]} y1={prevPt[1]} x2={lerp(prevPt[0], x, e)} y2={lerp(prevPt[1], y, e)} stroke={tone.line} strokeWidth={0.7} strokeLinecap="round" />}
                <circle cx={x} cy={y} r={1.3 * e} fill={tone.line} />
                <text x={x} y={y - 3} textAnchor="middle" fontSize={2.6} fill="#f3f2ee" opacity={e}>
                  {fmt(p.value)}
                </text>
                <text x={x} y={Ht + 4} textAnchor="middle" fontSize={2.2} fill="#8a8a90">
                  {p.label}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <div className="flex h-[46cqh] items-end gap-[1.6cqw] border-b border-[#2a2a2e] px-[1cqw]">
          {pts.map((p, k) => {
            const shown = k < now;
            const fresh = shown && k >= before;
            const e = !shown ? 0 : fresh ? prog(t, 0.1 + (k - before) * 0.2, 0.8) : 1;
            const tone = TONE[p.tone || "hot"];
            return (
              <div key={k} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[0.8cqh]" style={{ opacity: shown ? 1 : 0.18 }}>
                <span className={`font-display text-[1.9cqw] font-extrabold tabular-nums ${W}`} style={{ opacity: shown ? e : 0 }}>
                  {fmt(Math.round(p.value * e * 10) / 10)}
                </span>
                <div className="w-full" style={{ height: `${(p.value / max) * 82 * (shown ? e : 1)}%`, background: shown ? tone.line : "#2a2a2e", boxShadow: fresh ? `0 0 2cqw ${tone.line}55` : "none" }} />
                <span className="text-center text-[1.3cqw] leading-tight text-[#a3a3a8]">{p.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimelineScene({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number }) {
  const ev = s.events || [];
  const [now, before] = revealed(st, prevSt, ev.length);
  const lineE = before === 0 ? prog(t, 0, 0.9) : 1;
  return (
    <div className="flex w-[90%] flex-col gap-[4cqh]">
      <h2 className={`m-0 text-center font-display text-[3cqw] font-extrabold tracking-[-0.03em] ${W}`}>{s.heading}</h2>
      <div className="relative">
        <div className="absolute left-0 top-[2.2cqw] h-[0.25cqw] bg-[#3a3a40]" style={{ width: `${lineE * 100}%` }} />
        <div className="grid" style={{ gridTemplateColumns: `repeat(${ev.length}, minmax(0, 1fr))` }}>
          {ev.map((x, k) => {
            const shown = k < now;
            const fresh = shown && k >= before;
            const e = !shown ? 0 : fresh ? prog(t, 0.2 + (k - before) * 0.2, 0.45) : 1;
            const latest = k === now - 1;
            const tone = TONE[x.tone || (latest ? "hot" : "neutral")];
            return (
              <div key={k} className="flex flex-col items-center gap-[1.2cqh] px-[0.6cqw] text-center" style={{ opacity: shown ? e : 0.15 }}>
                <span
                  className="block h-[4.4cqw] w-[4.4cqw] rounded-full border-[0.3cqw]"
                  style={{ borderColor: tone.line, background: latest ? tone.line : "#0b0b0c", transform: `scale(${fresh ? 0.6 + 0.4 * e : 1})`, boxShadow: latest ? `0 0 2cqw ${tone.line}88` : "none" }}
                />
                <span className="font-mono text-[1.35cqw] text-[#ff6b2b]">{x.at}</span>
                <span className={`text-[1.5cqw] leading-snug ${latest ? W : "text-[#a3a3a8]"}`}>{x.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PhoneScene({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number }) {
  const screens = s.screens || [];
  const k = clamp(st.screen ?? 0, 0, Math.max(0, screens.length - 1));
  const sc = screens[k] || { title: "", rows: [] };
  const changed = !prevSt || (prevSt.screen ?? 0) !== k;
  const [now, before] = changed ? [st.reveal ?? sc.rows.length, 0] : revealed(st, prevSt, sc.rows.length);
  const e = changed ? prog(t, 0, 0.45) : 1;
  const toastE = sc.toast ? prog(t, changed ? 0.6 : 0.1, 0.45) : 0;
  return (
    <div className="flex h-full w-full items-center justify-center gap-[5cqw]">
      <div className="relative h-[96%] aspect-[9/18.5] rounded-[2.4cqw] border-[0.35cqw] border-[#3a3a40] bg-[#111113] p-[1cqw] shadow-[0_2cqw_5cqw_rgba(0,0,0,0.6)]">
        <div className="mx-auto mb-[1.4cqh] h-[1.6cqh] w-[30%] rounded-full bg-[#222226]" />
        <div className="flex h-[calc(100%-3cqh)] flex-col gap-[1.4cqh] overflow-hidden rounded-[1.4cqw] bg-[#0b0b0c] p-[1.2cqw]" style={{ opacity: e, transform: `translateX(${(1 - e) * 2}cqw)` }}>
          <span className="font-mono text-[0.95cqw] uppercase tracking-[0.12em] text-[#8a8a90]">{s.app}</span>
          <span className={`font-display text-[1.75cqw] font-extrabold leading-tight ${W}`}>{sc.title}</span>
          {sc.rows.slice(0, now).map((r, j) => {
            const tone = TONE[r.tone || "neutral"];
            return (
              <Item key={`${k}-${j}`} fresh={j >= before} t={t} k0={j - before} className="flex items-center justify-between gap-[0.6cqw] border-b border-[#1d1d20] pb-[1cqh]">
                <span className="flex min-w-0 items-center gap-[0.6cqw]">
                  <span className="h-[0.7cqw] w-[0.7cqw] shrink-0 rounded-full" style={{ background: tone.line }} />
                  <span className={`text-[1.2cqw] leading-snug ${W}`}>{r.text}</span>
                </span>
                {r.meta && (
                  <span className="shrink-0 font-mono text-[1cqw]" style={{ color: tone.fg }}>
                    {r.meta}
                  </span>
                )}
              </Item>
            );
          })}
        </div>
        {sc.toast && (
          <div
            className="absolute inset-x-[6%] top-[5%] rounded-[1cqw] border border-[#3a3a40] bg-[#1b1b1e] px-[1cqw] py-[1.2cqh] text-[1.1cqw] text-[#f3f2ee] shadow-[0_1cqw_2cqw_rgba(0,0,0,0.5)]"
            style={{ opacity: toastE, transform: `translateY(${(1 - toastE) * -4}cqh)` }}
          >
            {sc.toast}
          </div>
        )}
      </div>
      {s.heading && <h2 className={`m-0 max-w-[38%] font-display text-[3.2cqw] font-extrabold leading-[1.05] tracking-[-0.03em] ${W}`}>{s.heading}</h2>}
    </div>
  );
}

/* ---------- diagrams ---------- */

type Box = { x: number; y: number; w: number; h: number };
type Cam = { s: number; x: number; y: number };

export function DiagramScene({
  s,
  st,
  prevSt,
  t,
  i,
  onReady,
  show,
  zoom,
}: {
  s: LectureScene;
  st: LectureStep;
  prevSt: LectureStep | null;
  t: number;
  i: number;
  onReady?: (i: number) => void;
  show?: string[];
  /** the camera's closest zoom on the lit nodes (default 1.8; state diagrams 2.3) — a narrow frame wants less */
  zoom?: number;
}) {
  const src = diagramFor(s, st);
  const [svg, setSvg] = useState<{ src: string; html: string } | null>(null);
  const camRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const boxes = useRef<Map<string, Box>>(new Map());
  const size = useRef({ w: 1, h: 1 });

  useEffect(() => {
    let off = false;
    if (!src) return;
    renderSvg(src)
      .then((html) => !off && setSvg({ src, html }))
      .catch(() => !off && setSvg({ src, html: "" }));
    return () => {
      off = true;
    };
  }, [src]);
  const ready = svg?.src === src;

  // measure every node at camera rest, once per drawn SVG (and again if the stage changes size, e.g.
  // full screen). In the stage's own pixels: a scaled ancestor (the Ask panel's fit) is divided out.
  const measure = () => {
    const cam = camRef.current;
    const host = hostRef.current;
    if (!cam || !host) return;
    const keep = cam.style.transform;
    const keepT = cam.style.transition;
    cam.style.transition = "none";
    cam.style.transform = "none";
    const base = cam.getBoundingClientRect();
    size.current = { w: cam.offsetWidth || 1, h: cam.offsetHeight || 1 };
    const k = base.width / size.current.w || 1;
    const m = new Map<string, Box>();
    for (const g of host.querySelectorAll<SVGGElement>("g.node")) {
      const id = nodeId(g);
      if (!id) continue;
      const r = g.getBoundingClientRect();
      m.set(id, { x: (r.left - base.left) / k, y: (r.top - base.top) / k, w: r.width / k, h: r.height / k });
    }
    boxes.current = m;
    cam.style.transform = keep;
    void cam.offsetWidth;
    cam.style.transition = keepT;
  };
  useLayoutEffect(() => {
    if (ready) measure();
  }, [ready, svg]);

  const isSeq = s.kind === "sequence";
  // an Ask answer's [[show]] replaces the step's highlight outright (no lerp from the step before)
  const asked = !isSeq && !!show?.length;
  const lit = useMemo(() => (asked ? show! : st.highlight || []), [asked, show, st.highlight]);
  const litBefore = useMemo(() => (asked ? show! : prevSt?.highlight || []), [asked, show, prevSt]);

  // apply this moment: dimming, glow, packets, camera, sequence draw-in
  useLayoutEffect(() => {
    const host = hostRef.current;
    const cam = camRef.current;
    if (!ready || !host || !cam) return;
    const root = host.querySelector("svg");
    if (!root) return;
    if (isSeq) {
      drawSequence(root, st.upto ?? null, prevSt?.upto ?? 0, t);
    } else {
      if (cam.offsetWidth !== size.current.w || cam.offsetHeight !== size.current.h) measure();
      const e = asked ? 1 : easeOut(t / 0.6);
      // only while the Ask panel lights nodes: ease into it (the authored steps stay a pure function of t)
      const ease = asked ? "opacity .45s ease, filter .45s ease" : "";
      const op = (set: string[], id: string) => (set.length ? (set.includes(id) ? 1 : 0.32) : 1);
      const nodes = [...root.querySelectorAll<SVGGElement>("g.node")];
      for (const g of nodes) {
        const id = nodeId(g);
        if (!id) continue;
        g.style.transition = ease;
        g.style.opacity = String(lerp(op(litBefore, id), op(lit, id), e));
        const glowNow = lit.includes(id) ? 1 : 0;
        const glowBefore = litBefore.includes(id) ? 1 : 0;
        const glow = lerp(glowBefore, glowNow, e);
        g.style.filter = glow > 0.01 ? `drop-shadow(0 0 ${10 * glow}px rgba(255,107,43,${0.85 * glow}))` : "";
        g.classList.toggle("hk-lit", glow > 0.5);
      }
      const ids = new Set(nodes.map(nodeId).filter(Boolean) as string[]);
      const flowPairs = new Set<string>();
      const flow = asked ? [] : st.flow || [];
      for (let k = 0; k + 1 < flow.length; k++) flowPairs.add(`${flow[k]}>${flow[k + 1]}`);
      const edges = edgeEls(root, ids);
      for (const ed of edges) {
        ed.el.style.transition = ease;
        const both = (set: string[]) => (set.length ? (set.includes(ed.a) && set.includes(ed.b) ? 1 : 0.28) : 1);
        const onFlow = flowPairs.has(`${ed.a}>${ed.b}`);
        ed.el.style.opacity = String(onFlow ? 1 : lerp(both(litBefore), both(lit), e));
        ed.el.style.stroke = onFlow ? "#ff6b2b" : "";
        ed.el.style.strokeWidth = onFlow ? "3px" : "";
      }
      packets(root, edges, flow, t);
      // camera
      const maxZoom = zoom ?? (s.kind === "state" ? 2.3 : 1.8);
      const target = camFor(asked ? show! : (st.focus ?? st.highlight ?? []), boxes.current, size.current, maxZoom);
      const from = asked ? target : prevSt ? camFor(prevSt.focus ?? prevSt.highlight ?? [], boxes.current, size.current, maxZoom) : { s: 1, x: 0, y: 0 };
      const c = easeInOut(t / 0.95);
      cam.style.transition = asked ? "transform .7s cubic-bezier(.4,0,.2,1)" : "";
      cam.style.transform = `translate(${lerp(from.x, target.x, c)}px, ${lerp(from.y, target.y, c)}px) scale(${lerp(from.s, target.s, c)})`;
    }
    onReady?.(i);
  });

  return (
    <div className="h-full w-full overflow-hidden">
      <div ref={camRef} className="h-full w-full origin-top-left" style={{ transformOrigin: "0 0" }}>
        <div
          ref={hostRef}
          className={`lecture-svg flex h-full w-full items-center justify-center ${"[&_svg]:!h-full [&_svg]:!w-full [&_svg]:!max-w-none"} [&_.hk-lit_rect]:!stroke-[#ff6b2b] [&_.hk-lit_polygon]:!stroke-[#ff6b2b] [&_.hk-lit_rect]:![stroke-width:2.5px] [&_.hk-lit_polygon]:![stroke-width:2.5px]`}
          dangerouslySetInnerHTML={{ __html: ready ? svg!.html : "" }}
        />
      </div>
    </div>
  );
}

function nodeId(g: Element): string | null {
  return g.id.match(/-(?:flowchart|state)-(.+)-\d+$/)?.[1] ?? null;
}

type Edge = { el: SVGPathElement; a: string; b: string };
function edgeEls(root: SVGSVGElement, ids: Set<string>): Edge[] {
  const out: Edge[] = [];
  for (const el of root.querySelectorAll<SVGPathElement>("path[data-edge='true']")) {
    const d = el.getAttribute("data-id") || "";
    if (!d.startsWith("L_")) continue;
    const body = d.slice(2).replace(/_\d+$/, "");
    // ids can contain "_": find the split where both halves are real node ids
    for (let k = 1; k < body.length; k++) {
      if (body[k] !== "_") continue;
      const a = body.slice(0, k);
      const b = body.slice(k + 1);
      if (ids.has(a) && ids.has(b)) {
        out.push({ el, a, b });
        break;
      }
    }
  }
  return out;
}

/** a glowing packet with a short tail, at fraction `f` along `path` */
function dot(path: SVGGeometryElement, f: number, big: boolean) {
  const len = path.getTotalLength();
  for (const [lag, r, o] of [
    [0.06, big ? 4 : 3, 0.25],
    [0.03, big ? 6 : 4.5, 0.5],
    [0, big ? 9 : 6.5, 1],
  ] as const) {
    const pt = path.getPointAtLength(len * Math.max(0, f - lag));
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("class", "hk-packet");
    c.setAttribute("cx", String(pt.x));
    c.setAttribute("cy", String(pt.y));
    c.setAttribute("r", String(r));
    c.setAttribute("fill", lag ? "#ff6b2b" : "#ffd2b8");
    c.setAttribute("opacity", String(o));
    if (!lag) {
      c.setAttribute("stroke", "#ff6b2b");
      c.setAttribute("stroke-width", "2.5");
      c.style.filter = "drop-shadow(0 0 8px rgba(255,107,43,1))";
    }
    path.parentNode?.appendChild(c);
  }
}

/** packets travel the `flow` path, edge after edge, three at a time, looping */
function packets(root: SVGSVGElement, edges: Edge[], flow: string[], t: number) {
  root.querySelectorAll(".hk-packet").forEach((n) => n.remove());
  if (flow.length < 2) return;
  const segs: SVGPathElement[] = [];
  for (let k = 0; k + 1 < flow.length; k++) {
    const e = edges.find((x) => x.a === flow[k] && x.b === flow[k + 1]);
    if (e) segs.push(e.el);
  }
  if (!segs.length) return;
  const per = 0.9;
  const period = segs.length * per + 0.9;
  for (let p = 0; p < 3; p++) {
    const since = t - 0.35 - p * 0.34;
    const local = ((since % period) + period) % period;
    if (since < 0 || local >= segs.length * per) continue;
    const k = Math.floor(local / per);
    dot(segs[k], easeInOut((local - k * per) / per), p === 0);
  }
}

function camFor(focus: string[], boxes: Map<string, Box>, size: { w: number; h: number }, maxZoom: number): Cam {
  const bs = focus.map((id) => boxes.get(id)).filter((b): b is Box => !!b);
  if (!bs.length) return { s: 1, x: 0, y: 0 };
  const x0 = Math.min(...bs.map((b) => b.x));
  const y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.w));
  const y1 = Math.max(...bs.map((b) => b.y + b.h));
  const w = Math.max(40, x1 - x0);
  const h = Math.max(30, y1 - y0);
  const sc = clamp(Math.min((size.w * 0.62) / w, (size.h * 0.62) / h), 1, maxZoom);
  const x = clamp(size.w / 2 - sc * (x0 + w / 2), size.w - sc * size.w, 0);
  const y = clamp(size.h / 2 - sc * (y0 + h / 2), size.h - sc * size.h, 0);
  return { s: sc, x, y };
}

/**
 * Sequences: the whole diagram is drawn once; each step shows its first `upto` items (messages and
 * notes, top to bottom) and draws the new arrows in with a packet riding along. Boxes (alt, loop) and
 * activations show once the item above them is visible.
 */
function drawSequence(root: SVGSVGElement, upto: number | null, before: number, t: number) {
  root.querySelectorAll(".hk-packet").forEach((n) => n.remove());
  const yOf = (el: Element) => {
    const b = (el as SVGGraphicsElement).getBBox?.();
    return b ? b.y + b.height / 2 : 0;
  };
  type Entry = { y: number; line?: SVGGeometryElement; els: Element[] };
  const entries: Entry[] = [];
  for (const ln of root.querySelectorAll<SVGGeometryElement>(".messageLine0, .messageLine1")) entries.push({ y: yOf(ln), line: ln, els: [ln] });
  for (const n of root.querySelectorAll<SVGRectElement>("rect.note"))
    entries.push({ y: n.getBBox().y, els: [n.parentElement && n.parentElement.tagName === "g" && n.parentElement.querySelectorAll("rect.note").length === 1 ? n.parentElement : n] });
  entries.sort((a, b) => a.y - b.y);
  // message labels and sequence numbers belong to the arrow just below / level with them
  const attach = (el: Element, below: boolean) => {
    const y = yOf(el);
    let best: Entry | null = null;
    for (const e of entries) {
      if (!e.line) continue;
      const d = below ? e.y - y : Math.abs(e.y - y);
      if (d >= -4 && (!best || d < (below ? best.y - y : Math.abs(best.y - y)))) best = e;
    }
    best?.els.push(el);
  };
  root.querySelectorAll("text.messageText").forEach((x) => attach(x, true));
  root.querySelectorAll(".sequenceNumber").forEach((x) => attach(x, false));
  // autonumber draws each number's circle on its own unclassed line, level with the message
  root.querySelectorAll("line:not([class])").forEach((x) => attach(x, false));
  const shown = upto == null ? entries.length : Math.min(entries.length, upto);
  const was = Math.min(before, shown);
  const limitY = shown < entries.length ? entries[shown].y - 6 : Infinity;
  entries.forEach((e, k) => {
    const visible = k < shown;
    const fresh = visible && k >= was;
    const p = fresh ? prog(t, 0.12 + (k - was) * 0.5, 0.6) : visible ? 1 : 0;
    for (const el of e.els) {
      const h = el as SVGElement & { style: CSSStyleDeclaration };
      if (el === e.line && e.line) {
        const len = e.line.getTotalLength();
        const dashed = e.line.classList.contains("messageLine1");
        h.style.strokeDasharray = fresh && !dashed && len ? `${len}` : "";
        h.style.strokeDashoffset = fresh && !dashed && len ? `${len * (1 - p)}` : "";
        h.style.opacity = visible ? (dashed ? String(p) : p > 0 ? "1" : "0") : "0";
        if (fresh && p > 0 && p < 1 && len) dot(e.line, p, true);
      } else h.style.opacity = String(p);
    }
  });
  // frames, labels and activation bars appear with the items they wrap
  for (const el of root.querySelectorAll<SVGGraphicsElement>(".loopLine, .labelBox, .labelText, .loopText, rect[class^='activation']")) {
    const b = el.getBBox?.();
    (el as SVGElement).style.opacity = b && b.y > limitY ? "0" : "";
  }
}
