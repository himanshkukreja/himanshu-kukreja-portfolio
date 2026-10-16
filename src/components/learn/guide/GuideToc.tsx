"use client";

/**
 * Guide contents: a sticky list beside the article on desktop, a sticky row of jump chips under
 * the site header on phones. Highlights the section being read.
 */
import { useEffect, useMemo, useRef, useState } from "react";

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

export function GuideTocChips({ items }: { items: TocItem[] }) {
  const on = useActive(items);
  const row = useRef<HTMLOListElement>(null);
  // keep the active chip in view while scrolling the page
  useEffect(() => {
    const el = row.current?.querySelector<HTMLElement>(`[data-id="${on}"]`);
    const box = row.current;
    if (!el || !box) return;
    const left = el.offsetLeft - 16;
    if (left < box.scrollLeft || el.offsetLeft + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollTo({ left, behavior: "smooth" });
  }, [on]);
  return (
    <nav aria-label="Jump to a section" className="sticky top-[var(--hk-header-h,57px)] z-30 -mx-4 border-y border-line bg-bg/95 backdrop-blur sm:-mx-6 lg:hidden">
      <ol ref={row} className="m-0 flex list-none gap-1.5 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
        {items.map((it) => (
          <li key={it.id} data-id={it.id} className="shrink-0">
            <a
              href={`#${it.id}`}
              aria-current={on === it.id ? "true" : undefined}
              className={`inline-flex min-h-10 items-center whitespace-nowrap border px-3 font-mono text-[12px] ${
                on === it.id ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2"
              }`}
            >
              {it.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
