/**
 * Citation check for the course chat and the DSA chat (AI quality layer, owner-approved 12 Nov 2026): after the answer is
 * written, every [[sN]] must point at a source this conversation actually retrieved AND that source must support the
 * sentence the citation is attached to. Cheap and deterministic, no model call: content-word overlap (light stemming,
 * stop words out) between the claim and what the model was shown for that ref (the search line and snippet, the
 * <course_text> it read, the passage) plus the index entry's own title, summary and text.
 *
 *   supported      the claim shares enough content words with the ref's evidence      → kept
 *   fixed          it doesn't, but another retrieved ref clearly does                   → swapped for that ref
 *   dropped        neither                                                               → removed
 *   unverifiable   we hold no evidence for the ref (a ref from an earlier turn whose text this request never saw) → kept
 *
 * Lenient on purpose: a paraphrase that shares two or three content words passes. The aim is to catch a citation glued
 * to the wrong source (a sharding sentence cited to the rate-limiting lesson), not to grade the prose. Pure (no imports):
 * the routes, the evals (scripts/ai-eval/citations.ts) and the tests (scripts/tests/ai-quality.test.mjs) share it.
 */

export type Evidence = Record<string, string>;
export type CiteDetail = { ref: string; verdict: "ok" | "fixed" | "dropped" | "unverifiable"; to?: string; score: number; claim: string };
export type CiteStats = { total: number; ok: number; fixed: number; dropped: number; unverifiable: number };
export type CiteResult = { text: string; stats: CiteStats; details: CiteDetail[] };

const REF_GROUP = /\[\[\s*([a-z]\d{1,4}(?:\s*,\s*[a-z]\d{1,4})*)\s*\]\]/gi;

const STOP = new Set(
  (
    "a an the and or but if then than so of to in on at by for with from into onto over under about as is are was were be been being it its it's this that these those there here " +
    "i you we they he she them us our your their my me his her him which who whom whose what when where why how not no nor do does did done doing have has had having " +
    "add adds added adding can could will would shall should may might must also just only very more most less least much many some any each every all both either neither one two three " +
    "first second next last same other another such own up down out off again further once get gets got make makes made use uses used using way ways thing things " +
    "like e.g i.e etc via per while because since until although though yet still even well really quite rather lot lots kind sort " +
    "say says said see seen look looks need needs want wants let lets keep keeps put puts give gives go goes going come comes take takes work works " +
    "system systems design designs data example examples lesson lessons course section sections part parts learn learner idea ideas case answer question note"
  ).split(/\s+/),
);

