"use client";

/**
 * Interactive chrome for renderer output (src/lib/course/render.ts). Mount it anywhere
 * inside (or next to) the `.course-content` element:
 *
 *   <div className="course-content"> <HighlightableContent …/> <CourseEnhancer /> </div>
 *
 * All chrome buttons are server-rendered with data-sd-chrome + data-sd-action; this component
 * only wires them (event delegation), restores per-reader state from localStorage and re-applies
 * it whenever the content HTML is replaced (highlights re-render the HTML). It never adds or
 * removes text inside the content, so highlight / bookmark offsets stay valid.
 *
 * Events for the page (window CustomEvents):
 *   "sd:verdict"   detail { lessonKey, qid, question, verdict: "knew" | "review" | null }
 *   "sd:checklist" detail { lessonKey, done: number, total: number }
 */
import MermaidHydrator from "@/components/diagrams/MermaidHydrator";
import "@/app/learn/course-content.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  /** stable lesson key, e.g. "week-02-failure-first-design/day-03-circuit-breakers" (defaults to the URL path) */
  lessonKey?: string;
  onVerdict?: (d: { qid: string; question: string; verdict: "knew" | "review" | null }) => void;
  onChecklist?: (d: { done: number; total: number }) => void;
};

type Fullscreen = { caption: string; html: string };

const session = {
  revealed: new Set<string>(),
  expanded: new Set<string>(),
  native: new Set<string>(),
  hideYou: new Set<string>(),
};

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: state stays for this visit */
  }
}

function setText(el: Element | null, value: string) {
  if (el && el.textContent !== value) el.textContent = value;
}

