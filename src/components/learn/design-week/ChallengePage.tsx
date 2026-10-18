"use client";

/** /learn/design-week/<slug>: one challenge (current or archived), its gallery and winners. */
import Link from "next/link";
import { useEffect } from "react";
import { track } from "@/lib/track";
import type { ChallengePageData } from "@/lib/design-week/views";
import ChallengeBlock from "./ChallengeBlock";
import DesignWeekBanner from "./DesignWeekBanner";
import DevPersonaBar from "./DevPersonaBar";
import { Winners } from "./DesignWeekHome";
import { BASE } from "./ui";

export default function ChallengePage({ data, dev }: { data: ChallengePageData; dev: boolean }) {
  const c = data.challenge;
  useEffect(() => {
    track("dow_view", { page: "challenge", slug: c.slug, phase: c.phase });
  }, [c.slug, c.phase]);
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-8 px-4 pb-28 pt-6 sm:gap-10 sm:px-6 sm:pt-10">
      {dev && <DevPersonaBar />}
      <Link href={BASE} className="inline-flex min-h-10 items-center gap-1.5 self-start font-mono text-[13px] text-fg-3 hover:text-fg">
        <span aria-hidden>←</span> design of the week
      </Link>
      {data.current && <DesignWeekBanner current={data.current} />}
      {c.phase === "closed" && data.winners.length > 0 && <Winners block={{ challenge: c, winners: data.winners }} title="The winners" />}
      <ChallengeBlock c={c} gallery={data.gallery} headingLevel={1} />
    </main>
  );
}
