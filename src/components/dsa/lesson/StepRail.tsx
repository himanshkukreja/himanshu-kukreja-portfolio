"use client";

/**
 * The lesson's four steps: a left rail on desktop (StepRail) and a segmented bar on phones (StepBar). Both are fed the
 * same list, so the state of a step (done, you are here, still to do) is one idea shown two ways. Every state has a
 * glyph or a word as well as a colour.
 */
import type { StepId } from "@/lib/dsa/lesson-steps";

export type StepView = { id: StepId; n: number; title: string; sub: string; state: "done" | "current" | "todo" };

export function StepRail({ steps, onPick, className = "" }: { steps: StepView[]; onPick: (id: StepId) => void; className?: string }) {
  return (
    <nav aria-label="Lesson steps" data-focus-hide className={className}>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {steps.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                onPick(s.id);
              }}
              aria-current={s.state === "current" ? "step" : undefined}
              className={`flex min-h-14 items-center gap-3 border border-l-[3px] px-3 py-2 ${
                s.state === "current" ? "border-line-strong border-l-signal bg-surface-2 text-fg" : "border-line text-fg-2 hover:bg-surface-2 hover:text-fg"
              }`}
            >
              <span
                aria-hidden
                className={`grid h-7 w-7 shrink-0 place-items-center font-mono text-[13px] font-semibold ${
                  s.state === "current" ? "bg-signal text-on-signal" : s.state === "done" ? "border-2 border-fg bg-fg text-bg" : "border border-line-strong text-fg-2"
                }`}
              >
                {s.state === "done" ? "✓" : s.n}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="text-[15px] font-semibold">{s.title}</span>
                <span className="truncate font-mono text-[11px] text-fg-3">{s.state === "done" ? "Done" : s.sub}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Phones and tablets: four segments (a todo segment uses line-strong so it shows on Night) and the step's name. */
export function StepBar({ steps, onPick, className = "" }: { steps: StepView[]; onPick: (id: StepId) => void; className?: string }) {
  const cur = steps.find((s) => s.state === "current") ?? steps[0];
  return (
    <nav aria-label="Lesson steps" data-focus-hide className={className}>
      <ol className="m-0 grid list-none grid-cols-4 gap-1.5 p-0">
        {steps.map((s) => (
          <li key={s.id} className="min-w-0">
            <a
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                onPick(s.id);
              }}
              aria-current={s.state === "current" ? "step" : undefined}
              className="flex min-h-11 flex-col justify-between gap-1.5 pt-1"
            >
              <span aria-hidden className={`block h-[5px] w-full ${s.state === "current" ? "bg-signal" : s.state === "done" ? "bg-fg" : "bg-line-strong"}`} />
              <span className={`truncate font-mono text-[11px] ${s.state === "current" ? "font-semibold text-fg" : "text-fg-3"}`}>
                {s.state === "done" ? "✓ " : `${s.n} `}
                {s.title}
              </span>
            </a>
          </li>
        ))}
      </ol>
      <p className="m-0 mt-1 font-mono text-[11px] text-fg-3" aria-live="polite">
        Step {cur.n} of {steps.length} · {cur.sub}
      </p>
    </nav>
  );
}
