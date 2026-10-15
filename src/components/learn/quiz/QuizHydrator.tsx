"use client";

/**
 * Makes the renderer's ```quiz figures (src/lib/course/detect/quiz.ts) interactive, in lessons and
 * stories. Mounted by <CourseEnhancer/> next to <MermaidHydrator/>.
 *
 * Like CourseEnhancer it works on the server-rendered DOM: delegated click handling, state kept in
 * localStorage (`sd:quiz:<scope>`), and an idempotent apply() that re-runs whenever the content HTML
 * is replaced (highlights re-inject it). It only touches attributes and [data-sd-chrome] text, never
 * course text, so highlight offsets stay valid.
 *
 * Rewards: +5 XP for a first-try correct answer (awardOnce `quiz:<course>/<week>/<lesson>:<block>:<q>`),
 * the "First blood" quest for the first aced block, and a "stage aced" bonus when every quick check in a
 * stage is aced. Every answer is tracked as `quiz_answer` (the leaderboard re-checks `pick` server-side).
 */
import "./quiz.css";
import { useEffect, useRef } from "react";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";

type QState = { p?: number; f?: 0 | 1 };
type BlockState = { s: string; a: Record<string, QState> };
type Store = Record<string, BlockState>;

export const QUIZ_XP = 5;
export const STAGE_ACE_XP = 10;
const KEYS = "ABCDEF";

type Scope = { course: string; week: string; lesson: string; id: string };

/** /learn/<course>/<week>/<lesson> or /stories/<slug>; lessonKey ("<week>/<slug>" or "story/<slug>") wins for week/lesson. */
function scopeFor(lessonKey?: string): Scope {
  const path = window.location.pathname.replace(/\/$/, "");
  const seg = path.split("/").filter(Boolean);
  if (lessonKey?.startsWith("story/") || seg[0] === "stories") {
    const slug = lessonKey?.startsWith("story/") ? lessonKey.slice(6) : seg[1] || "story";
    return { course: "story", week: "", lesson: slug, id: `story/${slug}` };
  }
  const course = seg[0] === "learn" && seg.length >= 4 ? seg[1] : "system-design-mastery";
  const [week, lesson] = lessonKey && lessonKey.includes("/") ? lessonKey.split("/") : [seg[2] || "", seg[3] || ""];
  return { course, week, lesson, id: `${course}/${week}/${lesson}` };
}

function read(key: string): Store {
  try {
    const raw = window.localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? (v as Store) : {};
  } catch {
    return {};
  }
}

function write(key: string, v: Store) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked: state lasts for this visit */
  }
}

