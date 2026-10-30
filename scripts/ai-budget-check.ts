/**
 * The AI budget governor's maths (src/lib/ai/governor.ts budgetFrom), checked without a database:
 *   NODE_PATH=<server-only stub> npx tsx scripts/ai-budget-check.ts
 * - content jobs (eval, batch) get monthly × (1 - live share) as a hard cap: at the cap they're refused
 *   (contentCapReached), and live features are unaffected: their mode depends on live spend only;
 * - a change of the live share moves both budgets (85%: $382.50 live, $67.50 content of $450);
 * - the total stop stays: once everything spent reaches the monthly budget, AI is off for everyone;
 * - live spend at its own budget still turns live AI off, whatever content jobs spent.
 */
import assert from "node:assert/strict";
import { budgetFrom, contentCapReached, type Sums } from "@/lib/ai/governor";
import type { AiSettings } from "@/lib/ai/settings";

let n = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
};

const settings = (liveShare: number): AiSettings => ({ enabled: true, cycleDay: 13, monthlyBudgetUsd: 450, liveShare, userDailyMaxUsd: 0.5, userDailyMinUsd: 0.01, endsOn: null, features: {}, note: null, updatedAt: null, updatedBy: null });
// 30 Oct 2026, mid-cycle (13 Oct → 13 Nov), nothing spent today
const NOW = new Date("2026-10-30T10:00:00Z");
const sums = (live: number, content: number, todayLive = 0): Sums => ({ cycleAll: live + content, cycleLive: live, todayLive, activeUsers: 5 });

ok("85% live share: $382.50 for learners, $67.50 for content jobs", () => {
  const b = budgetFrom(settings(0.85), sums(1.38, 54.02), NOW);
  assert.equal(b.liveBudget, 382.5);
  assert.equal(b.contentBudget, 67.5);
  assert.equal(Number(b.spentCycleContent.toFixed(2)), 54.02);
  assert.equal(contentCapReached(b), false);
  assert.equal(b.mode, "green");
});

ok("content at its cap: content refused, live unaffected", () => {
  const b = budgetFrom(settings(0.85), sums(1.38, 67.5), NOW);
  assert.equal(contentCapReached(b), true);
  assert.equal(b.mode, "green");
  const over = budgetFrom(settings(0.85), sums(1.38, 90), NOW);
  assert.equal(contentCapReached(over), true);
  assert.equal(over.mode, "green", "content over its share must not switch live AI off");
});

ok("a live share change applies to both budgets", () => {
  const at70 = budgetFrom(settings(0.7), sums(1.38, 54.02), NOW);
  assert.equal(at70.contentBudget, 135);
  assert.equal(contentCapReached(at70), false);
  const at90 = budgetFrom(settings(0.9), sums(1.38, 54.02), NOW);
  assert.equal(Number(at90.contentBudget.toFixed(2)), 45);
  assert.equal(contentCapReached(at90), true);
  assert.equal(at90.mode, "green");
});

ok("the total stop is kept as a safety net", () => {
  const b = budgetFrom(settings(0.85), sums(380, 70), NOW);
  assert.equal(b.mode, "off");
  assert.equal(b.reason, "this month's budget is used");
});

ok("live spend at the live budget turns live AI off, with content jobs under their cap", () => {
  const b = budgetFrom(settings(0.85), sums(382.5, 10), NOW);
  assert.equal(b.mode, "off");
  assert.equal(contentCapReached(b), false);
});

console.log(`\n${n} checks passed`);
