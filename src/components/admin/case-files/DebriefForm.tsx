"use client";

/** The end-of-story debrief question (DebriefCard on the public page: one pick, +50 XP when right). */
import type { Debrief } from "@/components/stories/case-types";
import type { Problem } from "@/lib/case-files/types";
import { BTN, FieldLabel, INPUT, cx } from "./client";
import { FieldProblems, Section } from "./DetailsForm";

const EMPTY: Debrief = { question: "", options: ["", "", "", ""], answer: 0, explain: "" };

export default function DebriefForm({ d, set, problems, readOnly }: { d: Debrief | null; set: (d: Debrief | null) => void; problems: Problem[]; readOnly?: boolean }) {
  const v = d || EMPTY;
  const upd = (patch: Partial<Debrief>) => set({ ...v, ...patch });
  const opts = v.options.length ? v.options : ["", ""];
  const general = problems.filter((p) => !p.field);
  return (
    <Section title="Debrief" hint="closes the case · +50 XP for the right call">
      <p className="m-0 text-[13.5px] leading-relaxed text-fg-3">
        One judgement call about the story, with 3 or 4 plausible answers. Readers pick once; the explanation shows after. Make the wrong answers tempting: they should be what a tired engineer would actually do.
      </p>
      <div>
        <FieldLabel htmlFor="cf-dq">Question</FieldLabel>
        <textarea id="cf-dq" rows={2} className={cx(INPUT, "resize-y font-display text-[16px] font-bold")} value={v.question} disabled={readOnly} placeholder="Ananya's payment clears 4 seconds after her seat hold expired. What should the system do?" onChange={(e) => upd({ question: e.target.value })} />
        <FieldProblems problems={problems} field="debrief.question" />
      </div>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 font-mono text-[11px] uppercase tracking-label text-fg-3">Options · mark the right one</legend>
        {opts.map((o, k) => (
          <div key={k} className="flex items-stretch gap-2">
            <label className={cx("flex w-12 shrink-0 cursor-pointer items-center justify-center gap-1 border font-mono text-[12px]", v.answer === k ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-3")} title="Mark as the right answer">
              <input type="radio" name="cf-danswer" className="sr-only" checked={v.answer === k} disabled={readOnly} onChange={() => upd({ answer: k })} />
              {String.fromCharCode(65 + k)}
              <span className="sr-only">is the right answer</span>
            </label>
            <input aria-label={`Option ${String.fromCharCode(65 + k)}`} className={INPUT} value={o} disabled={readOnly} onChange={(e) => upd({ options: opts.map((x, i) => (i === k ? e.target.value : x)) })} />
            {opts.length > 2 && !readOnly && (
              <button
                type="button"
                aria-label={`Remove option ${String.fromCharCode(65 + k)}`}
                className={cx(BTN, "w-10 px-0")}
                onClick={() => upd({ options: opts.filter((_, i) => i !== k), answer: v.answer === k ? 0 : v.answer > k ? v.answer - 1 : v.answer })}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {opts.length < 4 && !readOnly && (
          <button type="button" className={cx(BTN, "self-start")} onClick={() => upd({ options: [...opts, ""] })}>
            + option
          </button>
        )}
        <FieldProblems problems={problems} field="debrief.options" />
        <FieldProblems problems={problems} field="debrief.answer" />
      </fieldset>
      <div>
        <FieldLabel htmlFor="cf-dx">Why that&apos;s the answer</FieldLabel>
        <textarea id="cf-dx" rows={3} className={cx(INPUT, "resize-y")} value={v.explain || ""} disabled={readOnly} onChange={(e) => upd({ explain: e.target.value })} />
        <FieldProblems problems={problems} field="debrief.explain" />
      </div>
      {general.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {general.map((p, i) => (
            <li key={i} className={cx("text-[12.5px]", p.level === "error" ? "text-bad-text" : "text-signal-text")}>
              {p.level === "error" ? "✗ " : "! "}
              {p.message}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
