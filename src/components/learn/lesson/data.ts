/**
 * Server-side helpers for the lesson page: labels, the continuous week rail, up-next teasers and
 * the trial part that belongs to a day. Pure functions over LearningResource + markdown.
 */
import { formatWeekTopic, titleFromMarkdown, type LearningResource } from "@/lib/github";
import type { RenderedLesson } from "@/lib/course/types";
import type { RailEntry, RailWeek, ReaderStat, TrialPartLink } from "./types";

export const weekNumber = (week: string): number | null => {
  const m = week.match(/^week-(\d+)/);
  return m ? parseInt(m[1], 10) : null;
};

export const weekCode = (week: string) => {
  const n = weekNumber(week);
  if (n !== null) return `W${String(n).padStart(2, "0")}`;
  if (week === "bonus-problems") return "BONUS";
  return "PLAN";
};

export const weekLabel = (week: string) => {
  const n = weekNumber(week);
  if (n !== null) return `Week ${String(n).padStart(2, "0")}`;
  if (week === "bonus-problems") return "Bonus problems";
  return "Overview";
};

export const weekTopic = (week: string) => formatWeekTopic(week);

const pad = (n: string | number) => String(n).padStart(2, "0");

const partNumber = (slug: string) => slug.match(/part-(\d+)/)?.[1] ?? null;
const dayNumber = (r: LearningResource) => r.day?.match(/day-(\d+)/)?.[1] ?? r.slug.match(/^day-(\d+)/)?.[1] ?? null;
const bonusNumber = (slug: string) => slug.match(/^bonus-(\d+)/)?.[1] ?? null;

/** Kind badge in the hero, e.g. "DAY LESSON · 03". */
export function kindBadge(r: LearningResource): string {
  switch (r.type) {
    case "day-content": {
      const d = dayNumber(r);
      return d ? `DAY LESSON · ${pad(d)}` : "LESSON";
    }
    case "capstone":
      return "BOSS · CAPSTONE";
    case "week-preview":
      return "WEEK PREVIEW";
    case "foundations": {
      const p = partNumber(r.slug);
      return p ? `FOUNDATIONS · PART ${pad(p)}` : "FOUNDATIONS";
    }
    case "bonus": {
      const b = bonusNumber(r.slug);
      return b ? `SIDE QUEST · ${pad(b)}` : "SIDE QUEST";
    }
    case "overview":
      return "COURSE PLAN";
    case "mcq":
      return "TRIAL";
  }
}

/** Short position label: "Day 03", "Part 02", "Boss", "Preview". */
export function shortLabel(r: LearningResource): string {
  switch (r.type) {
    case "day-content": {
      const d = dayNumber(r);
      return d ? `Day ${pad(d)}` : "Lesson";
    }
    case "capstone":
      return "Boss";
    case "week-preview":
      return "Preview";
    case "foundations": {
      const p = partNumber(r.slug);
      return p ? `Part ${pad(p)}` : "Foundations";
    }
    case "bonus": {
      const b = bonusNumber(r.slug);
      return b ? `Side quest ${pad(b)}` : "Side quest";
    }
    case "overview":
      return "Plan";
    case "mcq":
      return "Trial";
  }
}

/** Rail row label: "D3 · Circuit Breakers", "Boss · …", "P2 · …". */
export function railLabel(r: LearningResource, title: string): string {
  switch (r.type) {
    case "day-content": {
      const d = dayNumber(r);
      return d ? `D${parseInt(d, 10)} · ${title}` : title;
    }
    case "capstone":
      return `Boss · ${title}`;
    case "week-preview":
      return "Preview";
    case "foundations": {
      const p = partNumber(r.slug);
      return p ? `P${parseInt(p, 10)} · ${title.replace(/^Part \d+:\s*/, "")}` : title;
    }
    case "mcq":
      return "Trial";
    default:
      return title;
  }
}

/** Clean lesson title: renderer title (or H1) without the "Week N — Day N:" prefix. */
export function cleanTitle(rendered: RenderedLesson | null, fallback: string): string {
  const raw = rendered?.title?.trim();
  if (!raw) return fallback;
  return titleFromMarkdown(`# ${raw}`) || raw;
}

/**
 * One-line teaser: the first real prose paragraph (no headings, code, lists, quotes-as-frames),
 * plain text, cut at a sentence boundary.
 */
