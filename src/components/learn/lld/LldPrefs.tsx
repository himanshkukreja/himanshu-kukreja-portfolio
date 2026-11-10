"use client";

/**
 * The case-study page's own preferences, shared by the hero, the side tracker and the pieces mounted
 * in the article (LldHydrator):
 *   Try it first   off by default; when on, the class diagram and the code stay hidden until revealed
 *   code language  python / java / cpp / javascript (the code step shows only that language's blocks)
 * The article itself is gated with CSS (lld.css) off the data attributes `attrs` returns, so the lesson
 * HTML is never touched. Both settings live in this browser (localStorage), never anywhere else.
 */
import { createContext, useCallback, useContext, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { LldLang } from "@/lib/learn/lld/steps";

const TRY_KEY = "sdm:lld:try-first";
const LANG_KEY = "sdm:lld:lang";

export type Reveal = "diagram" | "code";

type Value = {
  tryFirst: boolean;
  setTryFirst: (on: boolean) => void;
  revealed: Record<Reveal, boolean>;
  toggleReveal: (what: Reveal) => void;
  lang: LldLang;
  setLang: (l: LldLang) => void;
  /** data attributes for the wrapper around the article (lld.css reads them) */
  attrs: Record<string, string>;
};

const Ctx = createContext<Value | null>(null);

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string | null) {
  try {
    if (v === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, v);
  } catch {
    /* storage blocked: the choice lasts for this visit */
  }
}

// the two stored settings are an external store (localStorage), read without a setState-in-effect: the server
// snapshot is "off, Python", and the client's real values replace it right after hydration
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
const snapTry = () => read(TRY_KEY) === "1";
const snapLang = (): LldLang => {
  const l = read(LANG_KEY);
  return l === "python" || l === "java" || l === "cpp" || l === "javascript" ? l : "python";
};

export function LldPrefsProvider({ children }: { children: ReactNode }) {
  const tryFirst = useSyncExternalStore(subscribe, snapTry, () => false);
  const lang = useSyncExternalStore(subscribe, snapLang, () => "python" as LldLang);
  const [revealed, setRevealed] = useState<Record<Reveal, boolean>>({ diagram: false, code: false });

  const setTryFirst = useCallback((on: boolean) => {
    write(TRY_KEY, on ? "1" : null);
    setRevealed({ diagram: false, code: false });
    notify();
  }, []);
  const toggleReveal = useCallback((what: Reveal) => setRevealed((r) => ({ ...r, [what]: !r[what] })), []);
  const setLang = useCallback((l: LldLang) => {
    write(LANG_KEY, l);
    notify();
  }, []);

  const value = useMemo<Value>(
    () => ({
      tryFirst,
      setTryFirst,
      revealed,
      toggleReveal,
      lang,
      setLang,
      attrs: {
        "data-lld-try": tryFirst ? "on" : "off",
        "data-lld-diagram": revealed.diagram ? "shown" : "hidden",
        "data-lld-code": revealed.code ? "shown" : "hidden",
        "data-lld-lang": lang,
      },
    }),
    [tryFirst, setTryFirst, revealed, toggleReveal, lang, setLang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLldPrefs(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLldPrefs outside LldPrefsProvider");
  return v;
}

/** "Try it first" switch: a real switch (role + aria-checked), 44 px tall, with the explanation as its description. */
export function TryFirstSwitch({ compact = false }: { compact?: boolean }) {
  const { tryFirst, setTryFirst } = useLldPrefs();
  const descId = useId();
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={tryFirst}
        aria-describedby={descId}
        onClick={() => setTryFirst(!tryFirst)}
        className="flex min-h-11 items-center gap-3 border border-line-strong px-3 text-left text-sm text-fg hover:border-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
      >
        <span aria-hidden className={`relative inline-block h-5 w-9 shrink-0 border ${tryFirst ? "border-signal bg-signal" : "border-line-strong bg-bg"}`}>
          <span className={`absolute top-0.5 h-3.5 w-3.5 ${tryFirst ? "right-0.5 bg-on-signal" : "left-0.5 bg-fg-3"}`} />
        </span>
        <span className="font-semibold">Try it first</span>
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{tryFirst ? "on" : "off"}</span>
      </button>
      {!compact && (
        <p id={descId} className="m-0 text-[13px] leading-snug text-fg-3">
          Hides the class diagram and the code until you reveal them, so you can sketch your own design first.
        </p>
      )}
      {compact && (
        <span id={descId} className="sr-only">
          Hides the class diagram and the code until you reveal them.
        </span>
      )}
    </div>
  );
}

/** The wrapper around the article that carries the data attributes lld.css gates on. */
export function LldScope({ children }: { children: ReactNode }) {
  const { attrs } = useLldPrefs();
  return <div {...attrs}>{children}</div>;
}
