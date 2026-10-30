"use client";

/**
 * "Make review cards": the cards the AI made from the page's notes. The learner keeps the ones they want; kept cards go
 * to their review queue (lib/learn/review addReviewCard → review_cards, or this browser for a moment if that fails),
 * due today in Box 1, like a highlight turned into a card. They can also save them as a note under the page's lesson.
 *
 * They use review_cards.source "notes" (added by supabase/migrations/20261031_notebook_pages.sql) with sourceRef
 * "ink:<page>:<hash of the question>" and a "My notebook" context.
 */
import { useState } from "react";
import Link from "next/link";
import { Check, Layers, NotebookPen } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { addReviewCard } from "@/lib/learn/review";
import { cardRef, NOTES_COURSE_ID, type NoteCard } from "@/lib/ai/notes";
import { saveToNotes } from "./TypedPanel";

const BTN = "inline-flex min-h-10 items-center gap-1.5 border border-line-strong px-3 font-mono text-[12px] text-fg-2 hover:border-fg-3 hover:text-fg disabled:opacity-50 [@media(pointer:coarse)]:min-h-11";

export default function CardsPanel({ cards, pageId, pageTitle, lessonKey }: { cards: NoteCard[]; pageId: string; pageTitle: string; lessonKey: string | null }) {
  const { user } = useAuth();
  const [keep, setKeep] = useState<boolean[]>(() => cards.map(() => true));
  const [state, setState] = useState<"" | "adding" | "added">("");
  const [note, setNote] = useState<"" | "saving" | "saved" | "error">("");
  const [msg, setMsg] = useState("");
  const kept = cards.filter((_, i) => keep[i]);
  const [week, slug] = (lessonKey || "").split("/");

  const add = async () => {
    setState("adding");
    let added = 0;
    let dup = 0;
    let local = 0;
    for (const c of kept) {
      const r = await addReviewCard({
        source: "notes",
        sourceRef: cardRef(pageId, c.q),
        courseId: NOTES_COURSE_ID,
        week: week || undefined,
        lessonSlug: slug || undefined,
        front: c.q,
        back: c.a,
        detail: { context: `My notebook${pageTitle ? ` · ${pageTitle}` : ""}`, short: c.q.length > 48 ? `${c.q.slice(0, 46).trim()}…` : c.q },
      });
      if (!r.ok) continue;
      if (r.duplicate) dup++;
      else added++;
      if (r.storage === "local") local++;
    }
    setState("added");
    setMsg(
      `${added ? `Added ${added} card${added === 1 ? "" : "s"} to your review, due today` : "Nothing new to add"}${dup ? ` · ${dup} already there` : ""}${local ? " · saved on this device for now" : ""}.`,
    );
  };

  const saveNote = async () => {
    if (!user || !lessonKey) return;
    setNote("saving");
    const text = `Review cards from my notebook${pageTitle ? ` · ${pageTitle}` : ""}\n\n${kept.map((c) => `Q: ${c.q}\nA: ${c.a}`).join("\n\n")}`;
    const r = await saveToNotes(user.id, lessonKey, text);
    setNote(r.ok ? "saved" : "error");
    if (!r.ok) setMsg(r.message || "");
  };

  if (!cards.length)
    return (
      <section aria-label="Review cards" className="flex flex-col gap-2">
        <h3 className="m-0 font-mono text-[11px] uppercase tracking-label text-signal-text">review cards</h3>
        <p className="m-0 text-[14px] text-fg-2">There wasn&apos;t enough on this page to make good cards. Add a few more facts and try again.</p>
      </section>
    );

  return (
    <section aria-label="Review cards" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 font-mono text-[11px] uppercase tracking-label text-signal-text">review cards · {cards.length}</h3>
        <span className="font-mono text-[11px] text-fg-4">untick the ones you don&apos;t want</span>
      </div>
      <p className="m-0 text-[12.5px] leading-snug text-fg-3">Cards use your notes as written{lessonKey ? ": check the page against the lesson first if you're unsure of a fact." : "."}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {cards.map((c, i) => (
          <li key={i}>
            <label className={`flex cursor-pointer gap-3 border px-3 py-2.5 ${keep[i] ? "border-line-strong bg-bg" : "border-line opacity-60"}`}>
              <input
                type="checkbox"
                checked={keep[i]}
                disabled={state !== ""}
                onChange={(e) => setKeep((k) => k.map((v, j) => (j === i ? e.target.checked : v)))}
                className="mt-1 h-5 w-5 shrink-0 accent-signal"
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[14.5px] font-semibold leading-snug text-fg">{c.q}</span>
                <span className="text-[14px] leading-relaxed text-fg-2">{c.a}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!kept.length || state !== ""} onClick={() => void add()} className="inline-flex min-h-10 items-center gap-1.5 bg-signal px-3.5 font-mono text-[12px] font-semibold text-on-signal disabled:opacity-50 [@media(pointer:coarse)]:min-h-11">
          {state === "added" ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Layers className="h-3.5 w-3.5" aria-hidden />}
          {state === "added" ? "Added to review" : state === "adding" ? "Adding…" : `Add ${kept.length} to my review`}
        </button>
        <button type="button" disabled={!kept.length || !lessonKey || note === "saving" || note === "saved"} onClick={() => void saveNote()} className={BTN} title={lessonKey ? undefined : "Link this page to a lesson to save them under that lesson's notes"}>
          {note === "saved" ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <NotebookPen className="h-3.5 w-3.5" aria-hidden />}
          {note === "saved" ? "Saved as a note" : "Save as a note"}
        </button>
      </div>
      {msg && (
        <p className="m-0 text-[13px] text-fg-2" role="status">
          {msg}{" "}
          {state === "added" && (
            <Link href="/learn/review" className="font-semibold text-signal-text">
              Open review ›
            </Link>
          )}
        </p>
      )}
    </section>
  );
}
