"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LectureSummary } from "@/lib/learn/lecture/load";
import { lectureGroupAnchor, lectureGroupCode } from "@/lib/learn/lecture/types";

/** Lecture cards: poster, length, checkpoints, and how far this learner got (from the player's resume point). */
export default function LectureGrid({ lectures, mediaBase }: { lectures: LectureSummary[]; mediaBase: string | null }) {
  const [seen, setSeen] = useState<Record<string, number>>({});
  useEffect(() => {
    const id = window.setTimeout(() => {
      const out: Record<string, number> = {};
      try {
        for (const l of lectures) {
          const at = Number(localStorage.getItem(`hk.lecture.pos.${l.slug}`));
          if (at > 0) out[l.slug] = at;
        }
      } catch {}
      setSeen(out);
    }, 0);
    return () => window.clearTimeout(id);
  }, [lectures]);
  // opened with a section anchor (#w04-caching): the page loads at the top, so go there once laid out
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 120);
    return () => window.clearTimeout(t);
  }, []);
  // one section per week (and one for the side quests), in course order
  const groups: { name: string; items: LectureSummary[] }[] = [];
  for (const l of lectures) {
    const g = groups[groups.length - 1];
    if (g && g.name === l.group) g.items.push(l);
    else groups.push({ name: l.group, items: [l] });
  }
  let k = -1;
  return (
    <div className="flex flex-col gap-10">
      {groups.length > 1 && (
        <nav aria-label="Playlist sections" className="sticky top-[var(--hk-header-h,61px)] z-20 -mx-4 flex gap-1 overflow-x-auto border-b border-line bg-bg/95 px-4 py-2 backdrop-blur sm:mx-0 sm:flex-wrap sm:border sm:px-2">
          {groups.map((g) => (
            <a
              key={g.name}
              href={`#${lectureGroupAnchor(g.name)}`}
              title={`${g.name} · ${g.items.length} lecture${g.items.length === 1 ? "" : "s"}`}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 border border-line-strong px-2 font-mono text-xs text-fg-2 hover:border-signal hover:text-fg"
            >
              {lectureGroupCode(g.name)}
              <span className="text-fg-4">{g.items.length}</span>
            </a>
          ))}
        </nav>
      )}
      {groups.map((g) => (
        <section key={g.name} id={lectureGroupAnchor(g.name)} className="flex scroll-mt-32 flex-col gap-4">
          <h2 className="m-0 flex items-baseline gap-3 font-mono text-[12px] uppercase tracking-label text-fg-3">
            <span className="text-signal-text">{g.name}</span>
            <span className="text-fg-4">
              {g.items.length} lecture{g.items.length === 1 ? "" : "s"} · {g.items.reduce((a, x) => a + x.minutes, 0)} min
            </span>
          </h2>
          <ol className="m-0 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((l) => {
              k++;
              const at = seen[l.slug];
              const pct = at ? Math.min(100, (at / (l.minutes * 60)) * 100) : 0;
              return (
                <li key={l.slug}>
                  <Link href={l.href} className="group flex h-full flex-col border border-line-strong bg-surface hover:border-signal">
                    <div className="relative aspect-video overflow-hidden bg-[#0b0b0c]">
                      {mediaBase && (
                        // eslint-disable-next-line @next/next/no-img-element -- poster lives on the media host (R2), not in next/image's domains
                        <img
                          src={`${mediaBase}/${l.slug}/poster.jpg`}
                          alt=""
                          loading={k < 6 ? "eager" : "lazy"}
                          className="h-full w-full object-cover opacity-90 transition-transform duration-300 group-hover:scale-[1.03]"
                          onError={(e) => (e.currentTarget.style.display = "none")}
                        />
                      )}
                      <span className="absolute left-2 top-2 bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-signal-text">
                        <span className="text-[#a3a3a8]">#{k + 1}</span> · {l.code}
                      </span>
                      <span className="absolute bottom-2 right-2 bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-[#f3f2ee]">{l.minutes} min</span>
                      <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="grid h-12 w-12 place-items-center rounded-full bg-signal text-on-signal shadow-[0_0_24px_rgba(255,107,43,0.5)]">
                          <svg viewBox="0 0 24 24" className="h-5 w-5 translate-x-[1px]" fill="currentColor" aria-hidden>
                            <path d="M7 4l13 8-13 8z" />
                          </svg>
                        </span>
                      </span>
                      {pct > 0 && (
                        <span className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
                          <span className="block h-full bg-signal" style={{ width: `${pct}%` }} />
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5 p-4">
                      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{l.quest}</span>
                      <span className="font-display text-[19px] font-bold leading-tight tracking-[-0.02em] text-fg group-hover:text-signal-text">{l.title}</span>
                      <span className="line-clamp-2 text-[13px] leading-snug text-fg-3">{l.summary}</span>
                      <span className="mt-auto pt-2 font-mono text-[11px] text-fg-4">
                        {l.checkpoints} checkpoints · {l.chapters} chapters{pct > 0 ? ` · ${pct >= 97 ? "watched" : `${Math.round(pct)}% watched`}` : ""}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
