"use client";

/**
 * Case files: select a word, line or paragraph → "Ask Claude" / "Ask ChatGPT" / "Copy prompt",
 * with the case title, the checkpoint heading and the surrounding paragraphs as context.
 * Same triggers as the lesson reader: mouse up, a touch long-press (toolbar docked to the bottom,
 * clear of the native selection UI), Shift + arrows, or Shift+F10.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import TextSelectionMenu from "@/components/TextSelectionMenu";
import Toast from "@/components/Toast";
import { askAi, CLIENT_LABEL, copyAskPrompt, headingBefore, pageUrl, surroundingText, type AskClient, type AskContext } from "@/lib/learn/askAi";

type Menu = { x: number; y: number; placement: "above" | "below" | "sheet"; autoFocus: boolean };

function inChrome(n: Node | null) {
  const el = n && (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement);
  return !!el?.closest("[data-sd-chrome]");
}

export default function StorySelectionAsk({ rootRef, title }: { rootRef: React.RefObject<HTMLDivElement | null>; title: string }) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [text, setText] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const rangeRef = useRef<Range | null>(null);

  const capture = useCallback((): Range | null => {
    const root = rootRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;
    if (inChrome(range.startContainer) && inChrome(range.endContainer)) return null;
    const value = sel.toString().trim();
    if (!value) return null;
    rangeRef.current = range.cloneRange();
    setText(value);
    return range;
  }, [rootRef]);

  const open = useCallback((range: Range, how: "mouse" | "touch" | "keyboard") => {
    if (how === "touch") {
      setMenu({ x: 0, y: 0, placement: "sheet", autoFocus: false });
      return;
    }
    const rects = range.getClientRects();
    const first = rects[0] || range.getBoundingClientRect();
    const last = rects[rects.length - 1] || first;
    const W = Math.min(window.innerWidth - 16, 400);
    const H = 54;
    const below = first.top - H - 10 < 120;
    const anchor = below ? last : first;
    const x = Math.max(8, Math.min(anchor.left - 24, window.innerWidth - W - 8));
    const y = below ? Math.min(anchor.bottom + 12, window.innerHeight - H - 8) : first.top - H - 10;
    setMenu({ x, y, placement: below ? "below" : "above", autoFocus: how === "keyboard" });
  }, []);

  useEffect(() => {
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
  }, [capture, open]);

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
        setMenu((m) => (m ? { ...m, y: m.placement === "below" ? rect.bottom + 12 : rect.top - 64 } : m));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [menu]);

  const context = (): AskContext | null => {
    const root = rootRef.current;
    const range = rangeRef.current;
    if (!root || !range) return null;
    return {
      kind: "story",
      title,
      section: headingBefore(range, root, "h2"),
      heading: headingBefore(range, root, "h2, h3, h4"),
      surrounding: surroundingText(range, root),
      url: pageUrl(),
    };
  };

  const onAsk = (client: AskClient) => {
    const ctx = context();
    if (!text || !ctx) return;
    const mode = askAi(client, text, ctx);
    setMenu(null);
    if (mode === "clipboard") setToast({ message: `Long selection: the full prompt is on your clipboard. Paste it into ${CLIENT_LABEL[client]}.`, type: "info" });
  };

  const onCopyPrompt = async () => {
    const ctx = context();
    if (!text || !ctx) return;
    setMenu(null);
    const ok = await copyAskPrompt(text, ctx);
    setToast(ok ? { message: "Prompt copied. Paste it into any AI chat.", type: "success" } : { message: "Couldn't copy to the clipboard.", type: "error" });
  };

  return (
    <>
      {menu && text && (
        <TextSelectionMenu
          selectedText={text}
          position={{ x: menu.x, y: menu.y }}
          placement={menu.placement}
          autoFocus={menu.autoFocus}
          onAsk={onAsk}
          onCopyPrompt={onCopyPrompt}
          onClose={() => setMenu(null)}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
