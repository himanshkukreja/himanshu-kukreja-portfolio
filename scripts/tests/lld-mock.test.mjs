/**
 * LLD (machine-coding) mock interviews, the pure parts (src/lib/learn/mock/lld.ts): the phase plan and its timing, the
 * rubric built from a case study's Interview checklist, choosing the requirement change, and parsing a case study. With
 * SDM_LOCAL_DIR (the content repo's resources folder) every real case study is checked too.
 *   node --test scripts/tests/lld-mock.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  LLD_PHASES,
  buildLldRubric,
  changeCandidates,
  changeForAttempt,
  checklistLevel,
  checklistPhase,
  isLldMockSlug,
  lldPhasePlan,
  lldRoundMinutes,
  parseLldCase,
  pickRequirementChange,
  stepAnchor,
  withChange,
} from "../../src/lib/learn/mock/lld.ts";
import { STEPS } from "../../src/lib/learn/lld/steps.ts";
import { CASES } from "../../src/lib/learn/lld/meta.ts";

const F = "```";
const FIXTURE = `# Design a Book Lending Desk

*A small library's lending desk.*

:::mission[Design the lending desk, then make it run]{level="Medium"}
- **60 min** round
:::

Intro.

## How the round runs

**Interviewer**: "Design the lending desk of a library. Members borrow and return copies. Ask me anything."

More text.

## Requirements and clarifying questions

| You ask | They answer | What it changes |
|---|---|---|
| Can a member hold two copies of a title? | No, one per title. | A check in \`lend\` |
| Is the return type \`Copy \\| None\`? | Yes. | Return type |
| Several desks at once? | Yes, three desks. | A lock |

::::compare[Scope we agreed]
:::col[In scope]{tone="ok"}
- Lend and return
- Fines
:::
:::col[Out of scope (for now)]{tone="note"}
- Payments
:::
::::

## The classes

Nouns first.

${F}mermaid
classDiagram
  class Desk {
    +lend(member, title) Copy
  }
  class Copy
  class Member
${F}

## The code

${F}python
## not a heading
class Desk: ...
${F}

## The patterns, and why

| Pattern | Where |
|---|---|
| Strategy | FinePolicy |

## Concurrency and edge cases

Two desks lend the last copy.

## Extending it: the follow-ups

- **"Add reservations for a title that is out."** A queue per title.
- **"We have 30 servers now."** A database row lock.
- **"Fines change at weekends."** A new \`FinePolicy\`.

## Interview checklist

- [ ] I asked whether a member can hold two copies of one title before modelling copies.
- [ ] I put fine calculation behind \`FinePolicy\`, since the library changes it.
- [ ] I held one lock around find-a-copy and mark-it-lent, so two desks never lend one copy.
- [ ] I rejected an unknown member id and a return of a copy that was never lent.
- [ ] I modelled \`Copy\` and \`Title\` as separate classes with one job each.
- [ ] I passed \`now\` into \`lend()\` rather than reading the clock.
- [ ] I said one desk-wide lock is enough and a lock per title is the answer if throughput is pushed.
- [ ] I absorbed the reservations follow-up as a queue per title, without editing \`Desk\`.

## Common mistakes

Some.
`;

/* ------------------------------------------------------------------ the phases and their time */

test("a round is 60 to 75 minutes, whatever the case study's real round length", () => {
  assert.equal(lldRoundMinutes(60), 60);
  assert.equal(lldRoundMinutes(75), 75);
  assert.equal(lldRoundMinutes(90), 75);
  assert.equal(lldRoundMinutes(45), 60);
  assert.equal(lldRoundMinutes(0), 60);
});

