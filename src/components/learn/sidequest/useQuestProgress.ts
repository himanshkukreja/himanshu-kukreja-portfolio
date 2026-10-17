"use client";

import { useEffect, useState } from "react";

export type QuestProgress = {
  /** "your turn" checkpoints with a verdict (✓ I had it / ↻ Missed some) */
  checkpointsDone: number;
  checkpointsKnew: number;
  checkpoints: number;
  /** quick checks answered through / aced on the first try */
  quizzesDone: number;
  quizzesAced: number;
  quizzes: number;
};

const EMPTY: QuestProgress = { checkpointsDone: 0, checkpointsKnew: 0, checkpoints: 0, quizzesDone: 0, quizzesAced: 0, quizzes: 0 };

function read(root: ParentNode): QuestProgress {
  const cps = Array.from(root.querySelectorAll<HTMLElement>('[data-sd="reveal"][data-variant="checkpoint"]'));
  const qs = Array.from(root.querySelectorAll<HTMLElement>('figure[data-sd="quiz"]'));
  return {
    checkpoints: cps.length,
    checkpointsDone: cps.filter((c) => c.hasAttribute("data-verdict")).length,
    checkpointsKnew: cps.filter((c) => c.getAttribute("data-verdict") === "knew").length,
    quizzes: qs.length,
    quizzesDone: qs.filter((q) => q.hasAttribute("data-complete")).length,
    quizzesAced: qs.filter((q) => q.hasAttribute("data-aced")).length,
  };
}

const same = (a: QuestProgress, b: QuestProgress) => (Object.keys(a) as (keyof QuestProgress)[]).every((k) => a[k] === b[k]);

/**
 * Live quest progress, read from the lesson DOM: CourseEnhancer sets data-verdict on checkpoints and
 * QuizHydrator sets data-complete / data-aced on quick checks (both from their own localStorage),
 * so this needs no store of its own and can never disagree with what the page shows.
 */
export function useQuestProgress(): QuestProgress {
  const [p, setP] = useState<QuestProgress>(EMPTY);
  useEffect(() => {
    let root: HTMLElement | null = null;
    let mo: MutationObserver | null = null;
    let raf = 0;
    let tries = 0;
    const update = () => {
      raf = 0;
      if (!root) return;
      const next = read(root);
      setP((cur) => (same(cur, next) ? cur : next));
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };
    const attach = () => {
      root = document.querySelector<HTMLElement>(".course-content");
      if (!root) {
        if (tries++ < 40) raf = window.requestAnimationFrame(attach);
        return;
      }
      raf = 0;
      mo = new MutationObserver(schedule);
      mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-verdict", "data-complete", "data-aced"] });
      update();
    };
    attach();
    return () => {
      mo?.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);
  return p;
}
