"use client";

/**
 * The quiet "▶ watch how it works · 2:13" line on a feature page: opens that feature's video in the
 * shared player (optionally at a chapter). Renders nothing until the video is published and the
 * NEXT_PUBLIC_GUIDE_VIDEOS flag is on.
 */
import { usePathname } from "next/navigation";
import { Play } from "lucide-react";
import { chapterAt, fmtClock, guideVideo, openGuideVideo, type GuideVideoId } from "@/lib/learn/guide/videos";

export default function WatchHowItWorks({
  id,
  chapter,
  label = "watch how it works",
  compact = false,
  className = "",
}: {
  id: GuideVideoId;
  /** open at the chapter whose label starts with this */
  chapter?: string;
  label?: string;
  /** chip height (a row of filter chips) */
  compact?: boolean;
  className?: string;
}) {
  const path = usePathname() || "";
  const v = guideVideo(id);
  if (!v) return null;
  const at = chapterAt(v, chapter);
  return (
    <button
      type="button"
      onClick={() => openGuideVideo(v.id, `page:${path}`, at)}
      aria-label={`${label}: ${v.title}, a ${Math.round(v.duration / 60)}-minute video`}
      className={`group inline-flex ${compact ? "min-h-8 text-[12px]" : "min-h-10 text-[13px]"} shrink-0 items-center gap-2 self-start whitespace-nowrap font-mono text-fg-3 hover:text-fg ${className}`}
    >
      <span aria-hidden className={`grid ${compact ? "h-5 w-5" : "h-6 w-6"} shrink-0 place-items-center border border-line-strong text-signal-text group-hover:border-signal`}>
        <Play className="h-3 w-3 fill-current" />
      </span>
      <span>
        {label} · {fmtClock(v.duration)}
      </span>
    </button>
  );
}
