"use client";

/**
 * Our own session replay player (lazy chunk): pulls the recording's snapshot blobs through
 * /api/admin/posthog/recordings/snapshots (admin-gated, personal key stays on the server) and plays
 * them with the rrweb Replayer that ships inside posthog-js (`posthog-js/rrweb`, the same fork that
 * recorded them). PostHog's embedded/shared player has no speed parameter or postMessage API, so
 * this is how the admin gets 0.5×–8× and "skip inactivity".
 *
 * Loading is progressive: the first small chunk (with the full snapshot) starts playback, later
 * chunks are appended with replayer.addEvent(). Inputs were masked at capture; nothing is unmasked.
 * Keyboard (player focused): space play/pause, ←/→ ∓5 s (shift: 15 s), f fullscreen, < > speed.
 */
import { Replayer, type eventWithTime } from "posthog-js/rrweb";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useAdminClient, type AdminError } from "@/components/admin/ui";
import type { NotConfigured, SnapshotSourcesRes } from "@/lib/analytics/journeys";
import { clock, cx } from "../bits";
import { chunkPlan, inactiveSegments, parseChunk, playable, WindowStore } from "./snapshots";

const BASE = "/api/admin/posthog/recordings/snapshots";
export const SPEEDS = [0.5, 1, 2, 4, 8] as const;
const PREF_KEY = "hk.replayPrefs";

