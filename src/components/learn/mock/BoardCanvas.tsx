"use client";

/**
 * The mock interview whiteboard: an Excalidraw canvas (MIT) for real boxes-and-arrows diagrams.
 * Arrows drawn from one shape to another stay attached when shapes move. The palette drops
 * labelled blocks with an icon in the middle of the view: system-design building blocks, any
 * technology logo (Redis, Kafka, PostgreSQL…), or a block of your own (name, shape, colour, icon),
 * which can be kept in "my blocks" in this browser. Full screen gives the whole window to the
 * drawing. The scene (and the icons it uses) autosaves into the run (`run.sketch`).
 *
 * Loaded on demand (next/dynamic, no SSR) from the whiteboard tab, so the rest of the room stays light.
 */
import "@excalidraw/excalidraw/index.css";
import "./board.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertToExcalidrawElements, Excalidraw } from "@excalidraw/excalidraw";
import { parseSketch } from "@/lib/learn/mock/sketch";
import { iconName, iconPng, iconSvg, searchIcons, TECH_ICONS } from "@/lib/learn/mock/board-icons";

type API = Parameters<NonNullable<React.ComponentProps<typeof Excalidraw>["excalidrawAPI"]>>[0];
type Skeleton = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>[number];
type Files = ReturnType<API["getFiles"]>;
type FileData = Files[string];

// Excalidraw's dark theme inverts the canvas colours, so shapes use light-theme colours (they show
// as the matching dark tones); icons are PNGs, which it leaves alone, so they use the colour as seen
const TONES = {
  plain: { stroke: "#1e1e1e", bg: "transparent", icon: "#e9ecef", chip: "#a3a3a8" },
  grey: { stroke: "#1e1e1e", bg: "#e9ecef", icon: "#e9ecef", chip: "#a3a3a8" },
  orange: { stroke: "#e8590c", bg: "#ffd8a8", icon: "#ff922b", chip: "#ff922b" },
  green: { stroke: "#2f9e44", bg: "#b2f2bb", icon: "#69db7c", chip: "#69db7c" },
  blue: { stroke: "#1971c2", bg: "#a5d8ff", icon: "#74c0fc", chip: "#74c0fc" },
  yellow: { stroke: "#f08c00", bg: "#ffec99", icon: "#ffd43b", chip: "#ffd43b" },
  red: { stroke: "#e03131", bg: "#ffc9c9", icon: "#ff8787", chip: "#ff8787" },
} as const;
type Tone = keyof typeof TONES;
type Shape = "rectangle" | "ellipse" | "diamond";
type Block = { label: string; shape: Shape; tone: Tone; icon?: string; dashed?: boolean };

const BLOCKS: Block[] = [
  { label: "Client", shape: "rectangle", tone: "plain", icon: "sd:browser" },
  { label: "Users", shape: "rectangle", tone: "plain", icon: "sd:users" },
  { label: "CDN", shape: "rectangle", tone: "plain", icon: "sd:cdn" },
  { label: "Load balancer", shape: "rectangle", tone: "plain", icon: "sd:load-balancer" },
  { label: "API gateway", shape: "rectangle", tone: "blue", icon: "sd:gateway" },
  { label: "API service", shape: "rectangle", tone: "orange", icon: "sd:api" },
  { label: "Worker", shape: "rectangle", tone: "grey", icon: "sd:worker" },
  { label: "Database", shape: "rectangle", tone: "green", icon: "sd:database" },
  { label: "Cache", shape: "rectangle", tone: "blue", icon: "sd:cache", dashed: true },
  { label: "Queue", shape: "rectangle", tone: "yellow", icon: "sd:queue" },
  { label: "Stream", shape: "rectangle", tone: "yellow", icon: "sd:stream" },
  { label: "Object storage", shape: "rectangle", tone: "green", icon: "sd:object-storage" },
  { label: "Search index", shape: "rectangle", tone: "blue", icon: "sd:search" },
  { label: "Scheduler", shape: "rectangle", tone: "grey", icon: "sd:cron" },
  { label: "Monitoring", shape: "rectangle", tone: "plain", icon: "sd:monitor" },
];

const SIZE: Record<Shape, [number, number]> = { rectangle: [180, 84], ellipse: [200, 112], diamond: [220, 136] };
const ICON = 30;

// Nunito: clean labels (Excalidraw's default is a hand-drawn font)
const FONT = 6;

/**
 * Where a new block goes: the first free cell of a grid laid over the visible part of the board
 * (left to right, top to bottom), so blocks never land on each other or on what's drawn.
 */
