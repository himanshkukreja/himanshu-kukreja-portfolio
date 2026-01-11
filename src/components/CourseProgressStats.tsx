"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseClient } from "@/lib/supabase-client";
import { TrendingUp, CheckCircle2, Loader2 } from "lucide-react";

type CourseProgressStatsProps = {
  courseId: string;
  totalLessons: number;
};

export default function CourseProgressStats({
  courseId,
  totalLessons,
}: CourseProgressStatsProps) {
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<{
    completedLessons: number;
    inProgressLessons: number;
    overallProgress: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setLoading(false);
      return;
    }

    async function fetchProgress() {
      if (!user) return;

      try {
        const { data, error } = await supabaseClient
          .from("learning_progress")
          .select("progress_percentage, status")
          .eq("user_id", user.id)
          .eq("course_id", courseId);

        if (error) {
          console.error("[CourseProgressStats] Error fetching progress:", error);
          return;
        }

        if (data && data.length > 0) {
          const completed = data.filter((p) => p.status === "completed").length;
          const inProgress = data.filter((p) => p.status === "in_progress").length;

          // Calculate overall progress as percentage of total lessons
          const overallProgress = Math.round((completed / totalLessons) * 100);

          setStats({
            completedLessons: completed,
            inProgressLessons: inProgress,
            overallProgress,
          });
        } else {
          // No progress yet
          setStats({
            completedLessons: 0,
            inProgressLessons: 0,
            overallProgress: 0,
          });
        }
      } catch (error) {
        console.error("[CourseProgressStats] Error:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchProgress();
  }, [user, authLoading, courseId, totalLessons]);

  // Don't show anything if not authenticated or still loading
  if (authLoading || loading || !user || !stats) {
    return null;
  }

  // Don't show if no progress yet
  if (stats.completedLessons === 0 && stats.inProgressLessons === 0) {
    return null;
  }

  return (
    <div className="mb-6 sm:mb-8 bg-gradient-to-r from-green-500/10 to-blue-500/10 dark:from-green-500/10 dark:to-blue-500/10 border border-green-500/20 dark:border-green-500/20 rounded-xl p-4 sm:p-6">
      <div className="flex flex-col gap-4">
        {/* Progress Info */}
        <div className="w-full">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
              Your Progress
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-white/70">
            {stats.completedLessons} of {totalLessons} lessons completed
            {stats.inProgressLessons > 0 && (
              <span className="text-blue-400"> • {stats.inProgressLessons} in progress</span>
            )}
          </p>
        </div>

        {/* Progress Bar and Badge */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-6">
          {/* Progress Bar */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500 dark:text-white/60">Overall Progress</span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                {stats.overallProgress}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 sm:h-3">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${stats.overallProgress}%` }}
              />
            </div>
          </div>

          {/* Completion Badge */}
          <div className="flex items-center justify-center gap-2 px-4 py-2 bg-green-500/20 dark:bg-green-500/20 text-green-600 dark:text-green-400 rounded-lg flex-shrink-0 w-full sm:w-auto">
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-sm font-semibold">
              {stats.completedLessons}/{totalLessons}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
