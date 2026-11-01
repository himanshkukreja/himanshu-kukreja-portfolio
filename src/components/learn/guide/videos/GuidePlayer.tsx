"use client";

/**
 * One feature video with the site's own controls (the lecture player's look), over a 1080p H.264
 * MP4 with no native controls. Nothing downloads until play (preload="none" + poster).
 *
 * - A big signal-orange play button while paused; a click or tap on the video plays or pauses (a tap
 *   while the controls are hidden only brings them back); a double-click goes full screen.
 * - A chapter-segmented seek bar (ChapterSegments, shared with the lecture player): click or drag,
 *   mouse or finger, with a tooltip of the time and chapter, and what has buffered.
 * - One row of controls: play, mute + volume (no slider on touch screens), time, the chapter,
 *   speed, captions, full screen (element full screen, else the iPhone's own player).
 * - Over the video on a dark scrim; they fade after 2.5 s of playback without the pointer moving,
 *   and stay while paused, dragging, hovered or focused from the keyboard.
 * - Keys while the player has focus: Space/K play, ←/→ 5 s, J/L 10 s, Home/End, ↑/↓ volume, M mute,
 *   F full screen, C captions, < and > speed.
 *
 * Captions: fetched on the first play (or the first CC press) and attached as a blob track, so a
 * media host without CORS for this origin (a preview deploy) only loses captions, never the video.
 * They're off by default (the videos have big captions burned in); on, they're read from the
 * hidden track and drawn by the player, above the controls (the native track in the iPhone's own
 * full-screen player). Analytics: video_play (first play) and video_complete (90%), once per mount.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Minimize, Pause, Play, RotateCcw, Volume1, Volume2, VolumeX } from "lucide-react";
import { track } from "@/lib/track";
import type { GuideVideo } from "@/lib/learn/guide/videos";
import ChapterSegments from "@/components/learn/video/ChapterSegments";
import { useIdle } from "@/components/learn/video/useIdle";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

type IOSVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitDisplayingFullscreen?: boolean };
type WebkitDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type WebkitEl = HTMLElement & { webkitRequestFullscreen?: () => void };

export default function GuidePlayer({
  video,
  from,
  autoPlay = false,
  at = 0,
  onTime,
  elRef,
  autoFocus = false,
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
  /** focus the player on mount, so its keys work at once */
  autoFocus?: boolean;
  /** on the <video> (e.g. a max height); not applied in full screen */
  className?: string;
}) {
  const v = useRef<HTMLVideoElement | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const trackEl = useRef<HTMLTrackElement>(null);
  const sent = useRef({ play: false, done: false });

  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [time, setTime] = useState(at || 0);
  const [dur, setDur] = useState(video.duration);
  const [buffered, setBuffered] = useState(0);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [fs, setFs] = useState(false);
  const [menu, setMenu] = useState(false);
  const [hover, setHover] = useState<{ x: number; w: number; tm: number } | null>(null);
  const [scrub, setScrub] = useState(false);
  const scrubbing = useRef(false);
  const resume = useRef(false);
  // keyboard focus on a control, or the pointer resting on the controls: they stay up
  const [kbdIn, setKbdIn] = useState(false);
  const [overControls, setOverControls] = useState(false);
  const { idle, wake } = useIdle(2500);
  // a tap that only brought the hidden controls back doesn't also play or pause
  const tapWoke = useRef(false);

  // ---------------------------------------------------------------- captions (lazy, off by default)
  const [cc, setCc] = useState<string | null>(null);
  const [ccOn, setCcOn] = useState(false);
  const [ccFailed, setCcFailed] = useState(false);
  const [cue, setCue] = useState("");
  const wantCc = useRef(false);
  const loadCaptions = useCallback(() => {
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
        setCcFailed(true);
      });
  }, [video.captions]);
  useEffect(() => () => void (cc && URL.revokeObjectURL(cc)), [cc]);
  // the track stays hidden (its cues are drawn by the player) or disabled
  useEffect(() => {
    const tt = trackEl.current?.track;
    if (!tt) return;
    const el = v.current as IOSVideo | null;
    tt.mode = ccOn ? (el?.webkitDisplayingFullscreen ? "showing" : "hidden") : "disabled";
    if (!ccOn) {
      setCue("");
      return;
    }
    const read = () => {
      const list = tt.activeCues ? Array.from(tt.activeCues) : [];
      setCue(
        list
          .map((c) => (c as VTTCue).text.replace(/<[^>]+>/g, ""))
          .join("\n")
          .trim(),
      );
    };
    read();
    tt.addEventListener("cuechange", read);
    return () => tt.removeEventListener("cuechange", read);
  }, [ccOn, cc]);
  const toggleCc = () => {
    if (!video.captions || ccFailed) return;
    loadCaptions();
    setCcOn((x) => !x);
  };

  // ---------------------------------------------------------------- start: chapter, autoplay, focus
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
      // opened by a tap: sound is allowed; if the browser still says no, the play button is right there
      el.play().catch(() => {});
    }
    // after the commit: a modal around the player focuses its first button when it opens
    const focus = autoFocus ? window.setTimeout(() => shell.current?.focus({ preventScroll: true }), 0) : 0;
    return () => window.clearTimeout(focus);
    // the element is keyed by video id, so this runs once per video
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the spinner only after a short wait, so a quick start never flashes it
  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const id = window.setTimeout(() => setSlow(true), 300);
    return () => window.clearTimeout(id);
  }, [loading]);

  // ---------------------------------------------------------------- full screen
  useEffect(() => {
    const on = () => {
      const d = document as WebkitDoc;
      const el = document.fullscreenElement ?? d.webkitFullscreenElement ?? null;
      setFs(!!el && el === shell.current);
      wake();
    };
    document.addEventListener("fullscreenchange", on);
    document.addEventListener("webkitfullscreenchange", on);
    // the iPhone's own full-screen player draws the native captions
    const el = v.current;
    const native = (showing: boolean) => () => {
      const tt = trackEl.current?.track;
      if (tt && tt.mode !== "disabled") tt.mode = showing ? "showing" : "hidden";
    };
    const begin = native(true);
    const end = native(false);
    el?.addEventListener("webkitbeginfullscreen", begin);
    el?.addEventListener("webkitendfullscreen", end);
    return () => {
      document.removeEventListener("fullscreenchange", on);
      document.removeEventListener("webkitfullscreenchange", on);
      el?.removeEventListener("webkitbeginfullscreen", begin);
      el?.removeEventListener("webkitendfullscreen", end);
    };
  }, [wake]);
  const fullscreen = () => {
    const box = shell.current as WebkitEl | null;
    const el = v.current as IOSVideo | null;
    if (!box || !el) return;
    const d = document as WebkitDoc;
    if (document.fullscreenElement || d.webkitFullscreenElement) {
      if (document.exitFullscreen) void document.exitFullscreen().catch(() => {});
      else d.webkitExitFullscreen?.();
      return;
    }
    // the iPhone has no element full screen: its own player, with its own controls
    const ios = () => el.webkitEnterFullscreen?.();
    if (box.requestFullscreen) void box.requestFullscreen().catch(ios);
    else if (box.webkitRequestFullscreen) box.webkitRequestFullscreen();
    else ios();
  };

  // ---------------------------------------------------------------- playback
  const length = () => v.current?.duration || dur || video.duration;
  const toggle = () => {
    const el = v.current;
    if (!el) return;
    if (el.paused || el.ended) void el.play().catch(() => {});
    else el.pause();
  };
  const seek = (s: number) => {
    const el = v.current;
    if (!el) return;
    const to = Math.max(0, Math.min(length() - 0.05, s));
    el.currentTime = to;
    setTime(to);
    setEnded(false);
    onTime?.(to);
  };
  const toggleMute = () => {
    const el = v.current;
    if (!el) return;
    el.muted = !el.muted;
    if (!el.muted && el.volume === 0) el.volume = 0.5;
  };
  const setVol = (x: number) => {
    const el = v.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, x));
    el.muted = el.volume === 0;
  };
  const setSpeed = (r: number) => {
    const el = v.current;
    setRate(r);
    if (el) el.playbackRate = r;
  };
  const stepSpeed = (dir: 1 | -1) => setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(rate) + dir))] ?? 1);
  const readBuffered = (el: HTMLVideoElement) => {
    const b = el.buffered;
    let end = 0;
    for (let k = 0; k < b.length; k++) if (b.start(k) <= el.currentTime + 0.5) end = Math.max(end, b.end(k));
    setBuffered(end);
  };

  // ---------------------------------------------------------------- the seek bar
  const D = Math.max(1, dur || video.duration);
  const chapters = video.chapters.length ? video.chapters : [{ t: 0, label: video.title }];
  const segments = chapters.map((c, k) => ({ key: `${c.t}-${k}`, start: k === 0 ? 0 : c.t, end: k + 1 < chapters.length ? chapters[k + 1].t : D }));
  const chapterAt = (tm: number) => {
    let on = 0;
    chapters.forEach((c, k) => {
      if (c.t <= tm + 0.25) on = k;
    });
    return chapters[on];
  };
  const here = chapterAt(time);
  const atPointer = (e: React.PointerEvent) => {
    const r = bar.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
    return { x, w: r.width, tm: (x / Math.max(1, r.width)) * D };
  };

  const shown = !playing || !idle || scrub || menu || kbdIn || overControls || !!hover;
  const multiChapter = video.chapters.length > 1;

  // ---------------------------------------------------------------- keys (only while the player has focus)
  const onKey = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (t.closest("[data-gp-menu]")) return; // the speed menu has its own keys
    wake();
    const k = e.key.toLowerCase();
    if ((k === " " || k === "enter") && t.tagName === "BUTTON") return; // the button's own click
    if (t.tagName === "INPUT" && /^(arrow|home|end|page)/.test(k)) return; // the volume slider
    const cur = v.current?.currentTime ?? time;
    const act: Record<string, () => void> = {
      " ": toggle,
      k: toggle,
      arrowleft: () => seek(cur - 5),
      arrowright: () => seek(cur + 5),
      j: () => seek(cur - 10),
      l: () => seek(cur + 10),
      home: () => seek(0),
      end: () => seek(length()),
      arrowup: () => setVol((v.current?.volume ?? 1) + 0.1),
      arrowdown: () => setVol((v.current?.volume ?? 1) - 0.1),
      m: toggleMute,
      f: fullscreen,
      c: toggleCc,
      ">": () => stepSpeed(1),
      ".": () => stepSpeed(1),
      "<": () => stepSpeed(-1),
      ",": () => stepSpeed(-1),
    };
    const fn = act[k];
    if (!fn) return;
    e.preventDefault();
    // a page's own shortcuts (a lecture behind the modal) don't also get it
    e.stopPropagation();
    fn();
  };

  // ---------------------------------------------------------------- render
  const btn =
    "grid h-10 min-w-10 shrink-0 place-items-center px-1.5 font-mono text-[12px] text-[#f3f2ee] hover:text-white disabled:opacity-40 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11";
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const tipW = 200;

  return (
    <div
      ref={shell}
      tabIndex={0}
      role="region"
      aria-label={`Video player: ${video.title}`}
      aria-keyshortcuts="Space K J L M F C ArrowLeft ArrowRight Home End"
      className={`relative w-full touch-manipulation select-none bg-black outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal focus-visible:[outline-offset:-2px] ${
        fs ? "flex h-full items-center justify-center" : ""
      } ${playing && !shown ? "cursor-none" : ""}`}
      onKeyDown={onKey}
      onPointerDownCapture={(e) => {
        tapWoke.current = e.pointerType !== "mouse" && !shown;
        wake();
      }}
      onPointerMove={(e) => {
        if (e.pointerType === "mouse") wake();
      }}
      onFocus={(e) => setKbdIn(e.target !== shell.current && e.target.matches(":focus-visible"))}
      onBlur={(e) => {
        if (!shell.current?.contains(e.relatedTarget as Node | null)) setKbdIn(false);
      }}
    >
      <video
        ref={(el) => {
          v.current = el;
          elRef?.(el);
        }}
        src={video.src}
        poster={video.poster}
        playsInline
        preload="none"
        aria-label={`${video.title} (video, ${Math.round(video.duration / 60)} minutes)`}
        className={`block w-full bg-black object-contain ${fs ? "h-full max-h-none" : `aspect-video ${className}`}`}
        onClick={() => {
          if (tapWoke.current) {
            tapWoke.current = false;
            return;
          }
          toggle();
        }}
        onDoubleClick={fullscreen}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || video.duration)}
        onDurationChange={(e) => e.currentTarget.duration && setDur(e.currentTarget.duration)}
        onProgress={(e) => readBuffered(e.currentTarget)}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onCanPlay={(e) => !e.currentTarget.paused && setLoading(false)}
        onVolumeChange={(e) => {
          setMuted(e.currentTarget.muted);
          setVolume(e.currentTarget.volume);
        }}
        onRateChange={(e) => setRate(e.currentTarget.playbackRate)}
        onPause={() => {
          setPlaying(false);
          setLoading(false);
        }}
        onEnded={() => {
          setPlaying(false);
          setEnded(true);
          setLoading(false);
        }}
        onPlay={(e) => {
          const el = e.currentTarget;
          setPlaying(true);
          setEnded(false);
          if (el.readyState < 3) setLoading(true);
          wake();
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
          if (!scrubbing.current) setTime(el.currentTime);
          readBuffered(el);
          onTime?.(el.currentTime);
          const d = el.duration || video.duration;
          if (!sent.current.done && d > 0 && el.currentTime / d >= 0.9) {
            sent.current.done = true;
            track("video_complete", { video: video.id, from, dur: Math.round(d) });
          }
        }}
      >
        {cc && <track ref={trackEl} kind="captions" srcLang="en" label="English" src={cc} />}
      </video>

      {/* captions (CC on): the hidden track's cue, above the controls while they're up */}
      {ccOn && cue && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 z-10 flex justify-center px-3 transition-[bottom] duration-200 motion-reduce:transition-none ${shown ? "bottom-[76px] sm:bottom-[84px]" : "bottom-3 sm:bottom-5"}`}
        >
          <span className="max-w-[min(90%,52rem)] whitespace-pre-line bg-black/80 px-2.5 py-1 text-center text-[clamp(13px,2.1vw,22px)] font-semibold leading-snug text-[#f3f2ee]">{cue}</span>
        </div>
      )}

      {/* paused: one big play button in the middle (replay at the end) */}
      {!playing && (
        <button
          type="button"
          onClick={toggle}
          aria-label={ended ? "Replay" : time > 0.5 ? "Resume" : "Play"}
          className="absolute left-1/2 top-1/2 z-10 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center bg-signal text-on-signal shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition-transform hover:scale-105 motion-reduce:transition-none sm:h-16 sm:w-16"
        >
          {ended ? <RotateCcw className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden /> : <Play className="ml-0.5 h-6 w-6 fill-current sm:h-7 sm:w-7" aria-hidden />}
        </button>
      )}
      {/* buffering */}
      {playing && loading && slow && (
        <span className="pointer-events-none absolute inset-0 z-10 grid place-items-center" aria-hidden>
          <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/20 border-t-signal motion-reduce:animate-none" />
        </span>
      )}

      {/* the controls: over the video on a dark scrim, fading when idle */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-2 pb-1 pt-6 transition-opacity duration-300 motion-reduce:transition-none sm:px-3 sm:pb-1.5 sm:pt-14 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      >
        <div
          ref={bar}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(D)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${fmt(time)} of ${fmt(D)}${multiChapter ? `, ${here.label}` : ""}`}
          className={`group relative mx-1 h-6 cursor-pointer touch-none [@media(pointer:coarse)]:h-8 ${shown ? "pointer-events-auto" : ""}`}
          onPointerEnter={(e) => e.pointerType === "mouse" && setOverControls(true)}
          onPointerDown={(e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            const el = v.current;
            resume.current = !!el && !el.paused;
            el?.pause();
            scrubbing.current = true;
            setScrub(true);
            const h = atPointer(e);
            setHover(h);
            seek(h.tm);
          }}
          onPointerMove={(e) => {
            const h = atPointer(e);
            if (scrubbing.current) seek(h.tm);
            if (scrubbing.current || e.pointerType === "mouse") setHover(h);
          }}
          onPointerUp={(e) => {
            if (scrubbing.current) {
              seek(atPointer(e).tm);
              scrubbing.current = false;
              setScrub(false);
              if (resume.current) void v.current?.play().catch(() => {});
            }
            if (e.pointerType !== "mouse") setHover(null);
          }}
          onPointerCancel={() => {
            scrubbing.current = false;
            setScrub(false);
            setHover(null);
          }}
          onPointerLeave={(e) => {
            if (!scrubbing.current) setHover(null);
            if (e.pointerType === "mouse") setOverControls(false);
          }}
        >
          <ChapterSegments segments={segments} time={time} duration={D} hoverTm={hover?.tm ?? null} buffered={buffered} track="bg-white/25" bufferTone="bg-white/35" active={scrub} />
          {hover && (
            <div
              className="pointer-events-none absolute bottom-full z-30 mb-1.5 flex max-w-[200px] -translate-x-1/2 flex-col items-center gap-0.5 border border-white/15 bg-[#0b0b0c]/95 px-2 py-1 shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
              style={{ left: Math.max(Math.min(tipW / 2, hover.w / 2), Math.min(hover.w - tipW / 2, hover.x)) }}
            >
              <span className="font-mono text-[12px] tabular-nums text-signal">{fmt(hover.tm)}</span>
              {multiChapter && <span className="max-w-full truncate text-[12px] font-semibold text-[#f3f2ee]">{chapterAt(hover.tm).label}</span>}
            </div>
          )}
        </div>

        <div
          role="toolbar"
          aria-label="Video controls"
          className={`flex flex-nowrap items-center gap-0.5 sm:gap-1 ${shown ? "pointer-events-auto" : ""}`}
          onPointerEnter={(e) => e.pointerType === "mouse" && setOverControls(true)}
          onPointerLeave={() => setOverControls(false)}
        >
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pause" : ended ? "Replay" : "Play"}
            title={playing ? "Pause (K)" : "Play (K)"}
            className="grid h-9 w-10 shrink-0 place-items-center bg-signal text-on-signal hover:brightness-110 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          >
            {playing ? <Pause className="h-4 w-4 fill-current" aria-hidden /> : ended ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Play className="ml-px h-4 w-4 fill-current" aria-hidden />}
          </button>

          <span className="group/vol flex shrink-0 items-center">
            <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted} title={muted ? "Unmute (M)" : "Mute (M)"} className={btn}>
              <VolIcon className="h-[18px] w-[18px]" aria-hidden />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => setVol(Number(e.target.value))}
              aria-label="Volume"
              aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)}%`}
              className="hidden h-1 w-16 cursor-pointer accent-[#ff6b2b] sm:block lg:w-20 [@media(pointer:coarse)]:!hidden"
            />
          </span>

          <span className="shrink-0 whitespace-nowrap px-1.5 font-mono text-[12px] tabular-nums text-[#f3f2ee] sm:px-2">
            {fmt(time)}
            <span className="text-white/60"> / {fmt(D)}</span>
          </span>
          {multiChapter && (
            <span className="hidden min-w-0 flex-1 truncate font-mono text-[12px] text-white/75 sm:inline" title={here.label}>
              <span aria-hidden className="text-white/40">· </span>
              {here.label}
            </span>
          )}
          <span className="ml-auto" />

          <SpeedMenu rate={rate} onPick={setSpeed} open={menu} setOpen={setMenu} btn={btn} />

          {video.captions && (
            <button
              type="button"
              onClick={toggleCc}
              disabled={ccFailed}
              aria-pressed={ccOn}
              aria-label="Captions"
              title={ccFailed ? "Captions aren't available here" : ccOn ? "Captions off (C)" : "Captions on (C)"}
              className={`${btn} relative ${ccOn ? "!text-signal" : ""}`}
            >
              CC
              {ccOn && <span aria-hidden className="absolute inset-x-2 bottom-1.5 h-0.5 bg-signal" />}
            </button>
          )}

          <button type="button" onClick={fullscreen} aria-label={fs ? "Exit full screen" : "Full screen"} title={fs ? "Exit full screen (F)" : "Full screen (F)"} className={btn}>
            {fs ? <Minimize className="h-[18px] w-[18px]" aria-hidden /> : <Maximize className="h-[18px] w-[18px]" aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Speed: a button with the current speed, and a row of choices above it (fits a phone's width). */
function SpeedMenu({ rate, onPick, open, setOpen, btn }: { rate: number; onPick: (r: number) => void; open: boolean; setOpen: (o: boolean) => void; btn: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open, setOpen]);
  const close = () => {
    setOpen(false);
    button.current?.focus({ preventScroll: true });
  };
  return (
    <span ref={box} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Playback speed, ${rate}×`}
        title="Speed (< >)"
        className={`${btn} min-w-11 ${rate !== 1 ? "!text-signal" : ""}`}
      >
        {rate}×
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Playback speed"
          aria-orientation="horizontal"
          data-gp-menu=""
          className="absolute bottom-full right-0 z-40 mb-2 flex border border-white/15 bg-[#0b0b0c]/95 p-1 shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
          onKeyDown={(e) => {
            const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
            const k = items.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === "Escape" || e.key === "Tab") {
              // Escape closes the menu, not the modal around the player
              e.preventDefault();
              e.stopPropagation();
              close();
            } else if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "Home" || e.key === "End") {
              e.preventDefault();
              e.stopPropagation();
              const to = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (k + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
              items[to]?.focus();
            }
          }}
        >
          {SPEEDS.map((r) => (
            <button
              key={r}
              type="button"
              role="menuitemradio"
              aria-checked={r === rate}
              tabIndex={r === rate ? 0 : -1}
              onClick={() => {
                onPick(r);
                close();
              }}
              className={`grid h-9 min-w-11 place-items-center px-2 font-mono text-[12px] tabular-nums [@media(pointer:coarse)]:h-11 ${r === rate ? "bg-signal font-semibold text-on-signal" : "text-[#f3f2ee] hover:bg-white/10"}`}
            >
              {r}×
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