function freeSpot(api: API, w: number, h: number): [number, number] {
  const st = api.getAppState();
  const z = st.zoom.value;
  const left = -st.scrollX + 60 / z;
  const top = -st.scrollY + 90 / z;
  const viewW = st.width / z - 120 / z;
  const cols = Math.max(1, Math.floor(viewW / 240));
  const boxes = api
    .getSceneElements()
    .filter((e) => !e.isDeleted)
    .map((e) => ({ x1: Math.min(e.x, e.x + e.width), y1: Math.min(e.y, e.y + e.height), x2: Math.max(e.x, e.x + e.width), y2: Math.max(e.y, e.y + e.height) }));
  const clear = (x: number, y: number) => boxes.every((b) => x + w + 16 < b.x1 || x - 16 > b.x2 || y + h + 16 < b.y1 || y - 16 > b.y2);
  for (let k = 0; k < cols * 40; k++) {
    const x = left + (k % cols) * 240;
    const y = top + Math.floor(k / cols) * 160;
    if (clear(x, y)) return [x, y];
  }
  return [left, top];
}

const MINE_KEY = "hk.board.blocks.v1";
function readMine(): Block[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(MINE_KEY) || "[]") as Block[];
    return Array.isArray(v) ? v.filter((b) => b && typeof b.label === "string" && b.shape in SIZE && b.tone in TONES).slice(0, 24) : [];
  } catch {
    return [];
  }
}
function writeMine(v: Block[]) {
  try {
    window.localStorage.setItem(MINE_KEY, JSON.stringify(v));
  } catch {
    // storage blocked: the block still lands on this board
  }
}

