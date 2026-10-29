"use client";

/**
 * End of a side quest: "Follow-up drills". The interviewer's push-backs after you present the design,
 * one card at a time: type (or think) your answer, then reveal a strong answer, the points it must hit
 * and a common weak answer. Pre-written from the quest (resources/quest-drills), no AI calls. The typed
 * answers and the "practised" marks stay in this browser (src/lib/learn/drills/store.ts).
 */
import { Fragment, useId, useRef, useState, type ReactNode } from "react";
import type { DrillItem, DrillKind, QuestDrills } from "@/lib/learn/drills/parse";
import { updateDrillPractice, useDrillPractice } from "@/lib/learn/drills/store";

const KIND_LABEL: Record<DrillKind, string> = {
  failure: "failure",
  scale: "scale & numbers",
  "trade-off": "trade-off",
  alternative: "alternative tech",
  consistency: "consistency",
  security: "security",
  cost: "cost",
};

/** **bold** and `code` only; everything else is plain text (no HTML is ever injected). */
function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
      <strong key={i} className="font-semibold text-fg">
        {p.slice(2, -2)}
      </strong>
    ) : p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
      <code key={i} className="bg-surface-2 px-1 font-mono text-[0.92em] text-fg">
        {p.slice(1, -1)}
      </code>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    )
  );
}

export default function FollowUpDrills({ drills, title }: { drills: QuestDrills; title: string }) {
  const { quest, items } = drills;
  const practice = useDrillPractice(quest);
  const practised = items.filter((it) => practice.p[it.id]).length;
  // until the learner picks a card, open on the first one not yet practised
  const [picked, setPicked] = useState<number | null>(null);
  const firstOpen = Math.max(0, items.findIndex((it) => !practice.p[it.id]));
  const idx = Math.min(picked ?? firstOpen, items.length - 1);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const qRef = useRef<HTMLHeadingElement>(null);
  const uid = useId();

  const go = (i: number) => {
    setPicked(i);
    // the new card's question takes focus, so keyboard and screen-reader users land on it
    requestAnimationFrame(() => qRef.current?.focus({ preventScroll: true }));
  };

  const it = items[idx];
  const open = !!revealed[it.id];
  const done = !!practice.p[it.id];

  const reveal = () => {
    setPicked(idx); // practising this one must not move the "first not practised" card under the learner
    setRevealed((r) => ({ ...r, [it.id]: !open }));
    if (!open && !done) updateDrillPractice(quest, (p) => ({ ...p, p: { ...p.p, [it.id]: Date.now() } }));
  };

  return (
    <section id="follow-up-drills" aria-labelledby={`${uid}-h`} className="flex scroll-mt-24 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={`${uid}-h`} className="m-0 font-mono text-xs uppercase tracking-label text-fg-3">
          Follow-up drills
        </h2>
        <span className="font-mono text-[11px] text-fg-3" aria-live="polite">
          <span className={practised === items.length ? "text-ok" : "text-fg-2"}>
            {practised} of {items.length}
          </span>{" "}
          practised
        </span>
      </div>

      <div className="flex flex-col gap-4 border border-line-strong bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[15px] leading-normal text-fg-2">
            You presented {title}. Now the interviewer pushes back. Answer each follow-up out loud or in the box, then reveal a strong answer.
          </p>
          <div aria-hidden className="h-1 w-full bg-surface-2">
            <div className="h-full bg-signal transition-[width] duration-300" style={{ width: `${(practised / items.length) * 100}%` }} />
          </div>
        </div>

        <nav aria-label="Follow-up questions" className="flex flex-wrap gap-1.5">
          {items.map((x, i) => {
            const isDone = !!practice.p[x.id];
            const cur = i === idx;
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => go(i)}
                aria-current={cur ? "step" : undefined}
                aria-label={`Follow-up ${i + 1}${isDone ? ", practised" : ""}`}
                className={`flex h-10 w-10 items-center justify-center border font-mono text-[13px] ${
                  cur
                    ? "border-signal bg-signal text-on-signal"
                    : isDone
                      ? "border-line-strong bg-surface-2 text-fg"
                      : "border-line text-fg-3 hover:border-line-strong hover:text-fg"
                }`}
              >
                {isDone && !cur ? "✓" : i + 1}
              </button>
            );
          })}
        </nav>

        <article aria-labelledby={`${uid}-q`} className="flex flex-col gap-3 border-t border-line pt-4">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
            Follow-up {idx + 1} / {items.length}
            {it.kind ? <span className="text-signal-text"> · {KIND_LABEL[it.kind]}</span> : null}
            {done ? <span className="text-ok"> · practised</span> : null}
          </span>
          <h3 id={`${uid}-q`} ref={qRef} tabIndex={-1} className="m-0 font-display text-[21px] font-bold leading-[1.2] tracking-[-0.01em] text-fg outline-none sm:text-[24px]">
            “{it.q}”
          </h3>
          {it.pushesOn && (
            <p className="m-0 text-sm leading-normal text-fg-3">
              <span className="font-mono text-[11px] uppercase tracking-label">Pushes on</span> · {it.pushesOn}
            </p>
          )}

          <label htmlFor={`${uid}-a-${it.id}`} className="mt-1 font-mono text-[11px] uppercase tracking-label text-fg-3">
            Your answer <span className="normal-case tracking-normal text-fg-4">(stays on this device)</span>
          </label>
          <textarea
            id={`${uid}-a-${it.id}`}
            value={practice.a[it.id] ?? ""}
            onChange={(e) => {
              const v = e.target.value.slice(0, 4000);
              if (picked === null) setPicked(idx);
              updateDrillPractice(quest, (p) => ({ ...p, a: { ...p.a, [it.id]: v } }));
            }}
            rows={4}
            placeholder="What would you say? Name the mechanism, the number, the trade-off."
            className="min-h-[112px] w-full resize-y border border-line bg-bg px-3 py-2.5 text-[16px] leading-normal text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={reveal}
              aria-expanded={open}
              aria-controls={`${uid}-r`}
              className={`min-h-11 px-4 text-[15px] font-semibold ${open ? "border border-line-strong text-fg-2 hover:text-fg" : "bg-signal text-on-signal hover:brightness-110"}`}
            >
              {open ? "Hide the answer" : "Reveal"}
            </button>
            {!open && <span className="text-[13px] text-fg-4">Revealing marks it practised.</span>}
          </div>

          <div id={`${uid}-r`} hidden={!open} className="flex flex-col gap-4">
            {open && <Answer it={it} />}
          </div>
        </article>

        <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => go(idx - 1)}
            disabled={idx === 0}
            className="min-h-11 px-2 font-mono text-[13px] text-fg-2 hover:text-fg disabled:invisible"
          >
            ← Previous
          </button>
          <button
            type="button"
            onClick={() => go(idx + 1)}
            disabled={idx === items.length - 1}
            className="min-h-11 px-2 font-mono text-[13px] text-signal-text hover:brightness-110 disabled:invisible"
          >
            Next follow-up →
          </button>
        </div>
      </div>
    </section>
  );
}

