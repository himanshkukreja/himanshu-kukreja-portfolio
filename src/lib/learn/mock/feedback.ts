/**
 * "Get feedback from Claude / ChatGPT" for a mock interview: a self-contained prompt with the
 * problem, the candidate's answers per phase, the curveballs, the levelled rubric and their own
 * self-scores. Opens the client prefilled (same links as the lesson selection menu, see askAi.ts);
 * when the prompt is too long for a URL it goes to the clipboard and the client opens with a note.
 * Nothing is sent to this site's server.
 */
import { sketchSummary } from "./sketch";
import { askUrl, copyText, MAX_URL, type AskClient } from "@/lib/learn/askAi";
import { track } from "@/lib/track";
import { isOffline } from "@/lib/offline/connectivity";
import { LEVEL_HINT, LEVEL_LABEL, mmss, type MockInterview } from "./types";
import type { MockRun } from "./store";
import { SCORE_LABEL, VERDICT_LABEL, type LoopScore } from "./score";

const block = (s: string) => ['"""', s.trim() || "(nothing written)", '"""'];

export function buildFeedbackPrompt(mock: MockInterview, run: MockRun, score: LoopScore | null, url: string): string {
  const totalUsed = mock.phases.reduce((a, p) => a + (run.used[p.id] || 0), 0);
  const hints = Object.values(run.hints).reduce((a, b) => a + b, 0);
  const lines: string[] = [
    "I just finished a practice system design interview (a mock, timed, with a fictional company) and I want honest, specific feedback as if you were the interviewer.",
    "",
    `Scenario: ${mock.company.name} (fictional) · ${mock.title}. Role: ${mock.role}. Interviewer persona: ${mock.interviewer.name}, ${mock.interviewer.title}.`,
    `Target level: ${LEVEL_LABEL[run.level]} (${LEVEL_HINT[run.level]}).`,
    `Time: ${mmss(totalUsed)} used of a ${mock.minutes}:00 round. Hints used: ${hints}.`,
    "",
    "The problem:",
    ...block(mock.problemText),
    "",
    "My answers, phase by phase:",
  ];
  mock.phases.forEach((p) => {
    lines.push("", `## Phase ${p.n}: ${p.title} (budget ${p.minutes} min, I used ${mmss(run.used[p.id] || 0)})`);
    const opener = p.prompts.find((m) => m.trigger.kind === "start");
    if (opener) lines.push(`Interviewer: ${opener.text}`);
    p.prompts
      .filter((m) => m !== opener && run.fired[m.id] !== undefined)
      .forEach((m) => lines.push(`Interviewer (later): ${m.text}`));
    lines.push("My notes:", ...block(run.notes[p.id] || ""));
    p.curveballs
      .filter((c) => run.fired[c.id] !== undefined)
      .forEach((c) => {
        lines.push(`Curveball${c.title ? ` (${c.title})` : ""}: ${c.text}`, "My answer:", ...block(run.answers[c.id] || ""));
      });
  });
  const drawn = sketchSummary(run.sketch);
  if (drawn) lines.push("", "My whiteboard diagram (as text):", ...block(drawn));
  if (run.board.trim()) lines.push("", "My whiteboard notes:", ...block(run.board));

  lines.push("", "The rubric interviewers use for this problem. Each signal is tagged with the lowest level at which it is expected; my self-score follows each one:");
  mock.phases.forEach((p) => {
    lines.push(`Phase ${p.n} · ${p.title}`);
    p.rubric.forEach((s) => {
      const v = run.scores[s.id];
      lines.push(`- [${LEVEL_LABEL[s.level]}] ${s.text} — me: ${v === undefined ? "not scored" : SCORE_LABEL[v].toLowerCase()}`);
    });
  });
  if (score) {
    lines.push("", `My self-assessed verdict: ${VERDICT_LABEL[score.verdict]} (expected signals ${Math.round(score.expected.pct * 100)}%).`);
    if (score.flags.length) lines.push(`Red flags the practice tool noticed: ${score.flags.map((f) => f.label.toLowerCase()).join("; ")}.`);
  }
  lines.push(
    "",
    "Please:",
    "1. For each phase, tell me what was strong and what was missing or wrong. Quote my own words.",
    "2. Check my numbers and estimates; point out any arithmetic or unit mistakes.",
    "3. Score me against the rubric yourself. Say where you disagree with my self-scores and why.",
    `4. Give an overall verdict for the ${LEVEL_LABEL[run.level]} level (strong no hire … strong hire) with the two or three reasons that decided it.`,
    "5. List the three things I should practise before my next interview.",
    "Be direct. Don't rewrite the whole design for me; focus on what I did.",
    "",
    `Practice round: ${url}`
  );
  return lines.join("\n");
}

/** Open the client with the prompt; very long prompts go through the clipboard. */
export function openFeedback(client: AskClient, prompt: string, company: string): "opened" | "clipboard" | "offline" {
  if (isOffline()) {
    void copyText(prompt);
    return "offline";
  }
  let text = prompt;
  let mode: "opened" | "clipboard" = "opened";
  if (askUrl(client, prompt).length > MAX_URL) {
    void copyText(prompt);
    text = `I just did a practice system design interview (${company}, fictional) and want honest feedback on it. My answers, the rubric and my self-scores are on my clipboard: I'll paste them in my next message. Please wait for them, then give me feedback as the interviewer.`;
    mode = "clipboard";
  }
  window.open(askUrl(client, text), "_blank", "noopener,noreferrer");
  track("ask_ai", { client, kind: "mock", chars: prompt.length });
  return mode;
}
