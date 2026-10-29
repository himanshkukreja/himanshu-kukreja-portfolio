"use client";

/**
 * Read aloud, with a controlled API.
 *
 * - `useReadAloud(contentRef, { listenKey })` → controller: state, start / pause / resume / stop / toggle,
 *   skip (a block back or forward), rate, voices. The lesson reader's dock drives this directly.
 * - `<ReadAloudBar controller />` → compact token-styled player strip (lesson dock / mobile bar).
 * - `<ReadAloud contentRef />` (default export) → self-contained floating controls, as used by
 *   stories. Its buttons keep their titles ("Start Reading", "Pause", "Resume", "Stop",
 *   "Settings", "Minimize", "Show Read Aloud") and the outer `.fixed` wrapper, which the story
 *   reader's bridge and CSS rely on. Pass `controller` to render the same UI for an external one.
 *
 * Two voices: a recorded natural narration (Kokoro, made by scripts/listen, `listen/<key>/` on the media
 * domain) when the article has one made from exactly its current text, else the browser's speech
 * synthesis. Both read the same blocks (lib/listen/extract.ts), start at the heading/paragraph near the
 * top of the viewport and highlight the block being read (span.reading-highlight, removed on stop/end).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, Pause, Play, Settings2, X, Minimize2, Square, SkipBack, SkipForward } from "lucide-react";
import { extractBlocks, listenSource, type ListenBlock } from "@/lib/listen/extract";
import { listenMediaBase, type ListenManifest } from "@/lib/listen/manifest";

export type ReadAloudStatus = "unsupported" | "idle" | "playing" | "paused";

export type ReadAloudController = {
  supported: boolean;
  status: ReadAloudStatus;
  playing: boolean;
  paused: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  /** idle → start, playing → pause, paused → resume */
  toggle: () => void;
  /** a block back (or the start of this one) / forward */
  skip: (dir: 1 | -1) => void;
  rate: number;
  setRate: (r: number) => void;
  voices: SpeechSynthesisVoice[];
  voice: string;
  setVoice: (name: string) => void;
  /** set when there was nothing readable from the current position */
  notice: string | null;
  /** what's reading: the recorded natural voice, or the browser's */
  mode: "natural" | "browser" | null;
  /** this article has a recorded narration (it plays if it matches the text on the page) */
  recorded: boolean;
};

type Block = ListenBlock<HTMLElement>;
type Segment = { start: number; block: number };

function findVisibleStartElement(root: HTMLElement): HTMLElement | null {
  // hidden ones (collapsed stages, UI) measure 0 × 0 at the top: not candidates
  const els = Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, p, li")).filter((el) => el.getClientRects().length > 0);
  const vh = window.innerHeight;
  // first element whose top is in the upper third of the viewport, else the first visible one
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.top >= 0 && r.top <= vh / 3) return el;
  }
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.top >= 0 && r.top <= vh) return el;
  }
  return null;
}

/** the first block at or after `el` in reading order (0 when there's no start element) */
function blockIndexFrom(blocks: Block[], el: HTMLElement | null): number {
  if (!el) return 0;
  const i = blocks.findIndex((b) => b.el === el || el.contains(b.el) || b.el.contains(el) || !!(el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING));
  return i < 0 ? -1 : i;
}

function cleanupHighlights(root: HTMLElement | null) {
  if (!root) return;
  root.querySelectorAll(".reading-highlight").forEach((el) => el.classList.remove("reading-highlight"));
}

