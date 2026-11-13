import "server-only";
/**
 * Reads one learner's own notes for one lesson, per request, for the tutor (see ./notes-model.ts). Always by the verified user
 * id; the opt-in flag is read fresh from the database on every call (never from a cache), so switching it off takes effect
 * at once. Nothing read is kept: there is no cache, no write, no log of the text.
 *   - notebook_pages tied to the lesson (lesson_key): the typed version (converted_md) and the typed boxes and clips
 *   - content_notes for the lesson: highlights and margin notes
 */
import { supabase } from "@/lib/supabase";
import { COURSE_ID } from "@/lib/learn/course";
import { pageItems, pageItemsText, readTyped } from "@/lib/ai/notes";
import type { NotebookPage } from "@/lib/learn/ink/types";
import { notesOptedIn, TUTOR_NOTES_FLAG, type MyNotes } from "./notes-model";

/** Whether the learner has switched on "Let the tutor read my notes" (fresh read; false when unknown). */
export async function tutorNotesOn(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("user_profiles").select("game_flags").eq("id", userId).maybeSingle();
  if (error) return false;
  return notesOptedIn((data as { game_flags?: Record<string, unknown> | null } | null)?.game_flags);
}

/** The learner's notes for a lesson, or null when the switch is off (nothing is read then), or { empty } when there are none. */
export async function readMyNotes(userId: string, week: string, slug: string): Promise<MyNotes | null> {
  if (!userId || !(await tutorNotesOn(userId))) return null;
  const [pages, notes] = await Promise.all([
    supabase.from("notebook_pages").select("title, converted_md, items").eq("user_id", userId).eq("lesson_key", `${week}/${slug}`).order("updated_at", { ascending: false }).limit(4),
    supabase.from("content_notes").select("highlight_text, note_text, note_type").eq("user_id", userId).eq("course_id", COURSE_ID).eq("week", week).eq("lesson_slug", slug).order("created_at", { ascending: true }).limit(80),
  ]);
  const out: MyNotes = { pages: [], highlights: [], notes: [] };
  for (const r of (pages.error ? [] : (pages.data ?? [])) as { title: string; converted_md: string | null; items: NotebookPage["items"] | null }[]) {
    const typed = readTyped(r.converted_md).md;
    const boxes = pageItemsText(pageItems({ items: Array.isArray(r.items) ? r.items : [] }));
    const text = [typed, !typed || boxes ? boxes : ""].filter(Boolean).join("\n\n");
    if (text.trim()) out.pages.push({ title: r.title || "Untitled page", text });
  }
  for (const r of (notes.error ? [] : (notes.data ?? [])) as { highlight_text: string | null; note_text: string | null; note_type: string | null }[]) {
    if (r.note_text?.trim()) out.notes.push({ text: r.note_text, on: r.highlight_text || "", type: r.note_type || "note" });
    else if (r.highlight_text?.trim()) out.highlights.push(r.highlight_text);
  }
  return out;
}

export { TUTOR_NOTES_FLAG };
