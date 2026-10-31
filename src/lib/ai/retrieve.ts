/**
 * Lesson Q&A context: instead of sending the whole lesson with every question (~5 cents), send the
 * lesson's outline plus the few sections that match the question and the selected text (~1 cent).
 * Sections are split on markdown headings; each is scored by how many of the question's words it
 * contains (rarer words count more), and the best ones are kept up to a character budget, in lesson order.
 */
/** `parent`: the nearest heading above it of a higher level (empty at the top), to tell same-named sections apart;
 *  `level`: its heading's level (1-4, "#" to "####"; 0 for the text before the first heading) */
type Section = { heading: string; text: string; index: number; parent?: string; level?: number };

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
  let parent = "";
  let level = 0;
  let buf: string[] = [];
  let inCode = false;
  let prevBlank = true;
  // the open heading at each level (1-4), for each section's parent
  const open: string[] = [];
  for (const line of md.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    // a heading needs a blank line before it: code comments ("# 5 minutes later") don't have one
    const m = !inCode && prevBlank && line.match(/^(#{1,4})\s+(.+)$/);
    prevBlank = !line.trim();
    if (m) {
      if (buf.join("").trim()) out.push({ heading, text: buf.join("\n").trim(), index: out.length, parent, level });
      heading = m[2].replace(/[*_`]/g, "").trim();
      level = m[1].length;
      open.length = level - 1;
      parent = [...open].reverse().find(Boolean) ?? "";
      open[level - 1] = heading;
      buf = [];
    } else buf.push(line);
  }
  if (buf.join("").trim()) out.push({ heading, text: buf.join("\n").trim(), index: out.length, parent, level });
  return out;
}

/** Every heading down to `maxLevel` ("#" = 1), in order, by the same rules as splitSections (none in code; a blank
 *  line before it), including the ones with no text of their own ("# Part I" right before "## Chapter 1"). */
export function headingOutline(md: string, maxLevel = 3): { level: number; heading: string }[] {
  const out: { level: number; heading: string }[] = [];
  let inCode = false;
  let prevBlank = true;
  for (const line of md.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    const m = !inCode && prevBlank && line.match(/^(#{1,4})\s+(.+)$/);
    prevBlank = !line.trim();
    if (m && m[1].length <= maxLevel) out.push({ level: m[1].length, heading: m[2].replace(/[*_`]/g, "").trim() });
  }
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
 * A long section cut to `cap` characters around what the notes say: its paragraphs ranked by the note words they hold
 * (rarer words count more), the best kept in lesson order, "…" where paragraphs were left out. A section that fits is
 * kept whole. So a note on "W + R > N" brings the paragraph with the quorum rule, not just the section's first lines.
 */
function excerpt(text: string, queries: string[], cap: number): string {
  if (text.length <= cap) return text;
  const blocks = text.split(/\n{2,}/).map((t, i) => ({ t: t.trim(), i })).filter((b) => b.t);
  const q = new Set(queries.flatMap((x) => words(x)));
  const df = new Map<string, number>();
  for (const b of blocks) for (const w of new Set(words(b.t))) if (q.has(w)) df.set(w, (df.get(w) ?? 0) + 1);
  const score = (b: { t: string; i: number }) => {
    let sc = 0;
    for (const w of new Set(words(b.t))) if (q.has(w)) sc += Math.log(1 + blocks.length / (df.get(w) ?? 1));
    // the opening paragraph usually says what the section is: a small head start
    return sc + (b.i === 0 ? 0.5 : 0);
  };
  const ranked = [...blocks].sort((a, b) => score(b) - score(a) || a.i - b.i);
  const keep: { t: string; i: number }[] = [];
  let used = 0;
  for (const b of ranked) {
    const t = b.t.length > cap ? `${b.t.slice(0, cap - used - 2)}…` : b.t;
    if (used + t.length + 2 > cap) {
      if (!keep.length) keep.push({ t: b.t.slice(0, cap - 1) + "…", i: b.i });
      continue;
    }
    keep.push({ t, i: b.i });
    used += t.length + 2;
  }
  keep.sort((a, b) => a.i - b.i);
  return keep.map((b, k) => (k && b.i !== keep[k - 1].i + 1 ? `…\n\n${b.t}` : b.t)).join("\n\n");
}

/**
 * The lesson context for checking a page of notes. Notes jump between topics, line by line ("quorum: W + R > N",
 * then "split brain → fencing token"), so one query for the whole page (which a long lesson dilutes) misses sections,
 * and the check then calls a point "not in this lesson" that the lesson covers. So every topic of the notes finds its
 * own section, in this order of priority:
 *   1. a section a note heading names ("Write-through" → "2.3 Pattern 3: Write-Through"),
 *   2. each note line's best section by its key words (rarer words count more; the line's heading helps),
 *   3. a line's close second (70% of its best score), then the best sections for the notes as a whole, while the
 *      budget lasts.
 * The sections of 1 and 2 share the budget (each gets an equal share, 700-2,200 characters), cut around the
 * paragraphs their notes are about (excerpt); then 3 fills what is left, at most a share each. Prose only (code isn't what notes are
 * checked against), in lesson order, after the outline.
 */
export function notesLessonContext(md: string, notes: string, budget = 14000): { text: string; sections: string[]; texts: Record<string, string>; outline: string[] } {
  // same-named sections ("How It Works" under each architecture) are told apart by their parent, so the check can
  // name the one it means and its quote is looked up in the right text
  const raw = splitSections(md);
  const count = new Map<string, number>();
  for (const s of raw) count.set(s.heading, (count.get(s.heading) ?? 0) + 1);
  const seen = new Map<string, number>();
  const all = raw.map((s) => {
    let heading = (count.get(s.heading) ?? 0) > 1 && s.parent ? `${s.heading} (${s.parent})` : s.heading;
    const n = (seen.get(heading) ?? 0) + 1;
    seen.set(heading, n);
    if (n > 1) heading = `${heading} #${n}`;
    return { ...s, heading };
  });
  // what can be shown: a section's prose (a section that is only code has none)
  const sections = all.map((s) => ({ ...s, text: prose(s.text) })).filter((s) => s.text);
  const norm = (s: string) => words(s).join(" ");
  // the notes, line by line, each with the heading it sits under
  const lines: { head: string; text: string; isHead: boolean }[] = [];
  let head = "";
  for (const raw of notes.split("\n")) {
    const l = raw.trim();
    if (!l || /^(?:>\s*)?(?:—|--)\s*from\b/i.test(l)) continue;
    const h = l.match(/^#{1,4}\s+(.+)$/);
    if (h) {
      head = h[1];
      lines.push({ head, text: "", isHead: true });
      continue;
    }
    const text = l.replace(/^(?:[-*•>]|\d+[.)])\s*/, "").replace(/\*\*|__|`/g, "");
    if (words(text).length) lines.push({ head, text, isHead: false });
  }
  // the lesson's own phrases: "read-your-writes", "split brain", "hits / (hits + misses)", "10-30 s" name a section far
  // better than their single words do, so a section holding a phrase of the line (2-3 words in a row) gets a bonus
  const flat = (t: string) => ` ${t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  const flatHead = new Map(sections.map((s) => [s.index, flat(s.heading)]));
  const flatText = new Map(sections.map((s) => [s.index, flat(s.text)]));
  const edge = (w: string) => /^\d+$/.test(w) || (w.length > 2 && !STOP.has(w));
  const phrases = (t: string) => {
    const tok = flat(t).trim().split(" ").filter(Boolean);
    const out = new Set<string>();
    for (let n = 2; n <= 3; n++)
      for (let i = 0; i + n <= tok.length; i++) {
        const g = tok.slice(i, i + n);
        if (edge(g[0]) && edge(g[n - 1]) && g.join("").length >= (/\d/.test(g.join("")) ? 4 : 5)) out.add(` ${g.join(" ")} `);
      }
    return [...out];
  };
  const phraseBonus = (s: { index: number }, ps: string[]) => {
    let b = 0;
    const h = flatHead.get(s.index) ?? "";
    const t = flatText.get(s.index) ?? "";
    for (const p of ps) {
      if (h.includes(p)) b += 5;
      const c = t.split(p).length - 1;
      // a number phrase ("10 30" for "10-30 s") is the most specific of all
      if (c) b += Math.min(3, c) * (/\d/.test(p) ? 4 : 1.5);
    }
    return b;
  };
  const pulls = new Map<number, string[]>(); // section index → the note text that pulled it in
  const pull = (s: { index: number }, why: string) => pulls.set(s.index, [...(pulls.get(s.index) ?? []), why]);
  const byHead: number[] = [];
  const byLine: number[] = [];
  // a close second for a line (a short section named for it often loses to a long one that mentions it often)
  const second: number[] = [];
  const score = (q: string) => scoreSections(sections, q);
  let headSection: { index: number } | null = null;
  for (const l of lines) {
    if (l.isHead) {
      headSection = null;
      const hn = norm(l.head);
      // a heading the lesson also has (every word of the note's heading in the lesson's heading)
      const s = hn && sections.find((x) => {
        const sh = ` ${norm(x.heading)} `;
        return hn.split(" ").every((w) => sh.includes(` ${w} `));
      });
      if (s) {
        byHead.push(s.index);
        pull(s, l.head);
        headSection = s;
      }
      continue;
    }
    // a line under a heading the lesson has is about that section too (its excerpt follows the line)
    if (headSection) pull(headSection, l.text);
    // the line counts twice, its heading once: "Write-back / - risk: data loss" is about write-back's risk
    const base = score(`${l.head} ${l.text} ${l.text}`);
    const ps = phrases(l.text);
    const sc = (x: { index: number; heading: string; text: string }) => base(x) + phraseBonus(x, ps);
    const [best, next] = [...sections].sort((a, b) => sc(b) - sc(a));
    if (best && sc(best) > 0) {
      byLine.push(best.index);
      pull(best, `${l.head} ${l.text}`);
      if (next && sc(next) >= sc(best) * 0.7) {
        second.push(next.index);
        pull(next, `${l.head} ${l.text}`);
      }
    }
  }
  const whole = score(notes);
  const byWhole = [...sections]
    .sort((a, b) => whole(b) - whole(a))
    .slice(0, 5)
    .filter((s) => whole(s) > 0)
    .map((s) => s.index);
  const need = [...new Set([...byHead, ...byLine])];
  const share = Math.max(700, Math.min(2200, Math.floor((budget * 0.9) / Math.max(1, need.length))));
  const byIndex = new Map(sections.map((s) => [s.index, s]));
  const picked: Section[] = [];
  let used = 0;
  const rest = [...new Set([...second, ...byWhole])].filter((i) => !need.includes(i));
  for (const [k, idx] of [...need.map((i) => [0, i] as const), ...rest.map((i) => [1, i] as const)]) {
    const s = byIndex.get(idx)!;
    const t = excerpt(s.text, pulls.get(idx) ?? [notes], k === 0 ? share : Math.min(share, 2200));
    if (used + t.length > budget && picked.length) continue;
    picked.push({ ...s, text: t });
    used += t.length;
  }
  picked.sort((a, b) => a.index - b.index);
  const outline = all.map((s) => `- ${s.heading}`).join("\n");
  return {
    text: `Lesson outline (all sections):\n${outline}\n\nThe sections these notes are about:\n\n${picked.map((s) => `## ${s.heading}\n${s.text}`).join("\n\n")}`,
    sections: picked.map((s) => s.heading),
    texts: Object.fromEntries(picked.map((s) => [s.heading, s.text])),
    outline: all.map((s) => s.heading),
  };
}
