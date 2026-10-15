"use client";

/**
 * Lands deep links in the lesson and case-file readers (see src/lib/learn/deepLink.ts):
 *
 * - `?at=<locator>`: once the content is in the DOM (and again whenever it is re-rendered, e.g.
 *   highlights re-injecting the HTML), finds the shared passage, opens anything folded around it,
 *   scrolls it under the sticky chrome (header / stage bar / story bar, with the auto-hiding header
 *   accounted for) and flashes a temporary highlight. Re-checks the landing while late layout
 *   (fonts, diagrams, images) settles, until the reader scrolls or types. The `at` param is then
 *   dropped from the address bar, so a reload restores the reader's own position.
 * - `#section`: re-checks the browser's own jump after hydration and fixes it if it ended under
 *   the chrome.
 * - heading `#` anchors: copy the full section URL, put `#id` in the address bar, jump, toast.
 *
 * A programmatic jump earns no reading time: the reading probe (lib/learn/engagedClock) skips any
 * second in which the page moved more than a viewport, and the one after it.
 */
import { useCallback, useEffect, useState } from "react";
import Toast from "@/components/Toast";
import {
  DEEPLINK_CSS,
  chromeBottom,
  firstRect,
  flashPassage,
  readLocator,
  resolveLocator,
  scrollToElement,
  scrollToViewportTop,
  sectionLink,
  shareLink,
  uncover,
  urlWithoutLocator,
  wellPlaced,
  type Flash,
} from "@/lib/learn/deepLink";

type Props = {
  /** the reader's content element; the passage index uses its [data-sd-content] child when present */
  rootRef: React.RefObject<HTMLElement | null>;
};

/** hashes other parts of the reader handle (bookmarks, notes, comments, resume) */
const OTHER_HASH = /^(bookmark|note|scroll|comment)-|^:~:/;
const USER_INPUT = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

function cssId(id: string) {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
}

export default function DeepLinkResolver({ rootRef }: Props) {
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  const contentRoot = useCallback((): HTMLElement | null => {
    const r = rootRef.current;
    return r?.querySelector<HTMLElement>("[data-sd-content]") ?? r;
  }, [rootRef]);

  /* ---------------- ?at= passage links */
  useEffect(() => {
    const loc = readLocator();
    const host = rootRef.current;
    if (!loc || !host) return;
    let cancelled = false;
    let landed = false;
    let userMoved = false;
    let flash: Flash | null = null;
    let range: Range | null = null;
    const timers: number[] = [];

    /** the passage, re-found if the content was re-rendered under it */
    const current = (): Range | null => {
      const root = contentRoot();
      if (!root) return null;
      if (range && !range.collapsed && range.startContainer.isConnected && root.contains(range.startContainer)) return range;
      range = resolveLocator(root, loc).range;
      return range;
    };
    const correct = () => {
      if (cancelled || userMoved) return;
      const r = current();
      const rect = r && firstRect(r);
      if (rect && !wellPlaced(rect.top)) scrollToViewportTop(rect.top);
    };
    const dropParam = () => window.history.replaceState(window.history.state, "", urlWithoutLocator());
    const land = (): boolean => {
      const root = contentRoot();
      if (!root || landed) return landed;
      const found = resolveLocator(root, loc).range;
      if (!found) return false;
      range = found;
      uncover(found);
      landed = true;
      const rect = firstRect(found);
      if (rect) scrollToViewportTop(rect.top);
      flash = flashPassage(current);
      // late layout (fonts, diagrams, images, the header sliding away) can move it: re-check
      for (const ms of [200, 550, 1100, 2000, 3200]) timers.push(window.setTimeout(correct, ms));
      dropParam();
      return true;
    };

    const onUser = () => {
      if (landed) userMoved = true;
    };
    USER_INPUT.forEach((ev) => window.addEventListener(ev, onUser, { passive: true }));

    let raf = 0;
    const mo = new MutationObserver(() => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        if (cancelled) return;
        if (!landed) land();
        else flash?.repaint();
      });
    });
    mo.observe(host, { childList: true, subtree: true, characterData: true });

    // first try once the other effects (highlights, enhancer) have run
    let r1 = window.requestAnimationFrame(() => {
      r1 = window.requestAnimationFrame(() => {
        if (!cancelled) land();
      });
    });
    // content never matched (edited away): fall back to its section, then stop looking
    timers.push(
      window.setTimeout(() => {
        if (cancelled || landed) return;
        const root = contentRoot();
        const scope = root ? resolveLocator(root, loc).scope : null;
        if (scope && !userMoved) scrollToElement(scope, "instant");
        landed = true;
        dropParam();
      }, 6000)
    );

    return () => {
      cancelled = true;
      mo.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
      window.cancelAnimationFrame(r1);
      timers.forEach((t) => window.clearTimeout(t));
      USER_INPUT.forEach((ev) => window.removeEventListener(ev, onUser));
      flash?.stop();
    };
  }, [rootRef, contentRoot]);

  /* ---------------- #section arrivals: make sure the heading is not under the sticky chrome */
  useEffect(() => {
    if (readLocator()) return;
    const raw = window.location.hash.slice(1);
    if (!raw || OTHER_HASH.test(raw)) return;
    let id = raw;
    try {
      id = decodeURIComponent(raw);
    } catch {
      return;
    }
    let moved = false;
    const onUser = () => {
      moved = true;
    };
    const check = () => {
      if (moved) return;
      const el = contentRoot()?.querySelector<HTMLElement>(`[id="${cssId(id)}"]`);
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const chrome = chromeBottom();
      if (top < chrome - 1 || top > chrome + (window.innerHeight - chrome) * 0.35) scrollToElement(el, "instant");
    };
    const timers = [80, 450, 1200, 2500].map((ms) => window.setTimeout(check, ms));
    USER_INPUT.forEach((ev) => window.addEventListener(ev, onUser, { passive: true }));
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      USER_INPUT.forEach((ev) => window.removeEventListener(ev, onUser));
    };
  }, [contentRoot]);

  /* ---------------- heading # anchors: copy the section link */
  useEffect(() => {
    const host = rootRef.current;
    if (!host) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a.sd-anchor");
      if (!a || !host.contains(a)) return;
      const href = a.getAttribute("href") || "";
      if (!href.startsWith("#") || href.length < 2) return;
      let id = href.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        return;
      }
      e.preventDefault();
      // clipboard first, inside the click (it needs the user gesture)
      void shareLink(sectionLink(id), { kind: "section", channel: "copy" }).then((res) =>
        setToast(res === "copied" ? { message: "Link to this section copied", type: "success" } : { message: "Couldn't copy the link.", type: "error" })
      );
      const search = new URLSearchParams(window.location.search);
      search.delete("at");
      const q = search.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${q ? `?${q}` : ""}#${encodeURIComponent(id)}`);
      const el = document.getElementById(id);
      if (el) scrollToElement(el);
    };
    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, [rootRef]);

  return (
    <>
      <style>{DEEPLINK_CSS}</style>
      {toast && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}
    </>
  );
}
