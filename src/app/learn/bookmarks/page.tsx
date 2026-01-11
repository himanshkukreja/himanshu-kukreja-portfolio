"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { supabaseClient } from "@/lib/supabase-client";
import Link from "next/link";
import { Bookmark, ChevronRight, Loader2, BookmarkX, ArrowUpDown } from "lucide-react";

type BookmarkWithDetails = {
  id: string;
  course_id: string;
  week: string;
  lesson_slug: string;
  custom_title: string | null;
  note: string | null;
  created_at: string;
  bookmark_text: string | null;
  bookmark_offset: number | null;
};

type SortOption = "newest" | "oldest" | "title" | "week";

export default function BookmarksPage() {
  const { user, loading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [bookmarks, setBookmarks] = useState<BookmarkWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setLoading(false);
      return;
    }

    async function fetchBookmarks() {
      try {
        const { data, error } = await supabaseClient
          .from("bookmarks")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setBookmarks(data || []);
      } catch (error) {
        console.error("Error fetching bookmarks:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchBookmarks();
  }, [user, authLoading]);

  const handleRemoveBookmark = async (bookmarkId: string) => {
    try {
      const { error } = await supabaseClient
        .from("bookmarks")
        .delete()
        .eq("id", bookmarkId)
        .eq("user_id", user!.id);

      if (error) throw error;

      // Remove from local state
      setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
    } catch (error) {
      console.error("Error removing bookmark:", error);
      alert("Failed to remove bookmark. Please try again.");
    }
  };

  // Format lesson title from slug
  const formatLessonTitle = (slug: string) => {
    return slug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Format week display name
  const formatWeekName = (week: string) => {
    if (week === "overview") return "Overview";
    if (week.includes("foundations")) return "Foundations";
    const match = week.match(/week-(\d+)/);
    if (match) {
      return `Week ${parseInt(match[1], 10)}`;
    }
    return week;
  };

  // Get display title (custom title or formatted slug)
  const getDisplayTitle = (bookmark: BookmarkWithDetails) => {
    return bookmark.custom_title || formatLessonTitle(bookmark.lesson_slug);
  };

  // Filter and sort bookmarks
  const filteredAndSortedBookmarks = useMemo(() => {
    let filtered = bookmarks;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = bookmarks.filter((bookmark) => {
        const title = getDisplayTitle(bookmark).toLowerCase();
        const note = (bookmark.note || "").toLowerCase();
        const week = formatWeekName(bookmark.week).toLowerCase();
        return title.includes(query) || note.includes(query) || week.includes(query);
      });
    }

    // Apply sorting
    const sorted = [...filtered];
    switch (sortBy) {
      case "newest":
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case "oldest":
        sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case "title":
        sorted.sort((a, b) => getDisplayTitle(a).localeCompare(getDisplayTitle(b)));
        break;
      case "week":
        sorted.sort((a, b) => a.week.localeCompare(b.week));
        break;
    }

    return sorted;
  }, [bookmarks, searchQuery, sortBy]);

  if (authLoading || loading) {
    return (
      <main className="min-h-screen pt-20 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen pt-20 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center py-20">
            <Bookmark className="w-16 h-16 mx-auto mb-6 text-gray-300 dark:text-white/20" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Sign in to view bookmarks
            </h1>
            <p className="text-gray-500 dark:text-white/60 mb-8">
              Bookmark lessons to save them for later and access them quickly
            </p>
            <button
              onClick={openAuthModal}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-gray-900 dark:text-white rounded-lg transition-colors"
            >
              Sign In
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-20 pb-16">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-3">
            <Bookmark className="w-10 h-10 text-yellow-400 fill-yellow-400" />
            My Bookmarks
          </h1>
          <p className="text-gray-500 dark:text-white/60">
            {bookmarks.length} {bookmarks.length === 1 ? "lesson" : "lessons"}{" "}
            bookmarked
          </p>
        </div>

        {/* Search and Sort Controls */}
        {bookmarks.length > 0 && (
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            {/* Search Input */}
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bookmarks by title, note, or week..."
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              />
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-5 h-5 text-gray-500 dark:text-white/60" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 cursor-pointer"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="title">Title (A-Z)</option>
                <option value="week">Week</option>
              </select>
            </div>
          </div>
        )}

        {/* Results Count */}
        {searchQuery && (
          <div className="mb-4 text-sm text-gray-500 dark:text-white/60">
            Showing {filteredAndSortedBookmarks.length} of {bookmarks.length} bookmarks
          </div>
        )}

        {/* Bookmarks List */}
        {bookmarks.length === 0 ? (
          <div className="text-center py-20 bg-black/5 dark:bg-white/5 rounded-lg border border-black/10 dark:border-white/10">
            <BookmarkX className="w-16 h-16 mx-auto mb-6 text-gray-300 dark:text-white/20" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              No bookmarks yet
            </h2>
            <p className="text-gray-500 dark:text-white/60 mb-8">
              Start bookmarking lessons to save them for quick access
            </p>
            <Link
              href="/learn/system-design-mastery"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-gray-900 dark:text-white rounded-lg transition-colors"
            >
              Browse Lessons
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        ) : filteredAndSortedBookmarks.length === 0 ? (
          <div className="text-center py-20 bg-black/5 dark:bg-white/5 rounded-lg border border-black/10 dark:border-white/10">
            <BookmarkX className="w-16 h-16 mx-auto mb-6 text-gray-300 dark:text-white/20" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              No bookmarks found
            </h2>
            <p className="text-gray-500 dark:text-white/60 mb-8">
              Try adjusting your search or filters
            </p>
            <button
              onClick={() => setSearchQuery("")}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              Clear Search
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAndSortedBookmarks.map((bookmark) => (
              <div
                key={bookmark.id}
                className="group bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg p-6 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    {/* Week Badge */}
                    <div className="mb-2">
                      <span className="text-xs text-gray-500 dark:text-white/50 uppercase tracking-wider">
                        {formatWeekName(bookmark.week)}
                      </span>
                    </div>

                    {/* Lesson Title */}
                    <Link
                      href={`/learn/${bookmark.course_id}/${bookmark.week}/${bookmark.lesson_slug}${
                        bookmark.bookmark_offset !== null
                          ? `#bookmark-${bookmark.bookmark_offset}`
                          : ""
                      }`}
                      className="block mb-2 hover:text-blue-400 transition-colors"
                    >
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white group-hover:text-blue-400 transition-colors">
                        {getDisplayTitle(bookmark)}
                      </h3>
                    </Link>

                    {/* Show original title if custom title is used */}
                    {bookmark.custom_title && (
                      <p className="text-xs text-gray-500 dark:text-white/50 mb-2">
                        Original: {formatLessonTitle(bookmark.lesson_slug)}
                      </p>
                    )}

                    {/* Note */}
                    {bookmark.note && (
                      <p className="text-gray-600 dark:text-white/70 text-sm mb-3">
                        {bookmark.note}
                      </p>
                    )}

                    {/* Bookmarked Text Preview */}
                    {bookmark.bookmark_text && (
                      <p className="text-gray-500 dark:text-white/60 text-sm mb-3 italic">
                        "{bookmark.bookmark_text.slice(0, 100)}
                        {bookmark.bookmark_text.length > 100 ? "..." : ""}"
                      </p>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-white/40">
                      <span>
                        Bookmarked{" "}
                        {new Date(bookmark.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/learn/${bookmark.course_id}/${bookmark.week}/${bookmark.lesson_slug}${
                        bookmark.bookmark_offset !== null
                          ? `#bookmark-${bookmark.bookmark_offset}`
                          : ""
                      }`}
                      className="px-4 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg text-sm transition-colors"
                    >
                      View Lesson
                    </Link>
                    <button
                      onClick={() => handleRemoveBookmark(bookmark.id)}
                      className="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-sm transition-colors"
                      title="Remove bookmark"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
