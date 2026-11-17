"use client";

/**
 * Learn on one page: a sticky outline of the lesson's parts ("1 Scenario", "2 Struggle"...). It follows the scroll (the
 * part in view is marked) and each part jumps within the page. A part behind the guest sign-in card is shown locked, not
 * linked. Pure view over the lesson's own DOM: it reads the beat sections and writes nothing.
 */
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { stickyOffset } from "@/components/learn/lesson/layout";

export type PartItem = { id: string; name: string; locked: boolean };

export default function LessonParts({ parts, rootRef, onJump, className = "" }: { parts: PartItem[]; rootRef: React.RefObject<HTMLDivElement | null>; onJump: (id: string) => void; className?: string }) {
  const [now, setNow] = useState(parts[0]?.id ?? "");
  const key = parts.map((p) => p.id).join("|");

  useEffect(() => {
    const ids = key.split("|").filter(Boolean);
    let raf = 0;
    const measure = () => {
      raf = 0;
      const root = rootRef.current;
      if (!root) return;
      const line = stickyOffset() + 64;
      let cur = ids[0] ?? "";
      for (const id of ids) {
        const el = root.querySelector<HTMLElement>(`section[data-sd="stage"][data-stage-id="${id.replace(/[^a-z0-9_-]/gi, "")}"]`);
        if (!el || el.offsetParent === null) continue;
        if (el.getBoundingClientRect().top <= line) cur = id;
      }
      setNow((c) => (c === cur ? c : cur));
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [key, rootRef]);

  if (parts.length < 2) return null;
  const at = Math.max(0, parts.findIndex((p) => p.id === now));
  return (
    <nav aria-label="Parts of the lesson" data-stage-rail data-focus-hide className={`sticky top-2 z-30 -mx-1 border-b border-line bg-surface/95 px-1 py-2 backdrop-blur ${className}`}>
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-label text-fg-3" aria-live="polite">
          Part {at + 1} of {parts.length}
        </span>
        <ol className="m-0 flex min-w-0 list-none gap-1.5 overflow-x-auto p-0 [scrollbar-width:none]">
          {parts.map((p, i) => {
            const on = p.id === now;
            const base = "inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] [@media(pointer:coarse)]:min-h-11";
            return (
              <li key={p.id} className="shrink-0">
                {p.locked ? (
                  <span className={`${base} border-line text-fg-4`} title="Sign in free to read the rest">
                    <Lock className="h-3 w-3" aria-hidden />
                    {p.name}
                  </span>
                ) : (
                  <a
                    href={`#${p.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onJump(p.id);
                    }}
                    aria-current={on ? "location" : undefined}
                    className={`${base} ${on ? "border-signal bg-signal font-semibold text-on-signal" : "border-line text-fg-2 hover:bg-surface-2 hover:text-fg"}`}
                  >
                    <span aria-hidden className="font-mono text-[11px] opacity-70">
                      {i + 1}
                    </span>
                    {p.name}
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
