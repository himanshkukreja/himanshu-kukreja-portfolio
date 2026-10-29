"use client";

import { useEffect } from "react";
import { mermaidConfig, prepareMermaidSource, type DiagramTheme } from "@/lib/diagrams/mermaid-theme";
import { loadMermaid as importMermaid } from "@/lib/offline/lazy";
import { refreshSteps, stepsAction } from "./mermaidSteps";

type MermaidApi = typeof import("mermaid").default;

let mermaidPromise: Promise<MermaidApi> | null = null;
let configuredFor: DiagramTheme | null = null;
let seq = 0;

function loadMermaid(): Promise<MermaidApi> {
  // one import site (lib/offline/lazy) so "save for offline" caches this exact chunk
  if (!mermaidPromise) mermaidPromise = importMermaid();
  return mermaidPromise;
}

function currentTheme(): DiagramTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

async function renderFigure(fig: HTMLElement, theme: DiagramTheme) {
  if (fig.dataset.mermaidTheme === theme && fig.querySelector(".sd-mermaid-canvas svg")) return;
  const src = fig.querySelector<HTMLElement>(".sd-mermaid-src")?.textContent || "";
  const canvas = fig.querySelector<HTMLElement>(".sd-mermaid-canvas");
  if (!src.trim() || !canvas) return;
  const mermaid = await loadMermaid();
  if (configuredFor !== theme) {
    const cfg = mermaidConfig(theme);
    // Mermaid measures label widths with this font, so hand it the page's real (next/font hashed) family.
    const bodyFont = window.getComputedStyle(document.body).fontFamily;
    mermaid.initialize({ ...cfg, themeVariables: { ...cfg.themeVariables, fontFamily: bodyFont } });
    configuredFor = theme;
  }
  try {
    const { svg } = await mermaid.render(`sd-mmd-${++seq}`, prepareMermaidSource(src, theme));
    // securityLevel "strict" sanitizes the SVG; it is generated from our own course content.
    canvas.innerHTML = svg;
    fig.dataset.mermaidTheme = theme;
    fig.dataset.mermaidState = "ok";
    refreshSteps(fig); // a playing step-through keeps its step across re-renders (theme switch)
  } catch (err) {
    fig.dataset.mermaidState = "error";
    canvas.textContent = "";
    if (process.env.NODE_ENV !== "production") console.warn("Mermaid diagram failed to render", err);
  }
}

/**
 * Draws one diagram outside the article (the capstone "Compare with my design" view): any element
 * holding a `.sd-mermaid-src` and an empty `.sd-mermaid-canvas`, in the page's current theme.
 */
export function drawMermaid(el: HTMLElement): Promise<void> {
  return renderFigure(el, currentTheme());
}

function onClick(e: MouseEvent) {
  const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-mermaid-action]");
  if (!btn) return;
  const fig = btn.closest<HTMLElement>("figure.sd-mermaid");
  if (!fig) return;
  const action = btn.dataset.mermaidAction;
  if (action?.startsWith("steps")) stepsAction(fig, action, btn);
  else if (action === "zoom") {
    const on = fig.toggleAttribute("data-natural");
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "Fit" : "1:1";
  } else if (action === "full") {
    const on = fig.toggleAttribute("data-fullscreen");
    btn.textContent = on ? "Close" : "Fullscreen";
    document.documentElement.style.overflow = on ? "hidden" : "";
  } else if (action === "copy") {
    const src = fig.querySelector(".sd-mermaid-src")?.textContent || "";
    navigator.clipboard?.writeText(src).then(() => {
      const prev = btn.textContent;
      btn.textContent = "Copied ✓";
      window.setTimeout(() => (btn.textContent = prev), 1400);
    });
  }
}

/**
 * Renders the `figure.sd-mermaid` diagrams inside `rootSelector` (course lessons and stories) as they
 * come near the viewport, loading mermaid only when a diagram is about to be seen (rendering all of
 * them at load cost phones ~0.5 s of blocked main thread). Re-renders drawn diagrams on theme
 * switches and when the article HTML is re-rendered (highlights re-inject the content), and draws
 * everything before printing.
 */
export default function MermaidHydrator({ rootSelector = "body" }: { rootSelector?: string }) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(rootSelector) || document.body;
    let scheduled = 0;
    let queue: Promise<void> = Promise.resolve();
    const enqueue = (f: HTMLElement) => {
      queue = queue.then(() => renderFigure(f, currentTheme()));
    };
    // embedded (the CMS editor's live preview frame): draw everything, so failed diagrams are reported
    const eager = window.self !== window.top;
    const io =
      !eager && "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              for (const e of entries) {
                if (!e.isIntersecting) continue;
                io?.unobserve(e.target);
                enqueue(e.target as HTMLElement);
              }
            },
            { rootMargin: "600px 0px" },
          )
        : null;
    const run = () => {
      scheduled = 0;
      const figs = Array.from(root.querySelectorAll<HTMLElement>("figure.sd-mermaid"));
      if (!figs.length) return;
      const theme = currentTheme();
      for (const f of figs) {
        const drawn = !!f.querySelector(".sd-mermaid-canvas svg");
        if (drawn) {
          if (f.dataset.mermaidTheme !== theme) enqueue(f); // theme switch: redraw what was drawn
        } else if (io) io.observe(f); // drawn when it nears the viewport (observe is idempotent)
        else enqueue(f);
      }
    };
    const printAll = () => root.querySelectorAll<HTMLElement>("figure.sd-mermaid").forEach(enqueue);
    window.addEventListener("beforeprint", printAll);
    const schedule = () => {
      if (!scheduled) scheduled = window.setTimeout(run, 60);
    };
    run();
    const contentObserver = new MutationObserver((records) => {
      // ignore mutations we caused inside the canvas
      if (records.every((r) => (r.target as HTMLElement).closest?.(".sd-mermaid-canvas"))) return;
      schedule();
    });
    contentObserver.observe(root, { childList: true, subtree: true });
    const themeObserver = new MutationObserver(schedule);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    root.addEventListener("click", onClick);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      root.querySelectorAll<HTMLElement>("figure.sd-mermaid[data-fullscreen]").forEach((f) => {
        f.removeAttribute("data-fullscreen");
        const b = f.querySelector<HTMLElement>('[data-mermaid-action="full"]');
        if (b) b.textContent = "Fullscreen";
      });
      document.documentElement.style.overflow = "";
    };
    window.addEventListener("keydown", onKey);
    return () => {
      if (scheduled) window.clearTimeout(scheduled);
      io?.disconnect();
      window.removeEventListener("beforeprint", printAll);
      contentObserver.disconnect();
      themeObserver.disconnect();
      root.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [rootSelector]);
  return null;
}
