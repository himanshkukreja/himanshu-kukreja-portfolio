"use client";

/**
 * Read a tutor message aloud with the browser's own voice (speechSynthesis): a natural English (India)
 * voice when the device has one, else English (UK), else any English voice. Click again to stop; one
 * message speaks at a time (starting another stops this one). Speed follows the Listen speed if one is
 * saved (localStorage "hk.listen.rate"), else 1x. Markdown marks and citation brackets are dropped first.
 * Hidden where speechSynthesis doesn't exist.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { Square, Volume2 } from "lucide-react";

/** the Listen player's speed, if the learner saved one */
export const LISTEN_RATE_KEY = "hk.listen.rate";

const noop = () => () => {};

function readRate(): number {
  try {
    const v = parseFloat(window.localStorage.getItem(LISTEN_RATE_KEY) || "");
    return Number.isFinite(v) && v >= 0.5 && v <= 2 ? v : 1;
  } catch {
    return 1;
  }
}

const NATURAL = /natural|neural|premium|enhanced|google|siri/i;

/** en-IN, then en-GB, then any English; a natural/neural voice first within each */
export function pickVoice(list: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const norm = (l: string) => l.replace("_", "-").toLowerCase();
  for (const want of ["en-in", "en-gb", "en"]) {
    const match = list.filter((v) => (want === "en" ? norm(v.lang).startsWith("en") : norm(v.lang) === want));
    if (match.length) return match.find((v) => NATURAL.test(v.name)) ?? match.find((v) => v.localService) ?? match[0];
  }
  return null;
}

/** Message text → what to say: no markdown marks, link targets, code fences or [1]-style citations. */
export function speakableText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " (code block) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s*\[\d+(?:,\s*\d+)*\]/g, "")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Short pieces at sentence breaks: long utterances stall in Chrome after ~15 s. */
function chunks(text: string, max = 220): string[] {
  const out: string[] = [];
  let cur = "";
  for (const s of text.match(/[^.!?;:]+[.!?;:]*\s*/g) ?? [text]) {
    if ((cur + s).length > max && cur) {
      out.push(cur.trim());
      cur = "";
    }
    if (s.length > max) {
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim());
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

// one speaker at a time across every SpeakButton on the page
let speakingId: symbol | null = null;
const subs = new Set<() => void>();
const setSpeaking = (id: symbol | null) => {
  speakingId = id;
  subs.forEach((f) => f());
};

export default function SpeakButton({ text }: { text: string }) {
  const supported = useSyncExternalStore(
    noop,
    () => typeof window !== "undefined" && "speechSynthesis" in window,
    () => false,
  );
  const [id] = useState<symbol>(() => Symbol("speak"));
  const speaking = useSyncExternalStore(
    (cb) => (subs.add(cb), () => subs.delete(cb)),
    () => speakingId === id,
    () => false,
  );
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);

  // voices arrive late in Chrome (voiceschanged)
  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const load = () => setVoice(pickVoice(synth.getVoices()));
    load();
    synth.addEventListener("voiceschanged", load);
    return () => synth.removeEventListener("voiceschanged", load);
  }, [supported]);

  // stop if this message goes away while speaking
  useEffect(() => {
    return () => {
      if (speakingId === id) {
        window.speechSynthesis?.cancel();
        setSpeaking(null);
      }
    };
  }, [id]);

  if (!supported) return null;
  const say = speakableText(text);

  const toggle = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(null);
      return;
    }
    synth.cancel();
    const parts = chunks(say);
    if (!parts.length) return;
    const rate = readRate();
    setSpeaking(id);
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else u.lang = "en-IN";
      u.rate = rate;
      if (i === parts.length - 1) u.onend = () => speakingId === id && setSpeaking(null);
      u.onerror = (e) => {
        if (e.error !== "interrupted" && e.error !== "canceled" && speakingId === id) setSpeaking(null);
      };
      synth.speak(u);
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!say}
      aria-pressed={speaking}
      aria-label={speaking ? "Stop reading aloud" : "Read this answer aloud"}
      title={speaking ? "Stop" : "Read aloud"}
      className={`inline-flex min-h-9 items-center gap-1.5 border px-2.5 font-mono text-[11px] uppercase tracking-[0.06em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50 ${
        speaking ? "border-signal bg-signal text-on-signal" : "border-line bg-transparent text-fg-3 hover:border-line-strong hover:text-fg"
      }`}
    >
      {speaking ? <Square className="h-3 w-3" fill="currentColor" aria-hidden /> : <Volume2 className="h-3.5 w-3.5" aria-hidden />}
      <span>{speaking ? "Stop" : "Listen"}</span>
    </button>
  );
}
