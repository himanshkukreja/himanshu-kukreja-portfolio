"use client";

/**
 * Mounts one in-lesson exercise (```bug, ```predict, ```order, ```breakit; format and parser in src/lib/dsa/exercises.ts) into
 * its server-rendered figure. The parsed block is the figure's `data-ex` JSON. The language is the learner's chosen one, the
 * same source as the code tabs (useLang); completed ids persist like quiz answers (useExerciseProgress).
 */
import { useEffect, useMemo } from "react";
import { useLang } from "@/components/dsa/concept/widgets";
import { EX_LANGS, exerciseTitle, pickLang, type BreakEx, type BugEx, type Exercise as Ex, type ExLang, type OrderEx, type PredictEx } from "@/lib/dsa/exercises";
import BreakExercise from "./BreakExercise";
import BugExercise from "./BugExercise";
import { ExerciseCard } from "./ExerciseCard";
import OrderExercise from "./OrderExercise";
import PredictExercise from "./PredictExercise";
import { useExerciseProgress } from "./useExerciseProgress";

export default function Exercise({ fig, lessonId, lessonTitle, traceTitles }: { fig: HTMLElement; lessonId: string; lessonTitle: string; traceTitles?: Record<string, string> }) {
  const ex = useMemo<Ex | null>(() => {
    try {
      return JSON.parse(fig.dataset.ex || "null") as Ex;
    } catch {
      return null;
    }
  }, [fig]);
  const [chosen, setLang] = useLang();
  const { completed, complete } = useExerciseProgress(lessonId, ex?.id || "");
  useEffect(() => {
    if (ex) fig.setAttribute("data-hydrated", "");
  }, [fig, ex]);
  if (!ex) return null;

  const code = ex.code as Partial<Record<ExLang, unknown>>;
  const langs = EX_LANGS.filter((l) => code[l] !== undefined);
  const lang = pickLang(code, chosen);
  const title = exerciseTitle(ex.kind, ex.title);
  const common = { lang, completed, onComplete: complete };
  return (
    <ExerciseCard kind={ex.kind} title={title} question={ex.question} completed={completed} langs={langs} lang={lang} onLang={setLang}>
      {ex.kind === "bug" ? (
        <BugExercise key={`${ex.id}-${lang}`} ex={ex as BugEx} lessonTitle={lessonTitle} {...common} />
      ) : ex.kind === "predict" ? (
        <PredictExercise key={`${ex.id}-${lang}`} ex={ex as PredictEx} traceTitle={(ex as PredictEx).trace ? traceTitles?.[(ex as PredictEx).trace!] : undefined} {...common} />
      ) : ex.kind === "order" ? (
        <OrderExercise key={`${ex.id}-${lang}`} ex={ex as OrderEx} {...common} />
      ) : (
        <BreakExercise key={ex.id} ex={ex as BreakEx} {...common} />
      )}
    </ExerciseCard>
  );
}
