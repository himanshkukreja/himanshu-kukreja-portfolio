"use client";

/**
 * Course mode for the global SiteHeader. On the course host (systemdesignmastery.dev) the header
 * carries the course's own tabs (one header, not a header plus a sub-nav), and on phones the bottom
 * dock is the course dock with a way to the portfolio. Paths here are clean course paths
 * (src/lib/learn/paths.ts; SiteHeader passes useCoursePathname()).
 */
import Link from "next/link";
import { BookOpen, Boxes, Briefcase, CloudDownload, Flame, Smartphone, Sparkles, Swords, User, type LucideIcon } from "lucide-react";
import { useReviewCards } from "@/lib/learn/useReviewDue";
import { DockDot, TabPending } from "./LinkPending";
import AdminLink from "./AdminLink";
import { portfolioUrl } from "@/lib/site/hosts";
import CourseMark from "./CourseMark";

export const COURSE_HREF = "/";

/**
 * Seven tabs, one question each:
 *   course  · learn it    the course hub, lessons, side quests, concepts A–Z, the reading trail
 *   prep    · get hired   companies, the question bank, problem bank + low-level design, mock interviews,
 *                         revision decks, cheat and design sheets, code labs, numbers, the study planner
 *   arena   · play        daily challenge, leagues, games, the review queue, design of the week
 *   ask     · ask it      the course tutor (chat) with instant search, /chat; the middle tab
 *   shorts  · watch it   2-3 minute vertical shorts of everything, one idea each
 *   stories · see it real real stories and the war room
 *   you     · your stuff  progress, notebook, bookmarks, saved paths, the tutor's memory, concept mastery, certificates
 * Keep in sync with the Prep hub (src/components/learn/prep) and the You sub-nav (src/components/learn/you).
 */
export const PREP_ROUTES = ["prep", "practice", "revise", "cheatsheet", "sheets", "labs", "mock", "numbers", "plan", "tracks", "canvas", "podcast"] as const;
const PREP_RE = new RegExp(`^/(?:${PREP_ROUTES.join("|")})(?:/|$)`);
/** the problem bank belongs to interview prep */
const PREP_LESSON_RE = /^\/problem-bank\//;
export const isPrep = (p: string) => PREP_RE.test(p) || PREP_LESSON_RE.test(p);
/** the low-level design track has its own tab (owner, 11 Nov 2026): its home, the design patterns and the case studies */
const isLld = (p: string) => /^\/low-level-design(\/|$)/.test(p);

const isArena = (p: string) => /^\/(arena|review|design-week)(\/|$)/.test(p);
const isStories = (p: string) => /^\/war-stories(\/|$)/.test(p);
const isShorts = (p: string) => /^\/shorts(\/|$)/.test(p);
export const YOU_ROUTES = ["dashboard", "notebook", "notes", "bookmarks", "saved", "memory", "mastery", "certificate"] as const;
const isYou = (p: string) => new RegExp(`^/(?:${YOU_ROUTES.join("|")})(?:/|$)`).test(p);
/** the course tab: the hub, lessons, side quests, concepts, the reading trail, case files… everything not under another tab */
const isCourse = (p: string) => !isPrep(p) && !isLld(p) && !isArena(p) && !isStories(p) && !isShorts(p) && !isYou(p) && !/^\/(guide|offline|chat|search|privacy|cert|u)(\/|$)/.test(p);

const isAsk = (p: string) => /^\/(chat|search)(\/|$)/.test(p);

// dock: false keeps a tab out of the phone dock (its 7 columns are full); phones reach it from the course home
type Tab = { href: string; label: string; on: boolean; icon: LucideIcon; badge?: boolean; primary?: boolean; dock?: false };
function tabs(pathname: string): Tab[] {
  return [
    { href: COURSE_HREF, label: "course", on: isCourse(pathname), icon: BookOpen },
    { href: "/prep", label: "prep", on: isPrep(pathname), icon: Briefcase },
    { href: "/low-level-design", label: "lld", on: isLld(pathname), icon: Boxes, dock: false },
    { href: "/arena", label: "arena", on: isArena(pathname), icon: Swords, badge: true },
    { href: "/chat", label: "ask", on: isAsk(pathname), icon: Sparkles, primary: true },
    { href: "/shorts", label: "shorts", on: isShorts(pathname), icon: Smartphone },
    { href: "/war-stories", label: "stories", on: isStories(pathname), icon: Flame },
    { href: "/dashboard", label: "you", on: isYou(pathname), icon: User },
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

/**
 * The course brand: the diagram mark + "SD Mastery." (the mark alone under 380 px). The full name doesn't fit: on
 * tablets the signed-in row (Admin button, avatar) has no spare room, and from 1024 px the tabs share the row inside
 * its 1320 px cap; it overflowed both and scrolled the page sideways. The portfolio is one tap away in the
 * phone dock ("~") and the account menu.
 */
export function LearnBrand() {
  return (
    <Link href={COURSE_HREF} aria-label="System Design Mastery, course home" className="inline-flex min-h-10 shrink-0 items-center gap-2 py-1 font-display text-lg font-extrabold tracking-[-0.03em] text-fg sm:text-xl">
      <CourseMark className="h-7 w-7" />
      <span aria-hidden className="whitespace-nowrap max-[379px]:hidden">
        SD Mastery<span className="text-signal-text">.</span>
      </span>
    </Link>
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
      {/* the second course (coming soon in production, the full hub on staging); from xl only, where the row has room.
          Phones and narrower desktops reach it from the course hub's "Beyond the course" card. */}
      <Link
        href="/dsa"
        aria-current={pathname === "/dsa" || pathname.startsWith("/dsa/") ? "page" : undefined}
        title="DSA Mastery: the data structures and algorithms course"
        className={`dsa-theme relative hidden items-center gap-1.5 whitespace-nowrap px-2 py-2.5 xl:inline-flex ${pathname === "/dsa" || pathname.startsWith("/dsa/") ? "text-fg shadow-[inset_0_-2px_0_var(--c-signal)]" : "text-fg-3 hover:text-fg"}`}
      >
        dsa
        <span aria-label="new" className="h-1.5 w-1.5 bg-signal" />
        <TabPending />
      </Link>
      <Link
        href="/guide"
        aria-current={pathname.startsWith("/guide") ? "page" : undefined}
        aria-label="How the course works"
        title="How the course works"
        className={`ml-1 grid h-7 w-7 place-items-center border text-[12px] ${pathname.startsWith("/guide") ? "border-signal text-signal-text" : "border-line-strong text-fg-3 hover:text-fg"}`}
      >
        ?
      </Link>
      <Link
        href="/offline"
        aria-current={pathname.startsWith("/offline") ? "page" : undefined}
        aria-label="Offline library: save lessons to read without internet"
        title="Offline library: save lessons to read without internet"
        className={`ml-1 grid h-7 w-7 place-items-center border ${pathname.startsWith("/offline") ? "border-signal text-signal-text" : "border-line-strong text-fg-3 hover:text-fg"}`}
      >
        <CloudDownload className="h-3.5 w-3.5" aria-hidden />
      </Link>
      <AdminLink variant="tab" />
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
      <a href={portfolioUrl("/")} aria-label="Himanshu Kukreja, the portfolio" title="Himanshu Kukreja, the portfolio" className="flex min-h-[52px] items-center justify-center font-mono text-[15px] font-semibold text-fg-3">
        <span aria-hidden>~</span>
      </a>
      {tabs(pathname).filter((l) => l.dock !== false).map((l) => {
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
