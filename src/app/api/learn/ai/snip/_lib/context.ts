import "server-only";
/**
 * The grounding for "Explain this" on a snip: the course text around where it was taken, loaded on the server from the
 * course's own sources (never from the request), kept short (~6k characters of sections plus the outline, ~9k with a question):
 *   - a lesson, side quest, interview problem or LLD article (lib/github), a case file (lib/stories) or a war story:
 *     the page's outline (every section title, so the model knows what the rest of the page covers), the section the
 *     snip sits under (by its heading, else by the snip's words), cut around the paragraphs the snip is about; for a
 *     question, the sections whose titles and text match it (a follow-up often asks about something another section
 *     answers); then the next-best sections for the snip while the budget lasts (snipSectionContext);
 *   - a lecture: the scene on screen in full (its content and every step's narration, the current step marked), the
 *     timestamp, and a short excerpt of the written page it teaches.
 * Labs, shorts and other pages: none (the snip's own text and image carry the explanation).
 */
import { fetchMarkdownContent, getLearningResource } from "@/lib/github";
import { getStorySource } from "@/lib/stories";
import { getLecture } from "@/lib/learn/lecture/load";
import { onScreen, sceneInFull } from "@/lib/learn/lecture/moment";
import { headingOutline, scoreSections, splitSections } from "@/lib/ai/retrieve";

export const SNIP_KINDS = ["lesson", "side quest", "interview problem", "LLD article", "case file", "war story", "lecture", "lab", "short", "page"] as const;
export type SnipKind = (typeof SNIP_KINDS)[number];

const SLUG = /^[A-Za-z0-9-]{1,160}$/;
const LESSON_KEY = /^([A-Za-z0-9-]{1,120})\/([A-Za-z0-9-]{1,120})$/;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/^[\s\d.:)·-]+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

/** A long section cut to `cap` around the paragraphs that share the most words with the snip, in order, "…" between. */
function around(text: string, query: string, cap: number): string {
  if (text.length <= cap) return text;
  const q = new Set(norm(query).split(" ").filter((w) => w.length > 2));
  const blocks = text
    .split(/\n{2,}/)
    .map((t, i) => ({ t: t.trim(), i }))
    .filter((b) => b.t);
  const score = (t: string) => {
    let n = 0;
    for (const w of new Set(norm(t).split(" "))) if (q.has(w)) n++;
    return n / Math.sqrt(1 + t.length / 600);
  };
  const ranked = [...blocks].sort((a, b) => score(b.t) - score(a.t) || a.i - b.i);
  const keep: { t: string; i: number }[] = [];
  let used = 0;
  for (const b of ranked) {
    const t = b.t.length > cap ? `${b.t.slice(0, Math.max(200, cap - used - 2))}…` : b.t;
    if (used + t.length + 2 > cap) continue;
    keep.push({ t, i: b.i });
    used += t.length + 2;
  }
  if (!keep.length) return `${text.slice(0, cap - 1)}…`;
  keep.sort((a, b) => a.i - b.i);
  return keep.map((b, k) => (k && b.i !== keep[k - 1].i + 1 ? `…\n\n${b.t}` : b.t)).join("\n\n");
}

/* ── a question's own sections: plain keyword matching on section titles and text ── */

// words that say nothing about what a follow-up is about ("what if that one fetch is slow?" → fetch, slow)
const Q_STOP = new Set(
  "the a an and or of to in on for is are was were be been being it its this that these those with as at by from how what why when where which who whom whose does do did done can could should would will shall may might must i me you we they he she my your our their his her about into onto not no yes if then than so there here one ones some any all just also only very more most much many such same other else explain explained mean means meaning happen happens happened work works working example examples show shows shown snip lesson section page part diagram code use used using get gets got thing things like say says said tell way case still need needs want go goes going make makes made".split(" "),
);
// a few everyday words a question uses for what a lesson calls something else ("slow" → the "timeout" section)
const RELATED: Record<string, string[]> = {
  slow: ["timeout", "latency", "long"],
  hang: ["timeout", "wait"],
  stuck: ["timeout", "wait"],
  timeout: ["slow", "wait"],
  fail: ["failure", "error", "crash", "outage"],
  crash: ["fail", "failure", "dies"],
  die: ["crash", "fail"],
  down: ["outage", "fail", "unavailable"],
  break: ["fail", "failure", "error"],
  lost: ["loss", "durable", "durability"],
  duplicate: ["idempotent", "idempotency", "dedup"],
  twice: ["duplicate", "idempotent"],
  expensive: ["cost"],
  cheap: ["cost"],
  big: ["scale", "large"],
  fast: ["latency", "performance"],
};