export function lede(markdown: string, max = 200): string | null {
  const lines = markdown.split("\n");
  let inFence = false;
  let para: string[] = [];
  const flush = () => {
    const text = para.join(" ").trim();
    para = [];
    return text;
  };
  for (const line of lines) {
    const t = line.trim();
    if (/^(```|~~~)/.test(t)) {
      inFence = !inFence;
      if (para.length) flush();
      continue;
    }
    if (inFence) continue;
    if (!t) {
      const text = flush();
      if (isProse(text)) return trimSentence(plain(text), max);
      continue;
    }
    if (/^(#|---|\*\*\*|\||[-*+] |\d+\. |<)/.test(t)) {
      if (para.length) flush();
      continue;
    }
    para.push(t.replace(/^>\s?/, ""));
  }
  const text = flush();
  return isProse(text) ? trimSentence(plain(text), max) : null;
}

function isProse(text: string) {
  if (text.length < 60) return false;
  if (/^\*[^*].*\*$/.test(text)) return false; // stage directions like *You walk into the room*
  if (/^\*\*[^*]+\*\*:?$/.test(text)) return false;
  return /[a-z]/.test(text);
}

function plain(md: string) {
  return md
    .replace(/:\s*$/, "…") // a paragraph that introduces a code block or list
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trimSentence(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const dot = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (dot > 60) return cut.slice(0, dot + 1);
  return cut.replace(/\s+\S*$/, "") + "…";
}

/** Trial parts from an MCQ markdown file: "Part 3: Circuit Breakers" + question range. */
export function trialParts(markdown: string): { n: number; title: string; questions: number }[] {
  const body = markdown.split(/^#{1,2}\s+Answer Key/m)[0];
  const parts: { n: number; title: string; questions: number }[] = [];
  const re = /^#{1,2}\s+Part\s+(\d+):\s*(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  const heads: { n: number; title: string; at: number }[] = [];
  while ((m = re.exec(body))) {
    heads.push({ n: parseInt(m[1], 10), title: m[2].replace(/\s*\(Questions?\s+[\d\s–-]+\)\s*$/i, "").trim(), at: m.index });
  }
  heads.forEach((h, i) => {
    const chunk = body.slice(h.at, heads[i + 1]?.at ?? body.length);
    const range = chunk.match(/Questions?\s+(\d+)\s*[-–]\s*(\d+)/i);
    let questions = range ? parseInt(range[2], 10) - parseInt(range[1], 10) + 1 : 0;
    if (!questions) questions = (chunk.match(/^#{2,4}\s*(?:Question|Q)\s*\d+/gim) || []).length;
    parts.push({ n: h.n, title: h.title, questions });
  });
  return parts;
}

/** The trial part for a day / foundations part: Day N ↔ Part N. */
export function trialLinkFor(
  r: LearningResource,
  mcq: LearningResource | undefined,
  parts: { n: number; title: string; questions: number }[]
): TrialPartLink | null {
  if (!mcq || !parts.length) return null;
  const n = r.type === "day-content" ? dayNumber(r) : r.type === "foundations" ? partNumber(r.slug) : null;
  if (!n) return null;
  const part = parts.find((p) => p.n === parseInt(n, 10));
  if (!part) return null;
  return {
    part: part.n,
    title: part.title,
    questions: part.questions,
    href: `/learn/${r.course}/${mcq.week}/${mcq.slug}?part=${part.n}`,
  };
}

/** Week rail: previous week summary, this week's nodes, the next week's first node. */
export function buildRail(
  sequence: LearningResource[],
  current: LearningResource,
  titleFor: (r: LearningResource) => string,
  trialPartCount: number
): { prev: RailWeek | null; week: RailWeek; next: RailWeek | null } {
  const weeks: string[] = [];
  for (const r of sequence) if (!weeks.includes(r.week)) weeks.push(r.week);
  const wi = weeks.indexOf(current.week);
  const entry = (r: LearningResource): RailEntry => {
    const title = titleFor(r);
    return {
      week: r.week,
      slug: r.slug,
      href: `/learn/${r.course}/${r.week}/${r.slug}`,
      label: railLabel(r, title),
      title,
      kind: r.type,
      current: r.week === current.week && r.slug === current.slug,
      parts: r.type === "mcq" && r.week === current.week ? trialPartCount : undefined,
    };
  };
  const make = (week: string, items: LearningResource[]): RailWeek => ({
    week,
    code: weekCode(week),
    label: weekLabel(week),
    topic: weekTopic(week),
    entries: items.map(entry),
  });
  const prevWeek = wi > 0 ? weeks[wi - 1] : null;
  const nextWeek = wi >= 0 && wi < weeks.length - 1 ? weeks[wi + 1] : null;
  return {
    prev: prevWeek ? make(prevWeek, sequence.filter((r) => r.week === prevWeek)) : null,
    week: make(current.week, sequence.filter((r) => r.week === current.week)),
    next: nextWeek ? make(nextWeek, sequence.filter((r) => r.week === nextWeek).slice(0, 1)) : null,
  };
}

/** Hero numbers, real counts from the rendered lesson; zero rows are dropped. */
export function lessonStats(rendered: RenderedLesson, requiredStages: number): ReaderStat[] {
  const count = (re: RegExp) => (rendered.html.match(re) || []).length;
  const blueprints = count(/data-sd="blueprint"/g);
  const codeBlocks = count(/data-sd="code"/g) || count(/class="(?:[^"]* )?language-(?!text\b|plaintext\b|ascii\b|txt\b)[a-z]/g);
  const questions = rendered.toc.filter((t) => t.kind === "question").length;
  const stats: ReaderStat[] = [];
  const phases = rendered.stages.some((s) => s.budgetMinutes);
  if (requiredStages > 1) stats.push({ value: requiredStages, label: phases ? "timed phases" : "stages" });
  if (blueprints) stats.push({ value: blueprints, label: blueprints === 1 ? "blueprint" : "blueprints" });
  if (codeBlocks) stats.push({ value: codeBlocks, label: codeBlocks === 1 ? "code block" : "code blocks" });
  if (questions) stats.push({ value: questions, label: "interview Qs" });
  return stats.slice(0, 4);
}
