/**
 * What the notebook does, in four lines: write, clip, snip, turn into text. Shown in the panel's empty state, its
 * signed-out state, the first-time strip and the notebook page's "Your pages" when there are none yet.
 */
import { Crop, PenLine, ScanText, TextQuote } from "lucide-react";

export const FOUR_THINGS = [
  { icon: PenLine, title: "Write", body: "Apple Pencil, a stylus, a finger or a mouse, on ruled, grid or Cornell paper." },
  { icon: TextQuote, title: "Clip", body: "Select text on any course page and choose Clip: it lands here with a link back." },
  { icon: Crop, title: "Snip", body: "Drag a box round a diagram or a table to keep a picture of it." },
  { icon: ScanText, title: "Turn into text", body: "The AI types up your handwriting, so it's searchable and easy to review." },
] as const;

export default function NotebookIntro({ dense = false }: { dense?: boolean }) {
  return (
    <ul className={`m-0 grid list-none p-0 ${dense ? "gap-2" : "gap-3"}`}>
      {FOUR_THINGS.map(({ icon: I, title, body }) => (
        <li key={title} className="flex items-start gap-3">
          <span aria-hidden className={`grid shrink-0 place-items-center border border-line-strong bg-surface text-signal-text ${dense ? "h-8 w-8" : "h-9 w-9"}`}>
            <I className="h-4 w-4" />
          </span>
          <span className={`min-w-0 leading-snug text-fg-2 ${dense ? "text-[13.5px]" : "text-[14.5px]"}`}>
            <strong className="font-semibold text-fg">{title}.</strong> {body}
          </span>
        </li>
      ))}
    </ul>
  );
}
