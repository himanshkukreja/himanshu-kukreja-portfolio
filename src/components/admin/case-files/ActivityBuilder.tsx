"use client";

/**
 * Form builder for the data-driven end-of-file activity (components/stories/activities/data.ts):
 * questions, order-the-timeline, spot-the-bug and decide steps, rendered on the site by the same
 * ActivityShell + kit as the hand-written activities. A JSON view is there for bulk edits.
 */
import { useState } from "react";
import { ACTIVITY_KINDS, STEP_TYPES, blankStep, parseActivityData, stepMax, type CaseActivityData, type DataStep, type DataStepType } from "@/components/stories/activities/data";
import { passScore } from "@/components/stories/activities/types";
import type { Problem } from "@/lib/case-files/types";
import { BTN, BTN_PRIMARY, FieldLabel, INPUT, Note, cx } from "./client";
import { Section } from "./DetailsForm";
import { TEMPLATE_ACTIVITY } from "@/lib/case-files/template";

type Props = { a: CaseActivityData | null; set: (a: CaseActivityData | null) => void; problems: Problem[]; readOnly?: boolean };

export default function ActivityBuilder({ a, set, problems, readOnly }: Props) {
  const [json, setJson] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  if (!a) {
    return (
      <Section title="End-of-file activity" hint="optional · +25 XP when solved">
        <p className="m-0 text-[13.5px] leading-relaxed text-fg-3">
          Every repo case file ends with an interactive drill. Build one from steps: questions, order the timeline, spot the bug, decide. It plays in the preview exactly like on the site.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN_PRIMARY} disabled={readOnly} onClick={() => set(JSON.parse(JSON.stringify(TEMPLATE_ACTIVITY)))}>
            + add activity
          </button>
        </div>
      </Section>
    );
  }

  const max = a.steps.reduce((t, s) => t + stepMax(s), 0);
  const upd = (patch: Partial<CaseActivityData>) => set({ ...a, ...patch });
  const updStep = (i: number, s: DataStep) => upd({ steps: a.steps.map((x, k) => (k === i ? s : x)) });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= a.steps.length) return;
    const steps = [...a.steps];
    [steps[i], steps[j]] = [steps[j], steps[i]];
    upd({ steps });
  };
  const add = (type: DataStepType) => upd({ steps: [...a.steps, blankStep(type, a.steps.length + 1)] });
  const general = problems.filter((p) => !p.field);

  return (
    <div className="flex flex-col gap-4">
      <Section title="End-of-file activity" hint={`${a.steps.length} steps · ${max} pts · solved at ${passScore(max)}/${max}`}>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px_100px]">
          <div>
            <FieldLabel htmlFor="cf-at">Title</FieldLabel>
            <input id="cf-at" className={cx(INPUT, "font-display text-[16px] font-bold")} value={a.title} disabled={readOnly} placeholder="Failover drill" onChange={(e) => upd({ title: e.target.value })} />
          </div>
          <div>
            <FieldLabel htmlFor="cf-ak">Format</FieldLabel>
            <select id="cf-ak" className={INPUT} value={a.kind} disabled={readOnly} onChange={(e) => upd({ kind: e.target.value })}>
              {[...new Set([...ACTIVITY_KINDS, a.kind])].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="cf-am">Minutes</FieldLabel>
            <input id="cf-am" type="number" min={1} max={30} className={cx(INPUT, "font-mono")} value={a.minutes} disabled={readOnly} onChange={(e) => upd({ minutes: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })} />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="cf-ab" hint="shown before the reader starts">
            Blurb
          </FieldLabel>
          <textarea id="cf-ab" rows={2} className={cx(INPUT, "resize-y")} value={a.blurb} disabled={readOnly} placeholder="2 AM, Black Friday, and the leader just went dark. Pick the follower to promote…" onChange={(e) => upd({ blurb: e.target.value })} />
        </div>
        {general.length > 0 && <ProblemList problems={general} />}
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <button
            type="button"
            className={BTN}
            onClick={() => {
              setJsonError(null);
              setJson(json === null ? JSON.stringify(a, null, 2) : null);
            }}
          >
            {json === null ? "{ } edit as JSON" : "back to the form"}
          </button>
          {!readOnly && (
            <button type="button" className={cx(BTN, "hover:border-bad hover:text-bad-text")} onClick={() => set(null)}>
              remove activity
            </button>
          )}
        </div>
      </Section>

      {json !== null ? (
        <Section title="Activity JSON">
          <textarea aria-label="Activity JSON" className={cx(INPUT, "min-h-[50vh] resize-y font-mono text-[12px] leading-[1.55]")} value={json} disabled={readOnly} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
          {jsonError && <p className="m-0 text-[13px] text-bad-text">✗ {jsonError}</p>}
          <button
            type="button"
            className={cx(BTN_PRIMARY, "self-start")}
            disabled={readOnly}
            onClick={() => {
              try {
                const parsed = parseActivityData(JSON.parse(json));
                if (!parsed) throw new Error("No steps or title found.");
                set(parsed);
                setJson(null);
              } catch (e) {
                setJsonError((e as Error).message);
              }
            }}
          >
            apply JSON
          </button>
        </Section>
      ) : (
        <>
          {a.steps.map((s, i) => (
            <StepCard
              key={s.id + i}
              s={s}
              i={i}
              n={a.steps.length}
              readOnly={readOnly}
              problems={problems.filter((p) => p.field === `step-${i + 1}`)}
              onChange={(x) => updStep(i, x)}
              onMove={(d) => move(i, d)}
              onRemove={() => upd({ steps: a.steps.filter((_, k) => k !== i) })}
            />
          ))}
          {!readOnly && (
            <div className="flex flex-col gap-2 border border-dashed border-line-strong p-3">
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">add a step</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {STEP_TYPES.map((t) => (
                  <button key={t.id} type="button" className={cx(BTN, "h-auto flex-col !items-start py-2 text-left")} onClick={() => add(t.id)}>
                    <span className="text-fg">+ {t.label.toLowerCase()}</span>
                    <span className="font-sans text-[11.5px] text-fg-4">{t.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProblemList({ problems }: { problems: Problem[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {problems.map((p, i) => (
        <li key={i} className={cx("text-[12.5px] leading-snug", p.level === "error" ? "text-bad-text" : "text-signal-text")}>
          {p.level === "error" ? "✗ " : "! "}
          {p.message}
        </li>
      ))}
    </ul>
  );
}

function StepCard({
  s,
  i,
  n,
  readOnly,
  problems,
  onChange,
  onMove,
  onRemove,
}: {
  s: DataStep;
  i: number;
  n: number;
  readOnly?: boolean;
  problems: Problem[];
  onChange: (s: DataStep) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const typeLabel = STEP_TYPES.find((t) => t.id === s.type)?.label || s.type;
  const base = (patch: Partial<DataStep>) => onChange({ ...s, ...patch } as DataStep);
  return (
    <section className="flex flex-col gap-3 border border-line bg-surface p-4" aria-label={`Step ${i + 1}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[12px] text-fg-2">
          <span className="text-signal-text">{String(i + 1).padStart(2, "0")}</span> · {typeLabel.toLowerCase()} · {stepMax(s)} pt{stepMax(s) === 1 ? "" : "s"}
        </span>
        {!readOnly && (
          <span className="flex gap-1">
            <button type="button" aria-label="Move step up" className={cx(BTN, "w-10 px-0")} disabled={i === 0} onClick={() => onMove(-1)}>
              ↑
            </button>
            <button type="button" aria-label="Move step down" className={cx(BTN, "w-10 px-0")} disabled={i === n - 1} onClick={() => onMove(1)}>
              ↓
            </button>
            <button type="button" aria-label="Remove step" className={cx(BTN, "w-10 px-0 hover:border-bad hover:text-bad-text")} onClick={onRemove}>
              ×
            </button>
          </span>
        )}
      </header>
      <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div>
          <FieldLabel htmlFor={`${s.id}-label`} hint="progress rail">
            Label
          </FieldLabel>
          <input id={`${s.id}-label`} className={INPUT} value={s.label} disabled={readOnly} onChange={(e) => base({ label: e.target.value })} />
        </div>
        <div>
          <FieldLabel htmlFor={`${s.id}-prompt`}>Prompt</FieldLabel>
          <input id={`${s.id}-prompt`} className={INPUT} value={s.prompt} disabled={readOnly} onChange={(e) => base({ prompt: e.target.value })} />
        </div>
      </div>

      {s.type === "choice" && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Options · mark the right one (readers get them shuffled)</span>
          {s.options.map((o, k) => (
            <div key={k} className="flex flex-col gap-1.5">
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                aria-pressed={s.answer === k}
                aria-label={`Mark option ${String.fromCharCode(65 + k)} as right`}
                disabled={readOnly}
                onClick={() => onChange({ ...s, answer: k })}
                className={cx("w-11 shrink-0 border font-mono text-[12px]", s.answer === k ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-3")}
              >
                {String.fromCharCode(65 + k)}
              </button>
              <input aria-label={`Option ${String.fromCharCode(65 + k)}`} className={INPUT} value={o} disabled={readOnly} onChange={(e) => onChange({ ...s, options: s.options.map((x, j) => (j === k ? e.target.value : x)) })} />
              {s.options.length > 2 && !readOnly && (
                <button
                  type="button"
                  aria-label="Remove option"
                  className={cx(BTN, "w-10 px-0")}
                  onClick={() => onChange({ ...s, options: s.options.filter((_, j) => j !== k), outcomes: s.outcomes?.filter((_, j) => j !== k), answer: s.answer === k ? 0 : s.answer > k ? s.answer - 1 : s.answer })}
                >
                  ×
                </button>
              )}
            </div>
            {s.outcomes && (
              <input
                aria-label={`Outcome if the reader picks ${String.fromCharCode(65 + k)}`}
                placeholder="what happens if they pick this"
                className={cx(INPUT, "ml-[52px] w-[calc(100%-52px)] text-[13px]")}
                value={s.outcomes[k] || ""}
                disabled={readOnly}
                onChange={(e) => onChange({ ...s, outcomes: s.options.map((_, j) => (j === k ? e.target.value : s.outcomes?.[j] || "")) })}
              />
            )}
            </div>
          ))}
          {!readOnly && (
            <button type="button" className={cx(BTN, "self-start")} onClick={() => onChange({ ...s, outcomes: s.outcomes ? undefined : s.options.map(() => "") })}>
              {s.outcomes ? "remove per-option outcomes" : "+ outcome per option (decide)"}
            </button>
          )}
          {s.options.length < 6 && !readOnly && (
            <button type="button" className={cx(BTN, "self-start")} onClick={() => onChange({ ...s, options: [...s.options, ""] })}>
              + option
            </button>
          )}
          <FieldLabel htmlFor={`${s.id}-x`}>Explanation</FieldLabel>
          <textarea id={`${s.id}-x`} rows={2} className={cx(INPUT, "resize-y")} value={s.explain} disabled={readOnly} onChange={(e) => onChange({ ...s, explain: e.target.value })} />
        </div>
      )}

      {s.type === "order" && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Items in the RIGHT order (readers get them shuffled)</span>
          {s.items.map((it, k) => (
            <div key={it.id + k} className="grid grid-cols-[32px_minmax(0,1fr)_40px] gap-2 sm:grid-cols-[32px_minmax(0,1fr)_200px_40px]">
              <span className="grid place-items-center bg-fg font-mono text-[12px] text-bg">{k + 1}</span>
              <input aria-label={`Item ${k + 1}`} className={INPUT} value={it.text} disabled={readOnly} onChange={(e) => onChange({ ...s, items: s.items.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)) })} />
              <input aria-label={`Item ${k + 1} note`} placeholder="note (optional)" className={cx(INPUT, "hidden sm:block")} value={it.note || ""} disabled={readOnly} onChange={(e) => onChange({ ...s, items: s.items.map((x, j) => (j === k ? { ...x, note: e.target.value || undefined } : x)) })} />
              <button type="button" aria-label="Remove item" className={cx(BTN, "w-10 px-0")} disabled={readOnly || s.items.length <= 2} onClick={() => onChange({ ...s, items: s.items.filter((_, j) => j !== k) })}>
                ×
              </button>
            </div>
          ))}
          {s.items.length < 10 && !readOnly && (
            <button type="button" className={cx(BTN, "self-start")} onClick={() => onChange({ ...s, items: [...s.items, { id: `i${Date.now().toString(36)}`, text: "" }] })}>
              + item
            </button>
          )}
          <FieldLabel htmlFor={`${s.id}-ox`} hint="optional · shown after checking">
            Explanation
          </FieldLabel>
          <textarea id={`${s.id}-ox`} rows={2} className={cx(INPUT, "resize-y")} value={s.explain || ""} disabled={readOnly} onChange={(e) => onChange({ ...s, explain: e.target.value || undefined })} />
        </div>
      )}

      {s.type === "spot" && (
        <div className="flex flex-col gap-2">
          <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div>
              <FieldLabel htmlFor={`${s.id}-file`}>File name</FieldLabel>
              <input id={`${s.id}-file`} className={cx(INPUT, "font-mono text-[12px]")} value={s.file} disabled={readOnly} onChange={(e) => onChange({ ...s, file: e.target.value })} />
            </div>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Lines · tick the faulty ones, add a note shown after checking</span>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {s.lines.map((l, k) => (
              <li key={k} className="grid grid-cols-[40px_minmax(0,1fr)_40px] gap-2 sm:grid-cols-[40px_minmax(0,1fr)_minmax(0,0.8fr)_40px]">
                <button
                  type="button"
                  aria-pressed={!!l.faulty}
                  aria-label={`Line ${k + 1} is ${l.faulty ? "faulty" : "fine"}`}
                  disabled={readOnly}
                  onClick={() => onChange({ ...s, lines: s.lines.map((x, j) => (j === k ? { ...x, faulty: !x.faulty || undefined } : x)) })}
                  className={cx("border font-mono text-[11px]", l.faulty ? "border-bad bg-bad/15 text-bad-text" : "border-line-strong text-fg-4")}
                >
                  {l.faulty ? "bug" : k + 1}
                </button>
                <input aria-label={`Line ${k + 1} code`} className={cx(INPUT, "font-mono text-[12.5px]")} value={l.code} disabled={readOnly} onChange={(e) => onChange({ ...s, lines: s.lines.map((x, j) => (j === k ? { ...x, code: e.target.value } : x)) })} />
                <input aria-label={`Line ${k + 1} note`} placeholder="note" className={cx(INPUT, "hidden sm:block")} value={l.note || ""} disabled={readOnly} onChange={(e) => onChange({ ...s, lines: s.lines.map((x, j) => (j === k ? { ...x, note: e.target.value || undefined } : x)) })} />
                <button type="button" aria-label="Remove line" className={cx(BTN, "w-10 px-0")} disabled={readOnly || s.lines.length <= 2} onClick={() => onChange({ ...s, lines: s.lines.filter((_, j) => j !== k) })}>
                  ×
                </button>
              </li>
            ))}
          </ol>
          {s.lines.length < 40 && !readOnly && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BTN} onClick={() => onChange({ ...s, lines: [...s.lines, { code: "" }] })}>
                + line
              </button>
              <button
                type="button"
                className={BTN}
                title="Paste a snippet: one line per row"
                onClick={() => {
                  const txt = window.prompt("Paste the snippet (replaces the lines):");
                  if (txt != null) onChange({ ...s, lines: txt.replace(/\r\n/g, "\n").split("\n").slice(0, 40).map((code) => ({ code })) });
                }}
              >
                paste snippet
              </button>
            </div>
          )}
          <FieldLabel htmlFor={`${s.id}-sx`} hint="optional · shown after checking">
            Explanation
          </FieldLabel>
          <textarea id={`${s.id}-sx`} rows={2} className={cx(INPUT, "resize-y")} value={s.explain || ""} disabled={readOnly} onChange={(e) => onChange({ ...s, explain: e.target.value || undefined })} />
        </div>
      )}

      {s.type === "decide" && (
        <div className="flex flex-col gap-3">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Buckets (the choices)</span>
          {s.buckets.map((b, k) => (
            <div key={b.id} className="grid grid-cols-[minmax(0,1fr)_40px] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px]">
              <input aria-label={`Bucket ${k + 1} label`} placeholder="Synchronous" className={INPUT} value={b.label} disabled={readOnly} onChange={(e) => onChange({ ...s, buckets: s.buckets.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)) })} />
              <input aria-label={`Bucket ${k + 1} hint`} placeholder="hint (optional)" className={cx(INPUT, "hidden sm:block")} value={b.hint || ""} disabled={readOnly} onChange={(e) => onChange({ ...s, buckets: s.buckets.map((x, j) => (j === k ? { ...x, hint: e.target.value || undefined } : x)) })} />
              <button
                type="button"
                aria-label="Remove bucket"
                className={cx(BTN, "w-10 px-0")}
                disabled={readOnly || s.buckets.length <= 2}
                onClick={() => onChange({ ...s, buckets: s.buckets.filter((_, j) => j !== k), items: s.items.map((it) => (it.bucket === b.id ? { ...it, bucket: s.buckets[0].id === b.id ? s.buckets[1].id : s.buckets[0].id } : it)) })}
              >
                ×
              </button>
            </div>
          ))}
          {s.buckets.length < 4 && !readOnly && (
            <button type="button" className={cx(BTN, "self-start")} onClick={() => onChange({ ...s, buckets: [...s.buckets, { id: `b${Date.now().toString(36)}`, label: "" }] })}>
              + bucket
            </button>
          )}
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Scenarios · pick each one&apos;s bucket</span>
          {s.items.map((it, k) => (
            <div key={it.label + k} className="flex flex-col gap-2 border border-line bg-bg p-3">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px]">
                <input aria-label={`Scenario ${k + 1}`} placeholder="A $9.99 Premium purchase" className={INPUT} value={it.text} disabled={readOnly} onChange={(e) => onChange({ ...s, items: s.items.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)) })} />
                <select aria-label={`Scenario ${k + 1} bucket`} className={INPUT} value={it.bucket} disabled={readOnly} onChange={(e) => onChange({ ...s, items: s.items.map((x, j) => (j === k ? { ...x, bucket: e.target.value } : x)) })}>
                  {s.buckets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label || b.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-stretch gap-2">
                <input aria-label={`Scenario ${k + 1} explanation`} placeholder="why it goes there" className={INPUT} value={it.explain} disabled={readOnly} onChange={(e) => onChange({ ...s, items: s.items.map((x, j) => (j === k ? { ...x, explain: e.target.value } : x)) })} />
                <button type="button" aria-label="Remove scenario" className={cx(BTN, "w-10 shrink-0 px-0")} disabled={readOnly || s.items.length <= 1} onClick={() => onChange({ ...s, items: s.items.filter((_, j) => j !== k) })}>
                  ×
                </button>
              </div>
            </div>
          ))}
          {s.items.length < 10 && !readOnly && (
            <button type="button" className={cx(BTN, "self-start")} onClick={() => onChange({ ...s, items: [...s.items, { label: `s${Date.now().toString(36)}`, text: "", bucket: s.buckets[0]?.id || "a", explain: "" }] })}>
              + scenario
            </button>
          )}
        </div>
      )}

      {problems.length > 0 && <ProblemList problems={problems} />}
      {s.type === "spot" && s.lines.filter((l) => l.faulty).length === 0 && <Note tone="warn">Tick at least one faulty line.</Note>}
    </section>
  );
}
