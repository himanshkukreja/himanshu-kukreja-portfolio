import { getLearningResource, getWeekResources } from "@/lib/github";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Home, BookOpen } from "lucide-react";
import { markdownToHtml } from "@/lib/markdown";
import { extractHeadings, addHeadingIds } from "@/lib/toc";
import TableOfContents from "@/components/TableOfContents";
import LessonContentWrapper from "@/components/LessonContentWrapper";
import FocusMode from "@/components/FocusMode";
import ReadingProgress from "@/components/ReadingProgress";
import SearchBar from "@/components/SearchBar";
import SearchHighlight from "@/components/SearchHighlight";
import BookmarkButton from "@/components/BookmarkButton";

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

  if (!data) {
    return {
      title: "Not Found",
    };
  }

  return {
    title: `${data.resource.title} | System Design Mastery`,
    description: `Learn ${data.resource.title} - Part of the ${week.toUpperCase()} curriculum`,
  };
}

export default async function LearningResourcePage({ params }: Props) {
  const { course, week, slug } = await params;
  const data = await getLearningResource(week, slug);

  if (!data) {
    notFound();
  }

  const { resource, content } = data;

  // Convert markdown to HTML
  let htmlContent = await markdownToHtml(content);

  // Add IDs to headings for anchor links
  htmlContent = addHeadingIds(htmlContent);

  // Extract headings for Table of Contents
  const headings = extractHeadings(htmlContent);

  // Get navigation (previous/next resources)
  const weekResources = await getWeekResources(week);
  const currentIndex = weekResources.findIndex(r => r.slug === slug);
  const previousResource = currentIndex > 0 ? weekResources[currentIndex - 1] : null;
  const nextResource = currentIndex < weekResources.length - 1 ? weekResources[currentIndex + 1] : null;

  // Get all resources for week navigation sidebar
  const allWeekResources = await getWeekResources(week);

  // Format week display name
  const formatWeekName = (weekKey: string): string => {
    if (weekKey === 'overview') return 'Overview';
    if (weekKey.includes('foundations')) return 'Foundations';

    // Extract week number from format: week-01-data-at-scale -> Week 1
    const match = weekKey.match(/week-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      return `Week ${num}`;
    }

    return weekKey.replace('week-', 'Week ');
  };

  const weekDisplayName = formatWeekName(week);

  return (
    <>
      <ReadingProgress />
      <SearchHighlight />
      <main className="min-h-screen pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-6">
        {/* Breadcrumb */}
        <div className="mb-8 flex items-center gap-2 text-sm text-gray-500 dark:text-white/60">
          <Link href="/learn" className="hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-1">
            <Home className="w-4 h-4" />
            Learn
          </Link>
          <ChevronRight className="w-4 h-4" />
          <Link href={`/learn/${course}`} className="hover:text-gray-900 dark:hover:text-white transition-colors">
            System Design
          </Link>
          <ChevronRight className="w-4 h-4" />
          <Link href={`/learn/${course}`} className="hover:text-gray-900 dark:hover:text-white transition-colors">
            {weekDisplayName}
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gray-900 dark:text-white">{resource.title}</span>
        </div>

        {/* Floating Search Button */}
        <SearchBar variant="floating" />

        <FocusMode
          sidebarLeft={
            <div className="sticky top-24 bg-black/5 dark:bg-white/5 backdrop-blur-sm rounded-lg border border-black/10 dark:border-white/10 p-4">
              <h3 className="text-gray-900 dark:text-white font-semibold mb-4 flex items-center gap-2 text-sm">
                <BookOpen className="w-4 h-4" />
                {weekDisplayName}
              </h3>
              <nav className="space-y-1">
                {allWeekResources.map((r) => (
                  <Link
                    key={r.slug}
                    href={`/learn/${course}/${r.week}/${r.slug}`}
                    className={`block px-3 py-2 rounded text-xs transition-all ${
                      r.slug === slug
                        ? 'bg-blue-500/20 text-blue-400 font-medium'
                        : 'text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {r.day && (
                        <span className="text-xs opacity-60">
                          {r.day.replace('day-', 'D')}
                        </span>
                      )}
                      <span className="truncate">{r.title}</span>
                    </div>
                  </Link>
                ))}
              </nav>
            </div>
          }
          sidebarRight={<TableOfContents headings={headings} />}
        >
          {/* Badges and Actions */}
          <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
            <div className="flex items-center gap-3">
              {resource.type === 'capstone' && (
                <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm font-medium">
                  Capstone
                </span>
              )}
              {resource.type === 'week-preview' && (
                <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium">
                  Week Preview
                </span>
              )}
              {resource.type === 'foundations' && (
                <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm font-medium">
                  Foundation
                </span>
              )}
              {resource.day && (
                <span className="px-3 py-1 bg-black/10 dark:bg-white/10 text-gray-600 dark:text-white/70 rounded-full text-sm">
                  {resource.day.replace('day-', 'Day ')}
                </span>
              )}
            </div>

            {/* Bookmark Button */}
            <BookmarkButton
              courseId={course}
              week={week}
              lessonSlug={slug}
              lessonTitle={resource.title}
            />
          </div>

          {/* Markdown Content with Read Aloud */}
          <LessonContentWrapper
            htmlContent={htmlContent}
            courseId={course}
            week={week}
            lessonSlug={slug}
            lessonTitle={resource.title}
          />

          {/* Navigation */}
          <nav className="mt-12 pt-8 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-4">
            {previousResource ? (
              <Link
                href={`/learn/${course}/${previousResource.week}/${previousResource.slug}`}
                className="flex items-center gap-2 px-4 py-3 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-all group"
              >
                <ChevronLeft className="w-5 h-5 text-gray-500 dark:text-white/60 group-hover:text-gray-900 dark:hover:text-white group-hover:-translate-x-1 transition-all" />
                <div className="text-left">
                  <div className="text-xs text-gray-500 dark:text-white/40">Previous</div>
                  <div className="text-gray-900 dark:text-white text-sm font-medium">{previousResource.title}</div>
                </div>
              </Link>
            ) : (
              <div /> // Spacer
            )}

            {nextResource ? (
              <Link
                href={`/learn/${course}/${nextResource.week}/${nextResource.slug}`}
                className="flex items-center gap-2 px-4 py-3 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-all group"
              >
                <div className="text-right">
                  <div className="text-xs text-gray-500 dark:text-white/40">Next</div>
                  <div className="text-gray-900 dark:text-white text-sm font-medium">{nextResource.title}</div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500 dark:text-white/60 group-hover:text-gray-900 dark:hover:text-white group-hover:translate-x-1 transition-all" />
              </Link>
            ) : (
              <div /> // Spacer
            )}
          </nav>

          {/* Back to Course */}
          <div className="mt-8 text-center">
            <Link
              href={`/learn/${course}`}
              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Course Overview
            </Link>
          </div>
        </FocusMode>
      </div>
    </main>
    </>
  );
}