test("the phase plan follows the walkthrough's steps and adds up to the round exactly", () => {
  for (const round of [60, 65, 70, 75, 90]) {
    const plan = lldPhasePlan(round);
    assert.equal(plan.phases.reduce((a, p) => a + p.minutes, 0), plan.minutes, `${round}: phases add up`);
    assert.deepEqual(plan.phases.map((p) => p.key), ["clarify", "design", "patterns", "code", "concurrency"]);
    assert.deepEqual(plan.phases.map((p) => p.id), ["p1", "p2", "p3", "p4", "p5"]);
    const code = plan.phases.find((p) => p.key === "code");
    assert.ok(plan.phases.every((p) => p === code || p.minutes < code.minutes), "the code phase is the longest");
    assert.ok(plan.phases.every((p) => p.minutes >= 5), "no phase is a token one");
    // the requirement change arrives halfway through the code phase
    assert.equal(plan.changeAtSec, Math.round((code.minutes * 60) / 2));
  }
  assert.deepEqual(lldPhasePlan(60).phases.map((p) => p.minutes), [7, 12, 6, 26, 9]);
  assert.deepEqual(lldPhasePlan(75).phases.map((p) => p.minutes), [9, 15, 8, 32, 11]);
  // every one of the seven steps is covered by exactly one phase
  const covered = LLD_PHASES.flatMap((p) => p.steps);
  assert.deepEqual([...covered].sort(), STEPS.map((s) => s.key).sort());
});

/* ------------------------------------------------------------------ the rubric */

test("checklist lines land in the phase they grade", () => {
  assert.equal(checklistPhase("I asked whether a larger spot can take a smaller vehicle before modelling spots."), "clarify");
  assert.equal(checklistPhase("I confirmed several gates run at once, so `find_spot` and occupy sit under one lock."), "concurrency");
  assert.equal(checklistPhase("I put spot choice behind `SpotAssignmentStrategy`."), "patterns");
  assert.equal(checklistPhase("I raised a specific `LotFullError` for a full lot instead of returning None."), "concurrency");
  assert.equal(checklistPhase("I modelled `Copy` and `Title` as separate classes with one job each."), "design");
  assert.equal(checklistPhase("I passed `at` into `park()` rather than reading the clock."), "code");
  assert.equal(checklistPhase("I absorbed the EV-spot follow-up as a new spot rule."), "code");
  assert.equal(checklistPhase("I answered 20 servers with a `RedisTokenBucket` behind the same interface."), "code");
});

test("checklist levels: scope questions are junior, scaling and follow-ups senior, the rest sde", () => {
  assert.equal(checklistLevel("I asked whether a member can hold two copies."), "junior");
  assert.equal(checklistLevel("I put fine calculation behind `FinePolicy`."), "sde");
  assert.equal(checklistLevel("I said a lock per floor is the answer if throughput is pushed."), "senior");
  assert.equal(checklistLevel("I absorbed the reservations follow-up as a queue."), "senior");
  assert.equal(checklistLevel("I took per-seat locks in sorted seat order to avoid deadlock."), "senior");
});

test("the rubric is the checklist, every line once, plus one line per step, with stable ids", () => {
  const c = parseLldCase(FIXTURE);
  const rubric = buildLldRubric(c.checklist);
  const fromList = rubric.filter((s) => s.source === "checklist");
  assert.deepEqual(fromList.map((s) => s.text).sort(), [...c.checklist].sort(), "every checklist line, once");
  assert.equal(rubric.filter((s) => s.source === "step").length, 7, "one line per walkthrough step");
  assert.equal(new Set(rubric.map((s) => s.id)).size, rubric.length, "ids are unique");
  for (const p of lldPhasePlan(60).phases) assert.ok(rubric.some((s) => s.phase === p.key && s.id.startsWith(`${p.id}.`)), `${p.key} is graded`);
  const where = (start) => rubric.find((s) => s.text.startsWith(start));
  assert.equal(where("I asked whether a member").phase, "clarify");
  assert.equal(where("I put fine calculation").phase, "patterns");
  assert.equal(where("I held one lock").phase, "concurrency");
  assert.equal(where("I rejected an unknown member").phase, "concurrency");
  assert.equal(where("I modelled `Copy`").phase, "design");
  assert.equal(where("I passed `now`").phase, "code");
  assert.equal(where("I absorbed the reservations").phase, "code");
  assert.equal(where("I said one desk-wide lock").level, "senior");
  // ids: checklist lines first, in the lesson's order, then the step lines
  assert.deepEqual(rubric.filter((s) => s.phase === "concurrency").map((s) => s.id), ["p5.s1", "p5.s2", "p5.s3", "p5.s4"]);
  assert.equal(rubric.find((s) => s.id === "p5.s4").source, "step");
  // the same checklist always gives the same rubric (saved self-scores keep their meaning)
  assert.deepEqual(buildLldRubric(c.checklist), rubric);
  // each line studies its step on the case-study page
  assert.equal(stepAnchor(where("I asked whether a member")), "step-1");
  assert.equal(stepAnchor(rubric.find((s) => s.step === "diagram")), "step-3");
  assert.equal(stepAnchor(where("I held one lock")), "step-6");
});

