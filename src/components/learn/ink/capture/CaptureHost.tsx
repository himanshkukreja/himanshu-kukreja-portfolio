"use client";

/**
 * Capture on a reading page: the snip overlay (opened by the Snip button, the selection toolbar, or S when not
 * typing) and the "Clipped to … · open" toast. Mounted by each selection layer (lessons, war stories, case files)
 * with what a capture needs to know about the page; when several are mounted, the first one does the work.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import CaptureToast from "./CaptureToast";
import SnipOverlay from "./SnipOverlay";
import { activeHost, CAPTURE_TOAST, isTyping, registerHost, SNIP_START, subscribeHosts, type Box, type CaptureToastDetail, type SnipStart } from "./events";
import { snipHref, snipToNotebook } from "./snip";
import { canCapture } from "./api";
import { pageTitle } from "./useCaptureActions";

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
  const [busy, setBusy] = useState(false);
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
      begin({ keyboard: true });
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

  const confirm = async (box: Box) => {
    setBusy(true);
    // look up the passage under the box with the overlay out of the way of hit-testing
    const el = overlayRef.current;
    if (el) el.style.pointerEvents = "none";
    const href = snipHref(rootRef.current, box);
    if (el) el.style.pointerEvents = "";
    const { title: t, lessonKey: k } = page.current;
    await snipToNotebook({ box, href, title: t || pageTitle(rootRef.current), lessonKey: k });
    setBusy(false);
    setSnip(null);
  };

  if (!active) return null;
  return (
    <>
      {snip && <SnipOverlay rootRef={overlayRef} initial={snip.box} keyboard={snip.keyboard} busy={busy} onConfirm={(b) => void confirm(b)} onCancel={() => setSnip(null)} />}
      {toast && <CaptureToast key={JSON.stringify(toast)} toast={toast} onClose={() => setToast(null)} />}
    </>
  );
}