/** A small inline icon for the palette (generic icons follow the text colour; logos sit on a white tile). */
function Glyph({ icon, className = "h-4 w-4" }: { icon?: string; className?: string }) {
  const svg = useMemo(() => (icon ? iconSvg(icon) : null), [icon]);
  if (!svg) return null;
  const logo = icon!.startsWith("tech:");
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center [&>svg]:h-full [&>svg]:w-full ${logo ? "rounded-[3px] bg-white p-[2px]" : ""} ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

const chip = "inline-flex min-h-9 items-center gap-1.5 border border-line px-2 font-mono text-[12px] text-fg-2 hover:border-fg-3 hover:text-fg disabled:opacity-50";

export default function BoardCanvas({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [api, setApi] = useState<API | null>(null);
  const [full, setFull] = useState(false);
  const [drawer, setDrawer] = useState<null | "logos" | "custom">(null);
  const [mine, setMine] = useState<Block[]>([]);
  const version = useRef(-1);
  const timer = useRef<number | undefined>(undefined);
  // the saved scene, read once: after that the canvas owns it
  const [initial] = useState(() => parseSketch(value));

  useEffect(() => {
    const t = window.setTimeout(() => setMine(readMine()), 0);
    return () => window.clearTimeout(t);
  }, []);

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
      const st = api?.getAppState() as { selectedElementIds?: Record<string, boolean>; editingTextElement?: unknown; editingElement?: unknown } | undefined;
      const busy = !!st && (Object.keys(st.selectedElementIds || {}).length > 0 || !!st.editingTextElement || !!st.editingElement);
      if (!busy) setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full, api]);

  const add = useCallback(
    async (b: Block) => {
      if (!api) return;
      const [w, h] = SIZE[b.shape];
      const tone = TONES[b.tone];
      const [x, y] = freeSpot(api, w, h);
      const shape = convertToExcalidrawElements([
        {
          type: b.shape,
          x,
          y,
          width: w,
          height: h,
          strokeColor: tone.stroke,
          backgroundColor: tone.bg,
          fillStyle: "solid",
          strokeWidth: 2,
          roughness: 0,
          strokeStyle: b.dashed ? "dashed" : "solid",
          roundness: b.shape === "rectangle" ? { type: 3 } : null,
          label: { text: b.label, fontSize: 16, fontFamily: FONT, strokeColor: "#1e1e1e", verticalAlign: b.icon ? "bottom" : "middle" },
        } as Skeleton,
      ]);
      let icon: ReturnType<typeof convertToExcalidrawElements> = [];
      if (b.icon) {
        try {
          const dataURL = await iconPng(b.icon, tone.icon);
          const fileId = `icon-${b.icon.replace(/[^a-z0-9]+/gi, "-")}-${tone.icon.slice(1)}` as FileData["id"];
          api.addFiles([{ id: fileId, dataURL: dataURL as FileData["dataURL"], mimeType: "image/png", created: Date.now() }]);
          const top = b.shape === "rectangle" ? 12 : b.shape === "ellipse" ? 20 : 26;
          icon = convertToExcalidrawElements([{ type: "image", x: x + w / 2 - ICON / 2, y: y + top, width: ICON, height: ICON, fileId, status: "saved" } as Skeleton]);
        } catch {
          // no icon: the labelled block still goes in
        }
      }
      // one group, so the block, its label and its icon move together
      const gid = `blk-${Math.random().toString(36).slice(2, 10)}`;
      const els = [...shape, ...icon].map((e) => ({ ...e, groupIds: [gid] }));
      api.updateScene({ elements: [...api.getSceneElements(), ...els], appState: { selectedElementIds: Object.fromEntries(els.map((e) => [e.id, true])), selectedGroupIds: { [gid]: true } } as never });
    },
    [api],
  );

  const keep = (b: Block) => {
    const next = [b, ...mine.filter((m) => m.label !== b.label)].slice(0, 24);
    setMine(next);
    writeMine(next);
  };
  const forget = (label: string) => {
    const next = mine.filter((m) => m.label !== label);
    setMine(next);
    writeMine(next);
  };

  const initialData = useMemo(
    () => ({
      elements: (initial?.elements ?? []) as never,
      files: (initial?.files ?? undefined) as never,
      appState: { viewBackgroundColor: "#ffffff", currentItemRoughness: 0, currentItemFontFamily: FONT, currentItemEndArrowhead: "arrow" } as never,
      scrollToContent: (initial?.elements.length ?? 0) > 0,
    }),
    [initial],
  );

  return (
    <div className={`hk-board ${full ? "fixed inset-0 z-[150] flex flex-col bg-[#0b0b0c] p-2 sm:p-3" : "flex flex-col"}`}>
      <div className="flex flex-col gap-1.5 border border-b-0 border-line-strong bg-surface px-2 py-1.5">
        <div className="-mx-2 flex items-center gap-1 overflow-x-auto px-2 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0">
          <span className="mr-1 font-mono text-[11px] uppercase tracking-label text-fg-3">add</span>
          {BLOCKS.map((b) => (
            <button key={b.label} type="button" onClick={() => add(b)} disabled={!api} className={chip} style={{ borderLeftColor: TONES[b.tone].chip, borderLeftWidth: 3 }}>
              <Glyph icon={b.icon} />
              {b.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={() => setDrawer((d) => (d === "logos" ? null : "logos"))} aria-expanded={drawer === "logos"} className={`${chip} ${drawer === "logos" ? "border-signal text-fg" : ""}`}>
            <Glyph icon="tech:kafka" />
            Tech logos {drawer === "logos" ? "▴" : "▾"}
          </button>
          <button type="button" onClick={() => setDrawer((d) => (d === "custom" ? null : "custom"))} aria-expanded={drawer === "custom"} className={`${chip} ${drawer === "custom" ? "border-signal text-fg" : ""}`}>
            + Custom block
          </button>
          {mine.map((b) => (
            <span key={b.label} className="inline-flex items-stretch">
              <button type="button" onClick={() => add(b)} disabled={!api} className={`${chip} border-r-0`} style={{ borderLeftColor: TONES[b.tone].chip, borderLeftWidth: 3 }} title="One of your blocks">
                <Glyph icon={b.icon} />
                {b.label}
              </button>
              <button type="button" onClick={() => forget(b.label)} aria-label={`Remove ${b.label} from my blocks`} className="min-h-9 border border-line px-1.5 font-mono text-[12px] text-fg-3 hover:text-fg">
                ×
              </button>
            </span>
          ))}
          <span className="ml-auto" />
          <button type="button" onClick={() => setFull((f) => !f)} className="min-h-9 border border-line-strong px-2.5 font-mono text-[12px] text-fg hover:border-fg-3">
            {full ? "exit full screen" : "⛶ full screen"}
          </button>
        </div>
        {drawer === "logos" && <LogoDrawer disabled={!api} onPick={(ref) => add({ label: iconName(ref), shape: "rectangle", tone: "plain", icon: ref })} />}
        {drawer === "custom" && (
          <CustomForm
            disabled={!api}
            onAdd={(b, remember) => {
              add(b);
              if (remember) keep(b);
            }}
          />
        )}
      </div>
      <div className={`relative border border-line-strong ${full ? "min-h-0 flex-1" : "h-[min(560px,68vh)]"}`}>
        <Excalidraw
          excalidrawAPI={setApi}
          theme="dark"
          initialData={initialData}
          onChange={(elements, _state, files) => save(elements as never, files)}
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false, saveAsImage: true, export: { saveFileToDisk: true } } }}
        />
      </div>
      <p className="m-0 mt-1.5 font-mono text-[11px] leading-relaxed text-fg-4">
        Click a block to drop it in, then drag it into place. Arrow tool (A): drag from one block to another and it stays attached. Double-click a block to rename it. Saves as you go; export a PNG from the menu.
      </p>
    </div>
  );
}

function LogoDrawer({ onPick, disabled }: { onPick: (ref: string) => void; disabled: boolean }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => TECH_ICONS.filter((n) => !q.trim() || n.includes(q.trim().toLowerCase()) || iconName(n).toLowerCase().includes(q.trim().toLowerCase())), [q]);
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search logos: redis, kafka, postgres…"
        aria-label="Search technology logos"
        className="min-h-9 w-full max-w-[320px] border border-line-strong bg-bg px-2.5 font-mono text-[12px] text-fg placeholder:text-fg-4"
      />
      <div className="flex max-h-[168px] flex-wrap gap-1 overflow-y-auto">
        {list.map((n) => (
          <button key={n} type="button" disabled={disabled} onClick={() => onPick(`tech:${n}`)} className={chip}>
            <Glyph icon={`tech:${n}`} />
            {iconName(n)}
          </button>
        ))}
        {list.length === 0 && <span className="font-mono text-[12px] text-fg-3">No logo by that name; try a custom block.</span>}
      </div>
    </div>
  );
}

