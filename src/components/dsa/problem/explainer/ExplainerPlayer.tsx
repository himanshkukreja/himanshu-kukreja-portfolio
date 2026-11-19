"use client";

/**
 * "Watch it work": a problem's graphical explainer (src/lib/dsa/explainer.ts) at the top of the Solutions tab. The
 * example plays as an animation on the step engine's views, in five beats: the picture, the slow way (its cost counter
 * climbing), the idea, step by step (the current code step lit in the learner's language) and a recap card.
 *
 * - Plays itself (each frame held for its caption's reading time, or for its narration when the sound is on), or step
 *   by step: Back / Next, the beat chips, the scrubber; ← → Space Home End when the player has focus.
 * - Captions are always on; the narration (scripts/explainers/voice.mjs, listen/dsa-explainers/<id>/) starts off until the
 *   learner turns it on, and is used only when it was recorded from these exact captions (its `source`).
 * - Reduced motion swaps frames without tweening. Every picture carries a text description (role="img").
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { VIEWS } from "@/components/dsa/viz/views";
import { useReducedMotion, useTween } from "@/components/dsa/viz/StepPlayer";
import { BEAT_LABEL, explainerTexts, flatFrames, holdFor, linesOfStep, type Explainer, type ExplainerAudio, type ExplainerBeatId } from "@/lib/dsa/explainer";
import { listenMediaBase } from "@/lib/listen/manifest";
import { DSA_LANG_LABEL, type DsaLang } from "@/lib/dsa/types";
import { track } from "@/lib/track";

type ViewDef = { Component: React.ComponentType<{ state: unknown; prev: unknown; t: number }>; describe: (s: unknown) => string };

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const BTN = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[9px] border border-line px-2.5 text-[13px] font-medium text-fg-2 hover:bg-surface-2 hover:text-fg disabled:opacity-40 [@media(pointer:coarse)]:min-h-11";
const fmt = (v: unknown): string => (v === null || v === undefined ? "–" : Array.isArray(v) ? `[${v.map((x: unknown) => fmt(x)).join(", ")}]` : typeof v === "object" ? JSON.stringify(v) : String(v));
/** The recorded narration, when it was voiced from these captions (sha1 of the lines, 12 hex, as voice.mjs writes it). */
async function loadAudio(e: Explainer): Promise<ExplainerAudio | null> {
  try {
    const base = `${listenMediaBase()}/dsa-explainers/${e.problem}`;
    const r = await fetch(`${base}/listen.json`);
    if (!r.ok) return null;
    const m = (await r.json()) as { source: string; audio: string; marks: number[]; recap: number; duration: number };
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(JSON.stringify(explainerTexts(e))));
    const source = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
    if (m.source !== source || m.marks?.length !== flatFrames(e).length) return null;
    return { url: `${base}/${m.audio}`, marks: m.marks, recap: m.recap, dur: m.duration };
  } catch {
    return null;
  }
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export default function ExplainerPlayer({ explainer: e, lang }: { explainer: Explainer; lang: DsaLang }) {
  const frames = useMemo(() => flatFrames(e), [e]);
  const n = frames.length; // index n is the recap card
  const [i, setI] = useState(0);
  const [started, setStarted] = useState(false);
  const [playState, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [sound, setSound] = useState(false);
  const reduced = useReducedMotion();
  const t = useTween(i, 520, reduced);
  const audio = useRef<HTMLAudioElement | null>(null);
  const codeBox = useRef<HTMLPreElement | null>(null);
  const done = useRef(false);
  const [narration, setNarration] = useState<ExplainerAudio | null>(null);
  useEffect(() => {
    let live = true;
    void loadAudio(e).then((a) => live && setNarration(a));
    return () => {
      live = false;
    };
  }, [e]);
  const hasAudio = !!narration;
  // the recap card ends the play
  const playing = playState && i < n;
  const voiced = hasAudio && sound;

  const cur = i < n ? frames[i] : null;
  const prev = i > 0 && i - 1 < n ? frames[i - 1] : null;
  const viewId = cur ? (cur.frame.view ?? e.view) : e.view;
  const view = VIEWS[viewId] as unknown as ViewDef;
  const prevState = prev && (prev.frame.view ?? e.view) === viewId ? prev.frame.state : null;
  const beatId: ExplainerBeatId | "recap" = cur ? cur.beat.id : "recap";
  const firstOf = (id: ExplainerBeatId | "recap") => (id === "recap" ? n : frames.findIndex((f) => f.beat.id === id));
  const length = useMemo(() => (narration?.dur ? narration.dur : frames.reduce((s, f) => s + holdFor(f.frame), 0) + 6), [narration, frames]);
  const lastCost = (id: ExplainerBeatId) => {
    const b = e.beats.find((x) => x.id === id);
    return b?.frames.length ? b.frames[b.frames.length - 1].cost : null;
  };

  // silent play: hold each frame for its caption's reading time
  useEffect(() => {
    if (!playing || voiced || i >= n) return;
    const id = setTimeout(() => {
      setI(i + 1);
      if (i + 1 >= n) setPlaying(false);
    }, (holdFor(frames[i].frame) * 1000) / speed);
    return () => clearTimeout(id);
  }, [playing, voiced, i, n, frames, speed]);

  // voiced play: the narration drives the frame
  useEffect(() => {
    const a = audio.current;
    if (!a || !hasAudio) return;
    a.playbackRate = speed;
    if (playing && voiced) void a.play().catch(() => setSound(false));
    else a.pause();
  }, [playing, voiced, speed, hasAudio]);
  const onTime = () => {
    const a = audio.current;
    if (!a || !narration || !voiced) return;
    const at = a.currentTime;
    let k = at >= narration.recap ? n : 0;
    if (k < n) for (let j = 0; j < narration.marks.length; j++) if (narration.marks[j] <= at) k = j;
    if (k !== i) setI(k);
  };
  const seekAudio = (k: number) => {
    const a = audio.current;
    if (a && narration) a.currentTime = k >= n ? narration.recap : (narration.marks[k] ?? 0);
  };

  const go = (k: number, how?: string) => {
    const to = Math.max(0, Math.min(n, k));
    setI(to);
    seekAudio(to);
    if (!started) setStarted(true);
    if (how) track("dsa_explainer", { problem: e.problem, action: how, frame: to });
  };
  const toggle = () => {
    if (!started) {
      setStarted(true);
      track("dsa_explainer", { problem: e.problem, action: "play" });
    }
    if (i >= n) {
      go(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  };

  useEffect(() => {
    if (i >= n && started && !done.current) {
      done.current = true;
      track("dsa_explainer", { problem: e.problem, action: "complete", sound });
    }
  }, [i, n, started, e.problem, sound]);

  // the walk lights its code step: keep the lit lines in view inside the code box (never scroll the page)
  const code = e.code?.[lang] ?? e.code?.python ?? "";
  const codeLang = e.code?.[lang] ? lang : "python";
  const lit = useMemo(() => new Set(cur?.frame.marker && code ? linesOfStep(code, cur.frame.marker) : []), [cur, code]);
  useEffect(() => {
    const box = codeBox.current;
    if (!box || !lit.size) return;
    const first = box.querySelector<HTMLElement>("[data-lit]");
    if (first) box.scrollTop = Math.max(0, first.offsetTop - box.clientHeight / 3);
  }, [lit]);

  const onKey = (ev: React.KeyboardEvent) => {
    if ((ev.target as HTMLElement).closest("input, select, button")) return;
    if (ev.key === "ArrowRight") go(i + 1, "step");
    else if (ev.key === "ArrowLeft") go(i - 1, "step");
    else if (ev.key === "Home") go(0);
    else if (ev.key === "End") go(n);
    else if (ev.key === " ") toggle();
    else return;
    ev.preventDefault();
  };

  const tone = beatId === "slow" ? "text-bad-text" : beatId === "walk" ? "text-ok-text" : "text-fg-2";
  return (
    <section aria-label={`Watch it work: ${e.title ?? "the solution, animated"}`} className="flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface" data-explainer={e.problem}>
      <header className="flex flex-col gap-2 border-b border-line px-4 pb-2.5 pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="m-0 flex items-baseline gap-2 text-[15px] font-semibold text-fg">
            <span className="font-mono text-[11px] font-normal uppercase tracking-label text-signal-text">Watch it work</span>
            {e.title}
          </h3>
          <span className="font-mono text-[12px] text-fg-3">
            example {e.example} · {mmss(length)}
          </span>
        </div>
        <div role="group" aria-label="Chapters" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
          {[...e.beats.map((b) => b.id), "recap" as const].map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => go(firstOf(id), "chapter")}
              aria-current={beatId === id ? "step" : undefined}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium ${beatId === id ? "bg-signal text-on-signal" : "bg-surface-2 text-fg-3 hover:text-fg"}`}
            >
              {BEAT_LABEL[id]}
            </button>
          ))}
        </div>
      </header>

      <div tabIndex={0} onKeyDown={onKey} className="flex flex-col gap-3 p-4 outline-none focus-visible:ring-2 focus-visible:ring-signal">
        {cur ? (
          <>
            <p className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">{cur.beat.title}</p>
            <div className="relative">
              <div role="img" aria-label={view.describe(cur.frame.state)} className="overflow-x-auto overscroll-x-contain rounded-[10px] border border-line bg-bg px-1 py-2 [&>svg]:!min-w-0">
                <view.Component state={cur.frame.state} prev={prevState} t={t} />
              </div>
              {!started && (
                <button type="button" onClick={toggle} className="absolute inset-0 grid place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--c-bg)_55%,transparent)] backdrop-blur-[1px]">
                  <span className="inline-flex items-center gap-2 rounded-full bg-signal px-5 py-2.5 text-[15px] font-semibold text-on-signal shadow-lg">
                    <Play className="h-4 w-4" aria-hidden /> Watch it work · {mmss(length)}
                  </span>
                </button>
              )}
            </div>
            <p className="m-0 min-h-[3em] text-[15px] leading-snug text-fg" aria-live="polite">
              {cur.frame.note}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {(beatId === "slow" || beatId === "walk") && (
                <span className={`font-mono text-[13px] font-semibold ${tone}`}>
                  {e.costUnit}: {cur.frame.cost}
                </span>
              )}
              {cur.frame.vars && (
                <dl className="m-0 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[12.5px]">
                  {Object.entries(cur.frame.vars).map(([k, v]) => (
                    <div key={k} className="flex gap-1.5 rounded-[6px] bg-surface-2 px-2 py-0.5">
                      <dt className="text-fg-3">{k}</dt>
                      <dd className="m-0 font-semibold text-fg">{fmt(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            {beatId === "walk" && code && (
              <div className="overflow-hidden rounded-[10px] border border-line">
                <div className="border-b border-line bg-surface-2 px-3 py-1 font-mono text-[11px] text-fg-3">
                  {DSA_LANG_LABEL[codeLang]} · step [{cur.frame.marker}]
                </div>
                <pre ref={codeBox} className="relative m-0 max-h-[220px] overflow-auto bg-bg py-2 font-mono text-[12.5px] leading-[1.6]">
                  {code.split("\n").map((l, k) => (
                    <div key={k} data-lit={lit.has(k) || undefined} className={`px-3 ${lit.has(k) ? "bg-[var(--c-dsa-hl)] text-fg" : "text-fg-3"}`}>
                      {l || " "}
                    </div>
                  ))}
                </pre>
              </div>
            )}
          </>
        ) : (
          <Recap e={e} slow={lastCost("slow")} walk={lastCost("walk")} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        <button type="button" onClick={() => go(i - 1, "step")} disabled={i === 0} aria-label="Back one step" className={BTN}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" onClick={toggle} aria-label={playing ? "Pause" : i >= n ? "Play again" : "Play"} className={`${BTN} min-w-[78px] border-signal text-signal-text`}>
          {playing ? <Pause className="h-4 w-4" aria-hidden /> : i >= n ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          {playing ? "Pause" : i >= n ? "Again" : "Play"}
        </button>
        <button type="button" onClick={() => go(i + 1, "step")} disabled={i >= n} aria-label="Next step" className={BTN}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        <input
          type="range"
          min={0}
          max={n}
          value={i}
          onChange={(ev) => go(Number(ev.target.value), "scrub")}
          aria-label="Step"
          aria-valuetext={cur ? `${BEAT_LABEL[cur.beat.id]}, step ${i + 1} of ${n}` : "Recap"}
          className="min-w-[80px] flex-1 accent-[var(--c-signal)]"
        />
        <span className="font-mono text-[11.5px] text-fg-3">
          {Math.min(i + 1, n)}/{n}
        </span>
        <select value={speed} onChange={(ev) => setSpeed(Number(ev.target.value))} aria-label="Speed" className="min-h-9 rounded-[8px] border border-line bg-bg px-1.5 text-[12.5px] text-fg-2">
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
        {hasAudio && (
          <button
            type="button"
            onClick={() => {
              const on = !sound;
              setSound(on);
              if (on) seekAudio(i);
              track("dsa_explainer", { problem: e.problem, action: on ? "sound-on" : "sound-off" });
            }}
            aria-pressed={sound}
            aria-label={sound ? "Turn the narration off" : "Turn the narration on"}
            className={BTN}
          >
            {sound ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
          </button>
        )}
      </div>
      {/* the captions are the frames' own text, always on screen */}
      {narration && <audio ref={audio} src={narration.url} preload="none" onTimeUpdate={onTime} onEnded={() => setPlaying(false)} />}
    </section>
  );
}

function Recap({ e, slow, walk }: { e: Explainer; slow: number | null; walk: number | null }) {
  const r = e.recap;
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <p className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">Recap</p>
      <p className="m-0 font-display text-[20px] font-bold leading-tight text-fg">{r.pattern}</p>
      <p className="m-0 text-[15px] leading-snug text-fg-2">{r.takeaway}</p>
      <div className="flex flex-wrap gap-2 font-mono text-[12.5px]">
        <span className="rounded-[6px] bg-surface-2 px-2 py-1 text-fg">time {r.time}</span>
        <span className="rounded-[6px] bg-surface-2 px-2 py-1 text-fg">space {r.space}</span>
        {slow !== null && walk !== null && (
          <span className="rounded-[6px] bg-surface-2 px-2 py-1 text-fg-2">
            on this example: <span className="text-bad-text">{slow}</span> → <span className="text-ok-text">{walk}</span> {e.costUnit}
          </span>
        )}
      </div>
      {r.also.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[12.5px] text-fg-3">The same idea shows up in</span>
          <ul className="m-0 flex flex-wrap gap-1.5 p-0">
            {r.also.map((a) => (
              <li key={a} className="list-none rounded-full border border-line px-2.5 py-0.5 text-[12.5px] text-fg-2">
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