/** index of the chunk playing at `t` seconds (the last one started) */
function chunkAt(m: ListenManifest, t: number): number {
  const c = m.chunks;
  let lo = 0;
  let hi = c.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (c[mid].s <= t + 0.05) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

type Options = {
  /** lib/listen/manifest listenKey(): looks for a recorded narration of this article */
  listenKey?: string | null;
};

export function useReadAloud(contentRef: React.RefObject<HTMLElement | null>, { listenKey = null }: Options = {}): ReadAloudController {
  const [speechOk, setSpeechOk] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voice, setVoice] = useState("");
  const [rate, setRateState] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<"natural" | "browser" | null>(null);
  const [manifest, setManifest] = useState<ListenManifest | null>(null);

  const blocksRef = useRef<Block[]>([]);
  const segmentsRef = useRef<Segment[]>([]);
  const offsetRef = useRef(0);
  const currentRef = useRef(-1);
  const highlightRef = useRef<HTMLElement | null>(null);
  const rateRef = useRef(1);
  const voiceRef = useRef("");
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const manifestRef = useRef<ListenManifest | null>(null);
  const modeRef = useRef<"natural" | "browser" | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  /** the utterance in flight: events from one a skip or stop replaced are ignored (Safari ends them late) */
  const uttRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const root = contentRef.current;
    const load = () => {
      const list = synth.getVoices();
      voicesRef.current = list;
      setVoices(list);
      if (!voiceRef.current) {
        const en = list.find((v) => v.lang.startsWith("en"));
        if (en) {
          voiceRef.current = en.name;
          setVoice(en.name);
        }
      }
    };
    // Feature detection has to run on the client; the server render reports "unsupported".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpeechOk(true);
    load();
    synth.addEventListener?.("voiceschanged", load);
    return () => {
      synth.removeEventListener?.("voiceschanged", load);
      synth.cancel();
      cleanupHighlights(root);
    };
  }, [contentRef]);

  // the element Listen reads, marked with its key (scripts/listen/parity.mjs --page reads the same one)
  useEffect(() => {
    const el = contentRef.current;
    if (!listenKey || !el) return;
    el.setAttribute("data-listen-root", listenKey);
    return () => el.removeAttribute("data-listen-root");
  }, [contentRef, listenKey]);

  // the recorded narration's manifest, fetched once the page is idle (a click has to be able to play
  // at once: iOS only starts audio inside the tap)
  useEffect(() => {
    if (!listenKey) return;
    let off = false;
    const url = `${listenMediaBase()}/${listenKey}/listen.json`;
    const load = () =>
      fetch(url, { cache: "no-cache" })
        .then((r) => (r.ok ? (r.json() as Promise<ListenManifest>) : null))
        .then((m) => {
          if (off || !m || m.v !== 1 || !Array.isArray(m.chunks) || !m.chunks.length) return;
          const audio = new URL(m.audio, new URL(url, window.location.href)).href;
          manifestRef.current = m;
          audioUrlRef.current = audio;
          setManifest(m);
        })
        .catch(() => {});
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const id = w.requestIdleCallback ? w.requestIdleCallback(load, { timeout: 4000 }) : window.setTimeout(load, 1500);
    return () => {
      off = true;
      if (w.cancelIdleCallback) w.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, [listenKey]);

  /** Highlight block i (and keep it in view). Re-reads the blocks if the article was re-rendered. */
  const highlight = useCallback(
    (i: number) => {
      currentRef.current = i;
      const root = contentRef.current;
      if (!root) return;
      let block = blocksRef.current[i]?.el ?? null;
      if (block && !block.isConnected) {
        // the reader re-renders the article (highlights, notes): same text, new elements
        const fresh = extractBlocks(root as HTMLElement);
        if (fresh.length === blocksRef.current.length) blocksRef.current = fresh;
        block = blocksRef.current[i]?.el ?? null;
      }
      if (block === highlightRef.current) return;
      highlightRef.current?.classList.remove("reading-highlight");
      highlightRef.current = block;
      if (!block || !block.isConnected) return;
      block.classList.add("reading-highlight");
      const r = block.getBoundingClientRect();
      if (r.top < 140 || r.top > window.innerHeight * 0.75) block.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [contentRef]
  );

  const finish = useCallback(() => {
    setPlaying(false);
    setPaused(false);
    setMode(null);
    modeRef.current = null;
    currentRef.current = -1;
    cleanupHighlights(contentRef.current);
    highlightRef.current = null;
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
  }, [contentRef]);

  /** browser voice from block `from` to the end */
  const speakFrom = useCallback(
    (from: number) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
      const synth = window.speechSynthesis;
      uttRef.current = null;
      synth.cancel();
      const blocks = blocksRef.current;
      let text = "";
      const segments: Segment[] = [];
      for (let i = Math.max(0, from); i < blocks.length; i++) {
        segments.push({ start: text.length, block: i });
        const t = blocks[i].text;
        // a pause between blocks: headings and list items often have no full stop
        text += /[.?!,:;]$/.test(t) ? `${t} ` : `${t}. `;
      }
      segmentsRef.current = segments;
      offsetRef.current = 0;
      if (!text.trim()) return false;
      const u = new SpeechSynthesisUtterance(text.trim());
      const v = voicesRef.current.find((x) => x.name === voiceRef.current);
      if (v) u.voice = v;
      u.rate = rateRef.current;
      let last = -1;
      u.onboundary = (e) => {
        if (uttRef.current !== u || e.name !== "word" || e.charIndex === last) return;
        last = e.charIndex;
        let seg: Segment | null = null;
        for (const sg of segmentsRef.current) {
          if (sg.start <= e.charIndex) seg = sg;
          else break;
        }
        if (seg) highlight(seg.block);
      };
      u.onstart = () => {
        setPlaying(true);
        setPaused(false);
      };
      u.onend = () => {
        if (uttRef.current === u) finish();
      };
      u.onerror = () => {
        if (uttRef.current === u) finish();
      };
      uttRef.current = u;
      modeRef.current = "browser";
      setMode("browser");
      synth.speak(u);
      // some engines never fire onstart for the first utterance
      setPlaying(true);
      setPaused(false);
      highlight(segments[0].block);
      return true;
    },
    [finish, highlight]
  );

  /** the recorded narration from block `from` (its first chunk at or after it) */
  const playFrom = useCallback(
    (from: number) => {
      const m = manifestRef.current;
      const src = audioUrlRef.current;
      if (!m || !src) return false;
      let a = audioRef.current;
      if (!a) {
        a = new Audio();
        a.preload = "auto";
        audioRef.current = a;
        a.addEventListener("timeupdate", () => {
          const man = manifestRef.current;
          if (!man || modeRef.current !== "natural") return;
          const c = man.chunks[chunkAt(man, a!.currentTime)];
          if (c) highlight(c.b);
        });
        a.addEventListener("ended", () => modeRef.current === "natural" && finish());
        // paused or resumed from outside: headset, lock screen, another app taking the audio
        a.addEventListener("pause", () => modeRef.current === "natural" && !a!.ended && setPaused(true));
        a.addEventListener("play", () => modeRef.current === "natural" && setPaused(false));
        a.addEventListener("error", () => {
          if (modeRef.current !== "natural") return;
          // the recording didn't load: carry on in the browser voice from where it was
          const at = Math.max(0, currentRef.current);
          if (!speakFrom(at)) finish();
        });
      }
      const k = m.chunks.findIndex((c) => c.b >= from);
      const at = k < 0 ? 0 : m.chunks[k].s;
      if (a.src !== src) a.src = src;
      a.playbackRate = rateRef.current;
      const seek = () => {
        try {
          a!.currentTime = at;
        } catch {
          // not seekable yet: loadedmetadata seeks
        }
      };
      if (a.readyState >= 1) seek();
      else a.addEventListener("loadedmetadata", seek, { once: true });
      uttRef.current = null;
      window.speechSynthesis?.cancel();
      modeRef.current = "natural";
      setMode("natural");
      setPlaying(true);
      setPaused(false);
      highlight(m.chunks[Math.max(0, k)].b);
      a.play().catch(() => {
        // autoplay refused or the file is missing: the browser voice instead
        if (modeRef.current === "natural" && !speakFrom(Math.max(0, from))) finish();
      });
      if ("mediaSession" in navigator) {
        const ms = navigator.mediaSession;
        try {
          ms.metadata = new MediaMetadata({ title: document.title.replace(/\s*\|.*$/, ""), artist: "Listen · natural voice" });
          ms.playbackState = "playing";
        } catch {
          // MediaMetadata unsupported
        }
      }
      return true;
    },
    [finish, highlight, speakFrom]
  );

  const start = useCallback(() => {
    const root = contentRef.current;
    if (!root) return;
    cleanupHighlights(root);
    highlightRef.current = null;
    const blocks = extractBlocks(root);
    blocksRef.current = blocks;
    const from = blockIndexFrom(blocks, findVisibleStartElement(root));
    if (!blocks.length || from < 0) {
      setNotice("Nothing to read from here. Scroll to some text and try again.");
      return;
    }
    setNotice(null);
    const m = manifestRef.current;
    // the recording plays only if it was made from exactly this text
    if (m && listenSource(blocks) === m.source && playFrom(from)) return;
    speakFrom(from);
  }, [contentRef, playFrom, speakFrom]);

  const pause = useCallback(() => {
    if (modeRef.current === "natural") {
      audioRef.current?.pause();
      setPaused(true);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
      return;
    }
    const synth = window.speechSynthesis;
    if (synth?.speaking && !synth.paused) {
      synth.pause();
      setPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (modeRef.current === "natural") {
      audioRef.current?.play().catch(() => {});
      setPaused(false);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
      return;
    }
    const synth = window.speechSynthesis;
    if (synth?.paused) {
      synth.resume();
      setPaused(false);
    }
  }, []);

  const stop = useCallback(() => {
    const was = modeRef.current;
    modeRef.current = null;
    if (was === "natural") audioRef.current?.pause();
    uttRef.current = null;
    window.speechSynthesis?.cancel();
    segmentsRef.current = [];
    finish();
  }, [finish]);

  const skip = useCallback(
    (dir: 1 | -1) => {
      if (!modeRef.current) return;
      if (modeRef.current === "natural") {
        const a = audioRef.current;
        const m = manifestRef.current;
        if (!a || !m) return;
        const k = chunkAt(m, a.currentTime);
        // back: to the start of this block, or the previous one if it only just began
        const target = dir > 0 ? k + 1 : a.currentTime - m.chunks[k].s > 2 ? k : k - 1;
        if (target >= m.chunks.length) {
          stop();
          return;
        }
        const c = m.chunks[Math.max(0, target)];
        a.currentTime = c.s;
        highlight(c.b);
        return;
      }
      const cur = Math.max(0, currentRef.current);
      const next = cur + dir;
      if (next >= blocksRef.current.length) {
        stop();
        return;
      }
      speakFrom(Math.max(0, next));
      setPaused(false);
    },
    [highlight, speakFrom, stop]
  );

  const restartIfSpeaking = useCallback(() => {
    if (modeRef.current === "browser" && playing && !paused) {
      uttRef.current = null;
      window.speechSynthesis?.cancel();
      const at = Math.max(0, currentRef.current);
      window.setTimeout(() => speakFrom(at), 80);
    }
  }, [playing, paused, speakFrom]);

  const setRate = useCallback(
    (r: number) => {
      rateRef.current = r;
      setRateState(r);
      // the recording changes speed in place; the browser voice has to start again
      if (audioRef.current) audioRef.current.playbackRate = r;
      restartIfSpeaking();
    },
    [restartIfSpeaking]
  );

  const chooseVoice = useCallback(
    (name: string) => {
      voiceRef.current = name;
      setVoice(name);
      restartIfSpeaking();
    },
    [restartIfSpeaking]
  );

  // one voice at a time: an explainer's narration stops the lesson read-aloud, and vice versa
  useEffect(() => {
    const onNarrate = (e: Event) => {
      if ((e as CustomEvent).detail !== 0 && playing) stop();
    };
    window.addEventListener("hk:narrate", onNarrate);
    return () => window.removeEventListener("hk:narrate", onNarrate);
  }, [playing, stop]);

  // lock-screen / headset controls while the recording plays
  useEffect(() => {
    if (mode !== "natural" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(a, h);
      } catch {
        // action unsupported
      }
    };
    set("play", () => resume());
    set("pause", () => pause());
    set("stop", () => stop());
    set("previoustrack", () => skip(-1));
    set("nexttrack", () => skip(1));
    return () => {
      for (const a of ["play", "pause", "stop", "previoustrack", "nexttrack"] as MediaSessionAction[]) set(a, null);
    };
  }, [mode, pause, resume, stop, skip]);

  // leaving the page stops the recording too
  useEffect(() => {
    const root = contentRef.current;
    return () => {
      modeRef.current = null;
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.removeAttribute("src");
        a.load();
      }
      cleanupHighlights(root);
    };
  }, [contentRef]);

  const toggle = useCallback(() => {
    if (!playing) window.dispatchEvent(new CustomEvent("hk:narrate", { detail: 0 }));
    if (!playing) start();
    else if (paused) resume();
    else pause();
  }, [playing, paused, start, resume, pause]);

  const supported = speechOk || !!manifest;
  const status: ReadAloudStatus = !supported ? "unsupported" : playing ? (paused ? "paused" : "playing") : "idle";

  return {
    supported,
    status,
    playing,
    paused,
    start,
    pause,
    resume,
    stop,
    toggle,
    skip,
    rate,
    setRate,
    voices,
    voice,
    setVoice: chooseVoice,
    notice,
    mode,
    recorded: !!manifest,
  };
}

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

