"use client";

/**
 * Interactive side-quest lecture (Scrimba-style: it's live, not a flat video). The stage is drawn
 * in the page from the lecture JSON and kept in step with recorded narration, so the learner can
 * pause on any diagram, ask the AI about that exact moment (LectureAsk, over the stage; answers can
 * light nodes and point to another chapter), answer quiz checkpoints (the lecture
 * waits), toggle captions and music, change speed, jump by chapter, pop the stage out
 * (picture-in-picture) and pick up where they left off.
 *
 * Narration: `media` (made by scripts/lecture/export.mjs: one audio file + where each step starts).
 * Without it (or if it was made from an older script) the lecture still plays on a timer with the
 * browser's own voice.
 *
 * Record mode (?record=1, for the MP4 exporter): just the stage, full screen. The exporter calls
 * window.__LECTURE_SET(i, t, dur, token) for every frame and screenshots once
 * window.__LECTURE_FRAME === token; window.__LECTURE_PLAN lists each step's motion length.
 */
import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flatten, type Lecture, type LectureMedia } from "@/lib/learn/lecture/types";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import Stage, { diagramFor, renderSvg, type QuizState } from "./Stage";
import LectureAsk, { type AskTurn, type FaqEntry } from "./LectureAsk";
import { INTRO } from "./anim";

declare global {
  interface Window {
    __LECTURE_READY?: boolean;
    __LECTURE_PLAN?: { anim: number; quiz: boolean }[];
    __LECTURE_SET?: (i: number, t: number, dur: number, token: number) => void;
    __LECTURE_FRAME?: number;
    documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window> };
  }
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const QUIZ_XP = 10;

/** seconds a step lasts without recorded audio: reading pace plus its pause */
const estimate = (say: string, pause = 0) => say.split(/\s+/).length / 2.6 + 0.5 + pause;

/** the caption line for this moment: the step's text split into sentences, timed by length */
function captionAt(say: string, f: number): string {
  const parts = say.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g)?.map((x) => x.trim()) || [say];
  const total = parts.reduce((a, p) => a + p.length, 0) || 1;
  let acc = 0;
  for (const p of parts) {
    acc += p.length;
    if (f <= acc / total) return p;
  }
  return parts[parts.length - 1];
}

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

type Flat = ReturnType<typeof flatten>;
type Quest = { title: string; href: string; code: string } | null;
type Next = { href: string; title: string; code: string } | null;
type Props = {
  lecture: Lecture;
  quest: Quest;
  /** content hash of this lecture JSON: recorded media must match it */
  source: string;
  /** where recorded media lives (R2 public URL or a local folder); null: none */
  mediaBase: string | null;
  /** the next lecture in the playlist */
  next?: Next;
  /** "Learners often ask here": pre-answered questions per scene id (null: none written yet) */
  faq?: Record<string, FaqEntry[]> | null;
};

export default function LecturePlayer({ lecture, quest, source, mediaBase, next = null, faq = null }: Props) {
  const flat = useMemo(() => flatten(lecture), [lecture]);
  const [record, setRecord] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setRecord(new URLSearchParams(window.location.search).has("record")), 0);
    return () => window.clearTimeout(id);
  }, []);
  if (record) return <RecordStage lecture={lecture} flat={flat} quest={quest} />;
  return <Player lecture={lecture} flat={flat} quest={quest} source={source} mediaBase={mediaBase} next={next} faq={faq} />;
}

/* ---------- record mode: the exporter drives every frame ---------- */

