"use client";

/**
 * The lesson's four steps: a row of rounded pills on computers (StepPills) and a segmented bar on phones (StepBar). Both are fed the
 * same list, so the state of a step (done, you are here, still to do) is one idea shown two ways. Every state has a
 * glyph or a word as well as a colour.
 */
import type { StepId } from "@/lib/dsa/lesson-steps";

export type StepView = { id: StepId; n: number; title: string; sub: string; state: "done" | "current" | "todo" };

/**
 * Computers: the four steps as a row of big rounded pills (the canvas): a round number badge, the title and its sub-line.
 * The current step is filled with the course colour; a done step's badge is a tick on the ink.
 */
export function StepPills({ steps, onPick, className = "" }: { steps: StepView[]; onPick: (id: StepId) => void; className?: string }) {
  return (
    <nav aria-label="Lesson steps" data-focus-hide className={className}>
      <ol className="m-0 grid list-none grid-cols-4 gap-2.5 p-0">
        {steps.map((s) => {
          const now = s.state === "current";
          return (
            <li key={s.id} className="min-w-0">
              <a
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onPick(s.id);
                }}
                aria-current={now ? "step" : undefined}
                className={`flex min-h-[60px] items-center gap-3 rounded-[14px] border px-4 py-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text ${
                  now ? "border-signal bg-signal text-on-signal" : "border-line bg-surface text-fg hover:bg-surface-2"
                }`}
              >
                <span
                  aria-hidden
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ${
                    now ? "bg-on-signal text-signal" : s.state === "done" ? "bg-fg text-bg" : "bg-surface-2 text-fg-2"
                  }`}
                >
                  {s.state === "done" ? "✓" : s.n}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5 leading-tight">
                  <span className="text-[15px] font-semibold">{s.title}</span>
                  <span className={`truncate text-[12px] ${now ? "opacity-90" : "text-fg-3"}`}>{s.state === "done" ? "Done" : s.sub}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** @deprecated the left rail of the first build; kept for any caller outside the lesson shell. Use StepPills. */
export const StepRail = StepPills;

/** Phones and tablets: four segments (a todo segment uses line-strong so it shows on Night) and the step's name. */
export function StepBar({ steps, onPick, className = "" }: { steps: StepView[]; onPick: (id: StepId) => void; className?: string }) {
  const cur = steps.find((s) => s.state === "current") ?? steps[0];
  return (
    <nav aria-label="Lesson steps" data-focus-hide className={className}>
      <ol className="m-0 grid list-none grid-cols-4 gap-1.5 p-0">
        {steps.map((s) => (
          <li key={s.id} className="min-w-0 text-center">
            <a
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                onPick(s.id);
              }}
              aria-current={s.state === "current" ? "step" : undefined}
              className="flex min-h-11 flex-col justify-between gap-1.5 pt-1"
            >
              <span aria-hidden className={`block h-[5px] w-full rounded-full ${s.state === "current" ? "bg-signal" : s.state === "done" ? "bg-fg-2" : "bg-line dark:bg-line-strong"}`} />
              <span className={`truncate text-[11px] ${s.state === "current" ? "font-semibold text-fg" : "text-fg-3"}`}>
                {s.state === "done" ? "✓ " : ""}
                {s.title}
              </span>
            </a>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">
        Step {cur.n} of {steps.length} · {cur.sub}
      </p>
    </nav>
  );
}
