"use client";

/**
 * Hover definitions: wires the concept term marks the renderer put in the lesson HTML
 * (<span class="sd-term" data-term="…">, src/lib/course/terms.ts) and opens a small card with the
 * term, its one-line definition, where it is taught and related terms.
 *
 * - desktop: hover (with a short intent delay) or click; phones: tap; keyboard: Tab to a term,
 *   Enter / Space opens the card and moves focus into it, Esc closes and returns focus;
 * - the card data ships inside the HTML (<script type="application/json" data-sd-terms>), so a page
 *   saved for offline reading keeps its cards; this component lives in the CourseEnhancer chunk,
 *   which offline saving caches (src/lib/offline/lazy.ts, warm.ts);
 * - reader setting: "Hide term cards" (here, the reading dock or the concept map) stores
 *   hk.terms.v1 = "off"; the marks then render as plain text and leave the tab order.
 *
 * Like CourseEnhancer it only touches attributes, never the text, and re-applies itself whenever
 * the content HTML is replaced (highlights re-inject it).
 */
import "./terms.css";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { track } from "@/lib/track";
import type { TermCard } from "@/lib/concepts/catalogue";
import { setTermsEnabled, subscribeTerms, termsEnabled } from "@/lib/concepts/dom";

type Open = { card: TermCard; el: HTMLElement; here: boolean; pinned: boolean; via: "hover" | "tap" | "click" | "key" };

const HOVER_OPEN_MS = 280;
const HOVER_CLOSE_MS = 220;

function readCards(root: HTMLElement): Map<string, TermCard> {
  const out = new Map<string, TermCard>();
  root.querySelectorAll<HTMLScriptElement>("script[data-sd-terms]").forEach((s) => {
    try {
      const data = JSON.parse(s.textContent || "{}") as { cards?: TermCard[] };
      (data.cards || []).forEach((c) => c && c.id && out.set(c.id, c));
    } catch {
      // a broken payload just means no cards
    }
  });
  return out;
}

