"use client";

/** The lesson's one idea in a box: a concept's pattern card ("In one picture"), else its invariant or first key point. Never new text. */
import styles from "@/components/learn/lesson/reader.module.css";

export type KeyIdeaData = { title?: string; html?: string; more?: string; text?: string; points?: string[] } | null;

export default function KeyIdea({ idea, className = "" }: { idea: KeyIdeaData; className?: string }) {
  if (!idea || (!idea.html && !idea.text && !idea.points?.length)) return null;
  return (
    <section aria-labelledby="dsa-key-idea" className={`rounded-xl border border-line bg-surface p-3.5 sm:border-0 sm:bg-bg sm:px-[18px] sm:py-4 ${className}`}>
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-signal-text sm:text-[12px]">Key idea</span>
      {idea.title ? (
        <h2 id="dsa-key-idea" className="m-0 mt-1.5 text-[17px] font-semibold leading-snug text-fg">
          {idea.title}
        </h2>
      ) : (
        <h2 id="dsa-key-idea" className="sr-only">
          Key idea
        </h2>
      )}
      {idea.html ? (
        <>
          <div className={`course-content ${styles.content} dsa-picture`} dangerouslySetInnerHTML={{ __html: idea.html }} />
          {idea.more ? (
            <details className="group mt-1">
              <summary className="inline-flex min-h-10 cursor-pointer list-none items-center font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">the whole pattern card</span>
                <span className="hidden group-open:inline">fold it</span>
              </summary>
              <div className={`course-content ${styles.content} dsa-picture`} dangerouslySetInnerHTML={{ __html: idea.more }} />
            </details>
          ) : null}
        </>
      ) : idea.text ? (
        <p className="m-0 mt-2 text-[15px] leading-relaxed text-fg-2">{idea.text}</p>
      ) : (
        <ul className="m-0 mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-fg-2">
          {idea.points!.slice(0, 4).map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