function setAttr(el: Element | null, name: string, value: string | null) {
  if (!el) return;
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function setText(el: Element | null, value: string) {
  if (el && el.textContent !== value) el.textContent = value;
}

const xpKey = (scope: Scope, block: string, q: string) => `quiz:${scope.id}:${block}:${q}`;

export default function QuizHydrator({ lessonKey }: { lessonKey?: string }) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const { done, awardOnce, award } = useGame();
  const gameRef = useRef({ done, awardOnce, award });
  const applyRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    gameRef.current = { done, awardOnce, award };
    applyRef.current?.();
  }, [done, awardOnce, award]);

  useEffect(() => {
    const root = (markerRef.current?.closest(".course-content") as HTMLElement | null) || null;
    if (!root) return;
    const scope = scopeFor(lessonKey);
    const storeKey = `sd:quiz:${scope.id}`;
    let store = read(storeKey);

    const blockState = (fig: HTMLElement): BlockState => {
      const block = fig.dataset.quizBlock || "0";
      const sig = fig.dataset.quizSig || "";
      const st = store[block];
      // the block's text changed since it was answered: start over
      return st && st.s === sig ? st : { s: sig, a: {} };
    };

    const firstOk = (fig: HTMLElement, q: string, st: BlockState) =>
      st.a[q]?.f === 1 || (st.a[q]?.f === undefined && !!gameRef.current.done[xpKey(scope, fig.dataset.quizBlock || "0", q)]);

    const summarize = (fig: HTMLElement) => {
      const st = blockState(fig);
      const qs = Array.from(fig.querySelectorAll<HTMLElement>("li.sd-quiz-q"));
      const answered = qs.filter((li) => st.a[li.dataset.quizQ || ""]?.p !== undefined).length;
      const ok = qs.filter((li) => firstOk(fig, li.dataset.quizQ || "", st)).length;
      return { st, qs, n: qs.length, answered, ok, complete: answered === qs.length && qs.length > 0, aced: ok === qs.length && qs.length > 0 };
    };

    const applyFig = (fig: HTMLElement) => {
      setAttr(fig, "data-quiz-ready", "");
      const { st, qs, n, answered, ok, complete, aced } = summarize(fig);
      qs.forEach((li) => {
        const q = li.dataset.quizQ || "";
        const answer = Number(li.dataset.answer);
        const pick = st.a[q]?.p;
        const isAnswered = pick !== undefined;
        const right = isAnswered && pick === answer;
        setAttr(li, "data-state", isAnswered ? (right ? "right" : "wrong") : "idle");
        li.querySelectorAll<HTMLButtonElement>("button[data-quiz-opt]").forEach((b) => {
          const i = Number(b.dataset.quizOpt);
          if (b.disabled !== isAnswered) b.disabled = isAnswered;
          setAttr(b, "data-picked", isAnswered && i === pick ? "" : null);
          setAttr(b, "data-correct", isAnswered && i === answer ? "" : null);
          setText(b.querySelector(".sd-quiz-mark"), !isAnswered ? "" : i === pick ? (right ? "correct" : "your pick") : i === answer ? "answer" : "");
        });
        const first = firstOk(fig, q, st);
        setText(
          li.querySelector(".sd-quiz-status"),
          !isAnswered ? "" : right ? (first ? `Correct · +${QUIZ_XP} XP` : "Correct") : `Not quite · the answer is ${KEYS[answer] || answer + 1}`,
        );
      });
      const tried = qs.some((li) => st.a[li.dataset.quizQ || ""]?.f !== undefined);
      setText(
        fig.querySelector(".sd-quiz-score"),
        complete
          ? `${ok}/${n} first try · +${ok * QUIZ_XP} XP`
          : answered
            ? `${answered}/${n} answered`
            : tried
              ? `retry · first try ${ok}/${n}`
              : `${n} ${n === 1 ? "question" : "questions"} · +${QUIZ_XP} XP each`,
      );
      setText(fig.querySelector(".sd-quiz-result"), complete ? (aced ? "Aced it. Every answer right on the first try." : `${ok}/${n} on the first try. Retry to lock it in.`) : "");
      setAttr(fig, "data-started", answered ? "" : null);
      setAttr(fig, "data-complete", complete ? "" : null);
      setAttr(fig, "data-aced", complete && aced ? "" : null);
      const retry = fig.querySelector<HTMLButtonElement>("[data-quiz-action=retry]");
      if (retry && retry.hidden !== !answered) retry.hidden = !answered;
    };

    const apply = () => root.querySelectorAll<HTMLElement>('figure[data-sd="quiz"]').forEach(applyFig);
    applyRef.current = apply;
    apply();

    const stageAced = (fig: HTMLElement) => {
      const section = fig.closest<HTMLElement>('section[data-sd="stage"]');
      if (!section) return;
      const figs = Array.from(section.querySelectorAll<HTMLElement>('figure[data-sd="quiz"]'));
      if (!figs.every((f) => summarize(f).aced)) return;
      const label = section.dataset.label || "Stage";
      gameRef.current.awardOnce(`quizstage:${scope.id}:${section.dataset.stageId || section.id}`, STAGE_ACE_XP, `${label} aced · every quick check right`);
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const fig = target?.closest<HTMLElement>('figure[data-sd="quiz"]');
      if (!fig || !root.contains(fig)) return;
      const block = fig.dataset.quizBlock || "0";

      const retry = target?.closest<HTMLButtonElement>("[data-quiz-action=retry]");
      if (retry) {
        e.preventDefault();
        const st = blockState(fig);
        Object.values(st.a).forEach((v) => delete v.p);
        store = { ...store, [block]: st };
        write(storeKey, store);
        fig.querySelectorAll("details.sd-quiz-why[open]").forEach((d) => d.removeAttribute("open"));
        applyFig(fig);
        fig.querySelector<HTMLButtonElement>("button[data-quiz-opt]")?.focus({ preventScroll: true });
        return;
      }

      const btn = target?.closest<HTMLButtonElement>("button[data-quiz-opt]");
      if (!btn || btn.disabled) return;
      const li = btn.closest<HTMLElement>("li.sd-quiz-q");
      if (!li) return;
      e.preventDefault();
      const q = li.dataset.quizQ || "0";
      const pick = Number(btn.dataset.quizOpt);
      const correct = pick === Number(li.dataset.answer);
      const before = summarize(fig);
      const st = before.st;
      const key = xpKey(scope, block, q);
      const prev = st.a[q] || {};
      const first = prev.f === undefined && !gameRef.current.done[key];
      st.a[q] = { ...prev, p: pick, ...(prev.f === undefined ? { f: (first ? (correct ? 1 : 0) : gameRef.current.done[key] ? 1 : 0) as 0 | 1 } : {}) };
      store = { ...store, [block]: st };
      write(storeKey, store);

      if (correct && first) gameRef.current.awardOnce(key, QUIZ_XP, "Quick check · first try");
      track("quiz_answer", { course: scope.course, week: scope.week, lesson: scope.lesson, block: Number(block), q: Number(q), correct, first, pick });

      applyFig(fig);
      li.setAttribute("data-fresh", "");
      window.setTimeout(() => li.removeAttribute("data-fresh"), 900);
      const details = li.querySelector<HTMLDetailsElement>("details.sd-quiz-why");
      if (details && !details.open) details.open = true;
      // the picked button is now disabled: keep keyboard focus on the explanation
      details?.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });

      const after = summarize(fig);
      if (after.complete && !before.complete && after.aced) {
        gameRef.current.award("quiz:ace", "First blood · a quick check aced");
        stageAced(fig);
      }
    };

    // re-apply after the content HTML is replaced (highlights re-render it)
    let raf = 0;
    const mo = new MutationObserver((records) => {
      const relevant = records.some((r) => {
        const t = r.target as Element;
        return r.type === "childList" && !(t.nodeType === 1 && t.closest?.("[data-sd-chrome]"));
      });
      if (!relevant) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    });
    mo.observe(root, { childList: true, subtree: true });
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storeKey) return;
      store = read(storeKey);
      apply();
    };
    root.addEventListener("click", onClick);
    window.addEventListener("storage", onStorage);
    return () => {
      root.removeEventListener("click", onClick);
      window.removeEventListener("storage", onStorage);
      mo.disconnect();
      cancelAnimationFrame(raf);
      applyRef.current = null;
    };
  }, [lessonKey]);

  return <span ref={markerRef} hidden data-sd-chrome="" />;
}
