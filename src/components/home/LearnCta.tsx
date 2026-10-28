import Link from "next/link";
import { container } from "./ui";

export default function LearnCta() {
  return (
    <section aria-labelledby="learn-h" className={`${container} pb-16 pt-6 sm:pb-20`}>
      <Link
        href="/learn"
        className="flex flex-wrap items-center justify-between gap-6 border border-signal bg-surface p-5 text-fg no-underline hover:bg-surface-2 sm:p-8"
      >
        <span className="flex max-w-[720px] flex-col gap-2.5">
          <span className="font-mono text-[13px] text-signal-text">❯ ./learn --course system-design-mastery</span>
          <span id="learn-h" className="font-display text-[clamp(26px,4vw,48px)] font-extrabold leading-none tracking-[-0.035em]">
            A free 11-week system design campaign: 106 lessons, 10 interview bosses, 30 side quests.
          </span>
          <span className="text-[15px] leading-relaxed text-fg-2">Plus a practice toolkit: revision decks, cheat sheets, code labs and mock interviews.</span>
        </span>
        <span className="inline-flex min-h-[52px] items-center bg-fg px-[22px] text-base font-semibold text-bg">
          Open the skill tree →
        </span>
      </Link>
    </section>
  );
}
