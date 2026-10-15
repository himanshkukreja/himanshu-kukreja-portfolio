/**
 * Merge tags ("slugs") for campaign emails: `{{first_name}}`, with an optional fallback used when the
 * recipient has no value: `{{first_name|there}}`. Pure + client-safe: the composer validates and
 * previews with the same code the server sends with.
 */

export type MergeVars = Record<string, string>;

export const MERGE_TAGS = [
  { tag: "first_name", label: "First name", hint: "from the profile name; empty if unknown", sample: "Priya" },
  { tag: "name", label: "Full name", hint: "profile or Google name", sample: "Priya Sharma" },
  { tag: "email", label: "Email", hint: "recipient address", sample: "priya@example.com" },
  { tag: "streak", label: "Current streak", hint: "days, 0 if none", sample: "4" },
  { tag: "lessons_completed", label: "Lessons completed", hint: "count, 0 if none", sample: "12" },
  { tag: "current_lesson", label: "Current lesson", hint: "last lesson opened; empty if none", sample: "Consistent hashing" },
  { tag: "resume_url", label: "Resume link", hint: "last lesson, or /learn", sample: "https://www.himanshukukreja.in/learn" },
  { tag: "unsubscribe_url", label: "Unsubscribe link", hint: "one-click, per recipient", sample: "https://www.himanshukukreja.in/newsletter/unsubscribe?t=preview" },
  { tag: "site_url", label: "Site", hint: "https://www.himanshukukreja.in", sample: "https://www.himanshukukreja.in" },
] as const;

export type MergeTag = (typeof MERGE_TAGS)[number]["tag"];
export const KNOWN_TAGS = new Set<string>(MERGE_TAGS.map((t) => t.tag));
/** Tags whose values are URLs (inserted unescaped-for-URL, attribute-escaped). */
export const URL_TAGS = new Set<string>(["resume_url", "unsubscribe_url", "site_url"]);

export const SAMPLE_VARS: MergeVars = Object.fromEntries(MERGE_TAGS.map((t) => [t.tag, t.sample]));

/** `{{ tag }}` or `{{ tag | fallback }}`. Tag names: letters, digits, underscore. */
export const TAG_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|([^}]*))?\}\}/g;
/** Control tags of a conditional: `{{#if tag}} … {{else}} … {{/if}}` (not nested). */
export const CONTROL_RE = /\{\{\s*(?:#if\s+[a-zA-Z0-9_]+|else|\/if)\s*\}\}/g;
const IF_RE = /\{\{\s*#if\s+([a-zA-Z0-9_]+)\s*\}\}([\s\S]*?)(?:\{\{\s*else\s*\}\}([\s\S]*?))?\{\{\s*\/if\s*\}\}/g;

export type TagUse = { tag: string; fallback: string | null; raw: string };

export function findTags(s: string): TagUse[] {
  const out: TagUse[] = [];
  for (const m of s.matchAll(TAG_RE)) if (m[1].toLowerCase() !== "else") out.push({ tag: m[1].toLowerCase(), fallback: m[2] != null ? m[2].trim() : null, raw: m[0] });
  return out;
}

export type TagProblem = { where: string; raw: string; message: string };

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function suggestTag(tag: string): string | null {
  let best: string | null = null;
  let score = 3;
  for (const t of KNOWN_TAGS) {
    const s = distance(tag, t);
    if (s < score) {
      score = s;
      best = t;
    }
  }
  return best;
}

/** Unknown tags and malformed braces in one field. */
export function checkField(where: string, s: string | null | undefined): TagProblem[] {
  if (!s) return [];
  const problems: TagProblem[] = [];
  for (const u of findTags(s)) {
    if (!KNOWN_TAGS.has(u.tag)) {
      const sug = suggestTag(u.tag);
      problems.push({ where, raw: u.raw, message: `Unknown tag ${u.raw}${sug ? ` (did you mean {{${sug}}}?)` : ""}` });
    }
  }
  for (const m of s.matchAll(/\{\{\s*#if\s+([a-zA-Z0-9_]+)\s*\}\}/g)) {
    const tag = m[1].toLowerCase();
    if (!KNOWN_TAGS.has(tag)) problems.push({ where, raw: m[0], message: `Unknown tag in ${m[0]}` });
  }
  const opens = (s.match(/\{\{\s*#if\s/g) || []).length;
  const closes = (s.match(/\{\{\s*\/if\s*\}\}/g) || []).length;
  if (opens !== closes) problems.push({ where, raw: "{{#if}}", message: `${opens} {{#if …}} but ${closes} {{/if}}` });
  // leftover braces after removing valid-looking tags → unclosed / malformed
  const rest = s.replace(TAG_RE, "").replace(CONTROL_RE, "");
  const bad = rest.match(/\{\{[^}]{0,40}|\{[a-zA-Z_]+\}(?!\})/);
  if (bad) problems.push({ where, raw: bad[0], message: `Malformed tag near "${bad[0].slice(0, 30)}" (use {{tag}} or {{tag|fallback}})` });
  return problems;
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export type ResolveMode = "html" | "text";

/** Replace tags with values (HTML-escaped in html mode). Empty value → fallback → "". */
export function resolveTags(s: string, vars: MergeVars, mode: ResolveMode = "text"): string {
  const withIfs = s.replace(IF_RE, (_m, tag: string, yes: string, no?: string) => ((vars[tag.toLowerCase()] ?? "").trim() ? yes : (no ?? "")));
  return withIfs.replace(TAG_RE, (_m, tag: string, fb?: string) => {
    const v = (vars[tag.toLowerCase()] ?? "").trim();
    const out = v || (fb != null ? fb.trim() : "");
    return mode === "html" ? escHtml(out) : out;
  });
}

/** true when any tag in `s` resolves to "" (no value and no fallback): used for subject fallbacks. */
export function hasEmptyTag(s: string, vars: MergeVars): boolean {
  return findTags(s).some((u) => !(vars[u.tag] ?? "").trim() && !(u.fallback ?? "").trim());
}

/** "Priya Sharma" → "Priya"; empty or email-looking names → "". */
export function firstNameOf(full?: string | null): string {
  const t = (full || "").trim();
  if (!t || t.includes("@")) return "";
  const f = t.split(/\s+/)[0];
  return f.length > 1 && f.length <= 40 ? f : "";
}
