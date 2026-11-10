import "server-only";
/**
 * Server side of the pattern pages (/low-level-design/patterns/<slug>): which of the plan's 28 lessons are
 * published (resources/low-level-design/dp-NN-<slug>.md), one lesson rendered into the template's slots, and its
 * lab, lecture, clips and FAQ. A missing file is normal until a lesson is released: every reader here returns
 * "nothing yet" instead of failing, and the page shows "coming soon". The lesson's shape is documented in
 * pattern-format.ts.
 */
import { fetchGitHubContent, fetchMarkdownContent, isContentMissing } from "@/lib/github";
import { renderBlockHtml } from "@/lib/course/block-html";
import { sdmRenderExtras, type SdmClips } from "@/lib/course/sdm-extras";
import type { DsaRenderOpts } from "@/lib/course/detect/dsa";
import { getLabSummaries } from "@/lib/learn/labs/load";
import { getLecture, lectureCard } from "@/lib/learn/lecture/load";
import { lessonLectureId } from "@/lib/learn/lecture/types";
import { shortsOf } from "@/lib/learn/shorts/load";
import { PATTERN_DIR, patternBySlug, patternLessonId, publishedPatternSlugs } from "./meta";
import { missionAsPanel, parsePatternLesson, patternGaps } from "./pattern-format";

/** The area the pattern lessons' lectures, shorts and FAQs are filed under: the lesson sits in low-level-design/. */
export const PATTERN_AREA = "low-level-design";

/** Slugs that have a lesson file. Never throws on a missing folder; a transient failure is thrown so a cached page is not built from an empty list. */
export async function getPatternSlugs(): Promise<Set<string>> {
  try {
    const files = await fetchGitHubContent(PATTERN_DIR);
    return publishedPatternSlugs(files.filter((f) => f.type === "file").map((f) => f.name));
  } catch (e) {
    if (isContentMissing(e)) return new Set();
    throw e;
  }
}

export type PatternPageData = {
  /** the lesson id in the content repo ("dp-16-strategy"), also the key of its FAQ and lecture */
  lessonId: string;
  /** the lesson's own title/deck when it has one */
  title: string | null;
  deck: string | null;
  /** rendered HTML per slot; "" when the lesson has no such section */
  intro: string;
  problem: string;
  pattern: string;
  before: string;
  after: string;
  code: string;
  deep: { title: string; html: string }[];
  notUse: string;
  cases: string;
  closing: { title: string; html: string }[];
  quiz: string;
  /** clips by id, for the page's hydrator (the ::clip figures) */
  clips: SdmClips;
  lab: { id: string; title: string; href: string; minutes: number; languages: string[] } | null;
  lecture: { href: string; minutes: number; checkpoints: number; chapters: number } | null;
  shorts: { of: string; items: { id: string; title: string; poster: string; seconds: number }[] } | null;
  /** what the lesson still lacks, in plain words (empty when complete) */
  gaps: string[];
};

/** One pattern's page data. No lesson file → the template with every slot empty (lecture and shorts still show if they exist). */
export async function getPatternPage(slug: string): Promise<PatternPageData> {
  const meta = patternBySlug(slug);
  const lessonId = meta ? patternLessonId(meta) : slug;
  let md: string | null = null;
  try {
    md = await fetchMarkdownContent(`${PATTERN_DIR}/${lessonId}.md`);
  } catch (e) {
    if (!isContentMissing(e)) throw e;
  }
  const s = md ? parsePatternLesson(md) : null;
  const extras = md ? await sdmRenderExtras(PATTERN_AREA, lessonId, md) : undefined;
  const dsa: DsaRenderOpts | undefined = extras?.dsa;
  const html = (x: string) => renderBlockHtml(x, dsa);
  const lectureId = lessonLectureId(PATTERN_AREA, lessonId);
  const href = `/low-level-design/patterns/${slug}`;
  const [lecture, shorts, labs] = await Promise.all([
    getLecture(lectureId).then(lectureCard).catch(() => null),
    shortsOf(lectureId).catch(() => null),
    getLabSummaries().catch(() => []),
  ]);
  const lab = labs.find((l) => l.lessons.some((x) => x.href === href || x.href.startsWith(`${href}#`)));
  return {
    lessonId,
    title: s?.title ?? null,
    deck: s?.deck ?? null,
    intro: s ? await html(missionAsPanel(s.intro)) : "",
    problem: s ? await html(s.problem) : "",
    pattern: s ? await html(s.pattern) : "",
    before: s ? await html(s.before) : "",
    after: s ? await html(s.after) : "",
    code: s ? await html(s.code) : "",
    deep: s ? await Promise.all(s.deep.map(async (x) => ({ title: x.title, html: await html(x.md) }))) : [],
    notUse: s ? await html(s.notUse) : "",
    cases: s ? await html(s.cases) : "",
    closing: s ? await Promise.all(s.closing.map(async (x) => ({ title: x.title, html: await html(x.md) }))) : [],
    quiz: s ? await html(s.quiz) : "",
    clips: extras?.clips ?? {},
    lab: lab ? { id: lab.id, title: lab.title, href: lab.href, minutes: lab.minutes, languages: lab.languages.map(String) } : null,
    lecture,
    shorts,
    gaps: patternGaps(s),
  };
}
