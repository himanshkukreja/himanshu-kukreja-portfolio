import Link from "next/link";
import CoverImage from "@/components/CoverImage";
import { Prompt, container, ghostBtn, h2Class } from "./ui";

export type CaseTeaser = {
  id: string;
  slug: string;
  meta: string;
  title: string;
  excerpt?: string;
  cover?: string;
};

const BLUEPRINT_BG =
  "bg-raised bg-[linear-gradient(var(--c-line)_1px,transparent_1px),linear-gradient(90deg,var(--c-line)_1px,transparent_1px)] bg-[size:24px_24px]";

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
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {cases.map((c, i) => (
            <li key={c.slug} className={`flex min-w-0 ${i === 2 ? "sm:hidden lg:flex" : ""}`}>
              <Link
                href={`/stories/${c.slug}`}
                className="group grid w-full min-w-0 grid-cols-[112px_minmax(0,1fr)] border border-line bg-surface text-fg no-underline transition-colors hover:border-fg-4 hover:text-fg sm:flex sm:flex-col"
              >
                {/* Phone: thumbnail on the left. Tablet and up: the full 3:2 plate on top. */}
                <span className={`relative block overflow-hidden border-r border-line sm:aspect-[3/2] sm:border-b sm:border-r-0 ${BLUEPRINT_BG}`}>
                  {c.cover && (
                    <span className="absolute inset-0 transition-transform duration-500 ease-out [@media(hover:hover)_and_(prefers-reduced-motion:no-preference)]:group-hover:scale-[1.035]">
                      <CoverImage src={c.cover} alt="" fill sizes="(min-width: 1024px) 420px, (min-width: 640px) 50vw, 112px" className="h-full w-full" />
                    </span>
                  )}
                </span>
                <span className="flex min-w-0 flex-col gap-1.5 p-3 sm:gap-2.5 sm:p-[22px]">
                  <span className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 font-mono text-[11px] sm:text-xs">
                    <span className="text-signal-text">{c.id}.md</span>
                    <span className="text-fg-3">{c.meta}</span>
                  </span>
                  <span className="font-display text-[17px] font-bold leading-[1.12] tracking-[-0.02em] sm:text-2xl sm:leading-[1.1]">{c.title}</span>
                  {c.excerpt && <span className="hidden text-[15px] leading-normal text-fg-2 sm:line-clamp-3">{c.excerpt}</span>}
                </span>
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
