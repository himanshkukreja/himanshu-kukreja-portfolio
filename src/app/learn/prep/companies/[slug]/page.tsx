import Link from "next/link";
import { notFound } from "next/navigation";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { getCompany } from "@/lib/learn/prep/load";
import { trackBySlug } from "@/lib/learn/tracks";
import { resolveTrack } from "@/components/learn/tracks/resolve";
import { CATEGORY_LABEL, TYPE_LABEL, type CompanyQuestion } from "@/lib/learn/prep/types";
import { breadcrumbs, JsonLd } from "@/lib/seo/jsonld";
import CompanyLogo, { LOGO_NOTE } from "@/components/learn/prep/CompanyLogo";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push (revalidate-courses).
export const revalidate = 86400;
export const dynamicParams = true;
/** None at build: each path renders on its first visit, then is cached (on-demand ISR). */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const c = await getCompany((await params).slug);
  if (!c) return { title: "Not Found" };
  const title = `${c.name} system design interview prep · System Design Mastery`;
  const description = `${c.name} system design and machine coding questions: ${c.reported} reported by candidates (with sources), ${c.questions - c.reported} that fit what ${c.name} builds, each linked to a free lesson.`;
  return { title, description, alternates: { canonical: c.href }, openGraph: { title, description, type: "article" } };
}

const LABEL = "font-mono text-[11px] uppercase tracking-label";

function Question({ q }: { q: CompanyQuestion }) {
  return (
    <li className="flex flex-col gap-2 border border-line bg-surface p-4 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[16px] font-semibold leading-snug text-fg">{q.q}</span>
        <span className={`${LABEL} text-fg-3`}>{TYPE_LABEL[q.type]}</span>
      </div>
      {q.links.length > 0 ? (
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {q.links.map((l) => (
            <Link key={l.href} href={l.href} className="font-mono text-xs text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
              {l.code} · {l.title} →
            </Link>
          ))}
        </span>
      ) : (
        <span className="font-mono text-xs text-fg-4">no lesson for this one yet</span>
      )}
      {q.sources.length > 0 && (
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-fg-3">
          {q.evidence === "reported" ? "reported in:" : "see:"}
          {q.sources.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-line-strong underline-offset-4 hover:text-fg">
              {s.label || new URL(s.url).hostname} ↗
            </a>
          ))}
        </span>
      )}
    </li>
  );
}

