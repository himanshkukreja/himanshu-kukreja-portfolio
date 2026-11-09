import Link from "next/link";

/** A DSA page's breadcrumb, at the top of the page (the header carries the course's tabs, not the trail). */
export default function DsaCrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="m-0 flex min-w-0 list-none flex-wrap items-center gap-x-2 gap-y-1 p-0 font-mono text-[12px] text-fg-3">
        {items.map((c, i) => (
          <li key={i} className="flex min-w-0 items-center gap-2">
            {i > 0 && <span aria-hidden>/</span>}
            {c.href ? (
              <Link href={c.href} className="inline-flex min-h-6 items-center truncate underline decoration-line-strong underline-offset-4 hover:text-fg">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-fg-2">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
