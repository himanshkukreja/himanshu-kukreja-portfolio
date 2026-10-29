"use client";

/**
 * The AI's direct answer (SmartAnswer.answer + cites): plain text with numbered citations, each a link to
 * the index entry it came from, and the sources listed under it. The text and the links never come from
 * the model as markup: the parser (lib/search/smart/ai.ts) turned "[c3]" into a number that points at a
 * resolved index entry.
 */
import Link from "next/link";
import KindIcon from "./KindIcon";
import { KIND_LABEL, type AnswerPart, type Hit } from "@/lib/search/smart/types";

export default function CitedAnswer({ answer, cites, idPrefix = "ans" }: { answer: AnswerPart[]; cites: Hit[]; idPrefix?: string }) {
  if (!answer.length || !cites.length) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[17px] leading-relaxed text-fg sm:text-[18px]">
        {answer.map((p, i) =>
          typeof p === "string" ? (
            <span key={i}>{p}</span>
          ) : cites[p] ? (
            <Link
              key={i}
              href={cites[p].href}
              title={cites[p].title}
              aria-label={`Source ${p + 1}: ${cites[p].title}`}
              aria-describedby={`${idPrefix}-src-${p}`}
              className="mx-0.5 inline-grid h-5 min-w-5 place-items-center border border-line-strong px-1 align-[2px] font-mono text-[11px] font-semibold text-signal-text no-underline hover:border-fg-3 hover:text-fg"
            >
              {p + 1}
            </Link>
          ) : null,
        )}
      </p>
      <ol className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Sources">
        {cites.map((c, i) => (
          <li key={c.id} id={`${idPrefix}-src-${i}`} className="flex min-w-0 items-baseline gap-2 text-[14px]">
            <span className="font-mono text-[11px] text-fg-3">{i + 1}</span>
            <KindIcon kind={c.kind} className="h-3.5 w-3.5 shrink-0 translate-y-[2px] text-signal-text" />
            <Link href={c.href} className="min-w-0 truncate text-fg-2 hover:text-fg hover:underline">
              {c.title}
            </Link>
            <span className="hidden shrink-0 font-mono text-[11px] text-fg-4 sm:inline">{KIND_LABEL[c.kind].tag}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
