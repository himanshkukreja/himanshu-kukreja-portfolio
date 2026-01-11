import { getAllLearningResources, getAllCourses, fetchMarkdownContent } from "@/lib/github";
import { calculateReadingTime } from "@/lib/reading-time";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BookOpen, Calendar, Award, Target, ChevronLeft } from "lucide-react";
import CollapsibleWeek from "@/components/CollapsibleWeek";
import SearchBar from "@/components/SearchBar";
import AuthPromptBanner from "@/components/AuthPromptBanner";
import ContinueReadingBanner from "@/components/ContinueReadingBanner";
import CourseProgressStats from "@/components/CourseProgressStats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{
    course: string;
  }>;
};

export async function generateMetadata({ params }: Props) {
  const { course } = await params;
  const courses = await getAllCourses();
  const courseData = courses.find(c => c.id === course);

  if (!courseData) {
    return {
      title: "Not Found",
    };
  }

  return {
    title: `${courseData.title} | Learn`,
    description: courseData.description,
  };
}

export default async function CoursePage({ params }: Props) {
  const { course } = await params;

  // Get course data
  const courses = await getAllCourses();
  const courseData = courses.find(c => c.id === course);

  if (!courseData) {
    notFound();
  }

  // Get all resources for this course
  const allResources = await getAllLearningResources();
  const resources = allResources.filter(r => r.course === course);

  // Calculate reading times for all resources
  const readingTimes: Record<string, string> = {};
  await Promise.all(
    resources.map(async (resource) => {
      try {
        const content = await fetchMarkdownContent(resource.path);
        const { text } = calculateReadingTime(content);
        readingTimes[resource.slug] = text;
      } catch (error) {
        console.log(`[ReadingTime] Error calculating for ${resource.slug}:`, error);
        readingTimes[resource.slug] = '5 min read'; // Default fallback
      }
    })
  );

  // Group resources by week
  const resourcesByWeek = resources.reduce((acc, resource) => {
    if (!acc[resource.week]) {
      acc[resource.week] = [];
    }
    acc[resource.week].push(resource);
    return acc;
  }, {} as Record<string, typeof resources>);

  // Sort weeks
  const sortedWeeks = Object.keys(resourcesByWeek).sort((a, b) => {
    if (a === 'overview') return -1;
    if (b === 'overview') return 1;
    if (a === 'bonus-problems') return 1;  // bonus-problems at the end
    if (b === 'bonus-problems') return -1; // bonus-problems at the end
    return a.localeCompare(b);
  });

  return (
    <main className="min-h-screen pt-24 pb-16 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Back Link */}
        <Link
          href="/learn"
          className="inline-flex items-center gap-2 text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors mb-8"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Courses
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
            {courseData.title}
          </h1>
          <p className="text-lg text-gray-600 dark:text-white/70 max-w-2xl">
            {courseData.description}
          </p>
        </div>

        {/* Search Bar */}
        <div className="mb-8">
          <SearchBar />
        </div>

        {/* Auth Prompt Banner */}
        <div className="mb-8">
          <AuthPromptBanner variant="learn-page" />
        </div>

        {/* Continue Reading Banner */}
        <ContinueReadingBanner courseId={course} />

        {/* Course Progress Stats */}
        <CourseProgressStats courseId={course} totalLessons={resources.length} />

        {/* Course Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <StatCard
            icon={<Calendar className="w-6 h-6" />}
            label="Weeks"
            value={courseData.weeksCount.toString()}
          />
          <StatCard
            icon={<BookOpen className="w-6 h-6" />}
            label="Resources"
            value={courseData.resourceCount.toString()}
          />
          <StatCard
            icon={<Target className="w-6 h-6" />}
            label="Time/Day"
            value="2-3 hours"
          />
          <StatCard
            icon={<Award className="w-6 h-6" />}
            label="Capstones"
            value={resources.filter(r => r.type === 'capstone').length.toString()}
          />
        </div>

        {/* Learning Path */}
        <div className="space-y-8">
          {sortedWeeks.map((weekKey) => {
            const weekResources = resourcesByWeek[weekKey];

            // Extract week number and topic name
            let weekBadge = '';
            let topicName = '';

            if (weekKey === 'overview') {
              topicName = 'Course Overview';
            } else if (weekKey === 'bonus-problems') {
              topicName = 'Bonus Problems';
            } else if (weekKey.includes('foundations')) {
              topicName = 'Foundations';
              weekBadge = 'Week 00'; // Show Week 00 badge for foundations
            } else {
              // Extract from format: week-01-data-at-scale
              const match = weekKey.match(/week-(\d+)-(.+)/);
              if (match) {
                const num = parseInt(match[1], 10);
                const topic = match[2];
                weekBadge = `Week ${String(num).padStart(2, '0')}`; // Week 01, Week 02, etc.
                // Convert "data-at-scale" to "Data At Scale"
                topicName = topic
                  .split('-')
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ');
              } else {
                topicName = weekKey.replace('week-', 'Week ');
              }
            }

            return (
              <CollapsibleWeek
                key={weekKey}
                weekKey={weekKey}
                weekNumber={topicName}
                weekBadge={weekBadge}
                resources={weekResources}
                course={course}
                defaultOpen={weekKey === 'overview'}
                readingTimes={readingTimes}
              />
            );
          })}
        </div>

        {/* Footer CTA */}
        <div className="mt-12 text-center p-8 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg border border-black/10 dark:border-white/10">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Ready to Master System Design?
          </h3>
          <p className="text-gray-500 dark:text-white/60 mb-4">
            Start with the course overview and work your way up to advanced distributed systems.
          </p>
          {sortedWeeks.length > 0 && (
            <Link
              href={`/learn/${course}/${sortedWeeks[0]}/${resourcesByWeek[sortedWeeks[0]][0].slug}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-gray-900 dark:text-white rounded-lg transition-all"
            >
              <BookOpen className="w-5 h-5" />
              Start Learning
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-black/10 dark:border-white/10 p-4 text-center">
      <div className="flex justify-center mb-2 text-blue-400">{icon}</div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="text-sm text-gray-500 dark:text-white/60">{label}</div>
    </div>
  );
}
