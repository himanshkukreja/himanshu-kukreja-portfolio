"use client";

/**
 * Quick review: three short tiles from the lessons the learner is on and last finished, each a ~1 minute short. A tile is a
 * video plate (the plate tokens), so it reads the same in every theme. Nothing renders when those lessons have no shorts yet.
 * TODO: filter hidden shorts once the publishing controls (row 160) are wired to the home.
 */
import Link from "next/link";
import { Play } from "lucide-react";

/** "shorts--dsa--m3-hashing--prefix-sums--why-seed-zero" → "Why seed zero". */
export function shortTitle(id: string): string {
  const slug = id.split("--").pop() || id;
  const t = slug.replace(/-/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function QuickReview({ ids }: { ids: string[] }) {
  const tiles = ids.slice(0, 3);
  if (!tiles.length) return null;
  return (
    <section aria-labelledby="dsa-quick-h" className="flex flex-col gap-3 border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="dsa-quick-h" className="m-0 text-[16px] font-semibold text-fg">
          Quick review
        </h2>
        <Link href="/dsa/review" className="font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
          all of Review
        </Link>
      </div>
      <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
        {tiles.map((id) => (
          <li key={id} className="min-w-0">
            <Link
              href={`/dsa/shorts/${id}`}
              className="flex aspect-[9/14] flex-col justify-between bg-[var(--c-plate)] p-2.5 text-[12px] font-semibold leading-snug text-[var(--c-plate-fg)] outline outline-1 outline-line-strong hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text"
            >
              <Play className="h-3.5 w-3.5 text-[var(--c-plate-accent)]" aria-hidden />
              <span className="line-clamp-4">{shortTitle(id)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <span className="text-[12px] text-fg-3">Shorts from the lessons you are on · about 1 min each</span>
    </section>
  );
}
