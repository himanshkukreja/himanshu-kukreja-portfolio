"use client";

/**
 * Listen outside the lesson reader (war stories, the mock interview debrief): the lesson toolbar's
 * Listen button sized for a page header, and the same <ReadAloudBar /> floating bottom right while it
 * reads. The recorded natural voice plays when scripts/listen made one from exactly the text on the
 * page (lib/listen), else the browser's voice, as everywhere else.
 *
 * - Server pages: <ListenProvider listenKey> … <ListenButton /> … <ListenArticle html /> … </ListenProvider>.
 * - Client screens with their own useReadAloud(ref): <ListenButton controller /> and <ListenBar controller />.
 */
import { createContext, useContext, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { ReadAloudBar, useReadAloud, type ReadAloudController } from "@/components/ReadAloud";
import { ListenIcon, PauseIcon } from "./icons";
import styles from "./listen.module.css";

/** class for an element Listen reads: styles its .reading-highlight */
export const listenRootClass = styles.root;

type Ctx = { controller: ReadAloudController; contentRef: RefObject<HTMLElement | null> };
const ListenContext = createContext<Ctx | null>(null);

export function ListenProvider({ listenKey, children }: { listenKey: string; children: ReactNode }) {
  const contentRef = useRef<HTMLElement>(null);
  const controller = useReadAloud(contentRef, { listenKey });
  const value = useMemo(() => ({ controller, contentRef }), [controller]);
  return (
    <ListenContext.Provider value={value}>
      {children}
      <ListenBar controller={controller} />
    </ListenContext.Provider>
  );
}

/** The article body Listen reads (rendered course HTML). */
export function ListenArticle({ html, className = "" }: { html: string; className?: string }) {
  const ctx = useContext(ListenContext);
  // a stable object: a new one would re-inject the article on every re-render
  const inner = useMemo(() => ({ __html: html }), [html]);
  return <article ref={ctx?.contentRef} className={`${styles.root} ${className}`} dangerouslySetInnerHTML={inner} />;
}

/** Listen · Pause · Resume, in the lesson toolbar's look (icon + mono label, signal when reading). */
export function ListenButton({
  controller,
  label = "Listen",
  onStart,
  className = "",
}: {
  controller?: ReadAloudController;
  label?: string;
  /** runs in the click, just before reading starts (the mock debrief opens the model answers) */
  onStart?: () => void;
  className?: string;
}) {
  const ctx = useContext(ListenContext);
  const c = controller ?? ctx?.controller;
  if (!c?.supported) return null;
  const listening = c.playing && !c.paused;
  return (
    <button
      type="button"
      onClick={() => {
        if (!c.playing) onStart?.();
        c.toggle();
      }}
      aria-pressed={listening}
      title={c.recorded ? "Read in the natural voice" : "Read aloud in your browser's voice"}
      className={`inline-flex min-h-11 items-center gap-2 border px-3.5 font-mono text-[12px] uppercase tracking-[0.06em] ${
        listening ? "border-signal bg-signal text-on-signal" : "border-line-strong bg-transparent text-fg hover:bg-surface-2"
      } ${className}`}
    >
      {listening ? <PauseIcon /> : <ListenIcon />}
      <span>{listening ? "Pause" : c.paused ? "Resume" : label}</span>
    </button>
  );
}

/** The player strip (back, play/pause, forward, stop, speed) while reading, above the phone's site dock. */
export function ListenBar({ controller }: { controller: ReadAloudController }) {
  if (!controller.supported || (!controller.playing && !controller.notice)) return null;
  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+84px)] right-3 z-40 max-w-[calc(100vw-24px)] lg:bottom-6 lg:right-6">
      <ReadAloudBar controller={controller} />
    </div>
  );
}