/** A word's rough stem, so "coalesced" meets "coalescing", "expired" meets "expire" and "failures" meets "fail". */
const stem = (w: string) => {
  const t = w.replace(/(?:ings?|ed|ers?|es|s|ly|ures?|ions?)$/, "");
  return (t.length >= 3 ? t : w).replace(/e$/, "").slice(0, 5);
};
const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !Q_STOP.has(w));

/** The question's stems, each with its weight (its own words 1, the RELATED words 0.6). */
function questionStems(question: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of tokens(question)) {
    out.set(stem(w), 1);
    // own keys only: a question about a "constructor" mustn't reach Object.prototype
    const base = w.replace(/(?:ing|ed|er|s)$/, "");
    const related = Object.hasOwn(RELATED, w) ? RELATED[w] : Object.hasOwn(RELATED, base) ? RELATED[base] : [];
    for (const r of related) if (!out.has(stem(r))) out.set(stem(r), 0.6);
  }
  return out;
}

type Sec = ReturnType<typeof splitSections>[number];
/** A section with the deeper sections under it ("5.2 …" and its "####" parts), as one block of text. */
type Family = { head: Sec; text: string; last: number };

function families(sections: Sec[]): Family[] {
  return sections.map((head, i) => {
    let j = i + 1;
    while (j < sections.length && (sections[j].level ?? 0) > (head.level ?? 0)) j++;
    const text = sections
      .slice(i, j)
      .map((s, k) => (k ? `${"#".repeat(Math.min(6, (s.level ?? 0) + 1))} ${s.heading}\n${s.text}` : s.text))
      .join("\n\n");
    return { head, text, last: j - 1 };
  });
}

/**
 * The sections a question is about, best first: each section with its sub-sections, scored by the question's words
 * (rarer words count more) found in its title (three times the weight) and its text. A section needs its title to
 * match, or two of the question's words in its text (one when the question has only one), so a question about the
 * snip's own content pulls nothing in.
 */
