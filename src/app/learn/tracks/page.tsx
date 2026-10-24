import Link from "next/link";
import { notFound } from "next/navigation";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { TRACKS } from "@/lib/learn/tracks";
import { resolveTrack } from "@/components/learn/tracks/resolve";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push.
export const revalidate = 86400;

export const metadata = {
  title: "Company prep tracks · System Design Mastery",
  description: "System design prep paths for Flipkart, Razorpay, Swiggy, Zerodha, PhonePe and Amazon India: the lessons, real-system case studies and mocks that match what each company builds. Free.",
  alternates: { canonical: "/learn/tracks" },
};

export default async function TracksPage() {
  const map = await getCourseMap(COURSE_ID);
  if (!map) notFound();
  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="flex flex-col gap-3">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">Learn · company prep tracks</span>
        <h1 className="font-display text-[40px] font-extrabold leading-[0.98] tracking-[-0.04em] text-fg sm:text-[56px]">Prepping for a specific company?</h1>
        <p className="m-0 max-w-[680px] text-[17px] leading-relaxed text-fg-2">
          Each track is an ordered path through the course built around what that company builds: its products and the systems behind them. They are not leaked or reported interview questions; they are the topics those systems force you to understand.
        </p>
      </header>
      <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {TRACKS.map((t) => {
          const r = resolveTrack(map, t);
          const minutes = r.items.reduce((a, i) => a + i.lesson.minutes, 0);
          return (
            <li key={t.slug}>
              <Link href={`/learn/tracks/${t.slug}`} className="flex h-full flex-col gap-3 border border-line-strong bg-surface p-5 hover:border-fg-3">
                <span className="font-display text-[28px] font-bold leading-none tracking-[-0.03em] text-fg">{t.company}</span>
                <span className="text-[15px] leading-relaxed text-fg-2">Builds {t.builds}.</span>
                <span className="mt-auto font-mono text-xs text-fg-3">
                  {r.items.length} stops · ~{Math.round(minutes / 60)} h{r.mock ? " · + a mock interview" : ""}
                </span>
                <span className="font-mono text-xs text-signal-text">open the track →</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
