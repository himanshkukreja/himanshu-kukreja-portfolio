/**
 * The explainer kit: the definition type every explainer exports, timing helpers and the SVG
 * primitives (boxes, wires, tokens, labels, meters) drawn in the course's blueprint language:
 * square corners, 1.5px rules, mono labels, one signal-orange accent. Explainers import from here
 * only; the player (player.tsx) owns playback, controls, captions and accessibility.
 *
 * Colours are CSS variables resolved inside the explainer's shadow root (see BASE_CSS in
 * player.tsx), so every explainer follows the site's dark / light theme with no extra work.
 * How to write one: AUTHORING.md.
 */
import type { ReactNode } from "react";

export type Step = {
  /** what the reader should notice in this frame; one or two short sentences, facts from the lesson */
  caption: string;
  /** hold time after the tween, at 1× speed (default 2800) */
  ms?: number;
  /** tween length for this step, at 1× speed (default 750); longer for multi-beat motion */
  tween?: number;
  /** keep `clock` running during the hold (flowing requests, ticking timers); off under reduced motion */
  loop?: boolean;
};

export type Variant = { id: string; label: string; steps: Step[] };

/** A "break it" slider under the scene: the reader drags it and the scene redraws from `values`. */
export type Control = {
  id: string;
  /** short label, e.g. "Cache TTL" */
  label: string;
  min: number;
  max: number;
  step?: number;
  /** starting value (the lesson's own example) */
  value: number;
  /** unit shown after the value, e.g. "s", "%", "req/s" */
  unit?: string;
  /** optional formatter for the shown value */
  format?: (v: number) => string;
};

export type SceneProps = {
  /** current variant id */
  variant: string;
  /** current step index (0-based) */
  step: number;
  /** tween progress into this step, 0 → 1, linear (wrap it in ease() for soft starts/stops; always 1 under reduced motion) */
  t: number;
  /** seconds since the step started; keeps counting during the hold only on `loop` steps (0 under reduced motion) */
  clock: number;
  /** stage narrower than ~520px: labels are larger, so keep them short or move them */
  narrow: boolean;
  /** prefers-reduced-motion: show end states, no looping decoration */
  reduced: boolean;
  /** attributes from the `::anim[name]{…}` directive */
  opts: Readonly<Record<string, string>>;
  /** current slider values, by control id (only for explainers that define `controls`) */
  values: Readonly<Record<string, number>>;
};

export type ExplainerDef = {
  /** viewBox size of the scene; ~600 × 320 reads well from phone to desktop */
  w: number;
  h: number;
  /** one or more scenarios (tabs when more than one), each a list of steps */
  variants: Variant[];
  /** extra CSS for the scene, scoped to this explainer's shadow root */
  css?: string;
  /** "break it" sliders shown under the scene; the scene reads them from `values` (keep it pure) */
  controls?: Control[];
  /** draws one frame as SVG children; must be a pure function of its props */
  Scene: (p: SceneProps) => ReactNode;
};

export const defineExplainer = (d: ExplainerDef): ExplainerDef => d;

/* ------------------------------------------------------------------ timing helpers */

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** cubic ease-in-out */
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** sub-progress of t inside the window [a, b] (0 before, 1 after) */
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
/** a value per step: `at(step, [0, 0, 30, 30])`, holding the last entry */
export const at = <T,>(i: number, xs: readonly T[]): T => xs[Math.min(Math.max(0, i), xs.length - 1)];
/** tween a number from its value at the previous step to the current one */
export const tween = (step: number, t: number, xs: readonly number[]) => lerp(at(step - 1, xs), at(step, xs), step === 0 ? 1 : t);
/** point on a circle (angle in degrees, 0 = 12 o'clock, clockwise) */
export const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
};

/* ------------------------------------------------------------------ primitives */

/** accent classes every primitive understands: signal orange, ok green, bad red, amber, sky, muted grey */
export type Tone = "lit" | "ok" | "bad" | "warn" | "sky" | "mute" | undefined | false;
const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

export function Box({
  x,
  y,
  w,
  h,
  label,
  sub,
  tone,
  dim,
  opacity,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  dim?: boolean;
  opacity?: number;
}) {
  return (
    <g className={cx("ax-node", dim && "ax-dim")} opacity={opacity}>
      <rect className={cx("ax-box", tone || "")} x={x} y={y} width={w} height={h} />
      {label !== undefined && (
        <text className="ax-t" x={x + w / 2} y={y + h / 2 + (sub ? -3 : 5)} textAnchor="middle">
          {label}
        </text>
      )}
      {sub !== undefined && (
        <text className="ax-s" x={x + w / 2} y={y + h / 2 + 15} textAnchor="middle">
          {sub}
        </text>
      )}
    </g>
  );
}

export function Wire({ d, tone, dash, arrow, opacity }: { d: string; tone?: Tone; dash?: boolean; arrow?: boolean; opacity?: number }) {
  return <path className={cx("ax-wire", tone || "", dash && "ax-dash")} d={d} markerEnd={arrow ? `url(#ax-arrow${tone === "lit" ? "-lit" : ""})` : undefined} opacity={opacity} />;
}

/** a message / request / key: a small square */
export function Token({ x, y, s = 10, tone, opacity, label }: { x: number; y: number; s?: number; tone?: Tone; opacity?: number; label?: ReactNode }) {
  return (
    <g opacity={opacity}>
      <rect className={cx("ax-tok", tone || "")} x={x - s / 2} y={y - s / 2} width={s} height={s} />
      {label !== undefined && (
        <text className="ax-s" x={x} y={y - s / 2 - 5} textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
}

export function Txt({
  x,
  y,
  children,
  k = "t",
  anchor = "middle",
  tone,
  opacity,
}: {
  x: number;
  y: number;
  children: ReactNode;
  /** t: label · s: small/muted · k: orange kicker · d: big display figure */
  k?: "t" | "s" | "k" | "d";
  anchor?: "start" | "middle" | "end";
  tone?: Tone;
  opacity?: number;
}) {
  return (
    <text className={cx(`ax-${k}`, tone || "")} x={x} y={y} textAnchor={anchor} opacity={opacity}>
      {children}
    </text>
  );
}

/** horizontal fill meter (queue depth, tokens, load) */
export function Meter({ x, y, w, h, value, max, tone, ticks }: { x: number; y: number; w: number; h: number; value: number; max: number; tone?: Tone; ticks?: number }) {
  const f = clamp(value / max);
  return (
    <g>
      <rect className="ax-meter" x={x} y={y} width={w} height={h} />
      <rect className={cx("ax-fill", tone || "")} x={x} y={y} width={w * f} height={h} />
      {ticks
        ? Array.from({ length: ticks - 1 }, (_, i) => <line key={i} className="ax-tick" x1={x + (w * (i + 1)) / ticks} x2={x + (w * (i + 1)) / ticks} y1={y} y2={y + h} />)
        : null}
    </g>
  );
}
