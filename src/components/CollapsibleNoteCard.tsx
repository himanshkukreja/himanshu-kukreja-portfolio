"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown, ChevronUp, Edit, Trash2 } from "lucide-react";

type NoteCardProps = {
  note: {
    id: string;
    course_id: string;
    week: string;
    lesson_slug: string;
    highlight_text: string;
    highlight_offset: number | null;
    note_text: string;
    note_type: "general" | "question" | "important" | "todo";
    color: "yellow" | "green" | "blue" | "red" | "purple";
    created_at: string;
    updated_at: string;
  };
  noteTypeIcons: Record<string, string>;
  noteTypeLabels: Record<string, string>;
  formatLessonTitle: (slug: string) => string;
  formatWeekName: (week: string) => string;
  onEdit: () => void;
  onDelete: () => void;
};

export default function CollapsibleNoteCard({
  note,
  noteTypeIcons,
  noteTypeLabels,
  formatLessonTitle,
  formatWeekName,
  onEdit,
  onDelete,
}: NoteCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Build URL with scroll offset for note navigation
  const noteUrl = `/learn/${note.course_id}/${note.week}/${note.lesson_slug}${
    note.highlight_offset !== null ? `#note-${note.highlight_offset}` : ""
  }`;

  return (
    <div className="group bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg transition-all overflow-hidden">
      {/* Header - Always visible, clickable to expand/collapse */}
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-1 text-left"
          >
            <div className="flex items-start gap-3">
              {/* Expand/Collapse Icon */}
              <div className="flex-shrink-0 mt-1">
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-500 dark:text-white/60" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500 dark:text-white/60" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                {/* Note Type Badge */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg sm:text-2xl">
                    {noteTypeIcons[note.note_type]}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-white/50 uppercase tracking-wider">
                    {noteTypeLabels[note.note_type]} • {formatWeekName(note.week)}
                  </span>
                </div>

                {/* Lesson Title */}
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-400 transition-colors mb-2">
                  {formatLessonTitle(note.lesson_slug)}
                </h3>

                {/* Preview of note text when collapsed */}
                {!isExpanded && (
                  <p className="text-sm text-gray-600 dark:text-white/70 line-clamp-2">
                    {note.note_text}
                  </p>
                )}
              </div>
            </div>
          </button>

          {/* Go to Lesson Button */}
          <Link
            href={noteUrl}
            className="flex-shrink-0 p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"
            title="Go to lesson"
          >
            <ChevronRight className="w-5 h-5 text-gray-400 dark:text-white/40 hover:text-blue-400 transition-colors" />
          </Link>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="mt-4 pl-8 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Highlighted Text */}
            <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-lg p-3">
              <p className="text-sm text-gray-700 dark:text-white/80 italic">
                "{note.highlight_text.slice(0, 200)}
                {note.highlight_text.length > 200 ? "..." : ""}"
              </p>
            </div>

            {/* Note Text */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-lg p-4">
              <p className="text-gray-900 dark:text-white whitespace-pre-wrap text-sm sm:text-base">
                {note.note_text}
              </p>
            </div>

            {/* Metadata */}
            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-white/40">
              <span>Created {new Date(note.created_at).toLocaleDateString()}</span>
              {note.updated_at !== note.created_at && (
                <span>Updated {new Date(note.updated_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="px-4 sm:px-6 pb-4 flex items-center gap-2 border-t border-black/10 dark:border-white/10 pt-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg text-sm transition-colors"
          title="Edit note"
        >
          <Edit className="w-4 h-4" />
          <span className="hidden sm:inline">Edit</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-sm transition-colors"
          title="Delete note"
        >
          <Trash2 className="w-4 h-4" />
          <span className="hidden sm:inline">Delete</span>
        </button>
      </div>
    </div>
  );
}