export function questionSections(sections: Sec[], question: string): { fam: Family; score: number }[] {
  const q = questionStems(question);
  if (!q.size || sections.length < 2) return [];
  const fams = families(sections);
  const bags = fams.map((f) => {
    const counts = new Map<string, number>();
    for (const w of tokens(f.text)) {
      const k = stem(w);
      if (q.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return { head: new Set(tokens(f.head.heading).map(stem)), counts, size: f.text.length };
  });
  // document frequency over the top-level families only would skew to big chapters: use every section on its own
  const df = new Map<string, number>();
  for (const s of sections) for (const k of new Set(tokens(`${s.heading} ${s.text}`).map(stem))) if (q.has(k)) df.set(k, (df.get(k) ?? 0) + 1);
  const n = sections.length;
  const own = [...q.values()].filter((w) => w === 1).length;
  const out: { fam: Family; score: number }[] = [];
  fams.forEach((fam, i) => {
    const b = bags[i];
    let score = 0;
    let headHit = false;
    let textHits = 0;
    for (const [k, weight] of q) {
      const idf = Math.log(1 + n / (df.get(k) ?? n));
      if (b.head.has(k)) {
        score += 3 * idf * weight;
        headHit = true;
      }
      const c = b.counts.get(k) ?? 0;
      if (c) {
        score += idf * weight * (1 + Math.log(c));
        if (weight === 1) textHits++;
      }
    }
    if (!(headHit || textHits >= Math.min(2, own))) return;
    out.push({ fam, score: score / Math.sqrt(1 + b.size / 3000) });
  });
  return out.sort((a, b) => b.score - a.score);
}

/** The page's outline: its section titles to `###`, indented by level, the snip's section and the included ones marked. */
function outlineText(md: string, mark: (heading: string) => string, cap: number): string {
  for (const max of [3, 2]) {
    const hs = headingOutline(md, max);
    if (hs.length < 2) return "";
    const min = Math.min(...hs.map((h) => h.level));
    const text = hs.map((h) => `${"  ".repeat(h.level - min)}- ${h.heading}${mark(h.heading)}`).join("\n");
    if (text.length <= cap || max === 2) return text.length <= cap ? text : `${text.slice(0, cap).replace(/\n[^\n]*$/, "")}\n- …`;
  }
  return "";
}

/**
 * The page's text around a snip, for the model:
 *   - the outline: every section title (to `###`), the snip's section and the included ones marked, so the model knows
 *     what the rest of the page covers and can point to it by name (up to `outlineCap`, 3,500 characters: every lesson's
 *     outline to `###` fits; a longer one keeps its `##` titles);
 *   - the section under `heading` (its own heading matched loosely, "2.3 Write-Through" = "Write-through"), else the
 *     section that shares the most words with the snip, cut to ~60% of `budget` around the snip's (and the question's)
 *     paragraphs;
 *   - with a `question` (Ask, a follow-up): up to two other sections it matches by title and text, with their
 *     sub-sections, in `questionBudget` more characters (a follow-up on the coalescing diagram, "what if that one fetch
 *     is slow?", brings in "5.2 Coalesced Request Timeout");
 *   - then the best other sections for the snip's words, up to 1,500 characters each, while `budget` lasts.
 */
export function snipSectionContext(md: string, heading: string, snipText: string, o: { budget?: number; question?: string; questionBudget?: number; outlineCap?: number } = {}): string {
  const { budget = 6000, question = "", questionBudget = 3000, outlineCap = 3500 } = o;
  const sections = splitSections(md);
  if (!sections.length) return "";
  const h = norm(heading);
  const query = `${heading} ${snipText}`.slice(0, 3000);
  const score = scoreSections(sections, query);
  const byHeading = h ? (sections.find((s) => norm(s.heading) === h) ?? sections.find((s) => norm(s.heading).includes(h) || (h.includes(norm(s.heading)) && norm(s.heading).length > 6))) : undefined;
  const ranked = [...sections].sort((a, b) => score(b) - score(a));
  const main = byHeading ?? ranked[0];
  type Pick = { heading: string; text: string; index: number; why: "snip" | "question" | "" };
  const picked: Pick[] = [{ heading: main.heading, text: around(main.text, `${query} ${question}`, Math.round(budget * 0.6)), index: main.index, why: "snip" }];
  const taken = new Set([main.index]);
  // the question's own sections first: what a follow-up asks about often sits in another part of the page
  if (question.trim()) {
    let left = questionBudget;
    for (const { fam } of questionSections(sections, question)) {
      if (left < 400 || picked.length >= 3) break;
      // not the snip's own section, nor a section that holds it or sits inside an included one
      if (fam.head.index <= main.index && fam.last >= main.index) continue;
      if ([...taken].some((i) => i >= fam.head.index && i <= fam.last)) continue;
      const t = around(fam.text, question, Math.min(left, Math.round(questionBudget * 0.67)));
      if (t.length < 80) continue;
      picked.push({ heading: fam.head.heading, text: t, index: fam.head.index, why: "question" });
      for (let i = fam.head.index; i <= fam.last; i++) taken.add(i);
      left -= t.length;
    }
  }
  let used = picked[0].text.length;
  for (const s of ranked) {
    if (used > budget * 0.9) break;
    if (taken.has(s.index) || score(s) <= 0) continue;
    const t = around(s.text, query, Math.min(1500, budget - used));
    if (t.length < 120) continue;
    picked.push({ heading: s.heading, text: t, index: s.index, why: "" });
    taken.add(s.index);
    used += t.length;
    if (picked.length >= 5) break;
  }
  picked.sort((a, b) => a.index - b.index);
  const nh = (x: string) => norm(x);
  const outline = outlineText(
    md,
    (hd) => (nh(hd) === nh(main.heading) ? "  ← the snip is here" : picked.some((p) => nh(p.heading) === nh(hd)) ? "  (text below)" : ""),
    outlineCap,
  );
  const body = picked
    .map((s) => `## ${s.heading}${s.why === "snip" ? "  (the snip is from this section)" : s.why === "question" ? "  (matches the learner's question)" : ""}\n${s.text}`)
    .join("\n\n");
  return outline ? `Outline of the whole page (every section title; only the sections below are included in full):\n${outline}\n\nThe included sections:\n\n${body}` : body;
}

export type LectureMoment = { id: string; scene: string; step: number; at: number };

export type SnipGrounding = { title: string; context: string; moment?: string; meta: Record<string, string | number | null> };

/** The written page a lecture teaches, as markdown (same sources as the lecture's "ask about this moment"). */
async function lectureSource(l: NonNullable<Awaited<ReturnType<typeof getLecture>>>): Promise<string | null> {
  const k = l.lesson?.kind;
  if (k === "case") return (await getStorySource(l.lesson!.slug).catch(() => null))?.body ?? null;
  if (k === "interview") return fetchMarkdownContent(`resources/mock-interviews/${l.lesson!.slug}.md`).catch(() => null);
  if (k === "story") return fetchMarkdownContent(`resources/war-stories/stories/${l.lesson!.slug}.md`).catch(() => null);
  const r = await (l.lesson ? getLearningResource(l.lesson.week, l.lesson.slug) : getLearningResource("bonus-problems", l.quest)).catch(() => null);
  return r?.content ?? null;
}

/** Loads the grounding for a snip. Unknown or missing sources give an empty context (the snip is still explained). */
export async function snipGrounding(a: { kind: SnipKind; key: string; title: string; heading: string; text: string; lecture: LectureMoment | null; question?: string }): Promise<SnipGrounding> {
  const question = a.question ?? "";
  const none = { title: a.title, context: "", meta: { source: null } };
  try {
    if (a.kind === "lecture" && a.lecture) {
      const l = await getLecture(a.lecture.id);
      const scene = l?.scenes.find((s) => s.id === a.lecture!.scene);
      if (!l || !scene) return none;
      const step = Math.max(0, Math.min(scene.steps.length - 1, Math.floor(a.lecture.step) || 0));
      const no = l.scenes.indexOf(scene) + 1;
      const moment = `${fmt(a.lecture.at)} into the lecture, chapter ${no} of ${l.scenes.length} ("${scene.title}"), step ${step + 1} of ${scene.steps.length}`;
      const md = await lectureSource(l);
      const narration = scene.steps[step]?.say ?? "";
      const written = md ? snipSectionContext(md, scene.title, `${narration} ${a.text}`, { budget: 2200, question, questionBudget: 1500, outlineCap: 1200 }) : "";
      const context = [
        `Lecture: ${l.title}`,
        `The moment: ${moment}.`,
        `On screen at this step:\n${onScreen(l, scene, step, null)}`,
        `This chapter in full (content, then every step's narration; [NOW] marks the step on screen):\n${sceneInFull(scene, step, null).slice(0, 4200)}`,
        written ? `From the written page this lecture teaches:\n${written}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      return { title: l.title, context, moment, meta: { source: `lecture:${l.quest}`, scene: scene.id, step } };
    }
    if (a.kind === "case file" && SLUG.test(a.key)) {
      const s = await getStorySource(a.key);
      return s ? { title: s.title, context: snipSectionContext(s.body, a.heading, a.text, { question }), meta: { source: `story:${a.key}` } } : none;
    }
    if (a.kind === "war story" && SLUG.test(a.key)) {
      const md = await fetchMarkdownContent(`resources/war-stories/stories/${a.key}.md`).catch(() => null);
      return md ? { title: a.title, context: snipSectionContext(md, a.heading, a.text, { question }), meta: { source: `war:${a.key}` } } : none;
    }
    if (a.kind === "lesson" || a.kind === "side quest" || a.kind === "interview problem" || a.kind === "LLD article") {
      const m = a.key.match(LESSON_KEY);
      if (!m) return none;
      const r = await getLearningResource(m[1], m[2]);
      return r ? { title: r.resource.title, context: snipSectionContext(r.content, a.heading, a.text, { question }), meta: { source: `lesson:${a.key}` } } : none;
    }
  } catch (e) {
    console.warn("[snip-explain] grounding", (e as Error).message);
  }
  return none;
}
