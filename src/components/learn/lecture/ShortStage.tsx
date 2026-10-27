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

type Props = { lecture: Lecture; flat: FlatStep[]; i: number; t: number; dur: number; onReady?: (i: number) => void };

declare global {
  interface Window {
    /** export.mjs: every script word's [start, end] seconds within its step (faster-whisper, aligned) */
    __SHORT_WORDS?: number[][][];
  }
}

/** a slight overshoot, for things that pop */
const back = (x: number) => {
  const c = 1.70158;
  const y = clamp(x) - 1;
  return 1 + (c + 1) * y * y * y + c * y * y;
};

/** the step's words with their timings: the exporter's (aligned to the voice) or an estimate by length */
function timedWords(say: string, i: number, speaking: number): { w: string; s: number; e: number }[] {
  const words = say.split(/\s+/).filter(Boolean);
  const real = typeof window !== "undefined" ? window.__SHORT_WORDS?.[i] : undefined;
  if (real && real.length === words.length) return words.map((w, k) => ({ w, s: real[k][0], e: real[k][1] }));
  const total = words.reduce((a, w) => a + w.length + 1, 0) || 1;
  let acc = 0;
  return words.map((w) => {
    const s0 = (acc / total) * speaking;
    acc += w.length + 1;
    return { w, s: s0, e: (acc / total) * speaking };
  });
}

/** the voice needs "99 point 7 percent"; the caption reads "99.7%" (merged words keep the first start and last end) */
function tidy(words: { w: string; s: number; e: number }[]) {
  const out: typeof words = [];
  for (let k = 0; k < words.length; k++) {
    const x = words[k];
    const m = words[k + 2];
    if (/^\d[\d,]*$/.test(x.w) && words[k + 1]?.w.toLowerCase() === "point" && m && /^\d+[.,!?;:]*$/.test(m.w)) {
      out.push({ w: `${x.w}.${m.w}`, s: x.s, e: m.e });
      k += 2;
      continue;
    }
    const p = out[out.length - 1];
    if (p && /^percent[.,!?;:]*$/i.test(x.w) && /\d$/.test(p.w)) {
      out[out.length - 1] = { w: `${p.w}%${x.w.slice(7)}`, s: p.s, e: x.e };
      continue;
    }
    out.push(x);
  }
  return out;
}

