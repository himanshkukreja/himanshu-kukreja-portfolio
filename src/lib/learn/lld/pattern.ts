import "server-only";
/**
 * Server side of the pattern pages: which pattern lessons exist (resources/design-patterns/<slug>.md,
 * see pattern-format.ts for the shape), one lesson rendered into the template's slots, and its lecture
 * and clips. A missing folder or file is normal until the pattern lessons are written: every reader
 * here returns "nothing yet" instead of failing, and the page shows its "coming soon" slots.
 */
import { fetchGitHubContent, fetchMarkdownContent, isContentMissing } from "@/lib/github";
import { renderBlockHtml } from "@/lib/course/block-html";
import { getLabSummaries } from "@/lib/learn/labs/load";
import { getLecture, lectureCard } from "@/lib/learn/lecture/load";
import { lessonLectureId } from "@/lib/learn/lecture/types";
import { shortsOf } from "@/lib/learn/shorts/load";
import { LLD_LANGS, type LldLang } from "./steps";
import { PATTERN_DIR } from "./meta";
import { parsePatternLesson, patternGaps } from "./pattern-format";

/** The "week" the pattern lessons' lectures are filed under: lectures/design-patterns--<slug>.json. */
export const PATTERN_AREA = "design-patterns";

/** Slugs that have a lesson file. Never throws; a transient failure is thrown so a cached page is not built from an empty list. */
export async function getPatternSlugs(): Promise<Set<string>> {
  try {
    const files = await fetchGitHubContent(PATTERN_DIR);
    return new Set(files.filter((f) => f.type === "file" && /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(f.name) && f.name.toLowerCase() !== "readme.md").map((f) => f.name.replace(/\.md$/, "")));
  } catch (e) {
    if (isContentMissing(e)) return new Set();
    throw e;
  }
}

export type PatternPageData = {
  /** the lesson's own title/deck when it has one */
  title: string | null;
  deck: string | null;
  /** rendered HTML per slot; "" when the lesson has no such section */
  problem: string;
  before: string;
  after: string;
  code: Partial<Record<LldLang, string>>;
  notUse: string;
  quiz: string;
  extra: { title: string; html: string }[];
  lab: { id: string; title: string; href: string; minutes: number; languages: string[] } | null;
  lecture: { href: string; minutes: number; checkpoints: number; chapters: number } | null;
  shorts: { of: string; items: { id: string; title: string; poster: string; seconds: number }[] } | null;
  /** what the lesson still lacks, in plain words (empty when complete) */
  gaps: string[];
};

/** One pattern's page data. `null` lesson file → the template with every slot empty (the slots still show lecture and clips if those exist). */
export async function getPatternPage(slug: string): Promise<PatternPageData> {
  let md: string | null = null;
  try {
    md = await fetchMarkdownContent(`${PATTERN_DIR}/${slug}.md`);
  } catch (e) {
    if (!isContentMissing(e)) throw e;
  }
  const s = md ? parsePatternLesson(md) : null;
  const lectureId = lessonLectureId(PATTERN_AREA, slug);
  const [lecture, shorts, labs] = await Promise.all([
    getLecture(lectureId).then(lectureCard).catch(() => null),
    shortsOf(lectureId).catch(() => null),
    s?.lab ? getLabSummaries().catch(() => []) : Promise.resolve([]),
  ]);
  const lab = s?.lab ? labs.find((l) => l.id === s.lab) : undefined;
  const code: Partial<Record<LldLang, string>> = {};
  if (s) for (const l of LLD_LANGS) if (s.code[l.id]) code[l.id] = await renderBlockHtml(s.code[l.id]!);
  return {
    title: s?.title ?? null,
    deck: s?.deck ?? null,
    problem: s ? await renderBlockHtml(s.problem) : "",
    before: s ? await renderBlockHtml(s.before) : "",
    after: s ? await renderBlockHtml(s.after) : "",
    code,
    notUse: s ? await renderBlockHtml(s.notUse) : "",
    quiz: s ? await renderBlockHtml(s.quiz) : "",
    extra: s ? await Promise.all(s.extra.map(async (x) => ({ title: x.title, html: await renderBlockHtml(x.md) }))) : [],
    lab: lab ? { id: lab.id, title: lab.title, href: lab.href, minutes: lab.minutes, languages: lab.languages.map(String) } : null,
    lecture,
    shorts,
    gaps: patternGaps(s),
  };
}
