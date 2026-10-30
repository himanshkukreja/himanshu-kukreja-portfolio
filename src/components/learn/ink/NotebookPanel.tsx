"use client";

/**
 * The Notebook beside a lesson. On a wide screen (iPad landscape and up, >= 1024 px) a right-hand split panel: the
 * page makes room for it (html.hk-nb-open, globals.css) so the lesson stays readable and scrollable on the left,
 * and the panel's left edge drags to resize it. On phones and iPad portrait a full-height sheet.
 *
 * It opens the page last used with this lesson (this device's memory, then the newest page tagged with the
 * lesson), else makes one tagged "<week>/<slug>" in the notebook named after the course week (made if needed).
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Maximize2, X } from "lucide-react";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useChromeHidden } from "@/components/site/readerChrome";
import { createPage, getPage, InkError, lessonPage, notebookNamed } from "@/lib/learn/ink/client";
import { useInkUser } from "@/lib/learn/ink/usePageAutosave";
import PageEditor from "./PageEditor";

export type NotebookPanelLesson = { week: string; slug: string; title: string; weekLabel: string; weekTopic: string };

const W_KEY = "hk.ink.panelW";
const LAST = (key: string) => `hk.ink.lesson:${key}`;
const MIN_W = 360;

const wideQuery = "(min-width: 1024px)";
const subscribeWide = (cb: () => void) => {
  const m = window.matchMedia(wideQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const isWide = () => window.matchMedia(wideQuery).matches;

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

async function resolvePage(lesson: NotebookPanelLesson): Promise<string> {
  const key = `${lesson.week}/${lesson.slug}`;
  try {
    const last = window.localStorage.getItem(LAST(key));
    if (last && (await getPage(last))) return last;
  } catch (e) {
    if (e instanceof InkError && (e.code === "auth" || e.code === "unavailable")) throw e;
  }
  const tagged = await lessonPage(key);
  if (tagged) return tagged.id;
  const title = [lesson.weekLabel, lesson.weekTopic].filter(Boolean).join(" · ") || "Lessons";
  const nb = await notebookNamed(title);
  const page = await createPage(nb.id, { lessonKey: key, title: lesson.title, paper: "ruled" });
  return page.id;
}

export default function NotebookPanel({ lesson, target, onClose }: { lesson: NotebookPanelLesson; target: { pageId?: string; n: number }; onClose: () => void }) {
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const headerHidden = useChromeHidden();
  const { userId, loading } = useInkUser();
  const { openAuthModal } = useAuthModal();
  const [pageId, setPageId] = useState<string | null>(target.pageId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState<number>(() => (typeof window === "undefined" ? 480 : storedW()));
  const key = `${lesson.week}/${lesson.slug}`;
  const panelRef = useRef<HTMLElement>(null);

  // a new open request (a capture tool may ask for a specific page)
  useEffect(() => {
     
    if (target.pageId) setPageId(target.pageId);
  }, [target]);

  // one lookup per lesson (and only one page made, however often the reader re-renders meanwhile)
  const lessonRef = useRef(lesson);
  const resolving = useRef<Promise<string> | null>(null);
  useEffect(() => {
    if (!userId || pageId) return;
    let off = false;
    resolving.current ||= resolvePage(lessonRef.current);
    resolving.current
      .then((id) => !off && setPageId(id))
      .catch((e) => {
        resolving.current = null;
        if (!off) setError(e instanceof InkError ? e.message : "Couldn't open your notebook.");
      });
    return () => {
      off = true;
    };
  }, [userId, pageId, key]);

  useEffect(() => {
    if (!pageId) return;
    try {
      window.localStorage.setItem(LAST(key), pageId);
    } catch {
      // ignore
    }
  }, [pageId, key]);

  // the split: the page makes room on the right (wide screens only)
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("hk-nb-open");
    window.dispatchEvent(new Event("hk:chrome"));
    return () => {
      html.classList.remove("hk-nb-open");
      html.style.removeProperty("--hk-nb-w");
      window.dispatchEvent(new Event("hk:chrome"));
    };
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--hk-nb-w", `${width}px`);
  }, [width]);

  // the Ask panel takes the same side: give way to it
  useEffect(() => {
    const html = document.documentElement;
    const mo = new MutationObserver(() => html.classList.contains("hk-ask-open") && onClose());
    mo.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [onClose]);

  // phones: the sheet covers the lesson, so the lesson must not scroll under it
  useEffect(() => {
    if (wide) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [wide]);

  useEffect(() => {
    const onResize = () => setWidth((w) => Math.min(maxW(), Math.max(MIN_W, w)));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

  const top = wide ? (headerHidden ? "var(--hk-top-inset, 0px)" : "var(--hk-header-h, 61px)") : "0px";

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-modal={!wide || undefined}
      aria-label="Notebook beside this lesson"
      data-notebook-panel
      className={`fixed bottom-0 right-0 z-[72] flex flex-col bg-bg ${wide ? "border-l border-line-strong" : "left-0 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"}`}
      style={{ top, width: wide ? width : undefined, transition: "top 200ms" }}
    >
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
          <div className="flex flex-col items-start gap-3 p-5">
            <h2 className="m-0 font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-fg">Write beside the lesson.</h2>
            <p className="m-0 text-[15px] leading-relaxed text-fg-2">Handwritten pages with Apple Pencil, a stylus, a finger or a mouse: ruled, grid, Cornell notes or a design-interview sheet. Sign in to keep them in your account.</p>
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
        <PageEditor key={pageId} pageId={pageId} variant="panel" onOpenPage={setPageId} headerExtra={extra} />
      ) : (
        <div className="grid flex-1 place-items-center font-mono text-[12px] text-fg-3">finding your page for this lesson…</div>
      )}
    </aside>
  );
}
