"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import { useGame } from "@/game/GameProvider";
import { CARTRIDGES, questId, type CartridgeId } from "./cartridges";
import type { DemoProps } from "./useTicker";
import SiaDemo from "./demos/SiaDemo";
import MarkdropDemo from "./demos/MarkdropDemo";
import IosBridgeDemo from "./demos/IosBridgeDemo";
import BridgeLinkDemo from "./demos/BridgeLinkDemo";
import WaygateDemo from "./demos/WaygateDemo";
import ObscuraDemo from "./demos/ObscuraDemo";
import CodeflowDemo from "./demos/CodeflowDemo";

const DEMOS: Record<CartridgeId, ComponentType<DemoProps>> = {
  sia: SiaDemo,
  markdrop: MarkdropDemo,
  "ios-bridge": IosBridgeDemo,
  bridgelink: BridgeLinkDemo,
  waygate: WaygateDemo,
  obscura: ObscuraDemo,
  codeflow: CodeflowDemo,
};

export default function ProjectArcade() {
  const { award, done, hydrated } = useGame();
  const [sel, setSel] = useState<CartridgeId>("sia");
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const cleared = (id: CartridgeId) => hydrated && !!done[questId(id)];
  const clearedCount = CARTRIDGES.filter((c) => cleared(c.id)).length;

  const cur = CARTRIDGES.find((c) => c.id === sel) ?? CARTRIDGES[0];
  const Demo = DEMOS[cur.id];
  const clear = useCallback((label: string) => award(questId(sel), label), [award, sel]);

  const onShelfKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = CARTRIDGES.findIndex((c) => c.id === sel);
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (idx + 1) % CARTRIDGES.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (idx - 1 + CARTRIDGES.length) % CARTRIDGES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = CARTRIDGES.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setSel(CARTRIDGES[next].id);
    optionRefs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-6 lg:gap-9">
      {/* Title + save file */}
      <section className="flex flex-wrap items-end justify-between gap-6 lg:gap-8">
        <div className="flex flex-[1_1_560px] flex-col gap-4">
          <span className="hidden font-mono text-[13px] text-signal-text sm:block">❯ ./arcade --insert-coin</span>
          <h1 className="font-display text-[clamp(40px,9vw,140px)] font-extrabold leading-[0.84] tracking-tightest">
            Project <br className="hidden sm:inline" />
            Arcade<span className="text-signal-text">.</span>
          </h1>
          <p className="max-w-[620px] text-base leading-[1.55] text-fg-2 sm:text-[19px]">
            Every project is a cartridge. Insert one and play a 30-second demo of what it actually does. Clear all
            seven for the Completionist badge.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2.5 border border-line bg-surface p-5 sm:w-auto sm:flex-[0_1_380px]">
          <div className="flex justify-between font-mono text-xs uppercase tracking-label">
            <span className="text-fg-3">Save file</span>
            <span className="text-signal-text">{clearedCount} / 7 cleared</span>
          </div>
          <div
            className="grid grid-cols-7 gap-1"
            role="img"
            aria-label={`${clearedCount} of 7 cartridges cleared`}
          >
            {CARTRIDGES.map((c) => (
              <span key={c.id} className={`h-3 ${cleared(c.id) ? "bg-signal" : "border border-line-strong"}`} />
            ))}
          </div>
          <span className="text-[13px] text-fg-3">+40 XP per cartridge · Completionist badge +200 XP</span>
        </div>
      </section>

      <section className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] lg:gap-6">
        {/* Cartridge shelf: horizontal scroll on mobile, vertical list on desktop */}
        <div className="flex min-w-0 flex-col gap-2">
          <div
            role="listbox"
            aria-label="Cartridges"
            onKeyDown={onShelfKey}
            className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:gap-2 lg:overflow-visible lg:px-0 lg:pb-0"
          >
            {CARTRIDGES.map((c, i) => {
              const on = c.id === sel;
              const d = cleared(c.id);
              return (
                <button
                  key={c.id}
                  ref={(el) => {
                    optionRefs.current[i] = el;
                  }}
                  id={`cart-${c.id}`}
                  type="button"
                  role="option"
                  aria-selected={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => setSel(c.id)}
                  className={`flex w-[132px] shrink-0 flex-col border p-0 text-left transition-transform duration-150 lg:w-full ${
                    on ? "border-signal bg-signal text-on-signal lg:translate-x-2" : "border-line bg-surface text-fg hover:border-line-strong"
                  }`}
                >
                  <span
                    className={`flex w-full justify-between gap-2 px-2 py-[3px] font-mono text-[9px] tracking-[0.1em] lg:px-3.5 lg:py-[5px] lg:text-[10px] ${
                      on ? "bg-on-signal text-signal" : "bg-surface-2 text-fg-3"
                    }`}
                  >
                    <span>
                      {c.code}
                      {c.shelfTag && <span className="lg:hidden"> · {c.shelfTag}</span>}
                    </span>
                    <span className="hidden lg:inline">{c.rarity}</span>
                    {d && (
                      <span className="lg:hidden">
                        <span aria-hidden>✓</span>
                        <span className="sr-only">cleared</span>
                      </span>
                    )}
                  </span>
                  <span className="flex w-full items-center gap-3 p-2 lg:px-3.5 lg:py-3">
                    <span className="flex min-w-0 grow flex-col gap-[3px]">
                      <span className="font-display text-[15px] font-bold leading-[1.05] tracking-[-0.02em] lg:text-[21px]">
                        <span className="lg:hidden">{c.short}</span>
                        <span className="hidden lg:inline">{c.name}</span>
                      </span>
                      <span className="hidden text-xs opacity-80 lg:block">{c.genre}</span>
                    </span>
                    <span className="hidden flex-col items-end gap-[3px] font-mono text-xs lg:flex">
                      <span>{c.stars}</span>
                      <span className={d ? "font-semibold" : "opacity-75"}>{d ? "CLEARED" : "+40 XP"}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <Link
            href="/#rush"
            className="hidden min-h-14 items-center justify-between border border-dashed border-line-strong px-3.5 font-mono text-[13px] text-fg-2 hover:bg-surface-2 lg:flex"
          >
            <span>BONUS · tatkal-rush</span>
            <span className="text-signal-text">play on home →</span>
          </Link>
        </div>

        {/* Console + manual */}
        <div className="flex min-w-0 flex-col gap-4">
          <div key={cur.id} className="animate-hk-in border border-line-strong bg-surface p-2.5 sm:p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3 font-mono text-[10px] uppercase tracking-label sm:text-xs">
              <span className="font-semibold text-signal-text">▶ now playing · {cur.name}</span>
              <span className="text-fg-3">{cur.objective}</span>
            </div>
            <div
              role="region"
              aria-label={`${cur.name} demo`}
              className="relative box-border flex min-h-[440px] flex-col gap-3.5 border border-line bg-bg p-3 sm:p-5"
            >
              <Demo clear={clear} />
            </div>
            {cleared(cur.id) && (
              <div className="px-1 pt-3 font-mono text-xs font-semibold uppercase tracking-label text-signal-text">
                ✓ cartridge cleared · +40 XP banked
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-px border border-line bg-line">
            <div className="flex min-w-0 flex-[999_1_380px] flex-col gap-3 bg-surface p-5 sm:p-6">
              <span className="font-mono text-xs uppercase tracking-label text-fg-3">Manual · {cur.role}</span>
              <span className="font-display text-[22px] font-bold leading-[1.05] tracking-[-0.025em] sm:text-[30px]">
                {cur.pitch}
              </span>
              <ul className="flex list-disc flex-col gap-1.5 pl-[18px] text-[15px] leading-normal text-fg-2">
                {cur.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
            <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-3 bg-surface p-5 sm:p-6">
              <span className="font-mono text-xs uppercase tracking-label text-fg-3">Built with</span>
              <div className="flex flex-wrap gap-1.5">
                {cur.stack.map((s) => (
                  <span key={s} className="border border-line-strong px-2 py-1 font-mono text-xs text-fg-2">
                    {s}
                  </span>
                ))}
              </div>
              <a
                href={cur.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto inline-flex min-h-12 items-center justify-center border border-fg font-mono text-sm text-fg hover:bg-fg hover:text-bg"
              >
                {cur.cta}
              </a>
            </div>
          </div>

          <Link
            href="/#rush"
            className="flex min-h-14 items-center justify-between border border-dashed border-line-strong px-3.5 font-mono text-[13px] text-fg-2 hover:bg-surface-2 lg:hidden"
          >
            <span>BONUS · tatkal-rush</span>
            <span className="text-signal-text">play on home →</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
