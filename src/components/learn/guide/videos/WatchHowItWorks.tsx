"use client";

/**
 * The quiet "▶ watch how it works · 2:13 · read the guide →" line on a feature page: opens that
 * feature's video in the shared player (optionally at a chapter), and links to the feature's section
 * of /guide. Renders nothing until the video is published and the NEXT_PUBLIC_GUIDE_VIDEOS flag
 * is on. `guide={false}` where the page already links to the guide (or in a tight chip row).
 */
import Link from "next/link";
import { useCoursePathname } from "@/components/site/SiteMode";
import { Play } from "lucide-react";
import { chapterAt, fmtClock, guideHref, guideVideo, openGuideVideo, type GuideVideoId } from "@/lib/learn/guide/videos";

export default function WatchHowItWorks({
  id,
  chapter,
  label = "watch how it works",
  compact = false,
  guide = !compact,
  className = "",
}: {
  id: GuideVideoId;
  /** open at the chapter whose label starts with this */
  chapter?: string;
  label?: string;
  /** chip height (a row of filter chips) */
  compact?: boolean;
  /** also link to the feature's section of the guide (true), or to this anchor of it ("review") */
  guide?: boolean | string;
  className?: string;
}) {
  const path = useCoursePathname() || "";
  const v = guideVideo(id);
  if (!v) return null;
  const at = chapterAt(v, chapter);
  const button = (
    <button
      type="button"
      onClick={() => openGuideVideo(v.id, `page:${path}`, at)}
      aria-label={`${label}: ${v.title}, a ${Math.round(v.duration / 60)}-minute video`}
      className={`group inline-flex ${compact ? "min-h-8 text-[12px]" : "min-h-10 text-[13px]"} shrink-0 items-center gap-2 self-start whitespace-nowrap font-mono text-fg-3 hover:text-fg ${guide ? "" : className}`}
    >
      <span aria-hidden className={`grid ${compact ? "h-5 w-5" : "h-6 w-6"} shrink-0 place-items-center border border-line-strong text-signal-text group-hover:border-signal`}>
        <Play className="h-3 w-3 fill-current" />
      </span>
      <span>
        {label} · {fmtClock(v.duration)}
      </span>
    </button>
  );
  if (!guide) return button;
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-4 gap-y-0 self-start ${className}`}>
      {button}
      <Link
        href={typeof guide === "string" ? `/guide#${guide}` : guideHref(id)}
        className={`inline-flex ${compact ? "min-h-8 text-[12px]" : "min-h-10 text-[13px]"} items-center whitespace-nowrap font-mono text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg hover:decoration-signal`}
      >
        read the guide →
      </Link>
    </span>
  );
}
