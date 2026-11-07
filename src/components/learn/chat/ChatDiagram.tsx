"use client";

/**
 * A ```mermaid diagram in a tutor answer, drawn with the lessons' own renderer (components/diagrams/MermaidHydrator:
 * the site's mermaid config, its palette and the reading theme's --c-* tokens, securityLevel "strict"), redrawn when
 * the theme or reading mode changes. Mermaid loads only when an answer has a diagram (the same lazy chunk lessons
 * use). The model's source is cut down first (cleanMermaid: flowchart or sequence diagrams only, no styling, click,
 * directive or HTML), and checked with mermaid's parser before drawing: a diagram that doesn't parse shows its code.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Workflow } from "lucide-react";

const HEADER = /^(?:flowchart|graph)\s+(?:LR|RL|TD|TB|BT)\b|^sequenceDiagram\b/;
/** lines a chat diagram never needs: styling, click handlers, directives and comments */
const DROP = /^\s*(?:%%|style\b|classDef\b|class\b|linkStyle\b|click\b|callback\b|accTitle\b|accDescr\b)/i;

/** The model's diagram as one we draw, or null (not a flowchart or sequence diagram, or too big). */
export function cleanMermaid(src: string): string | null {
  const lines = src
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/<\/?[a-z][^>\n]*>/gi, " ").replace(/javascript:/gi, "").trimEnd())
    .filter((l) => l.trim() && !DROP.test(l));
  if (!lines.length || !HEADER.test(lines[0].trim()) || lines.length > 40) return null;
  const out = [lines[0].trim(), ...lines.slice(1)].join("\n");
  return out.length <= 2500 ? out : null;
}

/**
 * A wide diagram in a narrow column (a phone) would shrink until its labels can't be read: it keeps at least 3/4 of
 * its drawn size and the canvas scrolls sideways instead.
 */
function keepReadable(el: HTMLElement) {
  const svg = el.querySelector<SVGSVGElement>(".sd-mermaid-canvas svg");
  const w = svg?.viewBox?.baseVal?.width;
  if (svg && w) svg.style.minWidth = `${Math.round(w * 0.75)}px`;
}

type MermaidApi ={ parse: (text: string, o?: { suppressErrors?: boolean }) => Promise<unknown> };

/**
 * Diagrams already drawn, by source: the answer that finishes streaming mounts a new view of the same diagram (and a
 * reload of the thread does too), which shows the drawing at once instead of drawing it again. `look` is the theme it
 * was drawn for (MermaidHydrator's data-mermaid-theme); another theme draws again.
 */
const drawn = new Map<string, { look: string; svg: string }>();
const lookNow = () => {
  const h = document.documentElement;
  const m = h.dataset.readMode;
  const tone = h.classList.contains("dark") ? "dark" : "light";
  return m && m !== "light" && m !== "night" ? `${tone}:${m}` : tone;
};

export function DiagramPending() {
  return (
    <div role="status" className="flex min-h-24 items-center justify-center gap-2 border border-dashed border-line-strong bg-surface-2 font-mono text-[11.5px] text-fg-3">
      <Workflow className="h-3.5 w-3.5 animate-pulse text-signal-text" aria-hidden />
      drawing a diagram…
    </div>
  );
}

export default function ChatDiagram({ code }: { code: string }) {
  const clean = useMemo(() => cleanMermaid(code), [code]);
  const fig = useRef<HTMLElement>(null);
  const [state, setState] = useState<"wait" | "ok" | "code">(() => (!clean ? "code" : typeof document !== "undefined" && drawn.get(clean)?.look === lookNow() ? "ok" : "wait"));
  // a drawing made before goes straight in, before paint (drawMermaid then sees it is done for this theme)
  useLayoutEffect(() => {
    const el = fig.current;
    const hit = clean ? drawn.get(clean) : undefined;
    const canvas = el?.querySelector<HTMLElement>(".sd-mermaid-canvas");
    if (!el || !canvas || !hit || hit.look !== lookNow()) return;
    canvas.innerHTML = hit.svg;
    el.dataset.mermaidTheme = hit.look;
    el.dataset.mermaidState = "ok";
    keepReadable(el);
  }, [clean]);
  useEffect(() => {
    const el = fig.current;
    if (!clean || !el) return;
    let off = false;
    let busy: Promise<void> = Promise.resolve();
    const draw = () =>
      (busy = busy.then(async () => {
        try {
          const [{ drawMermaid }, { loadMermaid }] = await Promise.all([import("@/components/diagrams/MermaidHydrator"), import("@/lib/offline/lazy")]);
          const mermaid = (await loadMermaid()) as unknown as MermaidApi;
          if (!(await mermaid.parse(clean, { suppressErrors: true }))) {
            if (!off) setState("code");
            return;
          }
          await drawMermaid(el);
          keepReadable(el);
          const svg = el.querySelector(".sd-mermaid-canvas")?.innerHTML;
          if (el.dataset.mermaidState === "ok" && svg && el.dataset.mermaidTheme) {
            drawn.set(clean, { look: el.dataset.mermaidTheme, svg });
            if (drawn.size > 40) drawn.delete(drawn.keys().next().value as string);
          }
          if (!off) setState(el.dataset.mermaidState === "ok" ? "ok" : "code");
        } catch {
          if (!off) setState("code");
        }
      }));
    void draw();
    // the theme or reading mode changed: draw again in its colours (drawMermaid skips a diagram already drawn for it)
    const mo = new MutationObserver(() => void draw());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-read-mode"] });
    return () => {
      off = true;
      mo.disconnect();
    };
  }, [clean]);
  return (
    <figure ref={fig} className="sd-mermaid hk-chat-diagram" data-chat-diagram={state} aria-label={state === "code" ? "Diagram (as text)" : "Diagram"}>
      {state === "wait" && <DiagramPending />}
      <div className="sd-mermaid-canvas" />
      <pre className="sd-mermaid-src">{clean ?? code}</pre>
    </figure>
  );
}
