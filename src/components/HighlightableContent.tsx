"use client";

/**
 * The reader's content layer: renders lesson HTML, applies the reader's highlights and notes,
 * and opens the selection toolbar (highlight · note · bookmark · ask Claude / ChatGPT · copy link).
 *
 * Selection opens the toolbar on mouseup, after a touch long-press or an Apple Pencil / stylus selection
 * (selectionchange), after a keyboard selection (Shift + arrows), or with Shift+F10. The toolbar also clips the
 * passage to the notebook or snips the area around it (components/learn/ink/capture; CaptureHost runs snip mode). Text offsets count characters only
 * outside [data-sd-chrome] (captions, toolbars, buttons the renderer adds), so chrome can change
 * without moving a saved highlight.
 */
import "@/app/learn/course-content.css";
import "@/app/learn/course-blocks.css";
import "@/components/learn/quiz/quiz.css";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { supabaseClient } from "@/lib/supabase-client";
import type { NoteColor, NoteType } from "@/lib/learn/notebook";
import TextSelectionMenu, { displayHighlightColor } from "./TextSelectionMenu";
import MarkdownContent from "./MarkdownContent";
import Toast from "./Toast";
import ConfirmDialog from "./ConfirmDialog";
import LessonProgressTracker from "./LessonProgressTracker";
import NoteEditor from "./NoteEditor";
import AskLessonPanel, { ASK_LESSON_EVENT } from "@/components/learn/ai/AskLessonPanel";
import { openCourseChat } from "@/components/learn/chat/openChat";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import { useTutorActions } from "@/components/learn/selection/useTutorActions";
import { askAi, CLIENT_LABEL, cleanText, copyAskPrompt, courseName, headingBefore, pageUrl, surroundingText, type AskClient, type AskContext } from "@/lib/learn/askAi";
import { canNativeShare, LINK_COPIED, sharePassage } from "@/lib/learn/deepLink";
import { liftTerms, restoreTerms } from "@/lib/concepts/dom";
import CaptureHost from "@/components/learn/ink/capture/CaptureHost";
import { useCaptureActions } from "@/components/learn/ink/capture/useCaptureActions";

type HighlightableContentProps = {
  htmlContent: string;
  courseId: string;
  week: string;
  lessonSlug: string;
  lessonTitle?: string;
  /** wrapper class for the HTML (defaults: "sd-body" for course HTML, "md-content" otherwise) */
  className?: string;
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
  note_type: NoteType;
  color: NoteColor;
  highlight_offset: number | null;
};

type MenuState = { x: number; y: number; placement: "above" | "below" | "sheet"; autoFocus: boolean };

const CHROME = "[data-sd-chrome]";
const COACH_KEY = "sd:coach:select";

/* ------------------------------------------------------------------ text offsets */

function isChromeNode(n: Node | null): boolean {
  const el = n && (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement);
  return !!el?.closest(CHROME);
}

/** Text nodes in document order, skipping chrome subtrees, script and style. */
function textWalker(root: Node): TreeWalker {
  return document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (el.hasAttribute("data-sd-chrome") || el.tagName === "SCRIPT" || el.tagName === "STYLE") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
}

/** Plain text of a subtree without chrome. */
function contentText(root: Node): string {
  const w = textWalker(root);
  let out = "";
  for (let n = w.nextNode(); n; n = w.nextNode()) out += n.nodeValue || "";
  return out;
}

/** Character offset of a DOM point, counting only non-chrome text. */
function offsetOfPoint(root: Node, container: Node, offset: number): number {
  const point = document.createRange();
  point.setStart(container, offset);
  point.collapse(true);
  const w = textWalker(root);
  let total = 0;
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n === container) return total + offset;
    if (point.comparePoint(n, 0) > 0) break;
    total += (n.nodeValue || "").length;
  }
  return total;
}

/* ------------------------------------------------------------------ one-time coach mark flag */

function subscribeStorage(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("sd:coach", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("sd:coach", cb);
  };
}

