"use client";

/**
 * A problem's solution video at the top of the Editorial tab (it shows only where the editorial does: after a solve,
 * three failed submits or "show the editorial"). The MP4 is a narrated 16:9 lecture recorded by
 * scripts/lecture/export.mjs from dsa-mastery's solution.json: the problem, the first attempt, the key insight, a dry
 * run, the code marker by marker, complexity, edge cases and the classic twin. Captions come with the editorial
 * (same-origin track, no CORS), chapters jump the video.
 */
import { useEffect, useRef, useState } from "react";
import type { SolutionVideoData } from "@/lib/dsa/media";
import { DSA_LANG_LABEL, type DsaLang } from "@/lib/dsa/types";

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

export default function SolutionVideo({ video, lang }: { video: SolutionVideoData; lang: DsaLang }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  const trackRef = useRef<HTMLTrackElement>(null);
  // the captions as a same-origin blob track (set on the element: a fresh URL each time the effect runs)
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !video.captions) return;
    const url = URL.createObjectURL(new Blob([video.captions], { type: "text/vtt" }));
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [video.captions]);

  const cur = video.chapters.reduce((k, c, i) => (t >= c.at ? i : k), 0);
  const jump = (at: number) => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = at;
    void v.play().catch(() => {});
  };

  return (
    <section aria-label="Solution video" className="dsa-ui flex flex-col border border-line bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="m-0 font-mono text-[12px] font-normal uppercase tracking-label text-signal-text">Solution video · {fmt(video.duration)}</h2>
        <span className="text-[13px] text-fg-3">
          {lang !== "python" ? `The code in the video is Python; the ${DSA_LANG_LABEL[lang]} solution is below.` : "Narrated, with captions and chapters."}
        </span>
      </header>
      <video
        ref={ref}
        src={video.src}
        poster={video.poster}
        controls
        playsInline
        preload="none"
        className="aspect-video w-full bg-[#0b0b0c]"
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
      >
        {video.captions && <track ref={trackRef} kind="captions" srcLang="en" label="English" default />}
      </video>
      <ol className="m-0 flex list-none flex-wrap gap-1.5 p-3" aria-label="Chapters">
        {video.chapters.map((c, i) => (
          <li key={`${c.at}-${i}`}>
            <button
              type="button"
              onClick={() => jump(c.at)}
              aria-current={i === cur && t > 0 ? "true" : undefined}
              className={`min-h-9 border px-2.5 text-[13px] ${i === cur && t > 0 ? "border-signal text-fg" : "border-line-strong text-fg-2 hover:border-signal hover:text-fg"}`}
            >
              <span className="mr-1.5 font-mono text-[11px] text-fg-3">{fmt(c.at)}</span>
              {c.title}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
