/**
 * Links from DSA lessons and problems to System Design Mastery (`:::realsystems{sdm="…" lab="…"}`). Pure: no
 * server-only imports.
 *
 * A cached DSA page is rendered with a token where each link's title goes (⟦dsa:sdm:<path>⟧, ⟦dsa:lab:<id>⟧), and the
 * titles are put in when the page is served (src/lib/dsa/load.ts withSdmTitles). Why: the titles come from the SD
 * course map and the labs, whose data-cache items can't be read from inside another cached item (Next bypasses nested
 * unstable_cache reads), so every cold DSA lesson rebuilt the whole course map, ~250 SD files (Nov 2026). Read at
 * serve time they're the course's own cached items, and an SD title change shows without re-rendering DSA pages.
 */

export type LinkKind = "sdm" | "lab";
export type TokenLink = { href: string; title: string; kind: "lesson" | "problem" | "lab" };

const OPEN = "⟦dsa:";
const CLOSE = "⟧";
const TOKEN = /⟦dsa:(sdm|lab):([^⟧\s<>"&]{1,300})⟧/g;
const WHOLE = /^⟦dsa:(sdm|lab):([^⟧\s<>"&]{1,300})⟧$/;

const SAFE_REF = /^[^⟧\s<>"&]{1,300}$/;

/** A title token; a ref a token can't carry (never in the content: paths and ids) keeps its own text as the title. */
export const linkToken = (kind: LinkKind, ref: string) => (SAFE_REF.test(ref) ? `${OPEN}${kind}:${ref}${CLOSE}` : ref);

/** The renderer's sdmLink / labLink with tokens for titles; hrefs and kinds as before. */
export function tokenLinker(): { sdm: (path: string) => TokenLink; lab: (id: string) => TokenLink } {
  return {
    sdm: (path) => {
      const clean = path.replace(/^\/+|\/+$/g, "").replace(/\.md$/, "");
      return { href: `/${clean}`, title: linkToken("sdm", clean), kind: clean.startsWith("problem-bank/") ? "problem" : "lesson" };
    },
    lab: (id) => ({ href: `/labs/${id}`, title: linkToken("lab", id), kind: "lab" }),
  };
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Whether anything in a value still carries a title token. */
export function hasLinkTokens(value: unknown): boolean {
  if (typeof value === "string") return value.includes(OPEN);
  if (Array.isArray(value)) return value.some(hasLinkTokens);
  if (value && typeof value === "object") return Object.values(value).some(hasLinkTokens);
  return false;
}

/**
 * A copy of `value` with every token replaced by its title: a string that is just a token (a link object's title)
 * gets the plain title, a token inside a longer string (rendered HTML) gets it HTML-escaped.
 */
export function resolveLinkTokens<T>(value: T, titleOf: (kind: LinkKind, ref: string) => string): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (!v.includes(OPEN)) return v;
      const whole = v.match(WHOLE);
      if (whole) return titleOf(whole[1] as LinkKind, whole[2]);
      return v.replace(TOKEN, (_, k: LinkKind, ref: string) => escapeHtml(titleOf(k, ref)));
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}
