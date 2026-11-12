/**
 * "Ask this lesson" follow-ups (lib/ai/askTurn.ts): the previous exchange the panel sends never counts toward
 * lesson-qa's input cap, and it is clipped at a sentence end (AI audit 12 Nov 2026, probe 10: a follow-up after a
 * normal answer was refused as "1,129 characters, the limit is 1,000").
 *   node --test scripts/tests/lesson-qa-previous.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { askCapChars, buildAskTurn, clipAtBoundary, clipPrevious, PREVIOUS_A_CHARS, PREVIOUS_Q_CHARS } from "../../src/lib/ai/askTurn.ts";

const LESSON_QA_CAP = 1000; // FEATURES["lesson-qa"].maxInputChars
const sentence = (i) => `Sentence ${i} explains why a delete beats an update when two writers race on the same key.`;
const longAnswer = Array.from({ length: 30 }, (_, i) => sentence(i)).join(" ");

test("the audit's failing follow-up: only the new question counts toward the cap", () => {
  const question = "And what goes wrong if two writers race?";
  const prev = clipPrevious({ q: "Why delete the cache entry on a write instead of updating it?", a: longAnswer });
  assert.ok(prev);
  // the turn the model gets carries the whole exchange, well over the cap...
  const turn = buildAskTurn({ question, selection: "", kind: "lesson", mode: "", style: "", prev });
  assert.match(turn, /^<previous_exchange[^>]*>\nQ: Why delete/);
  assert.ok(turn.endsWith(question));
  assert.ok(turn.length > LESSON_QA_CAP);
  // ...but the cap sees the learner's question only
  assert.equal(askCapChars(question), question.length);
  assert.ok(askCapChars(question) <= LESSON_QA_CAP);
});

test("a long question is still refused by the cap", () => {
  assert.ok(askCapChars("x".repeat(1200)) > LESSON_QA_CAP);
});

test("the previous answer is clipped at a sentence end, never mid-word", () => {
  const { a } = clipPrevious({ q: "q", a: longAnswer });
  assert.ok(a.length <= PREVIOUS_A_CHARS);
  assert.match(a, /race on the same key\. …$/);
  assert.ok(a.length > PREVIOUS_A_CHARS * 0.5);
});

test("short exchanges pass through unchanged; bad shapes are dropped", () => {
  assert.deepEqual(clipPrevious({ q: "Why?", a: "Because." }), { q: "Why?", a: "Because." });
  assert.equal(clipPrevious(null), null);
  assert.equal(clipPrevious({ q: "Why?" }), null);
  assert.equal(clipPrevious({ q: 3, a: "x" }), null);
  assert.equal(clipPrevious({ q: "  ", a: "x" }), null);
});

test("the previous question is one line and clipped", () => {
  const { q } = clipPrevious({ q: `${"word ".repeat(100)}\n\nend`, a: "ok" });
  assert.ok(q.length <= PREVIOUS_Q_CHARS);
  assert.ok(!q.includes("\n"));
  assert.match(q, /word…$/);
});

test("text without sentence ends falls back to a word end", () => {
  const s = clipAtBoundary("alpha ".repeat(300), 100);
  assert.ok(s.length <= 100);
  assert.match(s, /alpha…$/);
});
