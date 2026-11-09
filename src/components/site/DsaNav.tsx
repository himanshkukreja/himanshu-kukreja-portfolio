"use client";

/**
 * DSA Mastery mode for the global SiteHeader: on /dsa and everything under it the header is DSA Mastery's own bar (one
 * bar, no sub-nav), a sibling of SD Mastery's: the index mark and "DSA Mastery." wordmark, the BETA (or SOON) tag,
 * a course switcher back to System Design Mastery, and DSA's tabs; on phones the bottom dock carries DSA's tabs.
 * The shared right side (search, level, theme, account) stays in SiteHeader. Paths are clean course paths.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Code2, FileText, Layers, Map as MapIcon, Play, Sparkles, User, type LucideIcon } from "lucide-react";
import { DSA_FULL } from "@/lib/dsa/flags";
import { openCourseChat } from "@/components/learn/chat/openChat";
import { DsaMark } from "@/components/dsa/DsaMark";
import CourseMark from "./CourseMark";
import AdminLink from "./AdminLink";
import { DockDot, TabPending } from "./LinkPending";

export const DSA_HOME = "/dsa";

type Tab = {
  id: string;
  /** a link, or (ask, before launch) a button that opens the course tutor's panel in place */
  href?: string;
  label: string;
  /** the phone dock's label */
  short: string;
  on: boolean;
  icon: LucideIcon | "sdm";
  primary?: boolean;
  /** where it shows: desktop tab row, phone dock, or both */
  where: "both" | "dock" | "desk";
  /** desktop tabs that only fit from xl (1280 px) up; between lg and xl the hub links them */
  wide?: boolean;
};

/**
 * Staging (full): world map (the hub and the concept rooms) · problems · lectures · shorts · cheat sheets (desktop) · ask, plus on phones
 * "you" and the way back to SD Mastery. Production until launch (soon): the coming-soon page, ask, you, SD Mastery.
 */
function tabs(p: string): Tab[] {
  // DSA Mastery's tutor page (staging); before launch "ask" opens the course tutor's panel (no /dsa/ask in "soon" mode)
  const ask: Tab = { id: "ask", ...(DSA_FULL ? { href: `${DSA_HOME}/ask` } : {}), label: "ask", short: "ask", on: p.startsWith(`${DSA_HOME}/ask`), icon: Sparkles, primary: true, where: "both" };
  const you: Tab = { id: "you", href: "/dashboard", label: "you", short: "you", on: false, icon: User, where: "dock" };
  const sdm: Tab = { id: "sdm", href: "/", label: "SD Mastery", short: "sdm", on: false, icon: "sdm", where: "dock" };
  if (!DSA_FULL) return [{ id: "soon", href: DSA_HOME, label: "coming soon", short: "dsa", on: p === DSA_HOME || p === `${DSA_HOME}/`, icon: MapIcon, where: "both" }, ask, you, sdm];
  return [
    { id: "map", href: DSA_HOME, label: "world map", short: "map", on: p === DSA_HOME || p === `${DSA_HOME}/` || (p.startsWith(`${DSA_HOME}/concepts/`) && !/\/lecture\/?$/.test(p)), icon: MapIcon, where: "both" },
    { id: "problems", href: `${DSA_HOME}/problems`, label: "problems", short: "problems", on: p.startsWith(`${DSA_HOME}/problems`), icon: Code2, where: "both" },
    // desktop only: the phone dock has no free slot (the hub and the concept pages link them there)
    { id: "lectures", href: `${DSA_HOME}/lectures`, label: "lectures", short: "lectures", on: p.startsWith(`${DSA_HOME}/lectures`) || /^\/dsa\/concepts\/[^/]+\/lecture/.test(p), icon: Play, where: "desk" },
    { id: "revise", href: `${DSA_HOME}/revise`, label: "revise", short: "revise", on: p.startsWith(`${DSA_HOME}/revise`), icon: Layers, where: "desk", wide: true },
    { id: "shorts", href: `${DSA_HOME}/shorts`, label: "shorts", short: "shorts", on: p.startsWith(`${DSA_HOME}/shorts`), icon: Play, where: "desk", wide: true },
    { id: "sheets", href: `${DSA_HOME}/cheatsheets`, label: "cheat sheets", short: "sheets", on: p.startsWith(`${DSA_HOME}/cheatsheets`), icon: FileText, where: "desk", wide: true },
    ask,
    you,
    sdm,
  ];
}

const COURSES = [
  { id: "sdm", href: "/", name: "System Design Mastery", line: "Systems, interviews and the arena" },
  { id: "dsa", href: DSA_HOME, name: "DSA Mastery", line: "Data structures and algorithms" },
] as const;

