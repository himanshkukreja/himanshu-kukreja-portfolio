"use client";

/**
 * An explainer as a film: the same frames as "Watch it work", laid out full screen at 1920×1080 ("wide") or 1080×1920
 * ("tall", for Reels and Shorts), on the narration's clock. scripts/explainers/film.mjs renders it frame by frame: it
 * calls window.__filmSeek(seconds) for every video frame (negative seconds: the title card before the narration starts),
 * screenshots it, and lays the narration under the frames, so the picture and the voice can't drift.
 */
import { useEffect, useMemo, useState } from "react";
import { VIEWS } from "@/components/dsa/viz/views";
import { DsaMark } from "@/components/dsa/DsaMark";
import { BEAT_LABEL, flatFrames, linesOfStep, type Explainer, type ExplainerAudio, type ExplainerBeatId } from "@/lib/dsa/explainer";
import { loadAudio } from "./ExplainerPlayer";

type ViewDef = { Component: React.ComponentType<{ state: unknown; prev: unknown; t: number }>; describe: (s: unknown) => string };
type FilmWindow = Window & { __filmSeek?: (s: number) => void; __filmReady?: boolean; __filmDuration?: number };
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const TWEEN = 0.52;

const fmt = (v: unknown): string => (v === null || v === undefined ? "–" : Array.isArray(v) ? `[${v.map((x: unknown) => fmt(x)).join(", ")}]` : typeof v === "object" ? JSON.stringify(v) : String(v));

