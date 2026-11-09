"use client";

/**
 * DSA Mastery's scenes on the vertical short (ShortStage, 9:16 at 1080x1920): quote, array, trace, race and code,
 * stacked for a phone. They reuse the 16:9 stage's pieces (DsaScenes.tsx: the array strip, the code panel, the
 * variable tiles) at a larger scale `k`, and keep its rules: every motion is a function of `t`, sizes are in units of
 * the short's 9:16 box (cqw), and the accent is --lec-accent (DSA teal on a DSA short).
 */
import type { LectureScene, LectureStep, LectureTraceFrame } from "@/lib/learn/lecture/types";
import { clamp, prog, TONE } from "./anim";
import { ACC, accA, ArrayStrip, CodePanel, INK, roomFor, VarTiles, type Strip } from "./DsaScenes";

const W = "text-[#f3f2ee]";

function PHeading({ children }: { children: React.ReactNode }) {
  return <h2 className={`m-0 w-full font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] ${W}`}>{children}</h2>;
}

/** A cast quote card: the words land one by one, then who said it. */
export function PQuote({ s, t, first }: { s: LectureScene; t: number; first: boolean }) {
  const words = (s.text || "").split(/\s+/).filter(Boolean);
  const name = s.person?.name || s.who || "";
  const role = s.person?.role || "";
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const step = Math.min(0.05, 0.7 / Math.max(1, words.length));
  const markE = first ? prog(t, 0, 0.4) : 1;
  const byE = first ? prog(t, 0.35 + words.length * step, 0.4) : 1;
  const size = words.length > 14 ? 6.4 : 7.4;
  return (
    <figure className="relative m-0 flex w-full flex-col gap-[4cqh] border-l-[1cqw] py-[2cqh] pl-[6cqw]" style={{ borderColor: ACC }}>
      <span aria-hidden className="absolute -top-[13cqw] left-[3cqw] font-display text-[26cqw] font-extrabold leading-none" style={{ color: ACC, opacity: 0.85 * markE }}>
        “
      </span>
      <blockquote className={`m-0 font-display font-bold leading-[1.15] tracking-[-0.02em] ${W}`} style={{ fontSize: `${size}cqw` }}>
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
      <figcaption className="flex items-center gap-[3cqw]" style={{ opacity: byE, transform: `translateX(${(1 - byE) * -3}cqw)` }}>
        <span className="grid h-[12cqw] w-[12cqw] place-items-center rounded-full border-[0.6cqw] bg-[#141416] font-mono text-[4cqw] font-semibold" style={{ borderColor: ACC, color: ACC }}>
          {initials}
        </span>
        <span className="flex flex-col gap-[0.6cqh]">
          <span className={`text-[5cqw] font-semibold leading-tight ${W}`}>{name}</span>
          {role && <span className="font-mono text-[3cqw] uppercase tracking-[0.1em] text-[#8a8a90]">{role}</span>}
        </span>
      </figcaption>
    </figure>
  );
}

/** The array strip, full width: the window, marks and pointers glide from the previous step's. */
export function PArray({ s, st, prevSt, t, first }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  const values = s.values || [];
  const strip = (x: LectureStep): Strip => ({ window: x.window ?? null, mark: x.mark, pointers: x.pointers });
  return (
    <div className="flex w-full flex-col items-center gap-[5cqh]">
      {s.heading && <PHeading>{s.heading}</PHeading>}
      <ArrayStrip values={values} now={strip(st)} before={prevSt ? strip(prevSt) : null} t={t} first={first} width={88} room={roomFor(s.steps.map(strip), false)} k={2.6} />
    </div>
  );
}

/** A dry run: the strip, the variables (one hidden while the narration asks to predict it), the note, the code below. */
export function PTrace({ s, st, prevSt, t, first }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  const tr = s.traceData;
  if (!tr || !tr.frames.length) return <PHeading>{s.heading}</PHeading>;
  const k = clamp(st.frame ?? 0, 0, tr.frames.length - 1);
  const f = tr.frames[k];
  const pk = prevSt ? clamp(prevSt.frame ?? 0, 0, tr.frames.length - 1) : null;
  const pf = pk != null ? tr.frames[pk] : null;
  const predicting = !!f.ask && /\bpredict\b/i.test(st.say);
  const revealing = !predicting && pk === k && !!f.ask && !!prevSt && /\bpredict\b/i.test(prevSt.say);
  const strip = (x: LectureTraceFrame): Strip => ({ window: x.view.window, pointers: x.view.pointers, leaving: x.view.leaving, joining: x.view.joining });
  const noteE = predicting ? 0 : pk === k ? 1 : prog(t, 0.35, 0.4);
  const code = tr.code;
  const lines = code ? code.source.split("\n").length : 0;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-[2.4cqh]">
      {s.heading && <PHeading>{s.heading}</PHeading>}
      <ArrayStrip values={tr.values} now={strip(f)} before={pf ? strip(pf) : null} t={t} first={first} width={88} room={roomFor(tr.frames.map(strip), true)} k={1.9} />
      <VarTiles vars={tr.vars} frame={f} prev={pf && pk !== k ? pf : null} hide={predicting ? f.ask || null : null} reveal={revealing ? f.ask || null : null} t={t} k={2.3} />
      <p className="m-0 min-h-[2.4em] w-full text-center font-mono text-[3.3cqw] leading-snug text-[#a3a3a8]" style={{ opacity: noteE }}>
        {f.note}
      </p>
      {code && (
        <div className="w-full">
          <CodePanel code={code} markers={f.marker ? [f.marker] : []} before={pf ? (pf.marker ? [pf.marker] : []) : null} t={t} font={clamp(40 / (lines * 1.55), 1.6, 2.6)} lang={tr.lang} k={2.2} />
        </div>
      )}
    </div>
  );
}