function Answer({ it }: { it: DrillItem }) {
  return (
    <>
      <div className="flex flex-col gap-2 border-l-2 border-ok pl-3 sm:pl-4">
        <span className="font-mono text-[11px] uppercase tracking-label text-ok">Strong answer</span>
        {it.strong.map((p, i) => (
          <p key={i} className="m-0 text-[15px] leading-relaxed text-fg-2">
            {inline(p)}
          </p>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Must mention</span>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {it.must.map((m, i) => (
            <li key={i} className="flex gap-2 text-[15px] leading-normal text-fg">
              <span aria-hidden className="font-mono text-signal-text">
                ✓
              </span>
              <span>{inline(m)}</span>
            </li>
          ))}
        </ul>
      </div>
      {it.weak && (
        <div className="flex flex-col gap-1.5 border-l-2 border-bad pl-3 sm:pl-4">
          <span className="font-mono text-[11px] uppercase tracking-label text-bad-text">Weak answer</span>
          <p className="m-0 text-[15px] leading-relaxed text-fg-2">{inline(it.weak)}</p>
        </div>
      )}
      {it.section && (
        <span className="font-mono text-[12px] text-fg-3">
          Builds on:{" "}
          {it.sectionId ? (
            <a href={`#${it.sectionId}`} className="text-signal-text underline-offset-2 hover:underline">
              {it.section}
            </a>
          ) : (
            it.section
          )}
        </span>
      )}
    </>
  );
}
