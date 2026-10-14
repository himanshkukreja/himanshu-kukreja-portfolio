// Token colours are CSS variables; this lets `bg-bg/90` etc. still work by mixing with transparent.
const tok = (name) => ({ opacityValue }) =>
  opacityValue === undefined || opacityValue === '1'
    ? `var(--c-${name})`
    : `color-mix(in srgb, var(--c-${name}) calc(${opacityValue} * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/game/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // "Level Up" semantic tokens (see globals.css for light/dark values)
        bg: tok("bg"),
        surface: tok("surface"),
        "surface-2": tok("surface-2"),
        raised: tok("raised"),
        line: tok("line"),
        "line-strong": tok("line-strong"),
        fg: tok("fg"),
        "fg-2": tok("fg-2"),
        "fg-3": tok("fg-3"),
        "fg-4": tok("fg-4"),
        signal: tok("signal"),
        "on-signal": tok("on-signal"),
        "signal-text": tok("signal-text"),
        ok: tok("ok"),
        bad: tok("bad"),
        "bad-text": tok("bad-text"),
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.055em",
        label: "0.08em",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "hk-in": { from: { transform: "translateY(-6px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
        "hk-blink": { "0%,49%": { opacity: "1" }, "50%,100%": { opacity: "0" } },
        "hk-pulse": { "0%,100%": { boxShadow: "0 0 0 0 rgba(255,107,43,0.45)" }, "50%": { boxShadow: "0 0 0 8px rgba(255,107,43,0)" } },
        "hk-type": { from: { maxWidth: "0" }, to: { maxWidth: "60ch" } },
        "hk-flow": { from: { left: "0%" }, to: { left: "100%" } },
      },
      animation: {
        shimmer: "shimmer 1.2s infinite",
        "hk-in": "hk-in 0.2s ease-out",
        "hk-blink": "hk-blink 1s step-end infinite",
        "hk-pulse": "hk-pulse 2.4s ease-in-out infinite",
        "hk-type": "hk-type 2.4s steps(52) both",
        "hk-flow": "hk-flow 0.9s linear infinite",
      },
    },
  },
  plugins: [],
  darkMode: ['class'],
}
