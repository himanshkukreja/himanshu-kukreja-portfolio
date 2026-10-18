"use client";

/** /learn/design-week: the current challenge, last week's winners, what's next, the archive, how it works. */
import Link from "next/link";
import { useEffect } from "react";
import { track } from "@/lib/track";
import type { ChallengeCard, DesignWeekHome as Home, WinnersBlock } from "@/lib/design-week/views";
import ChallengeBlock from "./ChallengeBlock";
import DevPersonaBar from "./DevPersonaBar";
import { BASE, fmtDay, fmtIst, Kicker, LABEL, PageTitle, PhaseBadge, SectionTitle, SubmissionTile } from "./ui";

export function Hero({ title = "Design of the week", children }: { title?: string; children?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <Kicker>❯ design of the week · one open problem a week</Kicker>
      <PageTitle>{title}</PageTitle>
      {children ?? (
        <p className="m-0 max-w-[720px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
          Every Monday a new system design problem. Write your design in markdown with Mermaid diagrams, then vote on everyone else&apos;s. The best ones are featured here and on the author&apos;s profile.
        </p>
      )}
    </section>
  );
}

export function ComingSoon() {
  return (
    <section className="flex flex-col gap-3 border border-dashed border-line-strong p-6 sm:p-8">
      <span className={LABEL}>coming soon</span>
      <h2 className="m-0 font-display text-[30px] font-bold leading-tight tracking-[-0.025em] text-fg">The first challenge is on its way.</h2>
      <p className="m-0 max-w-[620px] text-[15px] leading-relaxed text-fg-2">
        One open design problem a week: a URL shortener for 10 billion links, a cricket-final notification fan-out, a rate limiter for UPI… Until it opens, the capstones and side quests are the best practice.
      </p>
      <Link href="/learn/system-design-mastery" className="inline-flex min-h-10 items-center self-start font-mono text-[13px] text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
        back to the course →
      </Link>
    </section>
  );
}

export function Winners({ block, title = "Last week's winners" }: { block: WinnersBlock; title?: string }) {
  if (!block.winners.length) return null;
  return (
    <section aria-labelledby="dow-winners-h" className="flex flex-col gap-4">
      <SectionTitle
        id="dow-winners-h"
        aside={
          <Link href={`${BASE}/${block.challenge.slug}`} className="font-mono text-[13px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
            {block.challenge.title} →
          </Link>
        }
      >
        {title}
      </SectionTitle>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-3 p-0">
        {block.winners.map((s) => (
          <SubmissionTile key={s.id} s={s} />
        ))}
      </ul>
    </section>
  );
}

function ChallengeRow({ c }: { c: ChallengeCard }) {
  return (
    <li>
      <Link href={`${BASE}/${c.slug}`} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-1 py-3 hover:bg-surface-2">
        <span className="w-[110px] shrink-0 font-mono text-xs text-fg-3">{fmtDay(c.startsAt)}</span>
        <span className="min-w-0 flex-1 text-[15px] font-semibold text-fg">{c.title}</span>
        <span className="font-mono text-xs text-fg-3">
          {c.submitted} design{c.submitted === 1 ? "" : "s"}
        </span>
      </Link>
    </li>
  );
}

const STEPS = [
  { when: "Monday 09:00 IST", what: "A new problem opens. Read the brief, the constraints and what a strong answer shows." },
  { when: "Until Saturday 09:00", what: "Write your design: markdown + Mermaid, autosaved. Designs stay private while you write." },
  { when: "Saturday → Monday", what: "The gallery opens. Vote for up to three designs (not your own). Counts stay hidden." },
  { when: "Monday", what: "Winners are featured here, on the course hub and on their profile, with a badge and XP." },
];

export default function DesignWeekHome({ data, dev }: { data: Home; dev: boolean }) {
  const slug = data.available ? data.current?.slug : undefined;
  const phase = data.available ? data.current?.phase : undefined;
  useEffect(() => {
    track("dow_view", { page: "home", slug: slug || "", phase: phase || "none" });
  }, [slug, phase]);

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 pb-28 pt-6 sm:gap-12 sm:px-6 sm:pt-14">
      {dev && <DevPersonaBar />}
      <Hero />
      {!data.available ? (
        <ComingSoon />
      ) : (
        <>
          {data.current ? <ChallengeBlock c={data.current} gallery={data.gallery} /> : <ComingSoon />}
          {data.lastClosed && <Winners block={data.lastClosed} />}
          {data.upcoming && (
            <section className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-line-strong px-5 py-4">
              <span className="flex flex-col gap-1">
                <span className={LABEL}>next up · opens {fmtIst(data.upcoming.startsAt)}</span>
                <span className="text-base font-semibold text-fg">{data.upcoming.title}</span>
              </span>
              <PhaseBadge phase={data.upcoming.phase} />
            </section>
          )}
          <section aria-labelledby="dow-how-h" className="flex flex-col gap-4">
            <SectionTitle id="dow-how-h">How it works</SectionTitle>
            <ol className="m-0 grid list-none gap-px border border-line bg-line p-0 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.when} className="flex flex-col gap-2 bg-bg p-4">
                  <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
                    {String(i + 1).padStart(2, "0")} · {s.when}
                  </span>
                  <span className="text-[14px] leading-snug text-fg-2">{s.what}</span>
                </li>
              ))}
            </ol>
          </section>
          {data.archive.length > 0 && (
            <section aria-labelledby="dow-archive-h" className="flex flex-col gap-3">
              <SectionTitle id="dow-archive-h">Past challenges</SectionTitle>
              <ul className="m-0 list-none border-t border-line p-0">
                {data.archive.map((c) => (
                  <ChallengeRow key={c.id} c={c} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
