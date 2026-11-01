"use client";

/**
 * A feature video inside the guide: its poster with a play button until it's tapped (no <video>,
 * no player code and no video bytes before that), then the player in place, with the chapters below
 * it as buttons (tap one to jump; before the first play it starts there). Renders nothing unless the
 * video is published (the guide shows a screenshot instead).
 */
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { Play } from "lucide-react";
import { fmtClock, guideVideo, type GuideVideoId } from "@/lib/learn/guide/videos";

const GuidePlayer = dynamic(() => import("./GuidePlayer"), { ssr: false, loading: () => <div className="aspect-video w-full bg-black" /> });

export default function InlineVideo({
  id,
  from = "guide",
  priority = false,
  showChapters = true,
  sizes = "(min-width: 1280px) 600px, (min-width: 1024px) 760px, 100vw",
}: {
  id: GuideVideoId;
  from?: string;
  /** above the fold: load the poster eagerly */
  priority?: boolean;
  showChapters?: boolean;
  sizes?: string;
}) {
  const v = guideVideo(id);
  const [start, setStart] = useState<number | null>(null);
  const [time, setTime] = useState(0);
  const el = useRef<HTMLVideoElement | null>(null);
  const focusOnMount = useRef(false);
  if (!v) return null;

  const play = (at: number) => {
    setTime(at);
    const media = el.current;
    if (media) {
      media.currentTime = at;
      media.play().catch(() => {});
      return;
    }
    focusOnMount.current = true;
    setStart(at);
  };

  const chapters = showChapters ? v.chapters : [];
  let on = -1;
  if (start !== null)
    chapters.forEach((c, k) => {
      if (c.t <= time + 0.25) on = k;
    });
  const nn = v.n >= 1 && v.n <= 12 ? String(v.n).padStart(2, "0") : null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="relative border border-line-strong bg-black">
        {start === null ? (
          <button
            type="button"
            onClick={() => play(0)}
            aria-label={`Play the video: ${v.title} (${fmtClock(v.duration)}, with sound)`}
            className="group relative block aspect-video w-full overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- the video's own poster, served from the media host */}
            <img
              src={v.poster}
              srcSet={v.thumb === v.poster ? undefined : `${v.thumb} 640w, ${v.poster} 1280w`}
              sizes={sizes}
              width={1280}
              height={720}
              alt=""
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : undefined}
              decoding="async"
              className="block h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.015] motion-reduce:transition-none dark:brightness-[0.92]"
            />
            <span aria-hidden className="absolute inset-0 grid place-items-center">
              <span className="grid h-14 w-14 place-items-center bg-signal text-on-signal shadow-[0_6px_24px_rgba(0,0,0,0.3)] transition-transform group-hover:scale-105 motion-reduce:transition-none sm:h-16 sm:w-16">
                <Play className="ml-0.5 h-6 w-6 fill-current sm:h-7 sm:w-7" />
              </span>
            </span>
            <span aria-hidden className="absolute bottom-2 left-2 flex items-center gap-2 bg-black/80 px-2 py-1 font-mono text-[12px] text-white">
              {nn && <span className="text-signal">{nn}</span>}
              {fmtClock(v.duration)} · sound on
            </span>
          </button>
        ) : (
          <GuidePlayer
            key={v.id}
            video={v}
            from={from}
            at={start}
            autoPlay
            onTime={setTime}
            elRef={(media) => {
              el.current = media;
              if (media && focusOnMount.current) {
                focusOnMount.current = false;
                media.focus({ preventScroll: true });
              }
            }}
          />
        )}
      </div>

      {chapters.length > 0 && (
        <nav aria-label={`Chapters of ${v.title}`} className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">chapters · tap to jump</span>
          <ol className="m-0 list-none p-0 sm:columns-2 sm:gap-x-4">
            {chapters.map((c, k) => (
              <li key={`${c.t}-${c.label}`} className="min-w-0 break-inside-avoid">
                <button
                  type="button"
                  onClick={() => play(c.t)}
                  aria-current={k === on ? "true" : undefined}
                  aria-label={`Play from ${fmtClock(c.t)}: ${c.label}`}
                  className={`flex min-h-10 w-full items-baseline gap-3 border-l-2 py-1.5 pl-2.5 pr-1 text-left text-[13.5px] leading-snug hover:bg-surface-2 ${
                    k === on ? "border-signal font-semibold text-fg" : "border-line text-fg-2"
                  }`}
                >
                  <span className={`w-9 shrink-0 font-mono text-[12px] ${k === on ? "text-signal-text" : "text-fg-4"}`}>{fmtClock(c.t)}</span>
                  <span className="min-w-0">{c.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </div>
  );
}
