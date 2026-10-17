/**
 * Recipient display names for campaigns: resolution order, validation, "suggest from email" and the
 * bulk paste parser. Pure + client-safe (no I/O): the Recipients panel previews with the same rules
 * the API enforces.
 *
 * Resolution order (everywhere in the campaign service):
 *   1. override   set by the admin in the Recipients panel (public.email_names)
 *   2. profile    user_profiles.full_name (the learner's own profile name)
 *   3. metadata   auth user_metadata.full_name / name (Google sign-in etc.)
 *   4. none       → merge tags use their fallback ("Hi there")
 */
import { firstNameOf } from "./tags";

export type NameSource = "override" | "profile" | "metadata" | "none";

export const NAME_SOURCE_LABEL: Record<NameSource, string> = {
  override: "set by you",
  profile: "account profile",
  metadata: "sign-in metadata",
  none: "no name",
};

export const NAME_MAX = 80;

const clean = (s: string | null | undefined) => (typeof s === "string" ? s.replace(/[\s  -​  　]+/g, " ").trim() : "");

/** First non-empty of override → profile → metadata, with where it came from. */
export function resolveName(p: { override?: string | null; profile?: string | null; metadata?: string | null }): { name: string | null; source: NameSource } {
  const o = clean(p.override);
  if (o) return { name: o, source: "override" };
  const pr = clean(p.profile);
  if (pr) return { name: pr, source: "profile" };
  const m = clean(p.metadata);
  if (m) return { name: m, source: "metadata" };
  return { name: null, source: "none" };
}

/** Trim + collapse runs of whitespace (incl. NBSP / thin spaces) to one space. */
export const normalizeName = (s: string) => clean(s);

