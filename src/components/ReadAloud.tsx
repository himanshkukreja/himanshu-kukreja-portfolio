"use client";

/**
 * Read aloud (Web Speech API) with a controlled API.
 *
 * - `useReadAloud(contentRef)` → controller: state, start / pause / resume / stop / toggle, rate,
 *   voices. The lesson reader's dock drives this directly.
 * - `<ReadAloudBar controller />` → compact token-styled player strip (lesson dock / mobile bar).
 * - `<ReadAloud contentRef />` (default export) → self-contained floating controls, as used by
 *   stories. Its buttons keep their titles ("Start Reading", "Pause", "Resume", "Stop",
 *   "Settings", "Minimize", "Show Read Aloud") and the outer `.fixed` wrapper, which the story
 *   reader's bridge and CSS rely on. Pass `controller` to render the same UI for an external one.
 *
 * Reading starts at the first heading/paragraph near the top of the viewport and highlights the
 * current sentence (span.reading-highlight, removed again on stop/end).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, Pause, Play, Settings2, X, Minimize2, Square } from "lucide-react";

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
  rate: number;
  setRate: (r: number) => void;
  voices: SpeechSynthesisVoice[];
  voice: string;
  setVoice: (name: string) => void;
  /** set when there was nothing readable from the current position */
  notice: string | null;
};

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "BUTTON", "SVG"]);

function findVisibleStartElement(root: HTMLElement): HTMLElement | null {
  const els = Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, p, li"));
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

type Segment = { start: number; block: HTMLElement };

const BLOCK_SEL = "p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, dt, dd, figcaption";
const PAUSE_TAGS = new Set(["p", "div", "section", "article", "li", "blockquote", "tr", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "br", "dt", "dd"]);

/**
 * Spoken text from `startFrom` onwards, plus where each DOM text run starts in it, so the
 * boundary events can be mapped back to the block being read. The DOM itself is never modified
 * (highlight / bookmark text offsets stay valid); the current block only gets a class.
 */
function extractText(root: HTMLElement, startFrom: HTMLElement | null): { text: string; segments: Segment[] } {
  let text = "";
  const segments: Segment[] = [];
  let include = !startFrom;
  const pause = (mark: string) => {
    if (!text) return;
    const tail = text.trimEnd();
    text = /[.?!,:;]$/.test(tail) ? tail + " " : tail + mark + " ";
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!include) return;
      const t = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!t) return;
      const block = (node.parentElement?.closest(BLOCK_SEL) as HTMLElement | null) ?? node.parentElement;
      if (block) segments.push({ start: text.length, block });
      text += t + " ";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (startFrom && el === startFrom) include = true;
    if (SKIP_TAGS.has(el.tagName) || el.tagName === "IMG" || el.getAttribute("aria-hidden") === "true") return;
    el.childNodes.forEach(walk);
    if (!include) return;
    const tag = el.tagName.toLowerCase();
    if (PAUSE_TAGS.has(tag)) pause(".");
    else if (tag === "td" || tag === "th") pause(",");
  };
  root.childNodes.forEach(walk);
  return { text: text.trim(), segments };
}

function cleanupHighlights(root: HTMLElement | null) {
  if (!root) return;
  root.querySelectorAll(".reading-highlight").forEach((el) => el.classList.remove("reading-highlight"));
}