function coachSeen(): boolean {
  try {
    return window.localStorage.getItem(COACH_KEY) === "1";
  } catch {
    return true;
  }
}

function markCoachSeen() {
  try {
    window.localStorage.setItem(COACH_KEY, "1");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("sd:coach"));
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

export default function HighlightableContent({ htmlContent, courseId, week, lessonSlug, lessonTitle, className }: HighlightableContentProps) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [selectedText, setSelectedText] = useState("");
  const [menu, setMenu] = useState<MenuState | null>(null);
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
  const rangeRef = useRef<Range | null>(null);
  const selectedTextRef = useRef<string>("");
  const selectedOffsetRef = useRef<number>(0);
  const [bookmarkScrollTarget, setBookmarkScrollTarget] = useState<number | null>(null);
  const seen = useSyncExternalStore(subscribeStorage, coachSeen, () => true);

  /* ---------------- hash navigation (#bookmark-N, #note-N, #scroll-N) */
  useEffect(() => {
    const hash = window.location.hash;
    const num = (prefix: string) => {
      const v = parseInt(hash.replace(prefix, ""), 10);
      return Number.isNaN(v) ? null : v;
    };
    let timer: number | undefined;
    if (hash.startsWith("#bookmark-") || hash.startsWith("#note-")) {
      const v = num(hash.startsWith("#note-") ? "#note-" : "#bookmark-");
      if (v !== null) timer = window.setTimeout(() => setBookmarkScrollTarget(v), 0);
    } else if (hash.startsWith("#scroll-")) {
      const v = num("#scroll-");
      if (v !== null) {
        timer = window.setTimeout(() => {
          window.scrollTo({ top: v, behavior: "smooth" });
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }, 800);
      }
    }
    return () => window.clearTimeout(timer);
  }, []);

  /* ---------------- load this reader's highlights and notes */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) {
        if (!cancelled) {
          setHighlights([]);
          setNotes([]);
        }
        return;
      }
      const [hl, nt] = await Promise.all([
        supabaseClient
          .from("content_notes")
          .select("id, highlight_text, color, highlight_offset")
          .eq("user_id", user.id)
          .eq("course_id", courseId)
          .eq("week", week)
          .eq("lesson_slug", lessonSlug)
          .not("highlight_text", "is", null)
          .or("note_text.is.null,note_text.eq."),
        supabaseClient
          .from("content_notes")
          .select("id, highlight_text, note_text, note_type, color, highlight_offset")
          .eq("user_id", user.id)
          .eq("course_id", courseId)
          .eq("week", week)
          .eq("lesson_slug", lessonSlug)
          .not("note_text", "is", null)
          .neq("note_text", ""),
      ]);
      if (cancelled) return;
      if (hl.error) console.error("[Highlights] fetch failed:", hl.error.message);
      else setHighlights((hl.data as Highlight[]) || []);
      if (nt.error) console.error("[Notes] fetch failed:", nt.error.message);
      else setNotes((nt.data as Note[]) || []);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user, courseId, week, lessonSlug]);

  /* ---------------- click a highlight (remove) or a note (edit) */
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const mark = (e.target as Element | null)?.closest?.("mark");
      if (!mark || !el.contains(mark)) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return; // finishing a selection, not a click
      const noteId = (mark as HTMLElement).dataset.noteId;
      const highlightId = (mark as HTMLElement).dataset.highlightId;
      if (noteId) {
        const note = notes.find((n) => n.id === noteId);
        if (note) {
          e.preventDefault();
          setEditingNote(note);
          setShowNoteEditor(true);
        }
      } else if (highlightId) {
        e.preventDefault();
        setConfirmDialog({ isOpen: true, highlightId });
      }
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [notes]);

  /* ---------------- selection → toolbar */
  const closeMenu = useCallback(() => {
    setMenu(null);
  }, []);

  /** Capture the current selection if it is inside the content (and not only chrome). */
  const captureSelection = useCallback((): Range | null => {
    const root = contentRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;
    if (isChromeNode(range.startContainer) && isChromeNode(range.endContainer)) return null;
    const textValue = sel.toString().trim();
    if (!textValue) return null;
    rangeRef.current = range.cloneRange();
    selectedTextRef.current = textValue;
    selectedOffsetRef.current = offsetOfPoint(root, range.startContainer, range.startOffset);
    setSelectedText(textValue);
    return range;
  }, []);

  const openMenuFor = useCallback((range: Range, how: "mouse" | "touch" | "keyboard") => {
    const rects = range.getClientRects();
    const first = rects[0] || range.getBoundingClientRect();
    const last = rects[rects.length - 1] || first;
    const W = Math.min(window.innerWidth - 16, 760);
    const H = 54;
    // touch / pen: dock the toolbar at the bottom of the screen, clear of the native selection
    // handles and the iOS / Android callout that sit around the selection itself
    if (how === "touch") {
      setMenu({ x: 0, y: 0, placement: "sheet", autoFocus: false });
      markCoachSeen();
      return;
    }
    const below = first.top - H - 10 < 64;
    const anchor = below ? last : first;
    const x = Math.max(8, Math.min(anchor.left - 24, window.innerWidth - W - 8));
    const y = below ? Math.min(anchor.bottom + 12, window.innerHeight - H - 8) : first.top - H - 10;
    setMenu({ x, y, placement: below ? "below" : "above", autoFocus: how === "keyboard" });
    markCoachSeen();
  }, []);

  useEffect(() => {
    let lastPointer: string = "mouse";
    let touchTimer: number | undefined;
    let keyTimer: number | undefined;

    const onPointerDown = (e: PointerEvent) => {
      lastPointer = e.pointerType || "mouse";
    };
    // touch and pen (Apple Pencil) selections settle through selectionchange; iPadOS sends no mouseup for a pen drag
    const handheld = () => lastPointer === "touch" || lastPointer === "pen";
    const onMouseUp = (e: MouseEvent) => {
      if (handheld()) return;
      if ((e.target as Element | null)?.closest?.('[role="toolbar"][aria-label]')?.hasAttribute("data-sd-chrome")) return;
      window.setTimeout(() => {
        const r = captureSelection();
        if (r) openMenuFor(r, "mouse");
      }, 0);
    };
    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        window.clearTimeout(touchTimer);
        return;
      }
      if (!handheld()) return;
      window.clearTimeout(touchTimer);
      touchTimer = window.setTimeout(() => {
        const r = captureSelection();
        if (r) openMenuFor(r, "touch");
      }, 450);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F10" && e.shiftKey) {
        const r = captureSelection();
        if (r) {
          e.preventDefault();
          openMenuFor(r, "keyboard");
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Shift" && !(e.shiftKey && e.key.startsWith("Arrow"))) return;
      window.clearTimeout(keyTimer);
      keyTimer = window.setTimeout(() => {
        const r = captureSelection();
        if (r) openMenuFor(r, "keyboard");
      }, 250);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      window.clearTimeout(touchTimer);
      window.clearTimeout(keyTimer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, [captureSelection, openMenuFor]);

  // keep the toolbar attached to the selection while scrolling
  useEffect(() => {
    if (!menu) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = rangeRef.current;
        if (!r) return;
        const rect = r.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
          setMenu(null);
          return;
        }
        setMenu((m) => (m && m.placement !== "sheet" ? { ...m, y: m.placement === "below" ? rect.bottom + 12 : rect.top - 64 } : m));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [menu]);

  const resetSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelectedText("");
    setMenu(null);
  };

  /* ---------------- actions */
  const handleHighlight = async (color: string) => {
    if (!user) {
      setMenu(null);
      openAuthModal();
      return;
    }
    const textToHighlight = selectedTextRef.current || selectedText;
    if (!textToHighlight) return;
    const { data, error } = await supabaseClient
      .from("content_notes")
      .insert({
        user_id: user.id,
        course_id: courseId,
        week,
        lesson_slug: lessonSlug,
        note_text: "",
        highlight_text: textToHighlight,
        highlight_offset: selectedOffsetRef.current,
        color,
        note_type: "general",
        is_private: true,
      })
      .select()
      .single();
    if (error) {
      setToast({ message: `Couldn't save the highlight: ${error.message}`, type: "error" });
      return;
    }
    if (data) {
      setHighlights((prev) => [...prev, { id: data.id, highlight_text: data.highlight_text, color: data.color, highlight_offset: data.highlight_offset }]);
    }
    resetSelection();
  };

  const handleBookmark = () => {
    if (!user) {
      setMenu(null);
      openAuthModal();
      return;
    }
    if (!(selectedTextRef.current || selectedText)) return;
    setMenu(null);
    setShowBookmarkDialog(true);
  };

  const handleSaveBookmark = async () => {
    if (!user) return;
    const textToBookmark = selectedTextRef.current || selectedText;
    if (!textToBookmark) return;
    const offset = selectedOffsetRef.current;
    setIsSavingBookmark(true);
    try {
      const { data: existing } = await supabaseClient
        .from("bookmarks")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .eq("week", week)
        .eq("lesson_slug", lessonSlug)
        .eq("bookmark_text", textToBookmark)
        .eq("bookmark_offset", offset)
        .maybeSingle();
      if (existing) {
        setToast({ message: "Already bookmarked.", type: "info" });
      } else {
        const { error } = await supabaseClient.from("bookmarks").insert({
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
          setToast({ message: `Couldn't bookmark: ${error.message}`, type: "error" });
          return;
        }
        setToast({ message: "Bookmarked.", type: "success" });
      }
      setShowBookmarkDialog(false);
      setBookmarkCustomTitle("");
      setBookmarkNote("");
      resetSelection();
    } catch {
      setToast({ message: "Couldn't bookmark.", type: "error" });
    } finally {
      setIsSavingBookmark(false);
    }
  };

  const handleCancelBookmarkDialog = () => {
    setShowBookmarkDialog(false);
    setBookmarkCustomTitle("");
    setBookmarkNote("");
    resetSelection();
  };

  const handleNote = () => {
    if (!user) {
      setMenu(null);
      openAuthModal();
      return;
    }
    if (!(selectedTextRef.current || selectedText)) return;
    setMenu(null);
    setEditingNote(null);
    setShowNoteEditor(true);
  };

  const handleSaveNote = async (noteText: string, noteType: NoteType, color: NoteColor) => {
    if (!user) return;
    const textWithNote = selectedTextRef.current || selectedText;
    if (!textWithNote && !editingNote) return;
    setIsSavingNote(true);
    try {
      if (editingNote) {
        const { error } = await supabaseClient
          .from("content_notes")
          .update({ note_text: noteText, note_type: noteType, color })
          .eq("id", editingNote.id)
          .eq("user_id", user.id);
        if (error) {
          setToast({ message: `Couldn't update the note: ${error.message}`, type: "error" });
          return;
        }
        setNotes((prev) => prev.map((n) => (n.id === editingNote.id ? { ...n, note_text: noteText, note_type: noteType, color } : n)));
        setToast({ message: "Note updated.", type: "success" });
      } else {
        const { data, error } = await supabaseClient
          .from("content_notes")
          .insert({
            user_id: user.id,
            course_id: courseId,
            week,
            lesson_slug: lessonSlug,
            highlight_text: textWithNote,
            highlight_offset: selectedOffsetRef.current,
            note_text: noteText,
            note_type: noteType,
            color,
            is_private: true,
          })
          .select()
          .single();
        if (error) {
          setToast({ message: `Couldn't save the note: ${error.message}`, type: "error" });
          return;
        }
        if (data) {
          setNotes((prev) => [
            ...prev,
            { id: data.id, highlight_text: data.highlight_text, note_text: data.note_text, note_type: data.note_type, color: data.color, highlight_offset: data.highlight_offset },
          ]);
        }
        setToast({ message: "Note saved.", type: "success" });
      }
      setShowNoteEditor(false);
      setEditingNote(null);
      resetSelection();
    } catch {
      setToast({ message: "Couldn't save the note.", type: "error" });
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!user || !editingNote) return;
    setIsSavingNote(true);
    try {
      const { error } = await supabaseClient.from("content_notes").delete().eq("id", editingNote.id).eq("user_id", user.id);
      if (error) {
        setToast({ message: "Couldn't delete the note.", type: "error" });
        return;
      }
      setNotes((prev) => prev.filter((n) => n.id !== editingNote.id));
      setToast({ message: "Note deleted.", type: "success" });
      setShowNoteEditor(false);
      setEditingNote(null);
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleCancelNoteEditor = () => {
    setShowNoteEditor(false);
    setEditingNote(null);
    resetSelection();
  };

  const handleDeleteHighlight = async (highlightId: string) => {
    if (!user) return;
    const { error } = await supabaseClient.from("content_notes").delete().eq("id", highlightId).eq("user_id", user.id);
    if (error) {
      setToast({ message: "Couldn't remove the highlight.", type: "error" });
      return;
    }
    setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
  };

  /* ---------------- ask an AI about the selection (Claude / ChatGPT / copy as prompt) */
  const askContext = (): AskContext | null => {
    const root = contentRef.current;
    const range = rangeRef.current;
    if (!root || !range) return null;
    const startEl = range.startContainer.nodeType === Node.ELEMENT_NODE ? (range.startContainer as Element) : range.startContainer.parentElement;
    const stage = startEl?.closest<HTMLElement>('section[data-sd="stage"]');
    const titleEl = stage?.querySelector(".sd-stage-title");
    const stageTitle = titleEl ? cleanText(titleEl) : "";
    return {
      kind: "lesson",
      title: lessonTitle || document.title,
      course: courseName(courseId),
      section: stageTitle,
      heading: headingBefore(range, stage ?? root),
      surrounding: surroundingText(range, root),
      url: pageUrl(),
    };
  };

  const handleAsk = (client: AskClient) => {
    const text = selectedTextRef.current || selectedText;
    const ctx = askContext();
    if (!text || !ctx) return;
    const mode = askAi(client, text, ctx);
    setMenu(null);
    if (mode === "clipboard") setToast({ message: `Long selection: the full prompt is on your clipboard. Paste it into ${CLIENT_LABEL[client]}.`, type: "info" });
    else if (mode === "offline") setToast({ message: `You're offline, so ${CLIENT_LABEL[client]} can't open. The prompt is on your clipboard: paste it in when you're back online.`, type: "info" });
  };

  /* ---------------- ask the course's own AI (answered from this lesson) */
  const aiStatus = useAiStatus();
  // the course chat, when it's on, takes over from "Ask this lesson": the same button and "Ask here" open its
  // panel, which knows this lesson, the section on screen and the selected passage (the lesson stays its grounding)
  const chatOn = !!aiStatus?.features["course-chat"];
  const [askHere, setAskHere] = useState<{ open: boolean; selection: string }>({ open: false, selection: "" });
  useEffect(() => {
    const open = () => (chatOn ? openCourseChat() : setAskHere({ open: true, selection: "" }));
    window.addEventListener(ASK_LESSON_EVENT, open);
    return () => window.removeEventListener(ASK_LESSON_EVENT, open);
  }, [chatOn]);
  const handleAskHere = () => {
    const text = selectedTextRef.current || selectedText;
    setMenu(null);
    if (chatOn) openCourseChat({ selection: text, q: "Explain the part I selected." });
    else setAskHere({ open: true, selection: text });
  };

  /* ---------------- the course tutor: "Explain this" / "Ask the tutor" on the passage (and Alt+A) */
  const tutor = useTutorActions(contentRef, { getRange: () => rangeRef.current, onDone: closeMenu });

  /* ---------------- notebook pages: clip the passage / snip the area around it */
  const lessonKey = `${week}/${lessonSlug}`;
  const capture = useCaptureActions({
    rootRef: contentRef,
    getRange: () => rangeRef.current,
    getText: () => selectedTextRef.current || selectedText,
    title: () => lessonTitle || document.title,
    lessonKey,
    onDone: closeMenu,
  });

  const handleCopyPrompt = async () => {
    const text = selectedTextRef.current || selectedText;
    const ctx = askContext();
    if (!text || !ctx) return;
    setMenu(null);
    const ok = await copyAskPrompt(text, ctx);
    setToast(ok ? { message: "Prompt copied. Paste it into any AI chat.", type: "success" } : { message: "Couldn't copy to the clipboard.", type: "error" });
  };

  /* ---------------- copy / share a link that reopens the lesson at this passage */
  const handleLink = async (channel: "copy" | "share") => {
    const root = contentRef.current;
    const range = rangeRef.current;
    if (!root || !range) return;
    setMenu(null);
    const res = await sharePassage(root, range, channel, lessonTitle);
    if (res === "copied") setToast({ message: LINK_COPIED, type: "success" });
    else if (res === "shared") setToast({ message: "Link shared — it opens at this line.", type: "success" });
    else if (res === "failed") setToast({ message: "Couldn't copy the link.", type: "error" });
  };

  /* ---------------- apply highlights + notes to the HTML (text nodes only, chrome skipped) */
  const applyHighlightsAndNotes = (html: string): string => {
    if ((highlights.length === 0 && notes.length === 0) || typeof document === "undefined") return html;
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    // concept term marks split text nodes: lift them so a highlight spanning a term still applies
    const terms = liftTerms(tempDiv);
    const plainText = contentText(tempDiv);

    type Item = { id: string; color: string; isNote: boolean };
    const byText = new Map<string, Map<number, Item>>();
    const occurrenceAt = (needle: string, offset: number | null) => {
      if (offset === null) return 0;
      const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      let i = 0;
      for (let m = re.exec(plainText); m; m = re.exec(plainText)) {
        if (m.index <= offset && offset < m.index + needle.length) return i;
        if (m.index > offset) return i; // content moved: nearest following occurrence
        i++;
        if (m[0].length === 0) re.lastIndex++;
      }
      return 0;
    };
    const add = (t: string, offset: number | null, item: Item) => {
      if (!t) return;
      if (!byText.has(t)) byText.set(t, new Map());
      byText.get(t)!.set(occurrenceAt(t, offset), item);
    };
    highlights.forEach((h) => add(h.highlight_text, h.highlight_offset, { id: h.id, color: h.color, isNote: false }));
    notes.forEach((n) => add(n.highlight_text, n.highlight_offset, { id: n.id, color: n.color, isNote: true }));

    for (const [needle, occurrences] of byText.entries()) {
      highlightTextInNode(tempDiv, needle, occurrences, { count: 0 });
    }
    restoreTerms(tempDiv, terms);
    return tempDiv.innerHTML;
  };

  const highlightTextInNode = (node: Node, needle: string, occurrences: Map<number, { id: string; color: string; isNote: boolean }>, seen: { count: number }) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent || "";
      const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const matches = [...value.matchAll(re)];
      if (!matches.length) return;
      let last = 0;
      let out = "";
      let changed = false;
      for (const m of matches) {
        const at = m.index ?? 0;
        out += escapeHtml(value.slice(last, at));
        const item = occurrences.get(seen.count);
        if (item) {
          changed = true;
          const hl = displayHighlightColor(item.color);
          out += item.isNote
            ? `<mark class="sd-mark" data-hl="${hl}" data-note-id="${escapeHtml(item.id)}" title="Open note">${escapeHtml(m[0])}</mark>`
            : `<mark class="sd-mark" data-hl="${hl}" data-highlight-id="${escapeHtml(item.id)}" title="Click to remove highlight">${escapeHtml(m[0])}</mark>`;
        } else out += escapeHtml(m[0]);
        seen.count++;
        last = at + m[0].length;
      }
      out += escapeHtml(value.slice(last));
      if (changed) {
        const span = document.createElement("span");
        span.innerHTML = out;
        const frag = document.createDocumentFragment();
        while (span.firstChild) frag.appendChild(span.firstChild);
        node.parentNode?.replaceChild(frag, node);
      }
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      if (tag === "script" || tag === "style" || tag === "mark" || el.hasAttribute("data-sd-chrome")) return;
      Array.from(node.childNodes).forEach((c) => highlightTextInNode(c, needle, occurrences, seen));
    }
  };

  const highlightedContent = applyHighlightsAndNotes(htmlContent);

  /* ---------------- scroll to a bookmarked / noted offset */
  useEffect(() => {
    if (bookmarkScrollTarget === null || !contentRef.current) return;
    const timer = window.setTimeout(() => {
      const root = contentRef.current;
      if (!root) return;
      const w = textWalker(root);
      let acc = 0;
      let found: Node | null = null;
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const len = (n.nodeValue || "").length;
        if (acc + len > bookmarkScrollTarget) {
          found = n;
          break;
        }
        acc += len;
      }
      let target: HTMLElement | null = found?.parentElement || null;
      while (target && (target.tagName === "SPAN" || target.tagName === "MARK" || target.tagName === "STRONG" || target.tagName === "EM")) target = target.parentElement;
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        const prevOutline = target.style.outline;
        target.style.outline = "1px solid var(--c-signal)";
        target.style.outlineOffset = "4px";
        window.setTimeout(() => {
          target.style.outline = prevOutline;
          target.style.outlineOffset = "";
        }, 3000);
      }
      setBookmarkScrollTarget(null);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [bookmarkScrollTarget]);

  return (
    <>
      <LessonProgressTracker courseId={courseId} week={week} lessonSlug={lessonSlug} contentRef={contentRef} />

      {!seen && (
        <div role="note" data-sd-chrome="" className="mb-6 flex items-center gap-x-3 border border-signal bg-surface py-2 pl-3 pr-2 animate-hk-in sm:mb-8 sm:flex-wrap sm:gap-x-4 sm:gap-y-3 sm:py-3 sm:pl-4 sm:pr-3">
          <span aria-hidden="true" className="hidden font-mono text-lg text-signal-text sm:inline">
            ↑
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-[1_1_260px]">
            <span className="text-sm font-semibold text-fg sm:text-[15px]">Select or long-press any text</span>
            {/* touch screens: no keyboard instructions, one short line */}
            <span className="text-[13px] leading-snug text-fg-2 [@media(pointer:fine)]:hidden">Highlight, note or bookmark it. Select any text and press Explain, or ask the tutor.</span>
            <span className="hidden text-[13px] leading-relaxed text-fg-2 [@media(pointer:fine)]:inline">
              Highlight, note or bookmark it. Select any text and press Explain, or ask the tutor. Keyboard: Shift + arrows to select, then{" "}
              <kbd className="border border-line-strong px-1 font-mono text-[12px]">H</kbd> <kbd className="border border-line-strong px-1 font-mono text-[12px]">N</kbd>{" "}
              <kbd className="border border-line-strong px-1 font-mono text-[12px]">B</kbd>, or <kbd className="border border-line-strong px-1 font-mono text-[12px]">A</kbd> to ask Claude / ChatGPT
              (Shift+F10 opens the toolbar). Notes land in your notebook.
            </span>
          </span>
          <button type="button" onClick={markCoachSeen} className="min-h-[44px] shrink-0 bg-fg px-4 text-sm font-semibold text-bg hover:bg-fg-2">
            Got it
          </button>
        </div>
      )}

      <div ref={contentRef} className="relative" data-sd-content="">
        <MarkdownContent htmlContent={highlightedContent} className={className} />
      </div>

      {menu && selectedText && (
        <TextSelectionMenu
          selectedText={selectedText}
          position={{ x: menu.x, y: menu.y }}
          placement={menu.placement}
          autoFocus={menu.autoFocus}
          onHighlight={handleHighlight}
          onBookmark={handleBookmark}
          onNote={handleNote}
          onAsk={handleAsk}
          onAskHere={aiStatus?.features["lesson-qa"] || chatOn ? handleAskHere : undefined}
          onCopyPrompt={handleCopyPrompt}
          {...tutor.menuProps(selectedText)}
          {...capture}
          onCopyLink={() => void handleLink("copy")}
          onShareLink={menu.placement === "sheet" && canNativeShare() ? () => void handleLink("share") : undefined}
          onClose={closeMenu}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <CaptureHost rootRef={contentRef} title={lessonTitle || ""} lessonKey={lessonKey} />

      <AskLessonPanel
        // remounted per opening, so it starts from the passage that was selected
        key={askHere.open ? `open:${askHere.selection}` : "closed"}
        open={askHere.open}
        onClose={() => setAskHere({ open: false, selection: "" })}
        week={week}
        slug={lessonSlug}
        lessonTitle={lessonTitle || ""}
        selection={askHere.selection}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Remove highlight"
        message="Remove this highlight? This can't be undone."
        confirmText="Remove"
        cancelText="Cancel"
        onConfirm={() => {
          if (confirmDialog.highlightId) void handleDeleteHighlight(confirmDialog.highlightId);
          setConfirmDialog({ isOpen: false, highlightId: null });
        }}
        onCancel={() => setConfirmDialog({ isOpen: false, highlightId: null })}
      />

      {showBookmarkDialog && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && handleCancelBookmarkDialog()}>
          <div role="dialog" aria-modal="true" aria-labelledby="bookmark-dialog-h" className="w-full max-w-md animate-hk-in border border-line-strong bg-surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 id="bookmark-dialog-h" className="font-display text-xl font-bold tracking-[-0.02em] text-fg">
                Add bookmark
              </h3>
              <button type="button" onClick={handleCancelBookmarkDialog} className="grid h-11 w-11 place-items-center text-fg-3 hover:text-fg" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-4 px-5 py-4">
              {selectedTextRef.current && (
                <p className="border-l-2 border-signal pl-3 text-sm leading-relaxed text-fg-2">
                  {selectedTextRef.current.slice(0, 140)}
                  {selectedTextRef.current.length > 140 ? "…" : ""}
                </p>
              )}
              {lessonTitle && <p className="font-mono text-xs uppercase tracking-label text-fg-3">From · {lessonTitle}</p>}
              <label className="flex flex-col gap-1.5 text-sm text-fg-2" htmlFor="bookmark-custom-title">
                Name (optional)
                <input
                  id="bookmark-custom-title"
                  type="text"
                  value={bookmarkCustomTitle}
                  onChange={(e) => setBookmarkCustomTitle(e.target.value)}
                  placeholder="Defaults to the selected text"
                  className="min-h-[44px] border border-line-strong bg-bg px-3 text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-fg-2" htmlFor="bookmark-note-text">
                Note (optional)
                <textarea
                  id="bookmark-note-text"
                  value={bookmarkNote}
                  onChange={(e) => setBookmarkNote(e.target.value)}
                  placeholder="Why this matters"
                  rows={3}
                  className="resize-none border border-line-strong bg-bg px-3 py-2 text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
              <button type="button" onClick={handleCancelBookmarkDialog} disabled={isSavingBookmark} className="min-h-[44px] border border-line-strong px-4 text-sm text-fg hover:border-fg-3 disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={handleSaveBookmark} disabled={isSavingBookmark} className="min-h-[44px] bg-signal px-4 text-sm font-semibold text-on-signal disabled:opacity-50">
                {isSavingBookmark ? "Saving…" : "Save bookmark"}
              </button>
            </div>
          </div>
        </div>
      )}

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
