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

/** Score every section against a query (rarer shared words count more; a section holding `selection` wins). */
export function scoreSections(sections: Section[], query: string, selection = ""): (s: Section) => number {
  const q = words(`${query} ${selection} ${selection}`);
  const df = new Map<string, number>();
  for (const s of sections) for (const w of new Set(words(`${s.heading} ${s.text}`))) df.set(w, (df.get(w) ?? 0) + 1);
  const n = Math.max(1, sections.length);
  return (s: Section) => {
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
}

export function lessonContext(md: string, question: string, selection = "", budget = 14000): string {
  const sections = splitSections(md);
  const q = words(`${question} ${selection} ${selection}`);
  if (!q.length) return md.slice(0, budget);
  const score = scoreSections(sections, question, selection);
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

/** A section's prose: fenced code (implementations, diagrams) dropped, which is not what notes are checked against. */
const prose = (t: string) => t.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();

/**
 * The lesson context for checking a page of notes: notes cover several topics, so instead of one query (which a long
 * lesson dilutes) each topic of the notes (a heading and its lines, or a few lines) finds its own section: the lesson
 * section whose heading it names ("Write-through" → "2.3 Pattern 3: Write-Through"), else the best-scoring one. Then
 * the best sections for the notes as a whole, up to `budget` characters of prose, in lesson order, after the outline.
 */
export function notesLessonContext(md: string, notes: string, budget = 14000): { text: string; sections: string[]; texts: Record<string, string> } {
  const sections = splitSections(md);
  const norm = (s: string) => words(s).join(" ");
  // the notes' topics: a heading and the lines under it, in groups of at most 4 lines (each group keeps its heading)
  const lines = notes.split("\n").filter((l) => l.trim());
  const chunks: { head: string; text: string; n: number; first: boolean }[] = [];
  let head = "";
  for (const l of lines) {
    const h = l.match(/^#{1,4}\s+(.+)$/);
    if (h) {
      head = h[1];
      chunks.push({ head, text: "", n: 0, first: true });
      continue;
    }
    const last = chunks[chunks.length - 1];
    if (!last || last.n >= 4) chunks.push({ head, text: l, n: 1, first: false });
    else {
      last.text += `\n${l}`;
      last.n++;
    }
  }
  // priority: sections a note heading names, then each topic's best section, then the best for the notes as a whole
  const byHead: Section[] = [];
  const byTopic: Section[] = [];
  for (const c of chunks) {
    const hn = norm(c.head);
    if (hn && c.first) {
      // a heading the lesson also has (every word of the note's heading in the lesson's heading)
      const s = sections.find((x) => {
        const sh = ` ${norm(x.heading)} `;
        return hn.split(" ").every((w) => sh.includes(` ${w} `));
      });
      if (s) byHead.push(s);
    }
    const score = scoreSections(sections, `${c.head} ${c.head} ${c.text}`);
    const best = [...sections].sort((a, b) => score(b) - score(a))[0];
    if (best && score(best) > 0) byTopic.push(best);
  }
  const whole = scoreSections(sections, notes);
  const byWhole = [...sections].sort((a, b) => whole(b) - whole(a)).slice(0, 5).filter((s) => whole(s) > 0);
  const order = [...new Set([...byHead, ...byTopic, ...byWhole])];
  const picked: Section[] = [];
  let used = 0;
  for (const s of order) {
    const t = prose(s.text).slice(0, 2200);
    if (!t || (used + t.length > budget && picked.length)) continue;
    picked.push({ ...s, text: t });
    used += t.length;
  }
  picked.sort((a, b) => a.index - b.index);
  const outline = sections.map((s) => `- ${s.heading}`).join("\n");
  return {
    text: `Lesson outline (all sections):\n${outline}\n\nThe sections these notes are about:\n\n${picked.map((s) => `## ${s.heading}\n${s.text}`).join("\n\n")}`,
    sections: picked.map((s) => s.heading),
    texts: Object.fromEntries(picked.map((s) => [s.heading, s.text])),
  };
}
