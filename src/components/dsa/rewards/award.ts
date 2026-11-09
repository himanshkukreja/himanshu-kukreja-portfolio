/**
 * Awarding DSA Mastery Bits in the browser (the rules: src/lib/dsa/rewards.ts).
 *
 * Every award is a done key in the game store (synced to the account for signed-in learners, localStorage for guests),
 * written with markDone: no SD Mastery XP, no XP toast. The Bits gained are the difference in the computed total, so
 * a key that was already there gains nothing (idempotent), and the Bits toast (BitsToaster) shows only real gains.
 *
 * Plain functions over the game API, so code that holds the game in a ref (QuizHydrator, LecturePlayer) can award too;
 * components use useDsaBits().
 */
import type { GameContextValue } from "@/game/GameProvider";
import { awardsOf, beltFor, computeBits, eventBits, eventKey, type Belt } from "@/lib/dsa/rewards";

export type DsaGame = Pick<GameContextValue, "markDone" | "peekDone">;

export type BitsToast = { id: number; bits: number; label: string; /** set when this award moved the learner up a belt */ belt: Belt | null };

const listeners = new Set<(t: BitsToast) => void>();
let seq = 0;

/** Subscribe to Bits awards (the toaster and the header chip's bump). */
export function onBits(fn: (t: BitsToast) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const totalOf = (done: Record<string, number>) => computeBits(awardsOf(done)).total;

/**
 * Mark DSA keys done (progress keys such as dsa:s:/dsa:cpq:/dsa:daily:, or event keys from eventKey) and announce
 * the Bits they added. Returns the Bits gained (0 when every key was already there).
 */
export function dsaAward(game: DsaGame, keys: string[], label: string, opts?: { quiet?: boolean }): number {
  const before = game.peekDone();
  const { added, done } = game.markDone(keys);
  if (!added.length) return 0;
  const b0 = totalOf(before);
  const b1 = totalOf(done);
  const gained = b1 - b0;
  if (gained > 0 && !opts?.quiet) {
    const was = beltFor(b0);
    const now = beltFor(b1);
    const t: BitsToast = { id: ++seq, bits: gained, label, belt: now.index > was.index ? now.belt : null };
    listeners.forEach((f) => f(t));
  }
  return Math.max(0, gained);
}

/**
 * Grant an event award (`solve:<id>`, `explain:<concept>`, `streak:7`, `badge:<id>`, `welcome`) once. With `upgrade`
 * a higher amount later replaces a lower one (explain it back: partly there, then solid). `also`: progress keys to
 * mark in the same write (a solve's dsa:p:<id>), so the map and the Bits never disagree.
 */
export function dsaGrant(game: DsaGame, awardKey: string, bits: number, label: string, opts?: { upgrade?: boolean; also?: string[]; quiet?: boolean }): number {
  const also = opts?.also ?? [];
  const have = eventBits(game.peekDone(), awardKey);
  const take = bits > 0 && (have < 0 || (!!opts?.upgrade && bits > have));
  const keys = take ? [...also, eventKey(awardKey, bits)] : also;
  if (!keys.length) return 0;
  return dsaAward(game, keys, label, opts);
}
