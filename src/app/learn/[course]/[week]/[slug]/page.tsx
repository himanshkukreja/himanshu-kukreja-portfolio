import { Suspense } from "react";
import { controlMap, isLive, questKey } from "@/lib/learn/controls";
import { notFound } from "next/navigation";
import {
  fetchMarkdownContent,
  getAllLearningResources,
  getLearningResource,
  getWeekResources,
  type LearningResource,
} from "@/lib/github";
import { isMCQDocument, parseMCQMarkdown } from "@/lib/mcq-parser";
import { renderLesson } from "@/lib/course/render";
import { termsFor } from "@/lib/concepts/load";
import { getCourseMap } from "@/lib/learn/course";
import { courseRefResolver } from "@/lib/learn/course-refs";
import { getLabsForLesson } from "@/lib/learn/labs/load";
import { getTrailForLesson } from "@/lib/learn/trail/load";
import { getSheet } from "@/lib/learn/sheets/load";
import { getQuestDrills } from "@/lib/learn/drills/load";
import { getLecture, lectureCard } from "@/lib/learn/lecture/load";
import { lessonLectureId } from "@/lib/learn/lecture/types";
import { isOptionalStage } from "@/components/learn/lesson/stageText";
import MCQAssessmentWrapper from "@/components/MCQAssessmentWrapper";
import ReadingProgress from "@/components/ReadingProgress";
import SearchHighlight from "@/components/SearchHighlight";
import CollapsibleWeekNav from "@/components/CollapsibleWeekNav";
import LessonReader from "@/components/learn/lesson/LessonReader";
import {
  buildRail,
  cleanTitle,
  kindBadge,
  lede,
  lessonStats,
  shortLabel,
  trialLinkFor,
  trialParts,
  weekCode,
  weekLabel,
  weekTopic,
} from "@/components/learn/lesson/data";
import type { NavLink, ReaderMeta } from "@/components/learn/lesson/types";
import { shortsOf } from "@/lib/learn/shorts/load";
import { JsonLd, breadcrumbs, lessonArticle } from "@/lib/seo/jsonld";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push (revalidate-courses / publish); per-visitor state (progress, notes, sign-in) loads on the client.
export const revalidate = 86400;
export const dynamicParams = true;
/** None at build: each path renders on its first visit, then is cached (on-demand ISR). */
export function generateStaticParams() {
  return [];
}

type Props = {
  params: Promise<{
    course: string;
    week: string;
    slug: string;
  }>;
};

export async function generateMetadata({ params }: Props) {
  const { course, week, slug } = await params;
  const data = await getLearningResource(week, slug);
  if (!data) return { title: "Not Found" };
  // the lesson's own opening line makes a better search snippet than a generic one
  const teaser = await teaserFor(data.resource);
  const where = `${weekLabel(week)} · ${weekTopic(week)} · free System Design Mastery course.`;
  const path = `/learn/${course}/${week}/${slug}`;
  return {
    title: `${data.resource.title} | System Design Mastery`,
    description: teaser ? `${teaser.replace(/[.\s]+$/, "")}. ${where}` : `${data.resource.title} · ${where}`,
    alternates: { canonical: path },
    openGraph: { type: "article", url: path },
  };
}

/** Capstones open with a whiteboard frame: "Design a Global Flash Sale System for …". */
function capstoneTeaser(markdown: string): string | null {
  // the whiteboard is a `:::panel[Design …]` block now; older box art is still read
  const p = markdown.match(/^:{3,}panel\[(Design\b[^\]\n]{8,})\]/m);
  if (p) return p[1].replace(/^Design:\s*/i, "Design ").replace(/\s+/g, " ").trim();
  const m = markdown.match(/[║|]\s*(Design[^║|\n]{8,}?)\s*[║|]/);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

async function teaserFor(r: LearningResource): Promise<string | null> {
  try {
    const md = await fetchMarkdownContent(r.path);
    if (r.type === "capstone") return capstoneTeaser(md);
    if (r.type === "mcq") return null;
    return lede(md, 170);
  } catch {
    return null;
  }
}

