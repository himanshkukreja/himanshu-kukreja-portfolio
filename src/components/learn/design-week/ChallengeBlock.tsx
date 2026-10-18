"use client";

/**
 * One challenge: header with phase + countdown, the call to action for this viewer, the brief,
 * constraints and rubric, the lessons it builds on, and (from voting on) the gallery.
 * Shared by /learn/design-week (current challenge) and /learn/design-week/<slug> (archive).
 */
import "@/app/learn/course-content.css";
import "@/app/learn/course-blocks.css";
import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { useAuthModal } from "@/contexts/AuthModalContext";
import OnlineOnly from "@/components/offline/OnlineOnly";
import MermaidHydrator from "@/components/diagrams/MermaidHydrator";
import { canSubmitIn, canVoteIn, galleryVisibleIn, deadlineFor } from "@/lib/design-week/core";
import type { ChallengeView, SubmissionCard } from "@/lib/design-week/views";
import { seededShuffle, useMe, viewerSeed } from "./client";
import { VoteButton, type VoteCtx } from "./Vote";
import { BASE, BTN, BTN_GHOST, Countdown, fmtIst, LABEL, Note, PhaseBadge, SectionTitle, SubmissionTile } from "./ui";

const noop = () => () => {};

export default function ChallengeBlock({ c, gallery, headingLevel = 2 }: { c: ChallengeView; gallery: SubmissionCard[]; headingLevel?: 1 | 2 }) {
  const { viewer, me, loading, patch } = useMe(c.slug);
  const deadline = deadlineFor(c.phase, c);
  const H = headingLevel === 1 ? "h1" : "h2";
  const showGallery = galleryVisibleIn(c.phase);
  const seed = useSyncExternalStore(noop, viewerSeed, () => 0);
  const ordered = useMemo(() => (seed && !c.countsVisible ? seededShuffle(gallery, seed) : gallery), [gallery, seed, c.countsVisible]);
  const ctx: VoteCtx = { viewer, me, slug: c.slug, canVote: canVoteIn(c.phase), patch, mine: me?.submission?.status === "submitted" ? me.submission.id : null };

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby={`dow-${c.slug}-h`} className="flex flex-col gap-6 border border-line-strong bg-surface p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <PhaseBadge phase={c.phase} />
          <span className="font-mono text-xs text-fg-3">
            {fmtIst(c.startsAt)} → {fmtIst(c.endsAt)}
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <H id={`dow-${c.slug}-h`} className="m-0 font-display text-[clamp(32px,5.2vw,60px)] font-extrabold leading-[0.95] tracking-[-0.035em] text-fg">
            {c.title}
          </H>
          {c.summary && <p className="m-0 max-w-[760px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">{c.summary}</p>}
        </div>
        <div className="grid gap-px border border-line bg-line sm:grid-cols-3">
          <div className="flex flex-col gap-1 bg-bg px-4 py-3">
            {deadline ? <Countdown at={deadline.at} label={deadline.label} /> : <span className="font-mono text-sm text-fg-2">{c.phase === "judging" ? "voting closed · winners soon" : c.phase === "closed" ? "closed" : ""}</span>}
          </div>
          <div className="flex flex-col gap-1 bg-bg px-4 py-3">
            <span className={LABEL}>designs submitted</span>
            <span className="font-mono text-sm font-semibold text-fg">{c.submitted}</span>
          </div>
          <div className="flex flex-col gap-1 bg-bg px-4 py-3">
            <span className={LABEL}>votes per learner</span>
            <span className="font-mono text-sm font-semibold text-fg">{c.maxVotesPerUser}</span>
          </div>
        </div>
        <OnlineOnly what="Taking part" className="my-0">
          <Cta c={c} ctx={ctx} loading={loading} />
        </OnlineOnly>
      </section>

      {showGallery && (
        <section aria-labelledby={`dow-${c.slug}-gallery`} className="flex flex-col gap-4">
          <SectionTitle
            id={`dow-${c.slug}-gallery`}
            aside={
              <span className="text-[14px] text-fg-3">
                {c.phase === "voting"
                  ? c.countsVisible
                    ? "Live counts on."
                    : "Counts stay hidden until voting closes, and the order is shuffled for you."
                  : `${gallery.length} design${gallery.length === 1 ? "" : "s"}`}
              </span>
            }
          >
            {c.phase === "voting" ? "Vote for the best designs" : "All designs"}
          </SectionTitle>
          {ordered.length ? (
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-3 p-0">
              {ordered.map((s) => (
                <SubmissionTile key={s.id} s={s} highlight={me?.votes.includes(s.id)} action={<VoteButton id={s.id} ctx={ctx} />} />
              ))}
            </ul>
          ) : (
            <Note>No designs were submitted for this one.</Note>
          )}
        </section>
      )}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="The brief" className="min-w-0">
          <span className={LABEL}>the brief</span>
          <div data-dow-brief className="course-content mt-3 max-w-none" dangerouslySetInnerHTML={{ __html: c.briefHtml }} />
          <MermaidHydrator rootSelector="[data-dow-brief]" />
        </section>
        <aside className="flex min-w-0 flex-col gap-4 self-start lg:sticky lg:top-[calc(var(--hk-header-h,57px)+24px)]">
          {c.constraints.length > 0 && (
            <div className="border border-line bg-surface p-4">
              <span className={LABEL}>constraints</span>
              <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                {c.constraints.map((x) => (
                  <li key={x} className="flex gap-2.5 text-[14px] leading-snug text-fg-2">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 bg-signal" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {c.rubric.length > 0 && (
            <div className="border border-line bg-surface p-4">
              <span className={LABEL}>what a strong design shows</span>
              <ol className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                {c.rubric.map((x, i) => (
                  <li key={x} className="flex gap-2.5 text-[14px] leading-snug text-fg-2">
                    <span className="w-5 shrink-0 font-mono text-[12px] text-signal-text">{String(i + 1).padStart(2, "0")}</span>
                    {x}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {c.related.length > 0 && (
            <div className="border border-line bg-surface p-4">
              <span className={LABEL}>the lessons behind it</span>
              <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0">
                {c.related.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="flex min-h-10 flex-col justify-center py-1 hover:[&>span:last-child]:text-signal-text">
                      <span className="font-mono text-[11px] text-fg-3">{l.tag}</span>
                      <span className="text-[14px] font-medium leading-snug text-fg">{l.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

    </div>
  );
}

function Cta({ c, ctx, loading }: { c: ChallengeView; ctx: VoteCtx; loading: boolean }) {
  const { openAuthModal } = useAuthModal();
  const mine = ctx.me?.submission || null;
  const edit = `${BASE}/${c.slug}/edit`;
  if (c.phase === "upcoming") return <Note>Submissions open {fmtIst(c.startsAt)}. Read the brief now and start sketching.</Note>;
  if (canSubmitIn(c.phase)) {
    if (!ctx.viewer.ready) return <div className="h-12" />;
    if (!ctx.viewer.signedIn)
      return (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={openAuthModal} className={`${BTN} min-h-12`}>
            sign in to submit your design
          </button>
          <span className="text-[14px] text-fg-3">Free. Designs stay private until voting opens.</span>
        </div>
      );
    if (loading) return <div className="h-12" />;
    if (mine?.status === "removed") return <Note tone="bad">Your design was removed by a moderator{mine.moderationNote ? `: ${mine.moderationNote}` : "."}</Note>;
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link href={edit} className={`${BTN} min-h-12`}>
          {!mine ? "submit your design →" : mine.status === "submitted" ? "edit your submission →" : "continue your draft →"}
        </Link>
        <span className="text-[14px] text-fg-3">
          {!mine
            ? "Markdown + Mermaid diagrams. Autosaves as you write."
            : mine.status === "submitted"
              ? `Submitted. You can edit it until ${fmtIst(c.submissionsCloseAt)}.`
              : mine.status === "hidden"
                ? "A moderator is reviewing your design."
                : "Draft saved. Submit it before submissions close."}
        </span>
      </div>
    );
  }
  if (canVoteIn(c.phase)) {
    const me = ctx.me;
    return (
      <div className="flex flex-wrap items-center gap-3">
        {!ctx.viewer.signedIn ? (
          <button type="button" onClick={openAuthModal} className={`${BTN} min-h-12`}>
            sign in to vote
          </button>
        ) : (
          <a href={`#dow-${c.slug}-gallery`} className={`${BTN_GHOST} min-h-12`}>
            {me ? `${me.remaining} of ${c.maxVotesPerUser} votes left ↓` : "open the gallery ↓"}
          </a>
        )}
        <span className="text-[14px] text-fg-3">
          {me && !me.eligibility.ok ? me.eligibility.message : `Read the designs, vote for up to ${c.maxVotesPerUser}. You can't vote for your own, and you can move a vote until voting closes.`}
        </span>
      </div>
    );
  }
  if (c.phase === "judging") return <Note>Voting has closed. The winners are announced on Monday.</Note>;
  return null;
}
