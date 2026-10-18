/**
 * The explainer player: mounts one explainer (an ExplainerDef from explainers/<name>.tsx) into the
 * figure's stage, inside a shadow root, and runs it: play / pause, previous / next, restart, a
 * step track to jump around, speed, variant tabs, a live caption, keyboard control, autoplay once
 * it scrolls into view, and a printable storyboard.
 *
 * Why a shadow root: the lesson HTML is watched by several MutationObservers (highlights, quizzes,
 * deep links, offline) and re-injected when highlights change; the animation's DOM churn stays
 * invisible to all of them, and its CSS can't leak into the lesson (or the lesson's into it).
 *
 * Reduced motion: no autoplay, no tweening (t is always 1), no play button: the reader steps.
 * Loaded on demand through src/lib/offline/lazy.ts (loadAnimPlayer), so saved lessons have it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createRoot } from "react-dom/client";
import type { ExplainerDef } from "./kit";

const TWEEN = 750;
const HOLD = 2800;
const SPEEDS = [1, 1.5, 2, 0.5];

const BASE_CSS = `
:host{display:block;
--ax-box:var(--c-surface-2,#141416);--ax-line:var(--c-line-strong,#3a3a40);--ax-line-soft:var(--c-line,#26262a);--ax-grid:var(--c-dot,#1a1a1d);
--ax-fg:var(--c-fg,#f3f2ee);--ax-fg2:var(--c-fg-2,#c9c8c4);--ax-fg3:var(--c-fg-3,#a3a3a8);--ax-fg4:var(--c-fg-4,#7e7e85);
--ax-accent:var(--c-signal,#ff6b2b);--ax-accent-text:var(--c-signal-text,#ff6b2b);--ax-on-accent:var(--c-on-signal,#120700);
--ax-ok:var(--c-ok,#3dd68c);--ax-ok-text:var(--sdb-ok-text,var(--c-ok,#3dd68c));--ax-bad:var(--c-bad,#e5484d);--ax-bad-text:var(--c-bad-text,#ff8a8d);
--ax-sky:var(--sdb-sky,#4fb3ff);--ax-amber:var(--sdb-amber,#f5b83d);
--ax-mono:var(--font-geist-mono),ui-monospace,SFMono-Regular,Menlo,monospace;--ax-display:var(--font-display),ui-sans-serif,system-ui,sans-serif;--ax-sans:var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif}
*{box-sizing:border-box}
.ax{container:ax/inline-size;outline:none;color:var(--ax-fg);font-family:var(--ax-sans)}
.ax:focus-visible{outline:2px solid var(--ax-accent);outline-offset:-2px}
.ax-tabs{display:flex;flex-wrap:wrap;gap:6px;padding:10px 12px 0}
.ax-tab{min-height:34px;padding:0 12px;border:1px solid var(--ax-line);background:transparent;color:var(--ax-fg2);font:12px/1 var(--ax-mono);letter-spacing:.06em;text-transform:uppercase;cursor:pointer}
.ax-tab[aria-selected=true]{border-color:var(--ax-accent);color:var(--ax-accent-text);box-shadow:inset 0 -2px 0 var(--ax-accent)}
.ax-svg{display:block;width:100%;height:auto;margin:0 auto;max-height:70vh}
.ax-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 12px;border-top:1px solid var(--ax-line-soft);background:var(--c-surface,#0a0a0b)}
.ax-btn{min-width:36px;min-height:36px;padding:0 10px;border:1px solid var(--ax-line);background:transparent;color:var(--ax-fg2);font:12px/1 var(--ax-mono);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.ax-btn:hover:not(:disabled){color:var(--ax-fg);border-color:var(--ax-fg3)}
.ax-btn:disabled{opacity:.35;cursor:default}
.ax-btn:focus-visible,.ax-tab:focus-visible,.ax-seg:focus-visible{outline:2px solid var(--ax-accent);outline-offset:2px}
.ax-play{min-width:86px;background:var(--ax-accent);border-color:var(--ax-accent);color:var(--ax-on-accent);font-weight:600}
.ax-play:hover:not(:disabled){color:var(--ax-on-accent);border-color:var(--ax-accent);filter:brightness(1.08)}
.ax-track{display:flex;flex:1 1 140px;gap:3px;min-width:96px;align-self:stretch;align-items:center}
.ax-seg{position:relative;flex:1;height:28px;padding:0;border:0;background:transparent;cursor:pointer}
.ax-seg::before{content:"";position:absolute;left:0;right:0;top:11px;height:6px;background:var(--ax-line)}
.ax-seg[data-past]::before{background:var(--ax-fg4)}
.ax-seg i{position:absolute;left:0;top:11px;height:6px;width:0;background:var(--ax-accent)}
.ax-seg[data-on] i{width:100%}
.ax-seg[data-run] i{width:0;animation:ax-fill var(--ax-dur,3s) linear forwards}
.ax-seg[data-run][data-paused] i{animation-play-state:paused}
@keyframes ax-fill{to{width:100%}}
.ax-n{font:12px var(--ax-mono);letter-spacing:.06em;color:var(--ax-fg3)}
.ax-cap{margin:0;padding:10px 14px 12px;min-height:3.3em;border-top:1px solid var(--ax-line-soft);font-size:15px;line-height:1.55;color:var(--ax-fg);background:var(--c-bg,#000)}
.ax-cap .ax-n{margin-right:10px;color:var(--ax-accent-text)}
.ax-story{display:none}
@container ax (max-width:560px){.ax-track{order:9;flex-basis:100%}.ax-cap{font-size:14.5px}}
/* scene vocabulary (kit.tsx) */
.ax-grid{stroke:var(--ax-grid);stroke-width:1;fill:none}
.ax-box{fill:var(--ax-box);stroke:var(--ax-line);stroke-width:1.5}
.ax-box.lit{stroke:var(--ax-accent);stroke-width:2.5}.ax-box.ok{stroke:var(--ax-ok);stroke-width:2}.ax-box.bad{stroke:var(--ax-bad);stroke-width:2}.ax-box.warn{stroke:var(--ax-amber);stroke-width:2}.ax-box.sky{stroke:var(--ax-sky);stroke-width:2}
.ax-dim{opacity:.32}
.ax-wire{fill:none;stroke:var(--ax-line);stroke-width:1.5}
.ax-wire.lit{stroke:var(--ax-accent);stroke-width:2.5}.ax-wire.ok{stroke:var(--ax-ok)}.ax-wire.bad{stroke:var(--ax-bad)}.ax-wire.mute{stroke:var(--ax-line-soft)}
.ax-dash{stroke-dasharray:5 6}
.ax-tok{fill:var(--ax-accent)}.ax-tok.ok{fill:var(--ax-ok)}.ax-tok.bad{fill:var(--ax-bad)}.ax-tok.mute{fill:var(--ax-fg4)}.ax-tok.sky{fill:var(--ax-sky)}.ax-tok.warn{fill:var(--ax-amber)}
.ax-meter{fill:none;stroke:var(--ax-line);stroke-width:1.5}
.ax-fill{fill:var(--ax-accent)}.ax-fill.ok{fill:var(--ax-ok)}.ax-fill.bad{fill:var(--ax-bad)}.ax-fill.warn{fill:var(--ax-amber)}.ax-fill.sky{fill:var(--ax-sky)}
.ax-tick{stroke:var(--c-bg,#000);stroke-width:1.5}
.ax-t{font:600 14px var(--ax-mono);letter-spacing:.04em;fill:var(--ax-fg)}
.ax-s{font:12px var(--ax-mono);letter-spacing:.05em;fill:var(--ax-fg3)}
.ax-k{font:600 11px var(--ax-mono);letter-spacing:.14em;fill:var(--ax-accent-text);text-transform:uppercase}
.ax-d{font:800 30px var(--ax-display);letter-spacing:-.02em;fill:var(--ax-fg)}
.ax-t.lit,.ax-s.lit,.ax-d.lit{fill:var(--ax-accent-text)}.ax-t.ok,.ax-s.ok,.ax-d.ok,.ax-k.ok{fill:var(--ax-ok-text)}.ax-t.bad,.ax-s.bad,.ax-d.bad,.ax-k.bad{fill:var(--ax-bad-text)}.ax-t.mute,.ax-s.mute{fill:var(--ax-fg4)}.ax-k.mute{fill:var(--ax-fg3)}.ax-t.warn,.ax-s.warn,.ax-k.warn{fill:var(--ax-amber)}.ax-t.sky,.ax-s.sky,.ax-k.sky{fill:var(--ax-sky)}
.ax-arrow{fill:var(--ax-line)}.ax-arrow.lit{fill:var(--ax-accent)}
@container ax (max-width:520px){.ax-t{font-size:19px}.ax-s{font-size:16px}.ax-k{font-size:15px}.ax-d{font-size:38px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@media print{.ax-bar,.ax-tabs{display:none}.ax-story{display:block;margin:0;padding:8px 14px 12px 32px;font-size:12.5px;line-height:1.5}.ax-cap{display:none}.ax-svg{max-height:none}}
`;

/* ------------------------------------------------------------------ environment hooks */

const RM = "(prefers-reduced-motion: reduce)";
function subscribeRM(cb: () => void) {
  const m = window.matchMedia(RM);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}
const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeRM,
    () => window.matchMedia(RM).matches,
    () => false,
  );

const pad = (n: number) => String(n).padStart(2, "0");

/* ------------------------------------------------------------------ the player */

type PlayerProps = { def: ExplainerDef; title: string; opts: Record<string, string>; observe: HTMLElement };

function Player({ def, title, opts, observe }: PlayerProps) {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [vi, setVi] = useState(() => Math.max(0, def.variants.findIndex((v) => v.id === opts.start)));
  const [step, setStep] = useState(0);
  const [t, setT] = useState(1);
  const [clk, setClk] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [narrow, setNarrow] = useState(false);
  // when the current step started (performance.now()); handlers and the frame loop share it
  const clock = useRef(0);
  const flags = useRef({ started: false, userPaused: false, resumeOnView: false });

  const variant = def.variants[vi] || def.variants[0];
  const steps = variant.steps;
  const speed = SPEEDS[speedIdx];
  const hold = (steps[step]?.ms ?? HOLD) / speed;
  const tween = reduced ? 0 : (steps[step]?.tween ?? TWEEN) / speed;
  const loop = !reduced && !!steps[step]?.loop;

  /* frame loop: tween t to 1, then (while playing) hold and advance */
  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const e = now - clock.current;
      const tt = tween ? Math.min(1, e / tween) : 1;
      setT(tt);
      if (!reduced && (tt < 1 || loop)) setClk((e * speed) / 1000);
      if (playing && e >= tween + hold) {
        if (step >= steps.length - 1) {
          setPlaying(false);
          return;
        }
        clock.current = now;
        setStep(step + 1);
        setT(reduced ? 1 : 0);
        setClk(0);
        return;
      }
      if (tt < 1 || playing) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, vi, playing, tween, hold, loop, reduced, speed, steps.length]);

  const go = useCallback(
    (i: number, play?: boolean) => {
      const n = Math.max(0, Math.min(steps.length - 1, i));
      clock.current = performance.now();
      setStep(n);
      setT(reduced ? 1 : 0);
      setClk(0);
      if (play !== undefined) setPlaying(play && !reduced);
    },
    [steps.length, reduced],
  );

  const togglePlay = useCallback(() => {
    if (reduced) return;
    if (playing) {
      flags.current.userPaused = true;
      setPlaying(false);
      return;
    }
    flags.current.userPaused = false;
    flags.current.started = true;
    if (step >= steps.length - 1) go(0, true);
    else {
      // resume about where it paused (tween and loop clock carry on from their values)
      clock.current = performance.now() - Math.max(tween * t, (clk * 1000) / speed);
      setPlaying(true);
    }
  }, [reduced, playing, step, steps.length, go, tween, t, clk, speed]);

  const pickVariant = useCallback(
    (k: number) => {
      setVi(k);
      flags.current.started = true;
      clock.current = performance.now();
      setStep(0);
      setT(reduced ? 1 : 0);
      setClk(0);
      setPlaying(!reduced);
    },
    [reduced],
  );

  /* autoplay once it is half in view; pause off-screen, resume when back (unless the reader paused) */
  useEffect(() => {
    const auto = opts.autoplay !== "off";
    const io = new IntersectionObserver(
      ([e]) => {
        const f = flags.current;
        if (e.isIntersecting && e.intersectionRatio >= 0.45) {
          if (reduced || f.userPaused) return;
          if ((!f.started && auto) || f.resumeOnView) {
            f.started = true;
            f.resumeOnView = false;
            clock.current = performance.now() - tween;
            setPlaying(true);
          }
        } else if (!e.isIntersecting) {
          setPlaying((p) => {
            if (p) f.resumeOnView = true;
            return false;
          });
        }
      },
      { threshold: [0, 0.45] },
    );
    io.observe(observe);
    return () => io.disconnect();
  }, [observe, reduced, opts.autoplay, tween]);

  /* narrow stage: bigger labels (CSS container query) and a hint to the scene */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onKey = (e: ReactKeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const onButton = (e.target as HTMLElement).tagName === "BUTTON";
    let handled = true;
    if (e.key === "ArrowRight") go(step + 1, false);
    else if (e.key === "ArrowLeft") go(step - 1, false);
    else if (e.key === "Home") go(0, false);
    else if (e.key === "End") go(steps.length - 1, false);
    else if ((e.key === " " && !onButton) || e.key === "k") togglePlay();
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const Scene = def.Scene;
  const frozen = useMemo(() => Object.freeze({ ...opts }), [opts]);
  const atEnd = step >= steps.length - 1;
  const cap = steps[step]?.caption || "";

  return (
    <div className="ax" ref={rootRef} onKeyDown={onKey} tabIndex={-1} aria-roledescription="animated explainer">
      {def.variants.length > 1 && (
        <div className="ax-tabs" role="tablist" aria-label="Scenario">
          {def.variants.map((v, k) => (
            <button key={v.id} type="button" role="tab" className="ax-tab" aria-selected={k === vi} onClick={() => pickVariant(k)}>
              {v.label}
            </button>
          ))}
        </div>
      )}
      <svg className="ax-svg" viewBox={`0 0 ${def.w} ${def.h}`} role="img" aria-label={`${title}. ${variant.label}, step ${step + 1} of ${steps.length}: ${cap}`}>
        <defs>
          <pattern id="ax-g" width="40" height="40" patternUnits="userSpaceOnUse">
            <path className="ax-grid" d="M40 0H0V40" />
          </pattern>
          <marker id="ax-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path className="ax-arrow" d="M0 0L10 5L0 10z" />
          </marker>
          <marker id="ax-arrow-lit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path className="ax-arrow lit" d="M0 0L10 5L0 10z" />
          </marker>
        </defs>
        <rect width={def.w} height={def.h} fill="url(#ax-g)" />
        <Scene variant={variant.id} step={step} t={t} clock={reduced ? 0 : clk} narrow={narrow} reduced={reduced} opts={frozen} />
      </svg>
      <div className="ax-bar">
        {!reduced && (
          <button type="button" className="ax-btn ax-play" onClick={togglePlay} aria-label={playing ? "Pause" : atEnd ? "Replay from the start" : "Play"}>
            {playing ? "❚❚ Pause" : atEnd ? "↻ Replay" : "▶ Play"}
          </button>
        )}
        <button type="button" className="ax-btn" onClick={() => go(step - 1, false)} disabled={step === 0} aria-label="Previous step">
          ◀
        </button>
        <button type="button" className="ax-btn" onClick={() => go(step + 1, false)} disabled={atEnd} aria-label="Next step">
          ▶
        </button>
        <button type="button" className="ax-btn" onClick={() => go(0, false)} aria-label="Restart">
          ↺
        </button>
        <div className="ax-track" aria-label="Steps">
          {steps.map((s, k) => (
            <button
              key={`${vi}-${k}`}
              type="button"
              className="ax-seg"
              aria-label={`Step ${k + 1} of ${steps.length}`}
              aria-current={k === step ? "step" : undefined}
              data-past={k < step ? "" : undefined}
              data-on={k === step && !playing ? "" : undefined}
              data-run={k === step && playing ? "" : undefined}
              style={k === step && playing ? ({ "--ax-dur": `${tween + hold}ms` } as CSSProperties) : undefined}
              onClick={() => go(k, false)}
            >
              <i key={k === step ? `${vi}-${step}-${playing}` : undefined} />
            </button>
          ))}
        </div>
        {!reduced && (
          <button type="button" className="ax-btn" onClick={() => setSpeedIdx((s) => (s + 1) % SPEEDS.length)} aria-label={`Speed ${speed}×, change`}>
            {speed}×
          </button>
        )}
      </div>
      <p className="ax-cap" aria-live="polite">
        <span className="ax-n">
          {pad(step + 1)}/{pad(steps.length)}
        </span>
        {cap}
      </p>
      <ol className="ax-story">
        {steps.map((s, k) => (
          <li key={k}>{s.caption}</li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Mount an explainer into `stage` (the figure's .sd-anim-stage). Returns the unmount function.
 * `observe` is the element whose visibility drives autoplay (the figure).
 */
export function mountExplainer(stage: HTMLElement, def: ExplainerDef, props: { title: string; opts: Record<string, string>; observe: HTMLElement }): () => void {
  const shadow = stage.shadowRoot || stage.attachShadow({ mode: "open" });
  shadow.replaceChildren();
  const style = document.createElement("style");
  style.textContent = BASE_CSS + (def.css || "");
  const host = document.createElement("div");
  shadow.append(style, host);
  const root = createRoot(host);
  root.render(<Player def={def} {...props} />);
  return () => {
    root.unmount();
    shadow.replaceChildren();
  };
}
