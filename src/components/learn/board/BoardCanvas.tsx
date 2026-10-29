"use client";

/**
 * The whiteboard for the design canvas (/learn/canvas) and the mock interview room: an Excalidraw
 * canvas (MIT) with the site's component library beside it (a side panel when the board is wide, a
 * bottom sheet on a phone). Click a component to drop it in the middle of the view, or drag it onto
 * the board; each one is a grouped, labelled block (a cylinder for a database, slots for a queue…)
 * with the course diagrams' icon and its category's colour. Arrows drawn from one block to another
 * stay attached (Excalidraw's binding). The board follows the site's light/dark theme. Full screen
 * gives the whole window to the drawing. The scene (and the icons it uses) autosaves via `onChange`
 * as Excalidraw JSON: `{ elements, files? }`, the same format as ever. The board is sized to the
 * window; a page with its own sticky bar above it sets `--hk-board-reserve` (px) to leave room for it.
 *
 * Loaded on demand (next/dynamic, no SSR), so the pages around it stay light.
 */
import "@excalidraw/excalidraw/index.css";
import "./board.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, Shapes } from "lucide-react";
import { convertToExcalidrawElements, Excalidraw } from "@excalidraw/excalidraw";
import { parseSketch } from "@/lib/learn/mock/sketch";
import { iconPng, iconSvgUrl } from "@/lib/learn/board/icons";
import { blockParts, SIZE, TONES, type Block } from "@/lib/learn/board/library";
import LibraryPanel, { Glyph } from "./LibraryPanel";

type API = Parameters<NonNullable<React.ComponentProps<typeof Excalidraw>["excalidrawAPI"]>>[0];
type Skeleton = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>[number];
type Files = ReturnType<API["getFiles"]>;
type FileData = Files[string];

/**
 * Where a new block goes: centred on `at` (scene coordinates), or on the middle of the view, moved
 * to the nearest free spot so it never lands on top of what's drawn.
 */
