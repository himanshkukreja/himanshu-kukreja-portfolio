"use client";

/**
 * A problem's solution video at the top of the Editorial tab (it shows only where the editorial does: after a solve,
 * three failed submits or "show the editorial"). The MP4 is a narrated 16:9 lecture recorded by
 * scripts/lecture/export.mjs from dsa-mastery's solution.json. It plays on the course's own lecture player, the one
 * SD Mastery's videos use: captions on or off, music on or off, speed, chapters and keyboard controls. The player is
 * loaded only when a video is shown.
 */
import dynamic from "next/dynamic";
import type { SolutionVideoData } from "@/lib/dsa/media";
import { DSA_LANG_LABEL, type DsaLang } from "@/lib/dsa/types";

const LecturePlayer = dynamic(() => import("@/components/learn/lecture/LecturePlayer"), {
  ssr: false,
  loading: () => <div className="aspect-video w-full animate-pulse bg-surface-2" aria-label="Loading the video" />,
});

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

export default function SolutionVideo({ video, lang, title }: { video: SolutionVideoData; lang: DsaLang; title: string }) {
  return (
    <section id="solution-video" aria-label="Solution video" className="dsa-ui flex scroll-mt-24 flex-col gap-2">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 font-mono text-[12px] font-normal uppercase tracking-label text-signal-text">Solution video · {fmt(video.duration)}</h2>
        <span className="text-[13px] text-fg-3">
          {lang !== "python" ? `The code in the video is Python; the ${DSA_LANG_LABEL[lang]} solution is below.` : "Narrated, with captions, chapters and music you can turn off."}
        </span>
      </header>
      <LecturePlayer
        lecture={video.player.lecture}
        quest={{ title, href: "#solution-video", code: "Solution" }}
        source={video.player.source}
        mediaBase={video.player.mediaBase}
      />
    </section>
  );
}
