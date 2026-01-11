"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseClient } from "@/lib/supabase-client";
import { BookOpen, Play, Clock } from "lucide-react";

type LastLesson = {
  course_id: string;
  week: string;
  lesson_slug: string;
  progress_percentage: number;
  status: string;
  last_accessed_at: string;
  scroll_position: number | null;
};

type ContinueReadingBannerProps = {
  courseId: string;
  lessonTitle?: string; // Optional: pass the lesson title if you have it
};

export default function ContinueReadingBanner({ courseId, lessonTitle }: ContinueReadingBannerProps) {
  const { user } = useAuth();
  const [lastLesson, setLastLesson] = useState<LastLesson | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    async function fetchLastLesson() {
      if (!user) return;

      try {
        // Get the most recently accessed lesson that's not completed
        const { data, error } = await supabaseClient
          .from("learning_progress")
          .select("course_id, week, lesson_slug, progress_percentage, status, last_accessed_at, scroll_position")
          .eq("user_id", user.id)
          .eq("course_id", courseId)
          .neq("status", "completed") // Only show in-progress lessons
          .gt("progress_percentage", 0) // Must have some progress
          .order("last_accessed_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("[ContinueReading] Error fetching last lesson:", error);
          setLoading(false);
          return;
        }

        if (data) {
          setLastLesson(data);
          console.log("[ContinueReading] Last lesson:", data);
        }

        setLoading(false);
      } catch (error) {
        console.error("[ContinueReading] Error:", error);
        setLoading(false);
      }
    }

    fetchLastLesson();
  }, [user, courseId]);

  // Don't show anything if no user, loading, or no last lesson
  if (!user || loading || !lastLesson) {
    return null;
  }

  // Format the lesson title from slug
  const formatLessonTitle = (slug: string) => {
    return slug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Format week name
  const formatWeekName = (week: string) => {
    if (week === "overview") return "Overview";
    if (week.includes("foundations")) return "Foundations";
    const match = week.match(/week-(\d+)/);
    if (match) {
      return `Week ${parseInt(match[1], 10)}`;
    }
    return week;
  };

  // Format time ago
  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) {
      return diffMins <= 1 ? "just now" : `${diffMins} minutes ago`;
    } else if (diffHours < 24) {
      return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
    } else if (diffDays === 1) {
      return "yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className="bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 dark:from-blue-500/20 dark:via-purple-500/20 dark:to-pink-500/20 rounded-xl border-2 border-blue-500/30 dark:border-blue-500/40 p-4 sm:p-6 mb-6 sm:mb-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3 sm:gap-4 flex-1 w-full sm:w-auto">
          {/* Icon */}
          <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-blue-500/20 dark:bg-blue-500/30 rounded-full flex items-center justify-center">
            <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                Continue Reading
              </h3>
              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded text-xs font-medium w-fit">
                {lastLesson.progress_percentage}% complete
              </span>
            </div>

            <p className="text-sm sm:text-base text-gray-600 dark:text-white/70 mb-2 truncate">
              {lessonTitle || formatLessonTitle(lastLesson.lesson_slug)}
            </p>

            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500 dark:text-white/50">
              <span className="truncate">{formatWeekName(lastLesson.week)}</span>
              <span className="flex items-center gap-1 flex-shrink-0">
                <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                {getTimeAgo(lastLesson.last_accessed_at)}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 sm:h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300 rounded-full"
                style={{ width: `${lastLesson.progress_percentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Continue Button */}
        <Link
          href={`/learn/${lastLesson.course_id}/${lastLesson.week}/${lastLesson.lesson_slug}${
            lastLesson.scroll_position ? `#scroll-${lastLesson.scroll_position}` : ""
          }`}
          className="w-full sm:w-auto flex-shrink-0 px-5 sm:px-6 py-2.5 sm:py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2 group text-sm sm:text-base"
        >
          <Play className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          Continue
        </Link>
      </div>
    </div>
  );
}
