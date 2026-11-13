/**
 * AI wave 2 (13 Nov 2026): weak-spot drills and "Let the tutor read my notes". Deterministic.
 *   node --test scripts/tests/weak-drill-notes.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { drillOutcome, gradeShort, gradeQuestion, headingsOf, readDrill } from "../../src/lib/learner/drill-model.ts";
import { classify, findStruggles } from "../../src/lib/learner/planning-model.ts";
import { notesBlock, notesOptedIn, NOTES_ASK_RE, NOTES_BLOCK_MAX } from "../../src/lib/learner/notes-model.ts";
import { eventRow } from "../../src/lib/learner/events-model.ts";

const H = ["Why modulo fails", "Virtual nodes", "Definition"];
const raw = {
  questions: [
    { kind: "mcq", q: "What fixes uneven arcs?", options: ["Virtual nodes", "More disks", "A bigger hash"], answer: 0, accept: [], why: "Each server owns many points (Section: Virtual nodes).", section: "virtual nodes" },
    { kind: "short", q: "How many keys move when a node joins, roughly?", options: [], answer: -1, accept: ["1/n", "about 1/n of the keys"], why: "Only the arc it takes over (Section: Why modulo fails).", section: "Made up heading" },
    { kind: "mcq", q: "Bad key", options: ["a", "b", "c"], answer: 7, accept: [], why: "x", section: "Definition" },
    { kind: "short", q: "No accepted phrase", options: [], answer: -1, accept: [], why: "x", section: "Definition" },
    { kind: "mcq", q: "Dup options", options: ["a", "a", "b"], answer: 0, accept: [], why: "x", section: "Definition" },
  ],
};

test("readDrill keeps only gradable questions and snaps sections to real headings", () => {
  const d = readDrill(raw, H);
  assert.equal(d.questions.length, 2);
  assert.equal(d.questions[0].section, "Virtual nodes");
  assert.equal(d.questions[1].section, "Why modulo fails");
  assert.equal(readDrill({ questions: [raw.questions[2]] }, H), null);
  assert.equal(readDrill("nope", H), null);
  assert.equal(readDrill(raw, H, 1).questions.length, 1);
});

test("grading is instant and local: mcq by index, short by accepted phrase", () => {
  const d = readDrill(raw, H);
  assert.equal(gradeQuestion(d.questions[0], { pick: 0 }), true);
  assert.equal(gradeQuestion(d.questions[0], { pick: 2 }), false);
  assert.equal(gradeShort("Roughly about 1/N of the keys!", ["1/n"]), true);
  assert.equal(gradeShort("about 10 keys", ["1"]), false);
  assert.equal(gradeShort("", ["x"]), false);
});

test("headingsOf reads outline headings and labelled parts", () => {
  assert.deepEqual(headingsOf("Concept: X\n\nDefinition: y\n\nRefresher:\n- a\n\n## Virtual nodes\ntext"), ["Virtual nodes", "Definition", "Refresher"]);
});

test("a drill result is a chat_quiz outcome with ids and counts only, and it feeds the struggle log", () => {
  const o = drillOutcome("sdm:consistent-hashing", 2, 3, "sdm");
  assert.equal(o.kind, "chat_quiz");
  assert.equal(o.outcome, "right");
  assert.equal(drillOutcome("dsa:x", 1, 3, "dsa").outcome, "wrong");
  const row = eventRow("u1", o);
  assert.ok(row, "the outcome log accepts it");
  assert.deepEqual(row.detail, { kind: "drill", n: 3, ok: 2 });
  assert.equal(classify({ kind: "chat_quiz", ref: o.ref, outcome: "wrong" }, () => null).key, "sdm:consistent-hashing");
  const now = Date.now();
  const ev = (outcome, at) => ({ kind: "chat_quiz", ref: "drill:sdm:consistent-hashing", outcome, at });
  assert.equal(findStruggles([ev("wrong", now - 3000), ev("wrong", now - 2000)], now, () => null).length, 1);
  assert.equal(findStruggles([ev("wrong", now - 3000), ev("wrong", now - 2000), ev("right", now - 1000)], now, () => null).length, 0, "a clean drill clears the topic");
});

test("notes off means off: only an explicit { on: true } opts in", () => {
  for (const f of [null, undefined, {}, { "pref:tutor-notes": null }, { "pref:tutor-notes": true }, { "pref:tutor-notes": "on" }, { "pref:tutor-notes": { on: false } }, { "pref:tutor-notes": { on: "true" } }, { "pref:tutor-notes": [] }]) assert.equal(notesOptedIn(f), false);
  assert.equal(notesOptedIn({ "pref:tutor-notes": { on: true, updatedAt: 1 } }), true);
});

test("the notes block is bounded and quotes only what the learner wrote", () => {
  const b = notesBlock({ pages: [{ title: "Caching", text: "x".repeat(9000) }], highlights: ["write-through"], notes: [{ text: "cache-aside = DB first", on: "cache-aside", type: "question" }] });
  assert.ok(b.length <= NOTES_BLOCK_MAX);
  assert.match(b, /notebook_page/);
  assert.equal(notesBlock({ pages: [], highlights: [], notes: [] }), "");
  assert.ok(NOTES_ASK_RE.test("explain this like my notes") && NOTES_ASK_RE.test("check my notes") && !NOTES_ASK_RE.test("what is a cache"));
});

test("the code reads notes only behind the switch and never stores them", () => {
  const reader = fs.readFileSync("src/lib/learner/notes-reader.ts", "utf8");
  const body = reader.slice(reader.indexOf("export async function readMyNotes"));
  assert.ok(body.indexOf("tutorNotesOn(userId)") > -1 && body.indexOf("tutorNotesOn(userId)") < body.indexOf("notebook_pages"), "the flag is checked before any notes table is read");
  assert.ok(!/\.(insert|upsert|update)\(/.test(reader), "the reader never writes");
  assert.ok(!/cache\b|new Map/.test(reader.replace(/\/\*[\s\S]*?\*\//g, "")), "no cache of notes");
  const ask = fs.readFileSync("src/app/api/learn/ai/ask/route.ts", "utf8");
  assert.ok(/saveTranscript\([^)]*\bask\b/.test(ask) && !/saveTranscript\([^)]*(sent|mine)/.test(ask), "the transcript keeps the question, not the notes");
  const tools = fs.readFileSync("src/lib/ai/chat/tools.ts", "utf8");
  const fn = tools.slice(tools.indexOf("async function readNotes"), tools.indexOf("async function dueReviews"));
  assert.ok(fn.indexOf("st.d.notesOn") > -1 && fn.indexOf("st.d.notesOn") < fn.indexOf("st.d.myNotes("), "the chat tool checks the switch before reading");
  const core = fs.readFileSync("src/lib/ai/chat/core.ts", "utf8");
  assert.match(core, /o\.deps\.notesOn && o\.deps\.myNotes \? \[\.\.\.TOOLS, NOTES_TOOL\] : TOOLS/);
});
