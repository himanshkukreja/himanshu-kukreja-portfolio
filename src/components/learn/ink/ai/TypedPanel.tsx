"use client";

/**
 * The page's typed version (page.convertedMd): read it, edit it (saved back on the page), copy it, or save it to
 * the learner's notes (a content_notes row under the page's lesson, the way a lesson note is made: the browser
 * inserts it, row-level security keeps it theirs; it then shows on /learn/notebook → Notes).
 */
import { useState } from "react";
import Link from "next/link";
import { Check, Copy, NotebookPen, Pencil, RotateCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseClient } from "@/lib/supabase-client";
import NotesMd from "./NotesMd";
import { NOTES_COURSE_ID, NOTES_MD_MAX } from "@/lib/ai/notes";

const BTN = "inline-flex min-h-10 items-center gap-1.5 border border-line-strong px-3 font-mono text-[12px] text-fg-2 hover:border-fg-3 hover:text-fg disabled:opacity-50 [@media(pointer:coarse)]:min-h-11";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A content_notes row for this page's typed text (or cards), under its lesson. */
export async function saveToNotes(userId: string, lessonKey: string, text: string): Promise<{ ok: boolean; message?: string }> {
  const [week, slug] = lessonKey.split("/");
  if (!week || !slug) return { ok: false, message: "This page isn't linked to a lesson." };
  const { error } = await supabaseClient.from("content_notes").insert({
    user_id: userId,
    course_id: NOTES_COURSE_ID,
    week,
    lesson_slug: slug,
    note_text: text.slice(0, NOTES_MD_MAX + 200),
    note_type: "general",
    color: "yellow",
    is_private: true,
  });
  return error ? { ok: false, message: "Couldn't save to your notes. Try again." } : { ok: true };
}

const ago = (iso: string | null) => {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export default function TypedPanel(props: {
  md: string;
  convertedAt: string | null;
  pageTitle: string;
  lessonKey: string | null;
  busy: boolean;
  onEdit: (md: string) => Promise<boolean>;
  onReconvert: () => void;
}) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.md);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<"" | "saving" | "saved" | "error">("");
  const [msg, setMsg] = useState("");

  const doCopy = async () => {
    const ok = await copyText(props.md);
    setCopied(ok);
    setMsg(ok ? "" : "Couldn't copy: select the text and copy it instead.");
    if (ok) window.setTimeout(() => setCopied(false), 1800);
  };
  const doSaveNote = async () => {
    if (!user || !props.lessonKey) return;
    setSaved("saving");
    const head = props.pageTitle ? `From my notebook · ${props.pageTitle}\n\n` : "From my notebook\n\n";
    const r = await saveToNotes(user.id, props.lessonKey, head + props.md);
    setSaved(r.ok ? "saved" : "error");
    setMsg(r.ok ? "" : r.message || "");
  };
  const doneEdit = async () => {
    const ok = await props.onEdit(draft.trim());
    if (ok) setEditing(false);
  };

  return (
    <section aria-label="Typed version of this page" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 font-mono text-[11px] uppercase tracking-label text-signal-text">typed version</h3>
        {props.convertedAt && <span className="font-mono text-[11px] text-fg-4">typed {ago(props.convertedAt)}</span>}
      </div>
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, NOTES_MD_MAX))}
          rows={14}
          aria-label="Edit the typed version"
          className="w-full resize-y border border-line-strong bg-bg px-3 py-2 font-mono text-[13px] leading-relaxed text-fg focus:border-signal focus:outline-none"
        />
      ) : (
        <div className="max-h-[46dvh] overflow-y-auto border border-line bg-bg px-3 py-3">
          <NotesMd md={props.md} />
        </div>
      )}
      <p className="m-0 text-[12px] text-fg-3">
        <span className="font-mono text-fg-2">[?]</span> marks a word the AI couldn&apos;t read. Fix it in Edit.
      </p>
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <button type="button" onClick={() => void doneEdit()} className={`${BTN} border-signal text-fg`}>
              <Check className="h-3.5 w-3.5" aria-hidden /> Save edits
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(props.md);
                setEditing(false);
              }}
              className={BTN}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setDraft(props.md);
                setEditing(true);
              }}
              className={BTN}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
            </button>
            <button type="button" onClick={() => void doCopy()} className={BTN}>
              {copied ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" disabled={!props.lessonKey || saved === "saving" || saved === "saved"} onClick={() => void doSaveNote()} className={BTN} title={props.lessonKey ? undefined : "Link this page to a lesson to save it under that lesson's notes"}>
              {saved === "saved" ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <NotebookPen className="h-3.5 w-3.5" aria-hidden />}
              {saved === "saved" ? "Saved to my notes" : saved === "saving" ? "Saving…" : "Save to my notes"}
            </button>
            <button type="button" disabled={props.busy} onClick={props.onReconvert} className={BTN}>
              <RotateCw className="h-3.5 w-3.5" aria-hidden /> Convert again
            </button>
          </>
        )}
      </div>
      {saved === "saved" && (
        <p className="m-0 text-[13px] text-fg-2" role="status">
          Saved under this lesson.{" "}
          <Link href="/learn/notebook?tab=notes" className="font-semibold text-signal-text">
            Open my notes ›
          </Link>
        </p>
      )}
      {!props.lessonKey && !editing && <p className="m-0 text-[12px] text-fg-4">Link this page to a lesson to save it to your notes.</p>}
      {msg && (
        <p className="m-0 text-[13px] text-bad-text" role="alert">
          {msg}
        </p>
      )}
    </section>
  );
}
