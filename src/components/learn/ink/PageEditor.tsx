"use client";

/**
 * One notebook page, editable: the full-screen editor (/learn/notebook/page/<id>) and the Notebook panel beside a
 * lesson both use it. Loads the page (this device's unsaved copy first, if any), keeps undo/redo, autosaves,
 * registers itself as the open page (so clips and snips land here), and mounts the AI in its toolbar: "Turn into
 * text" (then an Ink / Text toggle) as a first-class action, the AI menu (check, cards) beside it, and, after the
 * learner writes and pauses, a "Turn into text?" chip over the page (it only suggests; nothing is sent until tapped).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { createPage, InkError, movePage, pageOutline, registerOpenPage } from "@/lib/learn/ink/client";
import { pageBytes, pageNearlyFull } from "@/lib/learn/ink/geometry";
import { PEN_SIZES, type InkTheme } from "@/lib/learn/ink/render";
import { INK_EVENTS, LIMITS, PAPERS, type InkColor, type NotebookPage, type PageItem, type Paper } from "@/lib/learn/ink/types";
import { loadPage, usePageAutosave, type SaveState } from "@/lib/learn/ink/usePageAutosave";
import { PEN_FOUND, setInkInputMode, useInkInput } from "@/lib/learn/ink/inputMode";
import InkCanvas, { type InkCanvasHandle, type InkContent, type InkToolId } from "./InkCanvas";
import InkToolbar, { COLORS } from "./InkToolbar";
import PageAiActions from "./PageAiActions";
import { usePageAi } from "./ai/usePageAi";
import { ConvertNudge, PageTextControls, type PageMode } from "./ai/TextControls";
import TypedPanel from "./ai/TypedPanel";
import { isLessonKey } from "./global/context";

const PREFS_KEY = "hk.ink.prefs";
const HISTORY = 100;
/** the pause after the last stroke before the "Turn into text?" chip shows */
const NUDGE_MS = 4000;
/** the chip's × holds for the rest of the session, per page */
const NUDGE_OFF = (pageId: string) => `hk.ink.nudgeOff:${pageId}`;

type Snap = InkContent;

const SAVE_TEXT: Record<SaveState, string> = {
  saved: "Saved",
  pending: "Editing…",
  saving: "Saving…",
  offline: "Offline · kept on this device",
  full: "Page full",
  error: "Not saved · kept on this device",
};

export type PageEditorProps = {
  pageId: string;
  variant: "full" | "panel";
  /** go to another page (navigation, a new page) */
  onOpenPage: (id: string) => void;
  /** the full editor's back link */
  backHref?: string;
  /** extra controls in the header (the panel's full-screen and close buttons) */
  headerExtra?: React.ReactNode;
};

