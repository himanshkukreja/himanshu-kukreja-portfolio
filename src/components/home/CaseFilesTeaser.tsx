import Link from "next/link";
import { Prompt, container, ghostBtn, h2Class } from "./ui";

export type CaseTeaser = {
  id: string;
  slug: string;
  meta: string;
  title: string;
  excerpt?: string;
};

export default function CaseFilesTeaser({ cases, total }: { cases: CaseTeaser[]; total: number }) {
  return (
    <section aria-labelledby="cases-h" className={`${container} flex flex-col gap-7 pb-12 pt-14 sm:pt-[72px]`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Prompt>ls -t case-files/ | head -3</Prompt>
          <h2 id="cases-h" className={h2Class}>
            Incidents, rushes and rescues
          </h2>
        </div>
        <Link href="/stories" className={ghostBtn}>
          cd case-files&nbsp;&nbsp;# {total} →
        </Link>
      </div>
      {cases.length > 0 ? (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-3 p-0">
          {cases.map((c) => (
            <li key={c.slug} className="flex">
              <Link
                href={`/stories/${c.slug}`}
                className="flex w-full flex-col gap-2.5 border border-line bg-surface p-4 text-fg no-underline hover:border-line-strong sm:p-[22px]"
              >
                <span className="flex justify-between gap-3 font-mono text-xs">
                  <span className="text-signal-text">{c.id}.md</span>
                  <span className="text-fg-3">{c.meta}</span>
                </span>
                <span className="font-display text-xl font-bold leading-[1.1] tracking-[-0.02em] sm:text-2xl">{c.title}</span>
                {c.excerpt && <span className="line-clamp-3 text-[15px] leading-normal text-fg-2">{c.excerpt}</span>}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 font-mono text-sm text-fg-3">case-files/ is empty. Check back soon.</p>
      )}
    </section>
  );
}
