"use client";

/**
 * The Text side of a converted page: the typed version (page.convertedMd) shown in place of the handwriting, as a
 * page of its own (the Ink / Text toggle in the page toolbar switches). Read it, edit it (saved back on the page),
 * copy it, or save it to the learner's notes (a content_notes row under the page's lesson, the way a lesson note is
 * made: the browser inserts it, row-level security keeps it theirs; it then shows on /learn/notebook → Notes).
 * When the handwriting changed after it was typed up, a line says so with a one-tap update (which asks first when
 * the learner edited the text by hand, since an update replaces their edits).
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, NotebookPen, Pencil, PenLine, RotateCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseClient } from "@/lib/supabase-client";
import { Dots } from "@/components/learn/chat/ChatLive";
import NotesMd from "./NotesMd";
import { NOTES_COURSE_ID, NOTES_MD_MAX } from "@/lib/ai/notes";
import type { PageAi } from "./usePageAi";

const BTN =
  "inline-flex min-h-11 items-center gap-1.5 border border-line-strong bg-bg px-3 font-mono text-[12px] text-fg-2 hover:border-fg-3 hover:text-fg focus-visible:border-signal disabled:opacity-50 [touch-action:manipulation]";

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

export default function TypedPanel(props: { ai: PageAi; convertedAt: string | null; pageTitle: string; lessonKey: string | null; onInk: () => void }) {
  const { ai } = props;
  const md = ai.typed;
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(md);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<"" | "saving" | "saved" | "error">("");
  const [msg, setMsg] = useState("");
  const [confirm, setConfirm] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const updating = ai.busy === "convert";
  const updateError = ai.error?.action === "convert" ? ai.error.text : "";

  useEffect(() => {
    if (!editing) return;
    const el = areaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);
  // the textarea grows with the text (the view scrolls, not the box)
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [draft, editing]);

  const doCopy = async () => {
    const ok = await copyText(md);
    setCopied(ok);
    setMsg(ok ? "" : "Couldn't copy: select the text and copy it instead.");
    if (ok) window.setTimeout(() => setCopied(false), 1800);
  };
  const doSaveNote = async () => {
    if (!user || !props.lessonKey) return;
    setSaved("saving");
    const head = props.pageTitle ? `From my notebook · ${props.pageTitle}\n\n` : "From my notebook\n\n";
    const r = await saveToNotes(user.id, props.lessonKey, head + md);
    setSaved(r.ok ? "saved" : "error");
    setMsg(r.ok ? "" : r.message || "");
  };
  const startEdit = () => {
    setDraft(md);
    setEditing(true);
  };
  const doneEdit = () => {
    ai.saveEdit(draft);
    setEditing(false);
  };
  const cancelEdit = () => {
    setDraft(md);
    setEditing(false);
  };
  const update = () => {
    if (ai.edited && !confirm) return setConfirm(true);
    setConfirm(false);
    void ai.run("convert");
  };

  return (
    <section aria-label="Text version of this page" data-ink-ui className="absolute inset-0 z-30 flex flex-col bg-surface-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-2 py-1.5 sm:px-3">
        {editing ? (
          <>
            <button type="button" onClick={doneEdit} className={`${BTN} border-signal text-fg`}>
              <Check className="h-3.5 w-3.5" aria-hidden /> Save edits
            </button>
            <button type="button" onClick={cancelEdit} className={BTN}>
              Cancel
            </button>
            <span className="ml-auto hidden font-mono text-[11px] text-fg-4 sm:inline">Markdown · ⌘↵ saves · Esc cancels</span>
          </>
        ) : (
          <>
            <button type="button" onClick={startEdit} disabled={updating} className={BTN}>
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
            </button>
            <button type="button" onClick={() => void doCopy()} className={BTN}>
              {copied ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              disabled={!props.lessonKey || saved === "saving" || saved === "saved"}
              onClick={() => void doSaveNote()}
              className={BTN}
              title={props.lessonKey ? "Save this text under the lesson's notes" : "Link this page to a lesson to save it under that lesson's notes"}
            >
              {saved === "saved" ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <NotebookPen className="h-3.5 w-3.5" aria-hidden />}
              {saved === "saved" ? "Saved to my notes" : saved === "saving" ? "Saving…" : "Save to my notes"}
            </button>
            {/* on a phone the toolbar's Ink / Text toggle sits just above: no second way back taking a row */}
            <button type="button" onClick={props.onInk} className={`${BTN} ml-auto max-sm:hidden`}>
              <PenLine className="h-3.5 w-3.5" aria-hidden /> Back to ink
            </button>
          </>
        )}
      </div>

      {(ai.stale || updating || updateError) && !editing && (
        <div role="status" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-bg px-3 py-1.5 sm:px-4">
          {updating ? (
            <span className="flex min-h-11 items-center gap-2.5">
              <Dots />
              <span className="hk-shimmer text-[14px] font-medium">{ai.step || "Reading your handwriting…"}</span>
              {ai.secs >= 6 && <span className="font-mono text-[11px] text-fg-4">{ai.secs}s</span>}
            </span>
          ) : updateError ? (
            <>
              <span className="min-w-0 flex-1 text-[14px] text-bad-text">{updateError}</span>
              <button type="button" onClick={update} disabled={!!ai.blocked} className={BTN}>
                <RotateCw className="h-3.5 w-3.5" aria-hidden /> Try again
              </button>
            </>
          ) : confirm ? (
            <>
              <span className="min-w-0 flex-1 text-[14px] text-fg">Updating types the page again and replaces your edits.</span>
              <button type="button" onClick={update} className={`${BTN} border-signal text-fg`}>
                Update anyway
              </button>
              <button type="button" onClick={() => setConfirm(false)} className={BTN}>
                Keep my edits
              </button>
            </>
          ) : (
            <>
              <span className="flex min-w-0 flex-1 items-center gap-2 text-[14px] text-fg">
                <span aria-hidden className="h-2 w-2 shrink-0 bg-signal" />
                Handwriting changed since this text
              </span>
              <button
                type="button"
                onClick={update}
                disabled={!!ai.blocked || !!ai.busy}
                title={ai.blocked ?? `Type the page up again · ${ai.cost("convert")}`}
                className={`${BTN} border-signal font-semibold text-fg`}
              >
                <RotateCw className="h-3.5 w-3.5 text-signal-text" aria-hidden /> Update
                <span className="font-normal text-fg-4">· {ai.status?.ownKey ? "own key" : "~1 credit"}</span>
              </button>
            </>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-6 sm:py-6">
        <article className="mx-auto flex max-w-[720px] flex-col gap-4 border border-line bg-bg px-4 py-5 shadow-[0_8px_30px_rgba(0,0,0,0.08)] sm:px-9 sm:py-8">
          <p className="m-0 flex flex-wrap items-baseline justify-between gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
            <span>typed from your handwriting</span>
            {props.convertedAt && <span className="normal-case tracking-normal text-fg-4">{ago(props.convertedAt)}{ai.edited ? " · edited" : ""}</span>}
          </p>
          {editing ? (
            <textarea
              ref={areaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, NOTES_MD_MAX))}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  doneEdit();
                }
              }}
              aria-label="Edit the text of this page (Markdown)"
              className="min-h-[50dvh] w-full resize-none overflow-hidden border border-line-strong bg-bg px-3 py-2 font-mono text-[14px] leading-relaxed text-fg focus:border-signal focus:outline-none"
            />
          ) : (
            <NotesMd md={md} page />
          )}
          {!editing && /\[\?\]/.test(md) && (
            <p className="m-0 border-t border-line pt-3 text-[12.5px] text-fg-3">
              <span className="font-mono text-fg-2">[?]</span> marks a word the AI couldn&apos;t read. Fix it in Edit.
            </p>
          )}
        </article>
        <div className="mx-auto flex max-w-[720px] flex-col gap-1 px-1 pt-3">
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
        </div>
      </div>
    </section>
  );
}
