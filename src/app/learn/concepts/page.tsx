import Link from "next/link";
import { getCatalogue } from "@/lib/concepts/load";
import { refCode } from "@/lib/concepts/match";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push.
export const revalidate = 86400;

export const metadata = {
  title: "System design concepts, A to Z · System Design Mastery",
  description: "Every system design concept the course teaches, defined in one line with a 2-minute refresher and the lesson that teaches it: sharding, consistent hashing, idempotency, CAP, sagas and more. Free.",
  alternates: { canonical: "/learn/concepts" },
};

export default async function ConceptsIndex() {
  const { catalogue } = await getCatalogue();
  const sorted = [...catalogue.concepts].sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
  const groups = new Map<string, typeof sorted>();
  for (const c of sorted) {
    const k = /^[a-z]/i.test(c.term) ? c.term[0].toUpperCase() : "#";
    groups.set(k, [...(groups.get(k) || []), c]);
  }
  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="flex flex-col gap-3">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">Learn · concepts</span>
        <h1 className="font-display text-[40px] font-extrabold leading-[0.98] tracking-[-0.04em] text-fg sm:text-[56px]">{sorted.length} concepts, A to Z.</h1>
        <p className="m-0 max-w-[680px] text-[17px] leading-relaxed text-fg-2">Every idea the course teaches, in one line, with a two-minute refresher and the lesson that teaches it properly.</p>
        <nav aria-label="Jump to letter" className="flex flex-wrap gap-1">
          {[...groups.keys()].map((k) => (
            <a key={k} href={`#l-${k}`} className="grid h-9 w-9 place-items-center border border-line-strong font-mono text-xs text-fg hover:border-fg-3">
              {k}
            </a>
          ))}
        </nav>
      </header>
      {[...groups.entries()].map(([k, list]) => (
        <section key={k} id={`l-${k}`} aria-label={k} className="flex scroll-mt-24 flex-col gap-2">
          <h2 className="m-0 font-display text-[28px] font-bold text-fg">{k}</h2>
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {list.map((c) => (
              <li key={c.id}>
                <Link href={`/learn/concepts/${c.id}`} className="flex h-full flex-col gap-1 border border-line bg-surface p-4 hover:border-fg-3">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-fg">{c.term}</span>
                    <span className="shrink-0 font-mono text-[11px] text-fg-3">{refCode(c.taught.lesson)}</span>
                  </span>
                  <span className="text-sm leading-relaxed text-fg-2">{c.definition}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
