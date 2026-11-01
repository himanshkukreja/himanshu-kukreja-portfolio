"use client";

/**
 * Guide contents: a sticky list beside the article on desktop, a sticky "jump to" menu under the
 * site header on phones and tablets. Both highlight the section being read.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type TocItem = { id: string; label: string; n?: string };

function useActive(items: TocItem[]) {
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const [on, setOn] = useState(ids[0] || "");
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setOn(vis.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);
  return on;
}

export function GuideTocSide({ items }: { items: TocItem[] }) {
  const on = useActive(items);
  return (
    <nav aria-label="Guide contents" className="sticky top-[calc(var(--hk-header-h,61px)+28px)] flex max-h-[calc(100vh-var(--hk-header-h,61px)-56px)] flex-col gap-3 overflow-y-auto pb-6">
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">On this page</span>
      <ol className="m-0 flex list-none flex-col border-l border-line p-0">
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              aria-current={on === it.id ? "true" : undefined}
              className={`-ml-px flex min-h-9 items-center gap-2 border-l-2 py-1 pl-3 pr-2 text-[13px] leading-snug ${
                on === it.id ? "border-signal font-semibold text-fg" : "border-transparent text-fg-3 hover:text-fg"
              }`}
            >
              {it.n && <span className={`font-mono text-[11px] ${on === it.id ? "text-signal-text" : "text-fg-4"}`}>{it.n}</span>}
              {it.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Phones and tablets: one sticky bar under the site header that names the section you're in and opens the full list. */
export function GuideTocMenu({ items }: { items: TocItem[] }) {
  const on = useActive(items);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLElement>(null);
  const cur = items.find((i) => i.id === on) || items[0];

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        box.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", away);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", away);
    };
  }, [open]);

  return (
    <nav ref={box} aria-label="Jump to a section" className="sticky top-[var(--hk-header-h,57px)] z-30 -mx-4 border-y border-line bg-bg/95 backdrop-blur sm:-mx-6 lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="guide-jump"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center gap-3 px-4 text-left sm:px-6"
      >
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-label text-fg-3">jump to</span>
        <span className="flex min-w-0 flex-1 items-baseline gap-2 text-[14px] font-semibold text-fg">
          {cur?.n && <span className="font-mono text-[12px] text-signal-text">{cur.n}</span>}
          <span className="truncate">{cur?.label}</span>
        </span>
        <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-fg-3 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      <ol
        id="guide-jump"
        hidden={!open}
        className={`absolute inset-x-0 top-full m-0 ${open ? "grid" : "hidden"} max-h-[min(70vh,560px)] list-none grid-cols-1 overflow-y-auto overscroll-contain border-b border-line-strong bg-bg p-2 shadow-[0_16px_32px_rgba(0,0,0,0.12)] sm:grid-cols-2 sm:px-4`}
      >
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              onClick={() => setOpen(false)}
              aria-current={on === it.id ? "true" : undefined}
              className={`flex min-h-11 items-center gap-2.5 px-3 text-[14px] ${on === it.id ? "bg-surface-2 font-semibold text-fg" : "text-fg-2 hover:bg-surface-2"}`}
            >
              <span className={`w-5 shrink-0 font-mono text-[12px] ${on === it.id ? "text-signal-text" : "text-fg-4"}`}>{it.n || ""}</span>
              {it.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
