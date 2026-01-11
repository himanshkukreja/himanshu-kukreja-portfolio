"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  Clock,
  Target,
  TrendingUp,
  CheckCircle2,
  Circle,
  RotateCcw,
  ChevronLeft,
  Calendar,
  BarChart3,
  Trash2,
} from "lucide-react";
import { supabaseClient } from "@/lib/supabase-client";
import ConfirmDialog from "@/components/ConfirmDialog";

type ProgressData = {
  course_id: string;
  week: string;
  lesson_slug: string;
  progress_percentage: number;
  status: string;
  time_spent: number;
  last_accessed_at: string;
};

type WeekStats = {
  week: string;
  totalLessons: number;
  completedLessons: number;
  inProgressLessons: number;
  totalTimeSpent: number;
  averageProgress: number;
};

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [progressData, setProgressData] = useState<ProgressData[]>([]);
  const [weekStats, setWeekStats] = useState<WeekStats[]>([]);
  const [overallStats, setOverallStats] = useState({
    totalLessons: 0,
    completedLessons: 0,
    inProgressLessons: 0,
    totalTimeSpent: 0,
    overallProgress: 0,
  });
  const [recentActivity, setRecentActivity] = useState<ProgressData[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: "course" | "lesson" | null;
    lessonSlug?: string;
    week?: string;
  }>({ isOpen: false, type: null });
  const [isResetting, setIsResetting] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/learn");
    }
  }, [user, loading, router]);

  // Fetch progress data
  useEffect(() => {
    if (!user) return;

    async function fetchProgressData() {
      const { data, error } = await supabaseClient
        .from("learning_progress")
        .select("*")
        .eq("user_id", user!.id)
        .eq("course_id", "system-design-mastery")
        .order("last_accessed_at", { ascending: false });

      if (error) {
        console.error("[Dashboard] Error fetching progress:", error);
        return;
      }

      if (data) {
        setProgressData(data);
        calculateStats(data);
        setRecentActivity(data.slice(0, 10)); // Get 10 most recent
      }
    }

    fetchProgressData();
  }, [user]);

  // Calculate statistics
  function calculateStats(data: ProgressData[]) {
    // Overall stats
    const completed = data.filter((p) => p.status === "completed").length;
    const inProgress = data.filter((p) => p.status === "in_progress").length;
    const totalTime = data.reduce((sum, p) => sum + (p.time_spent || 0), 0);
    const avgProgress =
      data.length > 0
        ? Math.round(
            data.reduce((sum, p) => sum + p.progress_percentage, 0) / data.length
          )
        : 0;

    setOverallStats({
      totalLessons: data.length,
      completedLessons: completed,
      inProgressLessons: inProgress,
      totalTimeSpent: totalTime,
      overallProgress: avgProgress,
    });

    // Group by week
    const weekMap = new Map<string, ProgressData[]>();
    data.forEach((p) => {
      if (!weekMap.has(p.week)) {
        weekMap.set(p.week, []);
      }
      weekMap.get(p.week)!.push(p);
    });

    const weekStatsArray: WeekStats[] = [];
    weekMap.forEach((lessons, week) => {
      const completedCount = lessons.filter((l) => l.status === "completed").length;
      const inProgressCount = lessons.filter((l) => l.status === "in_progress").length;
      const totalTime = lessons.reduce((sum, l) => sum + (l.time_spent || 0), 0);
      const avgProgress =
        lessons.length > 0
          ? Math.round(
              lessons.reduce((sum, l) => sum + l.progress_percentage, 0) / lessons.length
            )
          : 0;

      weekStatsArray.push({
        week,
        totalLessons: lessons.length,
        completedLessons: completedCount,
        inProgressLessons: inProgressCount,
        totalTimeSpent: totalTime,
        averageProgress: avgProgress,
      });
    });

    // Sort weeks
    weekStatsArray.sort((a, b) => {
      if (a.week === "overview") return -1;
      if (b.week === "overview") return 1;
      if (a.week === "bonus-problems") return 1;
      if (b.week === "bonus-problems") return -1;
      return a.week.localeCompare(b.week);
    });

    setWeekStats(weekStatsArray);
  }

  // Reset entire course progress
  async function resetCourseProgress() {
    if (!user) return;

    setIsResetting(true);
    try {
      const { error } = await supabaseClient
        .from("learning_progress")
        .delete()
        .eq("user_id", user.id)
        .eq("course_id", "system-design-mastery");

      if (error) {
        console.error("[Dashboard] Error resetting course:", error);
        alert("Failed to reset progress. Please try again.");
      } else {
        // Refresh data
        setProgressData([]);
        setWeekStats([]);
        setOverallStats({
          totalLessons: 0,
          completedLessons: 0,
          inProgressLessons: 0,
          totalTimeSpent: 0,
          overallProgress: 0,
        });
        setRecentActivity([]);
        alert("Course progress has been reset!");
      }
    } catch (error) {
      console.error("[Dashboard] Error:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setIsResetting(false);
      setConfirmDialog({ isOpen: false, type: null });
    }
  }

  // Reset individual lesson progress
  async function resetLessonProgress(week: string, lessonSlug: string) {
    if (!user) return;

    setIsResetting(true);
    try {
      const { error } = await supabaseClient
        .from("learning_progress")
        .delete()
        .eq("user_id", user.id)
        .eq("course_id", "system-design-mastery")
        .eq("week", week)
        .eq("lesson_slug", lessonSlug);

      if (error) {
        console.error("[Dashboard] Error resetting lesson:", error);
        alert("Failed to reset lesson progress. Please try again.");
      } else {
        // Refresh data
        const newData = progressData.filter(
          (p) => !(p.week === week && p.lesson_slug === lessonSlug)
        );
        setProgressData(newData);
        calculateStats(newData);
        setRecentActivity(newData.slice(0, 10));
        alert("Lesson progress has been reset!");
      }
    } catch (error) {
      console.error("[Dashboard] Error:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setIsResetting(false);
      setConfirmDialog({ isOpen: false, type: null });
    }
  }

  // Format time spent
  function formatTimeSpent(seconds: number): string {
    if (!seconds || seconds < 60) {
      return "< 1 min";
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes} min`;
  }

  // Format week name
  function formatWeekName(week: string): string {
    if (week === "overview") return "Course Overview";
    if (week === "bonus-problems") return "Bonus Problems";
    if (week.includes("foundations")) return "Foundations";

    const match = week.match(/week-(\d+)-(.+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      const topic = match[2];
      return `Week ${String(num).padStart(2, "0")}: ${topic
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")}`;
    }

    return week;
  }

  if (loading || !user) {
    return (
      <main className="min-h-screen pt-24 pb-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center text-gray-500 dark:text-white/60">Loading...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-24 pb-16 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Back Link */}
        <Link
          href="/learn"
          className="inline-flex items-center gap-2 text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors mb-8"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Courses
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
              My Progress
            </h1>
            <p className="text-lg text-gray-600 dark:text-white/70">
              Track your learning journey and achievements
            </p>
          </div>

          {/* Reset Course Button */}
          {progressData.length > 0 && (
            <button
              onClick={() =>
                setConfirmDialog({ isOpen: true, type: "course" })
              }
              disabled={isResetting}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg transition-colors border border-red-500/30"
            >
              <RotateCcw className="w-4 h-4" />
              Reset All Progress
            </button>
          )}
        </div>

        {progressData.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-16 h-16 mx-auto text-gray-400 dark:text-white/40 mb-4" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              No Progress Yet
            </h3>
            <p className="text-gray-500 dark:text-white/60 mb-6">
              Start learning to track your progress!
            </p>
            <Link
              href="/learn/system-design-mastery"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all"
            >
              <BookOpen className="w-5 h-5" />
              Start Learning
            </Link>
          </div>
        ) : (
          <>
            {/* Overall Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-12">
              <StatCard
                icon={<BookOpen className="w-6 h-6" />}
                label="Total Lessons"
                value={overallStats.totalLessons.toString()}
                color="blue"
              />
              <StatCard
                icon={<CheckCircle2 className="w-6 h-6" />}
                label="Completed"
                value={overallStats.completedLessons.toString()}
                color="green"
              />
              <StatCard
                icon={<Circle className="w-6 h-6" />}
                label="In Progress"
                value={overallStats.inProgressLessons.toString()}
                color="yellow"
              />
              <StatCard
                icon={<Clock className="w-6 h-6" />}
                label="Time Spent"
                value={formatTimeSpent(overallStats.totalTimeSpent)}
                color="purple"
              />
              <StatCard
                icon={<Target className="w-6 h-6" />}
                label="Avg Progress"
                value={`${overallStats.overallProgress}%`}
                color="indigo"
              />
            </div>

            {/* Weekly Breakdown */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-blue-400" />
                Weekly Progress
              </h2>
              <div className="space-y-4">
                {weekStats.map((week) => (
                  <div
                    key={week.week}
                    className="bg-black/5 dark:bg-white/5 backdrop-blur-sm rounded-lg border border-black/10 dark:border-white/10 p-6"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        {formatWeekName(week.week)}
                      </h3>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-500 dark:text-white/60">
                          {week.completedLessons}/{week.totalLessons} completed
                        </span>
                        <span className="text-gray-500 dark:text-white/60">
                          {formatTimeSpent(week.totalTimeSpent)}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-2">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full transition-all duration-300"
                        style={{ width: `${week.averageProgress}%` }}
                      />
                    </div>
                    <div className="text-sm text-right text-gray-500 dark:text-white/60">
                      {week.averageProgress}% average progress
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <Calendar className="w-6 h-6 text-purple-400" />
                Recent Activity
              </h2>
              <div className="bg-black/5 dark:bg-white/5 backdrop-blur-sm rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
                {recentActivity.map((activity, index) => (
                  <div
                    key={`${activity.week}-${activity.lesson_slug}`}
                    className={`p-4 flex items-center justify-between ${
                      index !== recentActivity.length - 1
                        ? "border-b border-black/10 dark:border-white/10"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div
                        className={`flex-shrink-0 ${
                          activity.status === "completed"
                            ? "text-green-500 dark:text-green-400"
                            : activity.progress_percentage > 0
                            ? "text-blue-500 dark:text-blue-400"
                            : "text-gray-400 dark:text-white/40"
                        }`}
                      >
                        {activity.status === "completed" ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <Circle className="w-5 h-5" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 dark:text-white font-medium truncate">
                          {activity.lesson_slug.replace(/-/g, " ")}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-white/60">
                          {formatWeekName(activity.week)} •{" "}
                          {new Date(activity.last_accessed_at).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {activity.progress_percentage}%
                          </div>
                          <div className="text-xs text-gray-500 dark:text-white/60">
                            {formatTimeSpent(activity.time_spent || 0)}
                          </div>
                        </div>

                        {/* Reset Lesson Button */}
                        <button
                          onClick={() =>
                            setConfirmDialog({
                              isOpen: true,
                              type: "lesson",
                              week: activity.week,
                              lessonSlug: activity.lesson_slug,
                            })
                          }
                          disabled={isResetting}
                          className="p-2 hover:bg-red-500/10 text-red-600 dark:text-red-400 rounded-lg transition-colors"
                          title="Reset this lesson"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={
          confirmDialog.type === "course"
            ? "Reset All Progress?"
            : "Reset Lesson Progress?"
        }
        message={
          confirmDialog.type === "course"
            ? "Are you sure you want to reset all progress for this course? This action cannot be undone."
            : "Are you sure you want to reset progress for this lesson? This action cannot be undone."
        }
        confirmText="Reset"
        cancelText="Cancel"
        onConfirm={() => {
          if (confirmDialog.type === "course") {
            resetCourseProgress();
          } else if (
            confirmDialog.type === "lesson" &&
            confirmDialog.week &&
            confirmDialog.lessonSlug
          ) {
            resetLessonProgress(confirmDialog.week, confirmDialog.lessonSlug);
          }
        }}
        onCancel={() => setConfirmDialog({ isOpen: false, type: null })}
      />
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  const colorClasses = {
    blue: "text-blue-400",
    green: "text-green-400",
    yellow: "text-yellow-400",
    purple: "text-purple-400",
    indigo: "text-indigo-400",
  };

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-black/10 dark:border-white/10 p-4 text-center">
      <div className={`flex justify-center mb-2 ${colorClasses[color as keyof typeof colorClasses]}`}>
        {icon}
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="text-sm text-gray-500 dark:text-white/60">{label}</div>
    </div>
  );
}
