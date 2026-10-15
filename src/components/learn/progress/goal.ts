/**
 * Weekly learning goal. Signed in: `user_profiles.learning_goal` (a TEXT column whose original
 * values were a purpose like "interview-prep"); we store a small JSON object there and keep any
 * earlier purpose string inside it. Guests: localStorage `hk.goal.v1`.
 * No "use client" / "use server": shared by the progress page and /api/learn/goal.
 */
export type GoalUnit = "minutes" | "lessons";

export type LearningGoal = {
  unit: GoalUnit;
  /** minutes or lessons per week */
  perWeek: number;
  /** yyyy-mm-dd target finish date, optional */
  target: string | null;
  /** the column's original meaning, kept when present */
  purpose?: string | null;
  /** epoch ms of the last change */
  setAt?: number;
};

export const GOAL_STORAGE_KEY = "hk.goal.v1";
export const DEFAULT_GOAL: LearningGoal = { unit: "minutes", perWeek: 150, target: null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function cleanGoal(input: unknown): LearningGoal | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const unit: GoalUnit = o.unit === "lessons" ? "lessons" : "minutes";
  const n = Math.round(Number(o.perWeek));
  if (!Number.isFinite(n) || n <= 0) return null;
  const perWeek = Math.min(unit === "lessons" ? 50 : 3000, n);
  const target = typeof o.target === "string" && DATE.test(o.target) ? o.target : null;
  const purpose = typeof o.purpose === "string" && o.purpose.trim() ? o.purpose.trim().slice(0, 60) : null;
  const setAt = Number(o.setAt) || undefined;
  return { unit, perWeek, target, purpose, setAt };
}

/** Read the column: JSON goal, or a legacy purpose string (no goal set yet). */
export function parseLearningGoal(raw: string | null | undefined): { goal: LearningGoal | null; purpose: string | null } {
  const s = (raw || "").trim();
  if (!s) return { goal: null, purpose: null };
  if (s.startsWith("{")) {
    try {
      const goal = cleanGoal(JSON.parse(s));
      return { goal, purpose: goal?.purpose ?? null };
    } catch {
      return { goal: null, purpose: null };
    }
  }
  return { goal: null, purpose: s.slice(0, 60) };
}

export function serializeLearningGoal(goal: LearningGoal | null, purpose: string | null): string | null {
  if (!goal) return purpose || null;
  return JSON.stringify({ v: 1, unit: goal.unit, perWeek: goal.perWeek, target: goal.target, purpose: purpose || goal.purpose || null, setAt: goal.setAt || Date.now() });
}
