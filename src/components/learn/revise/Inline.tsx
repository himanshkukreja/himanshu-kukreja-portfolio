import { inline } from "@/lib/learn/revision/parse";

/** A card's text with its only marks: **bold** and `code` (numbers and identifiers in mono). */
export default function Inline({ text, codeClass = "" }: { text: string; codeClass?: string }) {
  return (
    <>
      {inline(text).map((p, i) =>
        p.c ? (
          <code key={i} className={`font-mono text-[0.92em] ${codeClass}`}>
            {p.t}
          </code>
        ) : p.b ? (
          <strong key={i} className="font-semibold text-fg">
            {p.t}
          </strong>
        ) : (
          <span key={i}>{p.t}</span>
        )
      )}
    </>
  );
}
