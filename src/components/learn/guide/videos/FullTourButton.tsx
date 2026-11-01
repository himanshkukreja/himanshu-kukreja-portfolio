"use client";

/** "Watch the full tour (12 min)": opens the master video in the shared player. Nothing until it's published. */
import { Play } from "lucide-react";
import { guideVideo, openGuideVideo } from "@/lib/learn/guide/videos";

export default function FullTourButton({ className = "" }: { className?: string }) {
  const tour = guideVideo("full-tour");
  if (!tour) return null;
  const min = Math.max(1, Math.round(tour.duration / 60));
  return (
    <button
      type="button"
      onClick={() => openGuideVideo(tour.id, "guide")}
      aria-label={`Watch the full tour, a ${min}-minute video of every feature, with chapters`}
      className={`inline-flex min-h-12 items-center gap-2.5 border border-line-strong px-5 text-[15px] font-semibold text-fg hover:bg-surface-2 ${className}`}
    >
      <Play className="h-4 w-4 fill-current text-signal-text" aria-hidden />
      Watch the full tour ({min} min)
    </button>
  );
}