function RecordStage({ lecture, flat, quest }: { lecture: Lecture; flat: Flat; quest: Quest }) {
  const [frame, setFrame] = useState({ i: 0, t: 0, dur: 1, token: -1 });
  const readyFor = useRef(-1);
  const pending = useRef<{ i: number; token: number } | null>(null);
  const signal = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    requestAnimationFrame(() => {
      window.__LECTURE_FRAME = p.token;
    });
  }, []);
  useEffect(() => {
    let off = false;
    void Promise.all(
      flat
        .map((f) => diagramFor(f.s, f.st))
        .filter((x): x is string => !!x)
        .map((src) => renderSvg(src).catch(() => "")),
    ).then(() => {
      if (!off) window.__LECTURE_READY = true;
    });
    // -1: moving for the whole step (packets loop, quiz countdown), else seconds of motion
    window.__LECTURE_PLAN = flat.map((f) => ({ anim: f.st.flow?.length || (f.s.kind === "quiz" && f.step === 0) ? -1 : INTRO, quiz: f.s.kind === "quiz" }));
    window.__LECTURE_SET = (i, t, dur, token) => {
      readyFor.current = -1;
      pending.current = null;
      setFrame({ i, t, dur, token });
    };
    return () => {
      off = true;
      delete window.__LECTURE_SET;
    };
  }, [flat]);
  // a diagram can finish drawing after this frame's commit: it reports in, and the frame is done then
  const onReady = useCallback(
    (i: number) => {
      readyFor.current = i;
      if (pending.current?.i === i) signal();
    },
    [signal],
  );
  useLayoutEffect(() => {
    if (frame.token < 0) return;
    const kind = flat[frame.i]?.s.kind;
    const diagram = kind === "flowchart" || kind === "state" || kind === "sequence";
    pending.current = { i: frame.i, token: frame.token };
    if (!diagram || readyFor.current === frame.i) signal();
  }, [frame, flat, signal]);
  const f = flat[frame.i];
  return (
    <div className="fixed inset-0 z-[200] bg-[#0b0b0c]">
      <Stage lecture={lecture} flat={flat} i={frame.i} t={frame.t} dur={frame.dur} quest={quest} onReady={onReady} caption={null} quiz={f?.s.kind === "quiz" ? { picked: null } : undefined} />
    </div>
  );
}

/* ---------- the learner's player ---------- */

