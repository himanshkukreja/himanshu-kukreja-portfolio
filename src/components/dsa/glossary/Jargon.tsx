"use client";

/**
 * Jargon tooltips (the beginner pass, owner 9 Nov 2026): the first use of each glossary term (src/lib/dsa/glossary.ts)
 * in every section of a lesson or problem statement becomes a small button; tap, click, Enter or hover shows its
 * one-line definition in a popover. Escape or a click elsewhere closes it and focus goes back to the word.
 *
 * The text itself never changes (the button holds the very same word), so highlights, Listen and search offsets stay
 * valid. Code, headings, links, buttons, captions and the React widgets' hosts are left alone. The reader can re-inject
 * the lesson HTML (highlights): a MutationObserver wraps the fresh copy again.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY, GLOSSARY_BY_ID, type GlossaryEntry } from "@/lib/dsa/glossary";
import { track } from "@/lib/track";

const SKIP =
  "pre, code, kbd, a, button, h1, h2, h3, h4, h5, h6, figcaption, summary, label, input, textarea, select, script, style, svg, table thead, [data-sd-chrome], [data-dsa-stage], [data-no-jargon], .dsa-term, .katex, [contenteditable]";
const SECTION = 'section[data-sd="stage"], section[data-jargon-section], section';

type Hit = { entry: GlossaryEntry; at: number; len: number };

function firstHit(text: string, used: Set<string>): Hit | null {
  let best: Hit | null = null;
  for (const entry of GLOSSARY) {
    if (used.has(entry.id)) continue;
    const m = entry.match.exec(text);
    if (!m || !m[0]) continue;
    if (!best || m.index < best.at) best = { entry, at: m.index, len: m[0].length };
  }
  return best;
}

/** Wrap the first use of each term per section under `root`. Returns how many buttons it added. */
function wrapTerms(root: HTMLElement): number {
  const usedBySection = new Map<Element, Set<string>>();
  const usedFor = (node: Node): Set<string> => {
    const sec = (node.parentElement?.closest(SECTION) as Element | null) || root;
    const key = root.contains(sec) ? sec : root;
    let set = usedBySection.get(key);
    if (!set) {
      set = new Set(Array.from(key.querySelectorAll<HTMLElement>(".dsa-term")).map((b) => b.dataset.term || ""));
      usedBySection.set(key, set);
    }
    return set;
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const p = n.parentElement;
      if (!p || !n.nodeValue || n.nodeValue.trim().length < 2) return NodeFilter.FILTER_REJECT;
      if (p.closest(SKIP)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  let added = 0;
  for (const node of nodes) {
    let cur: Text | null = node;
    while (cur && cur.nodeValue) {
      const used = usedFor(cur);
      const hit = firstHit(cur.nodeValue, used);
      if (!hit) break;
      const word = cur.splitText(hit.at);
      const rest = word.splitText(hit.len);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dsa-term";
      btn.dataset.term = hit.entry.id;
      btn.setAttribute("aria-haspopup", "dialog");
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = word.nodeValue;
      word.replaceWith(btn);
      used.add(hit.entry.id);
      added++;
      cur = rest;
    }
  }
  return added;
}

type Open = { id: string; el: HTMLElement; how: "click" | "hover" };

export default function Jargon({ rootRef, deps = "" }: { rootRef: React.RefObject<HTMLElement | null>; deps?: string }) {
  const [open, setOpen] = useState<Open | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const pop = useRef<HTMLDivElement>(null);
  const hoverT = useRef(0);

  // wrap now and whenever the content is replaced
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    const mo = new MutationObserver((records) => {
      if (!records.some((r) => Array.from(r.addedNodes).some((n) => !(n instanceof HTMLElement && n.classList.contains("dsa-term"))))) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(run);
    });
    function run() {
      mo.disconnect();
      wrapTerms(root!);
      mo.observe(root!, { childList: true, subtree: true });
    }
    run();
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [rootRef, deps]);

  const close = useCallback((refocus: boolean) => {
    setOpen((o) => {
      if (o) {
        o.el.setAttribute("aria-expanded", "false");
        o.el.removeAttribute("aria-controls");
        if (refocus) o.el.focus();
      }
      return null;
    });
  }, []);

  const show = useCallback((el: HTMLElement, how: Open["how"]) => {
    const id = el.dataset.term || "";
    if (!GLOSSARY_BY_ID[id]) return;
    setOpen((o) => {
      if (o && o.el !== el) o.el.setAttribute("aria-expanded", "false");
      el.setAttribute("aria-expanded", "true");
      el.setAttribute("aria-controls", "dsa-term-pop");
      return { id, el, how };
    });
    if (how === "click") track("dsa_jargon", { term: id });
  }, []);

  // clicks and hovers on the words (delegated: the buttons are plain DOM inside the lesson HTML)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const b = (e.target as HTMLElement | null)?.closest<HTMLElement>(".dsa-term");
      if (!b || !root.contains(b)) return;
      e.preventDefault();
      if (open?.el === b && open.how === "click") close(false);
      else show(b, "click");
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const b = (e.target as HTMLElement | null)?.closest<HTMLElement>(".dsa-term");
      if (!b || !root.contains(b)) return;
      window.clearTimeout(hoverT.current);
      hoverT.current = window.setTimeout(() => show(b, "hover"), 180);
    };
    const onOut = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const b = (e.target as HTMLElement | null)?.closest<HTMLElement>(".dsa-term");
      if (!b) return;
      window.clearTimeout(hoverT.current);
      hoverT.current = window.setTimeout(() => {
        if (!pop.current?.matches(":hover")) setOpen((o) => (o && o.how === "hover" ? (o.el.setAttribute("aria-expanded", "false"), null) : o));
      }, 200);
    };
    root.addEventListener("click", onClick);
    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerout", onOut);
    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerout", onOut);
      window.clearTimeout(hoverT.current);
    };
  }, [rootRef, open, show, close]);

  // place it under the word (above when there is no room), kept on screen; Escape, a click outside or the word
  // leaving the page closes it
  useEffect(() => {
    if (!open) return;
    const place = () => {
      if (!open.el.isConnected) return close(false);
      const r = open.el.getBoundingClientRect();
      const w = Math.min(300, window.innerWidth - 24);
      const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12));
      const h = pop.current?.offsetHeight || 90;
      const above = r.bottom + 8 + h > window.innerHeight && r.top - 8 - h > 0;
      setPos({ left, top: above ? r.top - 8 - h : r.bottom + 8, above });
    };
    place();
    const raf = requestAnimationFrame(place);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(true);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (pop.current?.contains(t) || open.el.contains(t)) return;
      close(false);
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open, close]);

  if (!open || typeof document === "undefined") return null;
  const g = GLOSSARY_BY_ID[open.id];
  return createPortal(
    <div
      ref={pop}
      id="dsa-term-pop"
      role="dialog"
      aria-labelledby="dsa-term-pop-h"
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse" && open.how === "hover") close(false);
      }}
      className="dsa-theme fixed z-[80] flex w-[min(300px,calc(100vw-24px))] flex-col gap-1 border border-line-strong bg-surface px-3.5 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      <span id="dsa-term-pop-h" className="font-mono text-[11px] uppercase tracking-label text-signal-text">
        {g.term}
      </span>
      <span className="text-[14px] leading-snug text-fg">{g.def}</span>
    </div>,
    document.body,
  );
}
