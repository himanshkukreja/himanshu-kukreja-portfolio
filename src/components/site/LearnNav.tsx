"use client";

/**
 * Learn mode for the global SiteHeader. On /learn routes the portfolio nav is swapped for the
 * course's own tabs (one header, not a header plus a sub-nav), and on phones the bottom dock
 * becomes the course dock with a way back to the site.
 */
import Link from "next/link";
import { CloudDownload } from "lucide-react";
import { useReviewCards } from "@/lib/learn/useReviewDue";
import { DockDot, TabPending } from "./LinkPending";

export const COURSE_HREF = "/learn/system-design-mastery";

export const isLearnRoute = (p: string) => p === "/learn" || p.startsWith("/learn/");

/**
 * The Practice tab owns its hub (/learn/practice) and every tool the hub lists: revision decks,
 * cheat sheets, code labs, mock interviews, design of the week, the numbers playground, the study
 * planner, the concept map and the reading trail. Keep in sync with src/components/learn/practice.
 */
export const PRACTICE_ROUTES = ["practice", "revise", "cheatsheet", "labs", "mock", "design-week", "numbers", "plan", "mastery", "reading"] as const;
const PRACTICE_RE = new RegExp(`^/learn/(?:${PRACTICE_ROUTES.join("|")})(?:/|$)`);
export const isPractice = (p: string) => PRACTICE_RE.test(p);

const isCourse = (p: string) => isLearnRoute(p) && !isPractice(p) && !/^\/learn\/(arena|review|notebook|notes|bookmarks|dashboard|guide|offline)(\/|$)/.test(p);

/** The Arena tab also owns the review queue (/learn/review), so the due badge lives on it. */
const isArena = (p: string) => /^\/learn\/(arena|review)(\/|$)/.test(p);

function tabs(pathname: string) {
  return [
    { href: COURSE_HREF, label: "course", on: isCourse(pathname) },
    { href: "/learn/arena", label: "arena", on: isArena(pathname), badge: true },
    { href: "/learn/practice", label: "practice", on: isPractice(pathname) },
    { href: "/learn/notebook", label: "notebook", on: /^\/learn\/(notebook|notes|bookmarks)(\/|$)/.test(pathname) },
    { href: "/learn/dashboard", label: "progress", on: /^\/learn\/dashboard(\/|$)/.test(pathname) },
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
        <span data-wco-compact className="hidden sm:inline">/himanshu</span>
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
          className={`relative inline-flex items-center gap-2 whitespace-nowrap px-2 py-2.5 ${l.on ? "text-fg shadow-[inset_0_-2px_0_var(--c-signal)]" : "text-fg-3 hover:text-fg"}`}
        >
          {l.label}
          {l.badge && <DueBadge />}
          <TabPending />
        </Link>
      ))}
      <Link
        href="/learn/guide"
        aria-current={pathname.startsWith("/learn/guide") ? "page" : undefined}
        aria-label="How the course works"
        title="How the course works"
        className={`ml-1 grid h-7 w-7 place-items-center border text-[12px] ${pathname.startsWith("/learn/guide") ? "border-signal text-signal-text" : "border-line-strong text-fg-3 hover:text-fg"}`}
      >
        ?
      </Link>
      <Link
        href="/learn/offline"
        aria-current={pathname.startsWith("/learn/offline") ? "page" : undefined}
        aria-label="Offline library: save lessons to read without internet"
        title="Offline library: save lessons to read without internet"
        className={`ml-1 grid h-7 w-7 place-items-center border ${pathname.startsWith("/learn/offline") ? "border-signal text-signal-text" : "border-line-strong text-fg-3 hover:text-fg"}`}
      >
        <CloudDownload className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </nav>
  );
}

/**
 * Phone/tablet bottom dock in learn mode: back to the site + the five course tabs. The site link
 * takes a narrower column so "notebook" and "practice" still fit on a 320 px phone (labels drop to
 * 10 px below 360 px).
 */
export function LearnDock({ pathname, className }: { pathname: string; className: string }) {
  return (
    <nav aria-label="Course" className={`${className} grid-cols-[minmax(0,0.7fr)_repeat(5,minmax(0,1fr))] max-[359px]:gap-0.5 max-[359px]:px-1.5 max-[359px]:[&>a]:text-[10px]`}>
      <Link href="/" aria-label="Back to the site" className="flex min-h-12 flex-col items-center justify-center gap-1.5 font-mono text-[11px] text-fg-3">
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
          className={`relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-1.5 whitespace-nowrap font-mono text-[11px] ${l.on ? "text-fg" : "text-fg-3"}`}
        >
          <DockDot on={l.on} />
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
