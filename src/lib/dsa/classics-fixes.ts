/**
 * Audit of the classic-twin tags (17 Nov 2026): each problem's statement was read against the LeetCode problem its
 * tags.classic names. Where a tag points at a different task (a hash-table internals problem tagged "Design HashMap", a
 * count tagged "Two Sum", a threshold count tagged "Maximum Average Subarray") the problem lists here the ids that are
 * right, and a missing twin is added. The list replaces the problem's tags.classic everywhere (see classicsOf). Pure data.
 */
export const CLASSIC_FIXES: Record<string, string[]> = {
  // wrong twin removed or re-pointed
  "balanced-ledger-quads": ["lc-454"],
  "busiest-shard": [],
  "chain-length-histogram": [],
  "growing-table-moves": [],
  "lookup-comparison-cost": [],
  "string-hash-collisions": [],
  "first-use-idempotency-keys": [],
  "dominant-topic-windows": [],
  "busiest-launch-stretch": ["lc-643"],
  "error-burst-windows": ["lc-1343"],
  "surge-zone-average": ["lc-1343"],
  "highest-average-of-k-days": ["lc-1423"],
  "compact-log-buffer": ["lc-27"],
  "common-postings": ["lc-349"],
  "closest-balance-snapshots": [],
  "shortest-cart-span-all-items": ["lc-76"],
  "gift-pairs-within-budget": ["lc-2824"],
  "mirror-reference-code": ["lc-125"],
  "longest-delivery-run": ["lc-1208"],
  "fewest-parcels-from-both-ends": ["lc-2516"],
  "apply-the-seat-permutation": [],
  "thread-span-every-member": ["lc-76"],
  "config-rollout-minutes": ["lc-994"],
  // twins added
  "moving-average-of-a-stream": ["lc-346"],
  "number-of-trailing-zeros-in-a-factorial": ["lc-172"],
  "even-or-odd-steps": ["lc-1342"],
  "day-of-the-week-from-a-date": ["lc-1185"],
  "balanced-zeros-and-ones": ["lc-696"],
  "distance-between-two-employees": ["lc-1740"],
  "minimum-moves-to-make-all-equal": ["lc-462"],
  "largest-minimum-gap-between-lockers": ["lc-1552"],
  "cut-ropes-to-get-k-equal-pieces": ["lc-1891"],
  "count-the-pairs-with-a-given-difference": ["lc-2006"],
};

/** names for the twins the audit added */
export const FIXED_CLASSIC_NAMES: Record<string, string> = {
  "lc-172": "Factorial Trailing Zeroes",
  "lc-346": "Moving Average from Data Stream",
  "lc-462": "Minimum Moves to Equal Array Elements II",
  "lc-696": "Count Binary Substrings",
  "lc-1185": "Day of the Week",
  "lc-1342": "Number of Steps to Reduce a Number to Zero",
  "lc-1552": "Magnetic Force Between Two Balls",
  "lc-1672": "Richest Customer Wealth",
  "lc-1740": "Find Distance in a Binary Tree",
  "lc-1891": "Cutting Ribbons",
  "lc-2006": "Count Number of Pairs With Absolute Difference K",
};

/** a problem's classic twins: the audited list when it has one, else what its front matter tags */
export function classicsOf(id: string, tagged: string[] | undefined): string[] {
  return CLASSIC_FIXES[id] ?? tagged ?? [];
}
