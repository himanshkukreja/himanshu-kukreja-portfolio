"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseClient } from "@/lib/supabase-client";

type LessonProgressTrackerProps = {
  courseId: string;
  week: string;
  lessonSlug: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
};

export default function LessonProgressTracker({
  courseId,
  week,
  lessonSlug,
  contentRef,
}: LessonProgressTrackerProps) {
  const { user } = useAuth();
  const [progress, setProgress] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const lastSaveRef = useRef<number>(0);
  const hasMarkedCompleteRef = useRef(false);
  const lastScrollPositionRef = useRef<number>(0); // Track last scroll position
  const lastProgressRef = useRef<number>(0); // Track last progress percentage
  const existingTimeSpentRef = useRef<number>(0); // Track existing time from DB

  // Calculate scroll progress
  const calculateProgress = useCallback(() => {
    if (!contentRef.current) return 0;

    const element = contentRef.current;
    const scrollTop = window.scrollY;
    const elementTop = element.offsetTop;
    const elementHeight = element.scrollHeight;
    const windowHeight = window.innerHeight;

    // Calculate how much of the content has been scrolled
    const scrolled = scrollTop + windowHeight - elementTop;
    const total = elementHeight;

    const percentage = Math.min(100, Math.max(0, Math.round((scrolled / total) * 100)));

    return percentage;
  }, [contentRef]);

  // Save progress to database
  const saveProgress = useCallback(
    async (percentage: number, forceComplete = false) => {
      if (!user) return;

      const now = Date.now();
      const sessionTimeSpent = Math.floor((now - startTimeRef.current) / 1000); // seconds in current session
      const totalTimeSpent = existingTimeSpentRef.current + sessionTimeSpent; // accumulate total time

      const status = forceComplete || percentage >= 90 ? "completed" : percentage > 0 ? "in_progress" : "not_started";

      try {
        // Save absolute scroll position - simpler and more reliable
        const scrollPosition = Math.round(window.scrollY);

        console.log(`[Progress] Saving: ${percentage}% at scroll position ${scrollPosition}px (${sessionTimeSpent}s this session, ${totalTimeSpent}s total)`);

        const updateData: any = {
          progress_percentage: percentage,
          status,
          time_spent: totalTimeSpent, // Use accumulated total time
          scroll_position: scrollPosition,
          last_accessed_at: new Date().toISOString(),
        };

        if (status === "in_progress" && !hasMarkedCompleteRef.current) {
          updateData.started_at = new Date().toISOString();
        }

        if (status === "completed" && !hasMarkedCompleteRef.current) {
          updateData.completed_at = new Date().toISOString();
          hasMarkedCompleteRef.current = true;
          setIsCompleted(true);
        }

        const { error } = await supabaseClient
          .from("learning_progress")
          .upsert(
            {
              user_id: user.id,
              course_id: courseId,
              week,
              lesson_slug: lessonSlug,
              ...updateData,
            },
            {
              onConflict: "user_id,course_id,week,lesson_slug",
            }
          );

        if (error) {
          console.error("[Progress] Error saving:", error);
        } else {
          console.log(`[Progress] Saved: ${percentage}% (${status})`);
          lastSaveRef.current = now;
        }
      } catch (error) {
        console.error("[Progress] Error:", error);
      }
    },
    [user, courseId, week, lessonSlug]
  );

  // Load existing progress on mount
  useEffect(() => {
    if (!user) return;

    async function loadProgress() {
      const { data, error } = await supabaseClient
        .from("learning_progress")
        .select("progress_percentage, status, time_spent")
        .eq("user_id", user!.id)
        .eq("course_id", courseId)
        .eq("week", week)
        .eq("lesson_slug", lessonSlug)
        .maybeSingle();

      if (!error && data) {
        setProgress(data.progress_percentage || 0);
        setIsCompleted(data.status === "completed");
        hasMarkedCompleteRef.current = data.status === "completed";
        existingTimeSpentRef.current = data.time_spent || 0; // Store existing time
        console.log("[Progress] Loaded:", data.progress_percentage, "%", data.status, `(${data.time_spent || 0}s spent)`);
      }
    }

    loadProgress();
  }, [user, courseId, week, lessonSlug]);

  // Track scroll progress
  useEffect(() => {
    if (!user) return;

    const handleScroll = () => {
      const currentProgress = calculateProgress();
      const currentScrollY = window.scrollY;

      // Update refs with current values
      lastProgressRef.current = currentProgress;
      lastScrollPositionRef.current = currentScrollY;

      setProgress(currentProgress);

      // Save progress every 10% change or every 30 seconds
      const now = Date.now();
      const shouldSave =
        Math.abs(currentProgress - progress) >= 10 || now - lastSaveRef.current > 30000;

      if (shouldSave) {
        console.log(`[Progress] Auto-saving: ${currentProgress}% at ${currentScrollY}px`);
        saveProgress(currentProgress);
      }

      // Auto-complete at 90% scroll
      if (currentProgress >= 90 && !hasMarkedCompleteRef.current) {
        console.log(`[Progress] Auto-completing at ${currentProgress}%`);
        saveProgress(currentProgress, true);
      }
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll(); // Initial calculation

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [user, calculateProgress, saveProgress, progress]);

  // Save progress on unmount (when leaving page)
  useEffect(() => {
    return () => {
      // Use refs instead of state to avoid stale closure values
      // By the time unmount runs, window.scrollY may have reset to 0
      if (user && lastProgressRef.current > 0) {
        const savedProgress = lastProgressRef.current;
        const savedScrollPos = lastScrollPositionRef.current;

        console.log(`[Progress] Unmounting - saving last known values: ${savedProgress}% at ${savedScrollPos}px`);

        // Create a custom save that uses the ref values instead of window.scrollY
        const saveOnUnmount = async () => {
          const now = Date.now();
          const sessionTimeSpent = Math.floor((now - startTimeRef.current) / 1000);
          const totalTimeSpent = existingTimeSpentRef.current + sessionTimeSpent; // accumulate total time
          const status = savedProgress >= 90 ? "completed" : savedProgress > 0 ? "in_progress" : "not_started";

          try {
            await supabaseClient.from("learning_progress").upsert(
              {
                user_id: user.id,
                course_id: courseId,
                week,
                lesson_slug: lessonSlug,
                progress_percentage: savedProgress,
                status,
                time_spent: totalTimeSpent, // Use accumulated total time
                scroll_position: savedScrollPos, // Use the ref value, not window.scrollY!
                last_accessed_at: new Date().toISOString(),
              },
              {
                onConflict: "user_id,course_id,week,lesson_slug",
              }
            );
            console.log(`[Progress] Unmount save complete: ${savedProgress}% at ${savedScrollPos}px (${totalTimeSpent}s total)`);
          } catch (error) {
            console.error("[Progress] Error saving on unmount:", error);
          }
        };

        saveOnUnmount();
      }
    };
  }, [user, courseId, week, lessonSlug]); // Remove progress and saveProgress from deps

  // This component doesn't render anything visible
  return null;
}