/** The switcher's menu: both courses, this one ticked. Closes on a pick, Escape, a click outside or a route change. */
function CourseSwitch({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }
  const ref = useRef<HTMLDivElement>(null);
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
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch course"
        title="Switch course"
        className={`grid h-8 w-7 place-items-center border ${open ? "border-signal text-signal-text" : "border-line-strong text-fg-3 hover:text-fg"}`}
      >
        <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Courses" className="absolute left-0 top-[calc(100%+12px)] z-50 flex w-[min(320px,calc(100vw-32px))] animate-hk-in flex-col border border-line-strong bg-surface p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.18)] max-[379px]:-left-9">
          <span className="px-2.5 pb-1.5 pt-1 font-mono text-[11px] uppercase tracking-label text-fg-3">Your courses · one account</span>
          {COURSES.map((c) => {
            const here = c.id === "dsa";
            return (
              <Link
                key={c.id}
                href={c.href}
                role="menuitem"
                aria-current={here ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`flex min-h-14 items-center gap-3 px-2.5 py-2 ${here ? "bg-surface-2" : "hover:bg-surface-2"}`}
              >
                {c.id === "sdm" ? <CourseMark className="h-8 w-8" /> : <DsaMark className="h-8 w-8" />}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-display text-[16px] font-bold leading-tight tracking-[-0.02em] text-fg">{c.name}</span>
                  <span className="text-[12.5px] leading-snug text-fg-3">{c.line}</span>
                </span>
                {here && <Check className="h-4 w-4 shrink-0 text-signal-text" aria-label="this course" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The DSA brand: the index mark + "DSA Mastery." (the mark alone under 380 px, like SD Mastery's), the tag, the switcher. */
export function DsaBrand({ pathname }: { pathname: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1 min-[400px]:gap-2 sm:gap-2.5">
      <Link href={DSA_HOME} aria-label="DSA Mastery, course home" className="inline-flex min-h-10 shrink-0 items-center gap-2 py-1 font-display text-lg font-extrabold tracking-[-0.03em] text-fg sm:text-xl">
        <DsaMark className="h-7 w-7" />
        <span aria-hidden className="whitespace-nowrap max-[379px]:hidden">
          DSA Mastery<span className="text-signal-text">.</span>
        </span>
      </Link>
      <span className="hidden border border-signal px-1.5 py-px font-mono text-[10px] font-semibold uppercase tracking-label text-signal-text sm:inline">{DSA_FULL ? "beta" : "soon"}</span>
      <CourseSwitch pathname={pathname} />
    </div>
  );
}

const tabClass = (on: boolean) => `relative inline-flex items-center gap-2 whitespace-nowrap px-2 py-2.5 ${on ? "text-fg shadow-[inset_0_-2px_0_var(--c-signal)]" : "text-fg-3 hover:text-fg"}`;

/** Desktop DSA tabs, inline in the header row. */
export function DsaTabs({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="DSA Mastery" className="hidden items-center font-mono text-[13px] lg:flex">
      {tabs(pathname)
        .filter((t) => t.where !== "dock")
        .map((t) =>
          t.href ? (
            <Link key={t.id} href={t.href} aria-current={t.on ? "page" : undefined} className={`${tabClass(t.on)}${t.wide ? " max-xl:!hidden" : ""}`}>
              {t.primary && <Sparkles className="h-3.5 w-3.5 text-signal-text" aria-hidden />}
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

/**
 * Phone/tablet bottom dock on DSA pages: DSA's tabs in LearnDock's shape (an icon over a short mono label, "ask" the
 * filled square in the middle, 52 px rows). Fewer tabs than the course dock, so labels keep 10.5 px down to 360 px and
 * 10 px below it; "problems" is the longest and fits a fifth of 320 px.
 */
export function DsaDock({ pathname, className }: { pathname: string; className: string }) {
  const list = tabs(pathname).filter((t) => t.where !== "desk");
  const cols = list.length === 5 ? "grid-cols-5" : "grid-cols-4";
  const item = (on: boolean) =>
    `relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-[5px] whitespace-nowrap font-mono text-[10.5px] leading-none max-[359px]:text-[10px] max-[359px]:tracking-[-0.03em] ${on ? "text-fg" : "text-fg-3"}`;
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
              <I className={`h-[18px] w-[18px] ${t.on ? "text-signal-text" : ""}`} strokeWidth={t.on ? 2.25 : 1.75} />
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
    </nav>
  );
}
