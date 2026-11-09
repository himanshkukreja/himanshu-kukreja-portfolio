/**
 * DSA Mastery's rewards, in one place. DSA's points/coins are their own system, separate from System Design Mastery's
 * XP and levels (owner, 9 Nov 2026), and are still being designed. Until they land nothing here touches SDM's XP:
 * the welcome bonus is only recorded (a flag on the account, once), and the screens say "Welcome bonus unlocked".
 * Switching to the DSA currency later is a change to this file alone: set the amount and unit below and replace
 * the body of awardDsaWelcome() with the real grant.
 */
export const DSA_WELCOME_BONUS = { amount: 50, unit: "points" } as const;
/** Everyone starts at level 1 of DSA's own ladder (placeholder until that ladder exists). */
export const DSA_START_LEVEL = { level: 1, name: "Learner" } as const;

export const DSA_WELCOME_FLAG = "dsa:welcome-bonus";

type Flags = Record<string, unknown>;

/**
 * Grant the welcome bonus once per account. Returns true the first time, false when it was already granted.
 * Today it records the grant (flag `dsa:welcome-bonus`, which syncs with the account like every game flag).
 */
export function awardDsaWelcome(flags: Flags, setFlag: (key: string, value: unknown) => void): boolean {
  if (flags[DSA_WELCOME_FLAG]) return false;
  setFlag(DSA_WELCOME_FLAG, { at: Date.now(), amount: DSA_WELCOME_BONUS.amount, unit: DSA_WELCOME_BONUS.unit });
  return true;
}
