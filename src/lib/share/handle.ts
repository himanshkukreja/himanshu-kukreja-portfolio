/**
 * Public share handles (/u/<handle>): slug rules, reserved words and a small blocklist.
 * Pure (no "use client" / "server-only"): the settings panel validates as you type and the API
 * re-validates every write. The database adds a format CHECK and a unique index on top.
 */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;

/** 3–24 chars: a–z, 0–9 and single hyphens; starts and ends with a letter or digit. */
export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,22}[a-z0-9]$/;

/** Words a learner can't take: routes, roles and names that would look official. */
const RESERVED = new Set(
  [
    "about", "account", "admin", "administrator", "api", "app", "arena", "auth", "blog", "bookmarks", "contact", "course",
    "daily", "dashboard", "delete", "dev", "docs", "edit", "email", "guide", "help", "himanshu", "himanshukukreja",
    "himanshu-kukreja", "hire", "hk", "home", "index", "learn", "leaderboard", "login", "logout", "mail", "me", "mod",
    "moderator", "new", "newsletter", "notebook", "notes", "null", "official", "owner", "play", "privacy", "profile",
    "projects", "review", "root", "security", "settings", "share", "signin", "signup", "sign-in", "sign-up", "staff",
    "stories", "sudo", "support", "system", "team", "terms", "test", "undefined", "user", "users", "verified", "www",
    "you", "sdm", "system-design-mastery",
  ]
);

/**
 * Substrings that are never OK in a public handle (checked with hyphens and digits-as-letters
 * folded out, so "f-u-c-k" and "sh1t" don't slip through). Kept short on purpose: false positives
 * on real names are worse than a rare miss, and the owner can unpublish any profile.
 */
const BLOCKED = [
  "fuck", "shit", "bitch", "cunt", "nigger", "nigga", "faggot", "slut", "whore", "rapist", "porn", "nazi", "hitler",
  "pussy", "dickhead", "asshole", "motherf", "retard", "kike", "chink", "spic",
  // common Hindi / Hinglish abuse
  "chutiya", "chutia", "madarchod", "maderchod", "behenchod", "bhenchod", "bhosd", "bsdk", "gandu", "randi", "lavda",
  "lauda", "loda", "chodu",
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g", "@": "a", $: "s" };

function folded(h: string): string {
  return h
    .toLowerCase()
    .split("")
    .map((c) => LEET[c] ?? c)
    .join("")
    .replace(/[^a-z]/g, "");
}

export type HandleProblem = "empty" | "short" | "long" | "format" | "reserved" | "blocked";

export const HANDLE_MESSAGES: Record<HandleProblem, string> = {
  empty: "Pick a handle.",
  short: `At least ${HANDLE_MIN} characters.`,
  long: `At most ${HANDLE_MAX} characters.`,
  format: "Lowercase letters, numbers and single hyphens; start and end with a letter or number.",
  reserved: "That one is reserved. Try another.",
  blocked: "That handle isn't allowed. Try another.",
};

export function handleProblem(h: string): HandleProblem | null {
  if (!h) return "empty";
  if (h.length < HANDLE_MIN) return "short";
  if (h.length > HANDLE_MAX) return "long";
  if (!HANDLE_RE.test(h)) return "format";
  if (RESERVED.has(h)) return "reserved";
  const f = folded(h);
  if (BLOCKED.some((w) => f.includes(w))) return "blocked";
  return null;
}

export const isValidHandle = (h: unknown): h is string => typeof h === "string" && handleProblem(h) === null;

/** Free text → the closest valid-looking slug ("Himanshu Kukreja" → "himanshu-kukreja"). */
export function slugifyHandle(input: string): string {
  return (input || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, HANDLE_MAX)
    .replace(/-$/g, "");
}

/** Suggested handle from a learner's name; `learner` when nothing usable is left. */
export function suggestHandle(fullName: string | null | undefined, fallback?: string | null): string {
  const tries = [fallback || "", fullName || "", (fullName || "").split(/\s+/)[0] || ""].map(slugifyHandle);
  for (const t of tries) if (t && handleProblem(t) === null) return t;
  return "learner";
}
