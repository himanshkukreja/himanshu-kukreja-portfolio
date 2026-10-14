"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import CoverImage from "@/components/CoverImage";
import { CASE_TYPE_LABEL, assignCaseIds, formatMonthYear, resolveCaseType } from "@/components/stories/case-types";

export type StoryCard = {
  slug: string;
  title: string;
  excerpt?: string;
  cover?: string;
  date?: string;
  tags?: string[];
  type?: string;
};

function sortByDateDesc(arr: StoryCard[]): StoryCard[] {
  return [...arr].sort((a, b) => {
    const ta = new Date(a?.date || 0).getTime();
    const tb = new Date(b?.date || 0).getTime();
    return tb - ta || b.slug.localeCompare(a.slug); // newest first
  });
}

function sanitize(arr: StoryCard[]): StoryCard[] {
  return sortByDateDesc(
    (Array.isArray(arr) ? arr : []).filter(
      (s) => s && typeof s.slug === "string" && s.slug.trim() && typeof s.title === "string" && s.title.trim()
    )
  );
}

const BLUEPRINT_BG =
  "bg-raised bg-[linear-gradient(var(--c-line)_1px,transparent_1px),linear-gradient(90deg,var(--c-line)_1px,transparent_1px)] bg-[size:24px_24px]";

/** Compact case-file cards (used on the home page). The full ledger lives at /stories. */
export default function StoriesGrid({
  initial,
  limit,
  showExplore,
  exploreHref = "/stories",
  exploreLabel = "Explore more stories",
}: {
  initial?: StoryCard[];
  limit?: number;
  showExplore?: boolean;
  exploreHref?: string;
  exploreLabel?: string;
}) {
  const [stories, setStories] = useState<StoryCard[]>(() => sanitize(initial || []));
  const pathname = usePathname();

  useEffect(() => {
    let active = true;

    const fetchStories = () => {
      fetch("/api/stories", {
        cache: "no-store",
        headers: { "cache-control": "no-cache" },
      })
        .then((r) => r.json())
        .then((d) => {
          if (!active) return;
          const next = sanitize(d?.stories || []);
          // Only update when we actually have items; avoid replacing with empty lists in prod
          if (next.length > 0) {
            setStories((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
          }
        })
        .catch(() => {});
    };

    fetchStories();

    const onFocus = () => fetchStories();
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchStories();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname]);

  const ids = useMemo(() => assignCaseIds(stories), [stories]);
  const visible = typeof limit === "number" ? stories.slice(0, Math.max(0, limit)) : stories;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((s) => {
        const type = resolveCaseType(s.slug, s.type);
        return (
          <Link
            key={s.slug}
            href={`/stories/${s.slug}`}
            className="group flex flex-col border border-line bg-surface text-fg no-underline hover:border-line-strong hover:text-fg"
          >
            <span className={`relative block aspect-[16/9] border-b border-line ${BLUEPRINT_BG}`}>
              {s.cover && <CoverImage src={s.cover} alt="" fill sizes="(min-width: 1024px) 420px, (min-width: 640px) 50vw, 100vw" />}
              <span className="absolute left-3 top-3 bg-signal px-2 py-1 font-mono text-xs font-semibold tracking-[0.06em] text-on-signal">
                {ids.get(s.slug)}
              </span>
            </span>
            <span className="flex grow flex-col gap-2 p-4 sm:p-5">
              <span className={`font-mono text-[11px] tracking-[0.06em] ${type === "incident" ? "text-bad-text" : "text-fg-3"}`}>
                {CASE_TYPE_LABEL[type].toUpperCase()} · {formatMonthYear(s.date)}
              </span>
              <span className="font-display text-xl font-bold leading-[1.15] tracking-[-0.015em]">{s.title}</span>
              {s.excerpt && <span className="line-clamp-3 text-sm leading-normal text-fg-3">{s.excerpt}</span>}
              <span className="mt-auto pt-2 font-mono text-xs text-signal-text">Open the case file →</span>
            </span>
          </Link>
        );
      })}

      {showExplore && (
        <Link
          href={exploreHref}
          className="flex min-h-[220px] flex-col justify-between gap-4 border border-dashed border-line-strong p-5 text-fg no-underline hover:border-signal hover:text-fg"
        >
          <span className="label-mono text-fg-3">Case files · {stories.length} on record</span>
          <span className="font-display text-[28px] font-extrabold leading-none tracking-[-0.03em]">
            {exploreLabel}
            <span className="text-signal-text">.</span>
          </span>
          <span className="font-mono text-xs text-signal-text">Open the ledger →</span>
        </Link>
      )}
    </div>
  );
}
