import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { listDsaLectures } from "@/lib/dsa/media";
import { lectureMediaBase } from "@/lib/learn/lecture/load";
import LectureGrid from "@/components/learn/lecture/LectureGrid";
import DsaCrumbs from "@/components/dsa/DsaCrumbs";
import { SaveGroupButton } from "@/components/offline/SaveOfflineButton";

// /dsa/lectures: every DSA concept lecture in course order (module by module), on SD Mastery's playlist grid: watched
// state from the same lec:<quest> flags the player writes, posters and lengths from the published media. Staging only.

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Lectures · DSA Mastery",
  description: "Animated, narrated DSA lectures: every concept's story, the slow first attempt, the pattern traced step by step, and the template in four languages.",
  alternates: { canonical: "/dsa/lectures" },
  robots: { index: false, follow: false },
};

export default async function DsaLecturesPage() {
  if (!DSA_FULL) notFound();
  const lectures = await listDsaLectures().catch(() => []);
  const minutes = lectures.reduce((a, l) => a + l.minutes, 0);
  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
        <header className="flex flex-col gap-3">
          <DsaCrumbs items={[{ href: "/dsa", label: "Learn" }, { label: "Lectures" }]} />
          <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
            lectures · {lectures.length} · {minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`}
          </span>
          <h1 className="m-0 font-display text-[clamp(34px,6vw,64px)] font-extrabold leading-[0.95] tracking-[-0.04em] text-fg">
            Watch the pattern move<span className="text-signal-text">.</span>
          </h1>
          <p className="m-0 max-w-[720px] text-[16px] leading-relaxed text-fg-2">
            One animated lecture per lesson: the Kestrel task, the first attempt that is too slow, the idea traced step by step, and the template you will write in the interview. Each one stops for quick checkpoints and opens its lesson when you want to read it.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-[13px]">
            <Link href="/dsa/shorts" className="text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg">
              short on time? swipe the shorts →
            </Link>
            <Link href="/dsa/cheatsheets" className="text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg">
              the templates on one page →
            </Link>
          </div>
          <SaveGroupButton group="dsa-lectures" label="Save every lecture offline" className="self-start" />
        </header>
        {lectures.length ? <LectureGrid lectures={lectures} mediaBase={lectureMediaBase()} /> : <p className="m-0 text-fg-3">The first lectures are on their way.</p>}
      </main>
    </div>
  );
}