/** Compact player strip: status, back, play/pause, forward, stop, speed. */
export function ReadAloudBar({ controller, className = "" }: { controller: ReadAloudController; className?: string }) {
  const c = controller;
  if (!c.supported || (!c.playing && !c.notice)) return null;
  const nextRate = RATES[(RATES.indexOf(c.rate) + 1) % RATES.length] ?? 1;
  return (
    <div role="group" aria-label="Read aloud" className={`flex items-stretch border border-line-strong bg-surface text-fg ${className}`}>
      {c.notice && !c.playing ? (
        <span role="status" className="flex items-center px-3 py-2 text-[13px] text-fg-2">
          {c.notice}
        </span>
      ) : (
        <>
          <span
            className="flex items-center gap-2 border-r border-line px-3 font-mono text-[11px] uppercase tracking-label text-fg-3 min-[400px]:min-w-[88px]"
            role="status"
            title={c.mode === "natural" ? "Natural voice (recorded)" : "Your browser's voice"}
          >
            <span aria-hidden className={`h-1.5 w-1.5 ${c.paused ? "bg-fg-4" : "animate-hk-pulse bg-signal"}`} />
            <span className="sr-only min-[400px]:not-sr-only">{c.paused ? "paused" : "reading"}</span>
          </span>
          <button type="button" onClick={() => c.skip(-1)} aria-label="Back a paragraph" className="grid min-h-11 min-w-10 place-items-center border-r border-line hover:bg-surface-2">
            <SkipBack className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button type="button" onClick={c.paused ? c.resume : c.pause} aria-label={c.paused ? "Resume reading" : "Pause reading"} className="grid min-h-11 min-w-11 place-items-center border-r border-line hover:bg-surface-2">
            {c.paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
          </button>
          <button type="button" onClick={() => c.skip(1)} aria-label="Forward a paragraph" className="grid min-h-11 min-w-10 place-items-center border-r border-line hover:bg-surface-2">
            <SkipForward className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button type="button" onClick={c.stop} aria-label="Stop reading" className="grid min-h-11 min-w-11 place-items-center border-r border-line hover:bg-surface-2">
            <Square className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button type="button" onClick={() => c.setRate(nextRate)} aria-label={`Reading speed ${c.rate}x, change`} className="min-h-11 min-w-14 px-2 font-mono text-xs hover:bg-surface-2">
            {c.rate}x
          </button>
        </>
      )}
    </div>
  );
}

type ReadAloudProps = {
  contentRef: React.RefObject<HTMLElement | null>;
  /** lib/listen/manifest listenKey(): plays the article's recorded narration when there is one */
  listenKey?: string | null;
  /** drive an external controller (from useReadAloud) instead of an internal one */
  controller?: ReadAloudController;
};

/** Floating read-aloud controls (stories). */
export default function ReadAloud({ contentRef, controller, listenKey = null }: ReadAloudProps) {
  const own = useReadAloud(contentRef, { listenKey: controller ? null : listenKey });
  const c = controller ?? own;
  const [showSettings, setShowSettings] = useState(false);
  const [minimized, setMinimized] = useState(false);

  if (!c.supported) return null;

  const iconBtn = "grid min-h-11 min-w-11 place-items-center border border-line-strong bg-surface text-fg hover:bg-surface-2";

  if (minimized) {
    return (
      <div className="fixed bottom-24 right-4 z-40 lg:bottom-20 lg:right-6">
        <button type="button" onClick={() => setMinimized(false)} className={iconBtn} title="Show Read Aloud" aria-label="Show read aloud controls">
          <Volume2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  const english = c.voices.filter((v) => v.lang.startsWith("en"));

  return (
    <div className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-2 sm:right-6 lg:bottom-20">
      {showSettings && (
        <div className="w-72 animate-hk-in border border-line-strong bg-surface p-4 text-fg">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-mono text-xs uppercase tracking-label text-fg-3">{c.paused ? "Paused · settings" : "Read aloud"}</h4>
            <button type="button" onClick={() => setShowSettings(false)} aria-label="Close settings" className="grid min-h-9 min-w-9 place-items-center text-fg-3 hover:text-fg">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {c.mode === "natural" ? (
            <p className="mb-3 text-xs text-fg-2">Natural voice (recorded for this page).</p>
          ) : english.length > 0 && (
            <label className="mb-3 block">
              <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-label text-fg-3">Voice</span>
              <select value={c.voice} onChange={(e) => c.setVoice(e.target.value)} className="w-full border border-line-strong bg-bg px-2 py-2 text-xs text-fg">
                {english.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name.split(" ").slice(0, 2).join(" ")}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-label text-fg-3">Speed · {c.rate.toFixed(2)}x</span>
            <input type="range" min="0.5" max="2" step="0.25" value={c.rate} onChange={(e) => c.setRate(parseFloat(e.target.value))} className="w-full accent-[var(--c-signal)]" />
          </label>
        </div>
      )}

      {c.notice && !c.playing && (
        <p role="status" className="m-0 max-w-[260px] border border-line-strong bg-surface px-3 py-2 text-xs text-fg-2">
          {c.notice}
        </p>
      )}

      <div className="flex items-center gap-1.5">
        {(c.playing || showSettings) && (
          <button type="button" onClick={() => { setMinimized(true); setShowSettings(false); }} className={iconBtn} title="Minimize" aria-label="Minimize read aloud controls">
            <Minimize2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
        {(!c.playing || c.paused) && !showSettings && (
          <button type="button" onClick={() => setShowSettings(true)} className={iconBtn} title="Settings" aria-label="Read aloud settings">
            <Settings2 className="h-4 w-4" aria-hidden />
          </button>
        )}
        {c.playing && (
          <>
            <button type="button" onClick={c.stop} className={iconBtn} title="Stop" aria-label="Stop reading">
              <Square className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button type="button" onClick={() => c.skip(-1)} className={iconBtn} title="Back a paragraph" aria-label="Back a paragraph">
              <SkipBack className="h-3.5 w-3.5" aria-hidden />
            </button>
            {c.paused ? (
              <button type="button" onClick={c.resume} className="grid min-h-12 min-w-12 place-items-center bg-signal text-on-signal" title="Resume" aria-label="Resume reading">
                <Play className="h-5 w-5" aria-hidden />
              </button>
            ) : (
              <button type="button" onClick={c.pause} className="grid min-h-12 min-w-12 place-items-center bg-signal text-on-signal" title="Pause" aria-label="Pause reading">
                <Pause className="h-5 w-5" aria-hidden />
              </button>
            )}
            <button type="button" onClick={() => c.skip(1)} className={iconBtn} title="Forward a paragraph" aria-label="Forward a paragraph">
              <SkipForward className="h-3.5 w-3.5" aria-hidden />
            </button>
          </>
        )}
        {!c.playing && (
          <button type="button" onClick={c.start} className="grid min-h-12 min-w-12 place-items-center bg-signal text-on-signal" title="Start Reading" aria-label="Read this page aloud">
            <Volume2 className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>

      {c.playing && (
        <div className="flex items-center gap-2 border border-line bg-surface px-3 py-1" role="status">
          <span aria-hidden className={`h-1.5 w-1.5 ${c.paused ? "bg-fg-4" : "animate-hk-pulse bg-signal"}`} />
          <span className="font-mono text-[10px] uppercase tracking-label text-fg-3">{c.paused ? "Paused" : "Reading"}</span>
        </div>
      )}
    </div>
  );
}