/** The template with the step's marker lines lit: as large as the scene's height allows. */
export function PCode({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number }) {
  const code = s.code;
  if (!code) return <PHeading>{s.heading}</PHeading>;
  const n = code.source.split("\n").length;
  return (
    <div className="flex w-full flex-col gap-[2cqh]">
      <div className="flex flex-col gap-[0.8cqh]">
        <PHeading>{s.heading}</PHeading>
        {code.label && <span className="font-mono text-[3.2cqw] text-[#a3a3a8]">{code.label}</span>}
      </div>
      <CodePanel code={code} markers={st.markers || []} before={prevSt ? prevSt.markers || [] : null} t={t} font={clamp(88 / (n * 1.55), 1.9, 3.4)} lang={s.lang} k={2.4} />
    </div>
  );
}

const nf = (n: number) => Math.round(n).toLocaleString("en-US");

/** The measured race, stacked: per input size one bar per version (to scale within the size), then the gap. */
export function PRace({ s, t, first }: { s: LectureScene; t: number; first: boolean }) {
  const r = s.raceData;
  if (!r || !r.sizes.length) return <PHeading>{s.heading}</PHeading>;
  const last = r.sizes.length - 1;
  const bad = r.series.find((x) => x.tone === "bad");
  const good = r.series.find((x) => x.tone === "good");
  const ratio = bad && good && good.counts[last] ? Math.round(bad.counts[last] / good.counts[last]) : null;
  const colour = (tone: string) => (tone === "bad" ? TONE.bad.line : tone === "good" ? ACC : TONE.neutral.line);
  const endE = first ? prog(t, 1.15, 0.35) : 1;
  return (
    <div className="flex w-full flex-col gap-[2.2cqh]">
      {s.heading && <PHeading>{s.heading}</PHeading>}
      <div className="flex flex-col gap-[0.6cqh]">
        {r.series.map((x) => (
          <span key={x.label} className="flex items-center gap-[1.6cqw] text-[3.4cqw] leading-snug text-[#d6d5d0]">
            <span className="inline-block h-[2.8cqw] w-[2.8cqw] shrink-0" style={{ background: colour(x.tone) }} />
            {x.label}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-[1.8cqh]">
        {r.sizes.map((n, si) => (
          <div key={n} className="grid items-center gap-x-[2.4cqw]" style={{ gridTemplateColumns: "21cqw minmax(0,1fr)" }}>
            <span className={`text-right font-mono text-[3.1cqw] leading-tight ${si === last ? W : "text-[#8a8a90]"}`}>
              n =<br />
              {nf(n)}
            </span>
            <div className="flex flex-col gap-[0.5cqh]">
              {r.series.map((x) => {
                const e = first ? prog(t, 0.15 + si * 0.1, 1.0) : 1;
                const c = x.counts[si] ?? 0;
                const rowMax = Math.max(1, ...r.series.map((y) => y.counts[si] ?? 0));
                const w = (c / rowMax) * 100;
                return (
                  <div key={x.label} className="flex items-center gap-[1.6cqw]">
                    <span className="h-[3cqw] min-w-[0.5cqw]" style={{ width: `${Math.max(1, w * 0.62 * e)}%`, background: colour(x.tone), boxShadow: x.tone === "good" ? `0 0 3cqw ${accA(0.35)}` : undefined }} />
                    <span className={`whitespace-nowrap font-mono text-[3.1cqw] tabular-nums ${W}`}>{nf(c * e)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {ratio && ratio > 1 && (
        <div className="flex justify-center" style={{ opacity: endE, transform: `translateY(${(1 - endE) * 1}cqh)` }}>
          <span className="px-[2.4cqw] py-[0.8cqh] font-mono text-[3.6cqw] font-semibold uppercase tracking-[0.04em]" style={{ background: ACC, color: INK }}>
            about {nf(ratio)}× less work
          </span>
        </div>
      )}
    </div>
  );
}
