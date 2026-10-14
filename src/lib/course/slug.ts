import { stripEmoji } from "./md";

/**
 * github-slugger-like slug that keeps section numbering readable:
 *   "1.2 The Three States" → "1-2-the-three-states"
 *   "Chapter 2: Implementing a Circuit Breaker" → "chapter-2-implementing-a-circuit-breaker"
 */
export function slugify(input: string, maxLen = 64): string {
  let s = stripEmoji(input).toLowerCase();
  s = s.replace(/(\d)\.(?=\d)/g, "$1-"); // keep 1.2 → 1-2
  s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/&/g, " and ");
  s = s.replace(/[^\p{L}\p{N}\s-]/gu, " ");
  s = s.trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (s.length > maxLen) {
    const cut = s.slice(0, maxLen);
    const at = cut.lastIndexOf("-");
    s = at > maxLen / 2 ? cut.slice(0, at) : cut;
  }
  return s;
}

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };

export function romanToInt(r: string): number {
  const up = r.toUpperCase();
  if (/^\d+$/.test(up)) return parseInt(up, 10);
  let total = 0;
  for (let i = 0; i < up.length; i++) {
    const v = ROMAN[up[i]] || 0;
    const next = ROMAN[up[i + 1]] || 0;
    total += v < next ? -v : v;
  }
  return total;
}

export function intToRoman(n: number): string {
  const map: [number, string][] = [[50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  let x = n;
  for (const [v, s] of map) while (x >= v) { out += s; x -= v; }
  return out || String(n);
}

/**
 * Hands out unique ids without github-slugger's "-1" collision suffix: a clash is
 * resolved by scoping the slug with the stage id, then the parent heading id.
 */
export class IdRegistry {
  private used = new Set<string>();

  has(id: string) {
    return this.used.has(id);
  }

  claim(base: string, scopes: string[] = []): string {
    const clean = base || "section";
    if (!this.used.has(clean)) {
      this.used.add(clean);
      return clean;
    }
    for (const scope of scopes) {
      if (!scope) continue;
      const scoped = `${scope}-${clean}`;
      if (!this.used.has(scoped)) {
        this.used.add(scoped);
        return scoped;
      }
    }
    let k = 2;
    while (this.used.has(`${clean}-n${k}`)) k++;
    const id = `${clean}-n${k}`;
    this.used.add(id);
    return id;
  }
}
