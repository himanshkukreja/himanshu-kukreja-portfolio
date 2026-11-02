import { container } from "./ui";
import { COURSE_ORIGIN } from "@/lib/site/hosts";

/** Under the intro: the course has its own home now (systemdesignmastery.dev). */
export default function CreatorCard() {
  return (
    <section aria-label="System Design Mastery" className={`${container} pb-2 pt-2`}>
      <a
        href={COURSE_ORIGIN}
        className="group flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border border-line-strong bg-surface px-5 py-4 text-fg no-underline hover:border-signal hover:bg-surface-2"
      >
        <span className="flex flex-col gap-1">
          <span className="font-mono text-[12px] text-fg-3">systemdesignmastery.dev</span>
          <span className="font-display text-[20px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[22px]">Creator of System Design Mastery →</span>
        </span>
        <span className="text-[14px] text-fg-2">A free system design course: lessons, interview bosses, lectures, shorts and case files.</span>
      </a>
    </section>
  );
}
