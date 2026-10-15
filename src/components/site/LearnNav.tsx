"use client";

/**
 * Learn mode for the global SiteHeader. On /learn routes the portfolio nav is swapped for the
 * course's own tabs (one header, not a header plus a sub-nav), and on phones the bottom dock
 * becomes the course dock with a way back to the site.
 */
import Link from "next/link";
import { useReviewCards } from "@/lib/learn/useReviewDue";

export const COURSE_HREF = "/learn/system-design-mastery";

export const isLearnRoute = (p: string) => p === "/learn" || p.startsWith("/learn/");

const isCourse = (p: string) => isLearnRoute(p) && !/^\/learn\/(arena|review|notebook|notes|bookmarks|dashboard)(\/|$)/.test(p);

/** The Arena tab also owns the review queue (/learn/review), so the due badge lives on it. */
const isArena = (p: string) => /^\/learn\/(arena|review)(\/|$)/.test(p);

function tabs(pathname: string) {
  return [
    { href: COURSE_HREF, label: "course", on: isCourse(pathname) },
    { href: "/learn/arena", label: "arena", on: isArena(pathname), badge: true },
    { href: "/learn/notebook", label: "notebook", on: /^\/learn\/(notebook|notes|bookmarks)/.test(pathname) },
    { href: "/learn/dashboard", label: "progress", on: pathname.startsWith("/learn/dashboard") },
  ];
}

function DueBadge({ compact = false }: { compact?: boolean }) {
  const { dueCount, ready } = useReviewCards();
  if (!ready) return null;
  if (compact && !dueCount) return null;
  return (
    <span
      aria-label={`${dueCount} due`}
      className={`inline-grid h-5 min-w-5 place-items-center px-1 text-[11px] font-semibold ${dueCount ? "bg-signal text-on-signal" : "border border-line-strong text-fg-3"}`}
    >
      {dueCount}
    </span>
  );
}

/** `~/himanshu / learn.` — the course brand, with the portfolio one click away. */
export function LearnBrand() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 sm:gap-2">
      <Link href="/" aria-label="Back to the portfolio" className="inline-flex min-h-10 min-w-10 items-center justify-center py-2 font-mono sm:min-w-0 text-[15px] font-semibold text-fg-3 hover:text-fg sm:text-base">
        <span className="text-signal-text">~</span>
        <span className="hidden sm:inline">/himanshu</span>
      </Link>
      <span aria-hidden className="font-mono text-line-strong">
        /
      </span>
      <Link href={COURSE_HREF} className="inline-flex min-h-10 items-center py-1 font-display text-xl font-extrabold tracking-[-0.03em] text-fg">
        learn<span className="text-signal-text">.</span>
      </Link>
    </span>
  );
}

/** Desktop course tabs, inline in the header row. */
export function LearnTabs({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Course" className="hidden items-center font-mono text-[13px] lg:flex">
      {tabs(pathname).map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={l.on ? "page" : undefined}
          className={`inline-flex items-center gap-2 whitespace-nowrap px-2.5 py-2.5 ${l.on ? "text-fg shadow-[inset_0_-2px_0_var(--c-signal)]" : "text-fg-3 hover:text-fg"}`}
        >
          {l.label}
          {l.badge && <DueBadge />}
        </Link>
      ))}
    </nav>
  );
}

/** Phone/tablet bottom dock in learn mode: back to the site + the four course tabs. */
export function LearnDock({ pathname, className }: { pathname: string; className: string }) {
  return (
    <nav aria-label="Course" className={className}>
      <Link href="/" className="flex min-h-12 flex-col items-center justify-center gap-1.5 font-mono text-[11px] text-fg-3">
        <span aria-hidden className="h-1.5 leading-none text-[10px]">
          ←
        </span>
        site
      </Link>
      {tabs(pathname).map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={l.on ? "page" : undefined}
          className={`relative flex min-h-12 flex-col items-center justify-center gap-1.5 font-mono text-[11px] ${l.on ? "text-fg" : "text-fg-3"}`}
        >
          <span aria-hidden className={`h-1.5 w-1.5 ${l.on ? "bg-signal" : "bg-transparent"}`} />
          {l.label}
          {l.badge && (
            <span className="absolute right-1 top-0.5">
              <DueBadge compact />
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
