/**
 * Interview-night revision cards, authored as markdown in the content repo
 * (resources/revision/week-XX.md; the format is documented in resources/revision/README.md).
 *
 * Pure and dependency-free on purpose: the site parses with it and so does the content validator
 * (scripts/validate-revision.mjs runs this file directly with Node's type stripping), so what the
 * validator accepts is exactly what the site shows.
 *
 *   ---
 *   week: week-01-data-at-scale
 *   ---
 *   # day-01-partitioning-deep-dive          one section per lesson (the lesson file's slug)
 *   ## idea: Title                           one sentence
 *   ## numbers                               "- value | what it means" list
 *   ## tradeoff: A vs B                      a markdown table (header row = the options)
 *   ## mistakes                              "- mistake" list
 *   ## ask: Question the interviewer asks    the answer to say
 */

export type RevCardKind = "idea" | "numbers" | "tradeoff" | "mistakes" | "ask";

type Base = { id: string; title: string };
export type RevIdea = Base & { kind: "idea"; text: string };
export type RevNumbers = Base & { kind: "numbers"; items: { value: string; label: string }[] };
export type RevTradeoff = Base & { kind: "tradeoff"; head: string[]; rows: string[][]; note: string };
export type RevMistakes = Base & { kind: "mistakes"; items: string[] };
export type RevAsk = Base & { kind: "ask"; text: string };
export type RevCard = RevIdea | RevNumbers | RevTradeoff | RevMistakes | RevAsk;

export type RevLesson = { slug: string; cards: RevCard[] };
export type RevWeek = { week: string; lessons: RevLesson[] };

export type RevIssue = { line: number; level: "error" | "warn"; msg: string };

export const REV_KINDS: RevCardKind[] = ["idea", "numbers", "tradeoff", "mistakes", "ask"];
export const REV_MAX_WORDS = 40;
export const REV_MIN_CARDS = 6;
export const REV_MAX_CARDS = 10;

const DEFAULT_TITLE: Partial<Record<RevCardKind, string>> = { numbers: "Numbers to remember", mistakes: "Classic mistakes" };

