"use client";

/**
 * Annotate the lesson (mounted by LessonReader around the lesson's content): the learner's marks drawn over the
 * article, and annotate mode (the reading tools' Annotate button) with its toolbar. Loads the marks when the lesson
 * opens; the layer and the toolbar are only loaded when there are marks or the mode is turned on.
 *
 * The wrapper <div class="relative"> is the overlay's positioning box: the overlay covers the content column and
 * the free margins beside it, and scrolls with the article.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { annotDevStore } from "@/lib/learn/ink/annotateStore";
import type { InkTheme } from "@/lib/learn/ink/render";
import type { InkColor } from "@/lib/learn/ink/types";
import { canCapture } from "../capture/api";
import { captureToast, isTyping } from "../capture/events";
import { ANNOT_MARKER_SIZE, ANNOT_PEN_SIZES, registerAnnotateHost, setAnnotating, setShowMarks, useAnnotate } from "./mode";
import { PEN_FOUND, notePen, useInkInput } from "@/lib/learn/ink/inputMode";
import { useAnnotations } from "./useAnnotations";
import type { AnnotLayerHandle } from "./AnnotateLayer";
import type { AnnotTool } from "./engine";

const AnnotateLayer = dynamic(() => import("./AnnotateLayer"), { ssr: false });
const AnnotateToolbar = dynamic(() => import("./AnnotateToolbar"), { ssr: false });

const noop = () => () => {};
const coarse = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

type Props = {
  contentRef: React.RefObject<HTMLDivElement | null>;
  /** "<week>/<slug>" */
  lessonKey: string;
  title: string;
  children: React.ReactNode;
};

export default function AnnotateHost({ contentRef, lessonKey, title, children }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<AnnotLayerHandle>(null);
  const { on, show } = useAnnotate();
  const { user, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const dev = useSyncExternalStore(noop, annotDevStore, () => false);
  const signedIn = !!user || dev;
  const A = useAnnotations(lessonKey, signedIn, loading && !dev);
  const { resolvedTheme } = useTheme();
  const theme: InkTheme = resolvedTheme === "dark" ? "dark" : "light";

  const [tool, setTool] = useState<AnnotTool>("pen");
  const [penColor, setPenColor] = useState<InkColor>("signal");
  const [hlColor, setHlColor] = useState<InkColor>("ink");
  const [sizeIndex, setSizeIndex] = useState(1);
  const [detachedIds, setDetachedIds] = useState<string[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const { mode: input, penSeen } = useInkInput();
  const [touch, setTouch] = useState(false);

  useEffect(() => registerAnnotateHost(), []);
  useEffect(() => {
    // a device fact, read after mount so server and client markup match
    setTouch(coarse());
  }, []);

  const color = tool === "highlighter" ? hlColor : penColor;
  const onColor = useCallback((c: InkColor) => (tool === "highlighter" ? setHlColor(c) : setPenColor(c)), [tool]);
  const size = tool === "highlighter" ? ANNOT_MARKER_SIZE : ANNOT_PEN_SIZES[sizeIndex];

  // the first pen on this device switches it to Pen only (every ink surface shares the setting)
  const onPenSeen = useCallback(() => {
    if (notePen()) captureToast({ kind: "info", message: PEN_FOUND });
  }, []);
  const onFull = useCallback(() => captureToast({ kind: "info", message: "This lesson has as many marks as it can hold. Erase some to add more." }), []);
  const done = useCallback(() => setAnnotating(false), []);

  // keys while annotating: Esc done, ⌘Z / ⇧⌘Z, P / H / E
  const { undo, redo } = A;
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        if (document.querySelector("[role='dialog'][aria-modal='true'], figure.sd-mermaid[data-fullscreen]")) return;
        setAnnotating(false);
        return;
      }
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
      if (k === "p") setTool("pen");
      else if (k === "h") setTool("highlighter");
      else if (k === "e") setTool("eraser");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on, undo, redo]);

  const detached = useMemo(() => {
    const ids = new Set(detachedIds);
    return A.doc.marks.filter((m) => ids.has(m.id));
  }, [detachedIds, A.doc.marks]);

  const send = useCallback(async () => {
    if (!canCapture(!!user)) {
      openAuthModal();
      return;
    }
    const e = layerRef.current?.engine();
    if (!e) return;
    const passages = e.passages(8);
    if (!passages.length) {
      captureToast({ kind: "info", message: "Mark something on the lesson first: then send the marked passages to your notebook." });
      return;
    }
    setSending(`Sending ${passages.length} ${passages.length === 1 ? "passage" : "passages"}…`);
    try {
      const { sendPassages } = await import("./send");
      const r = await sendPassages({
        passages,
        root: e.contentRoot,
        origin: e.originNow(),
        overlayWidth: e.overlayWidth,
        theme,
        lessonKey,
        title,
        onProgress: (d, t) => setSending(`Sending ${Math.min(d + 1, t)} of ${t}…`),
      });
      captureToast({ kind: "snip", pageId: r.pageId, pageTitle: r.pageTitle, note: `${r.sent} marked ${r.sent === 1 ? "passage" : "passages"}` });
    } catch (err) {
      console.error("[annotate] send", err);
      captureToast({ kind: "error", message: "Couldn't send your marks to the notebook. Try again in a moment." });
    } finally {
      setSending(null);
    }
  }, [user, openAuthModal, theme, lessonKey, title]);

  const needLayer = A.ready && (A.doc.marks.length > 0 || on);
  const hint = !on
    ? null
    : input === "scroll"
      ? "Scroll: nothing writes"
      : input === "touch"
        ? touch
          ? "One finger or stylus writes · two fingers scroll"
          : "Draw with the mouse"
        : penSeen
          ? "Pen writes · fingers scroll"
          : touch
            ? "Write with your pen · fingers scroll"
            : "Draw with the mouse";

  return (
    <div ref={wrapRef} className="relative" data-annot-wrap="">
      {children}
      {needLayer && (
        <AnnotateLayer
          ref={layerRef}
          wrapRef={wrapRef}
          contentRef={contentRef}
          marks={A.doc.marks}
          on={on}
          show={show}
          tool={tool}
          color={color}
          size={size}
          theme={theme}
          full={A.full}
          onAdd={A.add}
          onErase={A.remove}
          onFull={onFull}
          onDetached={setDetachedIds}
          onPenSeen={onPenSeen}
          input={input}
        />
      )}
      {on && (
        <AnnotateToolbar
          tool={tool}
          onTool={setTool}
          color={color}
          onColor={onColor}
          sizeIndex={sizeIndex}
          onSize={setSizeIndex}
          theme={theme}
          canUndo={A.canUndo}
          canRedo={A.canRedo}
          onUndo={A.undo}
          onRedo={A.redo}
          show={show}
          onShow={setShowMarks}
          onSend={() => void send()}
          sending={sending}
          detached={detached}
          onDeleteDetached={A.remove}
          onDone={done}
          saveState={A.state}
          where={A.where}
          note={A.note}
          signedIn={signedIn}
          onSignIn={openAuthModal}
          hint={hint}
        />
      )}
    </div>
  );
}
