"use client";

/**
 * Speak a question instead of typing it: a mic button on the browser's Web Speech API (SpeechRecognition /
 * webkitSpeechRecognition), English (India) first, English (US) if the browser has no en-IN model.
 *
 * `onTranscript(text, final)` gets the whole transcript of this listening session so far: `final` false
 * while the browser is still guessing (interim words), true once what it heard is settled. The composer
 * can show `base + text` as it arrives and keep it when final.
 *
 * Hidden where the API doesn't exist (Firefox). This component never records or uploads audio itself: the
 * browser turns speech into text (Chrome does it on its own speech service) and hands back only words.
 * Click again, or Escape, to stop; it also stops on its own after a pause.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, MicOff } from "lucide-react";

type RecognitionResultList = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
type RecognitionEvent = Event & {
  resultIndex: number;
  results: RecognitionResultList;
};
type RecognitionErrorEvent = Event & { error: string };
type Recognition = EventTarget & {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};
const LANGS = ["en-IN", "en-US"] as const;

type Status = "idle" | "starting" | "listening" | "denied" | "error";

export default function VoiceInput({ onTranscript, disabled = false }: { onTranscript(text: string, final: boolean): void; disabled?: boolean }) {
  const supported = useSyncExternalStore(
    noop,
    () => !!recognitionCtor(),
    () => false,
  );
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const recRef = useRef<Recognition | null>(null);
  const langRef = useRef(0);
  const cb = useRef(onTranscript);
  useEffect(() => {
    cb.current = onTranscript;
  });

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recRef.current) return;
    run(Ctor);

    function run(Ctor: RecognitionCtor) {
      const rec = new Ctor();
      rec.lang = LANGS[langRef.current];
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      let heard = "";
      // the last result was final and already handed over: onend mustn't hand it over again (that doubled it)
      let handed = false;
      let retryLang = false;
      rec.onstart = () => setStatus("listening");
      rec.onresult = (e) => {
        let finalText = "";
        let interim = "";
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        heard = (finalText + interim).replace(/\s+/g, " ").trim();
        handed = interim.trim() === "";
        cb.current(heard, handed);
      };
      rec.onerror = (e) => {
        switch (e.error) {
          case "not-allowed":
          case "service-not-allowed":
            setStatus("denied");
            setMessage("Microphone blocked. Allow it for this site in your browser's settings, then try again.");
            break;
          case "language-not-supported":
            if (langRef.current < LANGS.length - 1) {
              langRef.current += 1;
              retryLang = true;
            } else {
              setStatus("error");
              setMessage("Voice input isn't available in English on this browser.");
            }
            break;
          case "no-speech":
            setStatus("idle");
            setMessage("Didn't catch anything. Tap the mic and speak.");
            break;
          case "audio-capture":
            setStatus("error");
            setMessage("No microphone found.");
            break;
          case "network":
            setStatus("error");
            setMessage("Voice input needs a connection. Type your question instead.");
            break;
          case "aborted":
            break;
          default:
            setStatus("error");
            setMessage("Voice input stopped. Try again, or type your question.");
        }
      };
      rec.onend = () => {
        recRef.current = null;
        if (heard && !handed) cb.current(heard, true);
        setStatus((s) => (s === "listening" || s === "starting" ? "idle" : s));
        if (retryLang) window.setTimeout(() => run(Ctor), 0);
      };
      recRef.current = rec;
      setStatus("starting");
      setMessage("");
      try {
        rec.start();
      } catch {
        recRef.current = null;
        setStatus("error");
        setMessage("Couldn't start voice input. Try again.");
      }
    }
  }, []);

  // stop when the composer is disabled (sending) or the component goes away
  useEffect(() => {
    if (disabled) recRef.current?.stop();
  }, [disabled]);
  useEffect(() => () => recRef.current?.abort(), []);

  const listening = status === "listening" || status === "starting";
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        stop();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [listening, stop]);

  // a hint fades after a few seconds; the permission message stays until the next try
  useEffect(() => {
    if (!message || status === "denied") return;
    const t = window.setTimeout(() => setMessage(""), 5000);
    return () => window.clearTimeout(t);
  }, [message, status]);

  if (!supported) return null;

  const denied = status === "denied";
  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => (listening ? stop() : start())}
        disabled={disabled && !listening}
        aria-pressed={listening}
        aria-label={listening ? "Stop listening" : "Speak your question"}
        title={listening ? "Listening… click or press Escape to stop" : denied ? "Microphone blocked" : "Speak your question"}
        className={`relative inline-flex h-11 w-11 items-center justify-center border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50 ${
          listening ? "border-signal bg-signal text-on-signal" : denied ? "border-line-strong bg-transparent text-fg-3 hover:text-fg" : "border-line-strong bg-transparent text-fg hover:bg-surface-2"
        }`}
      >
        {denied ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
        {listening && <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-on-signal" />}
      </button>
      <span className="sr-only" aria-live="polite">
        {status === "listening" ? "Listening" : ""}
      </span>
      {message && (
        <span
          role={denied ? "alert" : "status"}
          className="absolute bottom-full right-0 z-10 mb-2 w-max max-w-[min(260px,80vw)] border border-line-strong bg-surface-2 px-3 py-2 text-[13px] leading-snug text-fg-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
        >
          {message}
        </span>
      )}
    </span>
  );
}
