"use client";

/**
 * The feature-video player: a native <dialog> (focus stays inside, Esc closes, the page behind is
 * inert), the video with its chapters (tap to jump), "Try it" for the feature page, and previous /
 * next through the series. Full screen on phones; a framed box with the chapters beside the video
 * from lg up. Loaded on the first open only (GuideVideoHost imports it lazily).
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { GUIDE_VIDEOS, SERIES_SIZE, fmtClock, type GuideVideo } from "@/lib/learn/guide/videos";
import { holdAttention } from "@/lib/learn/guide/attention";
import GuidePlayer from "./GuidePlayer";

export function seriesLabel(v: GuideVideo): string {
  if (v.n === 0) return "Welcome";
  if (v.n === 99) return "The full tour";
  return `Feature ${String(v.n).padStart(2, "0")} of ${SERIES_SIZE}`;
}

export default function GuideVideoModal({ id, at, from, onClose, onGo }: { id: string; at?: number; from: string; onClose: () => void; onGo: (id: string) => void }) {
  const d = useRef<HTMLDialogElement>(null);
  const el = useRef<HTMLVideoElement | null>(null);
  const [clock, setClock] = useState({ id, t: at || 0 });
  const time = clock.id === id ? clock.t : 0;
  const setTime = (t: number) => setClock({ id, t });
  const i = GUIDE_VIDEOS.findIndex((v) => v.id === id);
  const video = GUIDE_VIDEOS[i];
  const prev = i > 0 ? GUIDE_VIDEOS[i - 1] : null;
  const next = i >= 0 && i < GUIDE_VIDEOS.length - 1 ? GUIDE_VIDEOS[i + 1] : null;

  useEffect(() => {
    const dlg = d.current;
    if (!dlg) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!dlg.open) dlg.showModal();
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    const release = holdAttention();
    return () => {
      html.style.overflow = overflow;
      release();
      if (dlg.open) dlg.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  if (!video) return null;
  const chapters = video.chapters;
  let on = -1;
  chapters.forEach((c, k) => {
    if (c.t <= time + 0.25) on = k;
  });

  const seek = (t: number) => {
    const v = el.current;
    if (!v) return;
    v.currentTime = t;
    setTime(t);
    v.play().catch(() => {});
  };

  return (
    <dialog
      ref={d}
      aria-labelledby="gv-title"
      className="m-0 h-[100dvh] max-h-none w-screen max-w-none overflow-hidden bg-transparent p-0 text-fg backdrop:bg-black/85"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="flex h-full w-full items-stretch justify-center sm:items-center sm:p-4 lg:p-6"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="flex h-full w-full max-w-[1480px] flex-col overflow-hidden bg-bg sm:h-auto sm:max-h-full sm:border sm:border-line-strong">
          <div className="flex shrink-0 items-center gap-3 border-b border-line py-1.5 pl-4 pr-1.5 sm:pl-5">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
              <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">{seriesLabel(video)}</span>
              <h2 id="gv-title" className="m-0 truncate font-display text-[18px] font-bold leading-tight tracking-[-0.02em] text-fg sm:text-[21px]">
                {video.title}
              </h2>
            </span>
            <button type="button" onClick={onClose} aria-label="Close video" className="grid h-11 w-11 shrink-0 place-items-center text-fg-3 hover:bg-surface-2 hover:text-fg">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain lg:flex-row lg:overflow-hidden">
            <div className="shrink-0 bg-black lg:flex lg:min-w-0 lg:flex-1 lg:items-center">
              <GuidePlayer
                key={video.id}
                video={video}
                from={from}
                at={at}
                autoPlay
                onTime={setTime}
                elRef={(v) => {
                  el.current = v;
                }}
                className="max-h-[60dvh] sm:max-h-[64dvh] lg:max-h-[calc(100dvh-7.5rem)]"
              />
            </div>

            {/* lg+: the details column takes the video's height and scrolls inside it */}
            <div className="lg:relative lg:w-[340px] lg:shrink-0 lg:border-l lg:border-line xl:w-[380px]">
              <aside aria-label="About this video" className="flex flex-col gap-5 p-4 sm:p-5 lg:absolute lg:inset-0 lg:overflow-y-auto">
                <p className="m-0 text-[15px] leading-relaxed text-fg-2">{video.summary}</p>
                {video.n !== 99 && (
                  <Link href={video.href} onClick={onClose} className="inline-flex min-h-11 items-center gap-2 self-start bg-signal px-4 text-[14px] font-semibold text-on-signal hover:brightness-110">
                    Try it: {video.hrefLabel} →
                  </Link>
                )}

                {chapters.length > 0 && (
                  <nav aria-label="Chapters" className="flex flex-col gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
                      Chapters · {fmtClock(video.duration)}
                    </span>
                    <ol className="m-0 flex list-none flex-col border-l border-line p-0">
                      {chapters.map((c, k) => (
                        <li key={`${c.t}-${c.label}`}>
                          <button
                            type="button"
                            onClick={() => seek(c.t)}
                            aria-current={k === on ? "true" : undefined}
                            className={`-ml-px flex min-h-10 w-full items-baseline gap-3 border-l-2 py-1.5 pl-3 pr-2 text-left text-[14px] leading-snug hover:bg-surface-2 ${
                              k === on ? "border-signal font-semibold text-fg" : "border-transparent text-fg-2"
                            }`}
                          >
                            <span className={`w-10 shrink-0 font-mono text-[12px] ${k === on ? "text-signal-text" : "text-fg-4"}`}>{fmtClock(c.t)}</span>
                            <span className="min-w-0">{c.label}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  </nav>
                )}

                {(prev || next) && (
                  <div className="mt-auto grid grid-cols-2 gap-px border border-line bg-line">
                    {prev ? (
                      <button type="button" onClick={() => onGo(prev.id)} className="flex min-h-14 min-w-0 flex-col items-start justify-center gap-0.5 bg-bg px-3 py-2 text-left hover:bg-surface-2">
                        <span className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-label text-fg-3">
                          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                          previous
                        </span>
                        <span className="w-full truncate text-[13.5px] font-semibold text-fg">{prev.title}</span>
                      </button>
                    ) : (
                      <span className="bg-bg" />
                    )}
                    {next ? (
                      <button type="button" onClick={() => onGo(next.id)} className="flex min-h-14 min-w-0 flex-col items-end justify-center gap-0.5 bg-bg px-3 py-2 text-right hover:bg-surface-2">
                        <span className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-label text-fg-3">
                          next
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        <span className="w-full truncate text-[13.5px] font-semibold text-fg">{next.title}</span>
                      </button>
                    ) : (
                      <span className="bg-bg" />
                    )}
                  </div>
                )}
              </aside>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
