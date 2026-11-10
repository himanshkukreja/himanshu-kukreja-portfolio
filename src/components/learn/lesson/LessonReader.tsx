"use client";

import CanvasEntry from "@/components/learn/canvas/CanvasEntry";
import { Fragment, Suspense, useCallback, useEffect, useRef, useState } from "react";
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
import { listenKey } from "@/lib/listen/manifest";
import LessonHero from "./LessonHero";
import LldHero from "@/components/learn/lld/LldHero";
import LldSideTracker from "@/components/learn/lld/LldSideTracker";
import LldHydrator from "@/components/learn/lld/LldHydrator";
import { LldPrefsProvider, LldScope } from "@/components/learn/lld/LldPrefs";
import QuestHero from "@/components/learn/sidequest/QuestHero";
import { questBrand } from "@/components/learn/sidequest/brands";
import QuestRunEntry from "@/components/learn/sidequest/QuestRunEntry";
import LectureEntry from "@/components/learn/sidequest/LectureEntry";
import StageRail from "./StageRail";
import ContentsSheet from "./ContentsSheet";
import EndOfLesson from "./EndOfLesson";
import ArticleShorts from "./ArticleShorts";
import LandingContext from "./LandingContext";
import BossEntry from "./BossEntry";
import DesignFirst from "@/components/learn/designfirst/DesignFirst";
import LessonNotebookContext from "@/components/learn/ink/global/LessonNotebookContext";
import AnnotateHost from "@/components/learn/ink/annotate/AnnotateHost";
import { AskPrompt, FocusControls, MobileReadingBar, ReadingDock } from "./ReadingTools";
import { useReadingSettings } from "@/components/learn/reading/useReading";
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
  // text size, mode, font… live in the reading settings (src/lib/learn/readingModes.ts, on <html>); the size shows on "Aa"
  const { size } = useReadingSettings();
  const [sheet, setSheet] = useState(false);
  // the recorded natural-voice narration, when scripts/listen has made one for this text
  const readAloud = useReadAloud(contentRef, { listenKey: listenKey(meta.kind, meta.week, meta.slug) });
  useChromeVars(rootRef);

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

  const tools = { readAloud, focus, onFocus: toggleFocus, size, onContents: openSheet };
  // low-level design case studies: the interview walkthrough (steps, class explorer, code tabs, "try it first")
  const isLld = meta.kind === "lld";
  const Prefs = isLld ? LldPrefsProvider : Fragment;
  const Scope = isLld ? LldScope : Fragment;

  return (
    <LessonProgressProvider courseId={meta.course} week={meta.week} lessonSlug={meta.slug} title={meta.title} stages={stages} contentVersion={meta.contentVersion}>
      <Prefs>
      <div
        ref={rootRef}
        className="min-h-screen"
        style={meta.kind === "bonus" ? ({ ["--quest-accent" as string]: questBrand(meta.slug).accent } as React.CSSProperties) : undefined}
      >
        <Suspense fallback={null}>
          <SearchHighlight />
        </Suspense>
        {meta.kind === "bonus" ? <QuestHero meta={meta} /> : isLld ? <LldHero meta={meta} /> : <LessonHero meta={meta} />}
        <LandingContext meta={meta} />
        <StageRail onOpenContents={openSheet} />

        <div className="mx-auto max-w-[1320px] px-4 pb-16 pt-8 sm:px-6 lg:pt-10">
          <FocusMode
            focus={focus}
            onFocusChange={changeFocus}
            leftOnMobile={false}
            sidebarLeft={<CollapsibleWeekNav course={meta.course} rail={rail} />}
            sidebarRight={isLld ? <LldSideTracker stages={stages} lld={meta.lld ?? null} /> : <TableOfContents toc={toc} stages={stages} />}
          >
            {meta.kind === "capstone" && <BossEntry week={meta.week} slug={meta.slug} stages={stages} title={meta.title} weekCode={meta.weekCode} />}
            {meta.lecture && <LectureEntry lecture={meta.lecture} quest={meta.kind === "bonus" || meta.kind === "problem" || meta.kind === "lld"} />}
            {meta.kind === "problem" && <CanvasEntry promptKey={`problem:${meta.slug}`} />}
            {/* a capstone's "Design it first" panel sits inside the article, before the first solution phase */}
            {meta.kind === "capstone" && !meta.designFirst && <CanvasEntry promptKey={`capstone:${meta.week}`} />}
            {meta.kind === "bonus" && <QuestRunEntry week={meta.week} slug={meta.slug} stages={stages} title={meta.title} />}

            <AskPrompt />
            {/* the learner's ink on the lesson (annotate mode: the reading tools' Annotate button) */}
            <Scope>
            <AnnotateHost contentRef={contentRef} lessonKey={`${meta.week}/${meta.slug}`} title={meta.title}>
              <LessonContentWrapper
                ref={contentRef}
                htmlContent={html}
                courseId={meta.course}
                week={meta.week}
                lessonSlug={meta.slug}
                lessonTitle={meta.title}
              />
            </AnnotateHost>
            </Scope>
            <DeepLinkResolver rootRef={contentRef} />
            {isLld && meta.lld && <LldHydrator lld={meta.lld} contentRef={contentRef} />}
            {meta.kind === "capstone" && meta.designFirst && <DesignFirst meta={meta.designFirst} week={meta.week} title={meta.title} contentRef={contentRef} />}

            {meta.shorts && <ArticleShorts of={meta.shorts.of} shorts={meta.shorts.items} />}

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
        {focus && <FocusControls stages={stages} size={size} onExit={() => changeFocus(false)} />}
        <LessonNotebookContext lesson={{ week: meta.week, slug: meta.slug, title: meta.title, weekLabel: meta.weekLabel, weekTopic: meta.weekTopic }} />
        <ContentsSheet open={sheet} onClose={closeSheet} toc={toc} stages={stages} kicker={meta.shortLabel.toUpperCase()} title={meta.title} />
      </div>
      </Prefs>
    </LessonProgressProvider>
  );
}
