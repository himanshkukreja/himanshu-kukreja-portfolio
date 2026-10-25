import "server-only";
/** Plain-text views of a mock interview for the AI interviewer and scorecard prompts. */
import type { MockInterview, MockPhase } from "@/lib/learn/mock/types";
import type { MockPhase as PromptPhase } from "./prompts";

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