function spotFor(api: API, w: number, h: number, at?: { x: number; y: number }): [number, number] {
  const st = api.getAppState();
  const z = st.zoom.value;
  const cx = at ? at.x : -st.scrollX + st.width / 2 / z;
  const cy = at ? at.y : -st.scrollY + st.height / 2 / z;
  if (at) return [cx - w / 2, cy - h / 2];
  const boxes = api
    .getSceneElements()
    .filter((e) => !e.isDeleted)
    .map((e) => ({ x1: Math.min(e.x, e.x + e.width), y1: Math.min(e.y, e.y + e.height), x2: Math.max(e.x, e.x + e.width), y2: Math.max(e.y, e.y + e.height) }));
  const clear = (x: number, y: number) => boxes.every((b) => x + w + 20 < b.x1 || x - 20 > b.x2 || y + h + 20 < b.y1 || y - 20 > b.y2);
  // rings of candidate cells around the centre, nearest first
  const cells: [number, number][] = [[0, 0]];
  for (let r = 1; r <= 6; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (Math.max(Math.abs(i), Math.abs(j)) === r) cells.push([i, j]);
  cells.sort((a, b) => Math.hypot(a[0] * 1.3, a[1]) - Math.hypot(b[0] * 1.3, b[1]));
  for (const [i, j] of cells) {
    const x = cx - w / 2 + i * (w + 48);
    const y = cy - h / 2 + j * (h + 48);
    if (clear(x, y)) return [x, y];
  }
  return [cx - w / 2, cy - h / 2];
}

/**
 * Boards saved before the library redesign carry their icons as PNGs tinted for the dark board only
 * (a near-white icon vanishes on the light board). Their generic icons are redrawn as SVG in the
 * block's line colour, under the same file id, so they follow the theme like new blocks do.
 */
const OLD_TINT: Record<string, string> = { e9ecef: "#1e1e1e", ff922b: "#e8590c", "69db7c": "#2f9e44", "74c0fc": "#1971c2", ffd43b: "#f08c00", ff8787: "#e03131" };
function refreshOldIcons(files: Record<string, unknown> | undefined) {
  if (!files) return files;
  const out: Record<string, unknown> = {};
  for (const [id, f] of Object.entries(files)) {
    const m = id.match(/^icon-sd-(.+)-([0-9a-f]{6})$/);
    const url = m && OLD_TINT[m[2]] ? iconSvgUrl(`sd:${m[1]}`, OLD_TINT[m[2]]) : null;
    out[id] = url ? { ...(f as object), mimeType: "image/svg+xml", dataURL: url } : f;
  }
  return out;
}

export default function BoardCanvas({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [api, setApi] = useState<API | null>(null);
  const [full, setFull] = useState(false);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "light" ? "light" : "dark";
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  // the panel sits beside the board when there's room for both, else it's a bottom sheet over the board
  const [wide, setWide] = useState(true);
  const [roomy, setRoomy] = useState(true);
  const [open, setOpen] = useState<boolean | null>(null);
  const [drag, setDrag] = useState<{ block: Block; x: number; y: number; over: boolean } | null>(null);
  const version = useRef(-1);
  const timer = useRef<number | undefined>(undefined);
  // the saved scene, read once: after that the canvas owns it
  const [initial] = useState(() => parseSketch(value));

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setWide(e.contentRect.width >= 640);
      setRoomy(e.contentRect.width >= 900);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const panelOpen = open ?? wide;

  // open a saved board with the whole drawing in view (never zoomed past 100%), on a phone too
  useEffect(() => {
    if (!api || !(initial?.elements.length ?? 0)) return;
    const t = window.setTimeout(() => api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.85, maxZoom: 1, minZoom: 0.3, animate: false }), 60);
    return () => window.clearTimeout(t);
  }, [api, initial]);

  const save = useCallback(
    (elements: readonly { version: number; isDeleted?: boolean; type: string; fileId?: string | null }[], files: Files) => {
      const v = elements.reduce((a, e) => a + e.version, 0);
      if (v === version.current) return;
      version.current = v;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const live = elements.filter((e) => !e.isDeleted);
        const used = new Set(live.filter((e) => e.type === "image" && e.fileId).map((e) => e.fileId as string));
        const keep = Object.fromEntries(Object.entries(files).filter(([id]) => used.has(id)));
        onChange(JSON.stringify(Object.keys(keep).length ? { elements: live, files: keep } : { elements: live }));
      }, 500);
    },
    [onChange],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Esc leaves full screen (Excalidraw keeps Esc for its own tools while something is selected)
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const st = api?.getAppState() as { selectedElementIds?: Record<string, boolean>; editingTextElement?: unknown; newElement?: unknown } | undefined;
      const busy = !!st && (Object.keys(st.selectedElementIds || {}).length > 0 || !!st.editingTextElement || !!st.newElement);
      if (!busy) setFull(false);
    };
    window.addEventListener("keydown", onKey);
    // no page scroll behind the full-screen board
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prev;
    };
  }, [full, api]);

  /** Drops a block on the board: at a scene point (dragged there), or in the middle of the view. */
  const add = useCallback(
    async (b: Block, at?: { x: number; y: number }) => {
      if (!api) return;
      const [w, h] = SIZE[b.shape] || SIZE.box;
      const [x, y] = spotFor(api, w, h, at);
      const { parts, icon } = blockParts(b, x, y);
      const shape = convertToExcalidrawElements(parts as Skeleton[]);
      let img: ReturnType<typeof convertToExcalidrawElements> = [];
      if (b.icon && icon) {
        try {
          const tone = TONES[b.tone] || TONES.plain;
          const logo = b.icon.startsWith("tech:");
          // generic icons: SVG in the block's line colour (inverted with the shapes on the dark board); logos: PNG tiles
          const dataURL = logo ? await iconPng(b.icon, "#1e1e1e") : iconSvgUrl(b.icon, tone.stroke);
          if (!dataURL) throw new Error("no icon");
          const fileId = `${logo ? "logo" : "glyph"}-${b.icon.replace(/[^a-z0-9]+/gi, "-")}-${logo ? "tile" : tone.stroke.slice(1).toLowerCase()}` as FileData["id"];
          api.addFiles([{ id: fileId, dataURL: dataURL as FileData["dataURL"], mimeType: logo ? "image/png" : "image/svg+xml", created: Date.now() }]);
          img = convertToExcalidrawElements([{ type: "image", x: icon[0], y: icon[1], width: 28, height: 28, fileId, status: "saved" } as Skeleton]);
        } catch {
          // no icon: the labelled block still goes in
        }
      }
      // one group, so the block, its label, its decoration and its icon move together. Everything but
      // the labelled shape is locked: locked elements can't take an arrow, so arrows always bind to
      // the block itself (not its icon or a cylinder's lid), and a click anywhere on it picks the block
      const gid = `blk-${Math.random().toString(36).slice(2, 10)}`;
      const container = shape.find((e) => (e as { customData?: unknown }).customData) || shape.find((e) => e.type !== "text" && e.boundElements?.some((b) => b.type === "text"));
      const els = [...shape, ...img].map((e) => ({ ...e, groupIds: [gid], locked: e.id !== container?.id && !(e.type === "text" && e.containerId) }));
      api.updateScene({ elements: [...api.getSceneElements(), ...els], appState: { selectedElementIds: Object.fromEntries(els.map((e) => [e.id, true])), selectedGroupIds: { [gid]: true } } as never });
    },
    [api],
  );

  const pick = useCallback(
    (b: Block) => {
      void add(b);
      // on a phone the sheet covers part of the board: get it out of the way to show the new block
      if (!wide) setOpen(false);
    },
    [add, wide],
  );

  // dragging a component from the panel onto the board (mouse and pen; on touch, tap places it)
  const overBoard = (cx: number, cy: number) => {
    const r = stage.current?.getBoundingClientRect();
    if (!r || cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return false;
    const under = document.elementFromPoint(cx, cy);
    return !!under && !!stage.current?.contains(under) && !under.closest("[data-board-panel]");
  };
  const startDrag = useCallback((b: Block, e: React.PointerEvent) => {
    setDrag({ block: b, x: e.clientX, y: e.clientY, over: false });
  }, []);
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, over: overBoard(e.clientX, e.clientY) } : d));
    const up = (e: PointerEvent) => {
      const block = drag.block;
      setDrag(null);
      if (!api || !overBoard(e.clientX, e.clientY)) return;
      const st = api.getAppState();
      const z = st.zoom.value;
      void add(block, { x: (e.clientX - st.offsetLeft) / z - st.scrollX, y: (e.clientY - st.offsetTop) / z - st.scrollY });
    };
    const cancel = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    // only (re)subscribe when a drag starts or ends
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag, api, add]);

  const initialData = useMemo(
    () => ({
      elements: (initial?.elements ?? []) as never,
      files: refreshOldIcons(initial?.files) as never,
      appState: { viewBackgroundColor: "#ffffff", currentItemRoughness: 0, currentItemFontFamily: 6, currentItemEndArrowhead: "arrow", currentItemStrokeWidth: 2 } as never,
      scrollToContent: (initial?.elements.length ?? 0) > 0,
    }),
    [initial],
  );

  const btn = "inline-flex min-h-9 items-center gap-1.5 border px-2.5 font-mono text-[12px]";
  return (
    <div ref={root} className={`hk-board ${full ? "fixed inset-0 z-[150] flex flex-col gap-1.5 bg-bg p-2 sm:p-3" : "relative isolate flex scroll-mt-[calc(var(--hk-header-h,64px)+8px)] flex-col"}`}>
      <div className={`flex items-center gap-2 border border-line-strong bg-surface px-2 py-1.5 ${full ? "" : "border-b-0"}`}>
        <button
          type="button"
          onClick={() => setOpen(!panelOpen)}
          aria-expanded={panelOpen}
          aria-controls="hk-board-library"
          className={`${btn} ${panelOpen ? "border-signal text-fg" : "border-line-strong text-fg-2 hover:border-fg-3 hover:text-fg"}`}
        >
          {wide ? panelOpen ? <PanelLeftClose className="h-4 w-4" aria-hidden /> : <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <Shapes className="h-4 w-4" aria-hidden />}
          components
        </button>
        <span className="hidden min-w-0 truncate font-mono text-[11px] text-fg-4 md:block">click to add · drag onto the board · draw arrows block to block (A)</span>
        <span className="ml-auto" />
        <button type="button" onClick={() => setFull((f) => !f)} aria-pressed={full} className={`${btn} border-line-strong text-fg hover:border-fg-3`}>
          {full ? <Minimize2 className="h-3.5 w-3.5" aria-hidden /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden />}
          {full ? "exit full screen" : "full screen"}
        </button>
      </div>
      <div
        ref={stage}
        className={`relative flex overflow-hidden border border-line-strong ${full ? "min-h-0 flex-1" : wide ? "h-[min(680px,calc(100dvh-150px-var(--hk-board-reserve,0px)))] min-h-[460px]" : "h-[clamp(400px,calc(100dvh-210px-var(--hk-board-reserve,0px)),680px)]"}`}
      >
        {panelOpen && <LibraryPanel id="hk-board-library" sheet={!wide} narrow={!roomy} disabled={!api} onPick={pick} onDragStart={startDrag} onClose={() => setOpen(false)} />}
        <div className={`hk-board-stage relative min-w-0 flex-1 ${roomy ? "" : "hk-board-narrow"}`}>
          <Excalidraw
            excalidrawAPI={setApi}
            theme={theme}
            aiEnabled={false}
            initialData={initialData}
            onChange={(elements, _state, files) => save(elements as never, files)}
            UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false, saveAsImage: true, export: { saveFileToDisk: true } }, tools: { image: false } }}
          />
        </div>
      </div>
      <p className="m-0 mt-1.5 font-mono text-[11px] leading-relaxed text-fg-4">
        Double-click a block to rename it · arrows drawn from block to block stay attached · saves as you go · export a PNG from the ☰ menu
      </p>
      {drag && (
        <div
          aria-hidden
          className={`pointer-events-none fixed z-[300] flex items-center gap-2 border bg-surface px-2.5 py-1.5 font-mono text-[12px] text-fg shadow-lg ${drag.over ? "border-signal" : "border-line-strong opacity-80"}`}
          style={{ left: drag.x + 10, top: drag.y + 10 }}
        >
          <Glyph icon={drag.block.icon} tone={drag.block.tone} />
          {drag.block.label}
        </div>
      )}
    </div>
  );
}
