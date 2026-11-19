"use client";

/**
 * DSA Mastery mode for the global SiteHeader: on /dsa and everything under it the header is DSA Mastery's own bar (one
 * bar, no sub-nav), a sibling of SD Mastery's: the index mark and "DSA Mastery." wordmark, the BETA (or SOON) tag, and
 * four tabs (Course, Practice, Review, Progress); on phones the bottom dock carries the same four. The course switch
 * ("System design ⇄ DSA"), search, Ask, theme and account sit on the right (SiteHeader). Paths are clean course paths.
 * Redesign Phase 1 (16 Nov 2026): the old "more" menu and the simple/full views are gone; the "on" rules are the build
 * spec's §2.1.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BarChart3, Check, ChevronsUpDown, Code2, Layers, Map as MapIcon, AlignLeft, Sparkles, SquareTerminal, User, type LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DSA_FULL, isDsaProblemRoom, isDsaReaderPath } from "@/lib/dsa/flags";
import { openCourseChat } from "@/components/learn/chat/openChat";
import { DsaMark } from "@/components/dsa/DsaMark";
import CourseMark from "./CourseMark";
import AdminLink from "./AdminLink";
import { DockDot, TabPending } from "./LinkPending";

export const DSA_HOME = "/dsa";

type Tab = {
  id: string;
  href?: string;
  label: string;
  /** the phone dock's label */
  short: string;
  on: boolean;
  icon: LucideIcon | "sdm";
  /** where it shows: desktop tab row, phone dock, or both */
  where: "both" | "dock" | "desk";
  primary?: boolean;
};

const at = (p: string, ...bases: string[]) => bases.some((b) => p === b || p.startsWith(`${b}/`));

/**
 * The four DSA tabs and where each is "on" (build spec §2.1): Course for the home and every lesson (and its lecture),
 * Practice for the bank and every problem, Review for shorts, cheat sheets, complexity and the patterns A-Z, Progress for
 * the belt, stats and certificates. Production until launch (soon): the coming-soon page, ask, you, SD Mastery.
 */
export function tabs(p: string): Tab[] {
  if (!DSA_FULL) {
    const ask: Tab = { id: "ask", label: "ask", short: "ask", on: false, icon: Sparkles, primary: true, where: "both" };
    const you: Tab = { id: "you", href: "/dashboard", label: "you", short: "you", on: false, icon: User, where: "dock" };
    const sdm: Tab = { id: "sdm", href: "/", label: "SD Mastery", short: "sdm", on: false, icon: "sdm", where: "dock" };
    return [{ id: "soon", href: DSA_HOME, label: "coming soon", short: "dsa", on: p === DSA_HOME || p === `${DSA_HOME}/`, icon: MapIcon, where: "both" }, ask, you, sdm];
  }
  return [
    { id: "course", href: DSA_HOME, label: "Course", short: "Course", on: p === DSA_HOME || at(p, "/dsa/concepts", "/dsa/structures", "/dsa/algorithms", "/dsa/districts", "/dsa/camps", "/dsa/sets/core-150-gaps"), icon: AlignLeft, where: "both" },
    { id: "practice", href: `${DSA_HOME}/practice`, label: "Practice", short: "Practice", on: at(p, "/dsa/practice", "/dsa/problems") || (at(p, "/dsa/sets") && !at(p, "/dsa/sets/core-150-gaps")), icon: Code2, where: "both" },
    { id: "review", href: `${DSA_HOME}/review`, label: "Review", short: "Review", on: at(p, "/dsa/review", "/dsa/shorts", "/dsa/cheatsheets", "/dsa/complexity", "/dsa/patterns"), icon: Layers, where: "both" },
    { id: "progress", href: `${DSA_HOME}/progress`, label: "Progress", short: "Progress", on: at(p, "/dsa/progress", "/dsa/certificate", "/dsa/cert"), icon: BarChart3, where: "both" },
    { id: "playground", href: `${DSA_HOME}/playground`, label: "Playground", short: "Code", on: at(p, "/dsa/playground"), icon: SquareTerminal, where: "both" },
  ];
}

const COURSES = [
  { id: "sdm", href: "/", name: "System Design Mastery", line: "Systems, interviews and the arena" },
  { id: "dsa", href: DSA_HOME, name: "DSA Mastery", line: "Data structures and algorithms" },
] as const;

