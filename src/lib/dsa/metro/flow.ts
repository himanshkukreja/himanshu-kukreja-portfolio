/** Pure maths of the balanced card flow (src/components/dsa/home/metro/Balanced.tsx), kept apart so it can be tested. */

/** the columns may end this far apart; anything beyond is taken up by growing the cards of the shorter column (never a blank band) */
export const SLACK = 70;
export const GAP = 16;

/** extra height (px) per card so every column ends within SLACK of the tallest: the shortfall is shared evenly by the cards of the shorter columns. */
export function stretch(heights: number[], place: number[], cols: number): number[] {
  const sums = new Array(cols).fill(0);
  const counts = new Array(cols).fill(0);
  heights.forEach((h, i) => {
    sums[place[i]] += h;
    counts[place[i]]++;
  });
  const bottoms = sums.map((s, c) => s + Math.max(0, counts[c] - 1) * GAP);
  const top = Math.max(...bottoms);
  return heights.map((_, i) => {
    const c = place[i];
    const short = top - bottoms[c] - SLACK;
    return counts[c] && short > 0 ? Math.round(short / counts[c]) : 0;
  });
}

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

