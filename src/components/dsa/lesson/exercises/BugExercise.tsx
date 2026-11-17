"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Lightbulb } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSignInGate } from "@/components/gate/SignInGate";
import { track } from "@/lib/track";
import { INCOMING_KEY } from "@/lib/dsa/playground/drafts";
import { programFromSnippet } from "@/lib/dsa/playground/snippet";
import type { BugEx, ExLang } from "@/lib/dsa/exercises";
import { CODE, Explain, FOCUS_RING, SECONDARY, Status } from "./ExerciseCard";

const MAX_TRIES = 2;

/** Find the bug: click the line, two tries, the hint after the first; the reveal diffs the line and gives the failing input. */
export default function BugExercise({ ex, lang, completed, onComplete, lessonTitle }: { ex: BugEx; lang: ExLang; completed: boolean; onComplete: () => void; lessonTitle: string }) {
  const data = ex.code[lang]!;
  const [wrong, setWrong] = useState<number[]>([]);
  const [phase, setPhase] = useState<"play" | "solved" | "revealed">(completed ? "solved" : "play");
  const router = useRouter();
  const { user, loading } = useAuth();
  const gate = useSignInGate("dsa-snippet");
  const over = phase !== "play";
  const tries = wrong.length;

  const pick = (i: number) => {
    if (over || wrong.includes(i)) return;
    if (i === data.bugIndex) {
      setPhase("solved");
      onComplete();
      track("dsa_exercise", { kind: "bug", id: ex.id, result: "right", tries: tries + 1 });
      return;
    }
    const next = [...wrong, i];
    setWrong(next);
    if (next.length >= MAX_TRIES) {
      setPhase("revealed");
      track("dsa_exercise", { kind: "bug", id: ex.id, result: "revealed", tries: next.length });
    }
  };

  const again = () => {
    setWrong([]);
    setPhase("play");
  };

  const openFix = () => {
    if (!user) {
      if (!loading) gate.ask("playground");
      return;
    }
    const fixedCode = data.lines.map((l, i) => (i === data.bugIndex ? data.fixed : l)).join("\n");
    let code = fixedCode;
    try {
      code = programFromSnippet(lang, fixedCode, null).code;
    } catch {
      /* the plain function opens as it is */
    }
    try {
      window.localStorage.setItem(INCOMING_KEY, JSON.stringify({ lang, code, stdin: "", from: { title: lessonTitle, href: `${window.location.pathname}#ex-${ex.id}` }, at: Date.now() }));
    } catch {
      /* storage blocked: the Playground opens on its drafts */
    }
    track("dsa_exercise_playground", { id: ex.id, lang });
    router.push("/dsa/playground");
  };

  const status =
    phase === "solved"
      ? { tone: "ok" as const, text: tries === 0 ? "Found it on the first try." : `Found it. That was try ${tries + 1}.` }
      : phase === "revealed"
        ? { tone: "bad" as const, text: "Out of tries. Here is the bug." }
        : tries === 1
          ? { tone: "bad" as const, text: "Not that line. One try left." }
          : { tone: "plain" as const, text: "Click the line you think is wrong." };

  return (
    <>
      <div role="group" aria-label="Code: pick the buggy line" className="overflow-hidden rounded-xl border border-line bg-bg">
        <div role="list" className="m-0 list-none p-0 py-1.5">
          {data.lines.map((line, i) => {
            const isBug = i === data.bugIndex;
            const isWrong = wrong.includes(i);
            const state = over && isBug ? "bug" : isWrong ? "wrong" : "idle";
            return (
              <div role="listitem" key={i}>
                <button
                  type="button"
                  disabled={over || isWrong}
                  onClick={() => pick(i)}
                  data-state={state}
                  aria-label={`Line ${i + 1}: ${line.trim() || "blank"}${isWrong ? " (not the bug)" : over && isBug ? " (the bug)" : ""}`}
                  className={`flex w-full items-stretch text-left disabled:cursor-default ${FOCUS_RING} ${state === "bug" ? "bg-bad/15" : state === "wrong" ? "bg-surface-2" : "hover:bg-[var(--c-dsa-hl)]"}`}
                >
                  <span aria-hidden className={`w-10 shrink-0 select-none border-r border-line px-2 text-right font-mono text-[12px] leading-[1.6] ${state === "bug" ? "text-bad-text" : "text-fg-4"}`}>
                    {i + 1}
                  </span>
                  <span className={`${CODE} px-3 py-[1px] ${state === "wrong" ? "text-fg-4 line-through decoration-bad" : ""}`}>{line || " "}</span>
                  {state === "wrong" ? <span className="shrink-0 self-center pr-3 font-mono text-[11px] text-bad-text">not this</span> : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <Status tone={status.tone}>{status.text}</Status>
      {phase === "play" && tries >= 1 && ex.hint ? (
        <p className="m-0 flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-[14px] text-fg-2">
          <Lightbulb className="mt-[2px] h-4 w-4 shrink-0 text-signal-text" aria-hidden />
          <span>
            <strong className="font-semibold text-fg">Hint.</strong> {ex.hint}
          </span>
        </p>
      ) : null}
      {over ? (
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-xl border border-line font-mono text-[13px] leading-[1.6]" aria-label="The fix">
            <div className="flex gap-2 bg-bad/15 px-3 py-1">
              <span aria-hidden className="select-none text-bad-text">-</span>
              <span className={`${CODE} text-bad-text`}>{data.lines[data.bugIndex]}</span>
              <span className="sr-only">buggy line</span>
            </div>
            <div className="flex gap-2 bg-ok/15 px-3 py-1">
              <span aria-hidden className="select-none text-ok-text">+</span>
              <span className={`${CODE} text-ok-text`}>{data.fixed}</span>
              <span className="sr-only">fixed line</span>
            </div>
          </div>
          <p className="m-0 rounded-xl bg-bg p-3 text-[14px] text-fg-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3">Fails on </span>
            <span className="font-mono text-[13px] text-fg">{ex.fails}</span>
          </p>
          <Explain lines={ex.explain} tone={phase === "solved" ? "ok" : "bad"} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={openFix} className={SECONDARY} title={user ? "Open the fixed code in the Playground" : "Sign in to open it in the Playground"}>
              Try the fix in Playground <ArrowUpRight className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" onClick={again} className={`${SECONDARY} !border-transparent !bg-transparent text-fg-3`}>
              Try again
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