test("a case study with no checklist still grades every phase on the steps", () => {
  const rubric = buildLldRubric([]);
  assert.equal(rubric.length, 7);
  assert.deepEqual([...new Set(rubric.map((s) => s.phase))], ["clarify", "design", "patterns", "code", "concurrency"]);
});

/* ------------------------------------------------------------------ the requirement change */

test("the requirement change comes from the lesson's own follow-ups, never one that leaves the process", () => {
  const c = parseLldCase(FIXTURE);
  assert.equal(c.followups.length, 3);
  assert.deepEqual(changeCandidates(c.followups).map((f) => f.ask), ["Add reservations for a title that is out.", "Fines change at weekends."]);
  const picks = [0, 1, 2, 3, 4, 5].map((seed) => pickRequirementChange(c.followups, seed));
  assert.ok(picks.every((k) => k === 0 || k === 2), "never the 30-servers one");
  assert.notEqual(picks[0], picks[1], "the next attempt gets the other change");
  assert.equal(pickRequirementChange(c.followups, 7), pickRequirementChange(c.followups, 7), "deterministic");
  assert.equal(pickRequirementChange(c.followups, -3), pickRequirementChange(c.followups, 3), "a negative seed still picks one");
  assert.equal(pickRequirementChange([], 1), -1);
  // when every follow-up is a scale question, one of them is still used
  const scale = [{ ask: "We have 30 servers.", answer: "" }, { ask: "Survive a restart.", answer: "" }];
  assert.ok([0, 1].includes(pickRequirementChange(scale, 5)));
});

test("withChange puts the attempt's change into the code phase only, and changeForAttempt rotates", () => {
  const msg = (id, followup) => ({ id, followup, trigger: { kind: "at", sec: 780 }, html: `<p>${id}</p>`, text: id, title: "Requirement change" });
  const phases = lldPhasePlan(60).phases.map((p) => ({ id: p.id, n: p.n, title: p.title, minutes: p.minutes, prompts: [], curveballs: p.key === "code" ? [msg("p4.chg1", 0)] : [], hints: [], answerHtml: "", rubric: [] }));
  const followups = [
    { ask: "Add reservations.", answer: "" },
    { ask: "We have 30 servers now.", answer: "" },
    { ask: "Fines change at weekends.", answer: "" },
  ];
  const mock = { kind: "lld", id: "lld-99-x", phases, lld: { n: 1, codePhase: "p4", followups, changes: [msg("p4.chg1", 0), msg("p4.chg3", 2)], defaultChange: "p4.chg1" } };
  const m = withChange(mock, "p4.chg3");
  assert.deepEqual(m.phases.find((p) => p.id === "p4").curveballs.map((c) => c.id), ["p4.chg3"]);
  assert.ok(m.phases.filter((p) => p.id !== "p4").every((p) => p.curveballs.length === 0));
  assert.equal(withChange(mock, "nope").phases[3].curveballs[0].id, "p4.chg1", "unknown id: the default");
  assert.equal(withChange(mock, undefined).phases[3].curveballs[0].id, "p4.chg1");
  const a1 = changeForAttempt(mock, 1);
  const a2 = changeForAttempt(mock, 2);
  assert.ok(["p4.chg1", "p4.chg3"].includes(a1) && ["p4.chg1", "p4.chg3"].includes(a2));
  assert.notEqual(a1, a2, "two attempts in a row get different changes");
  // a system design mock is left alone
  const hld = { id: "mock-01", phases };
  assert.equal(withChange(hld, "p4.chg3"), hld);
});