/** Reels captions: 2-3 words at a time, breaking after punctuation */
function chunks(words: { w: string; s: number; e: number }[]) {
  const out: { w: string; s: number; e: number }[][] = [];
  let cur: typeof words = [];
  for (const x of words) {
    cur.push(x);
    const len = cur.reduce((a, y) => a + y.w.length + 1, 0);
    if (cur.length >= 3 || len >= 15 || /[.,!?;:]$/.test(x.w)) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean);

export default function ShortStage({ lecture, flat, i, t, dur, onReady }: Props) {
  const cur = flat[i];
  const s = cur.s;
  const st = cur.st;
  const prev = i > 0 && flat[i - 1].scene === cur.scene ? flat[i - 1] : null;
  const firstOfScene = !prev;
  const hasDiagram = s.kind === "flowchart" || s.kind === "state" || s.kind === "sequence";
  const label = lecture.short?.label || "";
  // charts group digits the way the voice counts: lakh/crore shorts in Indian style (54,00,000), the rest
  // internationally (5,400,000), since most narrate in millions for a global feed
  const locale = lecture.scenes.some((x) => x.steps.some((y) => /\b(lakh|crore)s?\b/i.test(y.say))) ? "en-IN" : "en-US";
  const scenes = lecture.scenes.length;

  // motion: a new scene slides up with a flash cut; every beat punches in, then drifts slowly
  const enter = firstOfScene ? back(t / 0.42) : 1;
  const punch = 1 + 0.045 * (1 - clamp(t / 0.32));
  const drift = 1 + 0.018 * clamp(t / Math.max(dur, 0.5));
  const flash = firstOfScene && i > 0 ? 0.28 * (1 - clamp(t / 0.14)) : 0;

  // captions: the chunk being spoken, its spoken word lit
  const speaking = Math.max(0.3, dur - (st.pause ?? 0) - 0.12);
  const words = timedWords(st.say, i, speaking);
  const groups = chunks(tidy(words));
  let g = 0;
  for (let k = 0; k < groups.length; k++) if (groups[k][0].s <= t + 0.02) g = k;
  const group = groups[g] || [];
  const gIn = clamp((t - (group[0]?.s ?? 0)) / 0.12);
  // a title scene shows its own giant words: no second copy as a caption when they say the same thing
  const headingWords = new Set(norm(s.heading || ""));
  const sayWords = norm(st.say);
  const dup = s.kind === "title" && sayWords.length > 0 && sayWords.filter((w) => headingWords.has(w)).length / sayWords.length > 0.6;

  const sticker = st.caption ? back((t - 0.06) / 0.3) : 0;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0b0c] [container-type:size]">
      {/* backdrop: the blueprint grid, drifting, and a warm glow */}
      <div
        aria-hidden
        className="absolute -inset-[4%] opacity-[0.35] [background-image:linear-gradient(#1a1a1d_1px,transparent_1px),linear-gradient(90deg,#1a1a1d_1px,transparent_1px)] [background-size:6cqw_6cqw]"
        style={{ transform: `translateY(${(-((i + clamp(t / Math.max(dur, 0.5))) * 0.6) % 6)}cqw)` }}
      />
      <div aria-hidden className="absolute -right-[30%] -top-[10%] h-[50%] w-[100%] rounded-full bg-[radial-gradient(closest-side,rgba(255,107,43,0.16),transparent)]" />

      {/* stories-style progress: one segment per scene */}
      <div className="absolute inset-x-[4%] top-[1.6%] flex gap-[1cqw]">
        {Array.from({ length: scenes }, (_, k) => {
          const f = k < cur.scene ? 1 : k > cur.scene ? 0 : clamp((cur.step + clamp(t / Math.max(dur, 0.1))) / Math.max(1, s.steps.length));
          return (
            <span key={k} className="h-[0.45cqh] flex-1 bg-[#ffffff26]">
              <span className="block h-full bg-[#f3f2ee]" style={{ width: `${f * 100}%` }} />
            </span>
          );
        })}
      </div>
      <div className="absolute inset-x-[4%] top-[3.2%] flex items-center gap-[1.6cqw] font-mono text-[2.6cqw] uppercase tracking-[0.12em] text-[#ff6b2b]">
        <span className="inline-block h-[1.4cqw] w-[1.4cqw] shrink-0 bg-[#ff6b2b]" />
        <span className="truncate">{label}</span>
      </div>

      {/* the scene */}
      <div
        className="absolute inset-x-[5%] bottom-[25%] top-[13.5%] flex items-center justify-center"
        style={{ opacity: clamp(enter * 1.4), transform: `translateY(${(1 - enter) * 6}cqh) scale(${(0.92 + 0.08 * enter) * punch * drift})` }}
      >
        {s.kind === "title" && <PTitle s={s} t={t} first={cur.step === 0} fallback={lecture.title} />}
        {s.kind === "numbers" && <PNumbers s={s} k={cur.step} t={t} />}
        {s.kind === "list" && <PList s={s} st={st} prevSt={prev?.st ?? null} t={t} />}
        {s.kind === "compare" && <PCompare s={s} st={st} prevSt={prev?.st ?? null} t={t} />}
        {s.kind === "chart" && <PChart s={s} st={st} prevSt={prev?.st ?? null} t={t} locale={locale} />}
        {s.kind === "timeline" && <PTimeline s={s} st={st} prevSt={prev?.st ?? null} t={t} />}
        {s.kind === "phone" && <PPhone s={s} st={st} prevSt={prev?.st ?? null} t={t} />}
        {hasDiagram && (
          <div className="flex h-full w-full flex-col gap-[2cqh]">
            {s.heading && <h2 className={`m-0 text-center font-display text-[6.4cqw] font-extrabold leading-[1.05] tracking-[-0.03em] ${W}`}>{s.heading}</h2>}
            <div className="relative min-h-0 flex-1 [container-type:size]">
              {/* portrait: no camera zoom. The whole diagram stays in frame (lit nodes glow, the rest dim); any zoom
                  on a side node pushes its neighbours' labels off a 9:16 screen */}
              <DiagramScene key={s.id} s={s} st={st} prevSt={prev?.st ?? null} t={t} i={i} onReady={onReady} zoom={1} />
            </div>
          </div>
        )}
      </div>

      {/* the beat's sticker: pops onto the visual, tilted */}
      {st.caption && (
        <div className="absolute right-[5%] top-[6.6%] z-10 origin-top-right" style={{ transform: `rotate(-4deg) scale(${sticker})`, opacity: clamp(sticker * 2) }}>
          <span className="block bg-[#ff6b2b] px-[2.6cqw] py-[0.9cqh] font-mono text-[3.6cqw] font-bold uppercase tracking-[0.04em] text-[#120700] shadow-[0_1.4cqw_3cqw_rgba(0,0,0,0.55)]">
            {st.caption}
          </span>
        </div>
      )}

      {/* Reels captions: big, a few words at a time, the spoken word lit */}
      {!dup && group.length > 0 && (
        <div className="absolute inset-x-[5%] top-[77%] flex justify-center">
          <p
            className="m-0 flex flex-wrap justify-center gap-x-[0.42em] text-center font-display text-[9cqw] font-extrabold uppercase leading-[1.04] tracking-[-0.01em]"
            style={{
              transform: `scale(${0.86 + 0.14 * back(gIn)})`,
              opacity: clamp(gIn * 3),
              WebkitTextStroke: "0.5cqw #0b0b0c",
              paintOrder: "stroke fill",
              textShadow: "0 1cqw 3cqw rgba(0,0,0,0.7)",
              // a very long word (an 18-digit ID) shrinks the line to fit the frame instead of running off it
              fontSize: `${Math.max(5, Math.min(9, (9 * 14) / Math.max(1, ...group.map((x) => x.w.length))))}cqw`,
            }}
          >
            {group.map((x, k) => {
              const on = t >= x.s - 0.03 && (t < x.e + 0.05 || k === group.length - 1);
              // Reels captions drop full stops and commas; ? and ! stay
              const word = x.w.replace(/[.,;:]+$/, "");
              // words sit in a flex row with a fixed gap, so the lit word's pop can't close the space beside it
              return (
                <span key={k} className="inline-block" style={{ color: on ? "#ff6b2b" : "#f3f2ee", transform: `scale(${on ? 1.06 : 1})` }}>
                  {word}
                </span>
              );
            })}
          </p>
        </div>
      )}

      {/* a cut: a quick flash as a new scene lands */}
      {flash > 0 && <div aria-hidden className="absolute inset-0 bg-[#ff6b2b]" style={{ opacity: flash }} />}

      {/* the end card: the last beat holds ~2 s (export.mjs) on where to go next */}
      {i === flat.length - 1 && (
        <div className="absolute inset-x-[6%] top-[86%] flex flex-col items-center gap-[1.2cqh]" style={{ opacity: clamp((t - 0.3) / 0.4), transform: `translateY(${(1 - clamp((t - 0.3) / 0.4)) * 2}cqh)` }}>
          <span className="bg-[#ff6b2b] px-[4cqw] py-[1.2cqh] font-mono text-[3.6cqw] font-bold uppercase tracking-[0.06em] text-[#120700]">▶ full lecture + article</span>
        </div>
      )}

      {/* the site, small */}
      <div className="absolute inset-x-0 bottom-[3.2%] text-center font-mono text-[2.6cqw] tracking-[0.06em] text-[#8a8a90]">
        <span className="text-[#ff6b2b]">~</span>/himanshukukreja.in/learn
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
              {/* the full stop rides inside the last word, so it can never wrap onto a line of its own */}
              {k === words.length - 1 && (
                <span className="text-[#ff6b2b]" style={{ opacity: first ? prog(t, 0.2 + words.length * 0.06, 0.3) : 1 }}>
                  {end}
                </span>
              )}
            </span>
            {k < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </h2>
  );
}

