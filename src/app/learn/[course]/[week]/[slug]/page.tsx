import { Suspense } from "react";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{
    course: string;
    week: string;
    slug: string;
  }>;
};

export async function generateMetadata({ params }: Props) {
  const { week, slug } = await params;
  const data = await getLearningResource(week, slug);
  if (!data) return { title: "Not Found" };
  return {
    title: `${data.resource.title} | System Design Mastery`,
    description: `${data.resource.title} · ${weekLabel(week)} · ${weekTopic(week)}. Part of the System Design Mastery course.`,
  };
}

/** Capstones open with a whiteboard frame: "Design a Global Flash Sale System for …". */
function capstoneTeaser(markdown: string): string | null {
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

  const rendered = await renderLesson(content, { kind: resource.type });
  const title = cleanTitle(rendered, resource.title);
  const requiredStages = rendered.stages.filter((s) => !isOptionalStage(s));
  const numbered = requiredStages.filter((s) => s.id !== "preface" && s.id !== "intro").length || requiredStages.length;

  const meta: ReaderMeta = {
    course,
    week,
    slug,
    title,
    subtitle: rendered.subtitle ?? (resource.type === "capstone" ? capstoneTeaser(content) : lede(content)),
    kind: resource.type,
    kindBadge: kindBadge(resource),
    shortLabel: shortLabel(resource),
    weekCode: weekCode(week),
    weekLabel: weekLabel(week),
    weekTopic: weekTopic(week),
    readingMinutes: rendered.readingMinutes,
    contentVersion: rendered.contentVersion,
    stats: lessonStats(rendered, numbered),
  };

  return (
    <main className="pb-16">
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
