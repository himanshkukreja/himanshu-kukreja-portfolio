"use client";

/**
 * A handwritten note on a passage, anchored to it: a popover beside the passage on a tablet or a laptop (to its side
 * when the margin is wide enough, otherwise above or below it, never over it), a bottom sheet on a phone. On a
 * tablet in portrait (iPad 744-1024 px wide) the margins are narrow, so the pad docks below the passage at nearly
 * the full width and about half the height: big ruled lines for a pencil, with the passage kept in view above it.
 *
 *   write  the pad (InkNotePad): pen, highlighter, eraser, palette, undo; autosaves (passageAutosave) as you write
 *   view   the note: its ink, or its typed text with "Show handwriting"; Turn into text, Continue writing, Delete
 *
 * "Turn into text" renders the note (light theme, cropped to the writing) and sends it to the notebook pages' convert
 * route (Haiku, about 1 credit) only when tapped; the Markdown is saved as the note's note_text and the ink is kept.
 *
 * Non-modal: the lesson stays readable and scrollable around it and the panel follows its passage. Escape closes it
 * (focus goes back to the note's marker); while writing, a tap outside doesn't close it (a stray finger shouldn't
 * end a note), while reading it does.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { Check, FileText, Loader2, PenLine, Trash2, X } from "lucide-react";
import { aiFetch } from "@/components/learn/ai/aiFetch";
import { setAiCredits, useAiStatus } from "@/components/learn/ai/useAiStatus";
import NotesMd from "@/components/learn/ink/ai/NotesMd";
import { NOTES_CREDITS } from "@/lib/ai/notes";
import { backupKey, deleteInkNote, dropInkBackup, emptyInk, inkNoteImage, readInkBackup, updateInkNote, type InkNoteAnchor, type InkNoteInk, type InkNoteRow } from "@/lib/learn/ink/passage";
import { INK_SAVE_TEXT, useInkNoteAutosave } from "@/lib/learn/ink/passageAutosave";
import { timeAgo } from "@/lib/learn/progress";
import InkNotePad, { type InkNotePadHandle } from "./InkNotePad";
import InkNoteThumb from "./InkNoteThumb";

export type InkNoteTarget = { kind: "new"; anchor: InkNoteAnchor } | { kind: "open"; note: InkNoteRow; write?: boolean };

type Props = {
  target: InkNoteTarget;
  userId: string | null;
  lessonTitle: string;
  /** the passage's box on screen now: the note's marker once it has one, else the selection */
  getRect: (noteId: string | null) => DOMRect | null;
  /** the dev stand-in is on (next dev): the AI button shows without a session so the flow can be tested */
  dev?: boolean;
  onCreated: (row: InkNoteRow) => void;
  onChanged: (row: InkNoteRow) => void;
  onDeleted: (id: string) => void;
  /** closed; `focusId`: the note whose marker should take focus */
  onClose: (focusId: string | null) => void;
};

const EDGE = 16;
const GAP = 12;

const subscribeResize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
/** "phone" | "portrait" (a tablet held upright) | "wide", as one string so the snapshot is stable */
const layoutOf = () => (window.innerWidth < 640 ? "phone" : window.innerHeight > window.innerWidth ? "portrait" : "wide");

/** Where the popover goes: beside the passage if there's room, else below or above it, inside the screen. */
function place(r: DOMRect | null, W: number, H: number): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampY = (y: number) => Math.max(EDGE, Math.min(y, vh - H - EDGE));
  const clampX = (x: number) => Math.max(EDGE, Math.min(x, vw - W - EDGE));
  if (!r || (!r.width && !r.height)) return { left: clampX((vw - W) / 2), top: clampY((vh - H) / 2) };
  if (vw - r.right - GAP - EDGE >= W) return { left: r.right + GAP, top: clampY(r.top - 28) };
  if (r.left - GAP - EDGE >= W) return { left: r.left - GAP - W, top: clampY(r.top - 28) };
  const left = clampX(r.left - 8);
  const below = vh - r.bottom - GAP - EDGE;
  const above = r.top - GAP - EDGE;
  // clamped too: a passage scrolled off the screen never takes the popover with it
  if (below >= H) return { left, top: clampY(r.bottom + GAP) };
  if (above >= H) return { left, top: clampY(r.top - GAP - H) };
  return { left, top: below >= above ? clampY(r.bottom + GAP) : EDGE };
}

