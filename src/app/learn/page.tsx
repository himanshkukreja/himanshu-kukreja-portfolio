import { getAllCourses } from "@/lib/github";
import Link from "next/link";
import { BookOpen, ArrowRight, Clock, FileText } from "lucide-react";
import AuthPromptBanner from "@/components/AuthPromptBanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // Always fetch fresh from GitHub

export const metadata = {
  title: "Learn | Himanshu Kukreja",
  description: "Free courses on system design, backend engineering, and distributed systems",
};

export default async function LearnPage() {
  const courses = await getAllCourses();

  return (
    <main className="min-h-screen pt-24 pb-16 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
            Learn
          </h1>
          <p className="text-lg text-gray-600 dark:text-white/70 max-w-2xl mx-auto">
            Free, comprehensive courses on system design and backend engineering.
            Learn at your own pace with battle-tested knowledge.
          </p>
        </div>

        {/* Auth Prompt Banner */}
        <div className="mb-12 max-w-4xl mx-auto">
          <AuthPromptBanner variant="learn-page" />
        </div>

        {/* Course Cards */}
        <div className={`grid gap-6 ${courses.length === 1 ? 'max-w-2xl mx-auto' : 'grid-cols-1 md:grid-cols-2'}`}>
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/learn/${course.id}`}
              className="group bg-black/5 dark:bg-white/5 backdrop-blur-sm rounded-lg border border-black/10 dark:border-white/10 p-6 hover:border-white/20 hover:bg-black/10 dark:hover:bg-white/10 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-blue-500/20 rounded-lg">
                  <BookOpen className="w-6 h-6 text-blue-400" />
                </div>
                <ArrowRight className="w-5 h-5 text-gray-500 dark:text-white/40 group-hover:text-gray-500 dark:text-white/60 group-hover:translate-x-1 transition-all" />
              </div>

              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3 group-hover:text-blue-400 transition-colors">
                {course.title}
              </h2>

              <p className="text-gray-600 dark:text-white/70 mb-6 line-clamp-2">
                {course.description}
              </p>

              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-white/60">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>{course.weeksCount} weeks</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span>{course.resourceCount} lessons</span>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-black/10 dark:border-white/10">
                <div className="flex items-center gap-2 text-blue-400 font-medium">
                  <span>Start learning</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Call to Action */}
        <div className="mt-12 text-center p-8 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg border border-black/10 dark:border-white/10">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Free Forever
          </h3>
          <p className="text-gray-500 dark:text-white/60">
            All courses are completely free. No sign-up required. Just start learning.
          </p>
        </div>
      </div>
    </main>
  );
}
