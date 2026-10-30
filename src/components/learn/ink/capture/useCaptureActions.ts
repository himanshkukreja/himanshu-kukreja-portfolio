"use client";

/**
 * "Clip" and "Snip" for a selection toolbar (TextSelectionMenu): clip the selected passage to the notebook, or
 * start a snip with the box around the selection. Signed out, both open sign-in (the notebook is per learner).
 */
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { canCapture } from "./api";
import { clipPassage } from "./clip";
import { startSnip } from "./events";

type Options = {
  rootRef: React.RefObject<Element | null>;
  /** the range the toolbar was opened for (the live selection can collapse once a button takes focus) */
  getRange: () => Range | null;
  getText: () => string;
  title: string | (() => string);
  lessonKey: string | null;
  /** close the toolbar */
  onDone: () => void;
};

export type CaptureMenuProps = { onClip?: () => void; onSnip?: () => void };

export function useCaptureActions({ rootRef, getRange, getText, title, lessonKey, onDone }: Options) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();

  const gate = (): boolean => {
    if (canCapture(!!user)) return true;
    onDone();
    openAuthModal();
    return false;
  };

  const onClip = () => {
    if (!gate()) return;
    const root = rootRef.current;
    const range = getRange();
    const text = getText();
    onDone();
    if (!root || !range || !text) return;
    window.getSelection()?.removeAllRanges();
    void clipPassage({ root, range, text, title: typeof title === "function" ? title() : title, lessonKey });
  };

  const onSnip = () => {
    if (!gate()) return;
    const rect = getRange()?.getBoundingClientRect();
    onDone();
    const pad = 8;
    const box =
      rect && rect.width > 0 && rect.height > 0
        ? (() => {
            const x = Math.max(0, rect.left - pad);
            const y = Math.max(0, rect.top - pad);
            return { x, y, w: Math.min(window.innerWidth, rect.right + pad) - x, h: Math.min(window.innerHeight, rect.bottom + pad) - y };
          })()
        : undefined;
    startSnip({ box: box && box.w > 16 && box.h > 16 ? box : undefined, keyboard: true });
  };

  const menuProps: CaptureMenuProps = { onClip, onSnip };
  return menuProps;
}

/** the page title for a capture's source line: the article's h1, else the document title without the site suffix */
export function pageTitle(root?: Element | null): string {
  const h1 = (root?.closest("main") ?? document).querySelector("h1");
  const t = (h1?.textContent || document.title).replace(/\s+/g, " ").trim();
  return t.replace(/\s*[|·–—-]\s*(System Design Mastery|Himanshu Kukreja).*$/i, "").replace(/\.$/, "") || document.title;
}
