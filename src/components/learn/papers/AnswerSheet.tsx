"use client";

/**
 * One answer, handwritten: the notebook's ink engine (InkCanvas + InkToolbar, perfect-freehand, pencil-only palm
 * rejection) on exam paper, with undo/redo, typed text boxes, and up to MAX_SHEETS sheets per answer. Each sheet is a
 * notebook page (lib/learn/ink/client.ts), made only when the learner first writes on it (browsing the questions makes
 * no pages), then autosaved like any page (usePageAutosave: 1 s after a change, at once on leaving, a copy on this
 * device while offline).
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import InkCanvas, { type InkCanvasHandle, type InkContent, type InkToolId } from "@/components/learn/ink/InkCanvas";
import InkToolbar from "@/components/learn/ink/InkToolbar";
import { InkError } from "@/lib/learn/ink/client";
import { pageBytes } from "@/lib/learn/ink/geometry";
import { PEN_SIZES, type InkTheme } from "@/lib/learn/ink/render";
import { LIMITS, type InkColor, type NotebookPage, type Paper } from "@/lib/learn/ink/types";
import { loadPage, usePageAutosave } from "@/lib/learn/ink/usePageAutosave";
import { MAX_SHEETS } from "@/lib/learn/papers/types";

const PENCIL_KEY = "hk.ink.pencilOnly";
const PREFS_KEY = "hk.ink.prefs";
const HISTORY = 100;
const SHEET_PAPERS: { id: Paper; label: string }[] = [
  { id: "ruled", label: "Ruled" },
  { id: "grid", label: "Grid" },
  { id: "blank", label: "Blank" },
];

function readPencil(): boolean | null {
  try {
    const v = window.localStorage.getItem(PENCIL_KEY);
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}
function writePencil(v: boolean) {
  try {
    window.localStorage.setItem(PENCIL_KEY, v ? "1" : "0");
  } catch {
    // ignore
  }
}

export type AnswerSheetHandle = {
  /** save everything now (before grading or leaving the question) */
  flush: () => Promise<void>;
};

type Props = {
  /** the answer's sheets (notebook page ids, in order) */
  ids: string[];
  onIds: (ids: string[]) => void;
  /** make sheet `n` (1-based) as a notebook page */
  make: (sheet: number) => Promise<NotebookPage>;
  readOnly: boolean;
  defaultPaper: Paper;
  /** "Answer to question 3" (screen readers) */
  label: string;
  onSave?: (state: string) => void;
};

const blankDraft = (paper: Paper): NotebookPage => ({ id: "", notebookId: "", title: "", paper, position: 0, lessonKey: null, strokes: [], items: [], convertedMd: null, convertedAt: null, createdAt: "", updatedAt: "" });

