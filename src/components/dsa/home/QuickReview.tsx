"use client";

/**
 * Quick review: three short tiles from the lessons the learner is on and last finished, each a ~1 minute short. A tile is a
 * poster (or, before its video is rendered, a cover in the lesson's metro line colour on the plate tokens), so it reads the same in every theme. Nothing renders when those lessons have no shorts yet.
 * TODO: filter hidden shorts once the publishing controls (row 160) are wired to the home.
 */
import { useState } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { CARD_H, SIDE_CARD } from "../ui/kit";

export type QuickTile = { id: string; poster: string | null; headline?: string; /** CSS custom property of the lesson's metro line colour */ lineToken: string };

/** "shorts--dsa--m3-hashing--prefix-sums--why-seed-zero" → "Why seed zero". */
export function shortTitle(id: string): string {
  const slug = id.split("--").pop() || id;
  const t = slug.replace(/-/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** The tile's face: the rendered short's poster; until it exists (or if it fails to load) a cover in the lesson's line colour with the first scene's headline. */
function Thumb({ t }: { t: QuickTile }) {
  const [bad, setBad] = useState(false);
  const title = shortTitle(t.id);
  const cover = !t.poster || bad;
  return (
    <Link
      href={`/dsa/shorts/${t.id}`}
      style={{ background: `linear-gradient(160deg, color-mix(in srgb, var(${t.lineToken}) 78%, var(--c-plate)), color-mix(in srgb, var(${t.lineToken}) 38%, var(--c-plate)))` }}
      className="group relative flex aspect-[9/16] max-h-[300px] w-full flex-col justify-between overflow-hidden rounded-[10px] border border-line-strong text-[var(--c-plate-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text"
    >
      {cover ? (
        <span className="relative z-10 flex flex-1 flex-col justify-between p-2.5">
          <span className="font-mono text-[9px] uppercase tracking-wider opacity-80">DSA Mastery · short</span>
          <span className="line-clamp-5 text-[13px] font-semibold leading-snug">{t.headline || title}</span>
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={t.poster!} alt="" loading="lazy" onError={() => setBad(true)} className="absolute inset-0 h-full w-full object-cover" />
      )}
      {!cover && <span aria-hidden className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-[color-mix(in_srgb,var(--c-plate)_88%,transparent)] to-transparent" />}
      <span className="absolute right-1.5 top-1.5 z-10 grid h-6 w-6 place-items-center rounded-full bg-[color-mix(in_srgb,var(--c-plate)_70%,transparent)]">
        <Play className="h-3 w-3 fill-current" aria-hidden />
      </span>
      {!cover && <span className="relative z-10 line-clamp-3 p-2.5 text-[12px] font-semibold leading-snug">{title}</span>}
    </Link>
  );
}

export default function QuickReview({ tiles: all }: { tiles: QuickTile[] }) {
  const tiles = all.slice(0, 3);
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
        {tiles.map((t) => (
          <li key={t.id} className="min-w-0 max-w-[170px]">
            <Thumb t={t} />
          </li>
        ))}
      </ul>
      <span className="text-[12px] text-fg-3">Shorts from the lessons you are on · about 1 min each</span>
    </section>
  );
}
