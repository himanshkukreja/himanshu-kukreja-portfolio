"use client";

/**
 * Learn sub-nav: `~/himanshu / learn.` + course · review (due) · notebook · profile, ⌘K course
 * search and the level chip. Sticks under the global SiteHeader on every /learn route; on phones
 * it is a horizontal scroll row (the site dock stays at the bottom).
 *
 * Publishes two CSS variables on <html> for other sticky learn UI:
 *   --hk-header-h  height of the global header
 *   --learn-nav-h  height of this row
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useGame } from "@/game/GameProvider";
import { levelProgress } from "@/game/catalog";
import SearchBar from "@/components/SearchBar";
import { useReviewCards } from "@/lib/learn/useReviewDue";

const COURSE_HREF = "/learn/system-design-mastery";

const isCourse = (p: string) => p === "/learn" || (p.startsWith("/learn/") && !/^\/learn\/(review|notebook|notes|bookmarks|dashboard)(\/|$)/.test(p));

export default function LearnSubNav() {
  const pathname = usePathname() || "/learn";
  const { xp, hydrated } = useGame();
  const { dueCount, ready } = useReviewCards();
  const ref = useRef<HTMLDivElement>(null);
  const p = levelProgress(hydrated ? xp : 0);

  useEffect(() => {
    const root = document.documentElement;
    const header = document.querySelector("header");
    const set = () => {
      if (header) root.style.setProperty("--hk-header-h", `${Math.round(header.getBoundingClientRect().height)}px`);
      if (ref.current) root.style.setProperty("--learn-nav-h", `${Math.round(ref.current.getBoundingClientRect().height)}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    if (header) ro.observe(header);
    if (ref.current) ro.observe(ref.current);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--learn-nav-h");
    };
  }, []);

  const links = [
    { href: COURSE_HREF, label: "course", on: isCourse(pathname) },
    { href: "/learn/review", label: "review", on: pathname.startsWith("/learn/review"), badge: true },
    { href: "/learn/notebook", label: "notebook", on: /^\/learn\/(notebook|notes|bookmarks)/.test(pathname) },
    { href: "/learn/dashboard", label: "profile", on: pathname.startsWith("/learn/dashboard") },
  ];

  return (
    <div
      ref={ref}
      // On phone/tablet lesson pages the stage strip (with its Contents sheet) replaces this row,
      // so readers get two top bars instead of three.
      className={`sticky z-40 border-b border-line bg-bg/90 backdrop-blur ${/^\/learn\/[^/]+\/[^/]+\/[^/]+/.test(pathname) ? "hidden lg:block" : ""}`}
      style={{ top: "var(--hk-header-h, 61px)" }}
    >
      <div className="mx-auto flex max-w-[1320px] items-center gap-x-2 px-4 sm:gap-x-5 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-x-1.5 overflow-x-auto [scrollbar-width:none] sm:gap-x-4 [&::-webkit-scrollbar]:hidden">
          <span className="hidden shrink-0 items-center gap-2 font-mono text-[15px] font-semibold text-fg-3 lg:inline-flex">
            <Link href="/" className="py-2 hover:text-fg">
              <span className="text-signal-text">~</span>/himanshu
            </Link>
            <span aria-hidden className="text-line-strong">
              /
            </span>
          </span>
          <Link href={COURSE_HREF} className="hidden shrink-0 py-2 pr-1 font-display text-xl sm:inline font-extrabold tracking-[-0.03em] text-fg">
            learn<span className="text-signal-text">.</span>
          </Link>
          <nav aria-label="Learn" className="flex shrink-0 items-center font-mono text-[13px]">
            {links.map((l, i) => (
              <span key={l.href} className="flex items-center">
                {i > 0 && (
                  <span aria-hidden className="hidden text-line-strong sm:inline">
                    ·
                  </span>
                )}
                <Link
                  href={l.href}
                  aria-current={l.on ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap px-2 sm:gap-2 sm:px-2.5 ${l.on ? "text-fg shadow-[inset_0_-2px_0_var(--c-signal)]" : "text-fg-3 hover:text-fg"}`}
                >
                  {l.label}
                  {l.badge && ready && (
                    <span
                      aria-label={`${dueCount} due`}
                      className={`inline-grid h-5 min-w-5 place-items-center px-1 text-[11px] font-semibold ${dueCount ? "bg-signal text-on-signal" : "border border-line-strong text-fg-3"}`}
                    >
                      {dueCount}
                    </span>
                  )}
                </Link>
              </span>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2 py-1.5">
          <SearchBar variant="nav" hotkey />
          <Link
            href="/learn/dashboard"
            aria-label={`Level ${p.level.code} ${p.level.name}, ${hydrated ? xp : 0} XP. Open your profile`}
            className="hidden min-h-10 items-center whitespace-nowrap border border-signal px-2 font-mono text-xs tracking-label text-signal-text sm:inline-flex"
          >
            {p.level.code} · {p.level.name.toUpperCase()}
            <span className="hidden xl:inline">&nbsp;· {hydrated ? xp : 0} XP</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
