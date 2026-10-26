"use client";

/**
 * The mock interview whiteboard: an Excalidraw canvas (MIT) for real boxes-and-arrows diagrams.
 * Arrows drawn from one shape to another stay attached when shapes move. A row of system-design
 * building blocks drops a labelled shape in the middle of the view; full screen gives the whole
 * window to the drawing. The scene autosaves into the run (`run.sketch`) a moment after each change.
 *
 * Loaded on demand (next/dynamic, no SSR) from the whiteboard tab, so the rest of the room stays light.
 */
import "@excalidraw/excalidraw/index.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { convertToExcalidrawElements, Excalidraw } from "@excalidraw/excalidraw";
import { parseSketch } from "@/lib/learn/mock/sketch";

type API = Parameters<NonNullable<React.ComponentProps<typeof Excalidraw>["excalidrawAPI"]>>[0];
type Skeleton = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>[number];

// building blocks. Excalidraw's dark theme inverts the canvas colours, so these are light-theme
// colours: they show as the matching dark tones (orange stays orange, no purple)
const BLOCKS: { label: string; shape: "rectangle" | "ellipse" | "diamond"; stroke: string; bg: string; w: number; h: number; dashed?: boolean }[] = [
  { label: "Client", shape: "rectangle", stroke: "#1e1e1e", bg: "transparent", w: 150, h: 64 },
  { label: "Load balancer", shape: "diamond", stroke: "#1e1e1e", bg: "transparent", w: 180, h: 100 },
  { label: "API service", shape: "rectangle", stroke: "#e8590c", bg: "#ffd8a8", w: 160, h: 70 },
  { label: "Database", shape: "ellipse", stroke: "#2f9e44", bg: "#b2f2bb", w: 160, h: 80 },
  { label: "Cache", shape: "rectangle", stroke: "#1971c2", bg: "#a5d8ff", w: 150, h: 64, dashed: true },
  { label: "Queue", shape: "rectangle", stroke: "#f08c00", bg: "#ffec99", w: 170, h: 56 },
  { label: "CDN", shape: "ellipse", stroke: "#1e1e1e", bg: "transparent", w: 140, h: 70 },
  { label: "Object storage", shape: "rectangle", stroke: "#2f9e44", bg: "transparent", w: 180, h: 64 },
  { label: "Worker", shape: "rectangle", stroke: "#1e1e1e", bg: "#e9ecef", w: 150, h: 64 },
];

// Nunito: clean labels (Excalidraw's default is a hand-drawn font)
const FONT = 6;

export default function BoardCanvas({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [api, setApi] = useState<API | null>(null);
  const [full, setFull] = useState(false);
  const version = useRef(-1);
  const timer = useRef<number | undefined>(undefined);
  const placed = useRef(0);
  // the saved scene, read once: after that the canvas owns it
  const [initial] = useState(() => parseSketch(value)?.elements ?? []);

  const save = useCallback(
    (elements: readonly { version: number; isDeleted?: boolean }[]) => {
      const v = elements.reduce((a, e) => a + e.version, 0);
      if (v === version.current) return;
      version.current = v;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => onChange(JSON.stringify({ elements: elements.filter((e) => !e.isDeleted) })), 500);
    },
    [onChange],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Esc leaves full screen (Excalidraw keeps Esc for its own tools while something is selected)
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const st = api?.getAppState() as { selectedElementIds?: Record<string, boolean>; editingTextElement?: unknown; editingElement?: unknown } | undefined;
      const busy = !!st && (Object.keys(st.selectedElementIds || {}).length > 0 || !!st.editingTextElement || !!st.editingElement);
      if (!busy) setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full, api]);

  const add = (b: (typeof BLOCKS)[number]) => {
    if (!api) return;
    const st = api.getAppState();
    const z = st.zoom.value;
    // lay new blocks out on a grid around the middle of the view, so none lands on another
    const n = placed.current++ % 12;
    const col = n % 4;
    const row = Math.floor(n / 4);
    const x = -st.scrollX + st.width / 2 / z - 420 + col * 220;
    const y = -st.scrollY + st.height / 2 / z - 160 + row * 140;
    const skel: Skeleton = {
      type: b.shape,
      x,
      y,
      width: b.w,
      height: b.h,
      strokeColor: b.stroke,
      backgroundColor: b.bg,
      fillStyle: "solid",
      strokeWidth: 2,
      roughness: 0,
      strokeStyle: b.dashed ? "dashed" : "solid",
      roundness: b.shape === "rectangle" ? { type: 3 } : null,
      label: { text: b.label, fontSize: 18, fontFamily: FONT },
    } as Skeleton;
    const els = convertToExcalidrawElements([skel]);
    api.updateScene({ elements: [...api.getSceneElements(), ...els], appState: { selectedElementIds: { [els[0].id]: true } } });
  };

  return (
    <div className={full ? "fixed inset-0 z-[150] flex flex-col bg-[#0b0b0c] p-2 sm:p-3" : "flex flex-col"}>
      <div className="flex flex-wrap items-center gap-1 border border-b-0 border-line-strong bg-surface px-2 py-1.5">
        <span className="mr-1 font-mono text-[11px] uppercase tracking-label text-fg-3">add</span>
        {BLOCKS.map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={() => add(b)}
            disabled={!api}
            className="min-h-9 border border-line px-2 font-mono text-[12px] text-fg-2 hover:border-fg-3 hover:text-fg disabled:opacity-50"
            style={{ borderLeftColor: b.stroke === "#1e1e1e" ? "#a3a3a8" : b.stroke, borderLeftWidth: 3 }}
          >
            {b.label}
          </button>
        ))}
        <span className="ml-auto" />
        <button type="button" onClick={() => setFull((f) => !f)} className="min-h-9 border border-line-strong px-2.5 font-mono text-[12px] text-fg hover:border-fg-3">
          {full ? "exit full screen" : "⛶ full screen"}
        </button>
      </div>
      <div className={`relative border border-line-strong ${full ? "min-h-0 flex-1" : "h-[min(560px,68vh)]"}`}>
        <Excalidraw
          excalidrawAPI={setApi}
          theme="dark"
          initialData={{
            elements: initial as never,
            appState: { viewBackgroundColor: "#ffffff", currentItemRoughness: 0, currentItemFontFamily: FONT, currentItemEndArrowhead: "arrow" },
            scrollToContent: initial.length > 0,
          }}
          onChange={(elements) => save(elements)}
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false, saveAsImage: true, export: { saveFileToDisk: true } } }}
        />
      </div>
      <p className="m-0 mt-1.5 font-mono text-[11px] leading-relaxed text-fg-4">
        Click a block above to drop it in, then drag it into place, or draw with the tools. Arrow tool (A): drag from one box to another and it stays attached. Double-click a box to type in it. Saves as you go; export a PNG from the menu.
      </p>
    </div>
  );
}
