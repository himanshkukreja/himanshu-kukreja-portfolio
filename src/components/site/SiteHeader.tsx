"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import AuthButton from "@/components/AuthButton";
import { useGame } from "@/game/GameProvider";
import { BADGES, MAIN_QUESTS, levelProgress } from "@/game/catalog";

const NAV = [
  { href: "/#career", label: "career", match: (p: string) => p === "/" },
  { href: "/projects", label: "projects", match: (p: string) => p.startsWith("/projects") },
  { href: "/play", label: "play", match: (p: string) => p.startsWith("/play") },
  { href: "/stories", label: "case-files", match: (p: string) => p.startsWith("/stories") },
  { href: "/learn", label: "learn", match: (p: string) => p.startsWith("/learn") },
  { href: "/#contact", label: "POST /hire", match: () => false },
];

const DOCK = [
  { href: "/", label: "home", match: (p: string) => p === "/" },
  { href: "/projects", label: "projects", match: (p: string) => p.startsWith("/projects") },
  { href: "/play", label: "play", match: (p: string) => p.startsWith("/play") },
  { href: "/stories", label: "cases", match: (p: string) => p.startsWith("/stories") },
  { href: "/learn", label: "learn", match: (p: string) => p.startsWith("/learn") },
];

// /learn/<course>/<week>/<slug>
const isLessonRoute = (p: string) => /^\/learn\/[^/]+\/[^/]+\/[^/]+/.test(p);

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // true on the client, false during SSR — avoids a theme-icon hydration mismatch
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const dark = !mounted || resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="grid h-10 w-10 place-items-center border border-line-strong text-fg hover:bg-surface-2"
    >
      {dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
    </button>
  );
}

function QuestLog({ onClose }: { onClose: () => void }) {
  const { done, reset } = useGame();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);
  const doneCount = MAIN_QUESTS.filter((q) => done[q.id]).length;
  return (
    <div ref={ref} className="absolute right-4 top-[calc(100%+8px)] z-50 flex w-[min(380px,calc(100vw-32px))] animate-hk-in flex-col gap-3.5 border border-line-strong bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[15px] font-semibold">$ cat quests.todo</span>
        <span className="font-mono text-xs text-fg-3">
          {doneCount}/{MAIN_QUESTS.length} done
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {MAIN_QUESTS.map((q) => {
          const d = !!done[q.id];
          return (
            <li key={q.id} className={`flex items-center gap-3 border px-3 py-2.5 ${d ? "border-signal text-fg" : "border-line text-fg-2"}`}>
              <span className={`grid h-5 w-5 place-items-center text-[13px] font-bold ${d ? "bg-signal text-on-signal" : "border border-line-strong"}`}>{d ? "✓" : ""}</span>
              <span className="flex-1 text-sm">{q.label}</span>
              <span className="font-mono text-xs text-signal-text">+{q.xp}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-1.5">
        {BADGES.map((b) => {
          const got = b.earned(done);
          return (
            <span key={b.id} title={b.how} className={`px-2 py-1 font-mono text-[11px] ${got ? "bg-signal text-on-signal" : "border border-dashed border-line-strong text-fg-4"}`}>
              {b.name}
            </span>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs leading-relaxed text-fg-3">Guest XP lives in this browser. Sign in and it follows you into the course.</span>
        <button type="button" onClick={reset} className="shrink-0 border border-line px-2.5 py-1.5 font-mono text-[11px] text-fg-3 hover:text-fg">
          git reset --hard
        </button>
      </div>
    </div>
  );
}

export default function SiteHeader() {
  const pathname = usePathname() || "/";
  const { xp, hydrated, done, setTerminalOpen } = useGame();
  const [questsOpen, setQuestsOpen] = useState(false);
  const p = levelProgress(hydrated ? xp : 0);
  const doneCount = MAIN_QUESTS.filter((q) => done[q.id]).length;

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line bg-bg/90 backdrop-blur">
        <div className="relative mx-auto flex max-w-[1320px] items-center gap-x-3 px-4 py-2.5 sm:gap-x-5 sm:px-6 lg:flex-wrap lg:gap-y-2">
          <Link href="/" className="inline-flex shrink-0 items-center py-2 font-mono text-[15px] font-semibold text-fg sm:text-base">
            <span className="text-signal-text">~</span>/himanshu
            <span aria-hidden className="ml-1 inline-block h-4 w-2 animate-hk-blink bg-signal" />
          </Link>
          <nav aria-label="Primary" className="hidden flex-wrap gap-0.5 font-mono text-[13px] lg:flex">
            {NAV.map((n) => {
              const on = n.match(pathname);
              return (
                <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={`px-2.5 py-2.5 ${on ? "text-fg shadow-[inset_0_-2px_0_var(--c-signal)]" : "text-fg-3 hover:text-fg"}`}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex-1" />
          <div className="flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={() => setQuestsOpen((o) => !o)}
              aria-expanded={questsOpen}
              aria-label={`Level ${p.level.code} ${p.level.name}. Open quest log`}
              className="min-h-10 whitespace-nowrap border border-signal px-2 font-mono text-xs tracking-label text-signal-text"
            >
              {p.level.code}
              <span className="hidden sm:inline"> · {p.level.name}</span>
            </button>
            <div className="hidden w-[150px] flex-col gap-1.5 sm:flex">
              <div className="h-1.5 bg-surface-2">
                <div className="h-1.5 bg-signal transition-[width] duration-500" style={{ width: `${p.pct}%` }} />
              </div>
              <span className="whitespace-nowrap font-mono text-[11px] text-fg-3">
                {p.next ? `${hydrated ? xp : 0} / ${p.next.min} xp → ${p.next.name.toLowerCase()}` : `${xp} xp · max level`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setQuestsOpen((o) => !o)}
              aria-expanded={questsOpen}
              className="hidden min-h-10 border border-line-strong px-3 font-mono text-xs text-fg hover:bg-surface-2 sm:block"
            >
              quests {hydrated ? doneCount : 0}/{MAIN_QUESTS.length}
            </button>
            <button type="button" onClick={() => setTerminalOpen(true)} aria-label="Open terminal" className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg hover:bg-surface-2">
              ⌘K
            </button>
            <ThemeToggle />
            <AuthButton />
          </div>
          {questsOpen && <QuestLog onClose={() => setQuestsOpen(false)} />}
        </div>
        <div className="h-[3px] bg-surface-2 sm:hidden">
          <div className="h-[3px] bg-signal" style={{ width: `${p.pct}%` }} />
        </div>
      </header>

      {/* Lesson pages bring their own phone reading toolbar, which takes the dock's place. */}
      <nav aria-label="Sections" className={`${isLessonRoute(pathname) ? "hidden" : "grid lg:hidden"} fixed inset-x-0 bottom-0 z-50 grid-cols-5 gap-1 border-t border-line bg-bg/95 px-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pt-2 backdrop-blur`}>
        {DOCK.map((d) => {
          const on = d.match(pathname);
          return (
            <Link key={d.href} href={d.href} aria-current={on ? "page" : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-1.5 font-mono text-[11px] ${on ? "text-fg" : "text-fg-3"}`}>
              <span aria-hidden className={`h-1.5 w-1.5 ${on ? "bg-signal" : "bg-transparent"}`} />
              {d.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
