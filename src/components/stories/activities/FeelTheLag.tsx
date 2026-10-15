"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import ActivityShell from "./ActivityShell";
import { BTN_PRIMARY, ChoiceStep, Feedback, OPTION, OPT_IDLE, OPT_RIGHT, StepPrompt } from "./kit";
import type { ActivityProps } from "./registry";
import type { ActivityDef, StepCtx } from "./types";

type Transport = { id: string; name: string; spec: string; fps: number; lag: number };

// Numbers from the case file's "Streaming Quality Crisis" results.
const TRANSPORTS: Transport[] = [
  { id: "shots", name: "Screenshots over WebSocket", spec: "2–5 FPS · ~2 s latency", fps: 3, lag: 2000 },
  { id: "ws", name: "Tuned WebSocket stream", spec: "30 FPS · 200 ms", fps: 30, lag: 200 },
  { id: "rtc", name: "WebRTC", spec: "60–90 FPS · 50–100 ms", fps: 60, lag: 75 },
];

type Tap = { x: number; y: number; at: number };

function LagLab({ ctx }: { ctx: StepCtx }) {
  const [sel, setSel] = useState(0);
  const [tried, setTried] = useState<string[]>([TRANSPORTS[0].id]);
  const [shown, setShown] = useState(0); // stream time currently on screen (ms)
  const [taps, setTaps] = useState<Tap[]>([]);
  const [echo, setEcho] = useState<number | null>(null);
  const [shipped, setShipped] = useState<string | null>(null);
  const t0 = useRef(0);
  const tr = TRANSPORTS[sel];

  // Render loop: the phone only repaints at the transport's frame rate, and shows the past (now − latency).
  useEffect(() => {
    let raf = 0;
    if (!t0.current) t0.current = performance.now();
    const frameMs = 1000 / tr.fps;
    let last = -1;
    const loop = () => {
      const now = performance.now() - t0.current;
      const frame = Math.floor(now / frameMs) * frameMs;
      if (frame !== last) {
        last = frame;
        setShown(frame - tr.lag);
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [tr.fps, tr.lag]);

  // First frame that shows the latest tap = the echo the developer feels.
  const lastTap = taps[taps.length - 1];
  useEffect(() => {
    if (lastTap && echo === null && shown >= lastTap.at) {
      // Measured from the render loop's clock; recorded once per tap.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEcho(Math.round(shown + tr.lag - lastTap.at));
    }
  }, [shown, lastTap, echo, tr.lag]);

  const pick = (i: number) => {
    if (shipped) return;
    setSel(i);
    setTaps([]);
    setEcho(null);
    if (!tried.includes(TRANSPORTS[i].id)) setTried([...tried, TRANSPORTS[i].id]);
  };

  const tap = (e: PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    const at = performance.now() - t0.current;
    setTaps((t) => [...t.slice(-4), { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 50, at }]);
    setEcho(null);
  };

  const ship = () => {
    if (shipped) return;
    setShipped(tr.id);
    ctx.done(tr.id === "rtc" ? 1 : 0);
  };

  // A dot sweeping across the "simulator": where it was at stream time `shown`.
  const period = 1600;
  const ph = ((((ctx.reduced ? 0 : shown) % period) + period) % period) / period;
  const ballX = 12 + 76 * (ph < 0.5 ? ph * 2 : 2 - ph * 2);

  return (
    <div className="flex flex-col gap-4">
      <StepPrompt sub="Pick a transport, then tap the simulator screen. The orange ring is your finger; the filled ripple is when the stream shows it.">
        Feel the lag Alex felt on Windows, then ship one transport.
      </StepPrompt>
      <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-start">
        <div className="mx-auto w-[180px] sm:mx-0">
          <div className="border-[6px] border-fg bg-fg p-0">
            <button
              type="button"
              onPointerDown={tap}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  const at = performance.now() - t0.current;
                  setTaps((t) => [...t.slice(-4), { x: 50, y: 50, at }]);
                  setEcho(null);
                }
              }}
              aria-label={`Simulator screen streamed over ${tr.name}. Tap to send a touch.`}
              className="relative block aspect-[9/19] w-full touch-manipulation overflow-hidden bg-bg"
            >
              <span aria-hidden className="absolute inset-x-0 top-0 flex justify-between px-2 py-1 font-mono text-[9px] text-fg-3">
                <span>9:41</span>
                <span>{tr.fps} fps</span>
              </span>
              <span aria-hidden className="absolute left-[10%] right-[10%] top-[28%] h-px bg-line-strong" />
              <span aria-hidden className="absolute h-3 w-3 bg-signal" style={{ left: `calc(${ballX}% - 6px)`, top: "calc(28% - 6px)" }} />
              {taps.map((t) => {
                const age = shown - t.at;
                const local = shown + tr.lag - t.at; // frame clock, not wall clock: keeps render pure
                return (
                  <span key={t.at} aria-hidden>
                    {local < 450 && (
                      <span className="absolute h-8 w-8 rounded-full border-2 border-signal" style={{ left: `calc(${t.x}% - 16px)`, top: `calc(${t.y}% - 16px)` }} />
                    )}
                    {age >= 0 && age < 700 && (
                      <span
                        className="absolute rounded-full bg-fg/70"
                        style={{
                          left: `calc(${t.x}% - ${ctx.reduced ? 12 : 8 + age / 40}px)`,
                          top: `calc(${t.y}% - ${ctx.reduced ? 12 : 8 + age / 40}px)`,
                          width: ctx.reduced ? 24 : 16 + age / 20,
                          height: ctx.reduced ? 24 : 16 + age / 20,
                          opacity: ctx.reduced ? 0.8 : 1 - age / 700,
                        }}
                      />
                    )}
                  </span>
                );
              })}
              <span aria-hidden className="absolute bottom-[4%] left-[35%] right-[35%] h-1 bg-line-strong" />
            </button>
          </div>
          <p className="m-0 mt-2 text-center font-mono text-[12px] text-fg-3" aria-live="polite">
            {echo !== null ? (
              <>
                touch echo <span className="font-semibold text-fg">{echo.toLocaleString()} ms</span>
              </>
            ) : taps.length ? (
              "waiting for the stream…"
            ) : (
              "tap the screen"
            )}
          </p>
        </div>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Transport">
          {TRANSPORTS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={sel === i}
              disabled={!!shipped}
              onClick={() => pick(i)}
              className={`${OPTION} ${sel === i ? OPT_RIGHT : OPT_IDLE} flex-col !items-start !gap-0.5`}
            >
              <span className="font-semibold">{t.name}</span>
              <span className="font-mono text-[11px] opacity-80">
                {t.spec}
                {tried.includes(t.id) && sel !== i ? " · tried" : ""}
              </span>
            </button>
          ))}
          {!shipped && (
            <button type="button" onClick={ship} disabled={tried.length < 2} className={`${BTN_PRIMARY} mt-1 self-start`}>
              {tried.length < 2 ? "try another transport first" : `ship ${tr.name}`}
            </button>
          )}
        </div>
      </div>
      <div aria-live="polite">
        {shipped && (
          <Feedback ok={shipped === "rtc"} title={shipped === "rtc" ? "Shipped WebRTC. Night and day." : "Alex would still be waiting on that tap."}>
            The first prototype streamed screenshots over a WebSocket at 2–5 FPS with 2 s of latency. Tuning the WebSocket got 30 FPS at 200 ms; switching the video to
            WebRTC got 60–90 FPS at 50–100 ms, with the WebSocket kept for control. “The difference: night and day user experience.”
          </Feedback>
        )}
      </div>
    </div>
  );
}

