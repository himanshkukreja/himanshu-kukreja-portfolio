import "server-only";
/** Plain-text views of a mock interview for the AI interviewer and scorecard prompts. */
import type { MockInterview, MockPhase } from "@/lib/learn/mock/types";
import type { LldInterviewInput, MockPhase as PromptPhase } from "./prompts";

const plain = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
    .replace(/<\/(p|li|h[1-6]|tr|div)>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

export const rubricText = (p: MockPhase) => p.rubric.map((r) => `- [${r.level}] ${r.text}${r.study.length ? ` (study: ${r.study.map((s) => s.code).join(", ")})` : ""}`).join("\n");

export function promptPhase(p: MockPhase): PromptPhase {
  return {
    title: p.title,
    interviewer: p.prompts.map((x) => `- ${x.text}`).join("\n"),
    curveballs: p.curveballs.map((c) => `- ${c.title ? `${c.title}: ` : ""}${c.text}`).join("\n") || "(none)",
    rubric: rubricText(p),
    modelAnswer: plain(p.answerHtml).slice(0, 5000),
  };
}

export const problemText = (m: MockInterview) => `${m.problemText}\n\nInterviewer: ${m.interviewer.name}, ${m.interviewer.title}. Their style: ${m.interviewer.style}`;
export { plain as htmlToText };

/* ------------------------------------------------------------------ LLD (machine-coding) mocks */

/**
 * The interviewer's input for one turn of an LLD mock (lib/learn/mock/lld.ts): the case study's requirements, this
 * phase's questions and hidden rubric, the hidden reference for this phase (never code), and the requirement change
 * with whether the room has announced it yet. `mock` already carries the attempt's change (withChange).
 */
export function lldTurnInput(mock: MockInterview, phase: MockPhase, changeAnnounced: boolean): LldInterviewInput {
  const l = mock.lld!;
  const k = mock.phases.findIndex((p) => p.id === phase.id);
  const codeAt = mock.phases.findIndex((p) => p.id === l.codePhase);
  const change = mock.phases[codeAt]?.curveballs[0];
  const changeFollowup = l.changes.find((c) => c.id === change?.id);
  const fu = changeFollowup ? l.followups[changeFollowup.followup] : null;
  const reference =
    phase.id === l.codePhase
      ? [l.ai.design, l.ai.patterns, fu ? `How the reference absorbs the requirement change: ${fu.answer}` : ""].filter(Boolean).join("\n\n")
      : k < codeAt
        ? k === 0
          ? "(judge their questions against <requirements>; the design comes later)"
          : [l.ai.design, k > 1 ? l.ai.patterns : ""].filter(Boolean).join("\n\n")
        : [l.ai.concurrency, fu ? `How the reference absorbs the requirement change: ${fu.answer}` : ""].filter(Boolean).join("\n\n");
  return {
    company: mock.company.name,
    interviewer: `${mock.interviewer.name}, ${mock.interviewer.title}`,
    problem: problemText(mock),
    phase: { title: phase.title, questions: phase.prompts.map((x) => `- ${x.text}`).join("\n"), rubric: rubricText(phase) },
    requirements: l.ai.requirements,
    reference: reference.slice(0, 6000),
    change: change && k >= codeAt ? { status: changeAnnounced ? "announced" : "not yet", text: change.text } : null,
  };
}

const bare = (s: string) => s.replace(/[`*_]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** An LLD phase's rubric for the grader: each line tagged [checklist] (the case study's Interview checklist) or [step]. */
export function lldRubricText(p: MockPhase, checklist: string[]): string {
  const own = new Set(checklist.map(bare));
  return p.rubric.map((r) => `- [${r.level}] [${own.has(bare(r.text)) ? "checklist" : "step"}] ${r.text}${r.study.length ? ` (study: ${r.study.map((s) => s.code).join(", ")})` : ""}`).join("\n");
}
