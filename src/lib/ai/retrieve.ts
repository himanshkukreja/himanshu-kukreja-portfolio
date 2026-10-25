/**
 * Lesson Q&A context: instead of sending the whole lesson with every question (~5 cents), send the
 * lesson's outline plus the few sections that match the question and the selected text (~1 cent).
 * Sections are split on markdown headings; each is scored by how many of the question's words it
 * contains (rarer words count more), and the best ones are kept up to a character budget, in lesson order.
 */
type Section = { heading: string; text: string; index: number };

const STOP = new Set("the a an and or of to in on for is are was were be it this that with as at by from how what why when which who does do did can could should would i you we they my your our their about into not no yes if then than so".split(" "));
// code counts: in many lessons the idea lives in the example (e.g. jittered TTLs)
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    // fold simple plurals so "TTLs" matches "TTL" and "keys" matches "key"
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));

export function splitSections(md: string): Section[] {
  const out: Section[] = [];
  let heading = "Introduction";
  let buf: string[] = [];
  let inCode = false;
  let prevBlank = true;
  for (const line of md.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    // a heading needs a blank line before it: code comments ("# 5 minutes later") don't have one
    const m = !inCode && prevBlank && line.match(/^#{1,4}\s+(.+)$/);
    prevBlank = !line.trim();
    if (m) {
      if (buf.join("").trim()) out.push({ heading, text: buf.join("\n").trim(), index: out.length });
      heading = m[1].replace(/[*_`]/g, "").trim();
      buf = [];
    } else buf.push(line);
  }
  if (buf.join("").trim()) out.push({ heading, text: buf.join("\n").trim(), index: out.length });
  return out;
}

export function lessonContext(md: string, question: string, selection = "", budget = 14000): string {
  const sections = splitSections(md);
  const q = words(`${question} ${selection} ${selection}`);
  if (!q.length) return md.slice(0, budget);
  const df = new Map<string, number>();
  for (const s of sections) for (const w of new Set(words(`${s.heading} ${s.text}`))) df.set(w, (df.get(w) ?? 0) + 1);
  const n = Math.max(1, sections.length);
  const score = (s: Section) => {
    const ws = words(`${s.heading} ${s.heading} ${s.text}`);
    const counts = new Map<string, number>();
    for (const w of ws) counts.set(w, (counts.get(w) ?? 0) + 1);
    let sc = 0;
    for (const w of new Set(q)) {
      const c = counts.get(w);
      if (c) sc += (1 + Math.log(c)) * Math.log(1 + n / (df.get(w) ?? 1));
    }
    // the section that contains the selection wins outright
    if (selection && s.text.includes(selection.slice(0, 80))) sc += 1000;
    return sc / Math.sqrt(1 + ws.length / 400);
  };
  const ranked = [...sections].sort((a, b) => score(b) - score(a));
  const picked: Section[] = [];
  let used = 0;
  for (const s of ranked) {
    if (score(s) <= 0 && picked.length) break;
    const t = s.text.slice(0, 4000); // breadth over depth: a short exact section beats the tail of a long one
    if (used + t.length > budget && picked.length) continue;
    picked.push({ ...s, text: t });
    used += t.length;
    if (used > budget * 0.9) break;
  }
  picked.sort((a, b) => a.index - b.index);
  const outline = sections.map((s) => `- ${s.heading}`).join("\n");
  return `Lesson outline (all sections):\n${outline}\n\nThe sections most relevant to the question:\n\n${picked.map((s) => `## ${s.heading}\n${s.text}`).join("\n\n")}`;
}
