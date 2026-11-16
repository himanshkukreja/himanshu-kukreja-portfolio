"use client";

/**
 * Quick review: three short tiles from the lessons the learner is on and last finished, each a ~1 minute short. A tile is a
 * video plate (the plate tokens), so it reads the same in every theme. Nothing renders when those lessons have no shorts yet.
 * TODO: filter hidden shorts once the publishing controls (row 160) are wired to the home.
 */
import Link from "next/link";
import { Play } from "lucide-react";
import { CARD_H, SIDE_CARD } from "../ui/kit";

/** three plate shades, darkest first (the canvas's tiles): the plate tokens, so they read the same in every theme */
const SHADE = ["var(--c-plate)", "color-mix(in srgb, var(--c-plate) 84%, var(--c-plate-fg))", "color-mix(in srgb, var(--c-plate) 68%, var(--c-plate-fg))"];

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
    <section aria-labelledby="dsa-quick-h" className={SIDE_CARD}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="dsa-quick-h" className={CARD_H}>
          Quick review
        </h2>
        <Link href="/dsa/review" className="text-[13px] text-fg-3 hover:text-fg">
          All of Review →
        </Link>
      </div>
      <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
        {tiles.map((id, i) => (
          <li key={id} className="min-w-0">
            <Link
              href={`/dsa/shorts/${id}`}
              style={{ background: SHADE[i] }}
              className="flex aspect-[9/14] flex-col justify-between rounded-[10px] p-2.5 text-[12px] font-semibold leading-snug text-[var(--c-plate-fg)] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text"
            >
              <Play className="h-3.5 w-3.5 fill-current text-[var(--c-plate-fg)] opacity-70" aria-hidden />
              <span className="line-clamp-4">{shortTitle(id)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <span className="text-[12px] text-fg-3">Shorts from the lessons you are on · about 1 min each</span>
    </section>
  );
}
