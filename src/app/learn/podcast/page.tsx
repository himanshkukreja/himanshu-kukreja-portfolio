import type { Metadata } from "next";
import Link from "next/link";
import { listLectures } from "@/lib/learn/lecture/load";
import { PODCAST } from "@/lib/learn/podcast";
import { SITE_URL } from "@/lib/site";
import CopyField from "@/components/learn/podcast/CopyField";

export const runtime = "nodejs";
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Podcast · System Design Mastery",
  description: "Every System Design Mastery lecture as a podcast episode: system design, real systems, outages and full mock interviews, for your commute. Free.",
  alternates: { canonical: PODCAST.pagePath, types: { "application/rss+xml": PODCAST.feedPath } },
};

/** /learn/podcast: the lectures as a podcast, and how to follow it in any app. */
export default async function PodcastPage() {
  const lectures = await listLectures().catch(() => []);
  const minutes = lectures.reduce((a, l) => a + l.minutes, 0);
  const groups = [...new Set(lectures.map((l) => l.group))];
  const feed = `${SITE_URL}${PODCAST.feedPath}`;
  return (
    <main className="mx-auto flex max-w-[980px] flex-col gap-10 px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
      <header className="flex flex-col gap-3">
        <Link href="/learn/prep/lectures" className="self-start font-mono text-xs text-fg-3 hover:text-fg">
          ← lectures
        </Link>
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
          podcast · {lectures.length} episodes · {Math.floor(minutes / 60)} h {minutes % 60} min
        </span>
        <h1 className="m-0 font-display text-[clamp(34px,6vw,64px)] font-extrabold leading-[0.95] tracking-[-0.04em] text-fg">
          Learn system design on the move<span className="text-signal">.</span>
        </h1>
        <p className="m-0 max-w-[720px] text-[16px] leading-relaxed text-fg-2">
          Every lecture of the course as a podcast episode, in course order: the lessons, how UPI, WhatsApp, Netflix and Google Maps work, interview problems, low-level design, real outages and full mock interviews. Each episode links to its animated lecture, with the diagrams, quizzes and chapters, for when you&apos;re back at a screen.
        </p>
      </header>

      <section aria-labelledby="follow-h" className="flex flex-col gap-4 border border-line-strong bg-surface p-5 sm:p-6">
        <h2 id="follow-h" className="m-0 font-display text-[24px] font-bold tracking-[-0.02em] text-fg">
          Follow it in your podcast app
        </h2>
        <CopyField value={feed} label="Podcast feed (RSS)" />
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[15px] leading-relaxed text-fg-2">
          <li>
            <strong className="text-fg">Apple Podcasts (iPhone):</strong> Library → the ⋯ menu → <em>Follow a Show by URL</em>, then paste the feed.
          </li>
          <li>
            <strong className="text-fg">Pocket Casts, Overcast, AntennaPod, Podcast Addict:</strong> search or add → <em>add by URL</em>, then paste the feed.
          </li>
          <li>
            <strong className="text-fg">Anything else:</strong> any app that takes an RSS link works.
          </li>
        </ul>
      </section>

      <section aria-labelledby="eps-h" className="flex flex-col gap-3">
        <h2 id="eps-h" className="m-0 font-mono text-[12px] uppercase tracking-label text-fg-3">
          what&apos;s in it
        </h2>
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
          {groups.map((g) => {
            const ls = lectures.filter((l) => l.group === g);
            return (
              <li key={g} className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-[15px]">
                <span className="text-fg">{g}</span>
                <span className="shrink-0 font-mono text-[12px] text-fg-3">
                  {ls.length} episode{ls.length === 1 ? "" : "s"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
