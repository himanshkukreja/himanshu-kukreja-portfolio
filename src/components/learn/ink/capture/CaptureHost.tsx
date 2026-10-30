"use client";

/**
 * Capture on a reading page: the snip overlay (opened by the Snip button, the selection toolbar, or S when not
 * typing) and the "Clipped to … · open" toast. Mounted by each selection layer (lessons, war stories, case files)
 * and the lecture player, with what a capture needs to know about the page; when several are mounted, the first one
 * does the work.
 *
 * "Explain this" (explain/ExplainPanel): from the overlay (Explain, or E) the snip is taken (its image, the page text
 * inside the box, where it was taken) and the panel asks the AI; it can save the snip with its explanation. A snip
 * saved with Save stays here until the next one, so its toast offers "explain" too.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import CaptureToast from "./CaptureToast";
import SnipOverlay from "./SnipOverlay";
import { activeHost, CAPTURE_TOAST, isTyping, registerHost, SNIP_START, startSnip, subscribeHosts, type Box, type CaptureToastDetail, type SnipStart } from "./events";
import { saveShot, snipHref, takeSnip, type SavedSnip, type SnipShot } from "./snip";
import { canCapture, devInk } from "./api";
import { pageTitle } from "./useCaptureActions";
import { warmCapture } from "./region";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";

// the panel (and the AI text renderer) load when a snip is first explained
const ExplainPanel = dynamic(() => import("../explain/ExplainPanel"), { ssr: false });

type Props = {
  /** the content root: deep links are built against it */
  rootRef: React.RefObject<Element | null>;
  /** the page's title for the source line ("" → the page's h1) */
  title: string;
  lessonKey: string | null;
};

export default function CaptureHost({ rootRef, title, lessonKey }: Props) {
  const [id] = useState(() => Symbol("capture-host"));
  useEffect(() => registerHost(id), [id]);
  const active = useSyncExternalStore(subscribeHosts, () => activeHost() === id, () => false);
  const { user, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [snip, setSnip] = useState<SnipStart | null>(null);
  const [busy, setBusy] = useState<false | "save" | "explain">(false);
  const [explaining, setExplaining] = useState<{ shot: SnipShot; saved: SavedSnip | null; key: number } | null>(null);
  // the last saved snip, for "explain" on its toast
  const [last, setLast] = useState<{ shot: SnipShot; saved: SavedSnip } | null>(null);
  const ai = useAiStatus();
  // Explain needs the AI on for this learner (the notebook's dev stand-in may try it in `next dev`)
  const canExplain = !!ai?.features["snip-explain"] || devInk();
  const [toast, setToast] = useState<CaptureToastDetail | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const page = useRef({ title, lessonKey, signedIn: !!user, loading });
  useEffect(() => {
    page.current = { title, lessonKey, signedIn: !!user, loading };
  });

  const begin = useCallback(
    (opts: SnipStart) => {
      if (page.current.loading && !canCapture(false)) return;
      if (!canCapture(page.current.signedIn)) {
        openAuthModal();
        return;
      }
      window.getSelection()?.removeAllRanges();
      warmCapture();
      setSnip(opts);
    },
    [openAuthModal],
  );

  useEffect(() => {
    if (!active) return;
    const onStart = (e: Event) => begin((e as CustomEvent<SnipStart>).detail ?? {});
    const onToast = (e: Event) => setToast((e as CustomEvent<CaptureToastDetail>).detail);
    // S: snip, when not typing and the selection toolbar (which has its own S) isn't open. Dialogs don't stop it:
    // a short playing in its dialog is worth a snip
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "s" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.repeat || e.defaultPrevented) return;
      if (isTyping(e.target)) return;
      if (document.querySelector('[role="toolbar"][data-sd-chrome], [data-hk-snip-ui]')) return;
      e.preventDefault();
      // through the event, like the Snip buttons, so the page hears it too (a lecture pauses on it)
      startSnip({ keyboard: true });
    };
    window.addEventListener(SNIP_START, onStart);
    window.addEventListener(CAPTURE_TOAST, onToast);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(SNIP_START, onStart);
      window.removeEventListener(CAPTURE_TOAST, onToast);
      document.removeEventListener("keydown", onKey);
    };
  }, [active, begin]);

  /** the snip under `box`: its image, the text inside it and where it was taken (null: failed, toasted) */
  const take = async (box: Box) => {
    // look up the passage under the box with the overlay out of the way of hit-testing
    const el = overlayRef.current;
    if (el) el.style.pointerEvents = "none";
    const href = lectureHref() ?? snipHref(rootRef.current, box);
    if (el) el.style.pointerEvents = "";
    const { title: t, lessonKey: k } = page.current;
    return takeSnip({ box, href, title: t || pageTitle(rootRef.current), lessonKey: k }, { root: rootRef.current });
  };

  const confirm = async (box: Box) => {
    setBusy("save");
    const shot = await take(box);
    if (shot) {
      const saved = await saveShot(shot, { explain: canExplain });
      setLast(saved ? { shot, saved } : null);
    }
    setBusy(false);
    setSnip(null);
  };

  const explain = async (box: Box) => {
    setBusy("explain");
    const shot = await take(box);
    setBusy(false);
    setSnip(null);
    if (shot) setExplaining({ shot, saved: null, key: Date.now() });
  };

  const explainLast = () => {
    const l = last;
    if (!l) return;
    setToast(null);
    setExplaining({ shot: l.shot, saved: l.saved, key: Date.now() });
  };

  if (!active) return null;
  return (
    <>
      {snip && (
        <SnipOverlay
          rootRef={overlayRef}
          initial={snip.box}
          keyboard={snip.keyboard}
          busy={busy}
          onConfirm={(b) => void confirm(b)}
          onExplain={canExplain ? (b) => void explain(b) : undefined}
          onCancel={() => setSnip(null)}
        />
      )}
      {toast && <CaptureToast key={JSON.stringify(toast)} toast={toast} onClose={() => setToast(null)} onExplain={toast.kind === "snip" && toast.explain && last?.saved.pageId === toast.pageId ? explainLast : undefined} />}
      {explaining && (
        <ExplainPanel
          key={explaining.key}
          shot={explaining.shot}
          saved={explaining.saved}
          onSaved={(saved) => setLast({ shot: explaining.shot, saved })}
          onClose={() => setExplaining(null)}
        />
      )}
    </>
  );
}

/** On a lecture, the link back is the lecture at this moment (LecturePlayer marks its stage with it). */
function lectureHref(): string | null {
  const el = document.querySelector<HTMLElement>("[data-hk-lecture]");
  const id = el?.dataset.hkLecture;
  if (!id || !window.location.pathname.startsWith("/learn/lectures/")) return null;
  return `${window.location.origin}/learn/lectures/${id}?t=${Math.floor(Number(el.dataset.hkAt) || 0)}`;
}
