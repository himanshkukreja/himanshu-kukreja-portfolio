/**
 * ```quiz → an inline quick check (spec: scratchpad/quiz/FORMAT.md). Semantic, readable without JS:
 * the question, the options as a list, the answer + explanation in a <details>. <QuizHydrator/>
 * (src/components/learn/quiz) makes it interactive: tap an option → instant feedback, XP, score.
 *
 * Text contract: the title, questions, options and explanations are course text (they count for
 * highlight offsets); everything the hydrator changes (status lines, letter keys, the score, retry,
 * the practice card) is data-sd-chrome. Option buttons ship `disabled` and the hydrator enables
 * them, so a no-JS reader never sees a control that does nothing.
 */
import { createHash } from "crypto";
import type { Element as HastElement } from "hast";
import { chrome, h, type HChild } from "../md";
import { inlineTokens, parseQuiz, type QuizBlock } from "./quiz-parse";
import type { PracticeGame } from "@/lib/learn/arena/games";

const KEYS = "ABCDEF";

function inline(s: string): HChild[] {
  return inlineTokens(s).map((t) => {
    if (t.t === "text") return t.v;
    if (t.t === "code") return h("code", {}, [t.v]);
    if (t.t === "strong") return h("strong", {}, [t.v]);
    if (t.t === "em") return h("em", {}, [t.v]);
    return h("a", { href: "href" in t ? t.href : "#" }, [t.v]);
  });
}

export function quizSignature(value: string): string {
  return createHash("sha1").update(value.trim()).digest("hex").slice(0, 8);
}

/** "practice this" links (chrome: not course text). */
export function practiceCard(games: PracticeGame[], variant: "quiz" | "lesson"): HastElement | null {
  if (!games.length) return null;
  return chrome("aside", { className: ["sd-practice", `sd-practice-${variant}`], dataSd: "practice", ariaLabel: "Practice this" }, [
    h("p", { className: ["sd-practice-label"] }, ["Practice this"]),
    h(
      "ul",
      { className: ["sd-practice-list"] },
      games.map((g) =>
        h("li", { className: ["sd-practice-item"] }, [
          h("a", { href: g.href, className: ["sd-practice-link"], dataPracticeGame: g.id }, [
            h("span", { className: ["sd-practice-kind"] }, [g.kind === "arena" ? `Arena${g.seconds ? ` · ${g.seconds}s` : ""}` : "Playground"]),
            h("span", { className: ["sd-practice-name"] }, [g.name]),
            h("span", { className: ["sd-practice-hook"] }, [g.hook]),
            h("span", { className: ["sd-practice-go"], ariaHidden: "true" }, ["play →"]),
          ]),
        ]),
      ),
    ),
  ]);
}

export function quizFigureFrom(quiz: QuizBlock, opts: { index: number; sig: string; practice?: PracticeGame[] }): HastElement {
  const { index, sig } = opts;
  const base = `sd-quiz-${index}`;
  const n = quiz.questions.length;
  const questions = quiz.questions.map((qq, qi) => {
    const qid = `${base}-q${qi}`;
    return h("li", { className: ["sd-quiz-q"], dataQuizQ: String(qi), dataAnswer: String(qq.answer), dataState: "idle" }, [
      h("p", { className: ["sd-quiz-prompt"], id: qid }, [
        chrome("span", { className: ["sd-quiz-qn"] }, [n > 1 ? `Q${qi + 1}/${n}` : "Q"]),
        " ",
        ...inline(qq.q),
      ]),
      h(
        "ol",
        { className: ["sd-quiz-opts"], ariaLabelledby: qid },
        qq.options.map((o, oi) =>
          h("li", { className: ["sd-quiz-opt"] }, [
            h("button", { type: "button", className: ["sd-quiz-btn"], dataQuizOpt: String(oi), disabled: true }, [
              chrome("span", { className: ["sd-quiz-key"], ariaHidden: "true" }, [KEYS[oi] || String(oi + 1)]),
              h("span", { className: ["sd-quiz-txt"] }, inline(o)),
              chrome("span", { className: ["sd-quiz-mark"] }, []),
            ]),
          ]),
        ),
      ),
      chrome("p", { className: ["sd-quiz-status"], role: "status", ariaLive: "polite" }, []),
      h("details", { className: ["sd-quiz-why"] }, [
        chrome("summary", { className: ["sd-quiz-why-sum"] }, ["Answer & explanation"]),
        h("div", { className: ["sd-quiz-why-body"] }, [
          chrome("p", { className: ["sd-quiz-answer"] }, [`Answer: ${KEYS[qq.answer] || qq.answer + 1}`]),
          ...qq.explain.map((p) => h("p", {}, inline(p))),
        ]),
      ]),
    ]);
  });
  const practice = opts.practice?.length ? practiceCard(opts.practice, "quiz") : null;
  // "Quick check · Circuit breaker states": the tag already says "Quick check"
  const title = quiz.title.replace(/^Quick check\s*[·:|—–-]\s*/i, "").trim();
  const hasTitle = !!title && !/^quick check$/i.test(title);
  return h(
    "figure",
    {
      className: ["sd-quiz"],
      dataSd: "quiz",
      // deep-link target (the concept map's "practise" opens …/lesson#sd-quiz-<n>)
      id: base,
      dataQuizBlock: String(index),
      dataQuizSig: sig,
      dataQuizCount: String(n),
      ...(hasTitle ? { ariaLabelledby: `${base}-t` } : { ariaLabel: "Quick check" }),
    },
    [
      chrome("div", { className: ["sd-quiz-head"] }, [
        h("span", { className: ["sd-quiz-tag"] }, ["Quick check"]),
        h("span", { className: ["sd-quiz-score"] }, [`${n} ${n === 1 ? "question" : "questions"} · +5 XP each`]),
      ]),
      hasTitle ? h("p", { className: ["sd-quiz-title"], id: `${base}-t` }, inline(title)) : null,
      h("ol", { className: ["sd-quiz-qs"] }, questions),
      chrome("div", { className: ["sd-quiz-foot"] }, [
        h("span", { className: ["sd-quiz-result"], ariaLive: "polite" }, []),
        h("button", { type: "button", className: ["sd-btn", "sd-quiz-retry"], dataQuizAction: "retry", hidden: true }, ["Retry"]),
      ]),
      practice,
    ],
  );
}

/** Classify + render a ```quiz fence; null when it is not a valid quiz (caller falls back to code). */
export function quizFigure(value: string, opts: { index: number; practice?: PracticeGame[] }): HastElement | null {
  const quiz = parseQuiz(value);
  if (!quiz) return null;
  return quizFigureFrom(quiz, { index: opts.index, sig: quizSignature(value), practice: opts.practice });
}
