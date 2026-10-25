/** Time helpers for the lecture stage: everything animates from `t`, the seconds since the step began. */
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
export const easeInOut = (x: number) => {
  const v = clamp(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
/** progress of an animation that starts at `delay` and lasts `dur` seconds */
export const prog = (t: number, delay: number, dur: number) => easeOut((t - delay) / dur);
export const lerp = (a: number, b: number, e: number) => a + (b - a) * e;

/** How long a step keeps moving (the exporter captures frames for this long, then holds the last one). */
export const INTRO = 1.6;

/** "~800M" → count 0..800 with the same prefix/suffix; null when the value isn't a plain number. */
export function countUp(value: string, e: number): string {
  const m = value.match(/^([^\d]*?)(\d[\d,]*(?:\.\d+)?)(.*)$/);
  if (!m || e >= 1) return value;
  const [, pre, num, post] = m;
  const n = Number(num.replace(/,/g, ""));
  if (!Number.isFinite(n)) return value;
  const decimals = (num.split(".")[1] || "").length;
  const v = n * easeOut(e);
  const s = decimals ? v.toFixed(decimals) : Math.round(v).toString();
  return `${pre}${num.includes(",") ? Number(s).toLocaleString("en-IN") : s}${post}`;
}

export const TONE: Record<string, { fg: string; bg: string; line: string }> = {
  bad: { fg: "#ff8f8f", bg: "#2a1012", line: "#e5484d" },
  good: { fg: "#7ee2a8", bg: "#0e2318", line: "#30a46c" },
  hot: { fg: "#ffb489", bg: "#2a1508", line: "#ff6b2b" },
  neutral: { fg: "#d6d5d0", bg: "#17171a", line: "#3a3a40" },
};