/* ------------------------------------------------------------------ parsing a case study */

test("a case study parses into the pieces the round needs", () => {
  const c = parseLldCase(FIXTURE);
  assert.equal(c.title, "Design a Book Lending Desk");
  assert.equal(c.deck, "A small library's lending desk.");
  assert.equal(c.mission.title, "Design the lending desk, then make it run");
  assert.equal(c.opening, "Design the lending desk of a library. Members borrow and return copies. Ask me anything.");
  assert.equal(c.qa.length, 3);
  assert.deepEqual(c.qa[0], { ask: "Can a member hold two copies of a title?", answer: "No, one per title.", changes: "A check in `lend`" });
  assert.equal(c.qa[1].ask, "Is the return type `Copy | None`?", "an escaped pipe stays in its cell");
  assert.deepEqual(c.inScope, ["Lend and return", "Fines"]);
  assert.deepEqual(c.outScope, ["Payments"]);
  assert.deepEqual(c.classNames, ["Desk", "Copy", "Member"]);
  assert.equal(c.checklist.length, 8);
  assert.ok(c.codeMd.includes("## not a heading"), "a heading inside a code fence stays in the code");
  assert.ok(c.patternsMd.includes("FinePolicy"));
  assert.ok(c.concurrencyMd.includes("Two desks"));
  assert.ok(!c.codeMd.includes("Common mistakes") && !c.codeMd.includes("Interview checklist"));
  assert.ok(isLldMockSlug("lld-01-parking-lot") && !isLldMockSlug("mock-01-x") && !isLldMockSlug("dp-16-strategy"));
});

/* ------------------------------------------------------------------ the real case studies */

const LOCAL = process.env.SDM_LOCAL_DIR || "/Users/himanshukukreja/system-design-mastery/resources";
const DIR = path.join(LOCAL, "low-level-design");
// an older content checkout (before the case studies had their Interview checklists) is skipped, not failed
const FIRST = path.join(DIR, "lld-01-parking-lot.md");
const READY = fs.existsSync(FIRST) && /^## Interview checklist/m.test(fs.readFileSync(FIRST, "utf8"));
test("the real case studies: each one makes a full round", { skip: !READY && "no content with Interview checklists (set SDM_LOCAL_DIR)" }, () => {
  const files = fs.readdirSync(DIR).filter((f) => /^lld-\d+-.+\.md$/.test(f)).sort();
  assert.ok(files.length >= 22, "the case studies are there");
  for (const f of files) {
    assert.ok(CASES.some((c) => `${c.slug}.md` === f), `${f}: a catalogue row (the mock reads its round length)`);
    const c = parseLldCase(fs.readFileSync(path.join(DIR, f), "utf8"));
    assert.ok(c.opening.length > 20, `${f}: the interviewer's opening`);
    assert.ok(c.qa.length >= 4, `${f}: the requirements table (${c.qa.length} rows)`);
    assert.ok(c.checklist.length >= 8, `${f}: the interview checklist (${c.checklist.length})`);
    assert.ok(changeCandidates(c.followups).length >= 2, `${f}: at least two requirement changes to rotate`);
    assert.ok(c.classNames.length >= 3, `${f}: the class diagram`);
    assert.ok(c.codeMd.length > 2000 && c.patternsMd && c.concurrencyMd, `${f}: the reference answers`);
    const rubric = buildLldRubric(c.checklist);
    assert.equal(rubric.filter((s) => s.source === "checklist").length, c.checklist.length, `${f}: every checklist line graded`);
    for (const p of LLD_PHASES) assert.ok(rubric.some((s) => s.phase === p.key), `${f}: ${p.key} graded`);
  }
});

test("the interviewer's opening says the mock's own length", async () => {
  const { openingFor } = await import("../../src/lib/learn/mock/lld.ts");
  assert.equal(openingFor("Design a parking lot. You have 90 minutes. Ask me anything.", 75), "Design a parking lot. You have 75 minutes. Ask me anything.");
  assert.equal(openingFor("Working code, 45 minutes.", 60), "Working code, 60 minutes.");
  assert.equal(openingFor("Three floors and two gates.", 60), "Three floors and two gates.");
});
