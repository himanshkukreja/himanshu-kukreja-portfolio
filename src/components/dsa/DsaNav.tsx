import Link from "next/link";
import { DsaMark } from "./DsaMark";

/**
 * DSA Mastery's section bar under the site header (full mode only): the mark, the world map, the problems, and the
 * way back to System Design Mastery. Server-rendered; `current` marks the page.
 */
export default function DsaNav({ current, crumbs = [] }: { current?: "map" | "problems" | "concept"; crumbs?: { href?: string; label: string }[] }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`inline-flex min-h-11 items-center border-b-2 px-1 font-mono text-[12px] uppercase tracking-label ${on ? "border-signal text-fg" : "border-transparent text-fg-3 hover:text-fg"}`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="DSA Mastery" className="border-b border-line bg-bg">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-5 gap-y-1 px-4 sm:px-6">
        <Link href="/dsa" className="flex min-h-11 items-center gap-2 font-display text-[16px] font-extrabold tracking-[-0.02em] text-fg">
          <DsaMark className="h-6 w-6" />
          DSA Mastery<span className="-ml-2 text-signal-text">.</span>
        </Link>
        <span className="hidden border border-line-strong px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-fg-3 sm:inline">Beta</span>
        <div className="flex items-center gap-4">
          {tab("/dsa", "World map", current === "map")}
          {tab("/dsa/problems", "Problems", current === "problems")}
        </div>
        {crumbs.length > 0 && (
          <ol className="m-0 hidden min-w-0 list-none items-center gap-2 p-0 font-mono text-[12px] text-fg-3 md:flex">
            {crumbs.map((c, i) => (
              <li key={i} className="flex min-w-0 items-center gap-2">
                <span aria-hidden>/</span>
                {c.href ? (
                  <Link href={c.href} className="truncate hover:text-fg">
                    {c.label}
                  </Link>
                ) : (
                  <span className="truncate text-fg-2">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        )}
        <Link href="/" className="ml-auto inline-flex min-h-11 items-center font-mono text-[12px] text-fg-3 hover:text-fg">
          System Design Mastery →
        </Link>
      </div>
    </nav>
  );
}
