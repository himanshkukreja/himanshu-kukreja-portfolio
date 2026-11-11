"use client";

/**
 * The LLD track's intro lecture, inline on the LLD home (owner, 11 Nov 2026: the video itself, not just a link): the
 * recorded MP4 with its poster, captions as a same-origin track and a chapter strip, plus a link to the full lecture
 * page (checkpoints, Ask AI, speed). Loads nothing until play (preload="none").
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { IntroVideo } from "@/lib/learn/lld/intro";

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

export default function LldIntroVideo({ video }: { video: IntroVideo }) {
  const ref = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLTrackElement>(null);
  const [t, setT] = useState(0);
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
    <section aria-label="Intro video" className="flex min-w-0 flex-col border border-line bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="m-0 font-mono text-[12px] font-normal uppercase tracking-label text-signal-text">Start here · {fmt(video.duration)} intro</h2>
        <Link href={video.href} className="font-mono text-[12px] text-fg-3 underline-offset-4 hover:text-fg hover:underline">
          full lecture page →
        </Link>
      </header>
      <video ref={ref} src={video.src} poster={video.poster} controls playsInline preload="none" className="aspect-video w-full bg-[#0b0b0c]" onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}>
        {video.captions && <track ref={trackRef} kind="captions" srcLang="en" label="English" default />}
      </video>
      <ol className="m-0 flex list-none gap-1.5 overflow-x-auto p-3" aria-label="Chapters">
        {video.chapters.map((c, i) => (
          <li key={`${c.at}-${i}`} className="shrink-0">
            <button
              type="button"
              onClick={() => jump(c.at)}
              aria-current={i === cur && t > 0 ? "true" : undefined}
              className={`min-h-9 whitespace-nowrap border px-2.5 text-[13px] ${i === cur && t > 0 ? "border-signal text-fg" : "border-line-strong text-fg-2 hover:border-signal hover:text-fg"}`}
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
