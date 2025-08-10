"use client";
import { useEffect, useState } from "react";
import { motion, cubicBezier } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, ArrowRight } from "lucide-react";
import CoverImage from "@/components/CoverImage";

export type StoryCard = {
  slug: string;
  title: string;
  excerpt?: string;
  cover?: string;
  date?: string;
  tags?: string[];
};

function sortByDateDesc(arr: StoryCard[]): StoryCard[] {
  return [...arr].sort((a, b) => {
    const ta = new Date(a?.date || 0).getTime();
    const tb = new Date(b?.date || 0).getTime();
    return tb - ta; // newest first
  });
}

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
  const [stories, setStories] = useState<StoryCard[]>(sortByDateDesc(initial || []));
  const pathname = usePathname();
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;

    const sanitize = (arr: StoryCard[]): StoryCard[] =>
      sortByDateDesc((Array.isArray(arr) ? arr : []).filter((s) => s && typeof s.slug === "string" && s.slug.trim() && typeof s.title === "string" && s.title.trim()))
        .map((s) => ({ ...s, cover: s.cover }));

    const fetchStories = () => {
      fetch("/api/stories", {
        cache: "no-store",
        headers: { "cache-control": "no-cache" },
      })
        .then((r) => r.json())
        .then((d) => {
          if (!active) return;
          const raw: StoryCard[] = d?.stories || [];
          const next = sanitize(raw);
          // Only update when we actually have items; avoid replacing with empty lists in prod
          if (next.length > 0) {
            setStories((prev) => (JSON.stringify(sanitize(prev)) === JSON.stringify(next) ? prev : next));
          }
        })
        .catch(() => { });
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

  const sanitizeLocal = (arr: StoryCard[]) =>
    sortByDateDesc((Array.isArray(arr) ? arr : []).filter((s) => s && typeof s.slug === "string" && s.slug.trim() && typeof s.title === "string" && s.title.trim()));

  const visible = typeof limit === "number" ? sanitizeLocal(stories).slice(0, Math.max(0, limit)) : sanitizeLocal(stories);
  const shouldShowExplore = !!showExplore;

  const container = {
    hidden: { opacity: 1 },
    show: { opacity: 1, transition: { staggerChildren: 0.14, delayChildren: 0.08 } },
  };
  const item = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: cubicBezier(0.4, 0, 0.2, 1) } },
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-10% 0px -20% 0px" }}
      className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      {visible.map((s) => (
        <motion.article
          key={s.slug}
          variants={item}
          className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 pb-16 text-white/90 shadow-lg shadow-black/5 dark:shadow-black/30 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(99,102,241,0.35),0_12px_36px_-12px_rgba(59,130,246,0.45)]"
        >
          {/* blueprint grid backdrop */}
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.15)_1px,transparent_1px)] bg-[size:22px_22px]" />
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-blue-500/10" />
          </div>

          {/* wiring lines */}
          <svg className="absolute -right-6 -bottom-6 h-32 w-32 text-indigo-400/30" viewBox="0 0 200 200" fill="none">
            <path d="M10 10 H120 V120 H10 Z" stroke="currentColor" strokeWidth="1" />
            <path d="M120 60 H180 V180 H60 V120" stroke="currentColor" strokeWidth="1" />
            <circle cx="60" cy="120" r="3" fill="currentColor" />
          </svg>

          {/* cover image */}
          {s.cover && (
            <div className="relative mb-4">
              <CoverImage
                src={s.cover}
                alt={s.title}
                width={640}
                height={360}
                priority={false}
              />
            </div>
          )}

          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-white">

              <h3 className="font-semibold text-base sm:text-lg leading-snug">
                <Link href={`/stories/${s.slug}`} className="hover:underline">
                  {s.title}
                </Link>
              </h3>
            </div>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-blue-500/20 text-indigo-300 ring-1 ring-inset ring-white/10">
              <FileText className="h-4 w-4" />
            </span>
            <Link
              href={`/stories/${s.slug}`}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80 hover:bg-white/10"
            >
              Read <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {s.excerpt && <p className="relative z-10 mt-2 text-sm text-white/80 line-clamp-3">{s.excerpt}</p>}

          {/* tags */}
          {s.tags && (
            <div className="relative z-10 mt-3 flex flex-wrap gap-1.5">
              {s.tags.slice(0, 4).map((t) => (
                <span key={`${s.slug}-${t}`} className="inline-flex items-center rounded-full bg-gradient-to-r from-indigo-500/15 to-blue-500/15 px-2 py-0.5 text-[10px] text-white/85 ring-1 ring-inset ring-white/10">
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* hover preview panel (placed in reserved bottom padding area) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-2 z-0 opacity-0 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100"
          >
            <div className="mx-5 rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-3 text-[12px] text-indigo-100/90 shadow-[0_6px_20px_-10px_rgba(99,102,241,0.5)]">
              Blueprint preview — zoom into the architecture sketch.
            </div>
          </div>

          <span className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-blue-500/0 opacity-0 blur group-hover:opacity-60 transition-opacity" />
        </motion.article>
      ))}

      {shouldShowExplore && (
        <motion.article
          key="explore-more"
          variants={item}
          className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 pb-16 text-white/90 shadow-lg shadow-black/5 dark:shadow-black/30 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(99,102,241,0.35),0_12px_36px_-12px_rgba(59,130,246,0.45)]"
        >
          {/* blueprint grid backdrop */}
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.15)_1px,transparent_1px)] bg-[size:22px_22px]" />
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-blue-500/10" />
          </div>

          {/* wiring lines */}
          <svg className="absolute -right-6 -bottom-6 h-32 w-32 text-indigo-400/30" viewBox="0 0 200 200" fill="none">
            <path d="M10 10 H120 V120 H10 Z" stroke="currentColor" strokeWidth="1" />
            <path d="M120 60 H180 V180 H60 V120" stroke="currentColor" strokeWidth="1" />
            <circle cx="60" cy="120" r="3" fill="currentColor" />
          </svg>

          {/* hero visual area - matching cover image space */}
          <div className="relative mb-4 h-[200px] rounded-xl border border-white/10 bg-gradient-to-br from-indigo-500/20 via-blue-500/15 to-purple-500/20 flex items-center justify-center overflow-hidden">
            {/* animated blueprint pattern overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(99,102,241,0.1)_1px,transparent_1px),linear-gradient(-45deg,rgba(147,51,234,0.1)_1px,transparent_1px)] bg-[size:16px_16px] animate-pulse opacity-60" />

            {/* central icon */}
            <div className="relative z-10 flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center ring-2 ring-white/20 backdrop-blur-sm">
                <FileText className="h-8 w-8 text-white" />
              </div>
              <div className="text-center">
                <div className="text-xs text-white/60 font-medium tracking-wider uppercase">Engineering Stories</div>
                <div className="text-sm text-white/80 mt-0.5">Blueprint Collection</div>
              </div>
            </div>

            {/* floating elements */}
            <div className="absolute top-4 left-4 w-2 h-2 rounded-full bg-indigo-400/40 animate-pulse" />
            <div className="absolute top-6 right-6 w-1.5 h-1.5 rounded-full bg-purple-400/40 animate-pulse [animation-delay:0.5s]" />
            <div className="absolute bottom-4 left-6 w-1 h-1 rounded-full bg-blue-400/40 animate-pulse [animation-delay:1s]" />
          </div>

          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-white">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-blue-500/20 text-indigo-300 ring-1 ring-inset ring-white/10">
                <FileText className="h-4 w-4" />
              </span>
              <h3 className="font-semibold text-base sm:text-lg leading-snug">
                {exploreLabel}
              </h3>
            </div>
            <Link
              href={exploreHref}
              onClick={(e) => {
                e.preventDefault();
                window.location.href = exploreHref; // navigate + full refresh
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80 hover:bg-white/10"
            >
              Browse <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <p className="relative z-10 mt-2 text-sm text-white/80">Dive into the full library of engineering deep-dives and blueprints.</p>

          {/* tags matching story cards */}
          <div className="relative z-10 mt-3 flex flex-wrap gap-1.5">
            {["System Design", "Architecture", "Backend", "Scalability"].slice(0, 4).map((tag) => (
              <span key={tag} className="inline-flex items-center rounded-full bg-gradient-to-r from-indigo-500/15 to-blue-500/15 px-2 py-0.5 text-[10px] text-white/85 ring-1 ring-inset ring-white/10">
                {tag}
              </span>
            ))}
          </div>

          {/* hover action panel (matching story cards) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-2 z-0 opacity-0 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100"
          >
            <div className="mx-5 rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-3 text-[12px] text-indigo-100/90 shadow-[0_6px_20px_-10px_rgba(99,102,241,0.5)]">
              <div className="flex items-center justify-between">
                <span>Explore the complete collection →</span>
                <div className="flex gap-1">
                  <div className="w-1 h-1 rounded-full bg-indigo-300/50" />
                  <div className="w-1 h-1 rounded-full bg-indigo-300/30" />
                  <div className="w-1 h-1 rounded-full bg-indigo-300/20" />
                </div>
              </div>
            </div>
          </div>

          <span className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-blue-500/0 opacity-0 blur group-hover:opacity-60 transition-opacity" />
        </motion.article>
      )}
    </motion.div>
  );
}
