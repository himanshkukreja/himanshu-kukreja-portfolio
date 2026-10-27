"use client";

/**
 * The vertical short's stage: 9:16, drawn natively for a phone (not the 16:9 stage letterboxed). Same
 * contract as Stage: one moment, step `i`, `t` seconds in, every animation a function of `t`, so the
 * exporter can render it frame by frame at 1080x1920.
 *
 * Layout (container units of the 9:16 box): a slim header with where it comes from, the scene in the
 * middle (stacked layouts: numbers in a column, compare top/bottom, a vertical timeline, horizontal bars,
 * diagrams drawn top-down), big burned-in captions, and a footer with progress and the full lecture.
 */
import { type FlatStep, type Lecture, type LectureScene, type LectureStep, type Tone } from "@/lib/learn/lecture/types";
import { clamp, countUp, lerp, prog, TONE } from "./anim";
import { DiagramScene, Item, revealed } from "./Stage";

const W = "text-[#f3f2ee]";

/** this step's caption line: its sentences, timed by length. A sentence ends at . ! or ? followed by a
 *  space or the end, so "9.2", "GitLab.com" or "e.g" never cut a caption in half. */
function captionAt(say: string, f: number): string {
  const parts = say.split(/(?<=[.!?]["'’”]?)\s+/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return say;
  const total = parts.reduce((a, p) => a + p.length, 0) || 1;
  let acc = 0;
  for (const p of parts) {
    acc += p.length;
    if (f <= acc / total) return p;
  }
  return parts[parts.length - 1];
}

type Props = { lecture: Lecture; flat: FlatStep[]; i: number; t: number; dur: number; onReady?: (i: number) => void };

export default function ShortStage({ lecture, flat, i, t, dur, onReady }: Props) {
  const cur = flat[i];
  const s = cur.s;
  const st = cur.st;
  const prev = i > 0 && flat[i - 1].scene === cur.scene ? flat[i - 1] : null;
  const firstOfScene = !prev;
  const enter = firstOfScene ? prog(t, 0, 0.5) : 1;
  const total = flat.length;
  const speakingFor = Math.max(0.1, dur - (st.pause ?? 0) - 0.45);
  const caption = captionAt(st.say, Math.min(1, t / speakingFor));
  const hasDiagram = s.kind === "flowchart" || s.kind === "state" || s.kind === "sequence";
  const label = lecture.short?.label || "";
  const last = i === total - 1;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0b0c] [container-type:size]">
      {/* backdrop: the blueprint grid and a warm glow */}
      <div aria-hidden className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(#1a1a1d_1px,transparent_1px),linear-gradient(90deg,#1a1a1d_1px,transparent_1px)] [background-size:6cqw_6cqw]" />
      <div aria-hidden className="absolute -right-[30%] -top-[10%] h-[45%] w-[90%] rounded-full bg-[radial-gradient(closest-side,rgba(255,107,43,0.12),transparent)]" />

      {/* header */}
      <div className="absolute inset-x-[6%] top-[3.2%] flex items-center justify-between gap-[3cqw] font-mono text-[2.5cqw] uppercase tracking-[0.12em]">
        <span className="flex min-w-0 items-center gap-[1.6cqw] text-[#ff6b2b]">
          <span className="inline-block h-[1.4cqw] w-[1.4cqw] shrink-0 bg-[#ff6b2b]" />
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 text-[#8a8a90]">short</span>
      </div>
      <div aria-hidden className="absolute inset-x-[6%] top-[6.4%] h-px bg-[#26262a]" />

      {/* the scene */}
      <div
        className="absolute inset-x-[6%] bottom-[30%] top-[9%] flex items-center justify-center"
        style={{ opacity: enter, transform: `translateY(${(1 - enter) * 1.4}cqh)` }}
      >
        {s.kind === "title" && <PTitle s={s} t={t} first={cur.step === 0} fallback={lecture.title} />}
        {s.kind === "numbers" && <PNumbers s={s} k={cur.step} t={t} />}
        {s.kind === "list" && <PList s={s} st={st} prevSt={prev?.st ?? null} t={t} />}
        {s.kind === "compare" && <PCompare s={s} st={st} prevSt={prev?.st ?? null} t={t} />}
        {s.kind === "chart" && <PChart s={s} st={st} prevSt={prev?.st ?? null} t={t} />}
        {s.kind === "timeline" && <PTimeline s={s} st={st} prevSt={prev?.st ?? null} t={t} />}
        {s.kind === "phone" && <PPhone s={s} st={st} prevSt={prev?.st ?? null} t={t} />}
        {hasDiagram && (
          <div className="flex h-full w-full flex-col gap-[2cqh]">
            {s.heading && <h2 className={`m-0 text-center font-display text-[6.4cqw] font-extrabold leading-[1.05] tracking-[-0.03em] ${W}`}>{s.heading}</h2>}
            <div className="relative min-h-0 flex-1 [container-type:size]">
              <DiagramScene key={s.id} s={s} st={st} prevSt={prev?.st ?? null} t={t} i={i} onReady={onReady} />
            </div>
          </div>
        )}
      </div>

      {/* the step's chip and the caption, big */}
      <div className="absolute inset-x-[6%] bottom-[11%] top-[72%] flex flex-col items-center justify-start gap-[1.6cqh] text-center">
        {st.caption && (
          <span
            className="bg-[#ff6b2b] px-[2.4cqw] py-[0.6cqh] font-mono text-[3cqw] font-semibold uppercase tracking-[0.06em] text-[#120700]"
            style={{ opacity: prog(t, 0.1, 0.35), transform: `translateY(${(1 - prog(t, 0.1, 0.35)) * 0.8}cqh)` }}
          >
            {st.caption}
          </span>
        )}
        <p className={`m-0 text-[5.2cqw] font-semibold leading-[1.25] tracking-[-0.01em] ${W}`}>{caption}</p>
      </div>

      {/* footer: progress and the full lecture */}
      <div className="absolute inset-x-[6%] bottom-[4%] flex flex-col gap-[1.4cqh]">
        <div className="h-[0.5cqh] w-full bg-[#1d1d20]">
          <div className="h-full bg-[#ff6b2b]" style={{ width: `${((i + Math.min(1, t / Math.max(dur, 0.1))) / total) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between font-mono text-[2.5cqw] tracking-[0.06em]">
          <span className={last ? "text-[#ff6b2b]" : "text-[#8a8a90]"}>▶ full lecture + article</span>
          <span className="text-[#c9c8c4]">
            <span className="text-[#ff6b2b]">~</span>/himanshukukreja.in/learn
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- portrait scenes ---------- */

function PTitle({ s, t, first, fallback }: { s: LectureScene; t: number; first: boolean; fallback: string }) {
  const heading = (s.heading || fallback).replace(/[.!?]$/, "");
  const end = /[!?]$/.test(s.heading || "") ? (s.heading || "").slice(-1) : ".";
  const words = heading.split(/\s+/);
  const size = heading.length > 70 ? 8.4 : heading.length > 45 ? 9.6 : 11;
  return (
    <h2 className={`m-0 font-display font-extrabold leading-[0.98] tracking-[-0.04em] ${W}`} style={{ fontSize: `${size}cqw` }}>
      {words.map((w, k) => {
        const e = first ? prog(t, 0.12 + k * 0.06, 0.4) : 1;
        return (
          <span key={k}>
            <span className="inline-block" style={{ opacity: e, transform: `translateY(${(1 - e) * 1.6}cqh)` }}>
              {w}
            </span>
            {k < words.length - 1 ? " " : ""}
          </span>
        );
      })}
      <span className="text-[#ff6b2b]" style={{ opacity: first ? prog(t, 0.2 + words.length * 0.06, 0.3) : 1 }}>
        {end}
      </span>
    </h2>
  );
}

function PNumbers({ s, k, t }: { s: LectureScene; k: number; t: number }) {
  const nums = s.numbers || [];
  // four cards plus a heading must fit the scene area: smaller cards when there are more of them
  const tight = nums.length >= 4;
  return (
    <div className={`flex w-full flex-col ${tight ? "gap-[1.3cqh]" : "gap-[2.2cqh]"}`}>
      {s.heading && <h2 className={`m-0 font-display text-[6.4cqw] font-extrabold leading-[1.05] tracking-[-0.03em] ${W}`}>{s.heading}</h2>}
      {nums.map((n, j) => {
        const on = j <= k;
        const fresh = j === k;
        const e = fresh ? prog(t, 0.05, 0.9) : 1;
        return (
          <div
            key={j}
            className={`flex flex-col gap-[0.4cqh] border px-[4cqw] ${tight ? "py-[1.3cqh]" : "py-[2.2cqh]"}`}
            style={{ borderColor: on ? "#ff6b2b" : "#2a2a2e", background: on ? "#1a0f08" : "transparent", opacity: on ? 1 : 0.28, boxShadow: fresh ? `0 0 ${5 * (1 - clamp(t / 1.2))}cqw rgba(255,107,43,0.35)` : "none" }}
          >
            <span className={`font-display ${tight ? "text-[8cqw]" : "text-[10cqw]"} font-extrabold leading-none tracking-[-0.03em] ${W} tabular-nums`}>{fresh ? countUp(n.value, e) : n.value}</span>
            <span className={`${tight ? "text-[3.2cqw]" : "text-[3.6cqw]"} leading-snug text-[#a3a3a8]`}>{n.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function PList({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number }) {
  const points = (s.points || []) as string[];
  const [now, before] = revealed(st, prevSt, points.length);
  return (
    <div className="flex w-full flex-col gap-[2.4cqh]">
      <h2 className={`m-0 font-display text-[6.8cqw] font-extrabold leading-[1.05] tracking-[-0.03em] ${W}`}>{s.heading}</h2>
      {points.slice(0, now).map((p, k) => (
        <Item key={k} fresh={k >= before} t={t} k0={k - before} className="flex items-baseline gap-[3cqw] border-l-[0.8cqw] border-[#ff6b2b] bg-[#141416] px-[4cqw] py-[2cqh]">
          <span className="font-mono text-[3.4cqw] text-[#ff6b2b]">{String(k + 1).padStart(2, "0")}</span>
          <span className={`text-[4.6cqw] leading-snug ${W}`}>{p}</span>
        </Item>
      ))}
    </div>
  );
}

function PCompare({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number }) {
  const L = s.left || { title: "", points: [] };
  const R = s.right || { title: "", points: [] };
  const all = L.points.length + R.points.length;
  const [now, before] = revealed(st, prevSt, all);
  const box = (side: typeof L, offset: number, fallbackTone: Tone) => {
    const tone = TONE[side.tone || fallbackTone];
    const shown = clamp(now - offset, 0, side.points.length);
    const lit = offset === 0 ? now > 0 : now > L.points.length;
    return (
      <div className="flex flex-col gap-[1.4cqh] border px-[4cqw] py-[2.2cqh]" style={{ borderColor: tone.line, background: tone.bg, opacity: lit ? 1 : 0.32 }}>
        <span className="font-mono text-[3cqw] uppercase tracking-[0.1em]" style={{ color: tone.fg }}>
          {side.title}
        </span>
        {side.points.slice(0, shown).map((p, k) => (
          <Item key={k} fresh={offset + k >= before} t={t} k0={offset + k - before} className={`text-[4.2cqw] leading-snug ${W}`}>
            <span style={{ color: tone.fg }}>{(side.tone || fallbackTone) === "bad" ? "✕ " : (side.tone || fallbackTone) === "good" ? "✓ " : "· "}</span>
            {p}
          </Item>
        ))}
      </div>
    );
  };
  return (
    <div className="flex w-full flex-col gap-[2cqh]">
      <h2 className={`m-0 font-display text-[6.4cqw] font-extrabold leading-[1.05] tracking-[-0.03em] ${W}`}>{s.heading}</h2>
      {box(L, 0, "bad")}
      <div className="text-center font-display text-[5cqw] font-extrabold leading-none text-[#ff6b2b]">vs</div>
      {box(R, L.points.length, "good")}
    </div>
  );
}

function PChart({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number }) {
  const pts = (s.points || []) as { label: string; value: number; tone?: Tone }[];
  const [now, before] = revealed(st, prevSt, pts.length);
  const max = Math.max(...pts.map((p) => p.value), 1);
  const fmt = (v: number) => `${v >= 1000 ? v.toLocaleString("en-IN") : Number.isInteger(v) ? v : v.toFixed(1)}${s.unit ? ` ${s.unit}` : ""}`;
  return (
    <div className="flex w-full flex-col gap-[2.6cqh]">
      <h2 className={`m-0 font-display text-[6.4cqw] font-extrabold leading-[1.05] tracking-[-0.03em] ${W}`}>{s.heading}</h2>
      {pts.map((p, k) => {
        const shown = k < now;
        const fresh = shown && k >= before;
        const e = !shown ? 0 : fresh ? prog(t, 0.1 + (k - before) * 0.2, 0.8) : 1;
        const tone = TONE[p.tone || "hot"];
        return (
          <div key={k} className="flex flex-col gap-[0.8cqh]" style={{ opacity: shown ? 1 : 0.22 }}>
            <span className="flex items-baseline justify-between gap-[3cqw]">
              <span className="text-[3.8cqw] leading-tight text-[#c9c8c4]">{p.label}</span>
              <span className={`font-display text-[5.4cqw] font-extrabold tabular-nums ${W}`} style={{ opacity: shown ? e : 0 }}>
                {fmt(Math.round(p.value * e * 10) / 10)}
              </span>
            </span>
            <div className="h-[2.4cqh] w-full bg-[#1d1d20]">
              <div className="h-full" style={{ width: `${(p.value / max) * 100 * (shown ? e : 0)}%`, background: tone.line, boxShadow: fresh ? `0 0 3cqw ${tone.line}55` : "none" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PTimeline({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number }) {
  const ev = s.events || [];
  const [now, before] = revealed(st, prevSt, ev.length);
  const lineE = before === 0 ? prog(t, 0, 0.9) : 1;
  return (
    <div className="flex w-full flex-col gap-[3cqh]">
      <h2 className={`m-0 font-display text-[6.4cqw] font-extrabold leading-[1.05] tracking-[-0.03em] ${W}`}>{s.heading}</h2>
      <div className="relative flex flex-col gap-[2.6cqh] pl-[9cqw]">
        <div className="absolute left-[2.6cqw] top-[1cqh] w-[0.6cqw] bg-[#3a3a40]" style={{ height: `${lerp(0, 96, lineE)}%` }} />
        {ev.map((x, k) => {
          const shown = k < now;
          const fresh = shown && k >= before;
          const e = !shown ? 0 : fresh ? prog(t, 0.2 + (k - before) * 0.2, 0.45) : 1;
          const latest = k === now - 1;
          const tone = TONE[x.tone || (latest ? "hot" : "neutral")];
          return (
            <div key={k} className="relative flex flex-col gap-[0.6cqh]" style={{ opacity: shown ? e : 0.16 }}>
              <span
                className="absolute -left-[8.4cqw] top-[0.4cqh] block h-[5cqw] w-[5cqw] rounded-full border-[0.7cqw]"
                style={{ borderColor: tone.line, background: latest ? tone.line : "#0b0b0c", transform: `scale(${fresh ? 0.6 + 0.4 * e : 1})`, boxShadow: latest ? `0 0 3cqw ${tone.line}88` : "none" }}
              />
              <span className="font-mono text-[3.4cqw] text-[#ff6b2b]">{x.at}</span>
              <span className={`text-[4.4cqw] leading-snug ${latest ? W : "text-[#a3a3a8]"}`}>{x.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PPhone({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number }) {
  const screens = s.screens || [];
  const k = clamp(st.screen ?? 0, 0, Math.max(0, screens.length - 1));
  const sc = screens[k] || { title: "", rows: [] };
  const changed = !prevSt || (prevSt.screen ?? 0) !== k;
  const [now, before] = changed ? [st.reveal ?? sc.rows.length, 0] : revealed(st, prevSt, sc.rows.length);
  const e = changed ? prog(t, 0, 0.45) : 1;
  const toastE = sc.toast ? prog(t, changed ? 0.6 : 0.1, 0.45) : 0;
  return (
    <div className="flex h-full w-full flex-col items-center gap-[2.4cqh]">
      {s.heading && <h2 className={`m-0 w-full font-display text-[6.4cqw] font-extrabold leading-[1.05] tracking-[-0.03em] ${W}`}>{s.heading}</h2>}
      <div className="relative min-h-0 flex-1 aspect-[9/17] rounded-[5cqw] border-[0.8cqw] border-[#3a3a40] bg-[#111113] p-[2.4cqw] shadow-[0_3cqw_8cqw_rgba(0,0,0,0.6)]">
        <div className="mx-auto mb-[1.4cqh] h-[1.2cqh] w-[30%] rounded-full bg-[#222226]" />
        <div className="flex h-[calc(100%-3cqh)] flex-col gap-[1.6cqh] overflow-hidden rounded-[3cqw] bg-[#0b0b0c] p-[3cqw]" style={{ opacity: e, transform: `translateX(${(1 - e) * 3}cqw)` }}>
          <span className="font-mono text-[2.4cqw] uppercase tracking-[0.12em] text-[#8a8a90]">{s.app}</span>
          <span className={`font-display text-[4.6cqw] font-extrabold leading-tight ${W}`}>{sc.title}</span>
          {sc.rows.slice(0, now).map((r, j) => {
            const tone = TONE[r.tone || "neutral"];
            return (
              <Item key={`${k}-${j}`} fresh={j >= before} t={t} k0={j - before} className="flex items-center justify-between gap-[1.6cqw] border-b border-[#1d1d20] pb-[1.2cqh]">
                <span className="flex min-w-0 items-center gap-[1.6cqw]">
                  <span className="h-[1.8cqw] w-[1.8cqw] shrink-0 rounded-full" style={{ background: tone.line }} />
                  <span className={`text-[3.2cqw] leading-snug ${W}`}>{r.text}</span>
                </span>
                {r.meta && (
                  <span className="shrink-0 font-mono text-[2.6cqw]" style={{ color: tone.fg }}>
                    {r.meta}
                  </span>
                )}
              </Item>
            );
          })}
        </div>
        {sc.toast && (
          <div
            className="absolute inset-x-[6%] top-[6%] rounded-[2.4cqw] border border-[#3a3a40] bg-[#1b1b1e] px-[3cqw] py-[1.4cqh] text-[3cqw] text-[#f3f2ee] shadow-[0_2cqw_4cqw_rgba(0,0,0,0.5)]"
            style={{ opacity: toastE, transform: `translateY(${(1 - toastE) * -4}cqh)` }}
          >
            {sc.toast}
          </div>
        )}
      </div>
    </div>
  );
}
