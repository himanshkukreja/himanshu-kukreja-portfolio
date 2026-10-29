"use client";

/**
 * An article body with the course tutor on its selections, for pages without a notebook toolbar of their own
 * (war stories): select a passage (3 words to ~1,200 characters) → "Explain this" / "Ask the tutor", or
 * "Sign in to ask the tutor" when signed out. Same triggers and toolbar as the lesson reader: mouse up, a
 * touch long-press (docked to the bottom, clear of the native selection menu), Shift + arrows, Shift+F10,
 * and Alt+A asks straight away. Copy, find-in-page and Listen are untouched (the wrapper adds no styling).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import TextSelectionMenu from "@/components/TextSelectionMenu";
import { useTutorActions } from "./useTutorActions";
import { tutorEligible } from "@/lib/learn/tutorSelection";

type Menu = {
  x: number;
  y: number;
  placement: "above" | "below" | "sheet";
  autoFocus: boolean;
};

export default function TutorSelectionArea({ children, className }: { children: ReactNode; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<Range | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [text, setText] = useState("");
  const closeMenu = useCallback(() => setMenu(null), []);
  const tutor = useTutorActions(rootRef, {
    getRange: () => rangeRef.current,
    onDone: closeMenu,
  });
  const on = tutor.state !== "off";

  const capture = useCallback((): Range | null => {
    const root = rootRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;
    const value = sel.toString().trim();
    if (!tutorEligible(value)) return null;
    rangeRef.current = range.cloneRange();
    setText(value);
    return range;
  }, []);

  const open = useCallback((range: Range, how: "mouse" | "touch" | "keyboard") => {
    if (how === "touch") {
      setMenu({ x: 0, y: 0, placement: "sheet", autoFocus: false });
      return;
    }
    const rects = range.getClientRects();
    const first = rects[0] || range.getBoundingClientRect();
    const last = rects[rects.length - 1] || first;
    const W = Math.min(window.innerWidth - 16, 360);
    const H = 54;
    const below = first.top - H - 10 < 64;
    const anchor = below ? last : first;
    const x = Math.max(8, Math.min(anchor.left - 24, window.innerWidth - W - 8));
    const y = below ? Math.min(anchor.bottom + 12, window.innerHeight - H - 8) : first.top - H - 10;
    setMenu({
      x,
      y,
      placement: below ? "below" : "above",
      autoFocus: how === "keyboard",
    });
  }, []);

  useEffect(() => {
    if (!on) return;
    let lastPointer = "mouse";
    let touchTimer: number | undefined;
    let keyTimer: number | undefined;
    const onPointerDown = (e: PointerEvent) => {
      lastPointer = e.pointerType || "mouse";
    };
    const onMouseUp = (e: MouseEvent) => {
      if (lastPointer === "touch") return;
      if ((e.target as Element | null)?.closest?.('[role="toolbar"][data-sd-chrome]')) return;
      window.setTimeout(() => {
        const r = capture();
        if (r) open(r, "mouse");
      }, 0);
    };
    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        window.clearTimeout(touchTimer);
        return;
      }
      if (lastPointer !== "touch") return;
      window.clearTimeout(touchTimer);
      touchTimer = window.setTimeout(() => {
        const r = capture();
        if (r) open(r, "touch");
      }, 450);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F10" && e.shiftKey) {
        const r = capture();
        if (r) {
          e.preventDefault();
          open(r, "keyboard");
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Shift" && !(e.shiftKey && e.key.startsWith("Arrow"))) return;
      window.clearTimeout(keyTimer);
      keyTimer = window.setTimeout(() => {
        const r = capture();
        if (r) open(r, "keyboard");
      }, 250);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      window.clearTimeout(touchTimer);
      window.clearTimeout(keyTimer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, [on, capture, open]);

  // follow the selection while scrolling; drop the toolbar once it is off screen
  useEffect(() => {
    if (!menu || menu.placement === "sheet") return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = rangeRef.current?.getBoundingClientRect();
        if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) {
          setMenu(null);
          return;
        }
        setMenu((m) =>
          m
            ? {
                ...m,
                y: m.placement === "below" ? rect.bottom + 12 : rect.top - 64,
              }
            : m,
        );
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [menu]);

  const actions = menu && text ? tutor.menuProps(text) : {};
  return (
    <>
      <div ref={rootRef} className={className}>
        {children}
      </div>
      {menu && (actions.onExplain || actions.onTutorSignIn) && (
        <TextSelectionMenu selectedText={text} position={{ x: menu.x, y: menu.y }} placement={menu.placement} autoFocus={menu.autoFocus} {...actions} onClose={closeMenu} />
      )}
    </>
  );
}
