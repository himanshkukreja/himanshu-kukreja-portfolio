"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Play } from "lucide-react";
import { useDsaProgress } from "../progress/useDsaProgress";
import { Decks, DueCards, Resolves, type ReviseProblem } from "../revise/DsaRevise";
import WeakSpots from "@/components/learn/plan/WeakSpots";
import type { DsaDeck } from "@/lib/dsa/revise";

/**
 * /dsa/review (the Review tab): everything that brings an idea back, top to bottom: cards due now (with the learner's own
 * mistakes), mistakes to redo, 60-second shorts for the lessons they have done, cheat sheets, interview-night plans
 * (planned), drills and the reference shelf. Each part loads its own data; the page itself is static ISR.
 */

export type ReviewShort = { id: string; title: string; label: string; poster: string; seconds: number; concept: string };
export type ReviewSheet = { id: string; title: string; code: string; moduleTitle: string; invariant: string; concept: string };

const H2 = "m-0 font-display text-[24px] font-bold tracking-[-0.02em] text-fg";
const LINK = "font-mono text-[12.5px] text-signal-text underline decoration-line-strong underline-offset-4 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text";

function Head({ id, title, note, link }: { id: string; title: string; note?: string; link?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id={id} className={H2}>
        {title}
      </h2>
      <span className="flex items-baseline gap-4">
        {note ? <span className="font-mono text-[12px] text-fg-3">{note}</span> : null}
        {link ? (
          <Link href={link.href} className={LINK}>
            {link.label} →
          </Link>
        ) : null}
      </span>
    </div>
  );
}

