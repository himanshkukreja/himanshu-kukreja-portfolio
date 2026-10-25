"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { Stage, TocItem } from "@/lib/course/types";
import { LessonProgressProvider } from "@/components/LessonProgressTracker";
import LessonContentWrapper from "@/components/LessonContentWrapper";
import FocusMode from "@/components/FocusMode";
import TableOfContents from "@/components/TableOfContents";
import CollapsibleWeekNav from "@/components/CollapsibleWeekNav";
import LessonComments from "@/components/LessonComments";
import OnlineOnly from "@/components/offline/OnlineOnly";
import SearchHighlight from "@/components/SearchHighlight";
import DeepLinkResolver from "@/components/DeepLinkResolver";
import { useReadAloud } from "@/components/ReadAloud";
import LessonHero from "./LessonHero";
import QuestHero from "@/components/learn/sidequest/QuestHero";
import { questBrand } from "@/components/learn/sidequest/brands";
import QuestRunEntry from "@/components/learn/sidequest/QuestRunEntry";
import LectureEntry from "@/components/learn/sidequest/LectureEntry";
import StageRail from "./StageRail";
import ContentsSheet from "./ContentsSheet";
import EndOfLesson from "./EndOfLesson";
import LandingContext from "./LandingContext";
import BossEntry from "./BossEntry";
import { AskPrompt, FocusControls, MobileReadingBar, ReadingDock, TEXT_SIZES } from "./ReadingTools";
import { headerStackBottom, stageRailHeight } from "./layout";
import type { NavLink, RailData, ReaderMeta, TrialPartLink } from "./types";

type Props = {
  meta: ReaderMeta;
  html: string;
  stages: Stage[];
  toc: TocItem[];
  rail: RailData;
  prev: NavLink | null;
  next: NavLink | null;
  trial: TrialPartLink | null;
};

const SIZE_KEY = "hk.reader.size";

/** Keeps --reader-top / --reader-rail / --site-dock in sync with the real chrome heights. */
function useChromeVars(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const top = headerStackBottom();
      const rail = stageRailHeight();
      const dock = document.querySelector<HTMLElement>('nav[aria-label="Sections"]');
      const dockH = dock && window.getComputedStyle(dock).display !== "none" ? dock.offsetHeight : 0;
      el.style.setProperty("--reader-top", `${top}px`);
      el.style.setProperty("--reader-rail", `${rail}px`);
      el.style.setProperty("--site-dock", `${dockH}px`);
      el.style.setProperty("--reader-scroll-margin", `${top + rail + 16}px`);
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(measure);
    };
    measure();
    // the site header publishes its height a moment after mount
    const t1 = window.setTimeout(schedule, 300);
    const t2 = window.setTimeout(schedule, 1200);
    const ro = new ResizeObserver(schedule);
    document.querySelectorAll("header, [data-stage-rail], nav[aria-label='Sections']").forEach((n) => ro.observe(n));
    window.addEventListener("resize", schedule);
    // the header slides away while reading (hk:chrome) and disappears in focus/fullscreen
    window.addEventListener("hk:chrome", schedule);
    document.addEventListener("fullscreenchange", schedule);
    return () => {
      window.removeEventListener("hk:chrome", schedule);
      document.removeEventListener("fullscreenchange", schedule);
      if (raf) window.cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [root]);
}