export default function FilmPlayer({ explainer: e, format, theme }: { explainer: Explainer; format: "wide" | "tall"; theme: "light" | "dark" }) {
  const frames = useMemo(() => flatFrames(e), [e]);
  const n = frames.length;
  const [audio, setAudio] = useState<ExplainerAudio | null>(null);
  const [at, setAt] = useState(-1); // the narration's clock, seconds (below 0: the title card)
  const tall = format === "tall";

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.classList.toggle("dark", theme === "dark");
    let live = true;
    void loadAudio(e).then((a) => {
      if (!live || !a) return;
      setAudio(a);
      const w = window as FilmWindow;
      w.__filmSeek = (sec: number) => setAt(sec);
      w.__filmDuration = a.dur;
      w.__filmReady = true;
    });
    return () => {
      live = false;
    };
  }, [e, theme]);

  // the frame on screen at this moment of the narration, and how far its tween has run
  let i = -1;
  let since = at;
  if (audio && at >= 0) {
    if (at >= audio.recap) {
      i = n;
      since = at - audio.recap;
    } else {
      i = 0;
      for (let j = 0; j < audio.marks.length; j++) if (audio.marks[j] <= at) i = j;
      since = at - audio.marks[i];
    }
  }
  const t = ease(Math.max(0, Math.min(1, since / TWEEN)));
  const cur = i >= 0 && i < n ? frames[i] : null;
  const prev = i > 0 && i - 1 < n ? frames[i - 1] : null;
  const viewId = cur ? (cur.frame.view ?? e.view) : e.view;
  const view = VIEWS[viewId] as unknown as ViewDef;
  const prevState = prev && (prev.frame.view ?? e.view) === viewId ? prev.frame.state : null;
  const beatId: ExplainerBeatId | "recap" | null = cur ? cur.beat.id : i >= n ? "recap" : null;
  const code = e.code?.python ?? "";
  const lit = cur?.frame.marker && code ? new Set(linesOfStep(code, cur.frame.marker)) : new Set<number>();
  const progress = audio ? Math.max(0, Math.min(1, at / audio.dur)) : 0;
  const unit = cur ? (cur.beat.unit ?? e.costUnit) : e.costUnit;
  const ids = [...e.beats.map((b) => b.id), "recap" as const];

  return (
    <div className="dsa-theme fixed inset-0 z-[200] flex flex-col overflow-hidden bg-bg text-fg" style={{ width: tall ? 1080 : 1920, height: tall ? 1920 : 1080 }} data-film>
      <header className={`flex shrink-0 ${tall ? "flex-col gap-6 px-16 pb-8 pt-20" : "items-center justify-between gap-10 px-16 pb-6 pt-10"}`}>
        <div className="flex min-w-0 items-center gap-5">
          <DsaMark size={tall ? 64 : 52} />
          <div className="flex min-w-0 flex-col">
            <span className={`font-mono uppercase tracking-label text-signal-text ${tall ? "text-[24px]" : "text-[20px]"}`}>Watch it work</span>
            <span className={`truncate font-display font-bold leading-tight ${tall ? "text-[50px]" : "text-[44px]"}`}>{e.title}</span>
          </div>
        </div>
        <div className={`flex flex-wrap gap-2.5 ${tall ? "" : "justify-end"}`}>
          {ids.map((id) => (
            <span key={id} className={`rounded-full px-5 py-2 font-medium ${tall ? "text-[24px]" : "text-[22px]"} ${beatId === id ? "bg-signal text-on-signal" : "bg-surface-2 text-fg-3"}`}>
              {BEAT_LABEL[id]}
            </span>
          ))}
        </div>
      </header>

      <main className={`flex min-h-0 flex-1 ${tall ? "flex-col gap-8 px-16" : "gap-14 px-16 pb-10"}`}>
        {i < 0 ? (
          <div className="m-auto flex max-w-[1300px] flex-col items-center gap-8 text-center">
            <span className={`font-display font-bold leading-tight ${tall ? "text-[72px]" : "text-[84px]"}`}>{e.title}</span>
            <span className={`text-fg-2 ${tall ? "text-[40px]" : "text-[40px]"}`}>Five steps: the picture, the slow way, the idea, step by step, and a recap.</span>
          </div>
        ) : cur ? (
          <>
            <section className={`flex min-w-0 flex-col gap-5 ${tall ? "" : "basis-[58%]"}`}>
              <span className={`font-mono uppercase tracking-label text-fg-3 ${tall ? "text-[26px]" : "text-[22px]"}`}>{cur.beat.title}</span>
              <div className={`flex items-center justify-center rounded-[22px] border-2 border-line bg-surface px-6 py-8 [&>svg]:!min-w-0 ${tall ? "min-h-[620px]" : "min-h-0 flex-1"}`}>
                <view.Component state={cur.frame.state} prev={prevState} t={t} />
              </div>
            </section>
            <section className={`flex min-w-0 flex-col gap-7 ${tall ? "" : "flex-1 justify-center"}`}>
              <p className={`m-0 font-medium leading-[1.3] ${tall ? "text-[48px]" : "text-[42px]"}`}>{cur.frame.note}</p>
              <div className="flex flex-wrap items-center gap-4">
                {(beatId === "slow" || beatId === "walk") && (
                  <span className={`font-mono font-semibold ${beatId === "slow" ? "text-bad-text" : "text-ok-text"} ${tall ? "text-[32px]" : "text-[28px]"}`}>
                    {unit}: {cur.frame.cost}
                  </span>
                )}
                {cur.frame.vars &&
                  Object.entries(cur.frame.vars).map(([k, v]) => (
                    <span key={k} className={`rounded-[10px] bg-surface-2 px-4 py-1.5 font-mono ${tall ? "text-[28px]" : "text-[24px]"}`}>
                      <span className="text-fg-3">{k}</span> <span className="font-semibold">{fmt(v)}</span>
                    </span>
                  ))}
              </div>
              {beatId === "walk" && code && (
                <pre className={`m-0 overflow-hidden rounded-[16px] border-2 border-line bg-surface py-4 font-mono leading-[1.55] ${tall ? "text-[24px]" : "text-[21px]"}`}>
                  {code
                    .split("\n")
                    .map((l, k) => ({ l, k }))
                    .filter(({ k }) => {
                      // a window of the solution around the lit step
                      const first = lit.size ? Math.min(...lit) : 0;
                      return k >= Math.max(0, first - 4) && k < Math.max(0, first - 4) + (tall ? 14 : 12);
                    })
                    .map(({ l, k }) => (
                      <div key={k} className={`whitespace-pre-wrap break-words px-6 [overflow-wrap:anywhere] ${lit.has(k) ? "bg-[var(--c-dsa-hl)] text-fg" : "text-fg-3"}`}>
                        {l || " "}
                      </div>
                    ))}
                </pre>
              )}
            </section>
          </>
        ) : (
          <div className="m-auto flex max-w-[1400px] flex-col gap-8">
            <span className={`font-mono uppercase tracking-label text-fg-3 ${tall ? "text-[28px]" : "text-[24px]"}`}>Recap</span>
            <span className={`font-display font-bold leading-tight ${tall ? "text-[76px]" : "text-[80px]"}`}>{e.recap.pattern}</span>
            <span className={`leading-snug text-fg-2 ${tall ? "text-[46px]" : "text-[44px]"}`}>{e.recap.takeaway}</span>
            <div className="flex flex-wrap gap-4 font-mono">
              <span className={`rounded-[12px] bg-surface-2 px-5 py-2 ${tall ? "text-[32px]" : "text-[30px]"}`}>time {e.recap.time}</span>
              <span className={`rounded-[12px] bg-surface-2 px-5 py-2 ${tall ? "text-[32px]" : "text-[30px]"}`}>space {e.recap.space}</span>
            </div>
            <span className={`font-mono text-signal-text ${tall ? "text-[30px]" : "text-[28px]"}`}>systemdesignmastery.dev/dsa</span>
          </div>
        )}
      </main>

      {/* next dev's corner badge stays out of the picture */}
      <style>{"nextjs-portal{display:none!important}"}</style>
      <div className="h-3 shrink-0 bg-surface-2">
        <div className="h-full bg-signal" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