function Shorts({ shorts }: { shorts: ReviewShort[] }) {
  const p = useDsaProgress();
  // lessons the learner has finished first (their shorts are the ones worth replaying), then the rest in course order
  const rows = useMemo(() => [...shorts].sort((a, b) => Number(p.concepts.has(b.concept)) - Number(p.concepts.has(a.concept))).slice(0, 8), [shorts, p.concepts]);
  const anyDone = shorts.some((s) => p.concepts.has(s.concept));
  return (
    <section id="shorts" aria-labelledby="shorts-h" className="flex scroll-mt-24 flex-col gap-3">
      <Head id="shorts-h" title="Shorts" note={shorts.length ? (anyDone ? "from lessons you have done first" : "start with these") : undefined} link={{ href: "/dsa/shorts", label: "All shorts" }} />
      {rows.length ? (
        <ul className="m-0 flex list-none gap-3 overflow-x-auto p-0 pb-2 [scrollbar-width:thin]">
          {rows.map((s) => (
            <li key={s.id} className="w-[150px] shrink-0">
              <Link href={`/dsa/shorts?v=${encodeURIComponent(s.id)}`} className="group flex flex-col gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text">
                <span className="relative block aspect-[9/16] overflow-hidden border border-line-strong bg-[var(--c-plate)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-[color-mix(in_srgb,var(--c-plate)_80%,transparent)] px-2 py-1.5 font-mono text-[11px] text-[color:var(--c-plate-fg)]">
                    <Play className="h-3 w-3 fill-current" aria-hidden /> {Math.max(1, Math.round(s.seconds))} s
                  </span>
                </span>
                <span className="text-[13.5px] font-semibold leading-snug text-fg group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">{s.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 border border-dashed border-line-strong px-4 py-4 text-[14px] text-fg-2">The first shorts are being recorded. Each lesson gets a few 60-second videos, one idea each; they show up here.</p>
      )}
    </section>
  );
}

function Sheets({ sheets }: { sheets: ReviewSheet[] }) {
  const p = useDsaProgress();
  const rows = useMemo(() => [...sheets].sort((a, b) => Number(p.concepts.has(b.concept)) - Number(p.concepts.has(a.concept))).slice(0, 12), [sheets, p.concepts]);
  return (
    <section id="sheets" aria-labelledby="sheets-h" className="flex scroll-mt-24 flex-col gap-3">
      <Head id="sheets-h" title="Cheat sheets" note={`${sheets.length} sheets · done lessons first`} link={{ href: "/dsa/cheatsheets", label: "All cheat sheets" }} />
      {rows.length ? (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => {
            const done = p.concepts.has(s.concept);
            return (
              <li key={s.id} className="min-w-0">
                <Link href={`/dsa/cheatsheets/${s.id}`} className="group flex h-full flex-col gap-2 border border-line-strong bg-surface p-4 hover:border-signal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text">
                  <span className="flex items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-label text-fg-3">
                    <span>
                      {s.code} {s.moduleTitle}
                    </span>
                    {done ? <span className="text-ok-text">✓ done</span> : null}
                  </span>
                  <span className="font-display text-[18px] font-bold leading-tight tracking-[-0.02em] text-fg group-hover:text-signal-text">{s.title}</span>
                  <span className="border-l-2 border-signal pl-3 text-[13px] leading-snug text-fg-2">{s.invariant}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 border border-dashed border-line-strong px-4 py-4 text-[14px] text-fg-2">Cheat sheets appear as lessons are written.</p>
      )}
    </section>
  );
}

function Plans() {
  return (
    <section id="plans" aria-labelledby="plans-h" className="flex scroll-mt-24 flex-col gap-3">
      <Head id="plans-h" title="Interview-night plans" note="planned" />
      <div className="flex flex-col gap-3 border border-dashed border-line-strong bg-surface p-4 sm:p-5">
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {["7 days", "14 days", "30 days"].map((d) => (
            <li key={d} className="border border-line-strong px-3 py-1.5 font-mono text-[13px] text-fg-2">
              {d} <span className="text-fg-3">· soon</span>
            </li>
          ))}
        </ul>
        <p className="m-0 max-w-[62ch] text-[14.5px] leading-relaxed text-fg-2">A short, dated revision line built from your weak patterns, the classics and your due cards, one stop a day. It is planned. Your date-based study plan already covers the DSA lessons.</p>
        <Link href="/dsa/progress#plan" className={`${LINK} self-start`}>
          Open my study plan →
        </Link>
      </div>
    </section>
  );
}

function Drills() {
  return (
    <section id="drills" aria-labelledby="drills-h" className="flex scroll-mt-24 flex-col gap-3">
      <Head id="drills-h" title="Drills" />
      <div className="flex flex-col gap-4 border border-line bg-surface p-4 sm:p-5">
        <WeakSpots />
        <p className="m-0 max-w-[62ch] text-[14.5px] leading-relaxed text-fg-2">
          Miss a topic twice in two weeks and a three-question drill on it waits here. Signed in, with the tutor on, it opens in place.
        </p>
        <p className="m-0 font-mono text-[12.5px] text-fg-3">Pattern radar, a sprint across every pattern, is planned.</p>
      </div>
    </section>
  );
}

function Reference() {
  const items: { title: string; line: string; href?: string }[] = [
    { title: "Complexity budget", line: "Will this idea fit in the time limit? Pick n and see the operations.", href: "/dsa/complexity" },
    { title: "Patterns A to Z", line: "Every pattern, the words that point to it and where it is taught. Coming with the pattern index." },
    { title: "Language toolkit", line: "The standard-library moves you reach for, in each of the four languages. Planned." },
    { title: "The 10^8 table", line: "How big n can be for each complexity in a one-second limit. Planned." },
  ];
  return (
    <section id="reference" aria-labelledby="ref-h" className="flex scroll-mt-24 flex-col gap-3">
      <Head id="ref-h" title="Reference" />
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it.title} className="min-w-0">
            {it.href ? (
              <Link href={it.href} className="flex h-full flex-col gap-1.5 border border-line-strong bg-surface p-4 hover:border-signal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text">
                <span className="font-display text-[18px] font-bold tracking-[-0.02em] text-fg">{it.title}</span>
                <span className="text-[13.5px] leading-snug text-fg-2">{it.line}</span>
              </Link>
            ) : (
              <div className="flex h-full flex-col gap-1.5 border border-dashed border-line-strong p-4">
                <span className="font-display text-[18px] font-bold tracking-[-0.02em] text-fg-2">
                  {it.title} <span className="font-mono text-[11px] font-normal text-fg-3">· soon</span>
                </span>
                <span className="text-[13.5px] leading-snug text-fg-3">{it.line}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const JUMPS = [
  ["due", "Due now"],
  ["mistakes", "Mistakes"],
  ["shorts", "Shorts"],
  ["sheets", "Cheat sheets"],
  ["plans", "Plans"],
  ["drills", "Drills"],
  ["reference", "Reference"],
];

export default function ReviewPage({ decks, problems, shorts, sheets }: { decks: DsaDeck[]; problems: ReviseProblem[]; shorts: ReviewShort[]; sheets: ReviewSheet[] }) {
  const byId = useMemo(() => new Map(problems.map((p) => [p.id, p])), [problems]);
  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1100px] flex-col gap-10 px-4 pb-24 pt-6 sm:px-6">
        <header className="flex flex-col gap-2">
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">Review</span>
          <h1 className="m-0 font-display text-[32px] font-extrabold leading-none tracking-[-0.03em] text-fg sm:text-[40px]">
            Bring it back<span className="text-signal-text">.</span>
          </h1>
          <p className="m-0 max-w-[640px] text-[15.5px] leading-relaxed text-fg-2">Cards that are due, problems that tripped you up, and 60-second refreshers for the lessons you have done.</p>
          <nav aria-label="On this page" className="-mx-4 overflow-x-auto px-4 pt-1 sm:mx-0 sm:px-0">
            <ul className="m-0 flex w-max list-none gap-2 p-0">
              {JUMPS.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="inline-flex min-h-10 items-center border border-line-strong bg-surface px-3 font-mono text-[12.5px] text-fg-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        <div id="due" className="scroll-mt-24">
          <DueCards decks={decks} />
        </div>
        <div id="mistakes" className="scroll-mt-24">
          <Resolves problems={byId} />
        </div>
        <Shorts shorts={shorts} />
        <Sheets sheets={sheets} />
        <Plans />
        <Drills />
        <Reference />
        <div id="decks" className="scroll-mt-24">
          <Decks decks={decks} />
        </div>
      </main>
    </div>
  );
}
