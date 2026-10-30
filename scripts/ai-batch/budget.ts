/**
 * Content jobs stop at their share of the cycle (governor.ts contentBudget = monthly × (1 - live share)). The batch
 * scripts call the Message Batches API directly, not callClaude, so they check it here before submitting.
 */
import { getAiSettings } from "@/lib/ai/settings";
import { CONTENT_CAP_MESSAGE, contentCapReached, getBudget } from "@/lib/ai/governor";

export async function assertContentBudget(estimateUsd: number) {
  const b = await getBudget(await getAiSettings(true), true);
  const left = b.contentBudget - b.spentCycleContent;
  if (contentCapReached(b)) throw new Error(`${CONTENT_CAP_MESSAGE} ($${b.spentCycleContent.toFixed(2)} of $${b.contentBudget.toFixed(2)})`);
  console.log(`content jobs budget: $${b.spentCycleContent.toFixed(2)} of $${b.contentBudget.toFixed(2)} used, $${left.toFixed(2)} left`);
  if (estimateUsd > left) throw new Error(`this batch (~$${estimateUsd.toFixed(2)}) is more than the content jobs budget left this cycle ($${left.toFixed(2)})`);
}
