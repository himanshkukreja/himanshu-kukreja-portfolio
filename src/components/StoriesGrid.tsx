"use client";
import { useEffect, useState } from "react";
import { motion, cubicBezier } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, ArrowRight } from "lucide-react";

export type StoryCard = {
    slug: string;
    title: string;
    excerpt?: string;
    cover?: string;
    date?: string;
    tags?: string[];
};

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
    const [stories, setStories] = useState<StoryCard[]>(initial || []);
    const pathname = usePathname();

    useEffect(() => {
        let active = true;

        const sanitize = (arr: StoryCard[]): StoryCard[] =>
            (Array.isArray(arr) ? arr : []).filter((s) => s && typeof s.slug === "string" && s.slug.trim() && typeof s.title === "string" && s.title.trim());

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
        (Array.isArray(arr) ? arr : []).filter((s) => s && typeof s.slug === "string" && s.slug.trim() && typeof s.title === "string" && s.title.trim());

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

                    <div className="relative z-10 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 text-white">
                            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-blue-500/20 text-indigo-300 ring-1 ring-inset ring-white/10">
                                <FileText className="h-4 w-4" />
                            </span>
                            <h3 className="font-semibold text-base sm:text-lg leading-snug">
                                <Link href={`/stories/${s.slug}`} className="hover:underline">
                                    {s.title}
                                </Link>
                            </h3>
                        </div>
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
                    className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 text-white/90 shadow-lg shadow-black/5 dark:shadow-black/30 flex flex-col justify-between"
                >
                    <div>
                        <h3 className="text-lg font-semibold text-white">{exploreLabel}</h3>
                        <p className="mt-2 text-sm text-white/80">Dive into the full library of engineering deep-dives and blueprints.</p>
                    </div>
                    <div className="mt-6">
                        <Link
                            href={exploreHref}
                            onClick={(e) => {
                                e.preventDefault();
                                window.location.href = exploreHref; // navigate + full refresh
                            }}
                            className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12),0_10px_30px_-12px_rgba(59,130,246,0.6)] bg-[linear-gradient(110deg,rgba(99,102,241,0.95),rgba(59,130,246,0.95),rgba(147,51,234,0.95))] bg-[length:200%_100%] transition-[transform,box-shadow,filter,background-position] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-[position:100%_0]"
                        >
                            Explore stories <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                    {/* subtle background accents */}
                    <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
                        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.15)_1px,transparent_1px)] bg-[size:22px_22px]" />
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-blue-500/10" />
                    </div>
                </motion.article>
            )}
        </motion.div>
    );
}
