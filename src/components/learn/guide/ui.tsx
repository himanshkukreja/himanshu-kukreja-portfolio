/** Building blocks of the course guide (Level Up: square corners, 1px rules, mono labels). */
import Link from "next/link";
import type { ReactNode } from "react";

export const LABEL = "font-mono text-[11px] uppercase tracking-label text-fg-3";
export const PROSE = "flex max-w-[70ch] flex-col gap-4 text-[16px] leading-relaxed text-fg-2 [&_strong]:font-semibold [&_strong]:text-fg";

export function Section({ id, n, kicker, title, lead, children }: { id: string; n: string; kicker: string; title: ReactNode; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-[calc(var(--hk-header-h,61px)+72px)] flex-col gap-7 border-t border-line pt-10 lg:scroll-mt-[calc(var(--hk-header-h,61px)+24px)]">
      <div className="flex flex-col gap-3">
        <span className={LABEL}>
          <span className="text-signal-text">{n}</span> · {kicker}
        </span>
        <h2 id={`${id}-h`} className="font-display text-[32px] font-extrabold leading-[1] tracking-[-0.035em] text-fg sm:text-[44px]">
          {title}
          <span className="text-signal-text">.</span>
        </h2>
        {lead && <p className="max-w-[64ch] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

export function Sub({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="scroll-mt-28 font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-fg sm:text-[26px]">
      {children}
    </h3>
  );
}

export function Where({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 flex max-w-[72ch] flex-wrap items-baseline gap-x-2 gap-y-1 border border-dashed border-line-strong px-4 py-3 text-[14px] leading-relaxed text-fg-2 [&_a]:font-semibold [&_a]:text-signal-text [&_a]:underline [&_a]:decoration-line-strong [&_a]:underline-offset-4">
      <span className={`${LABEL} text-fg`}>where to find it</span>
      <span>{children}</span>
    </p>
  );
}

export function Note({ title, children, tone = "plain" }: { title: string; children: ReactNode; tone?: "plain" | "signal" }) {
  return (
    <div className={`flex max-w-[72ch] flex-col gap-2 border bg-surface px-4 py-4 sm:px-5 ${tone === "signal" ? "border-signal" : "border-line-strong"}`}>
      <span className={`${LABEL} ${tone === "signal" ? "text-signal-text" : ""}`}>{title}</span>
      <div className="flex flex-col gap-2 text-[15px] leading-relaxed text-fg-2 [&_strong]:font-semibold [&_strong]:text-fg">{children}</div>
    </div>
  );
}

/** A plain table in a box that scrolls sideways on narrow screens (never the page). */
export function Table({ head, rows, caption, num = [] }: { head: string[]; rows: ReactNode[][]; caption?: string; num?: number[] }) {
  return (
    <div className="max-w-full overflow-x-auto border border-line">
      <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="bg-surface">
            {head.map((h, i) => (
              <th key={h} scope="col" className={`border-b border-line px-3 py-2.5 font-mono text-[11px] font-normal uppercase tracking-label text-fg-3 ${num.includes(i) ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-b-0">
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-2.5 align-top leading-snug ${j === 0 ? "text-fg" : "text-fg-2"} ${num.includes(j) ? "whitespace-nowrap text-right font-mono text-signal-text" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Steps({ items }: { items: { title: ReactNode; body: ReactNode }[] }) {
  return (
    <ol className="m-0 grid max-w-[72ch] list-none gap-px border border-line bg-line p-0">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3.5 bg-bg px-4 py-3.5">
          <span className="w-6 shrink-0 font-mono text-[13px] font-semibold text-signal-text">{String(i + 1).padStart(2, "0")}</span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-[15px] font-semibold text-fg">{it.title}</span>
            <span className="text-[14px] leading-relaxed text-fg-2">{it.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
      {children}
    </Link>
  );
}

/** Two figures side by side on wide screens, stacked on phones. */
export function Pair({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">{children}</div>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-[12px] text-fg">{children}</kbd>;
}
