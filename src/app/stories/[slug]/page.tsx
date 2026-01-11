import { notFound } from "next/navigation";
import { getStoryBySlug, getAllStories } from "@/lib/stories";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Home, BookOpen } from "lucide-react";
import CoverImage from "@/components/CoverImage";
import StoryViewsClient from "./views-client";
import { extractHeadings, addHeadingIds } from "@/lib/toc";
import TableOfContents from "@/components/TableOfContents";
import FocusMode from "@/components/FocusMode";
import ReadingProgress from "@/components/ReadingProgress";

export const runtime = "nodejs"; // required for fs access on Vercel

export async function generateStaticParams() {
  const list = await getAllStories();
  return list.map((s) => ({ slug: s.slug }));
}

export default async function StoryReadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = await getStoryBySlug(slug);
  if (!story) return notFound();

  // Add IDs to headings for anchor links
  let htmlContent = addHeadingIds(story.content);

  // Extract headings for Table of Contents
  const headings = extractHeadings(htmlContent);

  // Get all stories for navigation
  const allStories = await getAllStories();
  const currentIndex = allStories.findIndex(s => s.slug === slug);
  const previousStory = currentIndex < allStories.length - 1 ? allStories[currentIndex + 1] : null;
  const nextStory = currentIndex > 0 ? allStories[currentIndex - 1] : null;

  return (
    <>
      <ReadingProgress />
      <main className="min-h-screen pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-6">
          {/* Breadcrumb */}
          <div className="mb-8 flex items-center gap-2 text-sm text-gray-500 dark:text-white/60">
            <Link href="/" className="hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-1">
              <Home className="w-4 h-4" />
              Home
            </Link>
            <ChevronRight className="w-4 h-4" />
            <Link href="/stories" className="hover:text-gray-900 dark:hover:text-white transition-colors">
              Stories
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-900 dark:text-white">{story.title}</span>
          </div>

          <FocusMode
            sidebarLeft={
              <div className="sticky top-24 bg-black/5 dark:bg-white/5 backdrop-blur-sm rounded-lg border border-black/10 dark:border-white/10 p-4">
                <h3 className="text-gray-900 dark:text-white font-semibold mb-4 flex items-center gap-2 text-sm">
                  <BookOpen className="w-4 h-4" />
                  All Stories
                </h3>
                <nav className="space-y-1 max-h-[60vh] overflow-y-auto">
                  {allStories.map((s) => (
                    <Link
                      key={s.slug}
                      href={`/stories/${s.slug}`}
                      className={`block px-3 py-2 rounded text-xs transition-all ${
                        s.slug === slug
                          ? 'bg-blue-500/20 text-blue-400 font-medium'
                          : 'text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      <div className="truncate">{s.title}</div>
                      {s.date && (
                        <div className="text-[10px] opacity-60 mt-1">
                          {new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                    </Link>
                  ))}
                </nav>
              </div>
            }
            sidebarRight={<TableOfContents headings={headings} />}
          >
            <article>
              <header className="mb-10">
                {/* Cover image first */}
                {story.cover && (
                  <div className="mb-6 -mx-6 md:mx-0">
                    <CoverImage
                      src={story.cover}
                      alt={story.title}
                      width={1200}
                      height={630}
                      priority
                    />
                  </div>
                )}

                {/* Title */}
                <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900 dark:text-white">{story.title}</h1>

                {/* Meta info */}
                <div className="mt-4 flex items-center gap-4 text-sm text-gray-500 dark:text-white/60">
                  {story.date && (
                    <time dateTime={story.date}>
                      {new Date(story.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </time>
                  )}
                  <StoryViewsClient slug={slug} />
                </div>

                {/* Tags */}
                {story.tags && story.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {/* Remove duplicates and map with index for unique keys */}
                    {Array.from(new Set(story.tags)).map((tag, index) => (
                      <span
                        key={`${tag}-${index}`}
                        className="inline-flex items-center rounded-full bg-gradient-to-r from-indigo-500/15 to-blue-500/15 px-3 py-1 text-xs text-gray-700 dark:text-white/85 ring-1 ring-inset ring-black/10 dark:ring-white/10"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </header>

              {/* Story Content */}
              <div className="md-content">
                <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
              </div>

              {/* Navigation */}
              <nav className="mt-12 pt-8 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-4">
                {previousStory ? (
                  <Link
                    href={`/stories/${previousStory.slug}`}
                    className="flex items-center gap-2 px-4 py-3 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-all group"
                  >
                    <ChevronLeft className="w-5 h-5 text-gray-500 dark:text-white/60 group-hover:text-gray-900 dark:group-hover:text-white group-hover:-translate-x-1 transition-all" />
                    <div className="text-left">
                      <div className="text-xs text-gray-500 dark:text-white/40">Previous</div>
                      <div className="text-gray-900 dark:text-white text-sm font-medium line-clamp-1">{previousStory.title}</div>
                    </div>
                  </Link>
                ) : (
                  <div />
                )}

                {nextStory ? (
                  <Link
                    href={`/stories/${nextStory.slug}`}
                    className="flex items-center gap-2 px-4 py-3 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-all group"
                  >
                    <div className="text-right">
                      <div className="text-xs text-gray-500 dark:text-white/40">Next</div>
                      <div className="text-gray-900 dark:text-white text-sm font-medium line-clamp-1">{nextStory.title}</div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-500 dark:text-white/60 group-hover:text-gray-900 dark:group-hover:text-white group-hover:translate-x-1 transition-all" />
                  </Link>
                ) : (
                  <div />
                )}
              </nav>

              {/* Back to Stories */}
              <div className="mt-8 text-center">
                <Link
                  href="/stories"
                  className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back to All Stories
                </Link>
              </div>
            </article>
          </FocusMode>
        </div>
      </main>
    </>
  );
}