const DEF: ActivityDef = {
  kind: "latency lab",
  title: "Feel the lag",
  blurb:
    "Tap a streamed iPhone simulator over three transports from the case file and feel the difference, then answer four questions about what broke on the way to production.",
  minutes: 3,
  steps: [
    { id: "lab", label: "Latency lab", max: 1, render: (ctx) => <LagLab ctx={ctx} /> },
    {
      id: "coords",
      label: "Translate a tap",
      max: 1,
      render: (ctx) => (
        <ChoiceStep
          ctx={ctx}
          prompt="The stream is 1170 px wide; your browser shows it 390 px wide. You click at x = 100. Which x does iOS Bridge send to the simulator?"
          sub="translateCoordinates(): scaleX = stream_width / canvas.clientWidth"
          options={["33", "100", "300", "1170"]}
          answer={2}
          explain="scaleX = 1170 / 390 = 3, so x = round(100 × 3) = 300. Different screen sizes, DPI scaling and orientations are why the mapping uses the device info instead of raw mouse positions."
        />
      ),
    },
    {
      id: "orphans",
      label: "Server restart",
      max: 1,
      render: (ctx) => (
        <ChoiceStep
          ctx={ctx}
          prompt="The FastAPI server restarts. Three simulators are still running, but none are in sessions.json. What happens at startup?"
          options={[
            "They are shut down so the session list stays clean.",
            "Each gets a new session with status “recovered”.",
            "Developers must re-run ios-bridge create by hand.",
            "They are ignored until someone streams them by UDID.",
          ]}
          answer={1}
          explain="startup_recovery() compares running simulators with stored sessions; any running simulator whose UDID is not stored is an orphan and gets a SimulatorSession with status “recovered”. Server restarts no longer destroy anyone's test setup."
        />
      ),
    },
    {
      id: "multi",
      label: "Two hands, one phone",
      max: 1,
      render: (ctx) => (
        <ChoiceStep
          ctx={ctx}
          prompt="Letting several people control the same simulator at once was tried early on. Where did it land?"
          options={[
            "Last touch wins, with a 200 ms lock.",
            "Touches are merged into multi-touch gestures.",
            "Single-user sessions, with sharing via the web interface.",
            "One simulator per user, no sharing at all.",
          ]}
          answer={2}
          explain="Simultaneous control meant conflicting touch inputs: “chaos”. The fix was single-user sessions, with sharing handled through the web interface."
        />
      ),
    },
    {
      id: "h264",
      label: "The encoder that wasn't",
      max: 1,
      render: (ctx) => (
        <ChoiceStep
          ctx={ctx}
          prompt="Why didn't direct H.264 hardware encoding from the simulator work at first?"
          options={[
            "The simulator doesn't expose an H.264 stream.",
            "H.264 is not supported by WebRTC.",
            "Windows clients can't decode H.264.",
            "Licensing costs for H.264.",
          ]}
          answer={0}
          explain="The iOS simulator doesn't expose an H.264 stream, so iOS Bridge used an optimised screenshot-based approach instead. Hardware-accelerated encoding on Apple Silicon is on the roadmap."
        />
      ),
    },
  ],
};

export default function FeelTheLag({ slug, caseId }: ActivityProps) {
  return <ActivityShell slug={slug} caseId={caseId} def={DEF} />;
}