export default function PageEditor({ pageId, variant, onOpenPage, backHref, headerExtra }: PageEditorProps) {
  const { resolvedTheme } = useTheme();
  const theme: InkTheme = resolvedTheme === "dark" ? "dark" : "light";
  const [page, setPage] = useState<NotebookPage | null>(null);
  const [restored, setRestored] = useState(false);
  const [loadError, setLoadError] = useState<InkError | null>(null);
  const [outline, setOutline] = useState<{ id: string; title: string; position: number }[]>([]);
  const past = useRef<Snap[]>([]);
  const future = useRef<Snap[]>([]);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const mergeRef = useRef<string | null>(null);
  const [tool, setTool] = useState<InkToolId>("pen");
  const [color, setColor] = useState<InkColor>("ink");
  const [sizeIndex, setSizeIndex] = useState(0);
  const { mode: inputMode } = useInkInput();
  const [zoom, setZoom] = useState(1);
  const [notice, setNotice] = useState<{ text: string; action?: { label: string; run: () => void } } | null>(null);
  const canvas = useRef<InkCanvasHandle>(null);
  const [mode, setMode] = useState<PageMode>("ink");
  // the chip: a tick per change on the page, the signature the page had when it went quiet, pointers down on it
  const [inkTick, setInkTick] = useState(0);
  const [idleSig, setIdleSig] = useState<string | null>(null);
  const [nudgeOff, setNudgeOff] = useState(false);
  const pointers = useRef(new Set<number>());
  // the page as last set (handlers read it without waiting for a render)
  const pageRef = useRef<NotebookPage | null>(null);

  // per-device preferences, read after mount
  useEffect(() => {
    try {
      const prefs = JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}") as { color?: InkColor; size?: number };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a per-device preference
      if (prefs.color) setColor(prefs.color);
      if (typeof prefs.size === "number" && prefs.size >= 0 && prefs.size < PEN_SIZES.length) setSizeIndex(prefs.size);
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({ color, size: sizeIndex }));
    } catch {
      // ignore
    }
  }, [color, sizeIndex]);

  // load
  useEffect(() => {
    let off = false;
    /* eslint-disable react-hooks/set-state-in-effect -- a new page id starts from nothing */
    setPage(null);
    pageRef.current = null;
    setLoadError(null);
    setHist({ undo: 0, redo: 0 });
    /* eslint-enable react-hooks/set-state-in-effect */
    past.current = [];
    future.current = [];
    mergeRef.current = null;
    loadPage(pageId)
      .then(({ page: p, restored: r }) => {
        if (off) return;
        if (!p) setLoadError(new InkError("not_found", "This page doesn't exist any more."));
        else {
          setRestored(r);
          pageRef.current = p;
          setPage(p);
          pageOutline(p.notebookId)
            .then((o) => !off && setOutline(o))
            .catch(() => undefined);
        }
      })
      .catch((e) => !off && setLoadError(e instanceof InkError ? e : new InkError("network", "Couldn't open this page.")));
    return () => {
      off = true;
    };
  }, [pageId]);

  const { state: saveState, error: saveError, flush } = usePageAutosave(page, { dirty: restored });

  const bytes = useMemo(() => (page ? pageBytes(page.strokes, page.items) : 0), [page]);
  const full = bytes >= LIMITS.pageBytes;

  // ------------------------------------------------------------------ changes + history

  const commit = useCallback((next: InkContent, mergeKey?: string) => {
    const cur = pageRef.current;
    if (!cur) return;
    if (pageBytes(next.strokes, next.items) > LIMITS.pageBytes && next.strokes.length + next.items.length > cur.strokes.length + cur.items.length) {
      setNotice({ text: "This page is full. Start a new page to keep writing." });
      return;
    }
    if (!(mergeKey && mergeRef.current === mergeKey)) {
      past.current = [...past.current.slice(-(HISTORY - 1)), { strokes: cur.strokes, items: cur.items }];
      future.current = [];
    }
    mergeRef.current = mergeKey || null;
    const np = { ...cur, strokes: next.strokes, items: next.items };
    pageRef.current = np;
    setPage(np);
    setHist({ undo: past.current.length, redo: 0 });
    setInkTick((t) => t + 1);
  }, []);

  const step = useCallback((back: boolean) => {
    const cur = pageRef.current;
    const from = back ? past : future;
    const to = back ? future : past;
    if (!cur || !from.current.length) return;
    const snap = back ? from.current[from.current.length - 1] : from.current[0];
    from.current = back ? from.current.slice(0, -1) : from.current.slice(1);
    const here = { strokes: cur.strokes, items: cur.items };
    to.current = back ? [here, ...to.current].slice(0, HISTORY) : [...to.current, here].slice(-HISTORY);
    mergeRef.current = null;
    const np = { ...cur, ...snap };
    pageRef.current = np;
    setPage(np);
    setHist({ undo: past.current.length, redo: future.current.length });
  }, []);
  const undo = useCallback(() => step(true), [step]);
  const redo = useCallback(() => step(false), [step]);

  const patchPage = useCallback((patch: Partial<NotebookPage>) => {
    const cur = pageRef.current;
    if (!cur) return;
    const np = { ...cur, ...patch };
    pageRef.current = np;
    setPage(np);
  }, []);

  // ------------------------------------------------------------------ handwriting → text

  const ai = usePageAi(page, patchPage);
  const textMode = mode === "text" && !!ai.typed;
  const sigRef = useRef(ai.sig);
  useEffect(() => {
    sigRef.current = ai.sig;
  }, [ai.sig]);

  /** Type the page up (or again), then show the text. */
  const convertNow = async () => {
    setIdleSig(null);
    if (await ai.run("convert")) setMode("text");
  };
  const convertRef = useRef(convertNow);
  useEffect(() => {
    convertRef.current = convertNow;
  });

  // a failed conversion from the toolbar or the chip says so over the page (the Text view shows its own)
  const errAt = ai.error?.action === "convert" ? ai.error.at : 0;
  const errText = ai.error?.action === "convert" ? ai.error.text : "";
  useEffect(() => {
    if (!errAt || textMode) return;
    setNotice({ text: errText, action: { label: "Try again", run: () => void convertRef.current() } });
  }, [errAt, errText, textMode]);

  // the chip's ×, per page for this session
  useEffect(() => {
    let off = false;
    try {
      off = window.sessionStorage.getItem(NUDGE_OFF(pageId)) === "1";
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a per-session preference
    setNudgeOff(off);
  }, [pageId]);
  // the page went quiet: NUDGE_MS after the last change, unless a pointer is still down on it
  useEffect(() => {
    if (!inkTick) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new change hides the chip until the next pause
    setIdleSig(null);
    const t = window.setTimeout(() => {
      if (!pointers.current.size) setIdleSig(sigRef.current);
    }, NUDGE_MS);
    return () => window.clearTimeout(t);
  }, [inkTick]);
  const dismissNudge = () => {
    setNudgeOff(true);
    setIdleSig(null);
    try {
      window.sessionStorage.setItem(NUDGE_OFF(pageId), "1");
    } catch {
      // ignore
    }
  };
  // a pointer released outside the page (or lost) never leaves the chip blocked
  useEffect(() => {
    const up = (e: PointerEvent) => pointers.current.delete(e.pointerId);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);
  const showNudge =
    !!page && !textMode && !nudgeOff && !!idleSig && idleSig === ai.sig && page.strokes.length > 0 && (!ai.typed || ai.stale) && !ai.blocked && !ai.busy;
  // any pointer down on the page (a stroke starting, a pan) hides the chip; it comes back only after new strokes
  const onPagePointer = (e: React.PointerEvent) => {
    if ((e.target as Element).closest?.("[data-ink-nudge]")) return;
    if (e.type === "pointerdown") {
      pointers.current.add(e.pointerId);
      setIdleSig(null);
    } else pointers.current.delete(e.pointerId);
  };

  // the open page: clips and snips from the capture tools land here
  useEffect(() => {
    if (!page?.id) return;
    return registerOpenPage({
      pageId: page.id,
      get: () => pageRef.current!,
      append: (item: PageItem) => {
        const cur = pageRef.current;
        if (cur) commit({ strokes: cur.strokes, items: [...cur.items, item] });
      },
    });
  }, [page?.id, commit]);

  useEffect(() => {
    const onItem = (e: Event) => {
      const d = (e as CustomEvent<{ pageId: string; newPage: boolean }>).detail;
      if (d?.newPage && pageRef.current && d.pageId !== pageRef.current.id) {
        const id = d.pageId;
        setNotice({ text: "This page is full, so that went on a new page.", action: { label: "Go to it", run: () => onOpenPage(id) } });
        pageOutline(pageRef.current.notebookId)
          .then(setOutline)
          .catch(() => undefined);
      }
    };
    window.addEventListener(INK_EVENTS.item, onItem);
    return () => window.removeEventListener(INK_EVENTS.item, onItem);
  }, [onOpenPage]);

  // ------------------------------------------------------------------ keys

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      // the panel shares the window with the lesson: only take keys while the pointer/focus is in the editor
      if (variant === "panel" && !document.querySelector("[data-ink-editor]:hover, [data-ink-editor]:focus-within")) return;
      // the Text view covers the page: no tool keys, and Backspace never deletes a selection out of sight
      if (textMode) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod || e.altKey) return;
      const k = e.key.toLowerCase();
      const map: Record<string, InkToolId> = { p: "pen", h: "highlighter", e: "eraser", l: "lasso", t: "text" };
      if (map[k]) {
        setTool(map[k]);
        e.preventDefault();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        canvas.current?.deleteSelection();
      } else if (e.key === "Escape") canvas.current?.clearSelection();
      else if (e.key === "+" || e.key === "=") canvas.current?.zoomBy(1.25);
      else if (e.key === "-") canvas.current?.zoomBy(1 / 1.25);
      else if (e.key === "0") canvas.current?.fit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, variant, textMode]);

  // ------------------------------------------------------------------ navigation

  const idx = outline.findIndex((o) => o.id === pageId);
  const go = async (id: string | undefined) => {
    if (!id) return;
    await flush();
    onOpenPage(id);
  };
  const addPage = async () => {
    const cur = pageRef.current;
    if (!cur) return;
    try {
      await flush();
      const np = await createPage(cur.notebookId, { paper: cur.paper, lessonKey: cur.lessonKey });
      if (idx >= 0 && idx < outline.length - 1) await movePage(np.id, idx + 1);
      onOpenPage(np.id);
    } catch (e) {
      setNotice({ text: e instanceof InkError ? e.message : "Couldn't add a page." });
    }
  };

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const onAutoPen = useCallback(() => {
    setNotice({ text: PEN_FOUND, action: { label: "Use Stylus/finger", run: () => setInkInputMode("touch") } });
  }, []);

  // ------------------------------------------------------------------ render

  if (loadError)
    return (
      <div className="flex h-full flex-col items-start gap-3 p-6">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">notebook page</span>
        <p className="m-0 text-[17px] text-fg">{loadError.message}</p>
        {backHref && (
          <Link href={backHref} className="inline-flex min-h-11 items-center border border-line-strong px-4 text-sm text-fg">
            Back to your notebook
          </Link>
        )}
      </div>
    );

  const panel = variant === "panel";
  const textAlt = page
    ? [
        page.title,
        ...page.items.map((it) => (it.kind === "clip" ? `Clip from ${it.source.title}: ${it.text}` : it.kind === "text" ? it.text : `Snip from ${it.source.title}`)),
        ai.typed ? `Typed version: ${ai.typed}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  return (
    <div data-ink-editor className="flex h-full min-h-0 flex-col bg-bg">
      {/* one row from a small tablet up (686 px and wider): the "update the text" button appears mid-gesture when the
          handwriting changes, and a header that wrapped then would push the page down under the pen. The title gives
          way (it truncates); the paper picker sits in the tools row below lg */}
      <header className={`flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line sm:flex-nowrap sm:gap-x-1.5 md:gap-x-2 ${panel ? "px-2 py-1.5" : "px-3 py-2 sm:px-4"}`}>
        {backHref && (
          <Link href={backHref} onClick={() => void flush()} aria-label="Back to the notebook" className="grid h-10 w-10 shrink-0 place-items-center text-fg hover:bg-surface-2">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
        )}
        <div className="flex min-w-0 flex-[1_1_240px] items-center gap-2 sm:min-w-[72px]">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Page title</span>
            <input
              value={page?.title ?? ""}
              disabled={!page}
              maxLength={LIMITS.titleChars}
              onChange={(e) => patchPage({ title: e.target.value })}
              className={`w-full min-w-0 truncate border-0 bg-transparent font-display font-bold tracking-[-0.02em] text-fg outline-none focus:bg-surface-2 ${panel ? "text-[17px]" : "text-[20px] sm:text-[22px]"}`}
              placeholder="Untitled page"
            />
          </label>
          <span aria-live="polite" className={`shrink-0 font-mono text-[11px] ${saveState === "saved" ? "text-fg-4" : saveState === "offline" || saveState === "error" || saveState === "full" ? "text-bad-text" : "text-fg-3"}`} title={saveError || undefined}>
            {page ? SAVE_TEXT[saveState] : "Opening…"}
          </span>
        </div>
        <nav aria-label="Pages in this notebook" className="flex shrink-0 items-center">
          <button type="button" onClick={() => void go(outline[idx - 1]?.id)} disabled={idx <= 0} aria-label="Previous page" className="grid h-10 w-9 place-items-center text-fg hover:bg-surface-2 disabled:opacity-30">
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <span className="min-w-[44px] text-center font-mono text-[12px] text-fg-3 max-md:min-w-[34px]">{idx >= 0 ? `${idx + 1}/${outline.length}` : "·"}</span>
          <button type="button" onClick={() => void go(outline[idx + 1]?.id)} disabled={idx < 0 || idx >= outline.length - 1} aria-label="Next page" className="grid h-10 w-9 place-items-center text-fg hover:bg-surface-2 disabled:opacity-30">
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
          <button type="button" onClick={() => void addPage()} disabled={!page} aria-label="New page after this one" title="New page" className="grid h-10 w-10 place-items-center text-fg hover:bg-surface-2 disabled:opacity-30">
            <Plus className="h-5 w-5" aria-hidden />
          </button>
        </nav>
        {!panel && (
          <label className="hidden shrink-0 items-center gap-1.5 lg:flex">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Paper</span>
            <select
              value={page?.paper ?? "ruled"}
              disabled={!page}
              onChange={(e) => patchPage({ paper: e.target.value as Paper })}
              className="h-10 border border-line-strong bg-surface px-2 text-[14px] text-fg"
            >
              {PAPERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {page && (
          <div className="flex shrink-0 items-center gap-1.5">
            <PageTextControls ai={ai} mode={textMode ? "text" : "ink"} onMode={setMode} onConvert={() => void convertNow()} />
            <PageAiActions page={page} ai={ai} onShowText={() => setMode("text")} />
          </div>
        )}
        {headerExtra}
      </header>

      {/* the tools and the page; the Text view covers both */}
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div className={`flex shrink-0 items-center gap-x-2 border-b border-line bg-surface ${panel ? "px-1" : "px-2 sm:px-3"}`}>
        <InkToolbar
          tool={tool}
          onTool={setTool}
          color={color}
          onColor={setColor}
          sizeIndex={sizeIndex}
          onSize={setSizeIndex}
          theme={theme}
          canUndo={hist.undo > 0}
          canRedo={hist.redo > 0}
          onUndo={undo}
          onRedo={redo}
          zoom={zoom}
          onZoom={(k) => canvas.current?.zoomBy(k)}
          onFit={() => canvas.current?.fit()}
          surface="page"
          compact={panel}
          extra={
          <label className={`ml-1 flex shrink-0 items-center py-1 pr-1 ${panel ? "" : "lg:hidden"}`}>
            <span className="sr-only">Paper</span>
            <select value={page?.paper ?? "ruled"} disabled={!page} onChange={(e) => patchPage({ paper: e.target.value as Paper })} className="h-9 border border-line-strong bg-surface px-1.5 text-[13px] text-fg">
              {PAPERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          }
        />
      </div>

      <div className="relative min-h-0 flex-1" onPointerDownCapture={onPagePointer} onPointerUpCapture={onPagePointer} onPointerCancelCapture={onPagePointer}>
        {page ? (
          <InkCanvas
            ref={canvas}
            paper={page.paper}
            strokes={page.strokes}
            items={page.items}
            tool={tool}
            color={color}
            penSize={PEN_SIZES[sizeIndex]}
            theme={theme}
            inputMode={inputMode}
            surface="page"
            full={full}
            pad={panel ? 10 : 20}
            onCommit={commit}
            onAutoPen={onAutoPen}
            quick={{
              onTool: setTool,
              color,
              onColor: (c) => {
                setColor(c);
                if (tool !== "pen" && tool !== "highlighter") setTool("pen");
              },
              colors: COLORS,
              sizes: PEN_SIZES,
              sizeIndex,
              onSize: setSizeIndex,
              onUndo: undo,
              onRedo: redo,
              onText: !ai.blocked && page.strokes.length > 0 ? () => void convertNow() : undefined,
              lasso: true,
            }}
            onFull={() => setNotice({ text: "This page is full. Start a new page to keep writing.", action: { label: "New page", run: () => void addPage() } })}
            onZoom={setZoom}
            label={`Notebook page: ${page.title || "Untitled"}. ${page.strokes.length} strokes, ${page.items.length} items. Typed content follows.`}
          />
        ) : (
          <div className="grid h-full place-items-center bg-surface-2">
            <span className="font-mono text-[12px] text-fg-3">opening page…</span>
          </div>
        )}
        {page && pageNearlyFull(bytes) && (
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 border-b border-bad bg-bg/95 px-3 py-2 text-[13px] text-fg">
            <span>{full ? "This page is full." : `This page is ${Math.round((bytes / LIMITS.pageBytes) * 100)}% full.`} Start a new page to keep writing.</span>
            <button type="button" onClick={() => void addPage()} className="min-h-9 shrink-0 bg-signal px-3 text-[13px] font-semibold text-on-signal">
              New page
            </button>
          </div>
        )}
        {showNudge && <ConvertNudge update={!!ai.typed} ownKey={!!ai.status?.ownKey} onConvert={() => void convertNow()} onDismiss={dismissNudge} />}
        {notice && (
          <div role="status" className="absolute bottom-3 left-3 right-3 z-20 mx-auto flex max-w-[520px] animate-hk-in items-center gap-3 bg-fg py-2 pl-4 pr-2 text-bg">
            <span className="min-w-0 flex-1 text-[13px] font-semibold">{notice.text}</span>
            {notice.action && (
              <button
                type="button"
                onClick={() => {
                  notice.action!.run();
                  setNotice(null);
                }}
                className="min-h-9 shrink-0 bg-bg px-3 text-[13px] font-semibold text-fg"
              >
                {notice.action.label}
              </button>
            )}
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="grid h-9 w-9 shrink-0 place-items-center opacity-70 hover:opacity-100">
              ×
            </button>
          </div>
        )}
      </div>
      {textMode && page && <TypedPanel key={`${page.id}:${page.convertedAt}`} ai={ai} convertedAt={page.convertedAt} pageTitle={page.title} lessonKey={isLessonKey(page.lessonKey) ? page.lessonKey : null} onInk={() => setMode("ink")} />}
      </div>
      <div className="sr-only" aria-live="polite">
        {showNudge ? (ai.typed ? "Suggestion: update this page's text. The button is over the page, top right." : "Suggestion: turn this page into text. The button is over the page, top right.") : ""}
      </div>
      <div className="sr-only" aria-live="off">
        {textAlt}
      </div>
    </div>
  );
}
