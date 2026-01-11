"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { supabaseClient } from "@/lib/supabase-client";
import TextSelectionMenu from "./TextSelectionMenu";
import MarkdownContent from "./MarkdownContent";
import Toast from "./Toast";
import ConfirmDialog from "./ConfirmDialog";
import LessonProgressTracker from "./LessonProgressTracker";
import NoteEditor from "./NoteEditor";

type HighlightableContentProps = {
  htmlContent: string;
  courseId: string;
  week: string;
  lessonSlug: string;
  lessonTitle?: string;
};

type Highlight = {
  id: string;
  highlight_text: string;
  color: string;
  highlight_offset: number | null;
};

type Note = {
  id: string;
  highlight_text: string;
  note_text: string;
  note_type: "general" | "question" | "important" | "todo";
  color: "yellow" | "green" | "blue" | "red" | "purple";
  highlight_offset: number | null;
};

export default function HighlightableContent({
  htmlContent,
  courseId,
  week,
  lessonSlug,
  lessonTitle,
}: HighlightableContentProps) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [selectedText, setSelectedText] = useState("");
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; highlightId: string | null }>({ isOpen: false, highlightId: null });
  const [showBookmarkDialog, setShowBookmarkDialog] = useState(false);
  const [bookmarkCustomTitle, setBookmarkCustomTitle] = useState("");
  const [bookmarkNote, setBookmarkNote] = useState("");
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const currentRangeRef = useRef<Range | null>(null);
  const selectedTextRef = useRef<string>("");
  const selectedOffsetRef = useRef<number>(0);
  const [bookmarkScrollTarget, setBookmarkScrollTarget] = useState<number | null>(null);

  // Detect bookmark, note, or scroll position navigation from URL hash
  useEffect(() => {
    const hash = window.location.hash;

    // Handle bookmark navigation (text offset)
    if (hash.startsWith('#bookmark-')) {
      const offset = parseInt(hash.replace('#bookmark-', ''), 10);
      if (!isNaN(offset)) {
        console.log("[Bookmark] Detected bookmark navigation to offset:", offset);
        setBookmarkScrollTarget(offset);
      }
    }

    // Handle note navigation (text offset)
    if (hash.startsWith('#note-')) {
      const offset = parseInt(hash.replace('#note-', ''), 10);
      if (!isNaN(offset)) {
        console.log("[Note] Detected note navigation to offset:", offset);
        setBookmarkScrollTarget(offset); // Reuse same scroll logic as bookmarks
      }
    }

    // Handle continue reading navigation (scroll position)
    if (hash.startsWith('#scroll-')) {
      const scrollPos = parseInt(hash.replace('#scroll-', ''), 10);
      if (!isNaN(scrollPos)) {
        console.log(`[ContinueReading] Detected scroll position: ${scrollPos}px`);
        // Wait for content to render, then scroll to saved position
        setTimeout(() => {
          console.log(`[ContinueReading] Scrolling to ${scrollPos}px`);
          window.scrollTo({
            top: scrollPos,
            behavior: 'smooth'
          });
          // Clear the hash from URL
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }, 800); // Increased timeout to ensure content is fully rendered
      }
    }
  }, []); // Run once on mount

  // Fetch user's highlights and notes for this lesson
  useEffect(() => {
    if (!user) {
      setHighlights([]);
      setNotes([]);
      return;
    }

    async function fetchHighlightsAndNotes() {
      if (!user) return;

      console.log("[Content] Fetching highlights and notes for lesson");

      // Fetch highlights (content_notes with highlight_text but no note_text)
      const { data: highlightsData, error: highlightsError } = await supabaseClient
        .from("content_notes")
        .select("id, highlight_text, color, highlight_offset")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .eq("week", week)
        .eq("lesson_slug", lessonSlug)
        .not("highlight_text", "is", null)
        .or("note_text.is.null,note_text.eq.");

      if (highlightsError) {
        console.error("[Highlights] Error fetching:", highlightsError);
      } else {
        console.log("[Highlights] Fetched:", highlightsData?.length || 0, "highlights");
        setHighlights(highlightsData || []);
      }

      // Fetch notes (content_notes with both highlight_text and note_text)
      const { data: notesData, error: notesError } = await supabaseClient
        .from("content_notes")
        .select("id, highlight_text, note_text, note_type, color, highlight_offset")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .eq("week", week)
        .eq("lesson_slug", lessonSlug)
        .not("note_text", "is", null)
        .neq("note_text", "");

      if (notesError) {
        console.error("[Notes] Error fetching:", notesError);
      } else {
        console.log("[Notes] Fetched:", notesData?.length || 0, "notes");
        setNotes(notesData || []);
      }
    }

    fetchHighlightsAndNotes();
  }, [user, courseId, week, lessonSlug]);

  // Handle clicks on highlighted text to delete and notes to edit
  useEffect(() => {
    const handleHighlightOrNoteClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (target.tagName === 'MARK') {
        e.preventDefault();

        // Check if it's a note
        if (target.dataset.noteId) {
          const noteId = target.dataset.noteId;
          console.log("[Click] Note clicked:", noteId);

          // Find the note and open editor
          const note = notes.find((n) => n.id === noteId);
          if (note) {
            setEditingNote(note);
            setShowNoteEditor(true);
          }
        }
        // Check if it's a highlight
        else if (target.dataset.highlightId) {
          const highlightId = target.dataset.highlightId;
          console.log("[Click] Highlight clicked:", highlightId);

          // Open custom confirmation dialog
          setConfirmDialog({ isOpen: true, highlightId });
        }
      }
    };

    const contentDiv = contentRef.current;
    if (contentDiv) {
      contentDiv.addEventListener('click', handleHighlightOrNoteClick);
    }

    return () => {
      if (contentDiv) {
        contentDiv.removeEventListener('click', handleHighlightOrNoteClick);
      }
    };
  }, [highlights, notes]); // Re-attach when highlights or notes change

  useEffect(() => {
    console.log("[HighlightableContent] Mounting right-click handler");

    const handleRightClick = (e: MouseEvent) => {
      // Check if right-click is inside the content area
      if (!contentRef.current?.contains(e.target as Node)) {
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        console.log("[RightClick] No text selected");
        return;
      }

      const text = selection.toString().trim();
      if (text.length === 0) {
        console.log("[RightClick] Empty selection");
        return;
      }

      // Prevent default context menu
      e.preventDefault();

      const range = selection.getRangeAt(0);
      if (!contentRef.current?.contains(range.commonAncestorContainer)) {
        return;
      }

      console.log("[RightClick] Text selected:", text.slice(0, 50));
      setSelectedText(text);
      selectedTextRef.current = text;
      currentRangeRef.current = range.cloneRange();

      // Calculate offset IMMEDIATELY while selection is still active
      try {
        const tempRange = document.createRange();
        tempRange.selectNodeContents(contentRef.current);
        tempRange.setEnd(range.startContainer, range.startOffset);
        const offset = tempRange.toString().length;
        selectedOffsetRef.current = offset;
        console.log("[RightClick] Calculated offset immediately:", offset);
      } catch (err) {
        console.error("[RightClick] Error calculating offset:", err);
        selectedOffsetRef.current = 0;
      }

      setMenuOpen(true);

      // Position menu at cursor location
      const menuWidth = 250;
      const menuHeight = 200;

      let x = e.clientX;
      let y = e.clientY;

      // Keep menu within viewport bounds
      if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 10;
      }
      if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 10;
      }

      setMenuPosition({ x, y });
      console.log("[RightClick] Menu at:", { x, y });
    };

    document.addEventListener("contextmenu", handleRightClick);
    console.log("[HighlightableContent] Right-click handler attached");

    return () => {
      document.removeEventListener("contextmenu", handleRightClick);
      console.log("[HighlightableContent] Right-click handler removed");
    };
  }, []);

  // Calculate text offset in the plain text content
  const calculateTextOffset = (): number | null => {
    console.log("[Offset] Calculating offset...");
    console.log("[Offset] currentRangeRef.current:", currentRangeRef.current);
    console.log("[Offset] contentRef.current:", contentRef.current);

    if (!currentRangeRef.current || !contentRef.current) {
      console.warn("[Offset] Missing range or content ref");
      return null;
    }

    try {
      const range = currentRangeRef.current;
      console.log("[Offset] Range startContainer:", range.startContainer);
      console.log("[Offset] Range startOffset:", range.startOffset);
      console.log("[Offset] Range text:", range.toString());

      const tempRange = document.createRange();
      tempRange.selectNodeContents(contentRef.current);
      tempRange.setEnd(range.startContainer, range.startOffset);

      const offset = tempRange.toString().length;
      console.log("[Offset] Temp range text length:", offset);
      console.log("[Offset] Temp range text (first 100 chars):", tempRange.toString().substring(0, 100));

      return offset;
    } catch (e) {
      console.error("[Offset] Error calculating:", e);
      return null;
    }
  };

  const handleHighlight = async (color: string) => {
    console.log("[Highlight] Called with color:", color);
    console.log("[Highlight] User:", user ? "logged in" : "not logged in");
    console.log("[Highlight] Selected text state:", selectedText);
    console.log("[Highlight] Selected text ref:", selectedTextRef.current);

    if (!user) {
      openAuthModal();
      return;
    }

    const textToHighlight = selectedTextRef.current || selectedText;
    if (!textToHighlight) {
      console.error("[Highlight] No text selected!");
      return;
    }

    const offset = selectedOffsetRef.current;
    console.log("[Highlight] Selected text:", textToHighlight.substring(0, 30), "...");
    console.log("[Highlight] Using stored offset:", offset);

    try {
      const { data, error } = await supabaseClient
        .from("content_notes")
        .insert({
          user_id: user.id,
          course_id: courseId,
          week,
          lesson_slug: lessonSlug,
          note_text: "",
          highlight_text: textToHighlight,
          highlight_offset: offset,
          color,
          note_type: "general",
          is_private: true,
        })
        .select()
        .single();

      if (error) {
        console.error("[Highlight] Error:", error);
        setToast({ message: `Error: ${error.message}`, type: "error" });
        return;
      }

      console.log("[Highlight] Saved successfully:", data);

      // Add the new highlight to the state
      if (data) {
        setHighlights((prev) => [...prev, {
          id: data.id,
          highlight_text: data.highlight_text,
          color: data.color,
          highlight_offset: data.highlight_offset,
        }]);
      }

      // Don't show toast on success, just close the menu
      window.getSelection()?.removeAllRanges();
      setMenuPosition(null);
      setSelectedText("");
      setMenuOpen(false);
    } catch (error) {
      console.error(error);
      setToast({ message: "Failed to save highlight", type: "error" });
    }
  };

  const handleBookmark = () => {
    console.log("[Bookmark] Called");
    if (!user) {
      openAuthModal();
      return;
    }

    const textToBookmark = selectedTextRef.current || selectedText;
    if (!textToBookmark) {
      console.error("[Bookmark] No text selected!");
      return;
    }

    console.log("[Bookmark] Opening dialog for text:", textToBookmark.substring(0, 30), "...");

    // Close the text selection menu
    setMenuPosition(null);
    setMenuOpen(false);

    // Open the bookmark dialog
    setShowBookmarkDialog(true);
  };

  const handleSaveBookmark = async () => {
    if (!user) return;

    const textToBookmark = selectedTextRef.current || selectedText;
    if (!textToBookmark) {
      console.error("[SaveBookmark] No text selected!");
      return;
    }

    const offset = selectedOffsetRef.current;
    console.log("[SaveBookmark] Selected text:", textToBookmark.substring(0, 30), "...");
    console.log("[SaveBookmark] Using stored offset:", offset);

    setIsSavingBookmark(true);

    try {
      // Check if this exact text + offset combination is already bookmarked
      const { data: existing } = await supabaseClient
        .from("bookmarks")
        .select("*")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .eq("week", week)
        .eq("lesson_slug", lessonSlug)
        .eq("bookmark_text", textToBookmark)
        .eq("bookmark_offset", offset)
        .maybeSingle();

      if (existing) {
        setToast({ message: "This text is already bookmarked!", type: "info" });
        setShowBookmarkDialog(false);
        setBookmarkCustomTitle("");
        setBookmarkNote("");
        window.getSelection()?.removeAllRanges();
        setSelectedText("");
        return;
      }

      const { error } = await supabaseClient
        .from("bookmarks")
        .insert({
          user_id: user.id,
          course_id: courseId,
          week,
          lesson_slug: lessonSlug,
          bookmark_text: textToBookmark,
          bookmark_offset: offset,
          custom_title: bookmarkCustomTitle.trim() || null,
          note: bookmarkNote.trim() || null,
        });

      if (error) {
        console.error("[SaveBookmark] Error:", error);
        setToast({ message: `Error: ${error.message}`, type: "error" });
        return;
      }

      console.log("[SaveBookmark] Saved successfully");
      setToast({ message: "Bookmarked!", type: "success" });

      // Close dialog and reset form
      setShowBookmarkDialog(false);
      setBookmarkCustomTitle("");
      setBookmarkNote("");
      window.getSelection()?.removeAllRanges();
      setSelectedText("");
    } catch (error) {
      console.error(error);
      setToast({ message: "Failed to bookmark", type: "error" });
    } finally {
      setIsSavingBookmark(false);
    }
  };

  const handleCancelBookmarkDialog = () => {
    setShowBookmarkDialog(false);
    setBookmarkCustomTitle("");
    setBookmarkNote("");
    window.getSelection()?.removeAllRanges();
    setSelectedText("");
  };

  // Handle note creation/editing
  const handleNote = () => {
    console.log("[Note] Called");
    if (!user) {
      openAuthModal();
      return;
    }

    const textForNote = selectedTextRef.current || selectedText;
    if (!textForNote) {
      console.error("[Note] No text selected!");
      return;
    }

    console.log("[Note] Opening editor for text:", textForNote.substring(0, 30), "...");

    // Close the text selection menu
    setMenuPosition(null);
    setMenuOpen(false);

    // Open the note editor (without existing note since it's new)
    setEditingNote(null);
    setShowNoteEditor(true);
  };

  const handleSaveNote = async (
    noteText: string,
    noteType: "general" | "question" | "important" | "todo",
    color: "yellow" | "green" | "blue" | "red" | "purple"
  ) => {
    if (!user) return;

    const textWithNote = selectedTextRef.current || selectedText;
    if (!textWithNote && !editingNote) {
      console.error("[SaveNote] No text selected!");
      return;
    }

    const offset = selectedOffsetRef.current;
    console.log("[SaveNote] Saving note:", noteText.substring(0, 30), "...");

    setIsSavingNote(true);

    try {
      if (editingNote) {
        // Update existing note
        const { error } = await supabaseClient
          .from("content_notes")
          .update({
            note_text: noteText,
            note_type: noteType,
            color: color,
          })
          .eq("id", editingNote.id)
          .eq("user_id", user.id);

        if (error) {
          console.error("[SaveNote] Error updating:", error);
          setToast({ message: `Error: ${error.message}`, type: "error" });
          return;
        }

        // Update in local state
        setNotes((prev) =>
          prev.map((n) =>
            n.id === editingNote.id
              ? { ...n, note_text: noteText, note_type: noteType, color: color }
              : n
          )
        );

        console.log("[SaveNote] Updated successfully");
        setToast({ message: "Note updated!", type: "success" });
      } else {
        // Create new note
        const { data, error } = await supabaseClient
          .from("content_notes")
          .insert({
            user_id: user.id,
            course_id: courseId,
            week,
            lesson_slug: lessonSlug,
            highlight_text: textWithNote,
            highlight_offset: offset,
            note_text: noteText,
            note_type: noteType,
            color: color,
            is_private: true,
          })
          .select()
          .single();

        if (error) {
          console.error("[SaveNote] Error creating:", error);
          setToast({ message: `Error: ${error.message}`, type: "error" });
          return;
        }

        // Add to local state
        if (data) {
          setNotes((prev) => [
            ...prev,
            {
              id: data.id,
              highlight_text: data.highlight_text,
              note_text: data.note_text,
              note_type: data.note_type,
              color: data.color,
              highlight_offset: data.highlight_offset,
            },
          ]);
        }

        console.log("[SaveNote] Created successfully");
        setToast({ message: "Note saved!", type: "success" });
      }

      // Close editor and reset
      setShowNoteEditor(false);
      setEditingNote(null);
      window.getSelection()?.removeAllRanges();
      setSelectedText("");
    } catch (error) {
      console.error(error);
      setToast({ message: "Failed to save note", type: "error" });
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!user || !editingNote) return;

    setIsSavingNote(true);

    try {
      const { error } = await supabaseClient
        .from("content_notes")
        .delete()
        .eq("id", editingNote.id)
        .eq("user_id", user.id);

      if (error) {
        console.error("[DeleteNote] Error:", error);
        setToast({ message: "Failed to delete note", type: "error" });
        return;
      }

      // Remove from local state
      setNotes((prev) => prev.filter((n) => n.id !== editingNote.id));

      console.log("[DeleteNote] Deleted successfully");
      setToast({ message: "Note deleted", type: "success" });

      // Close editor
      setShowNoteEditor(false);
      setEditingNote(null);
    } catch (error) {
      console.error(error);
      setToast({ message: "Failed to delete note", type: "error" });
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleCancelNoteEditor = () => {
    setShowNoteEditor(false);
    setEditingNote(null);
    window.getSelection()?.removeAllRanges();
    setSelectedText("");
  };

  // Delete a highlight
  const handleDeleteHighlight = async (highlightId: string) => {
    console.log("[Delete] Highlight ID:", highlightId);
    if (!user) return;

    try {
      const { error } = await supabaseClient
        .from("content_notes")
        .delete()
        .eq("id", highlightId)
        .eq("user_id", user.id);

      if (error) {
        console.error("[Delete] Error:", error);
        setToast({ message: "Failed to delete highlight", type: "error" });
        return;
      }

      // Remove from state
      setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
      console.log("[Delete] Highlight removed");
    } catch (error) {
      console.error(error);
      setToast({ message: "Failed to delete highlight", type: "error" });
    }
  };

  // Apply highlights and notes to HTML content - DOM-based approach to avoid breaking HTML tags
  const applyHighlightsAndNotes = (html: string): string => {
    if (highlights.length === 0 && notes.length === 0) return html;

    console.log("[ApplyHighlights] Total highlights:", highlights.length, "notes:", notes.length);

    // Color map - vibrant colors for dark mode, softer colors for light mode
    const colorMap: Record<string, string> = {
      yellow: 'bg-yellow-100 dark:bg-yellow-400/40 hover:bg-yellow-200 dark:hover:bg-yellow-400/50',
      green: 'bg-green-100 dark:bg-green-400/40 hover:bg-green-200 dark:hover:bg-green-400/50',
      blue: 'bg-blue-100 dark:bg-blue-400/40 hover:bg-blue-200 dark:hover:bg-blue-400/50',
      pink: 'bg-pink-100 dark:bg-pink-400/40 hover:bg-pink-200 dark:hover:bg-pink-400/50',
      purple: 'bg-purple-100 dark:bg-purple-400/40 hover:bg-purple-200 dark:hover:bg-purple-400/50',
      red: 'bg-red-100 dark:bg-red-400/40 hover:bg-red-200 dark:hover:bg-red-400/50',
    };

    // Note-specific color map with border to distinguish from highlights
    const noteColorMap: Record<string, string> = {
      yellow: 'bg-yellow-100 dark:bg-yellow-400/40 hover:bg-yellow-200 dark:hover:bg-yellow-400/50 border-b-2 border-yellow-500 dark:border-yellow-400',
      green: 'bg-green-100 dark:bg-green-400/40 hover:bg-green-200 dark:hover:bg-green-400/50 border-b-2 border-green-500 dark:border-green-400',
      blue: 'bg-blue-100 dark:bg-blue-400/40 hover:bg-blue-200 dark:hover:bg-blue-400/50 border-b-2 border-blue-500 dark:border-blue-400',
      pink: 'bg-pink-100 dark:bg-pink-400/40 hover:bg-pink-200 dark:hover:bg-pink-400/50 border-b-2 border-pink-500 dark:border-pink-400',
      purple: 'bg-purple-100 dark:bg-purple-400/40 hover:bg-purple-200 dark:hover:bg-purple-400/50 border-b-2 border-purple-500 dark:border-purple-400',
      red: 'bg-red-100 dark:bg-red-400/40 hover:bg-red-200 dark:hover:bg-red-400/50 border-b-2 border-red-500 dark:border-red-400',
    };

    // Create a temporary DOM element to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const plainText = tempDiv.textContent || '';

    // Group highlights by text and determine which occurrence each one is
    const highlightsByText = new Map<string, Array<Highlight & { occurrenceIndex: number; isNote?: boolean; noteId?: string }>>();

    // Process regular highlights
    for (const h of highlights) {
      if (!highlightsByText.has(h.highlight_text)) {
        highlightsByText.set(h.highlight_text, []);
      }

      // Find which occurrence this highlight is
      let occurrenceIndex = 0;
      if (h.highlight_offset !== null) {
        // Count how many occurrences appear before this offset in plain text
        const escapedText = h.highlight_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedText, 'gi'); // case insensitive
        let match;
        let index = 0;
        let foundOccurrence = 0;

        while ((match = regex.exec(plainText)) !== null) {
          const matchStart = match.index;
          const matchEnd = match.index + h.highlight_text.length;

          // Check if this match contains our offset
          if (matchStart <= h.highlight_offset && h.highlight_offset < matchEnd) {
            foundOccurrence = index;
            break;
          }
          index++;
        }

        occurrenceIndex = foundOccurrence;
        console.log(`[ApplyHighlights] Text "${h.highlight_text.substring(0, 20)}..." at offset ${h.highlight_offset} is occurrence #${occurrenceIndex}`);
      } else {
        console.log(`[ApplyHighlights] Text "${h.highlight_text.substring(0, 20)}..." has no offset, defaulting to occurrence #0`);
      }

      highlightsByText.get(h.highlight_text)!.push({ ...h, occurrenceIndex, isNote: false });
    }

    // Process notes (they have underline border to distinguish)
    for (const note of notes) {
      if (!highlightsByText.has(note.highlight_text)) {
        highlightsByText.set(note.highlight_text, []);
      }

      // Find which occurrence this note is
      let occurrenceIndex = 0;
      if (note.highlight_offset !== null) {
        const escapedText = note.highlight_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedText, 'gi');
        let match;
        let index = 0;
        let foundOccurrence = 0;

        while ((match = regex.exec(plainText)) !== null) {
          const matchStart = match.index;
          const matchEnd = match.index + note.highlight_text.length;

          if (matchStart <= note.highlight_offset && note.highlight_offset < matchEnd) {
            foundOccurrence = index;
            break;
          }
          index++;
        }

        occurrenceIndex = foundOccurrence;
        console.log(`[ApplyNotes] Note "${note.highlight_text.substring(0, 20)}..." at offset ${note.highlight_offset} is occurrence #${occurrenceIndex}`);
      } else {
        console.log(`[ApplyNotes] Note "${note.highlight_text.substring(0, 20)}..." has no offset, defaulting to occurrence #0`);
      }

      highlightsByText.get(note.highlight_text)!.push({
        ...note,
        occurrenceIndex,
        isNote: true,
        noteId: note.id,
      });
    }

    console.log("[ApplyHighlights] Unique texts:", highlightsByText.size);

    // Process each unique text using DOM traversal to avoid breaking HTML
    for (const [text, textHighlights] of highlightsByText.entries()) {
      // Track which occurrences to highlight
      const occurrencesToHighlight = new Map<number, { id: string; color: string; isNote?: boolean; noteId?: string }>();

      for (const h of textHighlights) {
        occurrencesToHighlight.set(h.occurrenceIndex, {
          id: h.id,
          color: h.color,
          isNote: h.isNote,
          noteId: h.noteId,
        });
      }

      // Walk through all text nodes and apply highlights
      highlightTextInNode(tempDiv, text, occurrencesToHighlight, colorMap, noteColorMap);
    }

    return tempDiv.innerHTML;
  };

  // Helper function to highlight text only in text nodes (not in HTML tags/attributes)
  const highlightTextInNode = (
    node: Node,
    searchText: string,
    occurrencesToHighlight: Map<number, { id: string; color: string; isNote?: boolean; noteId?: string }>,
    colorMap: Record<string, string>,
    noteColorMap: Record<string, string>,
    currentOccurrence = { count: 0 }
  ) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const textContent = node.textContent || '';
      const regex = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = [...textContent.matchAll(regex)];

      if (matches.length === 0) return;

      // Build new HTML with highlights
      let lastIndex = 0;
      let newHTML = '';

      for (const match of matches) {
        const matchIndex = match.index!;
        const matchText = match[0];
        const beforeText = textContent.substring(lastIndex, matchIndex);

        newHTML += beforeText;

        // Check if this occurrence should be highlighted
        if (occurrencesToHighlight.has(currentOccurrence.count)) {
          const item = occurrencesToHighlight.get(currentOccurrence.count)!;
          const { id, color, isNote, noteId } = item;

          if (isNote) {
            // Notes have special styling with underline border
            const bgClass = noteColorMap[color] || noteColorMap.blue;
            console.log(`[HighlightText] Highlighting note occurrence ${currentOccurrence.count} of "${searchText.substring(0, 20)}..." with ${color}`);
            newHTML += `<mark class="${bgClass} rounded px-1 cursor-pointer transition-colors" data-note-id="${noteId}" title="Click to view/edit note">📝 ${matchText}</mark>`;
          } else {
            // Regular highlights
            const bgClass = colorMap[color] || colorMap.yellow;
            console.log(`[HighlightText] Highlighting occurrence ${currentOccurrence.count} of "${searchText.substring(0, 20)}..." with ${color}`);
            newHTML += `<mark class="${bgClass} rounded px-1 cursor-pointer transition-colors" data-highlight-id="${id}" title="Click to remove highlight">${matchText}</mark>`;
          }
        } else {
          newHTML += matchText;
        }

        currentOccurrence.count++;
        lastIndex = matchIndex + matchText.length;
      }

      newHTML += textContent.substring(lastIndex);

      // Replace the text node with a span containing the new HTML
      if (newHTML !== textContent) {
        const span = document.createElement('span');
        span.innerHTML = newHTML;
        node.parentNode?.replaceChild(span, node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Skip script, style, and mark tags
      const tagName = (node as Element).tagName?.toLowerCase();
      if (tagName === 'script' || tagName === 'style' || tagName === 'mark') {
        return;
      }

      // Process child nodes
      const children = Array.from(node.childNodes);
      for (const child of children) {
        highlightTextInNode(child, searchText, occurrencesToHighlight, colorMap, noteColorMap, currentOccurrence);
      }
    }
  };

  const highlightedContent = applyHighlightsAndNotes(htmlContent);

  // Scroll to bookmarked text when navigating from bookmarks page
  useEffect(() => {
    if (bookmarkScrollTarget === null || !contentRef.current) return;

    // Wait for content to render
    const timer = setTimeout(() => {
      if (!contentRef.current) return;

      const plainText = contentRef.current.textContent || '';
      console.log("[BookmarkScroll] Looking for offset:", bookmarkScrollTarget);

      // Find the text node at the given offset
      let currentOffset = 0;
      let foundNode: Node | null = null;
      let targetNodeOffset = 0;

      const findNodeAtOffset = (node: Node): boolean => {
        if (node.nodeType === Node.TEXT_NODE) {
          const textLength = (node.textContent || '').length;
          if (currentOffset + textLength > bookmarkScrollTarget) {
            foundNode = node;
            targetNodeOffset = bookmarkScrollTarget - currentOffset;
            return true;
          }
          currentOffset += textLength;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const tagName = (node as Element).tagName?.toLowerCase();
          if (tagName === 'script' || tagName === 'style') return false;

          for (const child of Array.from(node.childNodes)) {
            if (findNodeAtOffset(child)) return true;
          }
        }
        return false;
      };

      findNodeAtOffset(contentRef.current);

      const targetNode = foundNode as (Node & { parentElement: HTMLElement | null }) | null;
      if (targetNode?.parentElement) {
        console.log("[BookmarkScroll] Found target node at offset:", targetNodeOffset);

        // Find the parent element to scroll to
        let scrollTarget: HTMLElement | null = targetNode.parentElement;
        while (scrollTarget && scrollTarget.tagName === 'SPAN') {
          scrollTarget = scrollTarget.parentElement;
        }

        if (scrollTarget) {
          // Scroll with smooth behavior and add temporary highlight
          scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // Add temporary highlight animation
          const originalBg = scrollTarget.style.background;
          const originalTransition = scrollTarget.style.transition;

          scrollTarget.style.transition = 'background 0.3s ease-in-out';
          scrollTarget.style.background = 'rgba(59, 130, 246, 0.3)'; // Blue highlight

          // Fade out after 3 seconds
          setTimeout(() => {
            if (scrollTarget) {
              scrollTarget.style.background = originalBg;
              setTimeout(() => {
                if (scrollTarget) {
                  scrollTarget.style.transition = originalTransition;
                }
              }, 300);
            }
          }, 3000);

          console.log("[BookmarkScroll] Scrolled to bookmarked text");
        }
      }

      // Clear the bookmark target
      setBookmarkScrollTarget(null);

      // Clear the hash from URL
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }, 500); // Wait for DOM to be ready

    return () => clearTimeout(timer);
  }, [bookmarkScrollTarget]);

  return (
    <>
      {/* Progress Tracker */}
      <LessonProgressTracker
        courseId={courseId}
        week={week}
        lessonSlug={lessonSlug}
        contentRef={contentRef}
      />

      <div ref={contentRef} className="relative">
        <MarkdownContent htmlContent={highlightedContent} />
        {menuPosition && selectedText && (
          <TextSelectionMenu
            selectedText={selectedText}
            position={menuPosition}
            onHighlight={handleHighlight}
            onBookmark={handleBookmark}
            onNote={handleNote}
            onClose={() => {
              console.log("[Menu] Closing menu");
              setMenuPosition(null);
              setSelectedText("");
              setMenuOpen(false);
              window.getSelection()?.removeAllRanges();
            }}
          />
        )}
      </div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Remove Highlight"
        message="Are you sure you want to remove this highlight? This action cannot be undone."
        confirmText="Remove"
        cancelText="Cancel"
        onConfirm={() => {
          if (confirmDialog.highlightId) {
            handleDeleteHighlight(confirmDialog.highlightId);
          }
          setConfirmDialog({ isOpen: false, highlightId: null });
        }}
        onCancel={() => setConfirmDialog({ isOpen: false, highlightId: null })}
      />

      {/* Bookmark Dialog */}
      {showBookmarkDialog && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full border border-black/10 dark:border-white/10">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-black/10 dark:border-white/10">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Add Bookmark
              </h3>
              <button
                onClick={handleCancelBookmarkDialog}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
                aria-label="Close"
              >
                <span className="text-gray-500 dark:text-white/60 text-2xl leading-none">&times;</span>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Bookmarked Text Preview */}
              {selectedTextRef.current && (
                <div className="text-sm text-gray-500 dark:text-white/60">
                  Bookmarking: <span className="font-medium text-gray-900 dark:text-white italic">"{selectedTextRef.current.slice(0, 100)}{selectedTextRef.current.length > 100 ? "..." : ""}"</span>
                </div>
              )}

              {/* Lesson Title Info */}
              {lessonTitle && (
                <div className="text-xs text-gray-400 dark:text-white/50">
                  From: {lessonTitle}
                </div>
              )}

              {/* Custom Title Input */}
              <div>
                <label
                  htmlFor="bookmark-custom-title"
                  className="block text-sm font-medium text-gray-700 dark:text-white/80 mb-2"
                >
                  Custom Name (Optional)
                </label>
                <input
                  id="bookmark-custom-title"
                  type="text"
                  value={bookmarkCustomTitle}
                  onChange={(e) => setBookmarkCustomTitle(e.target.value)}
                  placeholder="Leave empty to use selected text"
                  className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-white/50">
                  Give this bookmark a custom name to help you remember it
                </p>
              </div>

              {/* Note Input */}
              <div>
                <label
                  htmlFor="bookmark-note-text"
                  className="block text-sm font-medium text-gray-700 dark:text-white/80 mb-2"
                >
                  Note (Optional)
                </label>
                <textarea
                  id="bookmark-note-text"
                  value={bookmarkNote}
                  onChange={(e) => setBookmarkNote(e.target.value)}
                  placeholder="Add a note about why you bookmarked this..."
                  rows={3}
                  className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-black/10 dark:border-white/10">
              <button
                onClick={handleCancelBookmarkDialog}
                disabled={isSavingBookmark}
                className="px-4 py-2 text-gray-700 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBookmark}
                disabled={isSavingBookmark}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingBookmark ? "Saving..." : "Save Bookmark"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note Editor */}
      <NoteEditor
        isOpen={showNoteEditor}
        selectedText={selectedTextRef.current || selectedText}
        lessonTitle={lessonTitle}
        existingNote={editingNote}
        onSave={handleSaveNote}
        onDelete={editingNote ? handleDeleteNote : undefined}
        onClose={handleCancelNoteEditor}
        isSaving={isSavingNote}
      />
    </>
  );
}
