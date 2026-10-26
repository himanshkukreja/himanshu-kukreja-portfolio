"use client";

/**
 * Speak instead of type: the browser's own speech recognition (Web Speech API: Chrome, Edge and
 * Safari; free, nothing goes through this site). `useDictation` streams words as they are heard;
 * `MicButton` appends them to an answer box; `speak` reads a line aloud with the browser's voice
 * (the AI interviewer's replies in voice-call mode).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type RecCtor = new () => Rec;

function recognizer(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function dictationSupported() {
  return !!recognizer();
}

/**
 * Listen and hand back what was heard. `continuous`: keep listening until stopped (dictation);
 * otherwise stop after a pause (one conversational turn). `onFinal` gets each finished phrase.
 */
export function useDictation({ onFinal, continuous = true, onEnd }: { onFinal: (text: string) => void; continuous?: boolean; onEnd?: () => void }) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const rec = useRef<Rec | null>(null);
  const finalRef = useRef(onFinal);
  const endRef = useRef(onEnd);
  useEffect(() => {
    finalRef.current = onFinal;
    endRef.current = onEnd;
  }, [onFinal, onEnd]);

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  const start = useCallback(() => {
    const R = recognizer();
    if (!R) {
      setError("Voice input needs Chrome, Edge or Safari.");
      return;
    }
    rec.current?.abort();
    const r = new R();
    r.lang = navigator.language || "en-IN";
    r.continuous = continuous;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript;
        if (res.isFinal) finalRef.current(text.trim());
        else live += text;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      setError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "Allow the microphone for this site to dictate." : e.error === "no-speech" ? "" : "Voice input stopped.");
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
      rec.current = null;
      endRef.current?.();
    };
    rec.current = r;
    setError("");
    try {
      r.start();
      setListening(true);
    } catch {
      setError("Voice input couldn't start.");
    }
  }, [continuous]);

  useEffect(() => () => rec.current?.abort(), []);
  return { listening, interim, error, start, stop };
}

/** Append a dictated phrase to text, with a space or a new sentence as needed. */
export function appendSpoken(value: string, phrase: string): string {
  if (!phrase) return value;
  const p = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  if (!value.trim()) return p;
  return value + (/[\s]$/.test(value) ? "" : /[.!?:]$/.test(value.trim()) ? " " : ". ") + p;
}

/** A mic toggle for an answer box: what you say is appended to `value`. */
export function MicButton({ value, onChange, label = "Dictate" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [supported, setSupported] = useState(false);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  useEffect(() => {
    const t = window.setTimeout(() => setSupported(dictationSupported()), 0);
    return () => window.clearTimeout(t);
  }, []);
  const d = useDictation({
    onFinal: (text) => {
      const next = appendSpoken(latest.current, text);
      latest.current = next;
      onChange(next);
    },
  });
  if (!supported) return null;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {d.listening && d.interim && <span className="min-w-0 max-w-[260px] truncate font-mono text-[11px] italic text-fg-3">{d.interim}…</span>}
      {d.error && !d.listening && <span className="font-mono text-[11px] text-fg-3">{d.error}</span>}
      <button
        type="button"
        onClick={() => (d.listening ? d.stop() : d.start())}
        aria-pressed={d.listening}
        title={d.listening ? "Stop dictating" : "Dictate: speak and your words are typed in"}
        className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 border px-2.5 font-mono text-[11px] ${d.listening ? "animate-pulse border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:border-signal hover:text-fg"}`}
      >
        {d.listening ? <MicOff className="h-3.5 w-3.5" aria-hidden /> : <Mic className="h-3.5 w-3.5" aria-hidden />}
        {d.listening ? "stop" : label}
      </button>
    </span>
  );
}

/** Read a line aloud with the browser's voice; resolves when it has finished (or failed). */
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve();
    const plain = text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[*_`#>]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (!plain) return resolve();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(plain);
    const lang = navigator.language || "en-IN";
    const voices = window.speechSynthesis.getVoices();
    u.voice = voices.find((v) => v.lang === lang) || voices.find((v) => v.lang.startsWith("en")) || null;
    u.rate = 1.02;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
