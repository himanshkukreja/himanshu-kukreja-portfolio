/**
 * Bits as step-engine frames (Academy Part 3, A8 Bits and maths). The "bits" view draws whole numbers as rows of 8 bit cells
 * (BitsState): the numbers being combined, and the result under a rule with the operator.
 *
 *   bitwise        AND, OR or XOR of two numbers, one column at a time from bit 7 down to bit 0
 *   clear-lowest   x & (x - 1) again and again until x is 0: x, x - 1 and the result, one step for each 1 bit
 *   flags          a mask as a set of 8 named permissions: grant (OR), revoke (AND with the flipped bit), toggle (XOR) and test (AND)
 *
 * All numbers are whole numbers from 0 to 255 (8 bits, unsigned). Pure and dependency-free, like every generator here.
 */
import type { BitsRow, BitsState, Frame, Script, VizAsk } from "./types";
import { choicesOf } from "./topo";

export type BitsMethod = "bitwise" | "clear-lowest" | "flags";
export type BitsOp = "and" | "or" | "xor";
export type FlagStep = { do: "grant" | "revoke" | "toggle" | "test"; flag: number };
export type BitsProblem =
  | { kind: "op"; op: BitsOp; a: number; b: number }
  | { kind: "clear-lowest"; x: number }
  | { kind: "flags"; start: number; steps: FlagStep[] };

export const BITS_METHOD_LABEL: Record<BitsMethod, string> = {
  bitwise: "Bitwise, column by column",
  "clear-lowest": "Clearing the lowest bit",
  flags: "A mask as a set",
};
export const methodOf = (p: BitsProblem): BitsMethod => (p.kind === "op" ? "bitwise" : p.kind === "clear-lowest" ? "clear-lowest" : "flags");

/** the eight permissions of the flags problem, bit 0 first */
export const FLAG_NAMES = ["view", "post", "react", "pin", "invite", "remove", "mute", "admin"];

const W = 8;
const MASK = (1 << W) - 1;
const SYMBOL: Record<BitsOp, string> = { and: "&", or: "|", xor: "^" };
const WORD: Record<BitsOp, string> = { and: "AND", or: "OR", xor: "XOR" };
const RULE: Record<BitsOp, string> = { and: "AND is 1 only where both bits are 1", or: "OR is 1 where either bit is 1", xor: "XOR is 1 only where the bits differ" };
const apply = (op: BitsOp, x: number, y: number) => (op === "and" ? x & y : op === "or" ? x | y : x ^ y);
const bit = (v: number, i: number) => (v >> i) & 1;
const bin = (v: number) => (v & MASK).toString(2).padStart(W, "0");
const lowest = (v: number) => Math.log2(v & -v);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** up to two wrong answers for a predict question: the candidates that differ from the right one, with a reason each */
const wrongs = (right: number, cands: [number, string][]): { label: string; why: string }[] => {
  const out: { label: string; why: string }[] = [];
  for (const [v, why] of cands) if (v !== right && !out.some((o) => o.label === String(v)) && out.length < 2) out.push({ label: String(v), why });
  return out;
};

const row = (label: string, value: number, kind: BitsRow["kind"], from?: number): BitsRow => ({ label, value, kind, ...(from === undefined ? {} : { from }) });
const state = (rows: BitsRow[], extra: Partial<BitsState> = {}): BitsState => ({ width: W, signed: false, rows, hot: [], op: null, names: null, out: null, ...extra });

