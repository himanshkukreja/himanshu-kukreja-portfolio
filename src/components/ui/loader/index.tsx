/**
 * "Level Up" loaders: one family, four sizes.
 *
 *  - <Spinner />        three ticking squares in currentColor, for buttons and tight spots
 *  - <InlineLoader />   spinner + mono label + cursor, for panels/lists ("loading the discussion")
 *  - <StageBar />       the stage-segment bar (a signal wave through square segments)
 *  - <BootLoader />     a `~/himanshu $` terminal boot log: typed command, staggered log lines, stage bar
 *  - <FullScreenLoader /> BootLoader centred in the viewport (auth callback, gated screens)
 *  - <Skeleton />       flat surface-2 block with a sheen, for content placeholders
 *
 * No hooks, so all of them render in server components (loading.tsx) and stream as plain HTML;
 * the motion is CSS-only and has a static reduced-motion fallback (see loader.module.css).
 */
import type { CSSProperties, ReactNode } from "react";
import s from "./loader.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const v = (vars: Record<string, string | number>) => vars as CSSProperties;

/** Three ticking squares in currentColor. Size follows the font size (`text-sm`, `text-base`…). */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cx(s.dots, className)} role={label ? "status" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={s.dot} style={v({ "--i": i })} />
      ))}
    </span>
  );
}

/** Indeterminate stage-segment bar. Give it a width (`w-40`, `w-full`) and optionally a height (`h-1.5`). */
export function StageBar({ segments = 12, className }: { segments?: number; className?: string }) {
  const on = Math.ceil(segments * 0.4);
  return (
    <span aria-hidden className={cx(s.bar, className)}>
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={s.seg} style={v({ "--i": i })} data-on={i < on ? "" : undefined} />
      ))}
    </span>
  );
}

/** Blinking signal-orange block cursor. */
export function Cursor({ className }: { className?: string }) {
  return <span aria-hidden className={cx(s.cursor, className)} />;
}

/** Spinner + mono label, for a panel or list that is fetching. */
export function InlineLoader({ label = "loading", className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cx("inline-flex items-center gap-2.5 font-mono text-xs text-fg-3", className)}>
      <Spinner className="text-signal" />
      <span>
        {label}
        <span className={s.pending}>…</span>
      </span>
    </span>
  );
}

/**
 * Terminal boot log. `cmd` is typed after the prompt; `steps` appear one by one, all but the last
 * marked `ok`; the last one stays pending (`..`) above the stage bar until the content arrives.
 */
export function BootLoader({
  cmd = "open .",
  steps = ["resolve route", "fetch data", "render"],
  label = "Loading",
  className,
  children,
}: {
  cmd?: string;
  steps?: string[];
  /** Screen-reader text. */
  label?: string;
  className?: string;
  children?: ReactNode;
}) {
  const typeMs = 80 + cmd.length * 26;
  return (
    <div role="status" aria-live="polite" className={cx("w-full max-w-[460px] border border-line-strong bg-surface font-mono text-[13px] leading-6 text-fg-2", className)}>
      <span className="sr-only">{label}…</span>
      <div aria-hidden className="flex items-center gap-2 border-b border-line px-3.5 py-2 text-[11px] uppercase tracking-label text-fg-3">
        <span className="h-2 w-2 bg-signal" />
        <span className="flex-1 truncate">~/himanshu</span>
        <span className="text-fg-4">tty1</span>
      </div>
      <div aria-hidden className="flex flex-col px-3.5 py-3">
        <div className="flex min-w-0 items-baseline whitespace-nowrap">
          <span className="text-signal-text">~/himanshu</span>
          <span className="px-1.5 text-fg-4">$</span>
          <span className={cx(s.typed, "text-fg")} style={v({ "--n": cmd.length })}>
            {cmd}
          </span>
          <Cursor />
        </div>
        {steps.map((step, i) => {
          const last = i === steps.length - 1;
          return (
            <div key={step} className={cx(s.line, "flex gap-2.5")} style={v({ "--d": `${typeMs + 120 + i * 220}ms` })}>
              {last ? <span className="text-signal-text">[<span className={s.pending}>..</span>]</span> : <span className="text-ok">[ok]</span>}
              <span className={last ? "text-fg" : "text-fg-3"}>{step}</span>
            </div>
          );
        })}
        <StageBar className={cx(s.line, "mt-3 h-2 w-full")} />
        {children}
      </div>
    </div>
  );
}

/** BootLoader centred in the viewport, with an optional display title above it. */
export function FullScreenLoader({
  title,
  className,
  ...boot
}: Parameters<typeof BootLoader>[0] & { title?: ReactNode }) {
  return (
    <div className={cx("grid min-h-[calc(100svh-var(--hk-header-h,64px))] place-items-center px-4 py-16", className)}>
      <div className="flex w-full max-w-[460px] flex-col gap-5">
        {title && <p className="m-0 font-display text-[clamp(28px,6vw,40px)] font-extrabold leading-none tracking-[-0.04em] text-fg">{title}</p>}
        <BootLoader {...boot} />
      </div>
    </div>
  );
}

/** Placeholder block. Size it with classes (`h-4 w-2/3`). */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={cx(s.skel, "block", className)} style={style} />;
}

/** A few ragged lines of placeholder text. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ["100%", "94%", "97%", "82%", "90%", "64%"];
  return (
    <span aria-hidden className={cx("flex flex-col gap-2.5", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: i === lines - 1 ? "58%" : widths[i % widths.length] }} />
      ))}
    </span>
  );
}

export { s as loaderStyles };
