/**
 * Choosing talks with a greedy rule as step-engine frames (Academy Part 3, A5): interval scheduling on a list of talks. The "intervals"
 * view draws the run (IntervalsState: each talk is a bar on an hour axis; the talks the rule takes are filled, the talks it skips are
 * crossed out, and for earliest finish a line marks the end of the last talk taken).
 *
 *   A talk is [start, end] in whole hours. Two talks overlap when they share some time, so a talk that starts exactly when another ends
 *   does not overlap it. Talk 0 is A, talk 1 is B, and so on.
 *
 *   earliest-finish  go through the talks by end time (the safe rule: an exchange argument and a stays-ahead argument both prove it)
 *   earliest-start   go through the talks by start time (not safe: one long early talk can block many short ones)
 *   shortest-first   go through the talks by length (not safe: a short talk across a boundary can block two others)
 *
 * Every rule takes a talk when it overlaps none of the talks already taken. Ties go to the talk listed first. The cost counts talks
 * looked at. The best plan is found by trying every set of talks (at most 8 talks, so at most 256 sets), so the comparison at the end
 * never trusts a rule. Frames carry the code markers of the lesson's template for earliest finish: [1] sort, [3] the fit test, [4] take
 * it. Pure and dependency-free, like every generator here.
 */
import type { Frame, IntervalsState, Script, VizAsk } from "./types";
import { choicesOf } from "./topo";

export type Talk = [number, number];
export type IntervalRule = "earliest-finish" | "earliest-start" | "shortest-first";
export type IntervalsResult = { picked: number[]; skipped: number[]; best: number; looked: number };

export const RULE_LABEL: Record<IntervalRule, string> = {
  "earliest-finish": "Earliest finish first",
  "earliest-start": "Earliest start first",
  "shortest-first": "Shortest first",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const talkName = (i: number) => String.fromCharCode(65 + i);
const when = (t: Talk) => `${t[0]} to ${t[1]}`;
const overlap = (a: Talk, b: Talk) => a[0] < b[1] && b[0] < a[1];

/** The order a rule goes through the talks: by its key, then by position in the list. */
export function ruleOrder(talks: Talk[], rule: IntervalRule): number[] {
  const key = (t: Talk) => (rule === "earliest-finish" ? t[1] : rule === "earliest-start" ? t[0] : t[1] - t[0]);
  return talks.map((_, i) => i).sort((a, b) => key(talks[a]) - key(talks[b]) || a - b);
}

/** The most talks any plan can hold, by trying every set of talks (talks are few: at most 8). */
export function bestPlanSize(talks: Talk[]): number {
  const n = talks.length;
  let best = 0;
  for (let mask = 0; mask < 1 << n; mask++) {
    const chosen: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) chosen.push(i);
    if (chosen.length <= best) continue;
    let ok = true;
    for (let a = 0; a < chosen.length && ok; a++) for (let b = a + 1; b < chosen.length; b++) if (overlap(talks[chosen[a]], talks[chosen[b]])) { ok = false; break; }
    if (ok) best = chosen.length;
  }
  return best;
}