export function bitsScript(p: BitsProblem, opts: { predict?: boolean; title?: string } = {}): Script {
  const frames: Frame<BitsState>[] = [];
  let costUnit = "columns combined";
  let result = "";
  let asks = 0;
  const maybeAsk = (every: number, tick: number, make: () => VizAsk): VizAsk | null => {
    if (!opts.predict || asks >= 4 || tick % every !== 0) return null;
    asks++;
    return make();
  };

  if (p.kind === "op") {
    const { a, b, op } = p;
    const sym = SYMBOL[op];
    const res = apply(op, a, b);
    const lab = `x ${sym} y`;
    const rows = (value: number, from?: number) => [row("x", a, "in"), row("y", b, "in"), row(lab, value, "out", from)];
    frames.push({ state: state(rows(0, W), { op: sym }), note: `Combine x = ${a} (${bin(a)}) and y = ${b} (${bin(b)}) one column at a time, from bit 7 to bit 0. ${RULE[op]}.`, cost: 0 });
    for (let i = W - 1; i >= 0; i--) {
      const bx = bit(a, i);
      const by = bit(b, i);
      const r = apply(op, bx, by);
      const so_far = (res >> i) << i;
      const done = W - i;
      const ask = maybeAsk(3, done, () => ({
        prompt: `Column ${i}: x has a ${bx} and y has a ${by}. What is the result bit under ${WORD[op]}?`,
        choices: choicesOf(String(r), [{ label: String(1 - r), why: `${RULE[op]}, so a ${bx} and a ${by} give ${r}.` }]),
      }));
      frames.push({
        state: state(rows(so_far, i), { op: sym, hot: [i] }),
        note: `Column ${i}: x has a ${bx} and y has a ${by}. ${RULE[op]}, so the result bit is ${r}.`,
        cost: done,
        vars: { column: i, x: bx, y: by, result: r },
        ask,
      });
    }
    result = `${a} ${sym} ${b} = ${res}`;
    frames.push({ state: state(rows(res), { op: sym, out: result }), note: `Done: ${a} ${WORD[op]} ${b} is ${res} (${bin(res)}). Each result bit depended only on the two bits in its own column.`, cost: W });
  } else if (p.kind === "clear-lowest") {
    costUnit = "steps";
    let x = p.x;
    let steps = 0;
    frames.push({ state: state([row("x", x, "plain")]), note: `Clear the lowest 1 bit of x = ${x} (${bin(x)}) again and again, with x & (x - 1). Count the steps until x is 0.`, cost: 0 });
    while (x > 0) {
      const L = lowest(x);
      const prev = x - 1;
      const next = x & prev;
      steps++;
      const changed = Array.from({ length: L + 1 }, (_, k) => k);
      frames.push({
        state: state([row("x", x, "in"), row("x - 1", prev, "in"), row("x & (x - 1)", 0, "out", W)], { op: "&", hot: changed }),
        note: `x - 1 is ${prev} (${bin(prev)}). The lowest 1 bit of x, bit ${L}, became 0, and ${L === 0 ? "no bit below it changed" : `the ${plural(L, "bit")} below it became 1`}.`,
        cost: steps - 1,
        vars: { x, "x - 1": prev },
      });
      const ask = maybeAsk(2, steps, () => ({
        prompt: `x is ${x} and x - 1 is ${prev}. What is x & (x - 1)?`,
        choices: choicesOf(String(next), [
          { label: String(prev), why: "That is x - 1. AND keeps only the bits that are 1 in both numbers, so bit " + L + " and the bits below it are gone." },
          { label: String(x), why: "AND clears bit " + L + ", because x has a 1 there and x - 1 has a 0." },
        ]),
      }));
      frames.push({
        state: state([row("x", x, "in"), row("x - 1", prev, "in"), row("x & (x - 1)", next, "out")], { op: "&", hot: [L], out: `${steps} ${steps === 1 ? "step" : "steps"}` }),
        note: `x & (x - 1) is ${next} (${bin(next)}): bit ${L}, the lowest 1 bit, is cleared and every other bit is unchanged. That is step ${steps}.`,
        cost: steps,
        vars: { step: steps, x: next },
        ask,
      });
      x = next;
    }
    result = `${steps} ${steps === 1 ? "step" : "steps"}`;
    frames.push({ state: state([row("x", 0, "plain")], { out: result }), note: `x is 0 after ${plural(steps, "step")}, so ${p.x} has ${plural(steps, "bit")} set. A number with one 1 bit, a power of two, needs a single step.`, cost: steps });
  } else {
    costUnit = "operations";
    let mask = p.start;
    const names = FLAG_NAMES;
    const base = (rows: BitsRow[], extra: Partial<BitsState> = {}) => state(rows, { names, ...extra });
    frames.push({ state: base([row("mask", mask, "plain")]), note: `A mask holds a set in one number: bit 0 is ${names[0]}, bit 1 is ${names[1]}, and so on up to bit 7, ${names[7]}. The mask ${mask} (${bin(mask)}) is the set of the permissions whose bit is 1.`, cost: 0 });
    let hasAnswer = "";
    p.steps.forEach((st, k) => {
      const f = st.flag;
      const name = names[f];
      const bv = 1 << f;
      const n = k + 1;
      if (st.do === "grant") {
        const next = mask | bv;
        const ask = maybeAsk(2, n, () => ({
          prompt: `Grant "${name}" to ${mask} (${bin(mask)}) with mask | (1 << ${f}). What is the new mask?`,
          choices: choicesOf(String(next), wrongs(next, [
            [mask & ~bv & MASK, "That clears the bit. OR with the bit sets it."],
            [mask ^ bv, "That toggles the bit. OR sets it to 1 and never clears one."],
            [mask, "The mask changes unless the bit was already 1. OR sets bit " + f + "."],
          ])),
        }));
        frames.push({
          state: base([row("mask", mask, "in"), row(`1 << ${f}`, bv, "in"), row("mask | bit", next, "out")], { op: "|", hot: [f] }),
          note: `Grant "${name}": OR with 1 << ${f} (${bv}) sets bit ${f} and leaves the other bits alone. The mask is now ${next}.`,
          cost: n,
          ask,
        });
        mask = next;
      } else if (st.do === "revoke") {
        const next = mask & ~bv & MASK;
        const flipped = ~bv & MASK;
        const ask = maybeAsk(2, n, () => ({
          prompt: `Revoke "${name}" from ${mask} (${bin(mask)}) with mask & ~(1 << ${f}). What is the new mask?`,
          choices: choicesOf(String(next), wrongs(next, [
            [mask | bv, "OR would set the bit. AND with the flipped bit clears it."],
            [mask ^ bv, "That toggles the bit, so a bit that is already 0 would be set."],
            [mask, "The mask changes unless the bit was already 0. AND with the flipped bit forces bit " + f + " to 0."],
          ])),
        }));
        frames.push({
          state: base([row("mask", mask, "in"), row("~bit", flipped, "in"), row("mask & ~bit", next, "out")], { op: "&", hot: [f] }),
          note: `Revoke "${name}": AND with the flipped bit, ~(1 << ${f}), which is ${flipped} (${bin(flipped)}). Only bit ${f} is forced to 0. The mask is now ${next}.`,
          cost: n,
          ask,
        });
        mask = next;
      } else if (st.do === "toggle") {
        const next = mask ^ bv;
        const ask = maybeAsk(2, n, () => ({
          prompt: `Toggle "${name}" on ${mask} (${bin(mask)}) with mask ^ (1 << ${f}). What is the new mask?`,
          choices: choicesOf(String(next), wrongs(next, [
            [mask | bv, "OR can only set a bit. XOR flips it, so a bit that is 1 becomes 0."],
            [mask & ~bv & MASK, "AND with the flipped bit can only clear a bit. XOR flips it, so a bit that is 0 becomes 1."],
            [mask, "XOR with a 1 always flips the bit, so the mask changes."],
          ])),
        }));
        frames.push({
          state: base([row("mask", mask, "in"), row("bit", bv, "in"), row("mask ^ bit", next, "out")], { op: "^", hot: [f] }),
          note: `Toggle "${name}": XOR with 1 << ${f} (${bv}) flips bit ${f}, from ${bit(mask, f)} to ${bit(next, f)}. The mask is now ${next}.`,
          cost: n,
          ask,
        });
        mask = next;
      } else {
        const hit = mask & bv;
        const yes = hit !== 0;
        const ask = maybeAsk(2, n, () => ({
          prompt: `Does ${mask} (${bin(mask)}) have "${name}"? Compute mask & (1 << ${f}), then decide.`,
          choices: choicesOf(yes ? "Yes: the result is not 0" : "No: the result is 0", [
            { label: yes ? "No: the result is 0" : "Yes: the result is not 0", why: yes ? `Bit ${f} is 1, so the AND keeps it and the result is ${hit}.` : `Bit ${f} is 0, so the AND clears everything and the result is 0.` },
          ]),
        }));
        hasAnswer = yes ? "yes" : "no";
        frames.push({
          state: base([row("mask", mask, "in"), row("bit", bv, "in"), row("mask & bit", hit, "out")], { op: "&", hot: [f], out: yes ? `${name}: yes` : `${name}: no` }),
          note: `Test "${name}": AND with 1 << ${f} (${bv}) gives ${hit}. ${yes ? "It is not 0, so the permission is in the set" : "It is 0, so the permission is not in the set"}. The mask is unchanged.`,
          cost: n,
          ask,
        });
      }
    });
    result = `mask ${mask}${hasAnswer ? `, last test ${hasAnswer}` : ""}`;
    frames.push({ state: base([row("mask", mask, "plain")], { out: `mask ${mask}` }), note: `Done: the mask is ${mask} (${bin(mask)}) after ${plural(p.steps.length, "operation")}. Each operation changed or read one bit only.`, cost: p.steps.length });
  }
  return { view: "bits", title: opts.title ?? "Bits", costUnit, frames, result } as Script;
}