export default async function CompanyPage({ params }: Props) {
  const c = await getCompany((await params).slug);
  if (!c) notFound();
  // the six original prep tracks keep their hand-written study path ("why this lesson")
  const track = trackBySlug(c.slug);
  const map = track ? await getCourseMap(COURSE_ID).catch(() => null) : null;
  const curated = track && map ? resolveTrack(map, track) : null;
  const path = curated?.items.length
    ? curated.items.map((i) => ({ code: i.lesson.tag, title: i.lesson.title, href: i.lesson.href, why: i.why }))
    : c.path.map((l) => ({ ...l, why: "" }));
  const reported = c.list.filter((q) => q.evidence === "reported");
  const likely = c.list.filter((q) => q.evidence === "likely");
  return (
    <main className="mx-auto flex w-full max-w-[920px] flex-col gap-8 px-4 pb-28 pt-6 sm:px-6 sm:pt-12">
      <JsonLd
        data={breadcrumbs([
          { name: "Interview prep", path: "/learn/prep" },
          { name: "Companies", path: "/learn/prep/companies" },
          { name: c.name, path: c.href },
        ])}
      />
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-label text-fg-3">
        <Link href="/learn/prep" className="hover:text-fg">
          Prep
        </Link>
        <span aria-hidden>/</span>
        <Link href="/learn/prep/companies" className="hover:text-fg">
          Companies
        </Link>
        <span aria-hidden>/</span>
        <span className="text-signal-text">{c.name}</span>
      </nav>
      <header className="flex flex-col gap-3">
        <span className={`${LABEL} text-signal-text`}>
          {CATEGORY_LABEL[c.category]}
          {c.hq ? ` · ${c.hq}` : ""}
        </span>
        <div className="flex items-center gap-4">
          <CompanyLogo slug={c.slug} name={c.name} size={64} />
          <h1 className="m-0 font-display text-[clamp(40px,7vw,72px)] font-extrabold leading-[0.95] tracking-[-0.04em] text-fg">
            {c.name}
            <span className="text-signal-text">.</span>
          </h1>
        </div>
        {c.builds && <p className="m-0 max-w-[680px] text-[17px] leading-relaxed text-fg-2">{c.builds}</p>}
        {c.focus.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className={`${LABEL} text-fg-3`}>its questions lean on</span>
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {c.focus.map((f) => (
                <li key={f} className="border border-line-strong px-2.5 py-1 font-mono text-xs text-fg-2">
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      {c.rounds.length > 0 && (
        <section aria-labelledby="rounds-h" className="flex flex-col gap-3">
          <h2 id="rounds-h" className="m-0 font-display text-[26px] font-bold tracking-[-0.02em] text-fg">
            The rounds, as candidates describe them
          </h2>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {c.rounds.map((r, i) => (
              <li key={i} className="flex flex-col gap-1 border-l-2 border-signal pl-4">
                <span className="text-[16px] font-semibold text-fg">{r.name}</span>
                {r.note && <span className="text-[14px] text-fg-2">{r.note}</span>}
                <a href={r.source} target="_blank" rel="noopener noreferrer nofollow" className="font-mono text-xs text-fg-3 underline underline-offset-4 hover:text-fg">
                  source ↗
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="reported-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-3">
          <h2 id="reported-h" className="m-0 font-display text-[26px] font-bold tracking-[-0.02em] text-fg">
            Reported by candidates
          </h2>
          <span className="text-[13px] text-fg-3">From public interview write-ups; each links its source.</span>
        </div>
        {reported.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {reported.map((q) => (
              <Question key={q.q} q={q} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[15px] text-fg-3">We couldn&apos;t find first-hand write-ups we could check for {c.name} yet, so everything below is our pick.</p>
        )}
      </section>

      {likely.length > 0 && (
        <section aria-labelledby="likely-h" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-3">
            <h2 id="likely-h" className="m-0 font-display text-[26px] font-bold tracking-[-0.02em] text-fg">
              Likely, from what they build
            </h2>
            <span className="text-[13px] text-fg-3">Our pick, not a report: questions that fit {c.name}&apos;s products.</span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {likely.map((q) => (
              <Question key={q.q} q={q} />
            ))}
          </ul>
        </section>
      )}

      {path.length > 0 && (
        <section aria-labelledby="path-h" className="flex flex-col gap-3">
          <h2 id="path-h" className="m-0 font-display text-[26px] font-bold tracking-[-0.02em] text-fg">
            Study path
          </h2>
          <p className="m-0 text-[14px] text-fg-3">{curated?.items.length ? `An ordered path through the course for ${c.name}, and why each step is there.` : "Every lesson the questions above point to, once, in order."}</p>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {path.map((l, i) => (
              <li key={l.href}>
                <Link href={l.href} className="flex items-baseline gap-3 border border-line px-4 py-2.5 hover:border-fg-3">
                  <span className="font-mono text-xs text-fg-4">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[15px] text-fg">
                      <span className="mr-2 font-mono text-xs text-fg-3">{l.code}</span>
                      {l.title}
                    </span>
                    {l.why && <span className="text-[13px] text-fg-3">{l.why}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="m-0 text-[12px] leading-relaxed text-fg-4">{LOGO_NOTE}</p>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <Link href="/learn/prep/companies" className="font-mono text-xs text-fg-3 underline underline-offset-4 hover:text-fg">
          ← all companies
        </Link>
        <Link href={curated?.mock?.href ?? "/learn/mock"} className="text-[15px] font-semibold text-fg underline decoration-line-strong underline-offset-4 hover:decoration-signal">
          {curated?.mock ? `Sit the ${curated.mock.title} mock →` : "Sit a timed mock interview →"}
        </Link>
      </footer>
    </main>
  );
}