function Player({ lecture, flat, quest, source, mediaBase, next, faq }: Props & { flat: Flat }) {
  const slug = lecture.quest;
  const { awardOnce } = useGame();
  const ai = useAiStatus();
  const [media, setMedia] = useState<LectureMedia | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [cc, setCc] = useState(true);
  const [music, setMusic] = useState(true);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  // the Ask panel: open (and whether to resume on close, and how much of the stage it covers)
  const [ask, setAsk] = useState<{ resume: boolean; cover: number } | null>(null);
  const [askTurns, setAskTurns] = useState<AskTurn[]>([]);
  // nodes an answer lit ([[show]]), for the scene it was about
  const [shown, setShown] = useState<{ scene: string; ids: string[] } | null>(null);
  const [pip, setPip] = useState<Window | null>(null);
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  const [canPip, setCanPip] = useState(false);
  const clockBase = useRef({ wall: 0, time: 0 });
  // seek-bar hover: where the pointer is (px in the bar) and the moment under it
  const [hover, setHover] = useState<{ x: number; w: number; tm: number } | null>(null);
  const [shellH, setShellH] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = shellRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setShellH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // full screen: the stage fills the screen and the controls float over it, fading out when idle
  const [fs, setFs] = useState(false);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<number | undefined>(undefined);
  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 2500);
  }, []);
  useEffect(() => {
    const on = () => {
      setFs(document.fullscreenElement === shellRef.current);
      wake();
    };
    document.addEventListener("fullscreenchange", on);
    return () => {
      document.removeEventListener("fullscreenchange", on);
      window.clearTimeout(idleTimer.current);
    };
  }, [wake]);

  // recorded narration, only if it was made from this exact script
  useEffect(() => {
    if (!mediaBase) return;
    let off = false;
    const base = `${mediaBase.replace(/\/$/, "")}/${slug}/`;
    fetch(`${base}media.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<LectureMedia>) : null))
      .then((m) => {
        if (off || !m || m.source !== source) return;
        const abs = (u?: string) => (u ? new URL(u, new URL(base, window.location.href)).href : undefined);
        setMedia({ ...m, audio: abs(m.audio)!, music: abs(m.music) });
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [mediaBase, slug, source]);

  // timeline: where each step starts (recorded audio, else an estimate)
  const starts = useMemo(() => {
    if (media && media.starts.length === flat.length) return media.starts;
    const out: number[] = [];
    let acc = 0;
    for (const f of flat) {
      out.push(acc);
      acc += estimate(f.st.say, f.st.pause);
    }
    return out;
  }, [media, flat]);
  const duration = media && media.starts.length === flat.length ? media.duration : flat.length ? starts[starts.length - 1] + estimate(flat[flat.length - 1].st.say) : 0;
  const stepAt = useCallback(
    (tm: number) => {
      let lo = 0;
      for (let k = 0; k < starts.length; k++) if (starts[k] <= tm + 1e-3) lo = k;
      return lo;
    },
    [starts],
  );
  const i = stepAt(time);
  const cur = flat[i];
  const dur = (i + 1 < starts.length ? starts[i + 1] : duration) - starts[i];
  const t = time - starts[i];

  // prefs, resume point, picture-in-picture support
  useEffect(() => {
    const id = window.setTimeout(() => {
      setCanPip(!!window.documentPictureInPicture);
      try {
        const p = JSON.parse(localStorage.getItem("hk.lecture.prefs") || "{}") as { cc?: boolean; music?: boolean; rate?: number };
        if (typeof p.cc === "boolean") setCc(p.cc);
        if (typeof p.music === "boolean") setMusic(p.music);
        if (p.rate && SPEEDS.includes(p.rate)) setRate(p.rate);
        const at = Number(localStorage.getItem(`hk.lecture.pos.${slug}`));
        if (at > 15) setResumeAt(at);
        const saved = JSON.parse(sessionStorage.getItem(`hk.lecture.ask.${slug}`) || "[]") as AskTurn[];
        if (Array.isArray(saved)) setAskTurns(saved.filter((x) => x && typeof x.q === "string" && !x.pending));
      } catch {}
    }, 0);
    return () => window.clearTimeout(id);
  }, [slug]);
  useEffect(() => {
    try {
      localStorage.setItem("hk.lecture.prefs", JSON.stringify({ cc, music, rate }));
    } catch {}
  }, [cc, music, rate]);
  // this tab's questions, kept for the session
  useEffect(() => {
    try {
      const keep = askTurns.filter((x) => !x.pending);
      if (keep.length) sessionStorage.setItem(`hk.lecture.ask.${slug}`, JSON.stringify(keep.slice(-30)));
      else sessionStorage.removeItem(`hk.lecture.ask.${slug}`);
    } catch {}
  }, [askTurns, slug]);
  const timeRef = useRef(0);
  useEffect(() => {
    timeRef.current = time;
  }, [time]);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      try {
        localStorage.setItem(`hk.lecture.pos.${slug}`, String(Math.floor(timeRef.current)));
      } catch {}
    }, 5000);
    return () => window.clearInterval(id);
  }, [playing, slug]);

  const pause = useCallback((at?: number) => {
    audioRef.current?.pause();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (at != null && audioRef.current) audioRef.current.currentTime = Math.max(0, at);
    setPlaying(false);
  }, []);

  // the clock: the audio's time when there is audio, else wall time
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      let tm: number;
      if (media && audioRef.current) tm = audioRef.current.currentTime;
      else tm = clockBase.current.time + ((performance.now() - clockBase.current.wall) / 1000) * rate;
      // a quiz's answer step waits for the learner's answer
      const k = stepAt(tm);
      const q = flat[k];
      if (q.s.kind === "quiz" && q.step === 1 && answers[q.s.id] == null) {
        const at = starts[k] - 0.05;
        pause(at);
        setTime(at);
        return;
      }
      if (tm >= duration) {
        pause(duration - 0.01);
        setTime(duration - 0.01);
        return;
      }
      setTime(tm);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, media, rate, starts, duration, answers, flat, stepAt, pause]);

  // the browser's voice when there's no recording: speak each step as it starts
  const spoken = useRef(-1);
  useEffect(() => {
    if (media || !playing || spoken.current === i || !("speechSynthesis" in window)) return;
    spoken.current = i;
    const u = new SpeechSynthesisUtterance(cur.st.say);
    u.rate = rate;
    u.lang = "en-IN";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [i, playing, media, cur, rate]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate, media]);
  useEffect(() => {
    const m = musicRef.current;
    if (!m) return;
    m.volume = 0.16;
    if (playing && music) void m.play().catch(() => {});
    else m.pause();
  }, [playing, music, media]);

  const seek = useCallback(
    (tm: number) => {
      const to = Math.max(0, Math.min(duration - 0.05, tm));
      if (audioRef.current) audioRef.current.currentTime = to;
      clockBase.current = { wall: performance.now(), time: to };
      spoken.current = -1;
      setTime(to);
    },
    [duration],
  );
  const play = useCallback(() => {
    let from = timeRef.current;
    if (from >= duration - 0.1) {
      from = 0;
      seek(0);
    }
    if (media && audioRef.current) void audioRef.current.play().catch(() => setPlaying(false));
    clockBase.current = { wall: performance.now(), time: from };
    setPlaying(true);
    track("lecture_play", { quest: slug, at: Math.round(from) });
  }, [duration, media, seek, slug]);
  const goStep = (k: number) => seek(starts[Math.max(0, Math.min(flat.length - 1, k))] + 0.01);
  const toggle = () => (playing ? pause() : play());

  const pick = (k: number) => {
    const q = cur.s;
    if (q.kind !== "quiz" || answers[q.id] != null) return;
    setAnswers((a) => ({ ...a, [q.id]: k }));
    const right = k === q.answer;
    if (right) awardOnce(`lecture-quiz:${slug}:${q.id}`, QUIZ_XP, `Lecture checkpoint · ${quest?.title ?? lecture.title}`);
    track("lecture_quiz", { quest: slug, scene: q.id, right });
    // answered with the Ask panel open: stay on the reveal, carry on when the panel closes
    if (ask) return setAsk({ ...ask, resume: true });
    window.setTimeout(() => {
      seek(starts[Math.min(flat.length - 1, i + 1)] + 0.01);
      play();
    }, 1100);
  };

  // the panel pauses the lecture; closing it resumes only if it was playing
  const openAsk = () => {
    if (ask) return;
    const w = (pip ?? window).innerWidth;
    setAsk({ resume: playing, cover: w >= 640 ? 0.4 : 0 });
    pause();
    track("lecture_ask", { quest: slug, scene: cur.s.id });
  };
  const closeAsk = () => {
    const resume = ask?.resume && !playing;
    setAsk(null);
    setShown(null);
    if (resume) play();
  };
  const showNodes = (scene: string, step: number, ids: string[]) => {
    const k = flat.findIndex((f) => f.s.id === scene && f.step === step);
    if (cur.s.id !== scene && k >= 0) goStep(k);
    setShown({ scene, ids });
  };
  // a [[jump]] chip: watch that chapter (the panel keeps its answers for next time)
  const jumpTo = (scene: string) => {
    const k = flat.findIndex((f) => f.s.id === scene);
    if (k < 0) return;
    setAsk(null);
    setShown(null);
    seek(starts[k] + 0.01);
    play();
  };
  const sceneAt = (id: string) => {
    const k = flat.findIndex((f) => f.s.id === id);
    return k >= 0 ? starts[k] : null;
  };

  const fullscreen = () => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };
  const togglePip = async () => {
    if (pip) return pip.close();
    const w = await window.documentPictureInPicture!.requestWindow({ width: 640, height: 360 });
    for (const n of document.querySelectorAll('style, link[rel="stylesheet"]')) w.document.head.appendChild(n.cloneNode(true));
    w.document.body.style.margin = "0";
    w.document.body.style.background = "#0b0b0c";
    w.addEventListener("pagehide", () => setPip(null));
    setPip(w);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (ask && e.key === "Escape") return closeAsk();
      if (ask || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "k") {
        e.preventDefault();
        toggle();
      } else if (k === "j") seek(timeRef.current - 10);
      else if (k === "l") seek(timeRef.current + 10);
      else if (k === "arrowleft") {
        e.preventDefault();
        goStep(i - 1);
      } else if (k === "arrowright") {
        e.preventDefault();
        goStep(i + 1);
      } else if (k === "c") setCc((x) => !x);
      else if (k === "m") setMusic((x) => !x);
      else if (k === "f") fullscreen();
      else if (k === "a" && ai?.features["lesson-qa"]) {
        e.preventDefault();
        openAsk();
      }
      else if (k === ">" || k === ".") setRate((r) => SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(r) + 1)] ?? r);
      else if (k === "<" || k === ",") setRate((r) => SPEEDS[Math.max(0, SPEEDS.indexOf(r) - 1)] ?? r);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const chapters = lecture.scenes.map((s, k) => ({ k, s, at: starts[flat.findIndex((f) => f.scene === k)] ?? 0 }));
  const ended = !playing && time >= duration - 0.1 && duration > 0;
  const curScene = cur.scene;
  useEffect(() => {
    const list = listRef.current;
    const li = list?.querySelector<HTMLElement>("li[data-on]");
    if (!list || !li) return;
    const top = li.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTo({ top: top - list.clientHeight / 3, behavior: "smooth" });
  }, [curScene]);
  const quizzes = lecture.scenes.filter((s) => s.kind === "quiz");
  const right = quizzes.filter((q) => answers[q.id] === q.answer).length;
  const waitingQuiz = cur.s.kind === "quiz" && cur.step === 0 && answers[cur.s.id] == null && !playing && t > dur - 0.4;
  const speakingFor = Math.max(0.1, dur - (cur.st.pause ?? 0) - 0.45);

  // with the panel open (paused) the step is shown settled, without the caption the panel would cut off
  const asking = !!ask && !playing;
  const stage = (
    <div className="relative aspect-video w-full select-none [&>div:first-child>div:last-child]:hidden" onDoubleClick={fullscreen}>
      <Stage
        lecture={lecture}
        flat={flat}
        i={i}
        t={asking ? Math.max(t, dur - 0.05) : playing || time > 0 ? t : 99}
        dur={dur}
        quest={quest}
        interactive
        quiz={cur.s.kind === "quiz" ? ({ picked: answers[cur.s.id] ?? null } satisfies QuizState) : undefined}
        onPick={pick}
        caption={cc && !ask ? captionAt(cur.st.say, Math.min(1, t / speakingFor)) : null}
        extraHighlight={ask && shown?.scene === cur.s.id ? shown.ids : undefined}
        cover={ask?.cover ?? 0}
      />
      {ask ? (
        <LectureAsk
          lecture={lecture}
          scene={cur.s}
          sceneNo={cur.scene}
          step={cur.step}
          at={time}
          picked={cur.s.kind === "quiz" ? (answers[cur.s.id] ?? null) : null}
          faq={faq?.[cur.s.id] ?? null}
          turns={askTurns}
          setTurns={setAskTurns}
          shown={shown}
          onShow={showNodes}
          onJump={jumpTo}
          sceneAt={sceneAt}
          onClose={closeAsk}
          fs={fs && !pip}
        />
      ) : ended && next ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/75 p-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <span className="font-mono text-[12px] uppercase tracking-label text-signal-text">up next · {next.code}</span>
            <span className="max-w-[560px] font-display text-[clamp(20px,3vw,34px)] font-extrabold leading-tight tracking-[-0.02em] text-[#f3f2ee]">{next.title}</span>
            <div className="flex flex-wrap justify-center gap-2">
              <Link href={next.href} className="inline-flex min-h-11 items-center bg-signal px-5 font-mono text-sm font-semibold text-on-signal">
                ▶ play next
              </Link>
              <button type="button" onClick={() => seek(0)} className="min-h-11 border border-[#3a3a40] px-4 font-mono text-sm text-[#f3f2ee]">
                ↺ watch again
              </button>
            </div>
          </div>
        </div>
      ) : !playing && !waitingQuiz && (
        <button type="button" onClick={toggle} aria-label={time > 0 ? "Resume" : "Play the lecture"} className="absolute inset-0 grid place-items-center bg-black/30">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-[#ff6b2b] text-[#120700] shadow-[0_0_40px_rgba(255,107,43,0.5)]">
            <svg viewBox="0 0 24 24" className="h-7 w-7 translate-x-[2px]" fill="currentColor" aria-hidden>
              <path d="M7 4l13 8-13 8z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );

  const btn = "grid h-10 min-w-10 place-items-center px-2 font-mono text-xs text-fg-2 hover:text-fg";
  return (
    <main className="mx-auto flex max-w-[1360px] flex-col gap-5 px-4 pb-28 pt-6 sm:px-6 sm:pt-10">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
          lecture · {fmt(duration)} · {quizzes.length} checkpoints{media ? "" : " · browser voice"}
        </span>
        <h1 className="m-0 font-display text-[clamp(30px,5vw,52px)] font-extrabold leading-none tracking-[-0.04em] text-fg">{lecture.title}</h1>
        <p className="m-0 max-w-[820px] text-[16px] text-fg-2">{lecture.summary}</p>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div
          ref={shellRef}
          onPointerMove={fs ? wake : undefined}
          onPointerDown={fs ? wake : undefined}
          className={`flex flex-col bg-[#0b0b0c] ${fs ? `relative h-screen w-screen items-center justify-center ${idle && playing ? "cursor-none" : ""}` : ""}`}
        >
          {pip ? (
            <div className="grid aspect-video w-full place-items-center border border-line-strong font-mono text-sm text-fg-3">
              playing in picture-in-picture
              {createPortal(<div className="h-screen w-screen">{stage}</div>, pip.document.body)}
            </div>
          ) : (
            <div className={fs ? "w-[min(100vw,calc(100vh*16/9))]" : "border border-line-strong"}>{stage}</div>
          )}

          <div className={fs ? `absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-3 pt-10 transition-opacity duration-300 ${idle && playing && !hover ? "pointer-events-none opacity-0" : "opacity-100"}` : "contents"}>
          <div
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)}
            aria-valuetext={`${fmt(time)}, ${cur.s.title}`}
            className="group relative h-7 cursor-pointer touch-none"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              seek(((e.clientX - r.left) / r.width) * duration);
            }}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
              setHover({ x, w: r.width, tm: (x / r.width) * duration });
            }}
            onPointerLeave={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") e.stopPropagation();
              if (e.key === "ArrowLeft") seek(time - 5);
              if (e.key === "ArrowRight") seek(time + 5);
            }}
          >
            {/* one segment per chapter, with a gap between, like the big video sites */}
            {chapters.map((c, k) => {
              const end = k + 1 < chapters.length ? chapters[k + 1].at : duration;
              const left = (c.at / Math.max(1, duration)) * 100;
              const width = ((end - c.at) / Math.max(1, duration)) * 100;
              const filled = Math.max(0, Math.min(1, (time - c.at) / Math.max(0.01, end - c.at)));
              const hot = hover && hover.tm >= c.at && hover.tm < end;
              return (
                <div key={c.k} className={`absolute top-1/2 -translate-y-1/2 overflow-hidden transition-[height] ${hot ? "h-2" : "h-1 group-hover:h-1.5"} ${c.s.kind === "quiz" ? "bg-[#1e3a2a]" : "bg-surface-2"}`} style={{ left: `calc(${left}% + 1px)`, width: `calc(${width}% - 2px)` }}>
                  <div className="h-full bg-signal" style={{ width: `${filled * 100}%` }} />
                </div>
              );
            })}
            {hover && (() => {
              const k = stepAt(hover.tm);
              const f = flat[k];
              const ch = chapters[f.scene];
              const W = 256;
              const left = Math.max(0, Math.min(hover.w - W, hover.x - W / 2));
              return (
                <div className="pointer-events-none absolute bottom-full z-20 mb-2 flex flex-col gap-1 border border-line-strong bg-[#0b0b0c] p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.6)]" style={{ left, width: W }}>
                  <div className="aspect-video w-full overflow-hidden [&>div>div:last-child]:hidden">
                    <Stage lecture={lecture} flat={flat} i={k} t={99} dur={1} quest={null} caption={null} quiz={f.s.kind === "quiz" ? { picked: null } : undefined} />
                  </div>
                  <div className="flex items-baseline gap-2 px-1">
                    <span className="font-mono text-[11px] tabular-nums text-signal-text">{fmt(hover.tm)}</span>
                    <span className="min-w-0 truncate text-[12px] font-semibold text-fg">{f.s.kind === "quiz" ? "Checkpoint" : ch.s.title}</span>
                  </div>
                  {f.st.caption && <span className="truncate px-1 pb-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-3">{f.st.caption}</span>}
                </div>
              );
            })()}
            <span className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal opacity-0 shadow-[0_0_10px_rgba(255,107,43,0.7)] transition-opacity group-hover:opacity-100" style={{ left: `${(time / Math.max(1, duration)) * 100}%` }} />
          </div>

          <div role="toolbar" aria-label="Lecture controls" className="flex flex-wrap items-center gap-1 border border-line-strong bg-surface px-2 py-1">
            <button type="button" onClick={toggle} className="h-10 min-w-20 bg-signal px-3 font-mono text-xs font-semibold text-on-signal">
              {playing ? "❚❚ pause" : time > 0 ? "▶ resume" : "▶ play"}
            </button>
            <button type="button" onClick={() => seek(time - 10)} className={btn} aria-label="Back 10 seconds" title="Back 10 s (J)">
              −10s
            </button>
            <button type="button" onClick={() => seek(time + 10)} className={btn} aria-label="Forward 10 seconds" title="Forward 10 s (L)">
              +10s
            </button>
            <span className="px-2 font-mono text-xs tabular-nums text-fg-3">
              {fmt(time)} / {fmt(duration)}
            </span>
            <span className="mx-1 hidden min-w-0 truncate font-mono text-xs text-fg-2 md:inline">{cur.s.title}</span>
            <span className="ml-auto" />
            {ai?.features["lesson-qa"] && (
              <button
                type="button"
                onClick={() => (ask ? closeAsk() : openAsk())}
                aria-pressed={!!ask}
                className={`h-10 border border-signal px-3 font-mono text-xs ${ask ? "bg-signal text-on-signal" : "text-signal-text hover:bg-signal hover:text-on-signal"}`}
                title="Ask AI about this moment (A)"
              >
                ✦ ask about this
              </button>
            )}
            <button type="button" onClick={() => setCc((x) => !x)} aria-pressed={cc} className={`${btn} ${cc ? "!text-signal-text" : ""}`} title="Captions (C)">
              CC
            </button>
            {media?.music && (
              <button type="button" onClick={() => setMusic((x) => !x)} aria-pressed={music} className={`${btn} ${music ? "!text-signal-text" : ""}`} title="Music (M)" aria-label="Music">
                ♪
              </button>
            )}
            <select value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Speed" className="h-10 border border-line bg-bg px-1 font-mono text-xs text-fg">
              {SPEEDS.map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
            {canPip && (
              <button type="button" onClick={() => void togglePip()} className={btn} title="Picture in picture" aria-label="Picture in picture">
                ⧉
              </button>
            )}
            <button type="button" onClick={fullscreen} className={btn} title="Full screen (F)" aria-label="Full screen">
              ⛶
            </button>
          </div>
          </div>
          {resumeAt != null && time === 0 && (
            <button
              type="button"
              onClick={() => {
                seek(resumeAt);
                setResumeAt(null);
              }}
              className="mt-2 self-start font-mono text-xs text-signal-text underline underline-offset-4"
            >
              resume from {fmt(resumeAt)}
            </button>
          )}
        </div>

        <aside className="flex min-h-0 flex-col gap-3 lg:overflow-hidden" style={shellH && !fs ? { maxHeight: shellH } : undefined}>
          <h2 className="m-0 flex items-baseline justify-between font-mono text-[11px] uppercase tracking-label text-fg-3">
            chapters
            <span className="normal-case tracking-normal text-fg-4">
              {cur.scene + 1}/{chapters.length}
            </span>
          </h2>
          <ol ref={listRef} className="m-0 flex max-h-[50vh] min-h-0 list-none flex-col gap-0.5 overflow-y-auto overscroll-contain p-0 pr-1 lg:max-h-none lg:flex-1">
            {chapters.map((c) => {
              const on = cur.scene === c.k;
              const q = c.s.kind === "quiz";
              const a = answers[c.s.id];
              return (
                <li key={c.k} data-on={on || undefined}>
                  <button type="button" onClick={() => seek(c.at + 0.01)} className={`flex w-full items-baseline gap-2 border px-2.5 py-1.5 text-left text-[13px] ${on ? "border-signal bg-surface text-fg" : "border-transparent text-fg-2 hover:border-line"}`}>
                    <span className="font-mono text-[11px] tabular-nums text-fg-4">{fmt(c.at)}</span>
                    <span className="min-w-0 flex-1">{q ? "Checkpoint" : c.s.title}</span>
                    {q && a != null && <span className={a === c.s.answer ? "text-[#30a46c]" : "text-[#e5484d]"}>{a === c.s.answer ? "✓" : "✕"}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
          {quizzes.length > 0 && (
            <p className="m-0 font-mono text-[11px] text-fg-3">
              checkpoints {right}/{quizzes.length} right · +{QUIZ_XP} XP each
            </p>
          )}
          <p className="m-0 font-mono text-[11px] leading-relaxed text-fg-4">space play · ←/→ step · J/L 10 s · C captions · M music · F full screen · &lt; &gt; speed{ai?.features["lesson-qa"] ? " · A ask" : ""}</p>
          {next && (
            <Link href={next.href} className="group flex items-baseline gap-2 border border-line px-2.5 py-2 hover:border-signal">
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-4">up next</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2 group-hover:text-fg">{next.title}</span>
              <span className="text-signal-text">→</span>
            </Link>
          )}
          {quest && (
            <Link href={quest.href} className="font-mono text-xs text-fg-3 underline underline-offset-4 hover:text-fg">
              ← read the full quest: {quest.title}
            </Link>
          )}
          <Link href="/learn/prep/lectures" className="font-mono text-xs text-fg-3 underline underline-offset-4 hover:text-fg">
            all lectures
          </Link>
        </aside>
      </div>

      {media && (
        <>
          <audio ref={audioRef} src={media.audio} preload="auto" />
          {media.music && <audio ref={musicRef} src={media.music} preload="none" loop />}
        </>
      )}
    </main>
  );
}
