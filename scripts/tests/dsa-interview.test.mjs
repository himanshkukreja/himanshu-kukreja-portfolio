/**
 * DSA Interview tab (src/lib/dsa/interview.ts): the stage choice, the interviewer's JSON turns, the scorecard, saved
 * rounds, "Interview-ready" per topic, Bits keys and the revise cards a weak follow-up becomes.
 *   node --test scripts/tests/dsa-interview.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  addRound,
  DSA_INTERVIEW_REF,
  extractJson,
  interviewStage,
  lastRoundLine,
  overallOf,
  parseScorecard,
  parseTurn,
  stripCode,
  topicStats,
  verdictFor,
  weakCards,
} from "../../src/lib/dsa/interview.ts";
import { awardKeys, awardsOf, BITS_TABLE, computeBits, eventBits, eventKey, interviewBits } from "../../src/lib/dsa/rewards.ts";

const fb = { strong: "s", missing: "m", better: "Use a stream-friendly counter." };

test("stage: follow-ups once accepted or unlocked, the explain drill while solving", () => {
  assert.equal(interviewStage({ accepted: false, unlocked: false }), "explain");
  assert.equal(interviewStage({ accepted: true, unlocked: true }), "followup");
  assert.equal(interviewStage({ accepted: true, unlocked: false }), "followup");
  assert.equal(interviewStage({ accepted: false, unlocked: true }), "followup");
});

test("parseTurn: tolerates fences, clamps scores, needs a next question to start", () => {
  const raw = '```json\n{"feedback":{"strong":"a","missing":"b","better":"c"},"score":9,"topic":"Edge cases","next":"What if empty?","wantsCode":true}\n```';
  const t = parseTurn(raw, "answer", "followup");
  assert.equal(t.score, 5);
  assert.equal(t.next.q, "What if empty?");
  assert.equal(t.next.wantsCode, true);
  assert.equal(parseTurn('{"topic":"x"}', "start"), null);
  assert.equal(parseTurn("no json here", "answer"), null);
  assert.equal(parseTurn('{"feedback":{},"score":3}', "answer"), null);
  // the last answer has no next question
  assert.equal(parseTurn('{"feedback":{"strong":"a"},"score":2}', "answer").next, null);
});

test("explain stage: code fences are stripped and wantsCode is never set", () => {
  const raw = JSON.stringify({ feedback: { strong: "ok", missing: "m", better: "Try this:\n```py\nreturn sorted(a)\n```" }, score: 2, next: "Cost?\n```\nx\n```", wantsCode: true });
  const t = parseTurn(raw, "answer", "explain");
  assert.ok(!/```/.test(t.feedback.better));
  assert.ok(!/```/.test(t.next.q));
  assert.equal(t.next.wantsCode, false);
  assert.equal(stripCode("a ```b``` c ```open"), "a  c");
});

test("scorecard: five clamped dims, overall is their mean, verdict follows the overall", () => {
  const raw = '{"scores":{"clarity":5,"reasoning":4,"complexity":4,"edges":3,"followups":5},"summary":"Good.","practise":["a","b"]}';
  const c = parseScorecard(raw, [{ score: 3 }]);
  assert.equal(c.overall, 4.2);
  assert.equal(c.verdict, "hire");
  assert.deepEqual(c.practise, ["a", "b"]);
  // a missing dimension falls back to the answers' mean; no evidence at all is a failure
  const d = parseScorecard('{"scores":{"clarity":2}}', [{ score: 4 }, { score: 4 }]);
  assert.equal(d.scores.edges, 4);
  assert.equal(parseScorecard('{"scores":{}}', []), null);
  assert.equal(overallOf({ clarity: 1, reasoning: 1, complexity: 1, edges: 1, followups: 1 }), 1);
  assert.deepEqual([4.3, 3.5, 2.5, 2.4].map(verdictFor), ["strong-hire", "hire", "lean-no", "no"]);
});

test("Bits: 15 for a round, 25 at 4 or more, one key per problem and stage that upgrades, never doubles", () => {
  assert.equal(interviewBits(3.9), BITS_TABLE.interviewRound);
  assert.equal(interviewBits(4), BITS_TABLE.interviewRound + BITS_TABLE.interviewStrong);
  assert.equal(BITS_TABLE.interviewRound, 15);
  assert.equal(BITS_TABLE.interviewStrong, 10);
  const key = awardKeys.interview("followup", "two-sum");
  assert.equal(key, "interview:followup:two-sum");
  const t0 = 1_700_000_000_000;
  const first = { [eventKey(key, 15)]: t0 };
  assert.equal(computeBits(awardsOf(first)).total, 15);
  assert.equal(eventBits(first, key), 15);
  // a later strong round writes 25 under the same key: the total is 25, not 40
  const both = { ...first, [eventKey(key, 25)]: t0 + 1 };
  assert.equal(computeBits(awardsOf(both)).total, 25);
  assert.equal(computeBits(awardsOf(both)).byKind.interview, 25);
  // the other stage is its own award
  assert.equal(computeBits(awardsOf({ ...both, [eventKey(awardKeys.interview("explain", "two-sum"), 15)]: t0 })).total, 40);
});

test("saved rounds: newest last, 12 kept, last-round line, Interview-ready needs 3 rounds of 4+ in a topic", () => {
  const round = (overall, at) => ({ at, stage: "followup", answered: 4, scores: { clarity: 4, reasoning: 4, complexity: 4, edges: 4, followups: 4 }, overall, verdict: verdictFor(overall), summary: "", practise: [] });
  let rec = null;
  for (let i = 0; i < 14; i++) rec = addRound(rec, round(4, i), "sliding-window", 100 + i);
  assert.equal(rec.rounds.length, 12);
  assert.equal(rec.rounds[11].at, 13);
  const at = 1_700_000_000_000;
  assert.equal(lastRoundLine([round(4.2, at)], at + 3 * 86_400_000 + 5), "Last round: 4.2 · 3 days ago");
  const flags = {
    "dsa:iv:a": addRound(null, round(4.5, 1), "sliding-window"),
    "dsa:iv:b": addRound(addRound(null, round(4, 2), "sliding-window"), round(3.2, 3), "sliding-window"),
    "dsa:iv:c": addRound(null, round(2, 4), "stacks"),
    "pref:other": { rounds: [] },
  };
  let stats = topicStats(flags);
  assert.deepEqual(
    stats.map((s) => [s.topic, s.rounds, s.strong, s.ready]),
    [["sliding-window", 3, 2, false], ["stacks", 1, 0, false]],
  );
  flags["dsa:iv:d"] = addRound(null, round(4.1, 5), "sliding-window");
  stats = topicStats(flags);
  assert.equal(stats[0].ready, true);
  assert.equal(stats[0].strong, 3);
});

test("revise cards: only weak (2 or less) follow-ups, with a stable reference, none from the explain drill", () => {
  const o = { stage: "followup", problem: "two-sum", title: "Two Sum", concept: "hash-maps", module: "s3-hashing" };
  const turns = [
    { q: "What if the input is a stream?", score: 2, feedback: fb },
    { q: "Why is it correct?", score: 4, feedback: fb },
    { q: "O(1) extra space?", score: 1, feedback: { ...fb, better: "" } },
    { q: "k changes per query?", score: 1, feedback: fb },
  ];
  const cards = weakCards(o, turns);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].front, "Follow-up: What if the input is a stream?");
  assert.equal(cards[0].back, fb.better);
  assert.equal(cards[0].source, "interview");
  assert.equal(cards[0].courseId, "dsa");
  assert.equal(cards[0].lessonSlug, "hash-maps");
  assert.equal(cards[0].sourceRef, DSA_INTERVIEW_REF("two-sum", "what if the input is a stream?"));
  assert.notEqual(cards[0].sourceRef, cards[1].sourceRef);
  assert.deepEqual(weakCards({ ...o, stage: "explain" }, turns), []);
});

test("extractJson finds the object among chatter", () => {
  assert.deepEqual(extractJson('Sure! {"a":1} done'), { a: 1 });
  assert.equal(extractJson("{broken"), null);
});
