"use client";

/**
 * Learn mode for the global SiteHeader. On /learn routes the portfolio nav is swapped for the
 * course's own tabs (one header, not a header plus a sub-nav), and on phones the bottom dock
 * becomes the course dock with a way back to the site.
 */
import Link from "next/link";
import { BookOpen, Briefcase, CloudDownload, Flame, Smartphone, Sparkles, Swords, User, type LucideIcon } from "lucide-react";
import { useReviewCards } from "@/lib/learn/useReviewDue";
import { DockDot, TabPending } from "./LinkPending";

export const COURSE_HREF = "/learn/system-design-mastery";

export const isLearnRoute = (p: string) => p === "/learn" || p.startsWith("/learn/");

/**
 * Seven tabs, one question each:
 *   course  · learn it    the course hub, lessons, side quests, concepts A–Z, the reading trail
 *   prep    · get hired   companies, the question bank, problem bank + low-level design, mock interviews,
 *                         revision decks, cheat and design sheets, code labs, numbers, the study planner
 *   arena   · play        daily challenge, leagues, games, the review queue, design of the week
 *   ask     · ask it      the course tutor (chat) with instant search, /learn/chat; the middle tab
 *   shorts  · watch it   2-3 minute vertical shorts of everything, one idea each
 *   stories · see it real real stories and the war room
 *   you     · your stuff  progress, notebook, bookmarks, saved paths, the tutor's memory, concept mastery, certificates
 * Keep in sync with the Prep hub (src/components/learn/prep) and the You sub-nav (src/components/learn/you).
 */
export const PREP_ROUTES = ["prep", "practice", "revise", "cheatsheet", "sheets", "labs", "mock", "numbers", "plan", "tracks", "canvas", "podcast"] as const;
const PREP_RE = new RegExp(`^/learn/(?:${PREP_ROUTES.join("|")})(?:/|$)`);
/** the problem bank and the low-level design track are lessons, but they belong to interview prep */
const PREP_LESSON_RE = /^\/learn\/[^/]+\/(?:problem-bank|low-level-design)\//;
export const isPrep = (p: string) => PREP_RE.test(p) || PREP_LESSON_RE.test(p);

const isArena = (p: string) => /^\/learn\/(arena|review|design-week)(\/|$)/.test(p);
const isStories = (p: string) => /^\/learn\/war-stories(\/|$)/.test(p);
const isShorts = (p: string) => /^\/learn\/shorts(\/|$)/.test(p);
export const YOU_ROUTES = ["dashboard", "notebook", "notes", "bookmarks", "saved", "memory", "mastery", "certificate"] as const;
const isYou = (p: string) => new RegExp(`^/learn/(?:${YOU_ROUTES.join("|")})(?:/|$)`).test(p);
const isCourse = (p: string) => isLearnRoute(p) && !isPrep(p) && !isArena(p) && !isStories(p) && !isShorts(p) && !isYou(p) && !/^\/learn\/(guide|offline|chat|search)(\/|$)/.test(p);

const isAsk = (p: string) => /^\/learn\/(chat|search)(\/|$)/.test(p);

type Tab = { href: string; label: string; on: boolean; icon: LucideIcon; badge?: boolean; primary?: boolean };
function tabs(pathname: string): Tab[] {
  return [
    { href: COURSE_HREF, label: "course", on: isCourse(pathname), icon: BookOpen },
    { href: "/learn/prep", label: "prep", on: isPrep(pathname), icon: Briefcase },
    { href: "/learn/arena", label: "arena", on: isArena(pathname), icon: Swords, badge: true },
    { href: "/learn/chat", label: "ask", on: isAsk(pathname), icon: Sparkles, primary: true },
    { href: "/learn/shorts", label: "shorts", on: isShorts(pathname), icon: Smartphone },
    { href: "/learn/war-stories", label: "stories", on: isStories(pathname), icon: Flame },
    { href: "/learn/dashboard", label: "you", on: isYou(pathname), icon: User },
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
          {l.primary && <Sparkles className="h-3.5 w-3.5 text-signal-text" aria-hidden />}
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
 * Phone/tablet bottom dock in learn mode: a narrow "~" back to the site, then the seven course tabs on one
 * row, each an icon over a short mono label. "ask" sits in the middle as a filled square (the tutor).
 * Sized for 320 px: the site column is 26 px, there are no gaps, and labels drop to 9.5 px with tighter
 * tracking below 360 px so "stories" fits; 10 px up to 400 px, 10.5 px above.
 */
export function LearnDock({ pathname, className }: { pathname: string; className: string }) {
  return (
    <nav aria-label="Course" className={`${className} grid-cols-[26px_repeat(7,minmax(0,1fr))] !gap-0 !px-1.5 max-[359px]:!px-1`}>
      <Link href="/" aria-label="Back to the site" title="Back to the site" className="flex min-h-[52px] items-center justify-center font-mono text-[15px] font-semibold text-fg-3">
        <span aria-hidden>~</span>
      </Link>
      {tabs(pathname).map((l) => {
        const I = l.icon;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={l.on ? "page" : undefined}
            className={`relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-[5px] whitespace-nowrap font-mono text-[10.5px] leading-none max-[399px]:text-[10px] max-[359px]:text-[9.5px] max-[359px]:tracking-[-0.04em] ${l.on ? "text-fg" : "text-fg-3"}`}
          >
            <span className="absolute left-1/2 top-0 -translate-x-1/2">
              <DockDot on={l.on} />
            </span>
            {l.primary ? (
              <span aria-hidden className={`grid h-[22px] w-[22px] place-items-center ${l.on ? "bg-signal text-on-signal" : "bg-signal/90 text-on-signal"}`}>
                <I className="h-3.5 w-3.5" />
              </span>
            ) : (
              <span aria-hidden className="grid h-[22px] w-[22px] place-items-center">
                <I className={`h-[18px] w-[18px] ${l.on ? "text-signal-text" : ""}`} strokeWidth={l.on ? 2.25 : 1.75} />
              </span>
            )}
            {l.label}
            {l.badge && (
              <span className="absolute right-0.5 top-0.5">
                <DueBadge compact />
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
