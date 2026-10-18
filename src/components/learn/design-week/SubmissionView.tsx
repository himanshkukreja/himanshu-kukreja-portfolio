"use client";

/** /learn/design-week/<slug>/<id>: one design, rendered like a lesson, with its author, votes and a report link. */
import "@/app/learn/course-content.css";
import "@/app/learn/course-blocks.css";
import Link from "next/link";
import { useEffect, useState } from "react";
import { track } from "@/lib/track";
import { canVoteIn } from "@/lib/design-week/core";
import type { SubmissionPageData } from "@/lib/design-week/views";
import MermaidHydrator from "@/components/diagrams/MermaidHydrator";
import OnlineOnly from "@/components/offline/OnlineOnly";
import { useMe } from "./client";
import DevPersonaBar from "./DevPersonaBar";
import { ReportButton, VoteButton, type VoteCtx } from "./Vote";
import { AuthorChip, BASE, fmtIst, LABEL, Note, PhaseBadge, Place } from "./ui";

export default function SubmissionView({ data, dev }: { data: SubmissionPageData; dev: boolean }) {
  const { challenge: c, submission: s } = data;
  const { viewer, me, patch } = useMe(c.slug);
  const own = me?.submission?.id === s.id;
  const ctx: VoteCtx = { viewer, me, slug: c.slug, canVote: canVoteIn(c.phase), patch, mine: own ? s.id : null };
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    track("dow_view", { page: "submission", slug: c.slug, phase: c.phase });
  }, [c.slug, c.phase]);

  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-8 px-4 pb-28 pt-6 sm:px-6 sm:pt-10">
      {dev && <DevPersonaBar />}
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-2 font-mono text-[13px] text-fg-3">
        <Link href={BASE} className="inline-flex min-h-10 items-center hover:text-fg">
          design of the week
        </Link>
        <span aria-hidden>/</span>
        <Link href={`${BASE}/${c.slug}`} className="inline-flex min-h-10 items-center truncate hover:text-fg">
          {c.title}
        </Link>
      </nav>

      <header className="flex flex-col gap-5 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <PhaseBadge phase={c.phase} />
          <Place place={s.place} />
        </div>
        <h1 className="m-0 font-display text-[clamp(32px,5vw,56px)] font-extrabold leading-[0.98] tracking-[-0.035em] text-fg">{s.title}</h1>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <AuthorChip author={s.author} size="md" />
          <span className="font-mono text-xs text-fg-3">
            {s.submittedAt ? `submitted ${fmtIst(s.submittedAt)}` : ""}
            {s.diagrams ? ` · ${s.diagrams} diagram${s.diagrams === 1 ? "" : "s"}` : ""} · {s.words.toLocaleString("en-US")} words
          </span>
        </div>
        <OnlineOnly what="Voting" className="my-0">
          <div className="flex flex-wrap items-center gap-3">
            {s.votes !== null && (
              <span className="font-mono text-base font-semibold tabular-nums text-fg">
                {s.votes} <span className="font-normal text-fg-3">vote{s.votes === 1 ? "" : "s"}</span>
              </span>
            )}
            <VoteButton id={s.id} ctx={ctx} size="lg" />
            {ctx.canVote && me && me.eligibility.ok && <span className="font-mono text-xs text-fg-3">{me.remaining} left</span>}
            {ctx.canVote && me && !me.eligibility.ok && <span className="max-w-[420px] text-[13px] text-fg-3">{me.eligibility.message}</span>}
            <span className="ml-auto flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  });
                }}
                className="inline-flex min-h-10 items-center font-mono text-[13px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg"
              >
                {copied ? "link copied ✓" : "copy link"}
              </button>
              <ReportButton id={s.id} viewer={viewer} own={own} />
            </span>
          </div>
        </OnlineOnly>
        {c.phase === "voting" && !c.countsVisible && <p className="m-0 text-[13px] text-fg-3">Vote counts are hidden until voting closes {fmtIst(c.endsAt)}.</p>}
      </header>

      <article data-dow-body className="course-content max-w-none" dangerouslySetInnerHTML={{ __html: s.html }} />
      <MermaidHydrator rootSelector="[data-dow-body]" />

      <footer className="flex flex-col gap-3 border-t border-line pt-6">
        <span className={LABEL}>the challenge</span>
        <Link href={`${BASE}/${c.slug}`} className="text-[17px] font-semibold text-fg underline decoration-line-strong underline-offset-4 hover:decoration-signal">
          {c.title}
        </Link>
        {c.phase === "voting" && <Note>Read a few more before you vote: the gallery is shuffled for every reader.</Note>}
      </footer>
    </main>
  );
}