type Prefs = { speed: number; skip: boolean };
function readPrefs(): Prefs {
  try {
    const v = JSON.parse(window.localStorage.getItem(PREF_KEY) || "{}") as Partial<Prefs>;
    return { speed: SPEEDS.includes(v.speed as (typeof SPEEDS)[number]) ? (v.speed as number) : 1, skip: v.skip !== false };
  } catch {
    return { speed: 1, skip: true };
  }
}
function writePrefs(p: Prefs) {
  try {
    window.localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
}

const SIGNAL = "#FF6B2B";

/** Styles for the rrweb wrapper (lives in our document; the replayed page is inside its iframe). */
const PLAYER_CSS = `
.hk-replay .replayer-wrapper{position:relative}
.hk-replay .replayer-wrapper>iframe{border:0;background:#fff;display:block}
.hk-replay .replayer-mouse{position:absolute;width:20px;height:20px;z-index:2;pointer-events:none;transition:left .05s linear,top .05s linear;
background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M4 2l16 9.5-7 1.6L9.6 20z' fill='%23111' stroke='white' stroke-width='1.5' stroke-linejoin='round'/></svg>");background-size:contain;background-repeat:no-repeat}
.hk-replay .replayer-mouse::after{content:"";display:inline-block;width:20px;height:20px;border-radius:100%;background:${SIGNAL};opacity:.28;transform:translate(-50%,-50%)}
.hk-replay .replayer-mouse.active::after{animation:hk-replay-click .3s ease-in-out 1}
.hk-replay .replayer-mouse.touch-device{background-image:none;width:56px;height:56px;margin:-28px 0 0 -28px;border:4px solid rgba(255,107,43,0);border-radius:100%}
.hk-replay .replayer-mouse.touch-device.touch-active{border-color:rgba(255,107,43,.9)}
.hk-replay .replayer-mouse.touch-device::after{opacity:0}
.hk-replay .replayer-mouse-tail{position:absolute;pointer-events:none;z-index:1}
@keyframes hk-replay-click{0%{width:56px;height:56px;opacity:.75}100%{width:20px;height:20px;opacity:.28}}
`;

const INSERT_RULES = [
  // masked / blocked blocks (posthog-js .ph-no-capture) show as a hatched placeholder
  ".ph-no-capture{background:repeating-linear-gradient(45deg,#d4d4d4 0 6px,#bdbdbd 6px 12px)!important}",
];

type Phase = "loading" | "ready" | "empty";

export type RrwebPlayerProps = {
  id: string;
  /** fill the parent's height (phone sheet / fullscreen) instead of sizing to the recording */
  fill?: boolean;
  /** snapshots couldn't be loaded at all → the shell falls back to PostHog's embedded player */
  onFail: (reason: string) => void;
  /** reload from scratch (the shell remounts the player with a new key) */
  onRetry: () => void;
};

/** Mount with `key={id + attempt}`: all state starts fresh per recording / retry. */
export default function RrwebPlayer({ id, fill, onFail, onRetry }: RrwebPlayerProps) {
  const client = useAdminClient();
  const boxRef = useRef<HTMLDivElement>(null); // whole player (fullscreen target, keyboard)
  const frameRef = useRef<HTMLDivElement>(null); // letterbox area
  const hostRef = useRef<HTMLDivElement>(null); // rrweb root (scaled)
  const replayerRef = useRef<Replayer | null>(null);
  const storeRef = useRef(new WindowStore());
  const baseRef = useRef(0);
  const endRef = useRef(0); // absolute end (sources end or last event)
  const allLoadedRef = useRef(false);
  const wantPlayRef = useRef(true);
  const bufferingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const onFailRef = useRef(onFail);
  useEffect(() => {
    onFailRef.current = onFail;
  }, [onFail]);

  const [phase, setPhase] = useState<Phase>("loading");
  const [chunks, setChunks] = useState({ done: 0, total: 0 });
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [loadedUntil, setLoadedUntil] = useState(0);
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const prefsRef = useRef(prefs);
  const [pendingSeek, setPendingSeek] = useState(false);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [windows, setWindows] = useState<string[]>([]);
  const [win, setWin] = useState<string | null>(null);
  const winRef = useRef<string | null>(null);
  const [segments, setSegments] = useState<[number, number][]>([]);
  const segmentsRef = useRef<[number, number][]>([]);
  const [fs, setFs] = useState<"off" | "native" | "css">("off");

  /* ─────────────── timeline bookkeeping ─────────────── */

  const refreshTimeline = useCallback(() => {
    const w = winRef.current;
    if (!w) return;
    const store = storeRef.current;
    const base = baseRef.current;
    const last = store.lastOf(w);
    const end = Math.max(endRef.current, last);
    setTotal(Math.max(0, end - base));
    setLoadedUntil(Math.max(0, (allLoadedRef.current ? end : last) - base));
    const segs = inactiveSegments(store.byWindow.get(w) || [], base, allLoadedRef.current ? end : last);
    segmentsRef.current = segs;
    setSegments(segs);
  }, []);

  /* ─────────────── replayer lifecycle ─────────────── */

  const build = useCallback(
    (w: string, startAt: number | null) => {
      const host = hostRef.current;
      if (!host) return false;
      const store = storeRef.current;
      const events = playable(store.byWindow.get(w) || [], store.viewport);
      if (events.length < 2) return false;
      replayerRef.current?.destroy();
      host.innerHTML = "";
      const { speed } = prefsRef.current;
      const r = new Replayer(events as unknown as eventWithTime[], {
        root: host,
        speed,
        // Idle skipping is ours (see the clock below): rrweb's only triggers when an event is cast
        // right before a gap, scales its threshold with speed, and misses seeks into a gap.
        skipInactive: false,
        triggerFocus: false,
        UNSAFE_replayCanvas: false,
        useVirtualDom: false,
        showWarning: false,
        mouseTail: { strokeStyle: SIGNAL, lineWidth: 2, duration: 600 },
        insertStyleRules: INSERT_RULES,
        logger: { log: () => {}, warn: () => {} },
      });
      replayerRef.current = r;
      winRef.current = w;
      baseRef.current = r.getMetaData().startTime;
      r.on("resize", (d) => {
        const v = d as { width?: number; height?: number };
        if (v?.width && v?.height) setDims({ width: v.width, height: v.height });
      });
      r.on("finish", () => {
        if (!allLoadedRef.current) {
          bufferingRef.current = true;
          setBuffering(true);
          return;
        }
        wantPlayRef.current = false;
        setPlaying(false);
        setSkipping(false);
      });
      const meta = events.find((e) => e.type === 4)?.data as { width?: number; height?: number } | undefined;
      if (meta?.width && meta?.height) setDims({ width: meta.width, height: meta.height });
      refreshTimeline();
      const t = startAt != null ? Math.max(0, startAt - baseRef.current) : 0;
      if (wantPlayRef.current) {
        r.play(t);
        setPlaying(true);
      } else r.pause(t);
      setCurrent(t);
      setWin(w);
      return true;
    },
    [refreshTimeline]
  );

  // load sources → chunks
  useEffect(() => {
    const ctl = new AbortController();
    let off = false;

    (async () => {
      const src = await client.json<SnapshotSourcesRes | NotConfigured>(`${BASE}?id=${encodeURIComponent(id)}`, { signal: ctl.signal });
      if (off) return;
      if (!src || src.configured === false) throw Object.assign(new Error("PostHog isn't configured on the server"), { status: 503 });
      if (!src.sources.length) {
        setPhase("empty");
        return;
      }
      endRef.current = src.end ? new Date(src.end).getTime() : 0;
      const plan = chunkPlan(
        src.sources.map((s) => s.key),
        src.chunk
      );
      setChunks({ done: 0, total: plan.length });
      for (let i = 0; i < plan.length; i++) {
        const [a, b] = plan[i];
        let text: string | null = null;
        for (let attempt = 0; attempt < 3 && text == null; attempt++) {
          try {
            text = await client.text(`${BASE}?id=${encodeURIComponent(id)}&from=${a}&to=${b}`, { signal: ctl.signal });
          } catch (e) {
            if (off || ctl.signal.aborted) return;
            const st = (e as AdminError)?.status;
            if (attempt === 2 || (st && st < 500 && st !== 429)) throw e;
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          }
        }
        if (off) return;
        const pairs = parseChunk(text || "");
        const store = storeRef.current;
        store.add(pairs);
        if (i === plan.length - 1) allLoadedRef.current = true;
        const r = replayerRef.current;
        if (!r) {
          const first = store.windows()[0];
          if (first && build(first, null)) {
            setPhase("ready");
            setWindows(store.windows());
          }
        } else {
          const w = winRef.current;
          const mine = pairs.filter(([pw]) => pw === w).map(([, ev]) => ev);
          mine.sort((x, y) => x.timestamp - y.timestamp);
          for (const ev of mine) r.addEvent(ev as unknown as eventWithTime);
          setWindows(store.windows());
          refreshTimeline();
          if (bufferingRef.current && wantPlayRef.current && mine.length) {
            bufferingRef.current = false;
            setBuffering(false);
            r.play(r.getCurrentTime());
          }
          const ps = pendingSeekRef.current;
          if (ps != null && (allLoadedRef.current || store.lastOf(w || "") - baseRef.current >= ps)) {
            pendingSeekRef.current = null;
            setPendingSeek(false);
            if (wantPlayRef.current) r.play(ps);
            else r.pause(ps);
            setCurrent(ps);
          }
        }
        setChunks({ done: i + 1, total: plan.length });
      }
      if (off) return;
      allLoadedRef.current = true;
      if (!replayerRef.current) {
        setPhase("empty");
        return;
      }
      refreshTimeline();
      if (bufferingRef.current) {
        bufferingRef.current = false;
        setBuffering(false);
        wantPlayRef.current = false;
        setPlaying(false);
      }
    })().catch((e: AdminError) => {
      if (off || ctl.signal.aborted) return;
      if (e?.status === 404) {
        setPhase("empty");
        return;
      }
      const msg = e?.message || "snapshots failed to load";
      if (!replayerRef.current) onFailRef.current(msg);
      else {
        allLoadedRef.current = true;
        setLoadErr(msg);
        refreshTimeline();
      }
    });

    return () => {
      off = true;
      ctl.abort();
      replayerRef.current?.destroy();
      replayerRef.current = null;
    };
  }, [client, id, build, refreshTimeline]);

  /* ─────────────── clock ─────────────── */

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let lastSet = 0;
    let hideNotice = 0;
    const tick = (ts: number) => {
      const r = replayerRef.current;
      if (r && ts - lastSet > 80) {
        lastSet = ts;
        let t = r.getCurrentTime();
        // skip idle: inside an inactive stretch with > 1.5 s left → jump to just before the next action
        if (prefsRef.current.skip && !bufferingRef.current) {
          const seg = segmentsRef.current.find(([a, b]) => t >= a && t < b - 1500);
          if (seg) {
            t = Math.max(t, seg[1] - 400);
            r.play(t);
            setSkipping(true);
            window.clearTimeout(hideNotice);
            hideNotice = window.setTimeout(() => setSkipping(false), 1400);
          }
        }
        setCurrent(t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(hideNotice);
    };
  }, [playing]);

  /* ─────────────── scaling ─────────────── */

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fullscreen = fs !== "off";
  const vw = dims?.width || 1280;
  const vh = dims?.height || 800;
  // Inline: the frame's height follows the recording's aspect, capped for tall phone recordings.
  const inlineH = `min(${box.w ? Math.round(Math.max(box.w * (vh / vw), 180)) : 360}px, 70vh, 640px)`;
  const scale = box.w && box.h ? Math.min(box.w / vw, box.h / vh, 2) : 0;
  const hostStyle: CSSProperties = {
    width: vw,
    height: vh,
    transform: `scale(${scale || 0.0001})`,
    transformOrigin: "0 0",
    left: Math.max(0, (box.w - vw * scale) / 2),
    top: Math.max(0, (box.h - vh * scale) / 2),
    visibility: scale ? "visible" : "hidden",
  };

  /* ─────────────── controls ─────────────── */

  const play = useCallback(() => {
    const r = replayerRef.current;
    if (!r) return;
    wantPlayRef.current = true;
    let t = r.getCurrentTime();
    if (allLoadedRef.current && total && t >= total - 100) t = 0;
    r.play(t);
    setPlaying(true);
    boxRef.current?.focus({ preventScroll: true });
  }, [total]);

  const pause = useCallback(() => {
    const r = replayerRef.current;
    wantPlayRef.current = false;
    bufferingRef.current = false;
    setBuffering(false);
    setSkipping(false);
    if (!r) return;
    r.pause();
    setPlaying(false);
    setCurrent(r.getCurrentTime());
  }, []);

  const seek = useCallback(
    (ms: number) => {
      const r = replayerRef.current;
      if (!r) return;
      let t = Math.max(0, Math.min(ms, total));
      if (!allLoadedRef.current && t > loadedUntil) {
        pendingSeekRef.current = t;
        setPendingSeek(true);
        t = Math.max(0, loadedUntil - 50);
      } else {
        pendingSeekRef.current = null;
        setPendingSeek(false);
      }
      if (wantPlayRef.current) r.play(t);
      else r.pause(t);
      setCurrent(t);
    },
    [total, loadedUntil]
  );

  const setSpeed = useCallback((speed: number) => {
    const next = { ...prefsRef.current, speed };
    prefsRef.current = next;
    setPrefs(next);
    writePrefs(next);
    replayerRef.current?.setConfig({ speed });
  }, []);

  const setSkip = useCallback((skip: boolean) => {
    const next = { ...prefsRef.current, skip };
    prefsRef.current = next;
    setPrefs(next);
    writePrefs(next);
    if (!skip) setSkipping(false);
  }, []);

  const toggleFs = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    if (fs === "native") {
      void document.exitFullscreen?.().catch(() => {});
      return;
    }
    if (fs === "css") {
      setFs("off");
      return;
    }
    if (document.fullscreenEnabled && el.requestFullscreen) {
      el.requestFullscreen().then(
        () => setFs("native"),
        () => setFs("css")
      );
    } else setFs("css"); // iOS Safari: no element fullscreen → fixed overlay
  }, [fs]);

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFs((v) => (v === "native" ? "off" : v));
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (fs !== "css") return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [fs]);

  const switchWindow = (w: string) => {
    if (w === winRef.current) return;
    const abs = baseRef.current + (replayerRef.current?.getCurrentTime() ?? 0);
    build(w, abs);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.key === " " || e.key === "k") {
      if (tag === "BUTTON" && e.key === " ") return; // let the focused button handle space
      e.preventDefault();
      if (playing) pause();
      else play();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const step = (e.shiftKey ? 15_000 : 5_000) * (e.key === "ArrowLeft" ? -1 : 1);
      seek((replayerRef.current?.getCurrentTime() ?? current) + step);
    } else if (e.key === "f") {
      e.preventDefault();
      toggleFs();
    } else if (e.key === "Escape" && fs === "css") {
      setFs("off");
    } else if (e.key === ">" || e.key === "<") {
      const i = SPEEDS.indexOf(prefs.speed as (typeof SPEEDS)[number]);
      const j = Math.max(0, Math.min(SPEEDS.length - 1, i + (e.key === ">" ? 1 : -1)));
      setSpeed(SPEEDS[j]);
    }
  };

  const loading = phase === "loading";
  const progress = chunks.total ? chunks.done / chunks.total : 0;

  if (phase === "empty")
    return (
      <div className="flex flex-col items-start gap-2 px-4 py-6">
        <span className="font-mono text-xs text-fg-3">$ replay → 404</span>
        <p className="text-sm font-semibold text-fg">No recording for this session</p>
        <p className="max-w-prose text-sm text-fg-3">
          PostHog skips very short sessions (minimum duration), browsers with Do Not Track, and anything older than the replay retention (30 days on the free plan).
        </p>
      </div>
    );

  return (
    <div
      ref={boxRef}
      tabIndex={0}
      onKeyDown={onKey}
      aria-label="Session replay player. Space plays or pauses, arrow keys seek, F toggles fullscreen."
      className={cx(
        "hk-replay flex min-h-0 flex-col bg-bg outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-inset",
        fill && "h-full flex-1",
        fs === "css" && "fixed inset-0 z-[120] h-[100dvh]",
        fs === "native" && "h-full"
      )}
    >
      <style>{PLAYER_CSS}</style>
      <div
        ref={frameRef}
        className={cx("relative w-full overflow-hidden bg-surface-2", (fill || fullscreen) && "min-h-0 flex-1")}
        style={fill || fullscreen ? undefined : { height: inlineH }}
        onClick={() => (playing ? pause() : play())}
      >
        <div ref={hostRef} aria-hidden className="absolute" style={hostStyle} />
        {loading && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex w-[min(280px,80%)] flex-col items-center gap-2 border border-line bg-surface px-4 py-3 font-mono text-[11px] text-fg-3">
              <span>
                <span className="text-signal-text">▶</span> loading replay{chunks.total ? ` · ${chunks.done}/${chunks.total}` : "…"}
              </span>
              <span className="block h-1 w-full bg-surface-2">
                <span className="block h-1 bg-signal transition-[width]" style={{ width: `${Math.max(6, progress * 100)}%` }} />
              </span>
            </div>
          </div>
        )}
        {(buffering || skipping || pendingSeek) && !loading && (
          <span className="pointer-events-none absolute left-2 top-2 z-10 border border-line-strong bg-surface/95 px-2 py-1 font-mono text-[11px] text-fg">
            {buffering || pendingSeek ? "buffering…" : "⏩ skipping inactivity"}
          </span>
        )}
        {!playing && !loading && (
          <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="grid h-14 w-14 place-items-center bg-signal text-xl text-on-signal shadow-lg">▶</span>
          </span>
        )}
      </div>

      <Controls
        playing={playing}
        disabled={loading}
        current={current}
        total={total}
        loaded={loadedUntil}
        segments={segments}
        speed={prefs.speed}
        skip={prefs.skip}
        fullscreen={fullscreen}
        windows={windows}
        win={win}
        onPlay={play}
        onPause={pause}
        onSeek={seek}
        onSpeed={setSpeed}
        onSkip={setSkip}
        onFullscreen={toggleFs}
        onWindow={switchWindow}
      />
      {(loadErr || (!loading && chunks.done < chunks.total)) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-1.5 font-mono text-[10px] text-fg-4">
          {loadErr ? <span className="text-bad-text">couldn&apos;t load the rest of this replay · {loadErr}</span> : <span>loading the rest · {chunks.done}/{chunks.total} chunks</span>}
          {loadErr && (
            <button type="button" onClick={onRetry} className="min-h-8 border border-line-strong px-2 text-fg-2 hover:bg-surface-2">
              ↻ retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── controls ───────────────────────────── */

function Controls(p: {
  playing: boolean;
  disabled: boolean;
  current: number;
  total: number;
  loaded: number;
  segments: [number, number][];
  speed: number;
  skip: boolean;
  fullscreen: boolean;
  windows: string[];
  win: string | null;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (ms: number) => void;
  onSpeed: (s: number) => void;
  onSkip: (on: boolean) => void;
  onFullscreen: () => void;
  onWindow: (w: string) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const pct = (ms: number) => (p.total ? `${Math.max(0, Math.min(100, (ms / p.total) * 100))}%` : "0%");
  const at = (clientX: number) => {
    const el = track.current;
    if (!el || !p.total) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * p.total;
  };
  const shown = drag ?? p.current;
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (p.disabled) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag(at(e.clientX));
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag != null) setDrag(at(e.clientX));
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag == null) return;
    const t = at(e.clientX);
    setDrag(null);
    p.onSeek(t);
  };
  const segs = useMemo(() => p.segments.filter(([a, b]) => b > a && p.total), [p.segments, p.total]);

  return (
    <div className="border-t border-line bg-surface" onClick={(e) => e.stopPropagation()}>
      {/* scrubber */}
      <div
        ref={track}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(p.total / 1000)}
        aria-valuenow={Math.round(shown / 1000)}
        aria-valuetext={`${clock(shown / 1000)} of ${clock(p.total / 1000)}`}
        className={cx("group relative h-6 touch-none select-none px-0", p.disabled ? "cursor-default" : "cursor-pointer")}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 bg-surface-2 group-hover:h-2">
          <div className="absolute inset-y-0 left-0 bg-fg/15" style={{ width: pct(p.loaded) }} />
          {segs.map(([a, b], i) => (
            <div
              key={i}
              title="inactive"
              className="absolute inset-y-0 bg-[repeating-linear-gradient(90deg,transparent_0_3px,rgb(128_128_128/0.45)_3px_5px)]"
              style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` }}
            />
          ))}
          <div className="absolute inset-y-0 left-0 bg-signal" style={{ width: pct(shown) }} />
        </div>
        <div aria-hidden className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 bg-signal ring-2 ring-bg" style={{ left: pct(shown) }} />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2 pb-2 sm:px-3">
        <button
          type="button"
          onClick={p.playing ? p.onPause : p.onPlay}
          disabled={p.disabled}
          aria-label={p.playing ? "Pause" : "Play"}
          className="grid h-10 w-10 shrink-0 place-items-center border border-signal bg-signal font-mono text-sm text-on-signal disabled:opacity-40"
        >
          {p.playing ? "❚❚" : "▶"}
        </button>
        <span className="min-w-[96px] font-mono text-[12px] tabular-nums text-fg-2">
          <span className="text-fg">{clock(shown / 1000)}</span> / {clock(p.total / 1000)}
        </span>

        <div role="radiogroup" aria-label="Playback speed" className="ml-auto inline-flex border border-line-strong">
          {SPEEDS.map((s, i) => {
            const on = p.speed === s;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => p.onSpeed(s)}
                className={cx("min-h-10 min-w-10 px-1.5 font-mono text-xs", i > 0 && "border-l border-line-strong", on ? "bg-signal font-semibold text-on-signal" : "text-fg-2 hover:bg-surface-2 hover:text-fg")}
              >
                {s === 0.5 ? "½" : s}×
              </button>
            );
          })}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={p.skip}
          onClick={() => p.onSkip(!p.skip)}
          title="Fast-forward through stretches with no clicks, scrolls or typing"
          className="inline-flex min-h-10 items-center gap-2 border border-line-strong px-2 font-mono text-xs text-fg-2 hover:bg-surface-2"
        >
          <span aria-hidden className={cx("relative h-4 w-7 shrink-0 border", p.skip ? "border-signal bg-signal" : "border-line-strong bg-surface-2")}>
            <span className={cx("absolute top-[1px] h-2.5 w-2.5 transition-[left]", p.skip ? "left-[13px] bg-on-signal" : "left-[1px] bg-fg-3")} />
          </span>
          skip idle
        </button>

        {p.windows.length > 1 && (
          <label className="inline-flex min-h-10 items-center gap-1 border border-line-strong px-2 font-mono text-xs text-fg-2">
            <span className="text-fg-4">tab</span>
            <select value={p.win || ""} onChange={(e) => p.onWindow(e.target.value)} className="bg-transparent text-fg focus:outline-none">
              {p.windows.map((w, i) => (
                <option key={w} value={w}>
                  {i + 1} of {p.windows.length}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          onClick={p.onFullscreen}
          aria-label={p.fullscreen ? "Exit fullscreen" : "Fullscreen"}
          title={p.fullscreen ? "Exit fullscreen (f)" : "Fullscreen (f)"}
          className="grid h-10 w-10 shrink-0 place-items-center border border-line-strong font-mono text-sm text-fg hover:bg-surface-2"
        >
          {p.fullscreen ? "⤡" : "⤢"}
        </button>
      </div>
    </div>
  );
}