export function useReadAloud(contentRef: React.RefObject<HTMLElement | null>): ReadAloudController {
  const [supported, setSupported] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voice, setVoice] = useState("");
  const [rate, setRateState] = useState(1);
  const [charIndex, setCharIndex] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const segmentsRef = useRef<Segment[]>([]);
  const highlightRef = useRef<HTMLElement | null>(null);
  const rateRef = useRef(1);
  const voiceRef = useRef("");
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

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
    setSupported(true);
    load();
    synth.addEventListener?.("voiceschanged", load);
    return () => {
      synth.removeEventListener?.("voiceschanged", load);
      synth.cancel();
      cleanupHighlights(root);
    };
  }, [contentRef]);

  // Highlight the block being spoken.
  useEffect(() => {
    const root = contentRef.current;
    if (!playing || paused || !root) return;
    const segs = segmentsRef.current;
    let seg: Segment | null = null;
    for (const sg of segs) {
      if (sg.start <= charIndex) seg = sg;
      else break;
    }
    const block = seg?.block ?? null;
    if (block === highlightRef.current) return;
    highlightRef.current?.classList.remove("reading-highlight");
    highlightRef.current = block;
    if (!block || !block.isConnected) return;
    block.classList.add("reading-highlight");
    const r = block.getBoundingClientRect();
    if (r.top < 140 || r.top > window.innerHeight * 0.75) block.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [charIndex, playing, paused, contentRef]);

  const speak = useCallback(() => {
    const root = contentRef.current;
    if (!root || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    cleanupHighlights(root);
    highlightRef.current = null;
    const startEl = findVisibleStartElement(root);
    const { text, segments } = extractText(root, startEl);
    segmentsRef.current = segments;
    if (!text) {
      setNotice("Nothing to read from here. Scroll to some text and try again.");
      return;
    }
    setNotice(null);
    setCharIndex(0);
    const u = new SpeechSynthesisUtterance(text);
    const v = voicesRef.current.find((x) => x.name === voiceRef.current);
    if (v) u.voice = v;
    u.rate = rateRef.current;
    let last = -1;
    u.onboundary = (e) => {
      if (e.name === "word" && e.charIndex !== last) {
        last = e.charIndex;
        setCharIndex(e.charIndex);
      }
    };
    u.onstart = () => {
      setPlaying(true);
      setPaused(false);
    };
    const done = () => {
      setPlaying(false);
      setPaused(false);
      setCharIndex(0);
      cleanupHighlights(contentRef.current);
      highlightRef.current = null;
    };
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
    // some engines never fire onstart for the first utterance
    setPlaying(true);
    setPaused(false);
  }, [contentRef]);

  const pause = useCallback(() => {
    const synth = window.speechSynthesis;
    if (synth?.speaking && !synth.paused) {
      synth.pause();
      setPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    const synth = window.speechSynthesis;
    if (synth?.paused) {
      synth.resume();
      setPaused(false);
    }
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setPlaying(false);
    setPaused(false);
    setCharIndex(0);
    segmentsRef.current = [];
    cleanupHighlights(contentRef.current);
    highlightRef.current = null;
  }, [contentRef]);

  const restartIfPlaying = useCallback(() => {
    if (playing && !paused) {
      window.speechSynthesis?.cancel();
      window.setTimeout(speak, 80);
    }
  }, [playing, paused, speak]);

  const setRate = useCallback(
    (r: number) => {
      rateRef.current = r;
      setRateState(r);
      restartIfPlaying();
    },
    [restartIfPlaying]
  );

  const chooseVoice = useCallback(
    (name: string) => {
      voiceRef.current = name;
      setVoice(name);
      restartIfPlaying();
    },
    [restartIfPlaying]
  );

  const toggle = useCallback(() => {
    if (!playing) speak();
    else if (paused) resume();
    else pause();
  }, [playing, paused, speak, resume, pause]);

  const status: ReadAloudStatus = !supported ? "unsupported" : playing ? (paused ? "paused" : "playing") : "idle";

  return {
    supported,
    status,
    playing,
    paused,
    start: speak,
    pause,
    resume,
    stop,
    toggle,
    rate,
    setRate,
    voices,
    voice,
    setVoice: chooseVoice,
    notice,
  };
}

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

/** Compact player strip: status, play/pause, stop, speed. */
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
          <span className="flex min-w-[88px] items-center gap-2 border-r border-line px-3 font-mono text-[11px] uppercase tracking-label text-fg-3" role="status">
            <span aria-hidden className={`h-1.5 w-1.5 ${c.paused ? "bg-fg-4" : "animate-hk-pulse bg-signal"}`} />
            {c.paused ? "paused" : "reading"}
          </span>
          <button type="button" onClick={c.paused ? c.resume : c.pause} aria-label={c.paused ? "Resume reading" : "Pause reading"} className="grid min-h-11 min-w-11 place-items-center border-r border-line hover:bg-surface-2">
            {c.paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
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
  /** drive an external controller (from useReadAloud) instead of an internal one */
  controller?: ReadAloudController;
};

/** Floating read-aloud controls (stories). */
export default function ReadAloud({ contentRef, controller }: ReadAloudProps) {
  const own = useReadAloud(contentRef);
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
          {english.length > 0 && (
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
            {c.paused ? (
              <button type="button" onClick={c.resume} className="grid min-h-12 min-w-12 place-items-center bg-signal text-on-signal" title="Resume" aria-label="Resume reading">
                <Play className="h-5 w-5" aria-hidden />
              </button>
            ) : (
              <button type="button" onClick={c.pause} className="grid min-h-12 min-w-12 place-items-center bg-signal text-on-signal" title="Pause" aria-label="Pause reading">
                <Pause className="h-5 w-5" aria-hidden />
              </button>
            )}
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
