import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { cheatsheetHref, listCheatsheets, type CheatsheetSummary } from "@/lib/dsa/cheatsheet";
import DsaCrumbs from "@/components/dsa/DsaCrumbs";
import { LangSwitch } from "@/components/dsa/cheatsheet/CheatsheetSheet";

// /dsa/cheatsheets: every built concept's pattern sheet, module by module, with its signals and invariant (the quick
// "which pattern is this?" scan). Staging only until launch.

export const revalidate = 604800;

export const metadata: Metadata = {
  title: "Cheat sheets · DSA Mastery",
  description: "One printable page per pattern: the words that give it away, the invariant, the template in Python, Java, C++ and JavaScript, complexity and pitfalls.",
  alternates: { canonical: "/dsa/cheatsheets" },
  robots: { index: false, follow: false },
};

export default async function DsaCheatsheetsPage() {
  if (!DSA_FULL) notFound();
  const sheets: CheatsheetSummary[] = await listCheatsheets().catch(() => []);
  const groups: { code: string; title: string; items: typeof sheets }[] = [];
  for (const s of sheets) {
    const g = groups[groups.length - 1];
    if (g && g.code === s.code) g.items.push(s);
    else groups.push({ code: s.code, title: s.moduleTitle, items: [s] });
  }
  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1240px] flex-col gap-9 px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
        <header className="flex flex-col gap-3">
          <DsaCrumbs items={[{ href: "/dsa", label: "Learn" }, { label: "Cheat sheets" }]} />
          <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">cheat sheets · {sheets.length}</span>
          <h1 className="m-0 font-display text-[clamp(34px,6vw,64px)] font-extrabold leading-[0.95] tracking-[-0.04em] text-fg">
            Every pattern on one page<span className="text-signal-text">.</span>
          </h1>
          <p className="m-0 max-w-[720px] text-[16px] leading-relaxed text-fg-2">
            For the night before the interview: the words that give a pattern away, the one rule it keeps, its template in your language, what it costs, and the mistakes that cost people the offer. Each sheet prints on its own.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <LangSwitch />
            <span className="font-mono text-[12px] text-fg-3">the sheets open in this language</span>
          </div>
        </header>
        {groups.map((g) => (
          <section key={g.code} aria-labelledby={`cs-${g.code}`} className="flex flex-col gap-4">
            <h2 id={`cs-${g.code}`} className="m-0 font-mono text-[12px] uppercase tracking-label text-fg-3">
              <span className="text-signal-text">{g.code}</span> · {g.title} · {g.items.length} sheet{g.items.length === 1 ? "" : "s"}
            </h2>
            <ol className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((s) => (
                <li key={s.id} className="min-w-0">
                  <Link href={cheatsheetHref(s.id)} className="group flex h-full flex-col gap-3 border border-line-strong bg-surface p-4 hover:border-signal">
                    <span className="font-display text-[20px] font-bold leading-tight tracking-[-0.02em] text-fg group-hover:text-signal-text">{s.title}</span>
                    <span className="border-l-2 border-signal pl-3 text-[13.5px] leading-snug text-fg-2">{s.invariant}</span>
                    <span className="mt-auto flex flex-wrap gap-1">
                      {s.signals.slice(0, 5).map((x) => (
                        <span key={x} className="border border-line px-1.5 py-0.5 font-mono text-[11px] text-fg-3">
                          {x}
                        </span>
                      ))}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}
        {!sheets.length && <p className="m-0 text-fg-3">The first sheets are on their way.</p>}
      </main>
    </div>
  );
}