export default function TermCards({ lessonKey }: { lessonKey?: string }) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const cardsRef = useRef<Map<string, TermCard>>(new Map());
  const openRef = useRef<Open | null>(null);
  const [open, setOpenState] = useState<Open | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; above: boolean } | null>(null);
  const [toast, setToast] = useState(false);
  const timers = useRef<{ open?: number; close?: number }>({});

  const setOpen = useCallback((o: Open | null) => {
    const prev = openRef.current;
    if (prev && prev.el !== o?.el) prev.el.setAttribute("aria-expanded", "false");
    if (o) o.el.setAttribute("aria-expanded", "true");
    openRef.current = o;
    setOpenState(o);
    if (!o) setPos(null);
  }, []);

  const clearTimers = () => {
    window.clearTimeout(timers.current.open);
    window.clearTimeout(timers.current.close);
  };

  const show = useCallback(
    (el: HTMLElement, via: Open["via"], pinned: boolean) => {
      const id = el.dataset.term || "";
      const card = cardsRef.current.get(id);
      if (!card) return;
      const cur = openRef.current;
      if (cur && cur.el === el) {
        if (pinned && !cur.pinned) setOpen({ ...cur, pinned: true });
        return;
      }
      setOpen({ card, el, here: el.hasAttribute("data-term-here"), pinned, via });
      track("concept_card_open", { concept: id, via, lesson: lessonKey || window.location.pathname });
    },
    [lessonKey, setOpen],
  );

  const close = useCallback(
    (refocus = false) => {
      const cur = openRef.current;
      clearTimers();
      if (!cur) return;
      setOpen(null);
      if (refocus) cur.el.focus({ preventScroll: true });
    },
    [setOpen],
  );

  /* ---------------- apply the setting to the marks (idempotent) */
  useEffect(() => {
    const root = (markerRef.current?.closest(".course-content") as HTMLElement | null) || null;
    if (!root) return;
    rootRef.current = root;

    const apply = () => {
      cardsRef.current = readCards(root);
      const on = termsEnabled() && cardsRef.current.size > 0;
      if (root.getAttribute("data-sd-terms") !== (on ? "on" : "off")) root.setAttribute("data-sd-terms", on ? "on" : "off");
      root.querySelectorAll<HTMLElement>("span.sd-term").forEach((s) => {
        const known = on && cardsRef.current.has(s.dataset.term || "");
        if (known) {
          if (s.getAttribute("tabindex") !== "0") s.setAttribute("tabindex", "0");
          if (s.getAttribute("role") !== "button") s.setAttribute("role", "button");
          if (!s.hasAttribute("aria-haspopup")) s.setAttribute("aria-haspopup", "dialog");
          const exp = openRef.current?.el === s ? "true" : "false";
          if (s.getAttribute("aria-expanded") !== exp) s.setAttribute("aria-expanded", exp);
        } else {
          ["tabindex", "role", "aria-haspopup", "aria-expanded"].forEach((a) => s.hasAttribute(a) && s.removeAttribute(a));
        }
      });
      // the content was replaced under an open card: drop it
      const cur = openRef.current;
      if (cur && (!cur.el.isConnected || !on)) close();
    };
    apply();

    let raf = 0;
    const mo = new MutationObserver((records) => {
      if (!records.some((r) => r.type === "childList")) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    });
    mo.observe(root, { childList: true, subtree: true });
    const unsub = subscribeTerms(apply);
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
      unsub();
    };
  }, [close]);

  /* ---------------- events (delegated) */
  useEffect(() => {
    const termOf = (t: EventTarget | null): HTMLElement | null => {
      const root = rootRef.current;
      const el = (t as Element | null)?.closest?.<HTMLElement>("span.sd-term[role=button]");
      return el && root && root.contains(el) ? el : null;
    };
    const inCard = (t: EventTarget | null) => !!cardRef.current && !!t && cardRef.current.contains(t as Node);

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = termOf(e.target);
      if (el) {
        window.clearTimeout(timers.current.close);
        if (openRef.current?.el === el) return;
        window.clearTimeout(timers.current.open);
        timers.current.open = window.setTimeout(() => show(el, "hover", false), HOVER_OPEN_MS);
      } else if (inCard(e.target)) {
        window.clearTimeout(timers.current.close);
      }
    };
    const onOut = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const from = termOf(e.target) || (inCard(e.target) ? cardRef.current : null);
      if (!from) return;
      const to = e.relatedTarget as Node | null;
      if (to && (from.contains(to) || inCard(to) || (openRef.current && openRef.current.el.contains(to)))) return;
      window.clearTimeout(timers.current.open);
      const cur = openRef.current;
      if (cur && !cur.pinned) timers.current.close = window.setTimeout(() => close(), HOVER_CLOSE_MS);
    };
    let lastPointer: string = "mouse";
    const onDown = (e: PointerEvent) => {
      lastPointer = e.pointerType || "mouse";
      if (!openRef.current) return;
      if (inCard(e.target) || termOf(e.target)) return;
      close();
    };
    const onClick = (e: MouseEvent) => {
      const el = termOf(e.target);
      if (!el) return;
      if (window.getSelection && !window.getSelection()?.isCollapsed) return; // finishing a selection
      e.preventDefault();
      const cur = openRef.current;
      if (cur && cur.el === el && cur.pinned) {
        close();
        return;
      }
      clearTimers();
      show(el, lastPointer === "touch" || lastPointer === "pen" ? "tap" : "click", true);
    };
    const onKey = (e: KeyboardEvent) => {
      const el = termOf(e.target);
      if (el && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        clearTimers();
        el.scrollIntoView({ block: "nearest", behavior: "instant" as ScrollBehavior });
        show(el, "key", true);
        window.setTimeout(() => cardRef.current?.focus({ preventScroll: true }), 0);
        return;
      }
      if (e.key === "Escape" && openRef.current) {
        const fromCard = inCard(e.target) || termOf(e.target);
        e.stopPropagation();
        close(!!fromCard);
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      const cur = openRef.current;
      if (!cur) return;
      if (inCard(e.target) || e.target === cur.el) return;
      close();
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("click", onClick);
    // capture: before the reader's own key handlers (selection toolbar shortcuts, focus mode Esc)
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocusIn);
      clearTimers();
    };
  }, [show, close]);

  /* ---------------- position next to the term; follows scroll and resize */
  useLayoutEffect(() => {
    if (!open) return;
    let raf = 0;
    // only close on "scrolled away" once the term has actually been on screen (a smooth scroll to it
    // may still be running when the card opens)
    let shown = false;
    const place = () => {
      raf = 0;
      const card = cardRef.current;
      if (!card || !open.el.isConnected) return;
      const r = open.el.getClientRects()[0] || open.el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const phone = vw < 640;
      const width = Math.min(phone ? vw - 24 : 340, vw - 24);
      const left = Math.max(12, Math.min(r.left - 12, vw - width - 12));
      const h = card.offsetHeight || 220;
      // keep clear of the phone reading bar and site dock at the bottom
      const bottomSafe = phone ? 132 : 16;
      const below = r.bottom + 8;
      const above = below + h > vh - bottomSafe && r.top - 8 - h > 72;
      const top = above ? r.top - 8 - h : Math.min(below, Math.max(12, vh - bottomSafe - h));
      setPos((p) => (p && p.left === left && p.top === top && p.width === width && p.above === above ? p : { left, top, width, above }));
      // the term scrolled far out of view: close the card
      const visible = r.bottom > 0 && r.top < vh;
      if (visible) shown = true;
      else if (shown && (r.bottom < -40 || r.top > vh + 40)) close();
    };
    place();
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(place);
    };
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [open, close]);

  const hide = () => {
    close();
    setTermsEnabled(false);
    setToast(true);
  };
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(false), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const openRelated = (id: string, e: React.MouseEvent) => {
    // a related term marked on this page opens its own card instead of navigating
    const root = rootRef.current;
    const el = root?.querySelector<HTMLElement>(`span.sd-term[role=button][data-term="${CSS.escape(id)}"]`);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    window.setTimeout(() => {
      show(el, "click", true);
      el.focus({ preventScroll: true });
    }, 350);
  };

  const c = open?.card;
  const titleId = c ? `sd-tc-${c.id}` : undefined;
  return (
    <>
      <span ref={markerRef} hidden data-sd-chrome="" />
      {c &&
        open &&
        createPortal(
          <div
            ref={cardRef}
            role="dialog"
            aria-labelledby={titleId}
            tabIndex={-1}
            data-term-card=""
            className="fixed z-[85] flex flex-col gap-2.5 border border-line-strong bg-surface p-4 text-left shadow-[0_12px_32px_rgba(0,0,0,0.28)] outline-none animate-hk-in focus-visible:ring-2 focus-visible:ring-signal"
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, width: pos?.width ?? 340, visibility: pos ? "visible" : "hidden" }}
            onPointerEnter={() => window.clearTimeout(timers.current.close)}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-label text-signal-text">concept</span>
              <button type="button" onClick={() => close(true)} aria-label="Close" className="-mr-2 -mt-2 grid h-9 w-9 place-items-center font-mono text-sm text-fg-3 hover:text-fg">
                ✕
              </button>
            </div>
            <p id={titleId} className="-mt-1 font-display text-[19px] font-bold leading-tight tracking-[-0.02em] text-fg">
              {c.term}
            </p>
            <p className="text-[14.5px] leading-[1.55] text-fg-2">{c.def}</p>
            {open.here ? (
              <p className="font-mono text-[11px] text-fg-3">Taught in this section</p>
            ) : (
              <Link href={c.href} onClick={() => close()} className="group inline-flex min-h-10 flex-wrap items-baseline gap-x-2 self-start text-[13px] font-semibold text-signal-text hover:underline">
                <span>Taught in {c.code} →</span>
                {c.title && <span className="font-normal text-fg-3 group-hover:text-fg-2">{c.title}</span>}
              </Link>
            )}
            {c.rel.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
                <span className="mr-0.5 font-mono text-[10px] uppercase tracking-label text-fg-4">related</span>
                {c.rel.map((r) => (
                  <Link key={r.id} href={r.href} onClick={(e) => openRelated(r.id, e)} className="inline-flex min-h-8 items-center border border-line px-2 text-[12px] text-fg-2 hover:border-fg-3 hover:text-fg">
                    {r.term}
                  </Link>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
              <Link href={`/learn/mastery#c-${c.id}`} onClick={() => close()} className="inline-flex min-h-9 items-center font-mono text-[11px] text-fg-3 hover:text-fg hover:underline">
                concept map
              </Link>
              <button type="button" onClick={hide} className="inline-flex min-h-9 items-center font-mono text-[11px] text-fg-3 hover:text-fg hover:underline">
                hide term cards
              </button>
            </div>
          </div>,
          document.body,
        )}
      {toast &&
        createPortal(
          <div role="status" className="fixed bottom-[calc(var(--site-dock,0px)+96px)] left-1/2 z-[85] flex -translate-x-1/2 items-center gap-3 border border-line-strong bg-surface px-4 py-2.5 text-sm text-fg shadow-lg lg:bottom-28">
            Term cards hidden
            <button
              type="button"
              onClick={() => {
                setTermsEnabled(true);
                setToast(false);
              }}
              className="min-h-9 font-semibold text-signal-text hover:underline"
            >
              Undo
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