export default function LessonReader({ meta, html, stages, toc, rail, prev, next, trial }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(false);
  const [size, setSize] = useState<number>(TEXT_SIZES[0]);
  const [sheet, setSheet] = useState(false);
  const readAloud = useReadAloud(contentRef);
  useChromeVars(rootRef);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(SIZE_KEY));
      // a per-viewer preference, read after mount so server and client markup match
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if ((TEXT_SIZES as readonly number[]).includes(saved)) setSize(saved);
    } catch {
      // storage unavailable
    }
  }, []);

  const cycleSize = useCallback(() => {
    setSize((s) => {
      const i = (TEXT_SIZES as readonly number[]).indexOf(s);
      const n = TEXT_SIZES[(i + 1) % TEXT_SIZES.length];
      try {
        window.localStorage.setItem(SIZE_KEY, String(n));
      } catch {
        // storage unavailable
      }
      return n;
    });
  }, []);

  // Focus = the article alone: every bit of chrome hidden (html.hk-focus) and, where the browser
  // allows it (not iPhone Safari), real fullscreen. Called from click/key handlers so the
  // fullscreen request carries the user gesture.
  const focusRef = useRef(false);
  const changeFocus = useCallback((on: boolean) => {
    focusRef.current = on;
    setFocus(on);
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    const fsEl = document.fullscreenElement || doc.webkitFullscreenElement;
    try {
      if (on && !fsEl) {
        if (el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
        else el.webkitRequestFullscreen?.();
      } else if (!on && fsEl) {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else doc.webkitExitFullscreen?.();
      }
    } catch {
      // fullscreen unsupported: focus still hides the chrome
    }
  }, []);
  const toggleFocus = useCallback(() => changeFocus(!focusRef.current), [changeFocus]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("hk-focus", focus);
    window.dispatchEvent(new Event("hk:chrome"));
    return () => root.classList.remove("hk-focus");
  }, [focus]);

  useEffect(() => {
    // leaving fullscreen with Esc / the browser UI leaves focus too
    const onFs = () => {
      if (!document.fullscreenElement && focusRef.current) changeFocus(false);
    };
    const onKey = (e: KeyboardEvent) => {
      // (a fullscreen diagram takes the first Esc)
      if (e.key === "Escape" && focusRef.current && !document.querySelector("figure.sd-mermaid[data-fullscreen]")) changeFocus(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("keydown", onKey);
    };
  }, [changeFocus]);
  const closeSheet = useCallback(() => setSheet(false), []);
  const openSheet = useCallback(() => setSheet(true), []);

  const tools = { readAloud, focus, onFocus: toggleFocus, size, onSize: cycleSize, onContents: openSheet };

  return (
    <LessonProgressProvider courseId={meta.course} week={meta.week} lessonSlug={meta.slug} title={meta.title} stages={stages} contentVersion={meta.contentVersion}>
      <div
        ref={rootRef}
        className="min-h-screen"
        style={meta.kind === "bonus" ? ({ ["--quest-accent" as string]: questBrand(meta.slug).accent } as React.CSSProperties) : undefined}
      >
        <Suspense fallback={null}>
          <SearchHighlight />
        </Suspense>
        {meta.kind === "bonus" ? <QuestHero meta={meta} /> : <LessonHero meta={meta} />}
        <LandingContext meta={meta} />
        <StageRail onOpenContents={openSheet} />

        <div className="mx-auto max-w-[1320px] px-4 pb-16 pt-8 sm:px-6 lg:pt-10">
          <FocusMode
            focus={focus}
            onFocusChange={changeFocus}
            leftOnMobile={false}
            sidebarLeft={<CollapsibleWeekNav course={meta.course} rail={rail} />}
            sidebarRight={<TableOfContents toc={toc} stages={stages} />}
          >
            {meta.kind === "capstone" && <BossEntry week={meta.week} slug={meta.slug} stages={stages} title={meta.title} weekCode={meta.weekCode} />}
            {meta.kind === "bonus" && meta.lecture && <LectureEntry lecture={meta.lecture} />}
            {meta.kind === "bonus" && <QuestRunEntry week={meta.week} slug={meta.slug} stages={stages} title={meta.title} />}

            <AskPrompt />
            <LessonContentWrapper
              ref={contentRef}
              htmlContent={html}
              courseId={meta.course}
              week={meta.week}
              lessonSlug={meta.slug}
              lessonTitle={meta.title}
              textSize={size}
            />
            <DeepLinkResolver rootRef={contentRef} />

            <EndOfLesson meta={meta} prev={prev} next={next} trial={trial} />

            <OnlineOnly what="The discussion" note="You're reading a saved copy. Comments load again when you're back online.">
              <LessonComments courseId={meta.course} week={meta.week} lessonSlug={meta.slug} />
            </OnlineOnly>
          </FocusMode>
        </div>

        {/* room for the phone reading toolbar above the site dock */}
        <div aria-hidden data-focus-hide className="h-20 lg:hidden" />

        <ReadingDock {...tools} />
        <MobileReadingBar {...tools} />
        {focus && <FocusControls stages={stages} size={size} onSize={cycleSize} onExit={() => changeFocus(false)} />}
        <ContentsSheet open={sheet} onClose={closeSheet} toc={toc} stages={stages} kicker={meta.shortLabel.toUpperCase()} title={meta.title} />
      </div>
    </LessonProgressProvider>
  );
}
