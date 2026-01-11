"use client";

import { useState, useEffect } from "react";
import { X, Save, Trash2, FileText } from "lucide-react";

type NoteEditorProps = {
  isOpen: boolean;
  selectedText: string;
  lessonTitle?: string;
  existingNote?: {
    id: string;
    note_text: string;
    note_type: "general" | "question" | "important" | "todo";
    color: "yellow" | "green" | "blue" | "red" | "purple";
  } | null;
  onSave: (noteText: string, noteType: "general" | "question" | "important" | "todo", color: "yellow" | "green" | "blue" | "red" | "purple") => void;
  onDelete?: () => void;
  onClose: () => void;
  isSaving?: boolean;
};

const NOTE_TYPES = [
  { value: "general", label: "General Note", icon: "📝", color: "blue" },
  { value: "question", label: "Question", icon: "❓", color: "yellow" },
  { value: "important", label: "Important", icon: "⭐", color: "red" },
  { value: "todo", label: "To-Do", icon: "✅", color: "green" },
] as const;

const NOTE_COLORS = [
  { value: "yellow", label: "Yellow", class: "bg-yellow-400" },
  { value: "green", label: "Green", class: "bg-green-400" },
  { value: "blue", label: "Blue", class: "bg-blue-400" },
  { value: "red", label: "Red", class: "bg-red-400" },
  { value: "purple", label: "Purple", class: "bg-purple-400" },
] as const;

export default function NoteEditor({
  isOpen,
  selectedText,
  lessonTitle,
  existingNote,
  onSave,
  onDelete,
  onClose,
  isSaving,
}: NoteEditorProps) {
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<"general" | "question" | "important" | "todo">("general");
  const [color, setColor] = useState<"yellow" | "green" | "blue" | "red" | "purple">("blue");

  // Load existing note data when editing
  useEffect(() => {
    if (existingNote) {
      setNoteText(existingNote.note_text);
      setNoteType(existingNote.note_type);
      setColor(existingNote.color);
    } else {
      setNoteText("");
      setNoteType("general");
      setColor("blue");
    }
  }, [existingNote, isOpen]);

  const handleSave = () => {
    if (noteText.trim()) {
      onSave(noteText.trim(), noteType, color);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
    // Ctrl/Cmd + Enter to save
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      handleSave();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-2xl w-full border border-black/10 dark:border-white/10 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-black/10 dark:border-white/10 p-6 z-10">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-blue-400" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {existingNote ? "Edit Note" : "Add Note"}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-white/60" />
            </button>
          </div>

          {/* Selected Text Preview */}
          {selectedText && (
            <div className="mt-3 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-white/50 mb-1">Selected Text:</p>
              <p className="text-sm text-gray-900 dark:text-white italic">
                "{selectedText.slice(0, 150)}{selectedText.length > 150 ? "..." : ""}"
              </p>
            </div>
          )}

          {/* Lesson Context */}
          {lessonTitle && (
            <div className="mt-2 text-xs text-gray-400 dark:text-white/40">
              From: {lessonTitle}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Note Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/80 mb-3">
              Note Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {NOTE_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setNoteType(type.value)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                    noteType === type.value
                      ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "border-gray-300 dark:border-white/20 hover:border-gray-400 dark:hover:border-white/30 text-gray-700 dark:text-white/70"
                  }`}
                >
                  <span className="text-xl">{type.icon}</span>
                  <span className="text-sm font-medium">{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Highlight Color Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/80 mb-3">
              Highlight Color
            </label>
            <div className="flex gap-3">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`${c.class} w-12 h-12 rounded-lg transition-all ${
                    color === c.value
                      ? "ring-4 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-blue-500 scale-110"
                      : "hover:scale-105 opacity-70 hover:opacity-100"
                  }`}
                  title={c.label}
                  aria-label={c.label}
                />
              ))}
            </div>
          </div>

          {/* Note Text Editor */}
          <div>
            <label
              htmlFor="note-text"
              className="block text-sm font-medium text-gray-700 dark:text-white/80 mb-2"
            >
              Your Note
            </label>
            <textarea
              id="note-text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write your note here... (Ctrl/Cmd + Enter to save)"
              rows={8}
              autoFocus
              className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none font-mono text-sm leading-relaxed"
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-white/50">
              Tip: Press Ctrl/Cmd + Enter to save quickly
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-black/10 dark:border-white/10 p-6 flex items-center justify-between">
          <div>
            {existingNote && onDelete && (
              <button
                onClick={onDelete}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-sm font-medium">Delete Note</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-gray-700 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !noteText.trim()}
              className="flex items-center gap-2 px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Saving..." : existingNote ? "Update Note" : "Save Note"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