/**
 * The course switch, "System design ⇄ DSA": the pill at xl, an icon button below (it stays in the header down to 400 px;
 * under that the account menu's "course" link and the logo take over). The menu lists both courses, this one ticked, and
 * closes on a pick, Escape, a click outside or a route change.
 */
export function CourseSwitch({ pathname, from = "dsa", dot = false }: { pathname: string; from?: "sdm" | "dsa"; dot?: boolean }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }
  const ref = useRef<HTMLDivElement>(null);
  // SD Mastery's header (from="sdm") is the busier row (seven tabs, search, level chip): it keeps the icon button at every width
  const sdm = from === "sdm";
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    // below 400 px the header has no room: the signed-in avatar menu has "course" (the way back to System Design Mastery)
    <div ref={ref} className="relative hidden shrink-0 min-[400px]:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch course"
        title="Switch course"
        className={`inline-flex h-[38px] shrink-0 items-center justify-center gap-2 rounded-full border font-mono text-[12px] min-[400px]:w-[38px] ${sdm ? "" : "xl:w-auto xl:px-3"} ${open ? "border-signal text-signal-text" : "border-line text-fg-3 hover:text-fg"}`}
      >
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {!sdm && <span className="hidden whitespace-nowrap xl:inline">System design ⇄ DSA</span>}
        {dot && (
          <>
            <span aria-hidden data-new-dot className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-signal ring-2 ring-bg" />
            <span className="sr-only">New: DSA Mastery</span>
          </>
        )}
      </button>
      {open && (
        <div role="menu" aria-label="Courses" className="absolute right-0 top-[calc(100%+12px)] z-50 flex w-[min(320px,calc(100vw-32px))] animate-hk-in flex-col rounded-2xl border border-line bg-surface p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
          <span className="px-2.5 pb-1.5 pt-1 font-mono text-[11px] uppercase tracking-label text-fg-3">Your courses · one account</span>
          {COURSES.map((c) => {
            const here = c.id === from;
            return (
              <Link
                key={c.id}
                href={c.href}
                role="menuitem"
                aria-current={here ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`flex min-h-14 items-center gap-3 rounded-xl px-2.5 py-2 ${here ? "bg-surface-2" : "hover:bg-surface-2"}`}
              >
                {c.id === "sdm" ? <CourseMark className="h-8 w-8" /> : <DsaMark className="h-8 w-8" />}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-display text-[16px] font-bold leading-tight tracking-[-0.02em] text-fg">{c.name}</span>
                  <span className="text-[12.5px] leading-snug text-fg-3">{c.line}</span>
                </span>
                {here && <Check className="h-4 w-4 shrink-0 text-signal-text" aria-label="this course" />}
                {dot && c.id === "dsa" && <span className="shrink-0 rounded-full border border-signal px-2 py-px font-mono text-[10px] font-semibold uppercase tracking-label text-signal-text">new</span>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The DSA brand: the index mark + "DSA Mastery." (the mark alone under 380 px, like SD Mastery's) and the tag. */
export function DsaBrand() {
  return (
    <div className="flex shrink-0 items-center gap-1 min-[400px]:gap-2 sm:gap-2.5">
      <Link href={DSA_HOME} aria-label="DSA Mastery, course home" className="inline-flex min-h-10 shrink-0 items-center gap-2 py-1 font-display text-lg font-extrabold tracking-[-0.03em] text-fg sm:text-xl">
        <DsaMark className="h-[22px] w-[22px] sm:h-6 sm:w-6" />
        <span aria-hidden className="whitespace-nowrap text-[18px] max-[379px]:hidden sm:text-[20px]">
          DSA Mastery<span className="text-signal-text">.</span>
        </span>
      </Link>
      <span className="hidden rounded-full border border-signal px-2 py-px font-mono text-[10px] font-semibold uppercase tracking-label text-signal-text sm:inline">{DSA_FULL ? "beta" : "soon"}</span>
    </div>
  );
}

const tabClass = (on: boolean) => `relative inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 ${on ? "bg-surface-2 text-fg" : "text-fg-3 hover:bg-surface-2 hover:text-fg"}`;

/** Desktop DSA tabs, inline in the header row: Course, Practice, Review, Progress (Geist 14/500 pills, the open one filled). */
export function DsaTabs({ pathname }: { pathname: string }) {
  const desk = tabs(pathname).filter((t) => t.where !== "dock");
  return (
    <nav aria-label="DSA Mastery" className="ml-3 hidden items-center gap-1 text-[14px] font-medium lg:flex xl:ml-5">
      {desk.map((t) =>
        t.href ? (
          <Link key={t.id} href={t.href} aria-current={t.on ? "page" : undefined} className={tabClass(t.on)}>
            {t.label}
            <TabPending />
          </Link>
        ) : (
          <button key={t.id} type="button" onClick={() => openCourseChat()} aria-label="Ask the course tutor" title="Ask the course tutor" className={tabClass(false)}>
            <Sparkles className="h-3.5 w-3.5 text-signal-text" aria-hidden />
            {t.label}
          </button>
        ),
      )}
      <AdminLink variant="tab" />
    </nav>
  );
}

/** "Ask the tutor" in the header (full mode): the tutor panel (ChatPanel course="dsa") opens beside the page. An icon below xl. */
export function DsaAsk() {
  if (!DSA_FULL) return null;
  return (
    <button
      type="button"
      onClick={() => openCourseChat()}
      aria-label="Ask the tutor"
      title="Ask the tutor"
      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-line bg-surface px-2.5 text-[13px] font-medium text-fg hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text min-[400px]:px-3.5"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-signal-text" aria-hidden />
      <span className="hidden sm:inline xl:hidden">Ask</span>
      <span className="hidden xl:inline">Ask the tutor</span>
    </button>
  );
}

/**
 * Phone/tablet bottom dock on DSA pages: the four tabs in LearnDock's shape (an icon over a short mono label, 52 px rows).
 * Hidden on lesson and problem pages: they carry their own sticky step footer (and the header's Ask replaces the dock's).
 */
export function DsaDock({ pathname, className }: { pathname: string; className: string }) {
  const list = tabs(pathname).filter((t) => t.where !== "desk");
  const hide = DSA_FULL && (isDsaReaderPath(pathname) || isDsaProblemRoom(pathname));
  const { user, loading } = useAuth();
  // below 400 px the header drops the course switch and a guest has no account menu: a fifth dock item is the way back to SD Mastery
  const guestSwitch = !user && !loading && DSA_FULL;
  const cols = guestSwitch ? (list.length === 5 ? "grid-cols-6 min-[400px]:grid-cols-5" : "grid-cols-5 min-[400px]:grid-cols-4") : list.length === 5 ? "grid-cols-5" : "grid-cols-4";
  const item = (on: boolean) =>
    `relative flex min-h-[54px] min-w-0 flex-col items-center justify-center gap-[5px] whitespace-nowrap text-[12px] leading-none max-[359px]:text-[11px] max-[359px]:tracking-[-0.02em] ${on ? "font-semibold text-signal-text" : "font-medium text-fg-3"}`;
  if (hide) return null;
  return (
    <nav aria-label="DSA Mastery" className={`${className} ${cols} !gap-0 !px-1.5 max-[359px]:!px-1`}>
      {list.map((t) => {
        const I = t.icon;
        const icon =
          I === "sdm" ? (
            <span aria-hidden className="grid h-[22px] w-[22px] place-items-center">
              <CourseMark className="h-[18px] w-[18px]" />
            </span>
          ) : t.primary ? (
            <span aria-hidden className="grid h-[22px] w-[22px] place-items-center bg-signal text-on-signal">
              <I className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span aria-hidden className="grid h-[22px] w-[22px] place-items-center">
              <I className="h-5 w-5" strokeWidth={t.on ? 2.25 : 1.75} />
            </span>
          );
        if (!t.href)
          return (
            <button key={t.id} type="button" onClick={() => openCourseChat()} aria-label="Ask the course tutor" className={item(false)}>
              {icon}
              {t.short}
            </button>
          );
        return (
          <Link key={t.id} href={t.href} aria-current={t.on ? "page" : undefined} aria-label={t.id === "sdm" ? "System Design Mastery" : undefined} className={item(t.on)}>
            <span className="absolute left-1/2 top-0 -translate-x-1/2">
              <DockDot on={t.on} />
            </span>
            {icon}
            {t.short}
          </Link>
        );
      })}
      {guestSwitch ? (
        <Link href="/" aria-label="System design course" className={`${item(false)} min-[400px]:hidden`}>
          <span aria-hidden className="grid h-[22px] w-[22px] place-items-center">
            <CourseMark className="h-[18px] w-[18px]" />
          </span>
          SD course
        </Link>
      ) : null}
    </nav>
  );
}
