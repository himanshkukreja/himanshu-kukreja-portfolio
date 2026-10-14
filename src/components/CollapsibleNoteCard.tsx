"use client";

/**
 * A note as a collapsible card. Kept for callers of the old notes list; the notebook renders its
 * own rows. No emoji: the note type is a text chip (noteTypeIcons is accepted but ignored).
 */
import { useState } from "react";
import Link from "next/link";
import { HIGHLIGHT_COLOURS, noteTypeLabel, type NoteColor } from "@/lib/learn/notebook";

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
    color: NoteColor;
    created_at: string;
    updated_at: string;
  };
  noteTypeIcons?: Record<string, string>;
  noteTypeLabels?: Record<string, string>;
  formatLessonTitle: (slug: string) => string;
  formatWeekName: (week: string) => string;
  onEdit: () => void;
  onDelete: () => void;
};

export default function CollapsibleNoteCard({ note, noteTypeLabels, formatLessonTitle, formatWeekName, onEdit, onDelete }: NoteCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const col = HIGHLIGHT_COLOURS[note.color] || HIGHLIGHT_COLOURS.yellow;
  const noteUrl = `/learn/${note.course_id}/${note.week}/${note.lesson_slug}${note.highlight_offset !== null ? `#note-${note.highlight_offset}` : ""}`;
  const typeLabel = noteTypeLabels?.[note.note_type] ? noteTypeLabel(note.note_type) : noteTypeLabel(note.note_type);
  const panelId = `note-${note.id}-body`;

  return (
    <article className={`flex flex-col bg-surface ${confirming ? "border border-bad" : "border border-line"}`}>
      <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
        <button type="button" onClick={() => setIsExpanded((x) => !x)} aria-expanded={isExpanded} aria-controls={panelId} className="flex min-h-11 min-w-0 flex-1 flex-col gap-1.5 text-left">
          <span className="flex flex-wrap items-center gap-2">
            <span className="border border-line-strong px-2 py-0.5 font-mono text-[11px] tracking-label text-fg">{typeLabel.toUpperCase()}</span>
            <span className="font-mono text-[11px] tracking-label text-fg-3">{formatWeekName(note.week).toUpperCase()}</span>
          </span>
          <span className="text-base font-semibold text-fg">{formatLessonTitle(note.lesson_slug)}</span>
          {!isExpanded && <span className="line-clamp-2 text-sm text-fg-2">{note.note_text}</span>}
        </button>
        <span aria-hidden className="pt-1 font-mono text-fg-3">
          {isExpanded ? "−" : "+"}
        </span>
      </div>

      {isExpanded && (
        <div id={panelId} className="flex animate-hk-in flex-col gap-3 px-4 pb-4 sm:px-5">
          {note.highlight_text && (
            <p className="text-[15px] leading-[1.7] text-fg">
              <span className="py-0.5 [box-decoration-break:clone]" style={{ background: col.tint, boxShadow: `inset 0 -2px 0 ${col.swatch}` }}>
                {note.highlight_text.slice(0, 280)}
                {note.highlight_text.length > 280 ? "…" : ""}
              </span>
            </p>
          )}
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-fg">{note.note_text}</p>
          <span className="font-mono text-[11px] text-fg-3">
            created {new Date(note.created_at).toLocaleDateString()}
            {note.updated_at !== note.created_at ? ` · edited ${new Date(note.updated_at).toLocaleDateString()}` : ""}
          </span>
        </div>
      )}

      {confirming ? (
        <div role="alertdialog" aria-label="Delete this note?" className="flex flex-wrap items-center justify-between gap-3 border-t border-bad px-4 py-3 sm:px-5">
          <span className="text-[15px] font-semibold text-fg">Delete this note?</span>
          <span className="flex gap-2">
            <button type="button" autoFocus onClick={() => setConfirming(false)} className="min-h-11 border border-line-strong px-4 text-sm text-fg">
              Keep it
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                onDelete();
              }}
              className="min-h-11 bg-bad px-4 text-sm font-semibold text-[#120203]"
            >
              Delete
            </button>
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-4 py-2.5 sm:px-5">
          <Link href={noteUrl} className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-signal-text">
            Open at note ›
          </Link>
          <span className="flex-1" />
          <button type="button" onClick={onEdit} className="min-h-11 border border-line-strong px-3 text-[13px] text-fg hover:bg-surface-2">
            Edit
          </button>
          <button type="button" onClick={() => setConfirming(true)} aria-label="Delete note" className="min-h-11 border border-line-strong px-3 text-[13px] text-fg-3 hover:text-fg">
            Delete
          </button>
        </div>
      )}
    </article>
  );
}
