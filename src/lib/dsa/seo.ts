/**
 * Page descriptions for DSA Mastery's search and share cards (og:description falls back to the site's root bio when a page has none).
 */
const LANGS = "Solve in Python, Java, C++ or JavaScript.";

const plain = (html: string) =>
  html
    .replace(/<(script|style|pre)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** The first sentence of a text, cut at a word if it runs long. */
export function firstSentence(text: string, max = 170): string {
  const t = text.trim();
  const m = /^(.+?[.!?])(?:\s|$)/.exec(t);
  let s = m ? m[1] : t;
  if (s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "") + "…";
  return s;
}

/** A problem's description: the first sentence of its statement, then the languages. */
export function problemDescription(title: string, sections: { html: string }[]): string {
  const first = sections.map((s) => plain(s.html)).find((t) => t.length > 20) || "";
  const lead = first ? firstSentence(first) : `${title}: a DSA Mastery practice problem.`;
  return `${lead} ${LANGS}`;
}

/** A lesson's description: its summary, or a plain line when it has none. */
export function lessonDescription(title: string, summary?: string | null): string {
  const s = (summary || "").trim();
  return s || `${title}: a DSA Mastery lesson with worked examples, practice problems and a checkpoint quiz. ${LANGS}`;
}
