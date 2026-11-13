"use client";

/**
 * The weak-spot drill (AI wave 2, FEATURES "weak-drill"): 3 quick questions on a topic the learner missed twice lately
 * (opened from the quiet nudge, /memory and the dashboard), or one warm-up question on a DSA problem failed 3+ times
 * ("Try a smaller version"). The questions and their answer key come from POST /api/learn/ai/drill; the browser grades at
 * once, so nothing the learner types leaves the page. A finished drill records one result (counts only).
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { userFetch } from "@/components/learn/progress/userFetch";
import { track } from "@/lib/track";
import { gradeQuestion, type Drill } from "@/lib/learner/drill-model";
import { refreshPlanning } from "./usePlanning";

type Loaded = { drill: Drill; key: string; label: string; href: string };
type Step = { pick?: number; text: string; ok: boolean | null };

export default function DrillPanel({ topicKey, problem, label, href, onClose }: { topicKey?: string; problem?: string; label: string; href?: string; onClose: () => void }) {
  const [state, setState] = useState<"loading" | "run" | "err">("loading");
  const [err, setErr] = useState("");
  const [data, setData] = useState<Loaded | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [at, setAt] = useState(0);
  const sent = useRef(false);
  const warm = !!problem;

  useEffect(() => {
    let live = true;
    track("drill_open", { kind: warm ? "warmup" : "drill" });
    userFetch("/api/learn/ai/drill", { method: "POST", body: JSON.stringify(warm ? { action: "warmup", problem } : { action: "drill", key: topicKey }) })
      .then(async (r) => ({ r, b: (await r.json().catch(() => null)) as (Loaded & { error?: string }) | null }))
      .catch(() => null)
      .then((x) => {
        if (!live) return;
        if (x?.r.ok && x.b?.drill) {
          setData(x.b);
          setSteps(x.b.drill.questions.map(() => ({ text: "", ok: null })));
          setState("run");
        } else {
          setErr(x?.b?.error || "The questions didn't come through.");
          setState("err");
        }
      });
    return () => {
      live = false;
    };
  }, [topicKey, problem, warm]);

  const qs = data?.drill.questions ?? [];
  const finished = state === "run" && steps.length > 0 && steps.every((s) => s.ok !== null);
  const correct = steps.filter((s) => s.ok).length;

  useEffect(() => {
    if (!finished || sent.current || !data) return;
    sent.current = true;
    track("drill_done", { kind: warm ? "warmup" : "drill", correct, total: qs.length });
    void userFetch("/api/learn/ai/drill", { method: "POST", body: JSON.stringify({ action: "done", key: data.key, correct, total: qs.length }) })
      .then(() => refreshPlanning())
      .catch(() => {});
  }, [finished, data, correct, qs.length, warm]);

  const answer = (i: number, given: { pick?: number; text?: string }) =>
    setSteps((s) => s.map((x, j) => (j === i && x.ok === null ? { pick: given.pick, text: given.text ?? "", ok: gradeQuestion(qs[i], given) } : x)));
  const reveal = (i: number) => setSteps((s) => s.map((x, j) => (j === i && x.ok === null ? { ...x, ok: false } : x)));
  const q = qs[at];
  const step = steps[at];
  const link = data?.href || href;

  return (
    <section aria-label={warm ? "Smaller version" : "Drill"} className="flex flex-col gap-3 border-l-2 border-signal bg-surface px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
          {warm ? "smaller version" : "drill"} · {label}
          {state === "run" && qs.length > 1 ? ` · ${Math.min(at + 1, qs.length)} of ${qs.length}` : ""}
        </span>
        <button type="button" onClick={onClose} aria-label="Close" className="-my-1 grid h-8 w-8 place-items-center text-fg-4 hover:text-fg">
          ✕
        </button>
      </div>
      {state === "loading" && <div aria-busy="true" className="h-[96px] animate-pulse bg-bg" />}
      {state === "err" && <p className="m-0 text-[14px] text-fg-3">{err}</p>}
      {state === "run" && q && step && (
        <div className="flex max-w-[760px] flex-col gap-2.5">
          <p className="m-0 text-[15px] font-medium leading-relaxed text-fg">{q.q}</p>
          {q.kind === "mcq" ? (
            <div className="flex flex-col gap-1.5" role="group" aria-label="Options">
              {q.options.map((o, i) => {
                const done = step.ok !== null;
                const right = done && i === q.answer;
                const wrong = done && step.pick === i && i !== q.answer;
                return (
                  <button key={i} type="button" disabled={done} onClick={() => answer(at, { pick: i })} className={`min-h-10 border px-3 py-2 text-left text-[14px] ${right ? "border-ok text-ok-text" : wrong ? "border-bad text-bad-text" : "border-line text-fg-2 hover:border-line-strong hover:text-fg"}`}>
                    {o}
                  </button>
                );
              })}
            </div>
          ) : (
            <ShortAnswer disabled={step.ok !== null} onCheck={(text) => answer(at, { text })} onShow={() => reveal(at)} />
          )}
          {step.ok !== null && (
            <div role="status" className="flex flex-col gap-2 text-[14px] leading-relaxed text-fg-2">
              <p className="m-0">
                <strong className={step.ok ? "text-ok-text" : "text-bad-text"}>{step.ok ? "Right. " : q.kind === "short" ? `Not quite: ${q.accept[0]}. ` : "Not quite. "}</strong>
                {q.why}
              </p>
              <button type="button" onClick={() => setAt(at + 1)} className="self-start font-mono text-[13px] font-semibold text-signal-text underline decoration-line-strong underline-offset-4">
                {at + 1 < qs.length ? "next" : "see how you did"}
              </button>
            </div>
          )}
        </div>
      )}
      {state === "run" && at >= qs.length && (
        <p role="status" className="m-0 max-w-[760px] text-[15px] leading-relaxed text-fg-2">
          {correct} of {qs.length} right.{" "}
          {correct === qs.length ? "That one is solid now." : warm ? "Re-read the lesson on this pattern, then try the problem again." : "Worth one more read of the section before you move on."}
        </p>
      )}
      {link && (
        <Link href={link} className="self-start font-mono text-[13px] text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
          read the lesson section →
        </Link>
      )}
    </section>
  );
}

function ShortAnswer({ disabled, onCheck, onShow }: { disabled: boolean; onCheck: (t: string) => void; onShow: () => void }) {
  const [t, setT] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (t.trim() && !disabled) onCheck(t);
      }}
    >
      <input value={t} onChange={(e) => setT(e.target.value)} disabled={disabled} maxLength={200} aria-label="Your answer" placeholder="A few words" className="min-h-10 min-w-0 flex-1 border border-line-strong bg-bg px-3 text-[14px] text-fg" />
      <button type="submit" disabled={disabled || !t.trim()} className="min-h-10 bg-signal px-3.5 font-mono text-[12.5px] font-semibold text-on-signal disabled:opacity-50">
        Check
      </button>
      <button type="button" disabled={disabled} onClick={onShow} className="min-h-10 px-2 font-mono text-[12.5px] text-fg-3 underline underline-offset-4 disabled:opacity-50">
        show answer
      </button>
    </form>
  );
}
