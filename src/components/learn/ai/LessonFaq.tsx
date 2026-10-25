"use client";

/** End of a lesson: "Questions learners ask", written with AI from the lesson, free to read (no credits). */
import { useLessonFaq } from "./useLessonFaq";

export default function LessonFaq({ week, slug }: { week: string; slug: string }) {
  const faq = useLessonFaq(week, slug);
  if (!faq) return null;
  return (
    <section aria-labelledby="faq-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="faq-h" className="m-0 font-mono text-xs uppercase tracking-label text-fg-3">
          Questions learners ask
        </h2>
        <span className="font-mono text-[11px] text-fg-4">written with AI from this lesson</span>
      </div>
      <div className="flex flex-col border border-line">
        {faq.items.map((it, i) => (
          <details key={i} className="group border-b border-line last:border-b-0">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[15px] font-semibold text-fg hover:bg-surface-2">
              {it.q}
              <span aria-hidden className="font-mono text-fg-3 transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="flex flex-col gap-1.5 px-4 pb-4 text-[15px] leading-relaxed text-fg-2">
              <p className="m-0">{it.a}</p>
              {it.section && <span className="font-mono text-[11px] text-fg-4">from: {it.section}</span>}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
