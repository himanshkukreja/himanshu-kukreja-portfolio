"use client";

/**
 * The page AI's small print: one quiet line that opens on a tap (the owner's rule for small print, like the chat's).
 * What it promises is what the routes do: nothing leaves the page until a button is pressed; the image is never kept
 * (the 30-day abuse log keeps the request's text, not the picture).
 */
import { AI_FREE_LINE } from "@/components/learn/ai/AiFreeNote";

export const NOTES_PRIVACY =
  "Your pages are private: only you can open them. Nothing on a page goes to the AI until you press one of these buttons. Then the page image (for Convert) or its typed text (for Check and Cards) goes to Anthropic's AI to answer; it isn't used to train models. The request's text is kept 30 days to stop abuse, then deleted; the page image is never stored.";

export default function NotesFinePrint() {
  return (
    <details className="group text-[11.5px] leading-snug text-fg-4">
      <summary className="cursor-pointer list-none py-1.5 font-mono text-[11px] leading-relaxed hover:text-fg-3 [&::-webkit-details-marker]:hidden [@media(pointer:coarse)]:py-3">
        sent only when you press a button · not used to train AI ·{" "}
        <span className="underline decoration-line-strong underline-offset-2 group-open:text-fg-3">privacy</span>
      </summary>
      <p className="m-0 mt-1.5">
        {NOTES_PRIVACY} {AI_FREE_LINE}
      </p>
    </details>
  );
}
