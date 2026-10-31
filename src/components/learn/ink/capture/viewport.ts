"use client";

/**
 * The part of the screen the learner can see while typing: on a phone or a tablet the on-screen keyboard covers the
 * bottom of the page without (iOS, Chrome 108+) or with (older Android) resizing the layout viewport. The snip bar and
 * the Explain panel keep their text field above it.
 */
import { useEffect, useState } from "react";

/** The visible area's top and bottom edges in layout-viewport (position: fixed) pixels, while `on`; else null. */
export function useVisibleArea(on: boolean): { top: number; bottom: number } | null {
  const [area, setArea] = useState<{ top: number; bottom: number } | null>(null);
  useEffect(() => {
    if (!on) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the field loses focus
      setArea(null);
      return;
    }
    const vv = window.visualViewport;
    const read = () => {
      const top = vv ? Math.round(vv.offsetTop) : 0;
      const bottom = vv ? Math.round(vv.offsetTop + vv.height) : window.innerHeight;
      setArea((a) => (a && a.top === top && a.bottom === bottom ? a : { top, bottom }));
    };
    read();
    vv?.addEventListener("resize", read);
    vv?.addEventListener("scroll", read);
    window.addEventListener("resize", read);
    return () => {
      vv?.removeEventListener("resize", read);
      vv?.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, [on]);
  return area;
}

/**
 * Keep the page where it is while a text field in a fixed overlay has focus: the browser may scroll the document to
 * "reveal" the field when the keyboard opens, which would slide the page under a snip box. Returns the handlers for the
 * field (focus pins the scroll position; blur releases it once the keyboard has closed).
 */
export function pinScrollWhileTyping(onChange?: (typing: boolean) => void) {
  let pinned: { x: number; y: number } | null = null;
  let release = 0;
  const hold = () => {
    if (pinned && (window.scrollX !== pinned.x || window.scrollY !== pinned.y)) window.scrollTo(pinned.x, pinned.y);
  };
  return {
    onFocus: () => {
      window.clearTimeout(release);
      if (!pinned) {
        pinned = { x: window.scrollX, y: window.scrollY };
        window.addEventListener("scroll", hold, { passive: true });
      }
      onChange?.(true);
    },
    onBlur: () => {
      onChange?.(false);
      // the keyboard closes (and the viewport settles) after the blur
      window.clearTimeout(release);
      release = window.setTimeout(() => {
        hold();
        window.removeEventListener("scroll", hold);
        pinned = null;
      }, 700);
    },
    /** unmounting: let the page scroll again */
    dispose: () => {
      window.clearTimeout(release);
      window.removeEventListener("scroll", hold);
      pinned = null;
    },
  };
}
