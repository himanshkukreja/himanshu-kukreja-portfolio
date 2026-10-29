"use client";

/**
 * "Compare with my design": the learner's saved drawing for this capstone (the canvas board, as a
 * still picture) beside the capstone's own high-level architecture diagram and component list, plus
 * the canvas AI review (the canvas-review feature: same route, quota and metering as on the canvas).
 * Side by side on a wide screen; tabs on a phone, where the dialog is full screen.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { PenTool, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { userJson } from "@/components/learn/progress/userFetch";
import { CanvasReview } from "@/components/learn/canvas/CanvasEditor";
import { drawMermaid } from "@/components/diagrams/MermaidHydrator";
import { scrollToId } from "@/components/learn/lesson/layout";
import { ownElementCount, parseSketch, sketchSummary } from "@/lib/learn/mock/sketch";
import type { DesignFirstMeta } from "@/lib/learn/designFirst";

type Design = { scene: string; notes: string; review: string | null } | null;
type Tab = "mine" | "theirs";

export default function CompareDesign({ meta, title, onClose }: { meta: DesignFirstMeta; title: string; onClose: () => void }) {
  const { user, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [design, setDesign] = useState<Design | undefined>(undefined);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("mine");
  const closeRef = useRef<HTMLButtonElement>(null);
  const canvasHref = `/learn/canvas/${encodeURIComponent(meta.key)}`;

  useEffect(() => {
    if (!user?.id) return;
    let off = false;
    userJson<{ design: Design }>(`/api/learn/canvas/${encodeURIComponent(meta.key)}`)
      .then((r) => !off && setDesign(r.design))
      .catch((e: Error) => !off && setError(e.message || "Couldn't load your design."));
    return () => {
      off = true;
    };
  }, [user?.id, meta.key]);

  // a modal: Esc closes, focus starts on Close and goes back where it was, no page scroll behind it
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prev;
      before?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  const readFull = () => {
    onClose();
    if (meta.architecture?.stageId) window.setTimeout(() => scrollToId(meta.architecture!.stageId!), 50);
  };

  const tabBtn = (t: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === t}
      aria-controls={`df-pane-${t}`}
      onClick={() => setTab(t)}
      className={`min-h-10 flex-1 border-b-2 font-mono text-[12px] ${tab === t ? "border-signal text-fg" : "border-transparent text-fg-3"}`}
    >
      {label}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-stretch justify-center bg-black/60 sm:p-4 lg:p-8" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="df-compare-h" className="flex max-h-full w-full max-w-[1400px] flex-col overflow-hidden border border-line-strong bg-bg">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="flex min-w-0 flex-col">
            <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">design it first · compare</span>
            <h2 id="df-compare-h" className="m-0 truncate font-display text-[20px] font-extrabold tracking-[-0.03em] text-fg sm:text-[24px]">
              Your design vs the capstone&apos;s
            </h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close the comparison" className="ml-auto grid h-11 w-11 shrink-0 place-items-center border border-line-strong text-fg hover:border-fg-3">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div role="tablist" aria-label="Which design" className="flex border-b border-line lg:hidden">
          {tabBtn("mine", "your design")}
          {tabBtn("theirs", "the capstone's")}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-px bg-line lg:grid-cols-2">
            <section id="df-pane-mine" aria-label="Your design" className={`${tab === "mine" ? "flex" : "hidden"} min-w-0 flex-col gap-3 bg-bg p-4 sm:p-5 lg:flex`}>
              <PaneHead label="your design" />
              {loading ? (
                <Note>Loading…</Note>
              ) : !user ? (
                <div className="flex flex-col items-start gap-3">
                  <Note>Your designs save to your account. Sign in to see yours here.</Note>
                  <button type="button" onClick={openAuthModal} className="min-h-11 bg-signal px-4 font-mono text-[13px] font-semibold text-on-signal">
                    sign in
                  </button>
                </div>
              ) : error ? (
                <Note>{error}</Note>
              ) : design === undefined ? (
                <Note>Opening your design…</Note>
              ) : !design || ownElementCount(design.scene) === 0 ? (
                <div className="flex flex-col items-start gap-3">
                  <Note>You haven&apos;t drawn this one yet. The board starts with the requirements on a sticky note.</Note>
                  <Link href={canvasHref} className="inline-flex min-h-11 items-center gap-2 bg-signal px-4 text-[14px] font-semibold text-on-signal">
                    Open the canvas <PenTool className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              ) : (
                <>
                  <SceneSvg scene={design.scene} />
                  {design.notes.trim() && (
                    <details className="border border-line bg-surface px-3 py-2">
                      <summary className="cursor-pointer font-mono text-[12px] text-fg-3">your notes</summary>
                      <pre className="m-0 mt-2 whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-fg-2">{design.notes.trim()}</pre>
                    </details>
                  )}
                  <Link href={canvasHref} className="inline-flex min-h-10 items-center gap-2 self-start font-mono text-[12px] text-signal-text underline underline-offset-4">
                    edit it on the canvas →
                  </Link>
                </>
              )}
            </section>

            <section id="df-pane-theirs" aria-label="The capstone's design" className={`${tab === "theirs" ? "flex" : "hidden"} min-w-0 flex-col gap-3 bg-bg p-4 sm:p-5 lg:flex`}>
              <PaneHead label={`the capstone's · ${meta.architecture?.title || "high-level design"}`} />
              {meta.architecture?.mermaid ? <Architecture source={meta.architecture.mermaid} title={meta.architecture.title} /> : <Note>This capstone describes its architecture in prose: read its high-level design.</Note>}
              {meta.architecture && meta.architecture.components.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">its components · did you have each?</span>
                  <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                    {meta.architecture.components.map((c) => (
                      <li key={c} className="border border-line-strong px-2 py-1 text-[13px] text-fg-2">
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {meta.architecture?.stageId && (
                <button type="button" onClick={readFull} className="inline-flex min-h-10 items-center self-start font-mono text-[12px] text-signal-text underline underline-offset-4">
                  read the whole high-level design →
                </button>
              )}
            </section>
          </div>

          {user && design && ownElementCount(design.scene) > 0 && (
            <div className="border-t border-line p-4 sm:p-5">
              <div className="max-w-[860px]">
                <CanvasReview promptKey={meta.key} initial={design.review} before={async () => true} />
              </div>
            </div>
          )}
          <p className="m-0 px-4 pb-5 text-[12px] text-fg-4 sm:px-5">{title}: the review reads your saved drawing and notes against this capstone&apos;s brief.</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PaneHead({ label }: { label: string }) {
  return <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{label}</span>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-[14px] leading-relaxed text-fg-2">{children}</p>;
}

/** The saved board as a still picture, in the site's theme (Excalidraw's exportToSvg, loaded on demand). */
function SceneSvg({ scene }: { scene: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const summary = sketchSummary(scene);

  useEffect(() => {
    const s = parseSketch(scene);
    if (!s) return;
    let off = false;
    import("@excalidraw/excalidraw")
      .then(async ({ exportToSvg }) => {
        const svg = await exportToSvg({
          elements: s.elements.filter((e) => !e.isDeleted) as never,
          files: (s.files ?? null) as never,
          appState: { exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: dark } as never,
          exportPadding: 24,
        });
        if (off || !box.current) return;
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", summary ? `Your design. ${summary.replace(/\n/g, ". ")}` : "Your design");
        box.current.replaceChildren(svg);
      })
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [scene, dark, summary]);

  return (
    <>
      <div ref={box} className={`df-svg grid min-h-[200px] place-items-center overflow-hidden border border-line ${dark ? "bg-[#121212]" : "bg-white"}`}>
        <span className="font-mono text-xs text-fg-3">{failed ? "The drawing couldn't be shown here; its text is below." : "drawing your board…"}</span>
      </div>
      {summary && (
        <details className="border border-line bg-surface px-3 py-2">
          <summary className="cursor-pointer font-mono text-[12px] text-fg-3">as text (what the AI review reads)</summary>
          <pre className="m-0 mt-2 whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-fg-2">{summary}</pre>
        </details>
      )}
    </>
  );
}

/** The capstone's architecture diagram, drawn with the course's own Mermaid setup. */
function Architecture({ source, title }: { source: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"drawing" | "ok" | "error">("drawing");
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let off = false;
    el.removeAttribute("data-mermaid-theme");
    el.querySelector(".sd-mermaid-canvas")?.replaceChildren();
    drawMermaid(el)
      .then(() => !off && setState(el.dataset.mermaidState === "error" ? "error" : "ok"))
      .catch(() => !off && setState("error"));
    return () => {
      off = true;
    };
  }, [source, resolvedTheme]);

  return (
    <div ref={box} className="df-arch flex flex-col gap-2 border border-line bg-surface p-3">
      <pre hidden className="sd-mermaid-src">
        {source}
      </pre>
      <div className="sd-mermaid-canvas" role="img" aria-label={`Diagram: ${title}`} />
      {state !== "ok" && <span className="font-mono text-xs text-fg-3">{state === "error" ? "The diagram couldn't be drawn here; read it in the lesson." : "drawing the diagram…"}</span>}
    </div>
  );
}
