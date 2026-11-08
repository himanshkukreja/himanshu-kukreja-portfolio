/**
 * DSA Mastery waitlist: the shared rules for the coming-soon form (components/dsa/soon/WaitlistForm) and
 * POST /api/dsa/waitlist. Pure, no imports: the browser and the server validate the same way, and the
 * database checks the same sets (supabase/migrations/20261108_dsa_waitlist_access.sql).
 */

export const GOALS = [
  { id: "interviews", label: "Interviews and placements" },
  { id: "fundamentals", label: "Fundamentals from zero" },
  { id: "competitive", label: "Competitive programming" },
] as const;

export const LANGUAGES = [
  { id: "python", label: "Python" },
  { id: "java", label: "Java" },
  { id: "cpp", label: "C++" },
  { id: "javascript", label: "JavaScript" },
] as const;

export type GoalId = (typeof GOALS)[number]["id"];
export type LanguageId = (typeof LANGUAGES)[number]["id"];

/** Where on the page the signup came from (dsa_waitlist.source). */
export const DEFAULT_SOURCE = "dsa-soon";

const GOAL_IDS = new Set<string>(GOALS.map((g) => g.id));
const LANGUAGE_IDS = new Set<string>(LANGUAGES.map((l) => l.id));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SOURCE_RE = /^[a-z0-9][a-z0-9:_-]{0,47}$/;
/** share handles (src/lib/share/handle.ts): 3-24 chars, a-z, 0-9, single hyphens */
const REF_RE = /^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$/;

export type EmailCheck = { ok: true; email: string } | { ok: false; error: string };

/** Trimmed, lower-cased and checked; the error is the friendly line the form shows. */
export function checkEmail(raw: unknown): EmailCheck {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!email) return { ok: false, error: "Enter your email address." };
  if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, error: "That email address doesn't look right. Check it and try again." };
  return { ok: true, email };
}

const pick = (raw: unknown, allowed: Set<string>): string[] =>
  Array.isArray(raw) ? [...new Set(raw.filter((v): v is string => typeof v === "string" && allowed.has(v)))] : [];

export const cleanGoals = (raw: unknown) => pick(raw, GOAL_IDS) as GoalId[];
export const cleanLanguages = (raw: unknown) => pick(raw, LANGUAGE_IDS) as LanguageId[];
export const cleanSource = (raw: unknown) => (typeof raw === "string" && SOURCE_RE.test(raw) ? raw : DEFAULT_SOURCE);
export const cleanRef = (raw: unknown) => {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return REF_RE.test(v) && !v.includes("--") ? v : null;
};

/** What the API answers on success. */
export type WaitlistResult = {
  ok: true;
  /** joined = a new row; already = this email was on the list */
  status: "joined" | "already";
  /** the row is linked to the signed-in account */
  linked: boolean;
  /** joined while the founding window is open */
  founding: boolean;
  message: string;
};

/** GET /api/dsa/waitlist for a signed-in learner: is their account (or its email) on the list? */
export type WaitlistStatus = { joined: boolean; founding: boolean };