/** Words a reader sees on a card (markdown marks and table pipes don't count). */
export function cardWords(c: RevCard): number {
  const count = (s: string) => s.replace(/[*`_|]/g, " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const title = c.title === DEFAULT_TITLE[c.kind] ? 0 : count(c.title);
  switch (c.kind) {
    case "idea":
    case "ask":
      return title + count(c.text);
    case "numbers":
      return title + c.items.reduce((a, i) => a + count(i.value) + count(i.label), 0);
    case "mistakes":
      return title + c.items.reduce((a, i) => a + count(i), 0);
    case "tradeoff":
      return title + [...c.head, ...c.rows.flat()].reduce((a, s) => a + count(s), 0) + count(c.note);
  }
}

const EMOJI = /\p{Extended_Pictographic}/u;
const splitRow = (l: string) =>
  l
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((s) => s.trim().replace(/\\\|/g, "|"));

export function parseRevision(src: string): { week: RevWeek | null; issues: RevIssue[] } {
  const issues: RevIssue[] = [];
  const lines = src.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, "")).split("\n");
  let i = 0;
  let week = "";
  if (lines[0]?.trim() === "---") {
    i = 1;
    for (; i < lines.length && lines[i].trim() !== "---"; i++) {
      const m = lines[i].match(/^\s*week\s*:\s*["']?([\w-]+)["']?\s*$/);
      if (m) week = m[1];
    }
    i++;
  }
  if (!week) issues.push({ line: 1, level: "error", msg: "front matter needs `week: week-XX-…` (the week folder name)" });

  const lessons: RevLesson[] = [];
  let lesson: RevLesson | null = null;
  type Open = { kind: RevCardKind; title: string; line: number; body: { text: string; line: number }[] };
  let card: Open | null = null;
  const counters = new Map<string, number>();

  const close = () => {
    if (!card || !lesson) return;
    const c = card;
    card = null;
    const n = (counters.get(`${lesson.slug}:${c.kind}`) || 0) + 1;
    counters.set(`${lesson.slug}:${c.kind}`, n);
    const id = `${c.kind}-${n}`;
    const body = c.body.filter((b) => b.text.trim() !== "");
    const err = (msg: string, line = c.line) => issues.push({ line, level: "error", msg: `${lesson!.slug} · ${c.kind}: ${msg}` });
    const title = c.title || DEFAULT_TITLE[c.kind] || "";
    if (!title) return err("needs a title (`## " + c.kind + ": …`)");
    let out: RevCard | null = null;
    const listItems = () => {
      const items: { text: string; line: number }[] = [];
      for (const b of body) {
        const m = b.text.match(/^\s*[-*]\s+(.*)$/);
        if (m) items.push({ text: m[1].trim(), line: b.line });
        else if (items.length && /^\s{2,}\S/.test(b.text)) items[items.length - 1].text += " " + b.text.trim();
        else err(`expected a "- " list item, got "${b.text.trim().slice(0, 40)}"`, b.line);
      }
      return items;
    };
    if (c.kind === "idea" || c.kind === "ask") {
      const text = body.map((b) => b.text.trim()).join(" ");
      if (!text) return err("is empty");
      out = { id, kind: c.kind, title, text };
    } else if (c.kind === "numbers") {
      const items = listItems().map((it) => {
        const k = it.text.indexOf(" | ");
        if (k < 0) {
          err('each item is "- value | what it means"', it.line);
          return { value: it.text, label: "" };
        }
        return { value: it.text.slice(0, k).trim(), label: it.text.slice(k + 3).trim() };
      });
      if (!items.length) return err("has no items");
      out = { id, kind: "numbers", title, items };
    } else if (c.kind === "mistakes") {
      const items = listItems().map((it) => it.text);
      if (!items.length) return err("has no items");
      out = { id, kind: "mistakes", title, items };
    } else {
      const table = body.filter((b) => b.text.trim().startsWith("|"));
      const note = body
        .filter((b) => !b.text.trim().startsWith("|"))
        .map((b) => b.text.trim())
        .join(" ");
      if (table.length < 3) return err("needs a markdown table: header row, |---| row, at least one row");
      const head = splitRow(table[0].text);
      if (!/^[\s|:-]+$/.test(table[1].text)) err("second table row must be the |---|---| separator", table[1].line);
      const rows = table.slice(2).map((r) => {
        const cells = splitRow(r.text);
        if (cells.length !== head.length) err(`row has ${cells.length} cells, header has ${head.length}`, r.line);
        return head.map((_, k) => cells[k] ?? "");
      });
      if (head.length < 2) err("table needs at least two columns");
      out = { id, kind: "tradeoff", title, head, rows, note };
    }
    if (!out) return;
    lesson.cards.push(out);
    const words = cardWords(out);
    if (words > REV_MAX_WORDS) issues.push({ line: c.line, level: "error", msg: `${lesson.slug} · ${c.kind} "${title.slice(0, 40)}": ${words} words (max ${REV_MAX_WORDS})` });
  };

  for (; i < lines.length; i++) {
    const raw = lines[i];
    const ln = i + 1;
    if (EMOJI.test(raw)) issues.push({ line: ln, level: "error", msg: "no emoji in revision cards" });
    const h1 = raw.match(/^#\s+(\S.*?)\s*$/);
    if (h1) {
      close();
      const slug = h1[1].trim();
      if (!/^[\w-]+$/.test(slug)) issues.push({ line: ln, level: "error", msg: `"# ${slug}": a lesson heading is the lesson's file name without .md` });
      if (lessons.some((l) => l.slug === slug)) issues.push({ line: ln, level: "error", msg: `lesson ${slug} appears twice` });
      lesson = { slug, cards: [] };
      lessons.push(lesson);
      continue;
    }
    const h2 = raw.match(/^##\s+([a-z]+)\s*(?::\s*(.*?))?\s*$/i);
    if (h2 || /^##\s/.test(raw)) {
      close();
      const kind = (h2?.[1] || "").toLowerCase() as RevCardKind;
      if (!lesson) {
        issues.push({ line: ln, level: "error", msg: "card before the first `# lesson-slug` heading" });
        continue;
      }
      if (!REV_KINDS.includes(kind)) {
        issues.push({ line: ln, level: "error", msg: `unknown card "${raw.trim()}" (use ${REV_KINDS.join(", ")})` });
        continue;
      }
      card = { kind, title: (h2?.[2] || "").trim(), line: ln, body: [] };
      continue;
    }
    if (card) (card as Open).body.push({ text: raw, line: ln });
    else if (raw.trim()) issues.push({ line: ln, level: "warn", msg: `text outside a card is ignored: "${raw.trim().slice(0, 40)}"` });
  }
  close();

  for (const l of lessons) {
    const n = l.cards.length;
    const has = (k: RevCardKind) => l.cards.filter((c) => c.kind === k).length;
    if (n < REV_MIN_CARDS || n > REV_MAX_CARDS) issues.push({ line: 0, level: "warn", msg: `${l.slug}: ${n} cards (aim for ${REV_MIN_CARDS}–${REV_MAX_CARDS})` });
    if (has("idea") < 2) issues.push({ line: 0, level: "warn", msg: `${l.slug}: fewer than 2 key ideas` });
    for (const k of ["numbers", "tradeoff", "mistakes", "ask"] as RevCardKind[]) if (!has(k)) issues.push({ line: 0, level: "warn", msg: `${l.slug}: no ${k} card` });
  }

  return { week: week ? { week, lessons } : null, issues };
}

/** Plain text for one inline run: `code` and **bold** are the only marks the cards use. */
export type InlinePart = { t: string; b?: boolean; c?: boolean };

export function inline(s: string): InlinePart[] {
  const out: InlinePart[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push({ t: s.slice(last, m.index) });
    if (m[2] !== undefined) out.push({ t: m[2], b: true });
    else out.push({ t: m[3], c: true });
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push({ t: s.slice(last) });
  return out;
}

export const plain = (s: string) => inline(s).map((p) => p.t).join("");
