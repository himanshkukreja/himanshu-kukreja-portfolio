"use client";

/**
 * One feature video: the browser's own controls over a 1080p H.264 MP4, nothing downloaded until
 * play (preload="none" + poster). Captions are fetched on the first play and attached as a blob
 * track, so a media host without CORS for this origin (a preview deploy) only loses captions,
 * never the video. They're off by default: the videos have big captions burned in.
 * Analytics: video_play (first play) and video_complete (90%), once per mount.
 */
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/track";
import type { GuideVideo } from "@/lib/learn/guide/videos";

export default function GuidePlayer({
  video,
  from,
  autoPlay = false,
  at = 0,
  onTime,
  elRef,
  className = "",
}: {
  video: GuideVideo;
  /** where it was opened (analytics): guide, welcome, feature:<page>, link */
  from: string;
  autoPlay?: boolean;
  /** start here (seconds) */
  at?: number;
  onTime?: (t: number) => void;
  elRef?: (el: HTMLVideoElement | null) => void;
  className?: string;
}) {
  const v = useRef<HTMLVideoElement | null>(null);
  const sent = useRef({ play: false, done: false });
  const [cc, setCc] = useState<string | null>(null);
  const wantCc = useRef(false);

  // the first play: fetch the captions file
  const loadCaptions = () => {
    if (wantCc.current || !video.captions) return;
    wantCc.current = true;
    fetch(video.captions)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => {
        if (!v.current) return;
        setCc(URL.createObjectURL(new Blob([t], { type: "text/vtt" })));
      })
      .catch(() => {
        // no captions (offline, CORS): the burned-in ones are still there
      });
  };
  useEffect(() => () => void (cc && URL.revokeObjectURL(cc)), [cc]);

  useEffect(() => {
    const el = v.current;
    if (!el) return;
    if (at > 0) {
      const seek = () => {
        el.currentTime = at;
      };
      if (el.readyState >= 1) seek();
      else el.addEventListener("loadedmetadata", seek, { once: true });
    }
    if (autoPlay) {
      // opened by a tap: sound is allowed; if the browser still says no, the controls are right there
      el.play().catch(() => {});
    }
    // the element is keyed by video id, so this runs once per video
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <video
      ref={(el) => {
        v.current = el;
        elRef?.(el);
      }}
      src={video.src}
      poster={video.poster}
      controls
      playsInline
      preload="none"
      aria-label={`${video.title} (video, ${Math.round(video.duration / 60)} minutes)`}
      className={`block aspect-video w-full bg-black object-contain ${className}`}
      onPlay={(e) => {
        const el = e.currentTarget;
        // one thing plays at a time: the guide's trailer, a short behind the player, a Listen narration
        document.querySelectorAll<HTMLMediaElement>("video, audio").forEach((m) => {
          if (m !== el && !m.paused) m.pause();
        });
        loadCaptions();
        if (!sent.current.play) {
          sent.current.play = true;
          track("video_play", { video: video.id, from, at: Math.round(el.currentTime) });
        }
      }}
      onTimeUpdate={(e) => {
        const el = e.currentTarget;
        onTime?.(el.currentTime);
        const dur = el.duration || video.duration;
        if (!sent.current.done && dur > 0 && el.currentTime / dur >= 0.9) {
          sent.current.done = true;
          track("video_complete", { video: video.id, from, dur: Math.round(dur) });
        }
      }}
    >
      {cc && <track kind="captions" srcLang="en" label="English" src={cc} />}
    </video>
  );
}
