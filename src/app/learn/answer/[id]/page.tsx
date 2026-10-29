import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import KindIcon from "@/components/learn/search/KindIcon";
import { KIND_LABEL } from "@/lib/search/smart/types";
import { ANSWER_PAGES_INDEXABLE, answerText, ID_RE } from "@/lib/share/answer-model";
import { getSharedAnswer } from "@/lib/share/answers";

export const runtime = "nodejs";
// A shared answer never changes: rendered on its first visit, then served from the cache for a day.
// Hiding one in /admin/gaps revalidates the path and its data tag, so it 404s at once.
export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!ID_RE.test(id)) return null;
  return getSharedAnswer(id).catch((e) => {
    console.error("[answer] page", e instanceof Error ? e.message : e);
    return null;
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const a = await load(id);
  if (!a) notFound();
  const title = a.question.length > 90 ? `${a.question.slice(0, 89)}…` : a.question;
  const description = `${answerText(a, 150)} Answered from System Design Mastery, with ${a.cites.length} course source${a.cites.length === 1 ? "" : "s"}.`;
  return {
    title,
    description,
    alternates: { canonical: `/learn/answer/${a.id}` },
    robots: ANSWER_PAGES_INDEXABLE ? { index: true, follow: true } : { index: false, follow: true, googleBot: { index: false, follow: true } },
    openGraph: { title, description, url: `/learn/answer/${a.id}`, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedAnswerPage({ params }: Params) {
  const { id } = await params;
  const a = await load(id);
  if (!a) notFound();
  const date = new Date(a.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-4 pb-24 pt-8 sm:px-6 sm:pt-14">
      <header className="flex flex-col gap-4">
        <p className="m-0 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-label text-fg-3">
          <span className="bg-signal px-2 py-1 font-semibold text-on-signal">Asked &amp; answered</span>
          <span>from the course · shared {date}</span>
        </p>
        <h1 className="m-0 font-display text-[28px] font-extrabold leading-[1.1] tracking-[-0.02em] text-fg sm:text-[38px]">{a.question}</h1>
      </header>

      <section aria-label="Answer" className="flex flex-col gap-5 border-l-2 border-signal pl-4 sm:pl-5">
        <p className="m-0 text-[17px] leading-relaxed text-fg sm:text-[18px]">
          {a.answer.map((p, i) =>
            typeof p === "string" ? (
              <span key={i}>{p}</span>
            ) : a.cites[p] ? (
              <Link
                key={i}
                href={a.cites[p].href}
                title={a.cites[p].title}
                aria-label={`Source ${p + 1}: ${a.cites[p].title}`}
                className="mx-0.5 inline-grid h-5 min-w-5 place-items-center border border-line-strong px-1 align-[2px] font-mono text-[11px] font-semibold text-signal-text no-underline hover:border-fg-3 hover:text-fg"
              >
                {p + 1}
              </Link>
            ) : null,
          )}
        </p>
        <div className="flex flex-col gap-2">
          <h2 className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">Sources in the course</h2>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {a.cites.map((c, i) => (
              <li key={`${c.href}-${i}`} className="flex min-w-0 items-baseline gap-2.5 text-[15px]">
                <span className="w-4 shrink-0 font-mono text-[12px] text-fg-3">{i + 1}</span>
                <KindIcon kind={c.kind} className="h-3.5 w-3.5 shrink-0 translate-y-[2px] text-signal-text" />
                <span className="flex min-w-0 flex-col">
                  <Link href={c.href} className="text-fg hover:underline">
                    {c.title}
                  </Link>
                  <span className="truncate font-mono text-[11px] text-fg-4">
                    {KIND_LABEL[c.kind].tag}
                    {c.sub ? ` · ${c.sub}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <p className="m-0 text-[13px] leading-relaxed text-fg-3">
        An AI answer written only from System Design Mastery&apos;s lessons, lectures and notes, and shared by a learner. The numbers link to where the course teaches each point: check them there.
      </p>

      <aside aria-label="Ask your own question" className="flex flex-col gap-4 border border-signal bg-surface p-5 sm:p-7">
        <p className="m-0 font-display text-[22px] font-bold leading-snug text-fg">Got your own system design question?</p>
        <p className="m-0 text-[15px] leading-relaxed text-fg-2">Search the whole free course, lessons, lectures, labs and interview problems, and get an answer that cites where it comes from.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/learn/chat" className="flex min-h-[52px] items-center gap-3 bg-signal px-5 text-base font-semibold text-on-signal hover:brightness-110">
            <Search className="h-4 w-4" aria-hidden />
            <span>Ask your own question</span>
          </Link>
          <Link href="/learn" className="flex min-h-[52px] items-center gap-2 border border-line-strong px-5 text-base text-fg hover:border-fg-3">
            <span>Start the course</span>
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </aside>
    </main>
  );
}
