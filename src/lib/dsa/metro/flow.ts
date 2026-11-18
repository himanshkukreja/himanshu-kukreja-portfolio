/** Pure maths of the balanced card flow (src/components/dsa/home/metro/Balanced.tsx), kept apart so it can be tested. */

export const GAP = 16;

/** column of each card (heights in order) minimising the spread of the column bottoms; ties keep earlier cards earlier. */
export function balance(heights: number[], cols: number): number[] {
  const n = heights.length;
  if (cols <= 1 || n <= 1) return heights.map(() => 0);
  let best: number[] = heights.map((_, i) => i % cols);
  let bestScore = Infinity;
  const cur: number[] = new Array(n).fill(0);
  const sums = new Array(cols).fill(0);
  const counts = new Array(cols).fill(0);
  const rec = (i: number, used: number) => {
    if (i === n) {
      const bottoms = sums.map((s, c) => s - (counts[c] ? GAP : 0));
      const score = Math.max(...bottoms) - Math.min(...bottoms);
      if (score < bestScore - 0.5) {
        bestScore = score;
        best = cur.slice();
      }
      return;
    }
    // a card may open at most one new column (symmetry), so columns fill left to right
    for (let c = 0; c < Math.min(cols, used + 1); c++) {
      cur[i] = c;
      sums[c] += heights[i] + GAP;
      counts[c]++;
      rec(i + 1, Math.max(used, c + 1));
      sums[c] -= heights[i] + GAP;
      counts[c]--;
    }
  };
  rec(0, 0);
  return best;
}