function CustomForm({ onAdd, disabled }: { onAdd: (b: Block, remember: boolean) => void; disabled: boolean }) {
  const [label, setLabel] = useState("");
  const [shape, setShape] = useState<Shape>("rectangle");
  const [tone, setTone] = useState<Tone>("orange");
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const [q, setQ] = useState("");
  const [remember, setRemember] = useState(true);
  const icons = useMemo(() => searchIcons(q, 36), [q]);
  const name = label.trim().slice(0, 32);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    onAdd({ label: name, shape, tone, icon }, remember);
    setLabel("");
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5 border-t border-line pt-2.5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">name</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={32}
            placeholder="Fraud check, BillHub, Ledger…"
            className="min-h-9 w-[220px] border border-line-strong bg-bg px-2.5 text-[14px] text-fg placeholder:text-fg-4"
          />
        </label>
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="pb-1 font-mono text-[11px] uppercase tracking-label text-fg-3">shape</legend>
          <div className="flex gap-1">
            {(
              [
                ["rectangle", "Box"],
                ["ellipse", "Round"],
                ["diamond", "Diamond"],
              ] as const
            ).map(([s, l]) => (
              <button key={s} type="button" aria-pressed={shape === s} onClick={() => setShape(s)} className={`min-h-9 border px-2.5 font-mono text-[12px] ${shape === s ? "border-signal text-fg" : "border-line text-fg-2 hover:border-fg-3"}`}>
                {l}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="pb-1 font-mono text-[11px] uppercase tracking-label text-fg-3">colour</legend>
          <div className="flex gap-1">
            {(Object.keys(TONES) as Tone[]).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tone === t}
                aria-label={t}
                title={t}
                onClick={() => setTone(t)}
                className={`grid h-9 w-9 place-items-center border ${tone === t ? "border-signal" : "border-line hover:border-fg-3"}`}
              >
                <span className="h-4 w-4 border-2" style={{ borderColor: TONES[t].chip, background: t === "plain" ? "transparent" : `${TONES[t].chip}33` }} />
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">icon {icon ? `· ${iconName(icon)}` : "· none"}</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search icons: payment, user, kafka, lock…"
          aria-label="Search icons"
          className="min-h-9 w-full max-w-[320px] border border-line-strong bg-bg px-2.5 font-mono text-[12px] text-fg placeholder:text-fg-4"
        />
        <div className="flex max-h-[120px] flex-wrap gap-1 overflow-y-auto">
          <button type="button" aria-pressed={!icon} onClick={() => setIcon(undefined)} className={`min-h-9 border px-2 font-mono text-[12px] ${!icon ? "border-signal text-fg" : "border-line text-fg-3 hover:border-fg-3"}`}>
            no icon
          </button>
          {icons.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={icon === r}
              aria-label={iconName(r)}
              title={iconName(r)}
              onClick={() => setIcon(r)}
              className={`grid h-9 w-9 place-items-center border text-fg-2 ${icon === r ? "border-signal text-fg" : "border-line hover:border-fg-3"}`}
            >
              <Glyph icon={r} className="h-5 w-5" />
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={disabled || !name} className="min-h-9 bg-signal px-3.5 text-[13px] font-semibold text-on-signal disabled:opacity-50">
          Add to the board
        </button>
        <label className="flex items-center gap-2 text-[13px] text-fg-2">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-[#FF6B2B]" />
          keep it in my blocks
        </label>
      </div>
    </form>
  );
}
