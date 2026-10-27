"use client";

/**
 * A row of shorts on the course hub: a few 9:16 posters (a fresh pick every visit, shorts this browser
 * hasn't watched first) that open the feed at that short. The hub page hands in a sample and the total.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

export type TeaserShort = { id: string; title: string; label: string; poster: string };

const SHOW = 8;

export default function ShortsTeaser({ shorts, total }: { shorts: TeaserShort[]; total: number }) {
  const [pick, setPick] = useState(() => shorts.slice(0, SHOW));
  // a fresh pick on every visit; unseen shorts (the feed remembers what was watched) first
  useEffect(() => {
    const id = window.setTimeout(() => {
      let seen = new Set<string>();
      try {
        seen = new Set(JSON.parse(localStorage.getItem("hk.shorts.seen") || "[]") as string[]);
      } catch {
        // no storage: just shuffle
      }
      const r = shorts.map((s) => ({ s, k: (seen.has(s.id) ? 1 : 0) + Math.random() })).sort((a, b) => a.k - b.k);
      setPick(r.slice(0, SHOW).map((x) => x.s));
    }, 0);
    return () => window.clearTimeout(id);
  }, [shorts]);

  if (!shorts.length) return null;
  return (
    <section aria-labelledby="shorts-h" className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="shorts-h" className="font-display text-[34px] font-bold tracking-[-0.03em] text-fg sm:text-[40px]">
          Shorts
        </h2>
        <span className="text-[15px] text-fg-3">
          {total} ideas in under two minutes each, swipe through them like Reels.{" "}
          <Link href="/learn/shorts" className="font-mono text-signal-text hover:underline">
            watch all ›
          </Link>
        </span>
      </div>
      <ul className="m-0 flex list-none gap-3 overflow-x-auto p-0 pb-1 [scrollbar-width:thin]">
        {pick.map((s) => (
          <li key={s.id} className="group w-[150px] shrink-0 sm:w-[170px]">
            <Link href={`/learn/shorts?v=${encodeURIComponent(s.id)}`} className="flex flex-col gap-2">
              <span className="relative block aspect-[9/16] overflow-hidden border border-line-strong bg-[#0b0b0c] transition-colors group-hover:border-signal">
                {/* eslint-disable-next-line @next/next/no-img-element -- the short's own poster frame from the media host */}
                <img src={s.poster} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
                  <span className="grid h-12 w-12 place-items-center bg-signal text-lg text-on-signal">▶</span>
                </span>
              </span>
              <span className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-fg-3">{s.label}</span>
              <span className="line-clamp-2 text-[14px] font-semibold leading-snug text-fg">{s.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
