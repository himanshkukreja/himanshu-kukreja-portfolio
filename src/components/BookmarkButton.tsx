"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bookmark, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { supabaseClient } from "@/lib/supabase-client";
import Toast from "./Toast";

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
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [note, setNote] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  // Check if the whole lesson is bookmarked. Text bookmarks (bookmark_offset set) live in the
  // same table, so only the lesson-level row (bookmark_offset IS NULL) counts here; a
  // maybeSingle() over all rows errors as soon as a lesson has several text bookmarks.
  const userId = user?.id ?? null;
  useEffect(() => {
    let cancelled = false;

    async function checkBookmark() {
      if (!userId) {
        if (!cancelled) setIsBookmarked(false);
        return;
      }

      try {
        const { data, error } = await supabaseClient
          .from("bookmarks")
          .select("id")
          .eq("user_id", userId)
          .eq("course_id", courseId)
          .eq("week", week)
          .eq("lesson_slug", lessonSlug)
          .is("bookmark_offset", null)
          .limit(1);

        if (!cancelled && !error) {
          setIsBookmarked((data?.length ?? 0) > 0);
        }
      } catch (error) {
        console.error("Error checking bookmark:", error);
      }
    }

    checkBookmark();
    return () => {
      cancelled = true;
    };
  }, [userId, courseId, week, lessonSlug]);

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
        .eq("lesson_slug", lessonSlug)
        .is("bookmark_offset", null); // keep the reader's text bookmarks

      if (error) throw error;
      setIsBookmarked(false);
    } catch (error) {
      console.error("Error removing bookmark:", error);
      setToast({ message: "Failed to remove bookmark. Please try again.", type: "error" });
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
      setToast({ message: "Failed to add bookmark. Please try again.", type: "error" });
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
        type="button"
        onClick={handleToggleBookmark}
        disabled={isLoading}
        aria-pressed={isBookmarked}
        className={`inline-flex min-h-11 items-center gap-2 border px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          isBookmarked ? "border-signal text-signal-text" : "border-line-strong text-fg-2 hover:border-fg-3 hover:text-fg"
        }`}
        title={isBookmarked ? "Remove bookmark" : "Bookmark this lesson"}
      >
        <Bookmark className={`h-4 w-4 ${isBookmarked ? "fill-current" : ""}`} aria-hidden />
        <span>{isBookmarked ? "Bookmarked" : "Bookmark"}</span>
      </button>

      {toast && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}

      {showDialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onKeyDown={(e) => e.key === "Escape" && handleCancelDialog()}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="bm-dialog-title" className="w-full max-w-md animate-hk-in border border-line-strong bg-surface text-fg">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 id="bm-dialog-title" className="m-0 font-display text-xl font-bold tracking-[-0.02em]">
                Bookmark this lesson
              </h3>
              <button type="button" onClick={handleCancelDialog} className="grid h-11 w-11 place-items-center text-fg-3 hover:text-fg" aria-label="Close">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="flex flex-col gap-4 px-5 py-5">
              {lessonTitle && (
                <p className="m-0 text-sm text-fg-3">
                  Bookmarking <span className="font-medium text-fg">{lessonTitle}</span>
                </p>
              )}
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Custom name · optional</span>
                <input
                  id="custom-title"
                  type="text"
                  autoFocus
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Leave empty to use the lesson title"
                  className="min-h-11 border border-line-strong bg-bg px-3 text-base text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Note · optional</span>
                <textarea
                  id="bookmark-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why are you saving this?"
                  rows={3}
                  className="resize-none border border-line-strong bg-bg px-3 py-2 text-base text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-line px-5 py-4">
              <button type="button" onClick={handleCancelDialog} disabled={isLoading} className="min-h-11 border border-line-strong px-4 text-sm text-fg hover:border-fg-3 disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={handleSaveBookmark} disabled={isLoading} className="min-h-11 bg-signal px-5 text-sm font-semibold text-on-signal hover:brightness-110 disabled:opacity-50">
                {isLoading ? "Saving…" : "Save bookmark"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
