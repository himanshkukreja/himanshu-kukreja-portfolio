"use client";

import Link from "next/link";
import type { CourseMap } from "@/lib/learn/types";
import { addDays, localDate, type ReviewCard } from "@/lib/learn/review";
import type { trialScores } from "./derive";
import { Label, SectionHead } from "./ui";
import ShareButton from "@/components/share/ShareButton";

type Props = {
  map: CourseMap;
  scores: ReturnType<typeof trialScores>;
  cards: ReviewCard[];
  cardsReady: boolean;
  notebook: { highlights: number; notes: number; bookmarks: number } | null;
  signedIn: boolean;
  onSignIn: () => void;
  badges: { id: string; name: string; earned: boolean; how: string }[];
};

export default function Mastery(p: Props) {
  const today = localDate();
  const week = addDays(today, 7);
  const due = p.cards.filter((c) => c.dueAt <= today).length;
  const soon = p.cards.filter((c) => c.dueAt > today && c.dueAt <= week).length;
  const boxes = [1, 2, 3, 4, 5].map((b) => p.cards.filter((c) => c.box === b).length);
  const maxBox = Math.max(1, ...boxes);
  const trialWeeks = p.map.weeks.filter((w) => w.trial);
  const maxParts = Math.max(1, ...trialWeeks.map((w) => w.trial!.parts.length));
  const all = Object.values(p.scores).flat();
  const scored = all.filter((x) => x.pct !== null);
  const avg = scored.length ? Math.round(scored.reduce((a, x) => a + (x.pct || 0), 0) / scored.length) : null;
  const passed = all.filter((x) => x.passed).length;
  const earned = p.badges.filter((b) => b.earned).length;

  return (
    <section aria-labelledby="mastery-h" id="mastery" className="flex min-w-0 scroll-mt-28 flex-col gap-4">
      <SectionHead id="mastery-h" n="04" kicker="mastery" title="What stuck" />

      {/* trials */}
      <div className="flex min-w-0 flex-col gap-3 border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Label>trial scores · best per part</Label>
          <span className="font-mono text-[11px] text-fg-3">
            {passed}/{all.length} passed{avg !== null ? ` · avg ${avg}%` : ""}
          </span>
        </div>
        {trialWeeks.length ? (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full border-collapse font-mono text-[12px]">
              <caption className="sr-only">Best trial score per week and part. Pass mark 80%.</caption>
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-label text-fg-4">
                  <th scope="col" className="py-1.5 pr-2 font-normal">
                    week
                  </th>
                  {Array.from({ length: maxParts }, (_, i) => (
                    <th key={i} scope="col" className="px-0.5 py-1.5 text-center font-normal">
                      p{i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trialWeeks.map((w) => (
                  <tr key={w.key} className="border-t border-line">
                    <th scope="row" className="whitespace-nowrap py-1.5 pr-2 text-left font-normal text-fg-2">
                      <Link href={w.trial!.href} className="hover:text-fg hover:underline">
                        W{w.code}
                      </Link>
                    </th>
                    {Array.from({ length: maxParts }, (_, i) => {
                      const s = p.scores[w.key]?.[i];
                      if (!s) return <td key={i} />;
                      return (
                        <td key={i} className="px-0.5 py-1">
                          <Link
                            href={w.trial!.parts[i].href}
                            title={`W${w.code} part ${i + 1} · ${w.trial!.parts[i].title}${s.pct !== null ? ` · best ${s.pct}%` : " · not taken"}`}
                            className={`grid h-9 min-w-[40px] place-items-center ${s.passed ? "bg-signal font-semibold text-on-signal" : s.pct !== null ? "border border-fg-3 text-fg" : "border border-dashed border-line-strong text-fg-4"}`}
                          >
                            {s.pct !== null ? `${s.pct}` : "·"}
                          </Link>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <span className="text-sm text-fg-3">No trials in this course yet.</span>
        )}
        <span className="text-[12px] text-fg-3">Pass mark 80%. Filled = passed. Scores come from {p.signedIn ? "your saved answers and" : ""} this browser&apos;s trial runs.</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* review queue */}
        <Link href="/learn/review" className="group flex min-w-0 flex-col gap-3 border border-line bg-surface p-4 hover:border-line-strong sm:p-5">
          <div className="flex items-baseline justify-between gap-2">
            <Label>review queue</Label>
            <span className="font-mono text-[12px] text-signal-text group-hover:underline">review →</span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="flex flex-col">
              <span className={`font-display text-[34px] font-extrabold leading-none tracking-[-0.04em] ${due ? "text-signal-text" : "text-fg"}`}>{p.cardsReady ? due : "·"}</span>
              <span className="text-[12px] text-fg-3">due now</span>
            </span>
            <span className="flex flex-col">
              <span className="font-display text-[34px] font-extrabold leading-none tracking-[-0.04em] text-fg">{p.cardsReady ? soon : "·"}</span>
              <span className="text-[12px] text-fg-3">next 7 days</span>
            </span>
          </div>
          <div className="flex items-end gap-1.5" aria-label={`Cards per box: ${boxes.map((n, i) => `box ${i + 1} ${n}`).join(", ")}`}>
            {boxes.map((n, i) => (
              <span key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="flex h-10 w-full items-end bg-surface-2">
                  <span className="block w-full bg-fg-3" style={{ height: `${(n / maxBox) * 100}%` }} />
                </span>
                <span className="font-mono text-[10px] text-fg-4">
                  B{i + 1}·{n}
                </span>
              </span>
            ))}
          </div>
          <span className="text-[12px] text-fg-3">{p.cards.length} cards · Leitner boxes 1 → 5</span>
        </Link>

        {/* notebook */}
        <div className="flex min-w-0 flex-col gap-3 border border-line bg-surface p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-2">
            <Label>notebook</Label>
            {p.signedIn && (
              <Link href="/learn/notebook" className="inline-flex min-h-10 items-center font-mono text-[12px] text-signal-text hover:underline">
                open →
              </Link>
            )}
          </div>
          {p.signedIn ? (
            <div className="grid grid-cols-3 gap-px border border-line bg-line">
              {(
                [
                  ["highlights", p.notebook?.highlights, "highlights"],
                  ["notes", p.notebook?.notes, "notes"],
                  ["bookmarks", p.notebook?.bookmarks, "bookmarks"],
                ] as const
              ).map(([k, n, tab]) => (
                <Link key={k} href={`/learn/notebook?tab=${tab}`} className="flex min-h-[72px] flex-col justify-center gap-1 bg-bg px-3 hover:bg-surface-2">
                  <span className="font-display text-[26px] font-extrabold leading-none tracking-[-0.04em] text-fg">{n ?? "·"}</span>
                  <span className="text-[12px] text-fg-3">{k}</span>
                </Link>
              ))}
            </div>
          ) : (
            <>
              <span className="text-sm leading-normal text-fg-2">Highlights, notes and bookmarks are saved to an account, so they follow you and stay searchable.</span>
              <button type="button" onClick={p.onSignIn} className="min-h-11 self-start border border-line-strong px-4 text-sm text-fg hover:bg-surface-2">
                Sign in to take notes
              </button>
            </>
          )}
        </div>
      </div>

      {/* badges */}
      <div className="flex flex-col gap-2.5 border border-line bg-surface p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-2">
          <Label>badges</Label>
          <span className="flex items-center gap-3 font-mono text-[11px] text-fg-3">
            {earned} of {p.badges.length}
            {earned > 0 && <ShareButton kind="badges" variant="link" label="share" className="min-h-8 text-[12px]" />}
          </span>
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {p.badges.map((b) => (
            <li key={b.id} title={b.how} className={`px-2.5 py-1.5 text-[12px] ${b.earned ? "border border-signal text-fg" : "border border-dashed border-line-strong text-fg-4"}`}>
              {b.earned && <span className="mr-1 text-signal-text">✓</span>}
              {b.name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
