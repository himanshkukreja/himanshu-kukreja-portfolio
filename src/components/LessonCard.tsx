"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, CheckCircle2, Circle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseClient } from "@/lib/supabase-client";
import type { LearningResource } from "@/lib/github";

type LessonCardProps = {
  resource: LearningResource;
  course: string;
  readingTime?: string;
};

export default function LessonCard({ resource, course, readingTime }: LessonCardProps) {
  const { user } = useAuth();
  const [progress, setProgress] = useState<{
    percentage: number;
    status: string;
    last_accessed_at?: string;
    scroll_position?: number | null;
    mcq_attempted?: number;
    mcq_total?: number;
  } | null>(null);
  const [isCurrentlyReading, setIsCurrentlyReading] = useState(false);

  // Fetch progress for this lesson
  useEffect(() => {
    if (!user) {
      setProgress(null);
      setIsCurrentlyReading(false);
      return;
    }

    async function fetchProgress() {
      if (!user) return;

      const { data, error } = await supabaseClient
        .from("learning_progress")
        .select("progress_percentage, status, last_accessed_at, scroll_position")
        .eq("user_id", user.id)
        .eq("course_id", course)
        .eq("week", resource.week)
        .eq("lesson_slug", resource.slug)
        .maybeSingle();

      if (!error && data) {
        let mcqAttempted: number | undefined;
        let mcqTotal: number | undefined;

        // For MCQ documents, fetch attempted questions count
        if (resource.slug.includes('mcq')) {
          const { data: assessment } = await supabaseClient
            .from('mcq_assessments')
            .select('id, total_questions')
            .eq('course_id', course)
            .eq('week', resource.week)
            .eq('lesson_slug', resource.slug)
            .maybeSingle();

          if (assessment) {
            mcqTotal = assessment.total_questions;
            
            const { data: answers } = await supabaseClient
              .from('mcq_user_answers')
              .select('question_number')
              .eq('user_id', user.id)
              .eq('assessment_id', assessment.id);

            mcqAttempted = answers?.length || 0;
            
            // Update the progress percentage and status based on MCQ completion
            if (mcqTotal > 0) {
              data.progress_percentage = Math.round((mcqAttempted / mcqTotal) * 100);
              
              // Update status based on MCQ progress
              if (mcqAttempted === 0) {
                data.status = "not_started";
              } else if (mcqAttempted === mcqTotal) {
                data.status = "completed";
              } else {
                data.status = "in_progress";
              }
            }
          }
        }

        setProgress({
          percentage: data.progress_percentage || 0,
          status: data.status || "not_started",
          last_accessed_at: data.last_accessed_at,
          scroll_position: data.scroll_position,
          mcq_attempted: mcqAttempted,
          mcq_total: mcqTotal,
        });

        // Check if this is the most recently accessed in-progress lesson
        if (data.progress_percentage > 0 && data.status !== "completed") {
          const { data: allProgress, error: allError } = await supabaseClient
            .from("learning_progress")
            .select("lesson_slug, last_accessed_at")
            .eq("user_id", user.id)
            .eq("course_id", course)
            .neq("status", "completed")
            .gt("progress_percentage", 0)
            .order("last_accessed_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!allError && allProgress && allProgress.lesson_slug === resource.slug) {
            setIsCurrentlyReading(true);
          }
        }
      }
    }

    fetchProgress();
  }, [user, course, resource.week, resource.slug]);

  const getProgressColor = () => {
    if (!progress) return "text-gray-400 dark:text-white/40";
    if (progress.status === "completed") return "text-green-500 dark:text-green-400";
    if (progress.percentage > 0) return "text-blue-500 dark:text-blue-400";
    return "text-gray-400 dark:text-white/40";
  };

  const getProgressIcon = () => {
    if (!progress || progress.status === "not_started") {
      return <Circle className="w-5 h-5" />;
    }
    if (progress.status === "completed") {
      return <CheckCircle2 className="w-5 h-5" />;
    }
    return (
      <div className="relative w-5 h-5">
        <Circle className="w-5 h-5 text-gray-300 dark:text-gray-600" />
        <svg className="w-5 h-5 absolute top-0 left-0" viewBox="0 0 24 24">
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={`${(progress.percentage / 100) * 62.83} 62.83`}
            strokeLinecap="round"
            transform="rotate(-90 12 12)"
          />
        </svg>
      </div>
    );
  };

  // Build URL with scroll position if lesson has progress
  const getLessonUrl = () => {
    const baseUrl = `/learn/${course}/${resource.week}/${resource.slug}`;

    // Add scroll position if lesson is in progress (not completed and has scroll position)
    if (progress && progress.status !== "completed" && progress.scroll_position) {
      return `${baseUrl}#scroll-${progress.scroll_position}`;
    }

    return baseUrl;
  };

  return (
    <Link
      href={getLessonUrl()}
      className={`block p-3 sm:p-4 rounded-lg transition-all group ${
        isCurrentlyReading
          ? 'bg-blue-50/50 dark:bg-blue-900/20 border-2 border-blue-500/30 dark:border-blue-500/40'
          : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10'
      }`}
    >
      <div className="flex items-start justify-between gap-2 sm:gap-4">
        <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
          {/* Progress Indicator */}
          <div className={`flex-shrink-0 mt-0.5 ${getProgressColor()}`}>
            {getProgressIcon()}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
              <h3 className="text-sm sm:text-base text-gray-900 dark:text-white font-medium group-hover:text-blue-400 transition-colors break-words">
                {resource.title}
              </h3>
              {isCurrentlyReading && (
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded text-xs font-medium flex-shrink-0 w-fit">
                  Currently Reading
                </span>
              )}
            </div>

            {/* Metadata */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1.5 sm:mt-2 text-xs text-gray-500 dark:text-white/50">
              {resource.day && (
                <span className="flex-shrink-0">{resource.day.replace("day-", "Day ")}</span>
              )}

              {readingTime && (
                <span className="flex items-center gap-1 flex-shrink-0">
                  <Clock className="w-3 h-3" />
                  {readingTime}
                </span>
              )}

              {progress && progress.percentage > 0 && progress.status !== "completed" && (
                <span className="text-blue-500 dark:text-blue-400 font-medium flex-shrink-0">
                  {progress.mcq_attempted !== undefined && progress.mcq_total !== undefined
                    ? `${progress.mcq_attempted}/${progress.mcq_total} questions attempted`
                    : `${progress.percentage}% complete`}
                </span>
              )}

              {progress && progress.status === "completed" && (
                <span className="text-green-500 dark:text-green-400 font-medium flex-shrink-0">
                  ✓ Completed
                </span>
              )}
            </div>

            {/* Progress Bar */}
            {progress && progress.percentage > 0 && progress.status !== "completed" && (
              <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1 sm:h-1.5 overflow-hidden">
                <div
                  className="h-full bg-blue-500 dark:bg-blue-400 transition-all duration-300 rounded-full"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Arrow */}
        <svg
          className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 dark:text-white/40 group-hover:text-gray-600 dark:group-hover:text-white/60 group-hover:translate-x-1 transition-all flex-shrink-0 mt-0.5 sm:mt-1"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </Link>
  );
}