function setAttr(el: Element | null, name: string, value: string | null) {
  if (!el) return;
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function defaultKey() {
  return window.location.pathname.replace(/^\/learn\//, "").replace(/\/$/, "") || "lesson";
}

/** index of an element among same-kind components in the root (stable for a given HTML) */
function indexIn(root: Element, el: Element, selector: string) {
  return Array.prototype.indexOf.call(root.querySelectorAll(selector), el) as number;
}

export default function CourseEnhancer({ lessonKey, onVerdict, onChecklist }: Props) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const [fs, setFs] = useState<Fullscreen | null>(null);
  const cbRef = useRef({ onVerdict, onChecklist });
  useEffect(() => {
    cbRef.current = { onVerdict, onChecklist };
  }, [onVerdict, onChecklist]);

  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeFs = useCallback(() => {
    setFs(null);
    const back = returnFocusRef.current;
    returnFocusRef.current = null;
    window.setTimeout(() => back?.focus({ preventScroll: true }), 0);
  }, []);

  useEffect(() => {
    const key = lessonKey || defaultKey();
    const checkKey = `sd:check:${key}`;
    const verdictKey = `sd:verdict:${key}`;
    const near = markerRef.current?.closest(".course-content");
    const roots: HTMLElement[] = near ? [near as HTMLElement] : Array.from(document.querySelectorAll<HTMLElement>(".course-content"));
    if (!roots.length) return;

    /* ---------------- state application (idempotent) */
    const fitBlueprints = (root: HTMLElement) => {
      root.querySelectorAll<HTMLElement>('[data-sd="blueprint"]').forEach((fig) => {
        const id = `${key}#${indexIn(root, fig, '[data-sd="blueprint"]')}`;
        const native = session.native.has(id);
        const pre = fig.querySelector<HTMLElement>(".sd-bp-pre");
        const body = fig.querySelector<HTMLElement>(".sd-bp-body");
        const note = fig.querySelector(".sd-fit-note");
        setAttr(fig.querySelector('[data-sd-action="fit"]'), "aria-pressed", native ? "false" : "true");
        setAttr(fig.querySelector('[data-sd-action="native"]'), "aria-pressed", native ? "true" : "false");
        if (!pre || !body) return;
        if (native) {
          pre.style.removeProperty("--sd-bp-size");
          setText(note, "1:1 · scroll to pan");
          return;
        }
        const base = 13;
        pre.style.setProperty("--sd-bp-size", `${base}px`);
        const natural = pre.scrollWidth;
        const cs = getComputedStyle(body);
        const avail = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        if (!natural || avail <= 0) return;
        const size = Math.min(15, (base * avail) / natural);
        if (size < 7) {
          pre.style.setProperty("--sd-bp-size", `7px`);
          setText(note, "too wide to fit · scroll");
        } else {
          pre.style.setProperty("--sd-bp-size", `${size.toFixed(2)}px`);
          setText(note, size >= base ? "fits column" : `scaled to ${Math.round((size / base) * 100)}% · fits column`);
        }
      });
    };

    const applyChecklists = (root: HTMLElement, emit = false) => {
      const done = new Set(readJSON<string[]>(checkKey, []));
      let doneAll = 0;
      let totalAll = 0;
      root.querySelectorAll<HTMLElement>('[data-sd="checklist"]').forEach((list) => {
        const boxes = Array.from(list.querySelectorAll<HTMLInputElement>("input.sd-ck-box"));
        let n = 0;
        boxes.forEach((b) => {
          const on = done.has(b.dataset.sdCheck || "");
          if (b.checked !== on) b.checked = on;
          if (on) n++;
        });
        doneAll += n;
        totalAll += boxes.length;
        setText(list.querySelector(".sd-ck-count"), `${n}/${boxes.length} ready`);
        const fill = list.querySelector<HTMLElement>(".sd-ck-fill");
        const pct = boxes.length ? `${Math.round((n / boxes.length) * 100)}%` : "0%";
        if (fill && fill.style.getPropertyValue("--sd-ck") !== pct) fill.style.setProperty("--sd-ck", pct);
      });
      if (emit) {
        const detail = { lessonKey: key, done: doneAll, total: totalAll };
        window.dispatchEvent(new CustomEvent("sd:checklist", { detail }));
        cbRef.current.onChecklist?.({ done: doneAll, total: totalAll });
      }
    };

    const applyReveals = (root: HTMLElement) => {
      const verdicts = readJSON<Record<string, "knew" | "review">>(verdictKey, {});
      root.querySelectorAll<HTMLElement>('[data-sd="reveal"]').forEach((card) => {
        const qid = card.dataset.qid || "";
        const v = verdicts[qid] || null;
        const open = session.revealed.has(`${key}#${qid}`);
        setAttr(card, "data-revealed", open ? "true" : null);
        setAttr(card, "data-verdict", v);
        setAttr(card.querySelector('[data-sd-action="reveal"]'), "aria-expanded", open ? "true" : "false");
        setAttr(card.querySelector('[data-sd-action="knew"]'), "aria-pressed", v === "knew" ? "true" : "false");
        setAttr(card.querySelector('[data-sd-action="review"]'), "aria-pressed", v === "review" ? "true" : "false");
        setText(card.querySelector(".sd-rv-status"), v === "knew" ? "knew it ✓" : v === "review" ? "review again" : open ? "revealed" : "not answered");
      });
    };

    const applyCode = (root: HTMLElement) => {
      root.querySelectorAll<HTMLElement>('[data-sd="code"][data-collapsible]').forEach((fig) => {
        const id = `${key}#${indexIn(root, fig, '[data-sd="code"]')}`;
        const open = session.expanded.has(id);
        setAttr(fig, "data-collapsed", open ? "false" : "true");
        const btn = fig.querySelector(".sd-code-more");
        const total = Number(fig.dataset.lines || 0);
        setAttr(btn, "aria-expanded", open ? "true" : "false");
        setText(btn, open ? "Collapse to 20 lines ↑" : `Show all ${total} lines ↓ (${Math.max(0, total - 20)} hidden)`);
      });
    };

    const applyTranscripts = (root: HTMLElement) => {
      root.querySelectorAll<HTMLElement>('[data-sd="transcript"]').forEach((tr) => {
        const id = `${key}#${indexIn(root, tr, '[data-sd="transcript"]')}`;
        const hidden = session.hideYou.has(id);
        setAttr(tr, "data-hide-you", hidden ? "true" : null);
        const btn = tr.querySelector('[data-sd-action="hide-you"]');
        setAttr(btn, "aria-pressed", hidden ? "true" : "false");
        setText(btn, hidden ? "Show my lines" : "Hide my lines");
      });
    };

    const applyAll = (root: HTMLElement) => {
      setAttr(root, "data-sd-ready", "");
      applyChecklists(root);
      applyReveals(root);
      applyCode(root);
      applyTranscripts(root);
      fitBlueprints(root);
    };

    roots.forEach(applyAll);

    /* ---------------- events (delegated, survive innerHTML replacement) */
    const copy = async (btn: HTMLElement, value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setText(btn, "Copied ✓");
      } catch {
        setText(btn, "Copy failed");
      }
      window.setTimeout(() => setText(btn, "Copy"), 1600);
    };

    const onClick = (e: MouseEvent) => {
      const btn = (e.target as Element | null)?.closest<HTMLElement>("[data-sd-action]");
      if (!btn) return;
      const root = roots.find((r) => r.contains(btn));
      if (!root) return;
      const action = btn.dataset.sdAction;
      const comp = btn.closest<HTMLElement>("[data-sd]");
      if (!comp) return;
      e.preventDefault();
      switch (action) {
        case "copy": {
          const src =
            comp.querySelector(".sd-bp-pre, .sd-tree-pre, .sd-code-pre") ||
            comp.querySelector(".sd-say-q") ||
            (comp.matches(".sd-say") ? comp.querySelector("blockquote") : null);
          const say = btn.closest(".sd-say")?.querySelector(".sd-say-q");
          void copy(btn, ((say || src)?.textContent || "").replace(/\n$/, ""));
          break;
        }
        case "fit":
        case "native": {
          const id = `${key}#${indexIn(root, comp, '[data-sd="blueprint"]')}`;
          if (action === "native") session.native.add(id);
          else session.native.delete(id);
          fitBlueprints(root);
          break;
        }
        case "fullscreen": {
          const pre = comp.querySelector(".sd-bp-pre");
          const cap = comp.querySelector(".sd-fig-cap")?.textContent || "Diagram";
          if (pre) {
            returnFocusRef.current = btn;
            setFs({ caption: cap, html: pre.innerHTML });
          }
          break;
        }
        case "expand": {
          const id = `${key}#${indexIn(root, comp, '[data-sd="code"]')}`;
          const wasOpen = session.expanded.has(id);
          if (wasOpen) session.expanded.delete(id);
          else session.expanded.add(id);
          applyCode(root);
          if (wasOpen) comp.scrollIntoView({ block: "nearest" });
          break;
        }
        case "reveal":
        case "hide": {
          const id = `${key}#${comp.dataset.qid}`;
          if (action === "reveal") session.revealed.add(id);
          else session.revealed.delete(id);
          applyReveals(root);
          if (action === "reveal") comp.querySelector<HTMLElement>('[data-sd-action="knew"]')?.focus({ preventScroll: true });
          else comp.querySelector<HTMLElement>('[data-sd-action="reveal"]')?.focus({ preventScroll: true });
          break;
        }
        case "knew":
        case "review": {
          const qid = comp.dataset.qid || "";
          const all = readJSON<Record<string, string>>(verdictKey, {});
          const next = all[qid] === action ? null : action;
          if (next) all[qid] = next;
          else delete all[qid];
          writeJSON(verdictKey, all);
          applyReveals(root);
          const detail = { lessonKey: key, qid, question: comp.dataset.question || "", verdict: next as "knew" | "review" | null };
          window.dispatchEvent(new CustomEvent("sd:verdict", { detail }));
          cbRef.current.onVerdict?.({ qid, question: detail.question, verdict: detail.verdict });
          break;
        }
        case "hide-you": {
          const id = `${key}#${indexIn(root, comp, '[data-sd="transcript"]')}`;
          if (session.hideYou.has(id)) session.hideYou.delete(id);
          else session.hideYou.add(id);
          applyTranscripts(root);
          break;
        }
      }
    };

    const onChange = (e: Event) => {
      const box = e.target as HTMLInputElement | null;
      if (!box || !box.matches?.("input.sd-ck-box")) return;
      const root = roots.find((r) => r.contains(box));
      if (!root) return;
      const done = new Set(readJSON<string[]>(checkKey, []));
      const id = box.dataset.sdCheck || "";
      if (box.checked) done.add(id);
      else done.delete(id);
      writeJSON(checkKey, Array.from(done));
      applyChecklists(root, true);
    };

    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);

    /* ---------------- re-apply after the content HTML is replaced */
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => roots.forEach(applyAll));
    };
    const mo = new MutationObserver((records) => {
      const relevant = records.some((r) => {
        const t = r.target as Element;
        return !(t.nodeType === 1 && t.closest?.("[data-sd-chrome]"));
      });
      if (relevant) schedule();
    });
    roots.forEach((r) => mo.observe(r, { childList: true, subtree: true }));

    let lastW = 0;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width || 0);
      if (w === lastW) return;
      lastW = w;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => roots.forEach(fitBlueprints));
    });
    roots.forEach((r) => ro.observe(r));

    // web fonts change glyph widths: refit once they are ready
    document.fonts?.ready.then(() => roots.forEach(fitBlueprints)).catch(() => {});

    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("change", onChange);
      mo.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [lessonKey]);

  /* fullscreen: Esc closes, focus the close button */
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!fs) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFs();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [fs, closeFs]);

  return (
    <>
      <span ref={markerRef} hidden data-sd-chrome="" />
      <MermaidHydrator rootSelector=".course-content" />
      {fs &&
        createPortal(
          <div className="sd-fs" role="dialog" aria-modal="true" aria-label={`${fs.caption} fullscreen`}>
            <div className="sd-fs-bar">
              <span className="sd-fs-tag">{fs.caption}</span>
              <button ref={closeRef} type="button" className="sd-btn" onClick={closeFs}>
                Close · Esc
              </button>
            </div>
            <div className="sd-fs-body">
              <pre dangerouslySetInnerHTML={{ __html: fs.html }} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
