import "server-only";
/**
 * The grounding for "Explain this" on a snip: the course text around where it was taken, loaded on the server from the
 * course's own sources (never from the request), kept short (~6k characters):
 *   - a lesson, side quest, interview problem or LLD article (lib/github), a case file (lib/stories) or a war story:
 *     the section the snip sits under (by its heading, else by the snip's words), cut around the paragraphs the snip
 *     is about, then the next-best sections while the budget lasts (snipSectionContext);
 *   - a lecture: the scene on screen in full (its content and every step's narration, the current step marked), the
 *     timestamp, and a short excerpt of the written page it teaches.
 * Labs, shorts and other pages: none (the snip's own text and image carry the explanation).
 */
import { fetchMarkdownContent, getLearningResource } from "@/lib/github";
import { getStorySource } from "@/lib/stories";
import { getLecture } from "@/lib/learn/lecture/load";
import { onScreen, sceneInFull } from "@/lib/learn/lecture/moment";
import { scoreSections, splitSections } from "@/lib/ai/retrieve";

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

/**
 * The page's text around a snip: the section under `heading` (its own heading matched loosely, "2.3 Write-Through" =
 * "Write-through"), else the section that shares the most words with the snip, cut to ~60% of the budget around the
 * snip's paragraphs; then the best other sections for the snip's words, up to 1,500 characters each.
 */
export function snipSectionContext(md: string, heading: string, snipText: string, budget = 6000): string {
  const sections = splitSections(md);
  if (!sections.length) return "";
  const h = norm(heading);
  const query = `${heading} ${snipText}`.slice(0, 3000);
  const score = scoreSections(sections, query);
  const byHeading = h ? (sections.find((s) => norm(s.heading) === h) ?? sections.find((s) => norm(s.heading).includes(h) || (h.includes(norm(s.heading)) && norm(s.heading).length > 6))) : undefined;
  const ranked = [...sections].sort((a, b) => score(b) - score(a));
  const main = byHeading ?? ranked[0];
  const picked: { heading: string; text: string; index: number; main: boolean }[] = [{ heading: main.heading, text: around(main.text, query, Math.round(budget * 0.6)), index: main.index, main: true }];
  let used = picked[0].text.length;
  for (const s of ranked) {
    if (used > budget * 0.9) break;
    if (s.index === main.index || score(s) <= 0) continue;
    const t = around(s.text, query, Math.min(1500, budget - used));
    if (t.length < 120) continue;
    picked.push({ heading: s.heading, text: t, index: s.index, main: false });
    used += t.length;
    if (picked.length >= 4) break;
  }
  picked.sort((a, b) => a.index - b.index);
  return picked.map((s) => `## ${s.heading}${s.main ? "  (the snip is from this section)" : ""}\n${s.text}`).join("\n\n");
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
export async function snipGrounding(a: { kind: SnipKind; key: string; title: string; heading: string; text: string; lecture: LectureMoment | null }): Promise<SnipGrounding> {
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
      const written = md ? snipSectionContext(md, scene.title, `${narration} ${a.text}`, 2200) : "";
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
      return s ? { title: s.title, context: snipSectionContext(s.body, a.heading, a.text), meta: { source: `story:${a.key}` } } : none;
    }
    if (a.kind === "war story" && SLUG.test(a.key)) {
      const md = await fetchMarkdownContent(`resources/war-stories/stories/${a.key}.md`).catch(() => null);
      return md ? { title: a.title, context: snipSectionContext(md, a.heading, a.text), meta: { source: `war:${a.key}` } } : none;
    }
    if (a.kind === "lesson" || a.kind === "side quest" || a.kind === "interview problem" || a.kind === "LLD article") {
      const m = a.key.match(LESSON_KEY);
      if (!m) return none;
      const r = await getLearningResource(m[1], m[2]);
      return r ? { title: r.resource.title, context: snipSectionContext(r.content, a.heading, a.text), meta: { source: `lesson:${a.key}` } } : none;
    }
  } catch (e) {
    console.warn("[snip-explain] grounding", (e as Error).message);
  }
  return none;
}
