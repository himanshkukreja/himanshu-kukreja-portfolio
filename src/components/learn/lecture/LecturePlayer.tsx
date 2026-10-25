"use client";

/**
 * Experimental side-quest lecture: a 16:9 stage where each scene's diagram builds up (sequence
 * diagrams one arrow at a time) and lights up (flowchart / state nodes) as the narrator speaks, with
 * captions, chapters, play / pause, step and speed.
 *
 * Voice: pre-recorded audio when the lecture has it (audio/<quest>/<scene>-<step>.mp3, written by
 * scripts/lecture/render.ts), else the browser's own voice (Indian English preferred).
 * Record mode (?record=1, used by the MP4 exporter): no voice, no controls, and each step lasts the
 * duration the exporter passes in window.__LECTURE_DURATIONS (seconds per step, in order, pause
 * included); the exporter starts playback with window.__LECTURE_START() once recording runs.
 * Frame by frame (what the exporter uses now: exact sync): window.__LECTURE_GOTO(i) shows step i,
 * and window.__LECTURE_SHOWN becomes i once that step's diagram is on screen.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mermaidConfig, prepareMermaidSource } from "@/lib/diagrams/mermaid-theme";
import { loadMermaid } from "@/lib/offline/lazy";
import { stepSource, type Lecture, type LectureScene, type LectureStep } from "@/lib/learn/lecture/types";

type Flat = { scene: number; step: number; s: LectureScene; st: LectureStep };
type MermaidApi = Awaited<ReturnType<typeof loadMermaid>>;

let mermaidP: Promise<MermaidApi> | null = null;
let seq = 0;
const svgCache = new Map<string, string>();

async function renderSvg(src: string): Promise<string> {
  const hit = svgCache.get(src);
  if (hit) return hit;
  if (!mermaidP) {
    mermaidP = loadMermaid().then((m) => {
      const cfg = mermaidConfig("dark");
      const font = window.getComputedStyle(document.body).fontFamily;
      m.initialize({ ...cfg, themeVariables: { ...cfg.themeVariables, fontFamily: font } });
      return m;
    });
  }
  const m = await mermaidP;
  const { svg } = await m.render(`lec-${++seq}`, prepareMermaidSource(src, "dark"));
  svgCache.set(src, svg);
  return svg;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const vs = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
  return vs.find((v) => v.lang === "en-IN") || vs.find((v) => v.lang.startsWith("en-GB")) || vs.find((v) => v.lang.startsWith("en")) || null;
}

declare global {
  interface Window {
    __LECTURE_DURATIONS?: number[];
    __LECTURE_DONE?: boolean;
    __LECTURE_START?: () => void;
    __LECTURE_READY?: boolean;
    __LECTURE_GOTO?: (i: number) => void;
    __LECTURE_SHOWN?: number;
  }
}

export default function LecturePlayer({ lecture, quest, audioBase }: { lecture: Lecture; quest: { title: string; href: string; code: string } | null; audioBase?: string | null }) {
  const flat = useMemo<Flat[]>(() => lecture.scenes.flatMap((s, scene) => s.steps.map((st, step) => ({ scene, step, s, st }))), [lecture]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [svg, setSvg] = useState<string>("");
  // the step whose diagram is on screen now (record mode tells the exporter)
  const [shown, setShown] = useState(-1);
  const [record, setRecord] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const cur = flat[i];

  useEffect(() => {
    const id = window.setTimeout(() => setRecord(new URLSearchParams(window.location.search).has("record")), 0);
    return () => window.clearTimeout(id);
  }, []);

  // draw the step's diagram (cached per source)
  useEffect(() => {
    let off = false;
    const src = cur ? stepSource(cur.s, cur.st) : null;
    if (!src) {
      const id = window.setTimeout(() => {
        if (off) return;
        setSvg("");
        setShown(i);
      }, 0);
      return () => {
        off = true;
        window.clearTimeout(id);
      };
    }
    renderSvg(src)
      .then((x) => !off && setSvg(x))
      .catch(() => !off && setSvg(""))
      .finally(() => !off && setShown(i));
    return () => {
      off = true;
    };
  }, [cur, i]);

  const iRef = useRef(i);
  const shownRef = useRef(shown);
  useEffect(() => {
    iRef.current = i;
    shownRef.current = shown;
    if (record) window.__LECTURE_SHOWN = shown;
  }, [record, shown, i]);

  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    audioRef.current?.pause();
  }, []);

  const next = useCallback(() => {
    setI((k) => {
      if (k + 1 >= flat.length) {
        setPlaying(false);
        window.__LECTURE_DONE = true;
        return k;
      }
      return k + 1;
    });
  }, [flat.length]);

  // narrate the current step, then move on
  useEffect(() => {
    if (!playing || !cur) return;
    const after = () => {
      timer.current = window.setTimeout(next, 450);
    };
    if (record) {
      const d = window.__LECTURE_DURATIONS?.[i];
      timer.current = window.setTimeout(next, Math.max(0.6, d ?? cur.st.say.split(/\s+/).length / 2.5 + 0.45) * 1000);
      return () => window.clearTimeout(timer.current);
    }
    if (audioBase) {
      const a = new Audio(`${audioBase}/${cur.s.id}-${cur.step}.mp3`);
      audioRef.current = a;
      a.playbackRate = rate;
      a.onended = after;
      a.onerror = after;
      void a.play().catch(() => setPlaying(false));
      return () => {
        a.onended = null;
        a.pause();
      };
    }
    const synth = typeof window.speechSynthesis === "undefined" ? null : window.speechSynthesis;
    if (!synth) {
      timer.current = window.setTimeout(next, (cur.st.say.split(/\s+/).length / 2.5 / rate) * 1000);
      return () => window.clearTimeout(timer.current);
    }
    const u = new SpeechSynthesisUtterance(cur.st.say);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang || "en-IN";
    u.rate = rate;
    u.onend = after;
    synth.cancel();
    synth.speak(u);
    return () => {
      u.onend = null;
      synth.cancel();
      window.clearTimeout(timer.current);
    };
  }, [playing, cur, i, rate, record, audioBase, next]);

  // record mode: the exporter starts playback itself (window.__LECTURE_START) once the screen recording runs
  useEffect(() => {
    if (!record) return;
    let off = false;
    // draw every step's diagram first, so highlights land on time in the recording
    void Promise.all(flat.map((f) => stepSource(f.s, f.st)).filter((x): x is string => !!x).map((src) => renderSvg(src).catch(() => ""))).then(() => {
      if (!off) window.__LECTURE_READY = true;
    });
    window.__LECTURE_START = () => setPlaying(true);
    window.__LECTURE_GOTO = (k: number) => {
      const to = Math.max(0, Math.min(flat.length - 1, k));
      // already there: it's on screen as soon as its diagram is
      window.__LECTURE_SHOWN = to === iRef.current ? shownRef.current : -1;
      setI(to);
    };
    return () => {
      off = true;
      delete window.__LECTURE_START;
      delete window.__LECTURE_GOTO;
    };
  }, [record, flat]);

  useEffect(() => () => stop(), [stop]);

  const go = (k: number) => {
    stop();
    setI(Math.max(0, Math.min(flat.length - 1, k)));
  };
  const sceneStarts = lecture.scenes.map((_, sc) => flat.findIndex((f) => f.scene === sc));
  const total = flat.length;

  if (!cur) return null;
  const { s, st } = cur;

  const stage = (
    <div className={`relative overflow-hidden bg-[#0b0b0c] ${record ? "h-screen w-screen" : "aspect-video w-full border border-line-strong"}`}>
      {/* chapter label */}
      <div className="absolute left-[3%] top-[4%] z-10 flex items-center gap-3 font-mono text-[clamp(10px,1.1vw,16px)] uppercase tracking-[0.12em] text-[#ff6b2b]">
        <span>
          {String(cur.scene + 1).padStart(2, "0")} · {s.title}
        </span>
      </div>
      {quest && <div className="absolute right-[3%] top-[4%] z-10 font-mono text-[clamp(10px,1vw,14px)] uppercase tracking-[0.12em] text-[#8a8a90]">{quest.code} · {quest.title}</div>}

      <div className="absolute inset-x-[4%] bottom-[18%] top-[11%] flex items-center justify-center">
        {s.kind === "title" ? (
          <h2 className="m-0 max-w-[80%] text-center font-display text-[clamp(28px,5.2vw,84px)] font-extrabold leading-[0.95] tracking-[-0.04em] text-[#f3f2ee]">
            {(s.heading || lecture.title).replace(/[.!?]$/, "")}
            <span className="text-[#ff6b2b]">{/[!?]$/.test(s.heading || lecture.title) ? (s.heading || lecture.title).slice(-1) : "."}</span>
          </h2>
        ) : s.kind === "numbers" ? (
          <div className="flex w-full flex-col items-center gap-[4%]">
            {s.heading && <h2 className="m-0 text-center font-display text-[clamp(22px,3.4vw,54px)] font-extrabold tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
            <div className="grid w-full grid-cols-2 gap-[2%] sm:grid-cols-3">
              {(s.numbers || []).map((n, k) => (
                <div key={k} className={`flex flex-col gap-1 border p-[4%] transition-colors duration-500 ${k <= cur.step ? "border-[#ff6b2b] bg-[#1a0f08]" : "border-[#2a2a2e] opacity-40"}`}>
                  <span className="font-display text-[clamp(20px,3.2vw,52px)] font-extrabold leading-none tracking-[-0.03em] text-[#f3f2ee]">{n.value}</span>
                  <span className="text-[clamp(11px,1.2vw,18px)] text-[#a3a3a8]">{n.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            className={`lecture-svg flex h-full w-full items-center justify-center ${
              // flowcharts and state machines fill the stage (Mermaid's inline max-width would keep them small);
              // sequences keep one scale, so the diagram doesn't jump as messages are added
              s.kind === "sequence" ? "[&_svg]:h-full [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:max-w-full" : "[&_svg]:!h-full [&_svg]:!w-full [&_svg]:!max-w-none"
            }`}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>

      {/* caption */}
      <div className="absolute inset-x-[6%] bottom-[5%] flex flex-col items-center gap-2">
        {st.caption && <span className="bg-[#ff6b2b] px-3 py-1 font-mono text-[clamp(10px,1.1vw,16px)] font-semibold uppercase tracking-[0.08em] text-[#120700]">{st.caption}</span>}
        <p className="m-0 max-w-[92%] text-center text-[clamp(13px,1.55vw,24px)] leading-snug text-[#f3f2ee] [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">{st.say}</p>
      </div>
      {/* progress */}
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-[#1d1d20]">
        <div className="h-full bg-[#ff6b2b] transition-[width] duration-500" style={{ width: `${((i + 1) / total) * 100}%` }} />
      </div>
    </div>
  );

  if (record) return <div className="fixed inset-0 z-[200] bg-[#0b0b0c]">{stage}</div>;

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-5 px-4 pb-28 pt-6 sm:px-6 sm:pt-10">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">lecture · beta</span>
        <h1 className="m-0 font-display text-[clamp(30px,5vw,52px)] font-extrabold leading-none tracking-[-0.04em] text-fg">{lecture.title}</h1>
        <p className="m-0 max-w-[760px] text-[16px] text-fg-2">{lecture.summary}</p>
      </header>
      {stage}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => (playing ? (stop(), setPlaying(false)) : setPlaying(true))} className="min-h-11 bg-signal px-5 font-mono text-sm font-semibold text-on-signal">
          {playing ? "❚❚ Pause" : i > 0 ? "▶ Resume" : "▶ Play the lecture"}
        </button>
        <button type="button" onClick={() => go(i - 1)} className="min-h-11 border border-line-strong px-3 font-mono text-sm text-fg" aria-label="Previous step">
          ◀
        </button>
        <button type="button" onClick={() => go(i + 1)} className="min-h-11 border border-line-strong px-3 font-mono text-sm text-fg" aria-label="Next step">
          ▶
        </button>
        <select value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Speed" className="min-h-11 border border-line-strong bg-bg px-2 font-mono text-sm text-fg">
          {[0.85, 1, 1.15, 1.3].map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
        <span className="ml-auto font-mono text-xs text-fg-3">
          step {i + 1} / {total} · {audioBase ? "recorded voice" : "your browser's voice"}
        </span>
      </div>
      <nav aria-label="Chapters" className="flex flex-wrap gap-1.5">
        {lecture.scenes.map((sc, k) => (
          <button
            key={sc.id}
            type="button"
            onClick={() => go(sceneStarts[k])}
            className={`min-h-9 border px-3 font-mono text-xs ${cur.scene === k ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:text-fg"}`}
          >
            {String(k + 1).padStart(2, "0")} {sc.title}
          </button>
        ))}
      </nav>
      {quest && (
        <Link href={quest.href} className="self-start font-mono text-xs text-fg-3 underline underline-offset-4 hover:text-fg">
          ← read the full quest: {quest.title}
        </Link>
      )}
    </main>
  );
}