export function intervalsFrames(talks: Talk[], rule: IntervalRule, opts: { predict?: boolean } = {}): { frames: Frame<IntervalsState>[]; result: IntervalsResult } {
  const frames: Frame<IntervalsState>[] = [];
  const order = ruleOrder(talks, rule);
  const picked: number[] = [];
  const skipped: number[] = [];
  let lastEnd = 0;
  let looked = 0;
  const finish = rule === "earliest-finish";
  const names = (xs: number[]) => (xs.length ? xs.map(talkName).join(", ") : "none");
  const snap = (o: Partial<IntervalsState>): IntervalsState => ({
    spans: talks.map((t) => [t[0], t[1]] as [number, number]),
    picked: [...picked],
    skipped: [...skipped],
    lit: [],
    current: null,
    lastEnd: finish && picked.length ? lastEnd : null,
    out: picked.length ? `${plural(picked.length, "talk")} taken` : null,
    ...o,
  });
  const vars = () => ({ taken: picked.length, "talks looked at": looked, ...(finish ? { "last end": picked.length ? lastEnd : "none yet" } : {}) });
  const how: Record<IntervalRule, string> = {
    "earliest-finish": "Go through the talks by end time.",
    "earliest-start": "Go through the talks by start time.",
    "shortest-first": "Go through the talks from the shortest to the longest.",
  };
  frames.push({
    state: snap({ out: "nothing taken" }),
    note: `${RULE_LABEL[rule]}. ${how[rule]} Order: ${order.map(talkName).join(", ")}. A talk is taken when it overlaps none of the talks already taken.`,
    cost: 0,
    marker: finish ? 1 : undefined,
    vars: vars(),
  });
  order.forEach((i, pos) => {
    const t = talks[i];
    const clash = [...picked].reverse().find((j) => overlap(talks[j], t)); // the most recent talk taken that it overlaps
    const fits = clash === undefined;
    looked++;
    if (fits) {
      picked.push(i);
      lastEnd = t[1];
    } else skipped.push(i);
    const reason = finish
      ? fits
        ? `It starts at ${t[0]}, at or after the last end${picked.length > 1 ? ` of ${talks[picked[picked.length - 2]][1]}` : " (nothing is taken yet)"}, so it fits.`
        : `It starts at ${t[0]}, before the last end of ${lastEnd}, so it overlaps talk ${talkName(clash!)}.`
      : fits
        ? "It overlaps none of the talks taken so far, so it fits."
        : `It overlaps talk ${talkName(clash!)} (${when(talks[clash!])}), which is taken.`;
    let ask: VizAsk | null = null;
    if (opts.predict && pos % 2 === 1) {
      ask = {
        prompt: `Talk ${talkName(i)} runs from ${t[0]} to ${t[1]}.${finish && picked.length - (fits ? 1 : 0) > 0 ? ` The last end is ${fits ? talks[picked[picked.length - 2]][1] : lastEnd}.` : ""} What does the rule do with it?`,
        choices: fits
          ? choicesOf("Take it", [{ label: "Skip it", why: `Talk ${talkName(i)} overlaps none of the talks already taken` }])
          : choicesOf("Skip it", [{ label: "Take it", why: `Talk ${talkName(i)} overlaps talk ${talkName(clash!)}, which is already taken` }]),
      };
    }
    frames.push({
      state: snap({ current: i, lit: fits ? [] : [clash!] }),
      note: `Talk ${talkName(i)}, ${when(t)}. ${reason} ${fits ? "Take it." : "Skip it."}`,
      cost: looked,
      marker: finish ? (fits ? 4 : 3) : undefined,
      vars: vars(),
      ask,
    });
  });
  const best = bestPlanSize(talks);
  const same = picked.length === best;
  frames.push({
    state: snap({ out: `${picked.length} of ${best}` }),
    note: `Done. The rule took ${plural(picked.length, "talk")}: ${names([...picked].sort((a, b) => a - b))}. The best plan has ${plural(best, "talk")}, found by trying every set of talks. ${same ? "This rule found a best plan on these talks." : `This rule is ${plural(best - picked.length, "talk")} short, so it is not safe.`}`,
    cost: looked,
    vars: { ...vars(), "best plan": best },
  });
  return { frames, result: { picked, skipped, best, looked } };
}

/** A greedy rule on a list of talks as a script on the intervals view. */
export function intervalsScript(talks: Talk[], rule: IntervalRule, opts: { predict?: boolean; title?: string } = {}): Script<IntervalsState> & { summary: IntervalsResult } {
  const r = intervalsFrames(talks, rule, opts);
  const s = r.result;
  const result = `${RULE_LABEL[rule]} took ${plural(s.picked.length, "talk")}; the best plan has ${s.best}${s.picked.length === s.best ? "" : ", so the rule falls short"}`;
  return { view: "intervals", title: opts.title || RULE_LABEL[rule], costUnit: "talks looked at", frames: r.frames, result, summary: s };
}