/** a light stem: plural, -ing, -ed, -ly, -er/-ers, -ion(s) off (enough to match "caches"/"caching"/"cached") */
export function stem(w: string): string {
  let s = w;
  if (s.length > 5 && s.endsWith("ies")) s = `${s.slice(0, -3)}y`;
  else if (s.length > 4 && /(ches|shes|sses|xes)$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss") && !s.endsWith("us") && !s.endsWith("is")) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith("ly")) s = s.slice(0, -2);
  if (s.length > 5 && s.endsWith("ion")) s = s.slice(0, -3);
  if (s.length > 4 && s.endsWith("er")) s = s.slice(0, -2);
  if (s.length > 3 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

/** content words of a text, stemmed (numbers of 2+ digits count: "99", "500ms") */
export function contentWords(text: string): string[] {
  const out: string[] = [];
  for (const raw of text
    .toLowerCase()
    .replace(REF_GROUP, " ")
    .replace(/[`*_>#|~\[\]()]/g, " ")
    .split(/[^a-z0-9]+/)) {
    if (!raw) continue;
    if (/^\d+$/.test(raw) ? raw.length < 2 : raw.length < 3) continue;
    if (STOP.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

/** How well one ref's evidence supports a claim: shared content words, and the share of the claim's words covered. */
export function support(claim: Set<string>, evidence: Set<string>): { overlap: number; coverage: number; score: number } {
  let overlap = 0;
  for (const w of claim) if (evidence.has(w)) overlap++;
  const coverage = claim.size ? overlap / claim.size : 0;
  return { overlap, coverage, score: overlap + coverage * 4 };
}

/** The supported rule: two shared content words covering a fifth of the claim, or four shared words, or (a very short
 *  claim, e.g. a list item's label) one. */
export function isSupported(s: { overlap: number; coverage: number }, claimSize: number): boolean {
  if (claimSize <= 2) return s.overlap >= 1;
  return (s.overlap >= 2 && s.coverage >= 0.2) || s.overlap >= 4;
}

/** The sentence a citation at `at` is attached to: from the last sentence end before it (on its line), widened to the
 *  previous sentence when that is very short (a citation after "It does." still needs the claim). */
export function claimBefore(text: string, at: number): string {
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  let before = text.slice(lineStart, at).replace(REF_GROUP, " ");
  // a citation written after the full stop ("… replicas. [[s2]]") belongs to the sentence before it
  before = before.replace(/\s+$/, "");
  const parts = before.split(/(?<=[.!?:;])\s+(?=[A-Z0-9"'*_(`])/);
  let claim = parts.pop() ?? "";
  while (parts.length && contentWords(claim).length < 4) claim = `${parts.pop()} ${claim}`;
  // a list item or table cell with its marker off
  return claim.replace(/^\s*(?:[-*+]|\d+[.)]|\|)\s*/, "").trim();
}

/**
 * Check every citation in `answer`. `evidence`: ref → everything the model was shown for it this request (refs it may
 * cite but holds no text for are unverifiable and kept). `allowed` (optional): the refs the answer may cite at all
 * (cleanAnswer already removed the rest; refs outside it are dropped here too).
 */
export function checkCitations(answer: string, evidence: Evidence, allowed?: (ref: string) => boolean): CiteResult {
  const stats: CiteStats = { total: 0, ok: 0, fixed: 0, dropped: 0, unverifiable: 0 };
  const details: CiteDetail[] = [];
  const ev = new Map<string, Set<string>>();
  for (const [ref, t] of Object.entries(evidence)) if (t && t.trim()) ev.set(ref.toLowerCase(), new Set(contentWords(t)));
  const text = answer.replace(REF_GROUP, (m: string, list: string, at: number) => {
    const claimText = claimBefore(answer, at);
    const claim = new Set(contentWords(claimText));
    const keep: string[] = [];
    for (const r0 of list.split(",")) {
      const ref = r0.trim().toLowerCase();
      stats.total++;
      if (allowed && !allowed(ref)) {
        stats.dropped++;
        details.push({ ref, verdict: "dropped", score: 0, claim: claimText });
        continue;
      }
      const mine = ev.get(ref);
      // nothing to check against, or nothing to check (a citation on a bare heading): kept
      if (!mine || claim.size === 0) {
        stats.unverifiable++;
        details.push({ ref, verdict: "unverifiable", score: 0, claim: claimText });
        keep.push(ref);
        continue;
      }
      const s = support(claim, mine);
      const group = list.split(",").map((x) => x.trim().toLowerCase());
      // the best other retrieved ref for this claim (one already in this citation's group doesn't count)
      let best: { ref: string; s: ReturnType<typeof support> } | null = null;
      for (const [r, words] of ev) {
        if (r === ref || group.includes(r) || (allowed && !allowed(r))) continue;
        const o = support(claim, words);
        if (isSupported(o, claim.size) && (!best || o.score > best.s.score)) best = { ref: r, s: o };
      }
      if (isSupported(s, claim.size)) {
        // supported, but only just, while another retrieved source is plainly the one this sentence comes from: swap
        if (best && best.s.overlap >= s.overlap + 3 && best.s.coverage >= 2 * s.coverage) {
          stats.fixed++;
          details.push({ ref, verdict: "fixed", to: best.ref, score: s.score, claim: claimText });
          keep.push(best.ref);
        } else {
          stats.ok++;
          details.push({ ref, verdict: "ok", score: s.score, claim: claimText });
          keep.push(ref);
        }
        continue;
      }
      if (best && best.s.overlap > s.overlap) {
        stats.fixed++;
        details.push({ ref, verdict: "fixed", to: best.ref, score: s.score, claim: claimText });
        keep.push(best.ref);
      } else {
        stats.dropped++;
        details.push({ ref, verdict: "dropped", score: s.score, claim: claimText });
      }
    }
    const uniq = [...new Set(keep)];
    return uniq.length ? `[[${uniq.join(", ")}]]` : "";
  });
  return {
    text: text
      .replace(/[ \t]+([.,;:!?])/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
    stats,
    details,
  };
}

/** The metering row's counts (ai_calls.meta.cites): n checked, ok, fixed, dropped, unverifiable. Never text. */
export const citeMeta = (s: CiteStats) => (s.total ? { n: s.total, ok: s.ok, fixed: s.fixed, dropped: s.dropped, unv: s.unverifiable } : null);

/**
 * Evidence from a tool result or a context block the model read: "sN | kind | title | where | what" lines (search,
 * listings, page context), "<course_text ref="sN">…</course_text>" bodies (get_item) and "[sN] kind · title\ntext"
 * passages (the DSA chat). Lines that follow a ref line, up to a blank line, go with it (a guide topic's text).
 */
export function evidenceFrom(text: string, into: Map<string, string> = new Map()): Map<string, string> {
  const add = (ref: string, t: string) => {
    const r = ref.toLowerCase();
    const prev = into.get(r) ?? "";
    if (prev.length < 16_000) into.set(r, `${prev}\n${t}`.slice(0, 16_000));
  };
  for (const m of text.matchAll(/<course_text ref="(s\d{1,4})">([\s\S]*?)<\/course_text>/gi)) add(m[1], m[2]);
  const stripped = text.replace(/<course_text ref="s\d{1,4}">[\s\S]*?<\/course_text>/gi, "");
  let cur: string | null = null;
  for (const line of stripped.split("\n")) {
    const m = /^\s*(?:\[(s\d{1,4})\]|(s\d{1,4})\s*\|)\s*(.*)$/i.exec(line);
    if (m) {
      cur = (m[1] || m[2]).toLowerCase();
      add(cur, m[3]);
    } else if (!line.trim()) cur = null;
    else if (cur) add(cur, line);
  }
  return into;
}
