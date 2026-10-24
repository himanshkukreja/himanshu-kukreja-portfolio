import type { Metadata } from "next";
import { JsonLd, breadcrumbs, caseFileArticle } from "@/lib/seo/jsonld";
import { notFound } from "next/navigation";
import { getAllStories, getStorySource } from "@/lib/stories";
import { resolveCoverUrl } from "@/lib/utils";
import StoryViewsClient from "./views-client";
import StoryComments from "@/components/StoryComments";
import OnlineOnly from "@/components/offline/OnlineOnly";
import ScrollToDiscussion from "@/components/ScrollToDiscussion";
import StoryReader, { type CaseLink } from "@/components/stories/StoryReader";
import { renderStoryBody } from "@/components/stories/render-story";
import { termsFor } from "@/lib/concepts/load";
import { getCaseFiles } from "@/components/stories/case-files";
import { parseDebrief, resolveCaseType, type CaseFile } from "@/components/stories/case-types";

export const runtime = "nodejs"; // required for fs access on Vercel

// Repo stories (and CMS case files published before the build) are prerendered. Case files
// published later from the admin render on first request and are cached like the rest (ISR): the
// admin's publish / unpublish / edit calls revalidatePath for them. Unknown slugs: notFound()
// before anything streams, so it stays a real HTTP 404 (checked in the prod build).
export const dynamicParams = true;
export const revalidate = false;

export async function generateStaticParams() {
  const list = await getAllStories();
  return list.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const story = await getStorySource(slug);
  if (!story) return {};
  // Local covers stay relative so metadataBase (www) makes them absolute; remote covers pass through.
  const cover = resolveCoverUrl(story.cover);
  const title = story.seoTitle || story.title;
  const description = story.seoDescription || story.excerpt;
  const images = cover ? [{ url: cover, width: 1536, height: 1024, alt: story.coverAlt || story.title }] : undefined;
  return {
    title: `${title} · Case files`,
    description,
    alternates: { canonical: `/stories/${slug}` },
    openGraph: { type: "article", title, description, url: `/stories/${slug}`, ...(images ? { images } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(cover ? { images: [cover] } : {}) },
  };
}

function toLink(c: CaseFile | undefined): CaseLink | null {
  return c ? { slug: c.slug, caseId: c.caseId, type: c.type, title: c.title } : null;
}

export default async function StoryReadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = await getStorySource(slug);
  if (!story) return notFound();

  // Stories go through the same rich renderer as course lessons (diagrams, callouts, numbers sheets,
  // compare cards, highlighted code…); the plain pipeline stays as a fallback (render-story.ts).
  // hover definitions for course concepts the case file mentions (cards link into the course)
  const { htmlContent, checkpoints } = await renderStoryBody(story.body, { terms: await termsFor() });

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
      <JsonLd
        data={[
          caseFileArticle({ title: story.title, description: story.seoDescription || story.excerpt || "", path: `/stories/${slug}`, date: story.date, image: resolveCoverUrl(story.cover) || undefined }),
          breadcrumbs([
            { name: "Case files", path: "/stories" },
            { name: story.title, path: `/stories/${slug}` },
          ]),
        ]}
      />
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
        comments={
          <OnlineOnly what="The discussion">
            <StoryComments storySlug={slug} />
          </OnlineOnly>
        }
        activity={story.activity || undefined}
      />
    </main>
  );
}
