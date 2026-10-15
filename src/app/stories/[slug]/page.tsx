import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoryBySlug, getAllStories, getStoryMarkdown } from "@/lib/stories";
import { renderLesson } from "@/lib/course/render";
import { extractHeadings, addHeadingIds } from "@/lib/toc";
import { absoluteCoverUrl } from "@/lib/utils";
import StoryViewsClient from "./views-client";
import StoryComments from "@/components/StoryComments";
import ScrollToDiscussion from "@/components/ScrollToDiscussion";
import StoryReader, { type CaseLink, type Checkpoint } from "@/components/stories/StoryReader";
import { getCaseFiles } from "@/components/stories/case-files";
import { parseDebrief, resolveCaseType, type CaseFile } from "@/components/stories/case-types";

export const runtime = "nodejs"; // required for fs access on Vercel

export async function generateStaticParams() {
  const list = await getAllStories();
  return list.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const story = (await getAllStories()).find((s) => s.slug === slug);
  if (!story) return {};
  const cover = absoluteCoverUrl(story.cover);
  const images = cover ? [{ url: cover, width: 1536, height: 1024, alt: story.title }] : undefined;
  return {
    title: `${story.title} · Case files`,
    description: story.excerpt,
    openGraph: { type: "article", title: story.title, description: story.excerpt, url: `/stories/${slug}`, ...(images ? { images } : {}) },
    twitter: { card: "summary_large_image", title: story.title, description: story.excerpt, ...(cover ? { images: [cover] } : {}) },
  };
}

/** "Crisis Scenario: The 10 Seconds That Decide Everything" → "The 10 Seconds That Decide Everything" */
function checkpointLabel(text: string): string {
  const i = text.indexOf(": ");
  if (i > 0 && i < text.length - 2) {
    const rest = text.slice(i + 2).trim();
    if (rest.length >= 8) return rest;
  }
  return text;
}

function toLink(c: CaseFile | undefined): CaseLink | null {
  return c ? { slug: c.slug, caseId: c.caseId, type: c.type, title: c.title } : null;
}

export default async function StoryReadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = await getStoryBySlug(slug);
  if (!story) return notFound();

  // Stories go through the same rich renderer as course lessons (diagrams, callouts, numbers sheets,
  // compare cards, highlighted code…); the plain pipeline stays as a fallback.
  const markdown = await getStoryMarkdown(slug);
  const rendered = markdown ? await renderLesson(markdown, { kind: "day-content" }).catch(() => null) : null;
  const htmlContent = rendered ? rendered.html : addHeadingIds(story.content);
  const checkpoints: Checkpoint[] = rendered
    ? rendered.toc.filter((t) => t.level === 2).map((t) => ({ id: t.id, label: checkpointLabel(t.text) }))
    : extractHeadings(htmlContent)
        .filter((h) => h.level === 2)
        .map((h) => ({ id: h.id, label: checkpointLabel(h.text) }));

  const cases = await getCaseFiles();
  const index = cases.findIndex((c) => c.slug === slug);
  const raw = story as unknown as Record<string, unknown>;
  const meta: CaseFile =
    index >= 0
      ? cases[index]
      : {
          slug,
          caseId: "CASE-000",
          title: story.title,
          excerpt: story.excerpt,
          cover: story.cover,
          date: story.date,
          tags: Array.from(new Set(story.tags || [])),
          type: resolveCaseType(slug, raw.type),
          mins: 1,
          hasDebrief: false,
        };
  // cases are newest first: the previous case file is the older one.
  const prev = index >= 0 ? toLink(cases[index + 1]) : null;
  const next = index > 0 ? toLink(cases[index - 1]) : null;

  return (
    <main className="min-h-screen">
      <ScrollToDiscussion />
      <StoryReader
        key={slug}
        meta={meta}
        checkpoints={checkpoints}
        htmlContent={htmlContent}
        debrief={parseDebrief(raw.debrief)}
        prev={prev}
        next={next}
        totalCases={cases.length}
        views={<StoryViewsClient slug={slug} />}
        comments={<StoryComments storySlug={slug} />}
      />
    </main>
  );
}