export default async function LearningResourcePage({ params }: Props) {
  const { course, week, slug } = await params;
  const data = await getLearningResource(week, slug);
  if (!data) notFound();

  const { resource, content } = data;
  // a side quest hidden or scheduled in /admin/publishing isn't a page yet
  if (resource.type === "bonus" && !isLive((await controlMap()).get(questKey(slug)))) notFound();

  // Previous/next run through the whole course in reading order (plan -> Week 0 -> ... ->
  // bonus problems), so the last item of a week leads into the next week and the plan has a Next.
  const [allResources, weekResources] = await Promise.all([getAllLearningResources(), getWeekResources(week)]);
  const sequence = allResources.filter((r) => r.course === course);
  const currentIndex = sequence.findIndex((r) => r.week === week && r.slug === slug);
  // Week sidebar titles are the most complete (MCQ titles resolved), so prefer them.
  const titleFor = (r: LearningResource) => (r.week === week && weekResources.find((w) => w.slug === r.slug)?.title) || r.title;
  const prevRes = currentIndex > 0 ? sequence[currentIndex - 1] : undefined;
  const nextRes = currentIndex >= 0 && currentIndex < sequence.length - 1 ? sequence[currentIndex + 1] : undefined;

  const navLink = (r: LearningResource | undefined, dir: "Previous" | "Next", teaser?: string | null): NavLink | null =>
    r
      ? {
          week: r.week,
          slug: r.slug,
          href: `/learn/${course}/${r.week}/${r.slug}`,
          title: titleFor(r),
          label: r.week !== week ? `${dir} · ${weekLabel(r.week)}` : dir,
          kicker: `${shortLabel(r).toUpperCase()}${r.week !== week ? ` · ${weekCode(r.week)}` : ""}`,
          kind: r.type,
          teaser: teaser ?? null,
        }
      : null;

  // The week's trial (MCQ) and its parts: Day N ↔ Part N.
  const mcq = weekResources.find((r) => r.type === "mcq");
  const isMCQ = isMCQDocument(content);
  const [mcqParts, nextTeaser] = await Promise.all([
    mcq && !isMCQ ? fetchMarkdownContent(mcq.path).then(trialParts).catch(() => []) : Promise.resolve([]),
    nextRes ? teaserFor(nextRes) : Promise.resolve(null),
  ]);

  const rail = buildRail(sequence, resource, titleFor, mcqParts.length);
  const previous = navLink(prevRes, "Previous");
  const next = navLink(nextRes, "Next", nextTeaser);

  if (isMCQ) {
    const mcqAssessment = parseMCQMarkdown(content);
    return (
      <>
        <ReadingProgress />
        <Suspense fallback={null}>
          <SearchHighlight />
        </Suspense>
        <main className="min-h-screen pb-16 pt-8">
          <div className="mx-auto max-w-[1320px] px-4 sm:px-6">
            <MCQAssessmentWrapper
              assessment={mcqAssessment}
              courseId={course}
              week={week}
              lessonSlug={slug}
              weekDisplayName={weekLabel(week)}
              previousResource={previous ? { week: previous.week, slug: previous.slug, title: previous.title } : null}
              nextResource={next ? { week: next.week, slug: next.slug, title: next.title } : null}
              previousLabel={previous?.label ?? "Previous"}
              nextLabel={next?.label ?? "Next"}
              sidebarLeft={<CollapsibleWeekNav course={course} rail={rail} />}
            />
          </div>
        </main>
      </>
    );
  }

  // hover definitions: concept terms marked in the HTML, with their cards (src/lib/course/terms.ts)
  // end-of-article entries that name a course page ("Week 1, Day 3 — …", "UPI (Bonus Problem 1)") link to it;
  // without the course map they just stay static
  const [terms, courseRefs] = await Promise.all([
    termsFor(`${week}/${slug}`),
    getCourseMap(course)
      .then((m) => (m ? courseRefResolver(m) : undefined))
      .catch(() => undefined),
  ]);
  const rendered = await renderLesson(content, { kind: resource.type, terms, courseRefs });
  const title = cleanTitle(rendered, resource.title);
  const requiredStages = rendered.stages.filter((s) => !isOptionalStage(s));
  const numbered = requiredStages.filter((s) => s.id !== "preface" && s.id !== "intro").length || requiredStages.length;

  const meta: ReaderMeta = {
    course,
    week,
    slug,
    title,
    subtitle:
      (resource.type === "problem" || resource.type === "lld" ? rendered.mission?.objective : undefined) ??
      rendered.subtitle ??
      (resource.type === "capstone" ? capstoneTeaser(content) : lede(content)),
    ...((resource.type === "problem" || resource.type === "lld") && rendered.mission?.numbers.length ? { missionNumbers: rendered.mission.numbers.slice(0, 4) } : {}),
    kind: resource.type,
    kindBadge: kindBadge(resource),
    shortLabel: shortLabel(resource),
    weekCode: weekCode(week),
    weekLabel: weekLabel(week),
    weekTopic: weekTopic(week),
    readingMinutes: rendered.readingMinutes,
    contentVersion: rendered.contentVersion,
    stats: lessonStats(rendered, numbered),
    quest:
      resource.type === "bonus"
        ? {
            mission: rendered.mission ?? null,
            checkpoints: (rendered.html.match(/data-variant="checkpoint"/g) || []).length,
            quizzes: (rendered.html.match(/data-sd="quiz"/g) || []).length,
            phases: rendered.stages.filter((s) => s.id.startsWith("phase-")).length,
            budgetMinutes: rendered.stages.reduce((a, s) => a + (s.budgetMinutes || 0), 0),
          }
        : null,
    labs: await getLabsForLesson(course, week, slug).catch(() => []),
    trail: await getTrailForLesson(week, slug).catch(() => []),
    drills: resource.type === "bonus" ? await getQuestDrills(slug, rendered.toc).catch(() => null) : null,
    sheet: resource.type === "bonus" ? await getSheet(slug).then((x) => (x ? { href: x.href, diagrams: x.diagrams } : null)).catch(() => null) : null,
    shorts: await shortsOf(resource.type === "bonus" ? slug : lessonLectureId(week, slug)).catch(() => null),
    lecture: await getLecture(resource.type === "bonus" ? slug : lessonLectureId(week, slug))
      .then(lectureCard)
      .catch(() => null),
  };

  const path = `/learn/${course}/${week}/${slug}`;
  const ld = [
    lessonArticle({ title, description: meta.subtitle ?? null, path, coursePath: `/learn/${course}`, section: `${weekLabel(week)} · ${weekTopic(week)}` }),
    breadcrumbs([
      { name: "Learn", path: "/learn" },
      { name: "System Design Mastery", path: `/learn/${course}` },
      { name: resource.type === "bonus" ? "Side quests" : `${weekLabel(week)} · ${weekTopic(week)}`, path: `/learn/${course}` },
      { name: title, path },
    ]),
  ];

  return (
    <main className="pb-16">
      <JsonLd data={ld} />
      <LessonReader
        meta={meta}
        html={rendered.html}
        stages={rendered.stages}
        toc={rendered.toc}
        rail={rail}
        prev={previous}
        next={next}
        trial={trialLinkFor(resource, mcq, mcqParts)}
      />
    </main>
  );
}
