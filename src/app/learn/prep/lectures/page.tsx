import type { Metadata } from "next";
import Link from "next/link";
import { listLectures, lectureMediaBase } from "@/lib/learn/lecture/load";
import LectureGrid from "@/components/learn/lecture/LectureGrid";

export const runtime = "nodejs";
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Lectures · Interview prep · System Design Mastery",
  description: "Animated, narrated system design lectures for the course's lessons and side quests, with quiz checkpoints, chapters, captions and an AI you can ask about any moment.",
  alternates: { canonical: "/learn/prep/lectures" },
};

/** /learn/prep/lectures: the playlist of side-quest lectures. */
export default async function LecturesPage() {
  const lectures = await listLectures().catch(() => []);
  const minutes = lectures.reduce((a, l) => a + l.minutes, 0);
  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
      <header className="flex flex-col gap-3">
        <Link href="/learn/prep" className="self-start font-mono text-xs text-fg-3 hover:text-fg">
          ← prep
        </Link>
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
          lectures · {lectures.length} · {Math.round(minutes / 60)} h {minutes % 60} min
        </span>
        <h1 className="m-0 font-display text-[clamp(34px,6vw,64px)] font-extrabold leading-[0.95] tracking-[-0.04em] text-fg">
          Watch the whole design<span className="text-signal">.</span>
        </h1>
        <p className="m-0 max-w-[720px] text-[16px] leading-relaxed text-fg-2">
          Animated, narrated lectures that walk through each lesson and side quest: the idea, where the obvious design breaks, the real one, and what to say in the interview. Each one links back to what it builds on, stops for quick checkpoints, and lets you ask the AI about any moment.
        </p>
      </header>
      {lectures.length ? <LectureGrid lectures={lectures} mediaBase={lectureMediaBase()} /> : <p className="m-0 text-fg-3">The first lectures are on their way.</p>}
    </main>
  );
}
