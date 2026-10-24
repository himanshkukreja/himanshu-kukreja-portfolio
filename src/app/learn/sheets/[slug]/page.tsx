import Link from "next/link";
import { notFound } from "next/navigation";
import { getSheet, getSheetSummaries } from "@/lib/learn/sheets/load";
import { SITE_ORIGIN } from "@/lib/share/model";
import { breadcrumbs, JsonLd } from "@/lib/seo/jsonld";
import MermaidHydrator from "@/components/diagrams/MermaidHydrator";
import QuestEmblem from "@/components/learn/sidequest/QuestEmblem";
import { questBrand } from "@/components/learn/sidequest/brands";
import SheetTools from "@/components/learn/sheets/SheetTools";
import "@/app/learn/course-content.css";
import "@/app/learn/course-blocks.css";
import "@/components/learn/sheets/sheets.css";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push (revalidate-courses / publish).
export const revalidate = 86400;
export const dynamicParams = true;
/** None at build: each path renders on its first visit, then is cached (on-demand ISR). */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const s = await getSheet((await params).slug);
  if (!s) return { title: "Not Found" };
  const title = `${s.title} design sheet · System Design Mastery`;
  const description = `${s.title} in a few printable pages: the numbers, the architecture, the key flows, data model and state machine, the decisions and the failure modes. ${s.diagrams} diagrams. Free.`;
  return { title, description, alternates: { canonical: s.href }, openGraph: { title, description, type: "article" }, twitter: { card: "summary_large_image", title, description } };
}

export default async function SheetPage({ params }: Props) {
  const s = await getSheet((await params).slug);
  if (!s) notFound();
  const all = await getSheetSummaries();
  const i = all.findIndex((x) => x.slug === s.slug);
  const next = i >= 0 && i < all.length - 1 ? all[i + 1] : null;
  const host = SITE_ORIGIN.replace(/^https?:\/\//, "");
  return (
    <main className="ds-root mx-auto flex w-full max-w-[920px] flex-col gap-6 px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      <JsonLd
        data={breadcrumbs([
          { name: "Practice", path: "/learn/practice" },
          { name: "Design sheets", path: "/learn/sheets" },
          { name: s.title, path: s.href },
        ])}
      />
      <div className="ds-noprint flex flex-col gap-5">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-label text-fg-3">
          <Link href="/learn/practice" className="hover:text-fg">
            Practice
          </Link>
          <span aria-hidden>/</span>
          <Link href="/learn/sheets" className="hover:text-fg">
            Design sheets
          </Link>
          <span aria-hidden>/</span>
          <span className="text-signal-text">{s.code}</span>
        </nav>
        <div className="flex items-start gap-4">
          <QuestEmblem brand={questBrand(s.slug)} size={56} />
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="m-0 font-display text-[32px] font-extrabold leading-[0.98] tracking-[-0.04em] text-fg sm:text-[44px]">
              {s.title}, the whole design<span className="text-signal-text">.</span>
            </h1>
            {s.summary && <p className="m-0 max-w-[640px] text-[16px] leading-relaxed text-fg-2">{s.summary}</p>}
          </div>
        </div>
        <p className="m-0 font-mono text-xs text-fg-3">
          {s.diagrams} diagrams · {s.sections.length} sections · revise in ~10 min · Download PDF prints it in the light theme, diagrams included
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <SheetTools title={`${s.title} design sheet`} url={`${SITE_ORIGIN}${s.href}`} slug={s.slug} root="[data-sheet-body]" />
          <Link href={s.quest.href} className="inline-flex min-h-[48px] items-center border border-line-strong px-4 text-sm font-medium text-fg-2 hover:border-fg-3 hover:text-fg">
            Read the full quest · {s.quest.minutes} min →
          </Link>
        </div>
        {s.sections.length > 0 && (
          <nav aria-label="Sections" className="flex flex-wrap gap-1.5 border-y border-line py-3">
            {s.sections.map((h) => (
              <a key={h.id} href={`#${h.id}`} className="border border-line px-2.5 py-1.5 font-mono text-xs text-fg-2 hover:border-fg-3 hover:text-fg">
                {h.title}
              </a>
            ))}
          </nav>
        )}
      </div>

      <div className="ds-print-head">
        <strong className="font-display text-[20px]">
          {s.code} · {s.title} · design sheet
        </strong>
        <span className="font-mono text-[10px]">
          {host}
          {s.href}
        </span>
      </div>
      <article data-sheet-body className="course-content ds-sheet max-w-none" dangerouslySetInnerHTML={{ __html: s.html }} />
      <MermaidHydrator rootSelector="[data-sheet-body]" />

      <footer className="ds-noprint flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <Link href="/learn/sheets" className="font-mono text-xs text-fg-3 underline underline-offset-4 hover:text-fg">
          ← all design sheets
        </Link>
        {next && (
          <Link href={next.href} className="text-[15px] font-semibold text-fg underline decoration-line-strong underline-offset-4 hover:decoration-signal">
            Next: {next.title} →
          </Link>
        )}
      </footer>
    </main>
  );
}