const AnswerSheet = forwardRef<AnswerSheetHandle, Props>(function AnswerSheet({ ids, onIds, make, readOnly, defaultPaper, label, onSave }, ref) {
  const { resolvedTheme } = useTheme();
  const theme: InkTheme = resolvedTheme === "dark" ? "dark" : "light";
  const [s, setS] = useState(0);
  const [page, setPage] = useState<NotebookPage | null>(null);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pageRef = useRef<NotebookPage | null>(null);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const creating = useRef<Promise<void> | null>(null);
  const past = useRef<InkContent[]>([]);
  const future = useRef<InkContent[]>([]);
  const mergeRef = useRef<string | null>(null);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const [tool, setTool] = useState<InkToolId>("pen");
  const [color, setColor] = useState<InkColor>("ink");
  const [sizeIndex, setSizeIndex] = useState(0);
  const [pencilOnly, setPencilOnly] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const canvas = useRef<InkCanvasHandle>(null);

  useEffect(() => {
    const p = readPencil();
    if (p !== null) setPencilOnly(p);
    try {
      const prefs = JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}") as { color?: InkColor; size?: number };
      if (prefs.color) setColor(prefs.color);
      if (typeof prefs.size === "number" && prefs.size >= 0 && prefs.size < PEN_SIZES.length) setSizeIndex(prefs.size);
    } catch {
      // ignore
    }
  }, []);

  // the sheet on screen: load it, or start a draft (made into a page on the first stroke)
  const sheetId = ids[s] ?? "";
  useEffect(() => {
    let off = false;
    // the page this component just made for the draft: keep what is on screen (and its undo history)
    if (sheetId && pageRef.current?.id === sheetId) return;
    past.current = [];
    future.current = [];
    mergeRef.current = null;
    setHist({ undo: 0, redo: 0 });
    setErr(null);
    if (!sheetId) {
      const d = blankDraft(defaultPaper);
      pageRef.current = d;
      setPage(d);
      setDirty(false);
      return;
    }
    pageRef.current = null;
    setPage(null);
    loadPage(sheetId)
      .then(({ page: p, restored }) => {
        if (off) return;
        if (!p) {
          setErr("This answer sheet was deleted from your notebook.");
          return;
        }
        pageRef.current = p;
        setDirty(restored);
        setPage(p);
      })
      .catch((e) => !off && setErr(e instanceof InkError ? e.message : "Couldn't open this answer sheet."));
    return () => {
      off = true;
    };
  }, [sheetId, defaultPaper]);

  const saved = usePageAutosave(page && page.id ? page : null, { dirty });
  useEffect(() => {
    onSave?.(page && !page.id ? "draft" : saved.state);
  }, [saved.state, page, onSave]);

  /** The draft becomes a notebook page on the first change. */
  const ensure = useCallback(() => {
    if (creating.current || pageRef.current?.id) return;
    const n = idsRef.current.length + 1;
    creating.current = make(n)
      .then((created) => {
        const cur = pageRef.current || blankDraft(defaultPaper);
        const np: NotebookPage = { ...created, paper: cur.paper, strokes: cur.strokes, items: cur.items };
        pageRef.current = np;
        setDirty(true);
        setPage(np);
        onIds([...idsRef.current, created.id]);
      })
      .catch((e) => setErr(e instanceof InkError ? e.message : "Couldn't save this answer. Check your connection; what you write stays on screen."))
      .finally(() => {
        creating.current = null;
      });
  }, [make, onIds, defaultPaper]);

  const commit = useCallback(
    (next: InkContent, mergeKey?: string) => {
      const cur = pageRef.current;
      if (!cur || readOnly) return;
      if (pageBytes(next.strokes, next.items) > LIMITS.pageBytes && next.strokes.length + next.items.length > cur.strokes.length + cur.items.length) {
        setNotice("This sheet is full. Add a sheet to keep writing.");
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
      if (!np.id) ensure();
    },
    [readOnly, ensure]
  );

  const step = useCallback(
    (back: boolean) => {
      const cur = pageRef.current;
      const from = back ? past : future;
      const to = back ? future : past;
      if (!cur || readOnly || !from.current.length) return;
      const snap = back ? from.current[from.current.length - 1] : from.current[0];
      from.current = back ? from.current.slice(0, -1) : from.current.slice(1);
      const here = { strokes: cur.strokes, items: cur.items };
      to.current = back ? [here, ...to.current].slice(0, HISTORY) : [...to.current, here].slice(-HISTORY);
      mergeRef.current = null;
      const np = { ...cur, ...snap };
      pageRef.current = np;
      setPage(np);
      setHist({ undo: past.current.length, redo: future.current.length });
    },
    [readOnly]
  );

  const setPaper = (paper: Paper) => {
    const cur = pageRef.current;
    if (!cur || readOnly) return;
    const np = { ...cur, paper };
    pageRef.current = np;
    setPage(np);
  };

  const flush = useCallback(async () => {
    if (creating.current) await creating.current;
    await saved.flush();
  }, [saved]);
  useImperativeHandle(ref, () => ({ flush }), [flush]);

  const goSheet = async (k: number) => {
    if (k < 0 || k >= Math.max(1, ids.length) || k === s) return;
    await flush();
    setS(k);
  };
  const addSheet = async () => {
    if (readOnly || ids.length >= MAX_SHEETS || !pageRef.current?.id) return;
    try {
      await flush();
      const p = await make(ids.length + 1);
      onIds([...ids, p.id]);
      setS(ids.length);
    } catch (e) {
      setNotice(e instanceof InkError ? e.message : "Couldn't add a sheet.");
    }
  };

  // tool keys and undo, while no text field has focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        step(!e.shiftKey);
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        step(false);
        return;
      }
      if (mod || e.altKey || readOnly) return;
      const map: Record<string, InkToolId> = { p: "pen", h: "highlighter", e: "eraser", l: "lasso", t: "text" };
      const k = e.key.toLowerCase();
      if (map[k]) {
        setTool(map[k]);
        e.preventDefault();
      } else if (e.key === "Delete" || e.key === "Backspace") canvas.current?.deleteSelection();
      else if (e.key === "Escape") canvas.current?.clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, readOnly]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const onPenSeen = useCallback(() => {
    if (readPencil() === null) {
      writePencil(true);
      setPencilOnly(true);
      setNotice("Pencil found: now only the pencil writes, and fingers scroll and zoom. Turn off “Pencil only” to write with a finger.");
    }
  }, []);

  const sheets = Math.max(1, ids.length);
  const sheetNav = useMemo(
    () => (
      <div role="group" aria-label="Answer sheets" className="ml-1 flex shrink-0 items-center gap-0.5">
        <label className="flex items-center">
          <span className="sr-only">Paper</span>
          <select value={page?.paper ?? defaultPaper} disabled={!page || readOnly} onChange={(e) => setPaper(e.target.value as Paper)} className="h-10 border border-line-strong bg-surface px-1.5 text-[13px] text-fg">
            {SHEET_PAPERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void goSheet(s - 1)} disabled={s <= 0} aria-label="Previous sheet" className="grid h-10 w-9 place-items-center text-fg hover:bg-surface-2 disabled:opacity-30">
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <span className="min-w-[64px] text-center font-mono text-[12px] text-fg-2">
          sheet {s + 1}/{sheets}
        </span>
        <button type="button" onClick={() => void goSheet(s + 1)} disabled={s >= sheets - 1} aria-label="Next sheet" className="grid h-10 w-9 place-items-center text-fg hover:bg-surface-2 disabled:opacity-30">
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={() => void addSheet()}
            disabled={ids.length >= MAX_SHEETS || !page?.id}
            title={ids.length >= MAX_SHEETS ? `At most ${MAX_SHEETS} sheets an answer` : "Add a sheet to this answer"}
            className="flex h-10 items-center gap-1 px-2 font-mono text-[12px] text-fg hover:bg-surface-2 disabled:opacity-30"
          >
            <Plus className="h-4 w-4" aria-hidden />
            sheet
          </button>
        )}
      </div>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the handlers read refs and the current sheet
    [page?.paper, page?.id, s, sheets, ids.length, readOnly, defaultPaper]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center border-b border-line bg-surface px-1 sm:px-2" data-paper-tools>
        {readOnly ? (
          <div className="flex min-h-11 flex-1 flex-wrap items-center justify-between gap-2 px-2">
            <span className="font-mono text-[12px] text-fg-3">answers are locked · pinch or scroll to look</span>
            {sheetNav}
          </div>
        ) : (
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
            onUndo={() => step(true)}
            onRedo={() => step(false)}
            zoom={zoom}
            onZoom={(k) => canvas.current?.zoomBy(k)}
            onFit={() => canvas.current?.fit()}
            pencilOnly={pencilOnly}
            onPencilOnly={(v) => {
              setPencilOnly(v);
              writePencil(v);
            }}
            compact
            extra={sheetNav}
          />
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {err ? (
          <div className="grid h-full place-items-center bg-surface-2 p-6 text-center text-[15px] text-fg-2">{err}</div>
        ) : page ? (
          <InkCanvas
            ref={canvas}
            paper={page.paper}
            strokes={page.strokes}
            items={page.items}
            tool={readOnly ? "lasso" : tool}
            color={color}
            penSize={PEN_SIZES[sizeIndex]}
            theme={theme}
            pencilOnly={pencilOnly}
            full={pageBytes(page.strokes, page.items) >= LIMITS.pageBytes}
            pad={12}
            onCommit={commit}
            onPenSeen={onPenSeen}
            onFull={() => setNotice("This sheet is full. Add a sheet to keep writing.")}
            onZoom={setZoom}
            label={`${label}, sheet ${s + 1} of ${sheets}: ${page.strokes.length} strokes${page.items.length ? `, ${page.items.length} text boxes` : ""}.`}
          />
        ) : (
          <div className="grid h-full place-items-center bg-surface-2">
            <span className="font-mono text-[12px] text-fg-3">opening the answer sheet…</span>
          </div>
        )}
        {notice && (
          <div role="status" className="absolute bottom-3 left-3 right-3 z-20 mx-auto flex max-w-[520px] items-center gap-3 bg-fg py-2 pl-4 pr-2 text-bg">
            <span className="min-w-0 flex-1 text-[13px] font-semibold">{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="grid h-9 w-9 shrink-0 place-items-center opacity-70 hover:opacity-100">
              ×
            </button>
          </div>
        )}
      </div>
      <div className="sr-only" aria-live="off">
        {page?.items.map((it) => (it.kind === "text" ? it.text : "")).join("\n")}
      </div>
    </div>
  );
});

export default AnswerSheet;
