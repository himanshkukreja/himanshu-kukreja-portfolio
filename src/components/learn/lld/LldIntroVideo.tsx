"use client";

/**
 * The LLD track's intro lecture, inline on the LLD home (owner, 11 Nov 2026: the video itself, not just a link), on the
 * site's own video player (GuidePlayer: the lecture player's look, a chapter-segmented seek bar, speed, captions and
 * keys), plus a link to the full lecture page (checkpoints, Ask AI). Nothing downloads until play.
 */
import Link from "next/link";
import GuidePlayer from "@/components/learn/guide/videos/GuidePlayer";
import type { GuideVideo } from "@/lib/learn/guide/videos";
import type { IntroVideo } from "@/lib/learn/lld/intro";

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

export default function LldIntroVideo({ video }: { video: IntroVideo }) {
  // the guide player's video shape: same media files (MP4, poster, captions), the lecture's scenes as chapters
  const player = {
    id: "lld-intro",
    n: 0,
    title: video.title,
    summary: "",
    duration: video.duration,
    chapters: video.chapters.map((c) => ({ t: c.at, label: c.title })),
    src: video.src,
    poster: video.poster,
    thumb: video.poster,
    captions: video.captionsUrl,
    preview: null,
    vertical: null,
  } as unknown as GuideVideo;

  return (
    <section aria-label="Intro video" className="flex min-w-0 flex-col border border-line bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="m-0 font-mono text-[12px] font-normal uppercase tracking-label text-signal-text">Start here · {fmt(video.duration)} intro</h2>
        <Link href={video.href} className="font-mono text-[12px] text-fg-3 underline-offset-4 hover:text-fg hover:underline">
          full lecture page →
        </Link>
      </header>
      <GuidePlayer video={player} from="feature:low-level-design" />
    </section>
  );
}