function PNumbers({ s, k, t }: { s: LectureScene; k: number; t: number }) {
  const nums = s.numbers || [];
  // four cards plus a heading must fit the scene area: smaller cards when there are more of them
  const tight = nums.length >= 4;
  return (
    <div className={`flex w-full flex-col ${tight ? "gap-[1.3cqh]" : "gap-[2.2cqh]"}`}>
      {s.heading && <h2 className={`m-0 font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] ${W}`}>{s.heading}</h2>}
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
            <span className={`font-display ${tight ? "text-[9.44cqw]" : "text-[11.8cqw]"} font-extrabold leading-none tracking-[-0.03em] ${W} tabular-nums`}>{fresh ? countUp(n.value, e) : n.value}</span>
            <span className={`${tight ? "text-[3.78cqw]" : "text-[4.25cqw]"} leading-snug text-[#a3a3a8]`}>{n.label}</span>
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
      <h2 className={`m-0 font-display text-[8.02cqw] font-extrabold leading-[1.05] tracking-[-0.03em] ${W}`}>{s.heading}</h2>
      {points.slice(0, now).map((p, k) => (
        <Item key={k} fresh={k >= before} t={t} k0={k - before} className="flex items-baseline gap-[3cqw] border-l-[0.8cqw] border-[#ff6b2b] bg-[#141416] px-[4cqw] py-[2cqh]">
          <span className="font-mono text-[4.01cqw] text-[#ff6b2b]">{String(k + 1).padStart(2, "0")}</span>
          <span className={`text-[5.43cqw] leading-snug ${W}`}>{p}</span>
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
        <span className="font-mono text-[3.54cqw] uppercase tracking-[0.1em]" style={{ color: tone.fg }}>
          {side.title}
        </span>
        {side.points.slice(0, shown).map((p, k) => (
          <Item key={k} fresh={offset + k >= before} t={t} k0={offset + k - before} className={`text-[4.96cqw] leading-snug ${W}`}>
            <span style={{ color: tone.fg }}>{(side.tone || fallbackTone) === "bad" ? "✕ " : (side.tone || fallbackTone) === "good" ? "✓ " : "· "}</span>
            {p}
          </Item>
        ))}
      </div>
    );
  };
  return (
    <div className="flex w-full flex-col gap-[2cqh]">
      <h2 className={`m-0 font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] ${W}`}>{s.heading}</h2>
      {box(L, 0, "bad")}
      <div className="text-center font-display text-[5.9cqw] font-extrabold leading-none text-[#ff6b2b]">vs</div>
      {box(R, L.points.length, "good")}
    </div>
  );
}

function PChart({ s, st, prevSt, t, locale }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; locale: string }) {
  const pts = (s.points || []) as { label: string; value: number; tone?: Tone }[];
  const [now, before] = revealed(st, prevSt, pts.length);
  const max = Math.max(...pts.map((p) => p.value), 1);
  const fmt = (v: number) => `${v >= 1000 ? v.toLocaleString(locale) : Number.isInteger(v) ? v : v.toFixed(1)}${s.unit ? ` ${s.unit}` : ""}`;
  return (
    <div className="flex w-full flex-col gap-[2.6cqh]">
      <h2 className={`m-0 font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] ${W}`}>{s.heading}</h2>
      {pts.map((p, k) => {
        const shown = k < now;
        const fresh = shown && k >= before;
        const e = !shown ? 0 : fresh ? prog(t, 0.1 + (k - before) * 0.2, 0.8) : 1;
        const tone = TONE[p.tone || "hot"];
        return (
          <div key={k} className="flex flex-col gap-[0.8cqh]" style={{ opacity: shown ? 1 : 0.22 }}>
            <span className="flex items-baseline justify-between gap-[3cqw]">
              <span className="min-w-0 flex-1 text-[4.48cqw] leading-tight text-[#c9c8c4]">{p.label}</span>
              {/* one line, smaller when long ("200,000 ops a second"), so a 4-bar chart never grows into the captions;
                  whole numbers count up in whole steps */}
              <span
                className={`shrink-0 whitespace-nowrap font-display font-extrabold tabular-nums ${W} ${fmt(p.value).length > 14 ? "text-[4.6cqw]" : fmt(p.value).length > 10 ? "text-[5.4cqw]" : "text-[6.37cqw]"}`}
                style={{ opacity: shown ? e : 0 }}
              >
                {fmt(Number.isInteger(p.value) ? Math.round(p.value * e) : Math.round(p.value * e * 10) / 10)}
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
      <h2 className={`m-0 font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] ${W}`}>{s.heading}</h2>
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
              <span className="font-mono text-[4.01cqw] text-[#ff6b2b]">{x.at}</span>
              <span className={`text-[5.19cqw] leading-snug ${latest ? W : "text-[#a3a3a8]"}`}>{x.text}</span>
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
      {s.heading && <h2 className={`m-0 w-full font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] ${W}`}>{s.heading}</h2>}
      <div className="relative min-h-0 flex-1 aspect-[9/17] rounded-[5cqw] border-[0.8cqw] border-[#3a3a40] bg-[#111113] p-[2.4cqw] shadow-[0_3cqw_8cqw_rgba(0,0,0,0.6)]">
        <div className="mx-auto mb-[1.4cqh] h-[1.2cqh] w-[30%] rounded-full bg-[#222226]" />
        <div className="flex h-[calc(100%-3cqh)] flex-col gap-[1.6cqh] overflow-hidden rounded-[3cqw] bg-[#0b0b0c] p-[3cqw]" style={{ opacity: e, transform: `translateX(${(1 - e) * 3}cqw)` }}>
          <span className="font-mono text-[2.83cqw] uppercase tracking-[0.12em] text-[#8a8a90]">{s.app}</span>
          <span className={`font-display text-[5.43cqw] font-extrabold leading-tight ${W}`}>{sc.title}</span>
          {sc.rows.slice(0, now).map((r, j) => {
            const tone = TONE[r.tone || "neutral"];
            // a note that won't sit beside the row's text on one line goes under it instead of squeezing it
            const long = !!r.meta && (r.meta.length > 10 || r.text.length + r.meta.length > 20);
            return (
              <Item
                key={`${k}-${j}`}
                fresh={j >= before}
                t={t}
                k0={j - before}
                className={`flex border-b border-[#1d1d20] pb-[1.2cqh] ${long ? "flex-col gap-[0.6cqh]" : "items-center justify-between gap-[1.6cqw]"}`}
              >
                <span className="flex min-w-0 items-center gap-[1.6cqw]">
                  <span className="h-[1.8cqw] w-[1.8cqw] shrink-0 rounded-full" style={{ background: tone.line }} />
                  <span className={`text-[3.78cqw] leading-snug ${W}`}>{r.text}</span>
                </span>
                {r.meta && (
                  <span className={`font-mono text-[3.07cqw] ${long ? "pl-[3.4cqw] leading-snug" : "shrink-0"}`} style={{ color: tone.fg }}>
                    {r.meta}
                  </span>
                )}
              </Item>
            );
          })}
        </div>
        {sc.toast && (
          <div
            className="absolute inset-x-[6%] top-[6%] rounded-[2.4cqw] border border-[#3a3a40] bg-[#1b1b1e] px-[3cqw] py-[1.4cqh] text-[3.54cqw] text-[#f3f2ee] shadow-[0_2cqw_4cqw_rgba(0,0,0,0.5)]"
            style={{ opacity: toastE, transform: `translateY(${(1 - toastE) * -4}cqh)` }}
          >
            {sc.toast}
          </div>
        )}
      </div>
    </div>
  );
}
