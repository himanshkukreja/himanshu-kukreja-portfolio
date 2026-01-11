"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { supabaseClient } from "@/lib/supabase-client";
import Link from "next/link";
import {
  FileText,
  ChevronRight,
  Loader2,
  FileX,
  Edit,
  Trash2,
  ArrowUpDown,
  Search,
} from "lucide-react";
import NoteEditor from "@/components/NoteEditor";

type NoteWithDetails = {
  id: string;
  course_id: string;
  week: string;
  lesson_slug: string;
  highlight_text: string;
  note_text: string;
  note_type: "general" | "question" | "important" | "todo";
  color: "yellow" | "green" | "blue" | "red" | "purple";
  created_at: string;
  updated_at: string;
};

type SortOption = "newest" | "oldest" | "type" | "week";

const NOTE_TYPE_ICONS = {
  general: "📝",
  question: "❓",
  important: "⭐",
  todo: "✅",
};

const NOTE_TYPE_LABELS = {
  general: "General Note",
  question: "Question",
  important: "Important",
  todo: "To-Do",
};

export default function NotesPage() {
  const { user, loading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [notes, setNotes] = useState<NoteWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteWithDetails | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setLoading(false);
      return;
    }

    async function fetchNotes() {
      try {
        const { data, error } = await supabaseClient
          .from("content_notes")
          .select("*")
          .eq("user_id", user.id)
          .not("note_text", "is", null)
          .neq("note_text", "")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setNotes(data || []);
      } catch (error) {
        console.error("Error fetching notes:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchNotes();
  }, [user, authLoading]);

  const handleEditNote = (note: NoteWithDetails) => {
    setEditingNote(note);
    setShowNoteEditor(true);
  };

  const handleSaveNote = async (
    noteText: string,
    noteType: "general" | "question" | "important" | "todo",
    color: "yellow" | "green" | "blue" | "red" | "purple"
  ) => {
    if (!user || !editingNote) return;

    setIsSavingNote(true);

    try {
      const { error } = await supabaseClient
        .from("content_notes")
        .update({
          note_text: noteText,
          note_type: noteType,
          color: color,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingNote.id)
        .eq("user_id", user.id);

      if (error) throw error;

      // Update local state
      setNotes((prev) =>
        prev.map((n) =>
          n.id === editingNote.id
            ? {
                ...n,
                note_text: noteText,
                note_type: noteType,
                color: color,
                updated_at: new Date().toISOString(),
              }
            : n
        )
      );

      setShowNoteEditor(false);
      setEditingNote(null);
    } catch (error) {
      console.error("Error updating note:", error);
      alert("Failed to update note. Please try again.");
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!user) return;

    const confirmed = confirm("Are you sure you want to delete this note?");
    if (!confirmed) return;

    try {
      const { error } = await supabaseClient
        .from("content_notes")
        .delete()
        .eq("id", noteId)
        .eq("user_id", user.id);

      if (error) throw error;

      // Remove from local state
      setNotes((prev) => prev.filter((n) => n.id !== noteId));

      // Close editor if this note was being edited
      if (editingNote?.id === noteId) {
        setShowNoteEditor(false);
        setEditingNote(null);
      }
    } catch (error) {
      console.error("Error deleting note:", error);
      alert("Failed to delete note. Please try again.");
    }
  };

  const handleDeleteNoteFromEditor = async () => {
    if (!editingNote) return;
    await handleDeleteNote(editingNote.id);
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

  // Filter and sort notes
  const filteredAndSortedNotes = (() => {
    let filtered = notes;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = notes.filter((note) => {
        const noteText = note.note_text.toLowerCase();
        const highlightText = note.highlight_text.toLowerCase();
        const lessonTitle = formatLessonTitle(note.lesson_slug).toLowerCase();
        return (
          noteText.includes(query) ||
          highlightText.includes(query) ||
          lessonTitle.includes(query)
        );
      });
    }

    // Apply sorting
    const sorted = [...filtered];
    switch (sortBy) {
      case "newest":
        sorted.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        break;
      case "oldest":
        sorted.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        break;
      case "type":
        sorted.sort((a, b) => a.note_type.localeCompare(b.note_type));
        break;
      case "week":
        sorted.sort((a, b) => a.week.localeCompare(b.week));
        break;
    }

    return sorted;
  })();

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
            <FileText className="w-16 h-16 mx-auto mb-6 text-gray-300 dark:text-white/20" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Sign in to view notes
            </h1>
            <p className="text-gray-500 dark:text-white/60 mb-8">
              Create notes on lessons to remember important concepts and ideas
            </p>
            <button
              onClick={openAuthModal}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
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
            <FileText className="w-10 h-10 text-blue-400" />
            My Notes
          </h1>
          <p className="text-gray-500 dark:text-white/60">
            {notes.length} {notes.length === 1 ? "note" : "notes"} saved
          </p>
        </div>

        {/* Search and Sort Controls */}
        {notes.length > 0 && (
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes by content, text, or lesson..."
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
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
                <option value="type">By Type</option>
                <option value="week">By Week</option>
              </select>
            </div>
          </div>
        )}

        {/* Results Count */}
        {searchQuery && (
          <div className="mb-4 text-sm text-gray-500 dark:text-white/60">
            Showing {filteredAndSortedNotes.length} of {notes.length} notes
          </div>
        )}

        {/* Notes List */}
        {notes.length === 0 ? (
          <div className="text-center py-20 bg-black/5 dark:bg-white/5 rounded-lg border border-black/10 dark:border-white/10">
            <FileX className="w-16 h-16 mx-auto mb-6 text-gray-300 dark:text-white/20" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              No notes yet
            </h2>
            <p className="text-gray-500 dark:text-white/60 mb-8">
              Right-click on text in any lesson and select "Add Note" to create
              your first note
            </p>
            <Link
              href="/learn/system-design-mastery"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              Browse Lessons
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        ) : filteredAndSortedNotes.length === 0 ? (
          <div className="text-center py-20 bg-black/5 dark:bg-white/5 rounded-lg border border-black/10 dark:border-white/10">
            <FileX className="w-16 h-16 mx-auto mb-6 text-gray-300 dark:text-white/20" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              No notes found
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
            {filteredAndSortedNotes.map((note) => {
              // Build URL with scroll offset for note navigation
              const noteUrl = `/learn/${note.course_id}/${note.week}/${
                note.lesson_slug
              }${
                note.highlight_offset !== null
                  ? `#note-${note.highlight_offset}`
                  : ""
              }`;

              return (
                <div
                  key={note.id}
                  className="group bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg transition-all overflow-hidden"
                >
                  {/* Clickable Card Area */}
                  <Link
                    href={noteUrl}
                    className="block p-6 pb-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        {/* Note Type Badge */}
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-2xl">
                            {NOTE_TYPE_ICONS[note.note_type]}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-white/50 uppercase tracking-wider">
                            {NOTE_TYPE_LABELS[note.note_type]} •{" "}
                            {formatWeekName(note.week)}
                          </span>
                        </div>

                        {/* Lesson Title */}
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-400 transition-colors mb-2">
                          {formatLessonTitle(note.lesson_slug)}
                        </h3>

                        {/* Highlighted Text */}
                        <p className="text-gray-500 dark:text-white/60 text-sm mb-3 italic">
                          "{note.highlight_text.slice(0, 150)}
                          {note.highlight_text.length > 150 ? "..." : ""}"
                        </p>

                        {/* Note Text */}
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-lg p-4 mb-3">
                          <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                            {note.note_text}
                          </p>
                        </div>

                        {/* Metadata */}
                        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-white/40">
                          <span>
                            Created{" "}
                            {new Date(note.created_at).toLocaleDateString()}
                          </span>
                          {note.updated_at !== note.created_at && (
                            <span>
                              Updated{" "}
                              {new Date(note.updated_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* View Arrow Indicator */}
                      <div className="flex-shrink-0">
                        <ChevronRight className="w-6 h-6 text-gray-400 dark:text-white/40 group-hover:text-blue-400 transition-colors" />
                      </div>
                    </div>
                  </Link>

                  {/* Action Buttons (outside clickable area) */}
                  <div className="px-6 pb-4 flex items-center gap-2 border-t border-black/10 dark:border-white/10 pt-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditNote(note);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg text-sm transition-colors"
                      title="Edit note"
                    >
                      <Edit className="w-4 h-4" />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNote(note.id);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-sm transition-colors"
                      title="Delete note"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Note Editor */}
      <NoteEditor
        isOpen={showNoteEditor}
        selectedText={editingNote?.highlight_text || ""}
        lessonTitle={
          editingNote ? formatLessonTitle(editingNote.lesson_slug) : undefined
        }
        existingNote={
          editingNote
            ? {
                id: editingNote.id,
                note_text: editingNote.note_text,
                note_type: editingNote.note_type,
                color: editingNote.color,
              }
            : null
        }
        onSave={handleSaveNote}
        onDelete={handleDeleteNoteFromEditor}
        onClose={() => {
          setShowNoteEditor(false);
          setEditingNote(null);
        }}
        isSaving={isSavingNote}
      />
    </main>
  );
}
