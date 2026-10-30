"use client";

/**
 * The Notebook beside any course page (mounted once by the Learn layout: NotebookPanelHost). Three layouts
 * (global/panelMode.ts), so the learner reads and writes at the same time wherever there is room:
 *   side    landscape, >= 1024 px (iPad landscape, laptops): a right-hand split; the page makes room for it
 *           (html.hk-nb-side, globals.css) and stays scrollable on the left; the left edge drags to resize it.
 *   bottom  portrait, >= 700 px (any iPad upright): a bottom split; the page keeps the top and stays scrollable
 *           (html.hk-nb-bottom); the top edge drags, snapping to 40 / 50 / 70 % of the window, remembered on
 *           this device.
 *   sheet   phones: a full-height sheet.
 *
 * Which page it opens (global/context.ts has the keys):
 *   - on a piece of content (a lesson, a war story, a lab…): the page last used there (this device's memory, then
 *     the newest page tagged with its key), else a new one tagged with the key, in the notebook for that kind of
 *     content ("Week 04 · Caching", "War stories"…);
 *   - elsewhere (the hub, prep, the chat): the page used last, else the newest page, else a short start screen
 *     (what the notebook does, and a button that starts a page in the "Clips" inbox).
 * The Pages button in the header lists recent pages (this place's first) to jump to, or starts a new one here.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Maximize2, X } from "lucide-react";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useChromeHidden } from "@/components/site/readerChrome";
import { InkError } from "@/lib/learn/ink/client";
import { useInkUser } from "@/lib/learn/ink/usePageAutosave";
import PageEditor from "./PageEditor";
import { LAST_PAGE, lastForKey, readLS, writeLS, type InkContext } from "./global/context";
import { newPageFor, resolvePage } from "./global/pages";
import NotebookIntro from "./global/NotebookIntro";
import RecentPagesList, { NotebookPenIcon } from "./global/RecentPages";
import { MAX_SHARE, MIN_SHARE, nearestSnap, SNAPS, storedShare, storeShare, usePanelMode } from "./global/panelMode";

const W_KEY = "hk.ink.panelW";
const INTRO_KEY = "hk.ink.introSeen";
const MIN_W = 360;


const maxW = () => Math.max(MIN_W, Math.min(900, window.innerWidth - 440));
const defaultW = () => Math.round(Math.min(maxW(), Math.max(MIN_W + 40, window.innerWidth * 0.42)));

function storedW(): number {
  try {
    const n = Number(window.localStorage.getItem(W_KEY));
    if (n >= MIN_W) return Math.min(maxW(), n);
  } catch {
    // ignore
  }
  return defaultW();
}

const subscribeIntro = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("hk:ink-intro", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("hk:ink-intro", cb);
  };
};

export default function NotebookPanel({ ctx, target, onClose }: { ctx: InkContext; target: { pageId?: string; n: number }; onClose: () => void }) {
  const mode = usePanelMode();
  const wide = mode === "side";
  const bottom = mode === "bottom";
  const headerHidden = useChromeHidden();
  const { userId, loading } = useInkUser();
  const { openAuthModal } = useAuthModal();
  const [pageId, setPageId] = useState<string | null>(target.pageId ?? null);
  const [error, setError] = useState<string | null>(null);
  // no page here yet and none anywhere: the start screen
  const [start, setStart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [width, setWidth] = useState<number>(() => (typeof window === "undefined" ? 480 : storedW()));
  // the bottom split's height, as a share of the window
  const [share, setShare] = useState<number>(() => (typeof window === "undefined" ? 0.5 : storedShare()));
  const [vh, setVh] = useState<number>(() => (typeof window === "undefined" ? 800 : window.innerHeight));
  const heightPx = Math.round(share * vh);
  const [draggingH, setDraggingH] = useState(false);
  const key = ctx.key;
  const panelRef = useRef<HTMLElement>(null);
  const introSeen = useSyncExternalStore(subscribeIntro, () => readLS(INTRO_KEY) === "1", () => true);
  const dismissIntro = () => {
    writeLS(INTRO_KEY, "1");
    window.dispatchEvent(new Event("hk:ink-intro"));
  };

  // a new open request (a capture tool may ask for a specific page)
  useEffect(() => {
     
    if (target.pageId) setPageId(target.pageId);
  }, [target]);

  // one lookup per place (and only one page made, however often the page re-renders meanwhile; the host remounts
  // the panel when the place changes)
  const ctxRef = useRef(ctx);
  const resolving = useRef<Promise<string | null> | null>(null);
  useEffect(() => {
    if (!userId || pageId) return;
    let off = false;
    resolving.current ||= resolvePage(ctxRef.current);
    resolving.current
      .then((id) => {
        if (off) return;
        if (id) setPageId(id);
        else setStart(true);
      })
      .catch((e) => {
        resolving.current = null;
        if (!off) setError(e instanceof InkError ? e.message : "Couldn't open your notebook.");
      });
    return () => {
      off = true;
    };
  }, [userId, pageId, key]);

  // remember it: for this place, and as the page used last anywhere
  useEffect(() => {
    if (!pageId) return;
    if (key) writeLS(lastForKey(key), pageId);
    writeLS(LAST_PAGE, pageId);
  }, [pageId, key]);

  const pick = useCallback((id: string) => {
    setSwitcher(false);
    setStart(false);
    setError(null);
    setPageId(id);
  }, []);
  const startHere = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setSwitcher(false);
    try {
      pick(await newPageFor(ctxRef.current));
    } catch (e) {
      setError(e instanceof InkError ? e.message : "Couldn't start a page.");
    } finally {
      setBusy(false);
    }
  }, [busy, pick]);

  // the keyboard goes to the panel as it opens (Esc / N close it again; the host gives focus back)
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  // the split: the page makes room on the right (side) or below (bottom); hk-nb-open = the panel is open, any layout
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("hk-nb-open");
    window.dispatchEvent(new Event("hk:chrome"));
    return () => {
      html.classList.remove("hk-nb-open", "hk-nb-side", "hk-nb-bottom");
      html.style.removeProperty("--hk-nb-w");
      html.style.removeProperty("--hk-nb-h");
      window.dispatchEvent(new Event("hk:chrome"));
    };
  }, []);
  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("hk-nb-side", mode === "side");
    html.classList.toggle("hk-nb-bottom", mode === "bottom");
  }, [mode]);
  useEffect(() => {
    document.documentElement.style.setProperty("--hk-nb-w", `${width}px`);
  }, [width]);
  useEffect(() => {
    document.documentElement.style.setProperty("--hk-nb-h", `${heightPx}px`);
  }, [heightPx]);

  // the Ask panel takes the same side: give way to it when it opens (not when it was already open as this opened:
  // the chat closes itself then, see ChatDock)
  useEffect(() => {
    const html = document.documentElement;
    let asked = html.classList.contains("hk-ask-open");
    const mo = new MutationObserver(() => {
      const now = html.classList.contains("hk-ask-open");
      if (now && !asked) onClose();
      asked = now;
    });
    mo.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [onClose]);

  // the page switcher closes on a click outside it
  const switcherRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!switcher) return;
    const down = (e: PointerEvent) => {
      if (!switcherRef.current?.contains(e.target as Node)) setSwitcher(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setSwitcher(false);
      switcherRef.current?.querySelector<HTMLElement>("[data-switcher-toggle]")?.focus();
    };
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [switcher]);

  // phones: the sheet covers the page, so the page must not scroll under it (the splits keep it scrollable)
  useEffect(() => {
    if (mode !== "sheet") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mode]);

  useEffect(() => {
    const onResize = () => {
      setWidth((w) => Math.min(maxW(), Math.max(MIN_W, w)));
      setVh(window.innerHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // the bottom split's top edge: drag to any height, let go to snap to 40 / 50 / 70 %
  const dragH = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    setDraggingH(true);
    const move = (ev: PointerEvent) => setShare(Math.min(MAX_SHARE, Math.max(MIN_SHARE, (window.innerHeight - ev.clientY) / window.innerHeight)));
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setDraggingH(false);
      setShare((n) => {
        const snapped = nearestSnap(n);
        storeShare(snapped);
        return snapped;
      });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }, []);
  const stepH = (dir: 1 | -1) =>
    setShare((n) => {
      const order = [...SNAPS] as number[];
      const i = order.indexOf(nearestSnap(n));
      const next = order[Math.min(order.length - 1, Math.max(0, i + dir))];
      storeShare(next);
      return next;
    });

  const drag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setWidth(Math.round(Math.min(maxW(), Math.max(MIN_W, window.innerWidth - ev.clientX))));
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setWidth((w) => {
        try {
          window.localStorage.setItem(W_KEY, String(w));
        } catch {
          // ignore
        }
        return w;
      });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }, []);

  const nudge = (d: number) =>
    setWidth((w) => {
      const n = Math.min(maxW(), Math.max(MIN_W, w + d));
      try {
        window.localStorage.setItem(W_KEY, String(n));
      } catch {
        // ignore
      }
      return n;
    });

  const extra = (
    <div className="flex shrink-0 items-center">
      {userId && (
        <div ref={switcherRef} className="relative">
          <button
            type="button"
            data-switcher-toggle
            onClick={() => setSwitcher((v) => !v)}
            aria-expanded={switcher}
            aria-haspopup="true"
            aria-label="Your pages: switch page or start a new one"
            title="Your pages"
            className={`flex h-10 items-center gap-1 px-2 font-mono text-[12px] text-fg hover:bg-surface-2 ${switcher ? "bg-surface-2" : ""}`}
          >
            <NotebookPenIcon className="h-[17px] w-[17px]" />
            <span className="max-[359px]:sr-only">Pages</span>
            <ChevronDown className={`h-3.5 w-3.5 text-fg-3 transition-transform ${switcher ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {switcher && (
            <div role="dialog" aria-label="Your pages" className="absolute right-0 top-[calc(100%+6px)] z-20 w-[min(360px,calc(100vw-24px))] border border-line-strong bg-bg shadow-[0_12px_40px_rgba(0,0,0,0.28)] animate-hk-in">
              <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5">
                <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">❯ your pages</span>
                <span className="font-mono text-[11px] text-fg-4">newest first</span>
              </div>
              <RecentPagesList ctxKey={key} currentId={pageId} max={8} onPick={pick} onNew={() => void startHere()} newLabel={key ? "New page here" : "New page"} onNavigate={onClose} enabled={switcher} />
            </div>
          )}
        </div>
      )}
      {pageId && (
        <Link href={`/learn/notebook/page/${pageId}`} aria-label="Open this page full screen" title="Full screen" className="grid h-10 w-10 place-items-center text-fg hover:bg-surface-2">
          <Maximize2 className="h-[18px] w-[18px]" aria-hidden />
        </Link>
      )}
      <button type="button" onClick={onClose} aria-label="Close the notebook" className="grid h-10 w-10 place-items-center text-fg hover:bg-surface-2">
        <X className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );

  const top = wide ? (headerHidden ? "var(--hk-top-inset, 0px)" : "var(--hk-header-h, 61px)") : bottom ? "auto" : "0px";

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal={mode === "sheet" || undefined}
      aria-label={ctx.title ? `Notebook beside ${ctx.title}` : "Notebook"}
      data-notebook-panel
      className={`fixed bottom-0 right-0 z-[72] flex flex-col bg-bg outline-none ${
        wide ? "border-l border-line-strong" : bottom ? "left-0 border-t border-line-strong pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-12px_40px_rgba(0,0,0,0.12)]" : "left-0 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
      }`}
      style={{ top, width: wide ? width : undefined, height: bottom ? heightPx : undefined, transition: bottom ? (draggingH ? "none" : "height 160ms") : "top 200ms" }}
    >
      {bottom && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the notebook: drag, or use the arrow keys"
          aria-valuenow={Math.round(share * 100)}
          aria-valuemin={Math.round(MIN_SHARE * 100)}
          aria-valuemax={Math.round(MAX_SHARE * 100)}
          aria-valuetext={`${Math.round(share * 100)}% of the screen`}
          tabIndex={0}
          onPointerDown={dragH}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              stepH(1);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              stepH(-1);
            }
          }}
          className="group relative z-10 -mt-[22px] flex h-11 shrink-0 cursor-row-resize touch-none items-end justify-center pb-2 outline-none"
        >
          <span aria-hidden className="h-1.5 w-16 bg-line-strong group-hover:bg-signal group-focus-visible:bg-signal group-active:bg-signal" />
        </div>
      )}
      {wide && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the notebook"
          aria-valuenow={width}
          aria-valuemin={MIN_W}
          tabIndex={0}
          onPointerDown={drag}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") nudge(24);
            if (e.key === "ArrowRight") nudge(-24);
          }}
          className="group absolute -left-2 bottom-0 top-0 z-10 flex w-4 cursor-col-resize touch-none items-center justify-center"
        >
          <span aria-hidden className="h-14 w-1.5 bg-line-strong group-hover:bg-signal group-focus-visible:bg-signal" />
        </div>
      )}
      {loading ? (
        <div className="grid flex-1 place-items-center font-mono text-[12px] text-fg-3">opening your notebook…</div>
      ) : !userId ? (
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="font-mono text-xs uppercase tracking-label text-signal-text">❯ notebook</span>
            {extra}
          </div>
          <div className="flex flex-col items-start gap-4 overflow-y-auto p-5">
            <h2 className="m-0 font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-fg">Take notes anywhere in the course.</h2>
            <NotebookIntro />
            <p className="m-0 text-[15px] leading-relaxed text-fg-2">Sign in to keep your pages in your account, on every device.</p>
            <button type="button" onClick={openAuthModal} className="min-h-12 bg-signal px-5 text-[15px] font-semibold text-on-signal">
              Sign in free
            </button>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="font-mono text-xs uppercase tracking-label text-signal-text">❯ notebook</span>
            {extra}
          </div>
          <p className="m-0 p-5 text-[15px] text-fg-2">{error}</p>
        </div>
      ) : pageId ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <PageEditor key={pageId} pageId={pageId} variant="panel" onOpenPage={setPageId} headerExtra={extra} />
          {!introSeen && (
            <section aria-label="What the notebook does" className="absolute inset-x-3 bottom-3 z-10 flex flex-col gap-3 border border-line-strong bg-bg p-4 shadow-[0_12px_40px_rgba(0,0,0,0.28)] animate-hk-in pb-[calc(env(safe-area-inset-bottom,0px)+16px)] lg:pb-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="m-0 font-display text-[19px] font-bold leading-tight tracking-[-0.02em] text-fg">Your notebook, on every course page.</h2>
                <button type="button" onClick={dismissIntro} aria-label="Close the tips" className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center text-fg-3 hover:bg-surface-2 hover:text-fg">
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <NotebookIntro dense />
              <button type="button" onClick={dismissIntro} className="min-h-11 self-start bg-signal px-4 text-[14px] font-semibold text-on-signal">
                Got it
              </button>
            </section>
          )}
        </div>
      ) : start ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="font-mono text-xs uppercase tracking-label text-signal-text">❯ notebook</span>
            {extra}
          </div>
          <div className="flex flex-col items-start gap-4 overflow-y-auto p-5">
            <h2 className="m-0 font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-fg">Take notes anywhere in the course.</h2>
            <NotebookIntro />
            <button type="button" onClick={() => void startHere()} disabled={busy} className="inline-flex min-h-12 items-center gap-2 bg-signal px-5 text-[15px] font-semibold text-on-signal disabled:opacity-60">
              <NotebookPenIcon />
              {busy ? "Starting…" : "Start a page"}
            </button>
            <p className="m-0 text-[13.5px] leading-relaxed text-fg-3">
              Beside a lesson, a war story or a lab, the notebook keeps a page for that page. Press <kbd className="border border-line-strong px-1 font-mono text-[12px]">N</kbd> to open or close it.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 place-items-center font-mono text-[12px] text-fg-3">{key ? "finding your page for this…" : "opening your last page…"}</div>
      )}
    </aside>
  );
}
