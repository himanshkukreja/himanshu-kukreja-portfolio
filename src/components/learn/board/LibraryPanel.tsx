"use client";

/**
 * The whiteboard's component library: search, collapsible categories (clients, edge, compute, data,
 * messaging, infra), technology logos, the learner's own blocks and a form to make one. A side panel
 * on a wide board, a bottom sheet over the board on a phone (never more than about half of it).
 * Click (or Enter) adds a component in the middle of the view; with a mouse or pen it can also be
 * dragged onto the board.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import { iconName, iconSvg, searchIcons, TECH_ICONS } from "@/lib/learn/board/icons";
import { blockOf, CATEGORIES, searchComponents, TONES, type Block, type Shape, type Tone } from "@/lib/learn/board/library";

const CLOSED_KEY = "hk.board.lib.closed.v1";
const MINE_KEY = "hk.board.blocks.v1";
const OLD_SHAPES: Record<string, Shape> = { rectangle: "box" };

function readMine(): Block[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(MINE_KEY) || "[]") as Block[];
    if (!Array.isArray(v)) return [];
    return v
      .map((b) => (b && OLD_SHAPES[b.shape as string] ? { ...b, shape: OLD_SHAPES[b.shape as string] } : b))
      .filter((b) => b && typeof b.label === "string" && ["box", "ellipse", "diamond", "cylinder"].includes(b.shape) && b.tone in TONES)
      .slice(0, 24);
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
function readClosed(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(CLOSED_KEY) || "null");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : ["logos", "custom"];
  } catch {
    return ["logos", "custom"];
  }
}

/** A component's icon on a small tile in its category colour (logos sit on a white tile). */
export function Glyph({ icon, tone = "plain", className = "h-7 w-7" }: { icon?: string; tone?: Tone; className?: string }) {
  const svg = useMemo(() => (icon ? iconSvg(icon) : null), [icon]);
  const logo = !!icon?.startsWith("tech:");
  const [light, dark] = (TONES[tone] || TONES.plain).ui;
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center border ${logo ? "border-line bg-white p-[3px]" : "hk-tone hk-tile p-[5px]"} [&>svg]:h-full [&>svg]:w-full ${className}`}
      style={{ "--tone-l": light, "--tone-d": dark } as React.CSSProperties}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

type Props = {
  id: string;
  /** a bottom sheet over the board (phone), else a side panel */
  sheet: boolean;
  /** a slimmer side panel, for a board without much room */
  narrow?: boolean;
  disabled: boolean;
  onPick: (b: Block) => void;
  onDragStart: (b: Block, e: React.PointerEvent) => void;
  onClose: () => void;
};

export default function LibraryPanel({ id, sheet, narrow, disabled, onPick, onDragStart, onClose }: Props) {
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<string[]>(["logos", "custom"]);
  const [mine, setMine] = useState<Block[]>([]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setClosed(readClosed());
      setMine(readMine());
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  const toggle = (k: string) => {
    const next = closed.includes(k) ? closed.filter((x) => x !== k) : [...closed, k];
    setClosed(next);
    try {
      window.localStorage.setItem(CLOSED_KEY, JSON.stringify(next));
    } catch {
      /* per-viewer nicety only */
    }
  };

  const query = q.trim();
  const found = useMemo(() => searchComponents(query), [query]);
  const logos = useMemo(() => {
    const s = query.toLowerCase();
    return TECH_ICONS.filter((n) => !s || n.includes(s) || iconName(n).toLowerCase().includes(s));
  }, [query]);
  const mineFound = mine.filter((b) => !query || b.label.toLowerCase().includes(query.toLowerCase()));

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

  // a component button: click / Enter adds it; a mouse or pen drag past a few pixels drags it onto the board
  const down = useRef<{ x: number; y: number; b: Block } | null>(null);
  const itemProps = (b: Block) => ({
    type: "button" as const,
    disabled,
    onClick: () => onPick(b),
    onPointerDown: (e: React.PointerEvent) => {
      down.current = e.pointerType === "touch" || e.button !== 0 ? null : { x: e.clientX, y: e.clientY, b };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = down.current;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      down.current = null;
      onDragStart(d.b, e);
    },
    onPointerUp: () => {
      down.current = null;
    },
  });

  const item = `group flex ${sheet ? "min-h-11" : "min-h-9"} w-full min-w-0 items-center gap-2.5 px-2 text-left text-[13px] leading-tight text-fg-2 hover:bg-bg hover:text-fg focus-visible:bg-bg focus-visible:text-fg disabled:opacity-50`;
  const head = "flex min-h-9 w-full items-center gap-2 px-2 font-mono text-[11px] uppercase tracking-label text-fg-3 hover:text-fg";
  const list = sheet ? "grid grid-cols-2 gap-x-1" : "flex flex-col";

  return (
    <aside
      id={id}
      data-board-panel
      aria-label="Components"
      className={
        sheet
          ? "hk-board-sheet absolute inset-x-0 bottom-0 z-20 flex max-h-[56%] flex-col border-t border-line-strong bg-surface shadow-[0_-8px_24px_rgba(0,0,0,0.25)]"
          : `flex h-full ${narrow ? "w-[204px]" : "w-[236px]"} shrink-0 flex-col border-r border-line-strong bg-surface`
      }
    >
      <div className="flex items-center gap-1.5 border-b border-line p-2">
        <label className="relative flex min-w-0 flex-1 items-center">
          <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-fg-4" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && found[0]) onPick(blockOf(found[0]));
              e.stopPropagation();
            }}
            placeholder="Search components"
            aria-label="Search components"
            className="min-h-9 w-full border border-line-strong bg-bg pl-8 pr-2 font-mono text-[12px] text-fg outline-none placeholder:text-fg-4 focus:border-signal"
          />
        </label>
        {sheet && (
          <button type="button" onClick={onClose} aria-label="Close components" className="grid h-9 w-9 shrink-0 place-items-center border border-line-strong text-fg-2 hover:text-fg">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="hk-board-list min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
        {CATEGORIES.map((c) => {
          const items = found.filter((x) => x.cat === c.id);
          if (!items.length) return null;
          const shut = !query && closed.includes(c.id);
          return (
            <section key={c.id} className="px-1">
              <button type="button" onClick={() => toggle(c.id)} aria-expanded={!shut} className={head}>
                <Swatch tone={c.tone} />
                {c.name}
                <span className="text-fg-4">{items.length}</span>
                <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${shut ? "-rotate-90" : ""}`} aria-hidden />
              </button>
              {!shut && (
                <div className={`${list} pb-1.5`}>
                  {items.map((x) => {
                    const b = blockOf(x);
                    return (
                      <button key={x.kind} {...itemProps(b)} className={item} title={`Add ${x.name}`}>
                        <Glyph icon={x.icon} tone={b.tone} />
                        <span className="min-w-0 flex-1">{x.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        {mineFound.length > 0 && (
          <section className="px-1">
            <button type="button" onClick={() => toggle("mine")} aria-expanded={!closed.includes("mine") || !!query} className={head}>
              <Swatch tone="grey" />
              my blocks <span className="text-fg-4">{mineFound.length}</span>
              <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${closed.includes("mine") && !query ? "-rotate-90" : ""}`} aria-hidden />
            </button>
            {(!closed.includes("mine") || !!query) && (
              <div className={`${list} pb-1.5`}>
                {mineFound.map((b) => (
                  <span key={b.label} className="flex min-w-0 items-center">
                    <button {...itemProps(b)} className={item} title="One of your blocks">
                      <Glyph icon={b.icon} tone={b.tone} />
                      <span className="min-w-0 flex-1 truncate">{b.label}</span>
                    </button>
                    <button type="button" onClick={() => forget(b.label)} aria-label={`Remove ${b.label} from my blocks`} className="grid h-9 w-8 shrink-0 place-items-center text-fg-4 hover:text-fg">
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {logos.length > 0 && (
          <section className="px-1">
            <button type="button" onClick={() => toggle("logos")} aria-expanded={!closed.includes("logos") || !!query} className={head}>
              <Swatch tone="plain" />
              tech logos <span className="text-fg-4">{logos.length}</span>
              <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${closed.includes("logos") && !query ? "-rotate-90" : ""}`} aria-hidden />
            </button>
            {(!closed.includes("logos") || !!query) && (
              <div className={`${list} pb-1.5`}>
                {logos.map((n) => {
                  const b: Block = { label: iconName(n), shape: "box", tone: "plain", icon: `tech:${n}` };
                  return (
                    <button key={n} {...itemProps(b)} className={item} title={`Add ${b.label}`}>
                      <Glyph icon={b.icon} />
                      <span className="min-w-0 flex-1 truncate">{b.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {query && !found.length && !logos.length && !mineFound.length && <p className="m-0 px-3 py-2 text-[13px] text-fg-3">Nothing called that. Make it a custom block below.</p>}

        <section className="px-1">
          <button type="button" onClick={() => toggle("custom")} aria-expanded={!closed.includes("custom")} className={head}>
            <Plus className="h-3 w-3" aria-hidden />
            custom block
            <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${closed.includes("custom") ? "-rotate-90" : ""}`} aria-hidden />
          </button>
          {!closed.includes("custom") && (
            <CustomForm
              initialName={found.length ? "" : query}
              disabled={disabled}
              onAdd={(b, remember) => {
                onPick(b);
                if (remember) keep(b);
              }}
            />
          )}
        </section>
      </div>
    </aside>
  );
}

function Swatch({ tone }: { tone: Tone }) {
  const [light, dark] = TONES[tone].ui;
  return <span aria-hidden className="hk-tone hk-tile h-2.5 w-2.5 shrink-0 border" style={{ "--tone-l": light, "--tone-d": dark } as React.CSSProperties} />;
}

const CUSTOM_TONES: Tone[] = ["plain", "orange", "green", "blue", "yellow", "lime", "red"];

function CustomForm({ onAdd, disabled, initialName }: { onAdd: (b: Block, remember: boolean) => void; disabled: boolean; initialName: string }) {
  const [label, setLabel] = useState(initialName);
  const [shape, setShape] = useState<Shape>("box");
  const [tone, setTone] = useState<Tone>("orange");
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const [q, setQ] = useState("");
  const [remember, setRemember] = useState(true);
  const icons = useMemo(() => searchIcons(q, 30), [q]);
  const name = label.trim().slice(0, 32);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    onAdd({ label: name, shape, tone, icon }, remember);
    setLabel("");
  };
  const lab = "font-mono text-[11px] uppercase tracking-label text-fg-3";
  const opt = (on: boolean) => `min-h-8 border px-2 font-mono text-[11px] ${on ? "border-signal text-fg" : "border-line text-fg-2 hover:border-fg-3"}`;
  return (
    <form onSubmit={submit} onKeyDown={(e) => e.stopPropagation()} className="flex flex-col gap-2.5 px-2 pb-3 pt-1">
      <label className="flex flex-col gap-1">
        <span className={lab}>name</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={32}
          placeholder="Fraud check, Ledger…"
          className="min-h-9 w-full border border-line-strong bg-bg px-2.5 text-[14px] text-fg outline-none placeholder:text-fg-4 focus:border-signal"
        />
      </label>
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className={`${lab} pb-1`}>shape</legend>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["box", "Box"],
              ["cylinder", "Store"],
              ["ellipse", "Round"],
              ["diamond", "Decision"],
            ] as const
          ).map(([s, l]) => (
            <button key={s} type="button" aria-pressed={shape === s} onClick={() => setShape(s)} className={opt(shape === s)}>
              {l}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className={`${lab} pb-1`}>colour · {TONES[tone].name.toLowerCase()}</legend>
        <div className="flex flex-wrap gap-1">
          {CUSTOM_TONES.map((t) => (
            <button key={t} type="button" aria-pressed={tone === t} aria-label={TONES[t].name} title={TONES[t].name} onClick={() => setTone(t)} className={`grid h-8 w-8 place-items-center border ${tone === t ? "border-signal" : "border-line hover:border-fg-3"}`}>
              <Swatch tone={t} />
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1">
        <span className={lab}>icon · {icon ? iconName(icon) : "none"}</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="payment, user, kafka, lock…"
          aria-label="Search icons"
          className="min-h-8 w-full border border-line-strong bg-bg px-2.5 font-mono text-[12px] text-fg outline-none placeholder:text-fg-4 focus:border-signal"
        />
        <div className="flex max-h-[112px] flex-wrap gap-1 overflow-y-auto pt-1">
          <button type="button" aria-pressed={!icon} onClick={() => setIcon(undefined)} className={opt(!icon)}>
            none
          </button>
          {icons.map((r) => (
            <button key={r} type="button" aria-pressed={icon === r} aria-label={iconName(r)} title={iconName(r)} onClick={() => setIcon(r)} className={`grid h-8 w-8 place-items-center border ${icon === r ? "border-signal" : "border-line hover:border-fg-3"}`}>
              <Glyph icon={r} tone={tone} className="h-6 w-6" />
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-[12px] text-fg-2">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-[#FF6B2B]" />
        keep it in my blocks
      </label>
      <button type="submit" disabled={disabled || !name} className="min-h-9 bg-signal px-3 text-[13px] font-semibold text-on-signal disabled:opacity-50">
        Add to the board
      </button>
    </form>
  );
}
