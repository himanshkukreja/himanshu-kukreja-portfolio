"use client";

/**
 * Note editor dialog (used by the reader's highlight tools and the MCQ page).
 * Same props as before; note types are text chips (no emoji), colours use the Learn colour key,
 * and delete asks for confirmation inline instead of window.confirm.
 */
import { useEffect, useRef, useState } from "react";
import { COLOUR_ORDER, HIGHLIGHT_COLOURS, NOTE_TYPES, type NoteColor, type NoteType } from "@/lib/learn/notebook";

type NoteEditorProps = {
  isOpen: boolean;
  selectedText: string;
  lessonTitle?: string;
  existingNote?: {
    id: string;
    note_text: string;
    note_type: NoteType;
    color: NoteColor;
  } | null;
  onSave: (noteText: string, noteType: NoteType, color: NoteColor) => void;
  onDelete?: () => void;
  onClose: () => void;
  isSaving?: boolean;
};

function Editor({ selectedText, lessonTitle, existingNote, onSave, onDelete, onClose, isSaving }: Omit<NoteEditorProps, "isOpen">) {
  const [noteText, setNoteText] = useState(existingNote?.note_text || "");
  const [noteType, setNoteType] = useState<NoteType>(existingNote?.note_type || "general");
  const [color, setColor] = useState<NoteColor>(existingNote?.color || "yellow");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const save = () => {
    if (noteText.trim()) onSave(noteText.trim(), noteType, color);
  };
  const colours = COLOUR_ORDER.filter((c) => c !== "purple" || existingNote?.color === "purple");

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="note-editor-h" className="flex max-h-[92vh] w-full max-w-[560px] animate-hk-in flex-col overflow-y-auto border border-line-strong bg-surface">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-mono text-[11px] tracking-label text-fg-3">{selectedText ? "NOTE ON HIGHLIGHT" : "NOTE"} · PRIVATE</span>
            <h2 id="note-editor-h" className="font-display text-2xl font-bold tracking-[-0.02em] text-fg">
              {existingNote ? "Edit note" : "Add a note"}
            </h2>
            {lessonTitle && <span className="truncate text-xs text-fg-3">{lessonTitle}</span>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center border border-line-strong text-lg text-fg-3 hover:text-fg">
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          {selectedText && (
            <p className="pl-3 text-sm leading-relaxed text-fg-2 shadow-[inset_2px_0_0_var(--c-signal)]">
              “{selectedText.slice(0, 220)}
              {selectedText.length > 220 ? "…" : ""}”
            </p>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="pb-2 font-mono text-[11px] tracking-label text-fg-3">TYPE</legend>
            <div className="flex flex-wrap gap-1.5">
              {NOTE_TYPES.map((t) => {
                const on = noteType === t.value;
                return (
                  <label key={t.value} className={`inline-flex min-h-10 cursor-pointer items-center px-3 font-mono text-xs ${on ? "bg-fg text-bg" : "border border-line-strong text-fg-2 hover:text-fg"} has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal`}>
                    <input type="radio" name="note-type" value={t.value} checked={on} onChange={() => setNoteType(t.value)} className="sr-only" />
                    {t.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="pb-2 font-mono text-[11px] tracking-label text-fg-3">HIGHLIGHT COLOUR</legend>
            <div className="flex flex-wrap gap-1.5">
              {colours.map((c) => {
                const on = color === c;
                return (
                  <label key={c} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 px-3 text-sm ${on ? "border border-fg bg-surface-2 text-fg" : "border border-line-strong text-fg-2"} has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal`}>
                    <input type="radio" name="note-colour" value={c} checked={on} onChange={() => setColor(c)} className="sr-only" />
                    <span aria-hidden className="h-3.5 w-3.5" style={{ background: HIGHLIGHT_COLOURS[c].swatch }} />
                    {HIGHLIGHT_COLOURS[c].label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] tracking-label text-fg-3">YOUR NOTE</span>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") save();
              }}
              placeholder="Why did this matter?"
              rows={5}
              autoFocus
              className="resize-y border border-signal bg-bg px-3 py-2.5 text-[15px] leading-normal text-fg outline-none placeholder:text-fg-4"
            />
          </label>
        </div>

        {confirmDelete ? (
          <div role="alertdialog" aria-label="Delete this note?" className="flex flex-wrap items-center justify-between gap-3 border-t border-bad px-5 py-4">
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold text-fg">Delete this note?</span>
              <span className="text-[13px] text-fg-3">The highlight goes with it.</span>
            </span>
            <span className="flex gap-2">
              <button type="button" autoFocus onClick={() => setConfirmDelete(false)} className="min-h-11 border border-line-strong px-4 text-sm text-fg">
                Keep it
              </button>
              <button type="button" onClick={onDelete} disabled={isSaving} className="min-h-11 bg-bad px-4 text-sm font-semibold text-[#120203] disabled:opacity-60">
                Delete
              </button>
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-4">
            <div>
              {existingNote && onDelete && (
                <button type="button" onClick={() => setConfirmDelete(true)} disabled={isSaving} className="min-h-11 px-2 text-sm text-bad-text underline disabled:opacity-50">
                  Delete note
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} disabled={isSaving} className="min-h-11 border border-line-strong px-4 text-sm text-fg disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={save} disabled={isSaving || !noteText.trim()} className="min-h-11 bg-signal px-4 text-sm font-semibold text-on-signal disabled:opacity-50">
                {isSaving ? "Saving…" : existingNote ? "Update note" : "Save note"} <span className="font-mono text-[11px]">⌘↵</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function NoteEditor({ isOpen, ...rest }: NoteEditorProps) {
  if (!isOpen) return null;
  // Remount per note so the form starts from that note's values.
  return <Editor key={rest.existingNote?.id || "new"} {...rest} />;
}