export default function InkNotePanel({ target, userId, lessonTitle, getRect, dev = false, onCreated, onChanged, onDeleted, onClose }: Props) {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const layout = useSyncExternalStore(subscribeResize, layoutOf, () => "wide");
  const phone = layout === "phone";
  const portrait = layout === "portrait";
  const ai = useAiStatus();
  const titleId = useId();

  const anchor: InkNoteAnchor =
    target.kind === "new"
      ? target.anchor
      : { courseId: target.note.course_id, week: target.note.week, lessonSlug: target.note.lesson_slug, highlightText: target.note.highlight_text || "", highlightOffset: target.note.highlight_offset ?? 0 };

  // the note as last saved, and the ink on the pad (this device's unsaved copy wins when it's newer)
  const [row, setRow] = useState<InkNoteRow | null>(target.kind === "open" ? target.note : null);
  const [initial] = useState(() => {
    const id = target.kind === "open" ? target.note.id : null;
    const b = readInkBackup(backupKey(id, anchor));
    if (target.kind === "new") return { ink: b?.ink ?? emptyInk(), dirty: !!b?.ink.strokes.length };
    if (b && b.at > (Date.parse(target.note.updated_at) || 0)) return { ink: b.ink, dirty: true };
    return { ink: target.note.ink, dirty: false };
  });
  const [ink, setInk] = useState<InkNoteInk>(initial.ink);
  const inkRef = useRef(initial.ink);
  const [mode, setMode] = useState<"write" | "view">(target.kind === "new" || (target.kind === "open" && target.write) ? "write" : "view");
  const [showInk, setShowInk] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<"convert" | "delete" | "close" | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<InkNotePadHandle>(null);
  const rowRef = useRef(row);
  useEffect(() => {
    rowRef.current = row;
  }, [row]);

  const { state: saveState, error: saveError, change, flush } = useInkNoteAutosave({
    userId,
    anchor,
    noteId: row?.id ?? null,
    onCreated: (r) => {
      setRow(r);
      onCreated(r);
    },
    onSaved: (id, savedInk, at) => {
      const cur = rowRef.current;
      if (!cur || cur.id !== id) return;
      const next = { ...cur, ink: savedInk, updated_at: at };
      setRow(next);
      onChanged(next);
    },
  });

  // the loaded version: saved already, or this device's copy that still needs saving
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    change(initial.ink, initial.dirty);
  }, [change, initial]);

  const onInk = useCallback(
    (n: InkNoteInk) => {
      inkRef.current = n;
      setInk(n);
      change(n);
    },
    [change]
  );

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // ------------------------------------------------------------------ placement

  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const W = phone ? 0 : Math.min(portrait ? 900 : 560, vw - EDGE * 2);
  const [measuredH, setMeasuredH] = useState(0);
  const writeH = portrait ? Math.min(640, Math.max(480, Math.round(vh * 0.5))) : Math.min(540, vh - EDGE * 2);
  const H = mode === "write" ? writeH : measuredH || 360;
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (phone) return;
    const el = panelRef.current;
    if (!el || mode === "write") return;
    const ro = new ResizeObserver(() => setMeasuredH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [phone, mode]);

  // writing on a passage the pad can't sit beside, above or below: bring the passage up first
  const scrolled = useRef(false);
  useLayoutEffect(() => {
    if (scrolled.current || mode !== "write") return;
    scrolled.current = true;
    const r = getRect(rowRef.current?.id ?? null);
    if (!r) return;
    const vh = window.innerHeight;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const fits = phone
      ? r.top >= 64 && r.bottom <= vh * 0.3
      : window.innerWidth - r.right - GAP - EDGE >= W || r.left - GAP - EDGE >= W || vh - r.bottom - GAP - EDGE >= writeH || r.top - GAP - EDGE >= writeH;
    if (!fits) window.scrollBy({ top: r.top - 76, behavior: reduce ? "auto" : "smooth" });
  }, [mode, phone, getRect, W, writeH]);

  useLayoutEffect(() => {
    if (phone) return;
    let raf = 0;
    const update = () => {
      const p = place(getRect(rowRef.current?.id ?? null), W, H);
      setPos((o) => (o && o.left === p.left && o.top === p.top ? o : p));
    };
    update();
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", on, { passive: true, capture: true });
    window.addEventListener("resize", on);
    // the lesson can move without a scroll event (images and diagrams loading, the enhancer rebuilding its chrome)
    const tick = window.setInterval(on, 300);
    return () => {
      window.clearInterval(tick);
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on, { capture: true });
      window.removeEventListener("resize", on);
    };
  }, [phone, getRect, W, H, row?.id]);

  // ------------------------------------------------------------------ close / keys / focus

  const close = useCallback(async () => {
    if (busy === "close") return;
    setBusy("close");
    let id: string | null = rowRef.current?.id ?? null;
    try {
      id = await Promise.race([flush(), new Promise<string | null>((r) => window.setTimeout(() => r(rowRef.current?.id ?? null), 4000))]);
    } catch {
      // kept on this device
    }
    // a note with nothing in it (all erased, never typed up) isn't kept
    const cur = rowRef.current;
    if (id && cur && !inkRef.current.strokes.length && !(cur.note_text || "").trim() && userId) {
      try {
        await deleteInkNote(userId, id);
        dropInkBackup(id);
        onDeleted(id);
        id = null;
      } catch {
        // leave it
      }
    }
    onClose(id);
  }, [busy, flush, userId, onDeleted, onClose]);

  // focus the panel once it's on screen (it's hidden until placed, and a hidden element can't take focus)
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current || (!phone && !pos)) return;
    focused.current = true;
    panelRef.current?.focus({ preventScroll: true });
  }, [phone, pos]);


  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  // Escape closes it from anywhere (the panel handles its own keys first)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) void closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (mode !== "view") return;
    const onDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) void close();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [mode, close]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      if (confirmDelete) setConfirmDelete(false);
      else void close();
      return;
    }
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
    if (mode !== "write") return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && k === "z") {
      e.preventDefault();
      if (e.shiftKey) padRef.current?.redo();
      else padRef.current?.undo();
    } else if (mod && k === "y") {
      e.preventDefault();
      padRef.current?.redo();
    } else if (!mod && !e.altKey && (k === "p" || k === "h" || k === "e")) {
      e.preventDefault();
      padRef.current?.setTool(k === "p" ? "pen" : k === "h" ? "highlighter" : "eraser");
    }
  };

  // ------------------------------------------------------------------ actions

  const typed = (row?.note_text || "").trim();
  const hasInk = ink.strokes.length > 0;
  const aiOn = !!ai?.features["notes-convert"] || dev;
  const outOfCredits = !!ai && !ai.ownKey && ai.creditsLeft !== null && ai.creditsLeft <= 0 && !dev;

  const turnIntoText = async () => {
    if (busy || !hasInk) return;
    setBusy("convert");
    setAiError(null);
    try {
      const id = await flush();
      if (!id || !userId) throw new Error("Couldn't save the note first. Try again.");
      let img: Awaited<ReturnType<typeof inkNoteImage>>;
      try {
        img = await inkNoteImage(ink);
      } catch {
        throw new Error("Couldn't draw this note. Try again.");
      }
      let r: Response;
      try {
        r = await aiFetch("/api/learn/ai/notes/convert", {
          method: "POST",
          body: JSON.stringify({ pageId: id, title: lessonTitle.slice(0, 120), lessonKey: `${anchor.week}/${anchor.lessonSlug}`, image: { mediaType: img.mediaType, data: img.data }, items: [] }),
        });
      } catch {
        throw new Error("You seem to be offline. Your note is safe; try again when you're back.");
      }
      const b = (await r.json().catch(() => ({}))) as { md?: string; empty?: boolean; error?: string; creditsLeft?: number | null };
      setAiCredits(b.creditsLeft);
      if (!r.ok) throw new Error(b.error || "Something went wrong. Try again in a moment.");
      if (b.empty || !b.md) throw new Error("The AI found nothing to type up in this note yet.");
      const at = await updateInkNote(userId, id, { note_text: b.md });
      const cur = rowRef.current;
      if (cur) {
        const next = { ...cur, note_text: b.md, updated_at: at || cur.updated_at };
        setRow(next);
        onChanged(next);
      }
      setShowInk(false);
      setMode("view");
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const cur = rowRef.current;
    setBusy("delete");
    try {
      if (cur && userId) await deleteInkNote(userId, cur.id);
      dropInkBackup(backupKey(cur?.id ?? null, anchor));
      if (cur) onDeleted(cur.id);
      onClose(null);
    } catch {
      setNotice("Couldn't delete the note. Try again.");
      setBusy(null);
    }
  };

  const done = async () => {
    if (!hasInk) {
      void close();
      return;
    }
    setMode("view");
    void flush();
  };

  // ------------------------------------------------------------------ render

  const quote = anchor.highlightText.replace(/\s+/g, " ").trim();
  const status = saveState === "saved" && !row ? (hasInk ? "Saving…" : "Not started") : INK_SAVE_TEXT[saveState];
  const btn = "inline-flex min-h-11 items-center justify-center gap-2 px-3.5 text-[14px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50";

  const header = (
    <div className="flex shrink-0 items-start gap-2 border-b border-line py-1.5 pl-3.5 pr-1.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
        <span id={titleId} className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-signal-text">
          <PenLine className="h-3.5 w-3.5" aria-hidden />
          Handwritten note
          <span className="normal-case tracking-normal text-fg-4" aria-live="polite" title={saveError || undefined}>
            · {mode === "write" ? status : row ? `${saveState === "saved" ? "saved" : status.toLowerCase()} ${timeAgo(Date.parse(row.updated_at) || Date.now())}` : status}
          </span>
        </span>
        {quote && (
          <span className="truncate text-[13px] leading-snug text-fg-3" title={quote}>
            on “{quote.slice(0, 140)}
            {quote.length > 140 ? "…" : ""}”
          </span>
        )}
      </div>
      {mode === "write" && (
        <button type="button" onClick={() => void done()} className={`${btn} bg-fg text-bg hover:bg-fg-2`}>
          <Check className="h-4 w-4" aria-hidden />
          Done
        </button>
      )}
      <button type="button" onClick={() => void close()} aria-label="Close the note (it's saved)" className="grid h-11 w-11 shrink-0 place-items-center text-fg-3 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal">
        {busy === "close" ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );

  const toast = notice && (
    <div role="status" className="pointer-events-auto absolute bottom-3 left-3 right-3 z-20 flex items-center gap-3 bg-fg py-2 pl-3.5 pr-1.5 text-bg motion-safe:animate-hk-in">
      <span className="min-w-0 flex-1 text-[13px] font-semibold">{notice}</span>
      <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="grid h-9 w-9 shrink-0 place-items-center opacity-70 hover:opacity-100">
        ×
      </button>
    </div>
  );

  const writeBody = (
    <div className="relative min-h-0 flex-1">
      <InkNotePad ref={padRef} ink={ink} onChange={onInk} theme={theme} onNotice={setNotice} label={`Writing pad for your note on: ${quote.slice(0, 80)}. ${ink.strokes.length} strokes.`} />
      {toast}
    </div>
  );

  const viewBody = (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {typed && !showInk ? (
          <div className="px-4 py-3.5">
            <NotesMd md={typed} />
          </div>
        ) : hasInk ? (
          <InkNoteThumb ink={ink} label={`Your handwriting${typed ? "" : ". Not typed up yet"}`} className="border-b border-line" />
        ) : (
          <p className="m-0 px-4 py-6 text-[15px] text-fg-3">Nothing written yet.</p>
        )}
      </div>
      {typed && hasInk && (
        <button type="button" onClick={() => setShowInk(!showInk)} aria-pressed={showInk} className="flex min-h-11 shrink-0 items-center gap-2 border-t border-line px-4 text-left font-mono text-[12px] uppercase tracking-[0.06em] text-fg-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal">
          {showInk ? "Show typed text" : "Show handwriting"}
        </button>
      )}
      {aiError && (
        <p role="alert" className="m-0 border-t border-bad px-4 py-2.5 text-[13px] text-fg">
          {aiError}
        </p>
      )}
      {confirmDelete ? (
        <div role="alertdialog" aria-label="Delete this note?" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-bad bg-bg px-3.5 py-2.5">
          <span className="text-[14px] font-semibold text-fg">Delete this handwritten note?</span>
          <span className="flex gap-2">
            <button type="button" autoFocus onClick={() => setConfirmDelete(false)} className={`${btn} border border-line-strong text-fg`}>
              Keep it
            </button>
            <button type="button" onClick={() => void remove()} disabled={busy === "delete"} className={`${btn} bg-bad text-[#120203]`}>
              {busy === "delete" ? "Deleting…" : "Delete"}
            </button>
          </span>
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
          {hasInk && aiOn && (
            <button
              type="button"
              onClick={() => void turnIntoText()}
              disabled={!!busy || outOfCredits}
              aria-describedby={`${titleId}-ai`}
              className={`${btn} ${typed ? "border border-line-strong text-fg hover:bg-surface-2" : "bg-signal text-on-signal"}`}
            >
              {busy === "convert" ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />}
              {busy === "convert" ? "Reading your handwriting…" : typed ? "Turn into text again" : "Turn into text"}
            </button>
          )}
          <button type="button" onClick={() => setMode("write")} disabled={!!busy} className={`${btn} border border-line-strong text-fg hover:bg-surface-2`}>
            <PenLine className="h-4 w-4" aria-hidden />
            {hasInk ? "Continue writing" : "Write"}
          </button>
          <button type="button" onClick={() => setConfirmDelete(true)} disabled={!!busy} aria-label="Delete this note" className="ml-auto grid h-11 w-11 place-items-center border border-line-strong text-fg-3 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal disabled:opacity-50">
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
          {hasInk && aiOn && (
            <span id={`${titleId}-ai`} className="basis-full text-[12px] leading-snug text-fg-4">
              {outOfCredits ? "You've used today's AI credits. They refill at midnight UTC." : `Sends a picture of this note to the AI only when you tap · about ${NOTES_CREDITS.convert} credit.`}
            </span>
          )}
        </div>
      )}
      {toast}
    </div>
  );

  const body = mode === "write" ? writeBody : viewBody;

  const panel = phone ? (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-sd-chrome=""
      data-ink-note-panel=""
      className="fixed inset-x-0 bottom-0 z-[95] flex flex-col border-t border-line-strong bg-surface shadow-[0_-12px_40px_rgba(0,0,0,0.35)] outline-none focus-visible:outline-none motion-safe:animate-hk-in"
      style={{ height: mode === "write" ? "min(72vh, 620px)" : undefined, maxHeight: "85vh", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {header}
      {body}
    </div>
  ) : (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-sd-chrome=""
      data-ink-note-panel=""
      className="fixed z-[95] flex flex-col border border-line-strong bg-surface shadow-[0_16px_48px_rgba(0,0,0,0.35)] outline-none focus-visible:outline-none motion-safe:animate-hk-in"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, width: W, height: mode === "write" ? writeH : undefined, maxHeight: `calc(100vh - ${EDGE * 2}px)`, visibility: pos ? "visible" : "hidden" }}
    >
      {header}
      {body}
    </div>
  );

  return createPortal(panel, document.body);
}
