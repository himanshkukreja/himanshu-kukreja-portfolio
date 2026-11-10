/**
 * Strings as step-engine frames (Academy Part 3, A7 String basics). The "strings" view draws a string as a strip of letters
 * (StringsState): a pattern slid along a text, a 26-slot count array, or two pointers closing in on a palindrome.
 *
 *   slide-compare    slide the pattern along the text; at each shift compare letter by letter and stop at the first mismatch
 *   count-letters   a fixed array of 26 slots, one for each letter; each letter of the word adds 1 to its own slot
 *   two-ends        a palindrome check ignoring case and punctuation: a pointer at each end, skip what is not a letter or a digit,
 *                   compare the rest, and move both inwards
 *
 * Pure and dependency-free, like every generator here.
 */
import type { Frame, Script, StringsState, VizAsk } from "./types";
import { choicesOf } from "./topo";

export type StringsMethod = "slide-compare" | "count-letters" | "two-ends";
export type StringsProblem = { kind: "search"; text: string; pattern: string } | { kind: "count"; word: string } | { kind: "palindrome"; text: string };

export const STRINGS_METHOD_LABEL: Record<StringsMethod, string> = {
  "slide-compare": "Slide and compare",
  "count-letters": "Counting with 26 slots",
  "two-ends": "Two pointers from the ends",
};
export const methodOf = (p: StringsProblem): StringsMethod => (p.kind === "search" ? "slide-compare" : p.kind === "count" ? "count-letters" : "two-ends");

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const isAlnum = (c: string) => /^[A-Za-z0-9]$/.test(c);
const shown = (c: string) => (c === " " ? "a space" : `"${c}"`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const blank = (text: string[]): StringsState => ({ text, pattern: null, shift: 0, ok: [], bad: [], found: null, marks: {}, counts: null, out: null });

export function stringsScript(p: StringsProblem, opts: { predict?: boolean; title?: string } = {}): Script {
  const frames: Frame<StringsState>[] = [];
  let costUnit = "comparisons";
  let result = "";
  let asks = 0;
  const maybeAsk = (every: number, tick: number, make: () => VizAsk): VizAsk | null => {
    if (!opts.predict || asks >= 4 || tick % every !== 0) return null;
    asks++;
    return make();
  };

  if (p.kind === "search") {
    const t = [...p.text];
    const q = [...p.pattern];
    const n = t.length;
    const m = q.length;
    const base = (shift: number): StringsState => ({ ...blank(t), pattern: q, shift });
    if (m === 0 || m > n) {
      frames.push({ state: base(0), note: "The pattern must be between 1 letter and the length of the text.", cost: 0 });
    } else {
      frames.push({ state: base(0), note: `Slide the pattern along the text. At each shift, compare letter by letter and stop at the first mismatch. The pattern has ${plural(m, "letter")}, so there are ${plural(n - m + 1, "shift")}.`, cost: 0 });
      let cmp = 0;
      let at = -1;
      for (let s = 0; s + m <= n && at < 0; s++) {
        const ok: number[] = [];
        for (let j = 0; j < m; j++) {
          cmp++;
          const same = t[s + j] === q[j];
          const right = same ? (j + 1 === m ? "It matches, and the whole pattern has matched" : "It matches, so compare the next pair") : "It does not match, so slide the pattern one place right";
          const ask = maybeAsk(3, cmp, () => ({
            prompt: `The pattern sits at shift ${s}. Compare ${shown(t[s + j])} with ${shown(q[j])}. What happens next?`,
            choices: choicesOf(right, [
              { label: same ? "It does not match, so slide the pattern one place right" : "It matches, so compare the next pair", why: same ? "They are the same letter, so the comparison goes on." : "The letters differ, so this shift has failed." },
              { label: "Compare the rest of the pattern anyway", why: "The first mismatch settles this shift, so the rest is skipped." },
            ]),
          }));
          if (same) ok.push(s + j);
          frames.push({
            state: { ...base(s), ok: [...ok], bad: same ? [] : [s + j], marks: { i: s + j } },
            note: same ? `Shift ${s}: ${shown(t[s + j])} matches ${shown(q[j])}, pattern letter ${j + 1} of ${m}.` : `Shift ${s}: ${shown(t[s + j])} does not match ${shown(q[j])}. Stop here and slide the pattern one place right.`,
            cost: cmp,
            vars: { shift: s, comparisons: cmp },
            ask,
          });
          if (!same) break;
          if (j === m - 1) at = s;
        }
      }
      result = at < 0 ? "not found" : `found at ${at}`;
      const worst = m * (n - m + 1);
      frames.push({
        state: { ...base(at < 0 ? n - m : at), found: at < 0 ? null : [at, m], ok: at < 0 ? [] : Array.from({ length: m }, (_, k) => at + k), out: result },
        note: at < 0 ? `Done: the pattern fits at none of the ${plural(n - m + 1, "shift")}. That took ${cmp} comparisons, and the most possible here is ${worst}.` : `Done: the whole pattern matched at position ${at}, after ${cmp} comparisons. The most this text and pattern could need is ${worst}.`,
        cost: cmp,
        vars: { comparisons: cmp },
      });
    }
  } else if (p.kind === "count") {
    costUnit = "letters counted";
    const t = [...p.word];
    const values: number[] = Array(26).fill(0);
    const st = (marks: Record<string, number>, hot: number | null, out: string | null = null): StringsState => ({ ...blank(t), marks, counts: { letters: [...ALPHABET], values: [...values], hot }, out });
    frames.push({ state: st({}, null), note: "A fixed array has 26 slots, one for each letter from a to z. A letter's slot number is the letter minus a, so b is slot 1. Every slot starts at 0.", cost: 0 });
    t.forEach((c, i) => {
      const slot = ALPHABET.indexOf(c);
      values[slot]++;
      const ask = maybeAsk(3, i + 1, () => ({
        prompt: `The next letter is "${c}", which is slot ${slot}. What does slot "${c}" hold after it is counted?`,
        choices: choicesOf(String(values[slot]), [
          { label: String(values[slot] + 1), why: `Slot "${c}" held ${values[slot] - 1} before this letter, so it is ${values[slot]} now.` },
          { label: values[slot] > 1 ? String(values[slot] - 1) : "0", why: "Counting adds 1 to the slot. It never takes anything away." },
        ]),
      }));
      frames.push({ state: st({ i }, slot), note: `Letter ${i + 1} of ${t.length} is "${c}", slot ${slot}. Add 1: slot "${c}" now holds ${values[slot]}.`, cost: i + 1, vars: { letter: c, slot, count: values[slot] }, ask });
    });
    const best = Math.max(...values);
    const top = ALPHABET[values.indexOf(best)];
    result = `"${top}" x ${best}`;
    frames.push({ state: st({}, values.indexOf(best), result), note: `Done: ${plural(t.length, "letter")} counted in one pass with 26 slots. The most common letter is "${top}", ${best} time${best === 1 ? "" : "s"}. Reading a count back is one array lookup.`, cost: t.length });
  } else {
    const t = [...p.text];
    const ok: number[] = [];
    let l = 0;
    let r = t.length - 1;
    let cmp = 0;
    const st = (bad: number[] = [], out: string | null = null): StringsState => ({ ...blank(t), ok: [...ok], bad, marks: l === r ? { "left, right": l } : { left: l, right: r }, out });
    frames.push({ state: st(), note: "Put a pointer at each end. Skip anything that is not a letter or a digit, compare the rest ignoring case, and move both pointers inwards.", cost: 0 });
    let verdict: boolean | null = null;
    while (l < r && verdict === null) {
      while (l < r && !isAlnum(t[l])) {
        frames.push({ state: st(), note: `Skip ${shown(t[l])} on the left: it is not a letter or a digit.`, cost: cmp, vars: { comparisons: cmp } });
        l++;
      }
      while (l < r && !isAlnum(t[r])) {
        frames.push({ state: st(), note: `Skip ${shown(t[r])} on the right: it is not a letter or a digit.`, cost: cmp, vars: { comparisons: cmp } });
        r--;
      }
      if (l >= r) break;
      cmp++;
      const same = t[l].toLowerCase() === t[r].toLowerCase();
      const ask = maybeAsk(2, cmp, () => ({
        prompt: `Compare ${shown(t[l])} on the left with ${shown(t[r])} on the right, ignoring case. What happens?`,
        choices: choicesOf(same ? "They match, so move both pointers inwards" : "They differ, so the answer is no", [
          { label: same ? "They differ, so the answer is no" : "They match, so move both pointers inwards", why: same ? "Upper and lower case count as the same letter here." : "The letters differ, so one mismatch is enough to say no." },
          { label: "Skip one of them and go on", why: "Only characters that are not letters or digits are skipped." },
        ]),
      }));
      if (same) {
        ok.push(l, r);
        frames.push({ state: st(), note: `${shown(t[l])} and ${shown(t[r])} match, ignoring case. Move both pointers inwards.`, cost: cmp, vars: { comparisons: cmp }, ask });
        l++;
        r--;
      } else {
        verdict = false;
        frames.push({ state: st([l, r]), note: `${shown(t[l])} and ${shown(t[r])} differ, so the text is not a palindrome.`, cost: cmp, vars: { comparisons: cmp }, ask });
      }
    }
    result = verdict === false ? "not a palindrome" : "palindrome";
    frames.push({ state: st(verdict === false ? [l, r] : [], result), note: verdict === false ? `Done: not a palindrome, found after ${plural(cmp, "comparison")}. One mismatch is enough.` : `Done: the pointers met after ${plural(cmp, "comparison")}, and every pair matched, so it is a palindrome. Each character was looked at once.`, cost: cmp });
  }
  return { view: "strings", title: opts.title ?? "Strings", costUnit, frames, result } as Script;
}
