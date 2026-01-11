"use client";

import { useState, useEffect, useRef } from "react";
import { Bookmark, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { supabaseClient } from "@/lib/supabase-client";

type BookmarkButtonProps = {
  courseId: string;
  week: string;
  lessonSlug: string;
  lessonTitle?: string; // Default title to show in the dialog
};

export default function BookmarkButton({
  courseId,
  week,
  lessonSlug,
  lessonTitle,
}: BookmarkButtonProps) {
  // Add null check to handle potential context issues during HMR
  let user = null;
  let openAuthModal = () => {};

  try {
    const auth = useAuth();
    const authModal = useAuthModal();
    user = auth.user;
    openAuthModal = authModal.openAuthModal;
  } catch (error) {
    console.error("[BookmarkButton] Auth context error:", error);
    // Component will render in a disabled state if context is not available
  }
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [note, setNote] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  // Check if lesson is bookmarked on mount
  useEffect(() => {
    if (!user) {
      setIsBookmarked(false);
      return;
    }

    async function checkBookmark() {
      try {
        const { data, error } = await supabaseClient
          .from("bookmarks")
          .select("*")
          .eq("user_id", user.id)
          .eq("course_id", courseId)
          .eq("week", week)
          .eq("lesson_slug", lessonSlug)
          .maybeSingle();

        if (!error && data) {
          setIsBookmarked(true);
        }
      } catch (error) {
        console.error("Error checking bookmark:", error);
      }
    }

    checkBookmark();
  }, [user, courseId, week, lessonSlug]);

  const handleToggleBookmark = async () => {
    if (!user) {
      openAuthModal();
      return;
    }

    if (isBookmarked) {
      // Remove bookmark directly
      await handleRemoveBookmark();
    } else {
      // Show dialog to add bookmark
      setShowDialog(true);
    }
  };

  const handleRemoveBookmark = async () => {
    if (!user) return;

    setIsLoading(true);

    try {
      const { error } = await supabaseClient
        .from("bookmarks")
        .delete()
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .eq("week", week)
        .eq("lesson_slug", lessonSlug);

      if (error) throw error;
      setIsBookmarked(false);
    } catch (error) {
      console.error("Error removing bookmark:", error);
      alert("Failed to remove bookmark. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveBookmark = async () => {
    if (!user) return;

    setIsLoading(true);

    try {
      const { error } = await supabaseClient
        .from("bookmarks")
        .insert({
          user_id: user.id,
          course_id: courseId,
          week,
          lesson_slug: lessonSlug,
          custom_title: customTitle.trim() || null,
          note: note.trim() || null,
        });

      if (error) {
        // Check if it's a duplicate (already bookmarked)
        if (error.code === "23505") {
          setIsBookmarked(true);
        } else {
          throw error;
        }
      } else {
        setIsBookmarked(true);
      }

      // Close dialog and reset form
      setShowDialog(false);
      setCustomTitle("");
      setNote("");
    } catch (error) {
      console.error("Error adding bookmark:", error);
      alert("Failed to add bookmark. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelDialog = () => {
    setShowDialog(false);
    setCustomTitle("");
    setNote("");
  };

  return (
    <>
      <button
        onClick={handleToggleBookmark}
        disabled={isLoading}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
          isBookmarked
            ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
            : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={isBookmarked ? "Remove bookmark" : "Bookmark this lesson"}
      >
        <Bookmark
          className={`w-5 h-5 ${isBookmarked ? "fill-yellow-400" : ""}`}
        />
        <span className="text-sm font-medium">
          {isBookmarked ? "Bookmarked" : "Bookmark"}
        </span>
      </button>

      {/* Bookmark Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            ref={dialogRef}
            className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full border border-black/10 dark:border-white/10"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-black/10 dark:border-white/10">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Add Bookmark
              </h3>
              <button
                onClick={handleCancelDialog}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-white/60" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Lesson Title Info */}
              {lessonTitle && (
                <div className="text-sm text-gray-500 dark:text-white/60">
                  Bookmarking: <span className="font-medium text-gray-900 dark:text-white">{lessonTitle}</span>
                </div>
              )}

              {/* Custom Title Input */}
              <div>
                <label
                  htmlFor="custom-title"
                  className="block text-sm font-medium text-gray-700 dark:text-white/80 mb-2"
                >
                  Custom Name (Optional)
                </label>
                <input
                  id="custom-title"
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Leave empty to use default lesson title"
                  className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-white/50">
                  Give this bookmark a custom name to help you remember why you saved it
                </p>
              </div>

              {/* Note Input */}
              <div>
                <label
                  htmlFor="bookmark-note"
                  className="block text-sm font-medium text-gray-700 dark:text-white/80 mb-2"
                >
                  Note (Optional)
                </label>
                <textarea
                  id="bookmark-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note about why you bookmarked this..."
                  rows={3}
                  className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-black/10 dark:border-white/10">
              <button
                onClick={handleCancelDialog}
                disabled={isLoading}
                className="px-4 py-2 text-gray-700 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBookmark}
                disabled={isLoading}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Saving..." : "Save Bookmark"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