const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;
const ALLOWED_RE = /^[\p{L}\p{M}][\p{L}\p{M} '’.\-]*$/u;
const DOMAIN_RE = /[\p{L}\d-]\.(com|in|net|org|io|dev|me|co|ai|app|xyz|info|biz|edu|gov|uk|us)\b/iu;

export type NameCheck = { ok: true; name: string; suggestion: string | null } | { ok: false; error: string };

/**
 * Validate an admin-entered name. Rules: 1–80 characters after trimming; letters (any script),
 * spaces, apostrophes, hyphens and periods only; no email addresses, web addresses, HTML, digits or
 * emoji. `suggestion` is a title-cased version when the input is all lower / upper case — offered,
 * never applied.
 */
export function checkName(raw: unknown): NameCheck {
  if (typeof raw !== "string") return { ok: false, error: "Name is required." };
  const name = normalizeName(raw);
  if (!name) return { ok: false, error: "Name is empty." };
  if (name.length > NAME_MAX) return { ok: false, error: `Name is too long (${name.length}/${NAME_MAX} characters).` };
  if (name.includes("@")) return { ok: false, error: "That looks like an email address, not a name." };
  if (/:\/\/|www\.|^https?\b/i.test(name) || DOMAIN_RE.test(name)) return { ok: false, error: "That looks like a web address, not a name." };
  if (/[<>]|&[a-z#0-9]+;/i.test(name)) return { ok: false, error: "Names can't contain HTML." };
  if (/[{}]/.test(name)) return { ok: false, error: "Names can't contain { } (merge-tag braces)." };
  if (EMOJI_RE.test(name)) return { ok: false, error: "Names can't contain emoji." };
  if (/\d/.test(name)) return { ok: false, error: "Names can't contain digits." };
  if (!ALLOWED_RE.test(name)) return { ok: false, error: "Use letters, spaces, apostrophes, hyphens and periods only." };
  if ((name.match(/\p{L}/gu) || []).length < 2) return { ok: false, error: "Name is too short (at least 2 letters)." };
  return { ok: true, name, suggestion: titleCaseSuggestion(name) };
}

const cap = (w: string) => w.replace(/(^|[-'’])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());

/** "himanshu kukreja" / "HIMANSHU KUKREJA" → "Himanshu Kukreja"; mixed case (already intentional) → null. */
export function titleCaseSuggestion(name: string): string | null {
  const n = normalizeName(name);
  const lower = n === n.toLowerCase();
  const upper = n === n.toUpperCase();
  if (!lower && !upper) return null;
  const t = n
    .toLowerCase()
    .split(" ")
    .map((w) => cap(w))
    .join(" ");
  return t !== n ? t : null;
}

const GENERIC_LOCAL = new Set([
  "admin", "contact", "dev", "hello", "help", "hi", "info", "mail", "me", "newsletter", "no-reply", "noreply", "office", "sales", "support", "team", "test", "user", "work", "hey", "inbox", "jobs", "careers", "billing", "accounts",
]);

/**
 * Best guess at a name from an address: "himanshu.kukreja+news@…" → "Himanshu Kukreja".
 * `confident` is false for a single unsplittable token ("priya1990@…" → "Priya"). Always a suggestion
 * the admin confirms; null when there's nothing name-like (role accounts, initials, digits only).
 */
export function suggestFromEmail(email: string): { name: string; confident: boolean } | null {
  const local = (email || "").toLowerCase().split("@")[0]?.split("+")[0] || "";
  if (!local || GENERIC_LOCAL.has(local)) return null;
  const parts = local
    .split(/[._\-]+/)
    .map((p) => p.replace(/\d+/g, ""))
    .filter((p) => /^\p{L}+$/u.test(p));
  const words = parts.filter((p) => p.length > 1);
  if (!words.length || words.every((w) => GENERIC_LOCAL.has(w))) return null;
  const picked = words.slice(0, 3);
  const name = picked.map((w) => cap(w)).join(" ");
  const check = checkName(name);
  if (!check.ok) return null;
  return { name: check.name, confident: picked.length >= 2 };
}

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
export const isRecipientEmail = (s: string) => EMAIL_RE.test(s);

export type BulkRow = { line: number; raw: string; email: string; name: string; error: string | null; suggestion: string | null };

/**
 * Parse pasted lines into { email, name } pairs. Accepted per line (either order):
 *   email, Name      email<TAB>Name      Name <email>      email Name      "Name", email
 * Blank lines, "#" comments and a header row ("email,name") are ignored. Later lines win for the
 * same address.
 */
export function parseBulk(text: string, max = 1000): { rows: BulkRow[]; skipped: number } {
  const rows: BulkRow[] = [];
  let skipped = 0;
  const lines = (text || "").split(/\r?\n/);
  lines.forEach((rawLine, i) => {
    const raw = rawLine.trim();
    if (!raw || raw.startsWith("#")) return;
    if (/^"?e-?mail"?\s*[,\t;]\s*"?(full[ _]?)?name"?$/i.test(raw) || /^"?(full[ _]?)?name"?\s*[,\t;]\s*"?e-?mail"?$/i.test(raw)) return;
    if (rows.length >= max) {
      skipped++;
      return;
    }
    let email = "";
    let name = "";
    const angle = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>(.*)$/.exec(raw);
    const unq = (s: string) => s.trim().replace(/^["']|["']$/g, "").trim();
    if (angle) {
      email = angle[2];
      name = unq(`${angle[1]} ${angle[3]}`.replace(/[,;\t]/g, " "));
    } else {
      const parts = raw.includes("\t") ? raw.split("\t") : raw.includes(",") ? raw.split(",") : raw.includes(";") ? raw.split(";") : raw.split(/\s+/);
      const at = parts.findIndex((p) => isRecipientEmail(unq(p)));
      if (at >= 0) {
        email = unq(parts[at]);
        name = unq(parts.filter((_, j) => j !== at).join(" "));
      } else {
        name = raw;
      }
    }
    email = email.toLowerCase();
    let error: string | null = null;
    let suggestion: string | null = null;
    let finalName = normalizeName(name);
    if (!email || !isRecipientEmail(email)) error = "No valid email address on this line.";
    else if (!finalName) error = "No name on this line.";
    else {
      const c = checkName(finalName);
      if (!c.ok) error = c.error;
      else {
        finalName = c.name;
        suggestion = c.suggestion;
      }
    }
    rows.push({ line: i + 1, raw, email, name: finalName, error, suggestion });
  });
  // later lines win for the same address
  const last = new Map<string, number>();
  rows.forEach((r, i) => r.email && !r.error && last.set(r.email, i));
  const out = rows.filter((r, i) => r.error || last.get(r.email) === i);
  return { rows: out, skipped };
}

/** What {{first_name}} will be for a name (shown as "greets as Hi Priya"). */
export const greetingName = (name: string | null | undefined) => firstNameOf(name);
