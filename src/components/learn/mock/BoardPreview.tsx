"use client";

/**
 * The debrief's "your whiteboard": the drawing from the round as a still picture (Excalidraw's
 * exportToSvg, in its dark look, loaded only when there is a drawing), the blocks and arrows as
 * text, and the board notes, so the design can sit next to the model answers.
 */
import { useEffect, useRef, useState } from "react";
import { parseSketch, sketchSummary } from "@/lib/learn/mock/sketch";
import { LABEL } from "./ui";

export default function BoardPreview({ sketch, notes }: { sketch?: string; notes: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "drawing" | "done" | "failed">("idle");
  const scene = parseSketch(sketch);
  const has = !!scene && scene.elements.some((e) => !e.isDeleted);
  const summary = sketchSummary(sketch);

  useEffect(() => {
    if (!has || !scene) return;
    let off = false;
    const t = window.setTimeout(() => setState("drawing"), 0);
    import("@excalidraw/excalidraw")
      .then(async ({ exportToSvg }) => {
        const svg = await exportToSvg({
          elements: scene.elements.filter((e) => !e.isDeleted) as never,
          files: (scene.files ?? null) as never,
          appState: { exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: true, exportPadding: 24 } as never,
        });
        if (off || !box.current) return;
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", summary ? `Your whiteboard. ${summary.replace(/\n/g, ". ")}` : "Your whiteboard");
        svg.style.width = "100%";
        svg.style.height = "auto";
        svg.style.maxHeight = "560px";
        box.current.replaceChildren(svg);
        setState("done");
      })
      .catch(() => !off && setState("failed"));
    return () => {
      off = true;
      window.clearTimeout(t);
    };
    // the round is over: the drawing doesn't change while the debrief is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [has, sketch]);

  if (!has && !notes.trim()) return null;
  return (
    <section aria-labelledby="board-h" className="flex flex-col gap-4 border border-line-strong bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="board-h" className="m-0 font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
          Your whiteboard<span className="text-signal-text">.</span>
        </h2>
        <span className="text-sm text-fg-3">Hold it up against the high-level design model answer below.</span>
      </div>
      {has && (
        <div ref={box} className="grid min-h-[160px] place-items-center overflow-hidden border border-line bg-[#121212]">
          <span className="font-mono text-xs text-fg-3">{state === "failed" ? "The drawing couldn't be shown here; its text is below." : "drawing your board…"}</span>
        </div>
      )}
      {summary && (
        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>as text · what the AI scorecard reads</span>
          <pre className="m-0 whitespace-pre-wrap border border-line bg-bg px-3.5 py-3 font-mono text-[13px] leading-relaxed text-fg-2">{summary}</pre>
        </div>
      )}
      {notes.trim() && (
        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>notes on the board</span>
          <pre className="m-0 whitespace-pre-wrap border border-line bg-bg px-3.5 py-3 font-mono text-[13px] leading-relaxed text-fg-2">{notes.trim()}</pre>
        </div>
      )}
    </section>
  );
}
