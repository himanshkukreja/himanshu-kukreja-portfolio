import Link from "next/link";
import { notFound } from "next/navigation";
import { getCatalogue, lessonLabels } from "@/lib/concepts/load";
import { refCode, refHref, type ConceptRef } from "@/lib/concepts/match";
import { getCourseMap } from "@/lib/learn/course";
import { JsonLd, breadcrumbs } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
// Rendered once and served from the cache (on-demand ISR), refreshed daily and on every content push.
export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

async function find(id: string) {
  const { catalogue } = await getCatalogue();
  return { c: catalogue.concepts.find((x) => x.id === id) || null, all: catalogue.concepts };
}

export async function generateMetadata({ params }: Props) {
  const { c } = await find((await params).id);
  if (!c) return { title: "Not Found" };
  return {
    title: `${c.term}: system design concept · System Design Mastery`,
    description: `${c.definition} A two-minute refresher and the free lesson that teaches it.`,
    alternates: { canonical: `/learn/concepts/${c.id}` },
  };
}

export default async function ConceptPage({ params }: Props) {
  const { c, all } = await find((await params).id);
  if (!c) notFound();
  const labels = lessonLabels(await getCourseMap().catch(() => null));
  const label = (r: ConceptRef) => labels[r.lesson]?.title || r.lesson.split("/")[1]?.replace(/-/g, " ") || r.lesson;
  const related = c.related.map((id) => all.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  const path = `/learn/concepts/${c.id}`;
  const refLink = (r: ConceptRef, primary = false) => (
    <Link key={`${r.lesson}#${r.anchor}`} href={refHref(r)} className={`flex items-center justify-between gap-3 border p-4 ${primary ? "border-signal" : "border-line"} hover:border-fg-3`}>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{refCode(r.lesson)}</span>
        <span className="font-semibold text-fg">{label(r)}</span>
      </span>
      <span className="shrink-0 font-mono text-xs text-signal-text">{primary ? "learn it →" : "revisit →"}</span>
    </Link>
  );
  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <JsonLd
        data={[
          { "@context": "https://schema.org", "@type": "DefinedTerm", name: c.term, description: c.definition, url: `${SITE_URL}${path}`, inDefinedTermSet: `${SITE_URL}/learn/concepts`, ...(c.aliases.length ? { alternateName: c.aliases } : {}) },
          breadcrumbs([
            { name: "Concepts", path: "/learn/concepts" },
            { name: c.term, path },
          ]),
        ]}
      />
      <header className="flex flex-col gap-3">
        <Link href="/learn/concepts" className="font-mono text-xs uppercase tracking-label text-fg-3 hover:text-fg">
          ← all concepts
        </Link>
        <h1 className="font-display text-[40px] font-extrabold leading-[0.98] tracking-[-0.04em] text-fg sm:text-[52px]">
          {c.term}
          <span className="text-signal-text">.</span>
        </h1>
        {c.aliases.length > 0 && <span className="font-mono text-xs text-fg-3">also: {c.aliases.join(" · ")}</span>}
        <p className="m-0 text-[19px] leading-relaxed text-fg">{c.definition}</p>
      </header>
      {c.refresher.length > 0 && (
        <section aria-labelledby="refresh-h" className="flex flex-col gap-3 border border-line bg-surface p-5">
          <h2 id="refresh-h" className="m-0 font-mono text-[11px] uppercase tracking-label text-signal-text">
            the two-minute refresher
          </h2>
          <ul className="m-0 flex flex-col gap-2 pl-5 text-[15px] leading-relaxed text-fg-2">
            {c.refresher.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="where-h" className="flex flex-col gap-2">
        <h2 id="where-h" className="m-0 font-display text-2xl font-bold text-fg">
          Where the course teaches it
        </h2>
        {refLink(c.taught, true)}
        {c.also.map((r) => refLink(r))}
      </section>
      {related.length > 0 && (
        <section aria-labelledby="rel-h" className="flex flex-col gap-2">
          <h2 id="rel-h" className="m-0 font-display text-2xl font-bold text-fg">
            Related concepts
          </h2>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/learn/concepts/${r.id}`} className="inline-flex min-h-11 items-center border border-line-strong px-3.5 text-sm text-fg hover:border-fg-3">
                  {r.term}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
