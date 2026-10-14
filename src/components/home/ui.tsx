// Small presentational helpers shared by the Home sections (safe in server and client components).

export const container = "mx-auto w-full max-w-[1320px] px-4 sm:px-6";

export const h2Class =
  "m-0 font-display text-[clamp(36px,5vw,64px)] font-extrabold leading-[0.95] tracking-[-0.045em] text-fg";

export const promptClass = "font-mono text-[13px] text-signal-text";

export const primaryBtn =
  "inline-flex min-h-[52px] items-center gap-2.5 bg-signal px-[22px] text-base font-semibold text-on-signal no-underline hover:brightness-110";

export const ghostBtn =
  "inline-flex min-h-12 items-center border border-line-strong px-[18px] font-mono text-sm text-fg no-underline hover:bg-surface-2";

export function Prompt({ children }: { children: React.ReactNode }) {
  return <span className={promptClass}>❯ {children}</span>;
}

export function Dot() {
  return <span className="text-signal-text">.</span>;
}
