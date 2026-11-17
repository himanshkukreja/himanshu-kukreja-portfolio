"use client";

/** The shared frame of the four exercises: the "Exercise" eyebrow with the type's icon, the title, the language switch, the question. */
import { Bug, Check, Eye, Hammer, ListOrdered } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY, KICKER, MID, SM, seg, SEG } from "@/components/dsa/ui/kit";
import { DSA_LANG_LABEL } from "@/lib/dsa/types";
import { EX_LABEL, EX_LANGS, type ExKind, type ExLang } from "@/lib/dsa/exercises";

export const ICONS: Record<ExKind, typeof Bug> = { bug: Bug, predict: Eye, order: ListOrdered, breakit: Hammer };

export const PRIMARY = `${BTN_PRIMARY} ${MID} disabled:cursor-not-allowed disabled:opacity-50`;
export const SECONDARY = `${BTN_SECONDARY} ${SM}`;
export const FOCUS_RING = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text";
/** Code lines: monospace, indentation kept, scrolls sideways on a phone instead of wrapping. */
export const CODE = "m-0 min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-[13px] leading-[1.6] text-fg";

export function ExerciseCard({
  kind,
  title,
  question,
  completed,
  langs,
  lang,
  onLang,
  children,
}: {
  kind: ExKind;
  title: string;
  question: string;
  completed: boolean;
  langs?: ExLang[];
  lang?: ExLang;
  onLang?: (l: ExLang) => void;
  children: React.ReactNode;
}) {
  const Icon = ICONS[kind];
  return (
    <section aria-label={`${EX_LABEL[kind]}${title ? `: ${title}` : ""}`} data-exercise={kind} data-completed={completed ? "" : undefined} className="dsa-ui flex flex-col gap-3 p-4 sm:p-5">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className={`${KICKER} flex items-center gap-2 text-signal-text`}>
          <Icon className="h-4 w-4" aria-hidden />
          <span>Exercise</span>
          <span aria-hidden className="text-fg-4">·</span>
          <span className="text-fg-3">{EX_LABEL[kind]}</span>
        </p>
        {completed ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-ok/15 px-2.5 py-[3px] font-mono text-[11px] uppercase tracking-[0.06em] text-ok-text">
            <Check className="h-3 w-3" aria-hidden /> Done
          </span>
        ) : null}
        {langs && langs.length > 1 && lang && onLang ? (
          <div role="group" aria-label="Language" className={`${SEG} ml-auto`}>
            {EX_LANGS.filter((l) => langs.includes(l)).map((l) => (
              <button key={l} type="button" aria-pressed={l === lang} onClick={() => onLang(l)} className={`${seg(l === lang)} !min-h-9 !px-2.5 !text-[12px] sm:!px-3`}>
                {DSA_LANG_LABEL[l]}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      {title ? <h4 className="m-0 font-display text-[18px] font-extrabold leading-tight tracking-[-0.01em] text-fg sm:text-[20px]">{title}</h4> : null}
      <p className="m-0 text-[15px] leading-[1.55] text-fg">{renderInline(question)}</p>
      {children}
    </section>
  );
}

/** `code` spans in a question or explanation. */
export function renderInline(s: string): React.ReactNode {
  return s.split(/(`[^`]+`)/g).map((p, i) =>
    p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
      <span key={i} className="rounded bg-surface-2 px-1 py-[1px] font-mono text-[0.9em]">
        {p.slice(1, -1)}
      </span>
    ) : (
      p
    ),
  );
}

/** The explanation shown at the reveal. */
export function Explain({ lines, tone }: { lines: string[]; tone?: "ok" | "bad" }) {
  return (
    <div className={`rounded-xl border-l-4 bg-bg p-3 text-[14px] leading-[1.6] text-fg-2 ${tone === "bad" ? "border-bad" : "border-ok"}`}>
      <p className="m-0 mb-1 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3">Why</p>
      {lines.map((l, i) => (
        <p key={i} className="m-0 mt-1">
          {renderInline(l)}
        </p>
      ))}
    </div>
  );
}

/** A status line that screen readers announce. */
export function Status({ children, tone }: { children?: React.ReactNode; tone?: "ok" | "bad" | "plain" }) {
  return (
    <p role="status" aria-live="polite" className={`m-0 min-h-[1.4em] text-[14px] font-medium ${tone === "ok" ? "text-ok-text" : tone === "bad" ? "text-bad-text" : "text-fg-2"}`}>
      {children}
    </p>
  );
}
