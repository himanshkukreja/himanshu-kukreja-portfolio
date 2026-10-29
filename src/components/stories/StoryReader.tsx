"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import LectureEntry from "@/components/learn/sidequest/LectureEntry";
import { Bookmark, Sparkles } from "lucide-react";
import { ASK_LESSON_EVENT } from "@/components/learn/ai/AskLessonPanel";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import CaseCover from "./CaseCover";
import ReadAloud from "@/components/ReadAloud";
import { listenKey } from "@/lib/listen/manifest";
import StoryContentWrapper from "@/components/StoryContentWrapper";
import CourseEnhancer from "@/components/learn/content/CourseEnhancer";
import { useGame } from "@/game/GameProvider";
import DebriefCard from "./DebriefCard";
import ArticleShorts, { type ArticleShort } from "@/components/learn/lesson/ArticleShorts";
import CaseActivity from "./activities/registry";
import type { CaseActivityData } from "./activities/data";
import styles from "./reader.module.css";
import { useReadAloudBridge } from "./useReadAloudBridge";
import StorySelectionAsk from "./StorySelectionAsk";
import DeepLinkResolver from "@/components/DeepLinkResolver";
import { buildSections, readStoryRecord, sectionRects, writeStoryRecord, type Section, type StoryRecord } from "./storyReading";
import { completeNeedSeconds, isStageRead, readProgress, startReadingProbe, visibleBins } from "@/lib/learn/engagedClock";
import { track } from "@/lib/track";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";
import {
  CASE_TYPE_LABEL,
  DEBRIEF_FLAG,
  READ_FLAG,
  SAVED_FLAG,
  TATKAL_SLUG,
  flagList,
  formatLongDate,
  type CaseFile,
  type Debrief,
} from "./case-types";

export type Checkpoint = { id: string; label: string };
export type CaseLink = Pick<CaseFile, "slug" | "caseId" | "type" | "title">;

type Props = {
  meta: CaseFile;
  checkpoints: Checkpoint[];
  htmlContent: string;
  debrief: Debrief | null;
  prev: CaseLink | null;
  next: CaseLink | null;
  totalCases: number;
  views: ReactNode;
  comments: ReactNode;
  /** CMS case files: the data-driven end-of-file activity (repo stories use their TSX activity) */
  activity?: CaseActivityData | null;
  /** admin preview: no reading record, no "case closed" XP */
  preview?: boolean;
  /** the case file's animated lecture, when it has one */
  lecture?: { href: string; minutes: number; checkpoints: number; chapters: number } | null;
  /** the case file's vertical shorts, shown at the end */
  shorts?: { of: string; items: ArticleShort[] } | null;
};

const CHIP = "border border-line-strong px-2 py-1 text-fg-2";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function StoryReader({ meta, checkpoints, htmlContent, debrief, prev, next, totalCases, views, comments, activity, preview, lecture, shorts = null }: Props) {
  const { hydrated, flags, done, setFlag, award } = useGame();
  const contentRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const [siteTop, setSiteTop] = useState(60);
  const [barH, setBarH] = useState(52);
  const [cp, setCp] = useState(0);
  const [pct, setPct] = useState(0);
  const [focus, setFocus] = useState(false);
  const [replaySlot, setReplaySlot] = useState<HTMLElement | null>(null);

  const n = checkpoints.length;
  const readList = useMemo(() => (hydrated ? flagList(flags[READ_FLAG]) : []), [hydrated, flags]);
  const isClosed = readList.includes(meta.slug);
  const saved = hydrated && flagList(flags[SAVED_FLAG]).includes(meta.slug);
  const debriefPick = hydrated ? (flags[DEBRIEF_FLAG] as Record<string, number> | undefined)?.[meta.slug] : undefined;
  const debriefDone = typeof debriefPick === "number";
  const readAloud = useReadAloudBridge(dockRef);
  const ai = useAiStatus();

  // Sit the reader bar right under the global (sticky) site header, whatever its height.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("header.sticky");
    const bar = barRef.current;
    const ro = new ResizeObserver(() => {
      if (header) setSiteTop(header.getBoundingClientRect().height);
      if (bar) setBarH(bar.getBoundingClientRect().height);
    });
    if (header) ro.observe(header);
    if (bar) ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  // Current checkpoint + bar fill, measured together on scroll, resize and content resize
  // (the article grows as images/fonts load, so a one-off measurement at mount goes stale).
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      // Look headings up every time: the article HTML can be re-rendered, and a detached
      // node reports top = 0, which would mark every checkpoint as passed.
      const heads = checkpoints
        .map((c) => document.getElementById(c.id))
        .filter((h): h is HTMLElement => !!h && h.isConnected);
      const content = contentRef.current;
      if (!content) return;
      const line = window.innerHeight * 0.4;
      const end = content.getBoundingClientRect().bottom;
      if (!heads.length) {
        const top = content.getBoundingClientRect().top;
        setPct(Math.max(0, Math.min(1, (line - top) / Math.max(1, end - top))));
        return;
      }
      const tops = heads.map((h) => h.getBoundingClientRect().top);
      let k = -1;
      tops.forEach((t, i) => {
        if (t <= line) k = i;
      });
      setCp(Math.max(0, k));
      if (k < 0) {
        setPct(0);
        return;
      }
      const from = tops[k];
      const to = k + 1 < tops.length ? tops[k + 1] : end;
      const frac = Math.max(0, Math.min(1, (line - from) / Math.max(1, to - from)));
      setPct((k + frac) / heads.length);
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(measure);
    };
    raf = window.requestAnimationFrame(measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const ro = new ResizeObserver(onScroll);
    if (contentRef.current) ro.observe(contentRef.current);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [checkpoints]);

  // ---- Reading progress: each checkpoint section counts as read only after real engaged reading
  // time in it (35% of its estimated minutes, 20 s – 6 min) with 80% of it on screen while
  // reading (lib/learn/engagedClock READING). Jumps (checkpoint list, "Discussion", End) and fast
  // scrolling never count, and time spent below the article counts for no section. The case
  // closes (+ the "read" quest XP) when every section is read, or through "Close the case" once
  // 70% of the total reading time is in.
  const [sections, setSections] = useState<Section[]>([]);
  const [snap, setSnap] = useState<{ d: Record<string, number>; s: Record<string, number>; r: string[] }>({ d: {}, s: {}, r: [] });
  const rec = useRef<StoryRecord>({ d: {}, s: {}, r: [] });
  const live = useRef({ hydrated, isClosed, readList });
  useEffect(() => {
    live.current = { hydrated, isClosed, readList };
  }, [hydrated, isClosed, readList]);

  useEffect(() => {
    rec.current = readStoryRecord(meta.slug);
    const content = contentRef.current;
    if (!content) return;
    const build = () => {
      setSections(buildSections(content, checkpoints, meta.mins));
      setSnap({ d: { ...rec.current.d }, s: { ...rec.current.s }, r: [...rec.current.r] });
    };
    // after the article HTML is in the DOM
    const raf = window.requestAnimationFrame(build);
    return () => window.cancelAnimationFrame(raf);
  }, [meta.slug, meta.mins, checkpoints, htmlContent]);

  const closeCase = useCallback(() => {
    const { hydrated: h, isClosed: closed, readList: list } = live.current;
    if (!h || closed || preview) return;
    const secs = Object.values(rec.current.d).reduce((a, b) => a + b, 0);
    track("case_closed", { slug: meta.slug, minutes: Math.round(secs / 60) });
    // award() before setFlag(): award writes a whole state snapshot, setFlag is a functional update on top of it.
    award("read");
    if (!list.includes(meta.slug)) setFlag(READ_FLAG, [...list, meta.slug]);
  }, [meta.slug, award, setFlag, preview]);

  useEffect(() => {
    if (!sections.length || preview) return;
    let ticks = 0;
    const flush = () => writeStoryRecord(meta.slug, rec.current);
    const stop = startReadingProbe(() => {
      const content = contentRef.current;
      if (!content || !live.current.hydrated) return;
      // the sticky reader bar's bottom edge = where the visible article starts
      const top = Math.max(0, barRef.current?.getBoundingClientRect().bottom ?? 0);
      const vh = window.innerHeight;
      const line = top + Math.min(180, (vh - top) * 0.3);
      const rects = sectionRects(content, sections);
      let hit = -1;
      rects.forEach((r, i) => {
        if (!r) return;
        if (r.top <= line && r.bottom > line) hit = i;
        if (r.bottom > top && r.top < vh) {
          const id = sections[i].id;
          rec.current.s[id] = ((rec.current.s[id] ?? 0) | visibleBins({ top: r.top, height: r.bottom - r.top }, top, vh)) >>> 0;
        }
      });
      // the reading line is outside the article (cover, case-closed card, discussion): nothing is read
      if (hit < 0) return;
      const sec = sections[hit];
      rec.current.d[sec.id] = (rec.current.d[sec.id] ?? 0) + 1;
      ticks++;
      let changed = false;
      sections.forEach((x, i) => {
        if (rec.current.r.includes(x.id) || !isStageRead(rec.current.d[x.id] ?? 0, x.need, rec.current.s[x.id])) return;
        rec.current.r.push(x.id);
        changed = true;
        track("case_checkpoint", { slug: meta.slug, checkpoint: x.id, index: i, total: sections.length });
      });
      if (changed) {
        flush();
        if (sections.every((x) => rec.current.r.includes(x.id))) closeCase();
      }
      if (changed || ticks % 5 === 0) setSnap({ d: { ...rec.current.d }, s: { ...rec.current.s }, r: [...rec.current.r] });
      if (ticks % 10 === 0) flush();
    });
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      stop();
      flush();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [sections, meta.slug, closeCase, preview]);

  const readSet = useMemo(() => new Set(snap.r), [snap.r]);
  const nRead = sections.filter((x) => readSet.has(x.id)).length;
  const closeNeed = completeNeedSeconds(sections.map((x) => x.need));
  // each section counts up to its own requirement: camping on one section never closes the case
  const readSecs = sections.reduce((a, x) => a + (readSet.has(x.id) ? x.need : Math.min(snap.d[x.id] ?? 0, x.need)), 0);
  const canClose = sections.length > 0 && (nRead === sections.length || readSecs >= closeNeed);
  const closeLeftMin = Math.max(1, Math.ceil((closeNeed - readSecs) / 60));
  const sectionProgress = (id: string) => {
    const x = sections.find((y) => y.id === id);
    if (!x) return 0;
    return readSet.has(id) ? 1 : readProgress(snap.d[id] ?? 0, x.need, snap.s[id]);
  };

  // Story images that 404 (not uploaded yet) become a labelled blueprint placeholder instead of a broken icon.
  // The article HTML is injected after this effect runs, so listen in the capture phase (image errors don't
  // bubble) and re-scan shortly after for images that already failed.
  useEffect(() => {
    const mark = (img: HTMLImageElement) => {
      if (img.classList.contains("sd-img-missing") || !img.closest(".course-content")) return;
      img.classList.add("sd-img-missing");
      if (img.alt && !(img.nextElementSibling as HTMLElement | null)?.classList.contains("sd-img-missing-cap")) {
        const cap = document.createElement("div");
        cap.className = "sd-img-missing-cap";
        cap.setAttribute("data-sd-chrome", "");
        cap.textContent = `Blueprint · ${img.alt}`;
        img.insertAdjacentElement("afterend", cap);
      }
    };
    const onError = (e: Event) => {
      if (e.target instanceof HTMLImageElement) mark(e.target);
    };
    const scan = () =>
      document.querySelectorAll<HTMLImageElement>(".course-content img").forEach((img) => {
        if (img.complete && img.naturalWidth === 0 && img.src) mark(img);
      });
    window.addEventListener("error", onError, true);
    let pending = 0;
    const later = () => {
      if (!pending) pending = window.setTimeout(() => ((pending = 0), scan()), 150);
    };
    // the reader re-injects the article (highlights), which recreates <img> nodes: re-scan on changes
    const mo = new MutationObserver((records) => {
      if (records.some((r) => Array.from(r.addedNodes).some((n) => n instanceof HTMLElement && !n.classList.contains("sd-img-missing-cap")))) later();
    });
    const host = document.querySelector("article") || document.body;
    mo.observe(host, { childList: true, subtree: true });
    const t1 = window.setTimeout(scan, 400);
    const t2 = window.setTimeout(scan, 2000);
    return () => {
      window.removeEventListener("error", onError, true);
      mo.disconnect();
      if (pending) window.clearTimeout(pending);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [htmlContent]);

  // Focus mode keyboard shortcut (F), same as the old FocusMode component.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "f" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      setFocus((f) => !f);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Tatkal story only: slot the "Replay as Tatkal Rush" card in after the microphone-problem section.
  useEffect(() => {
    if (meta.slug !== TATKAL_SLUG) return;
    const body = contentRef.current?.firstElementChild;
    if (!body) return;
    const h2s = Array.from(body.querySelectorAll(":scope > h2"));
    const mic = h2s.findIndex((h) => /microphone/i.test(h.textContent || ""));
    const before = mic >= 0 ? h2s[mic + 1] : h2s[4];
    const slot = document.createElement("div");
    slot.setAttribute("data-case-inline", "");
    if (before) body.insertBefore(slot, before);
    else body.appendChild(slot);
    const raf = window.requestAnimationFrame(() => setReplaySlot(slot));
    return () => {
      window.cancelAnimationFrame(raf);
      slot.remove();
      setReplaySlot(null);
    };
  }, [meta.slug]);

  const goTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }, []);

  const toggleSave = () => {
    if (!hydrated) return;
    const list = flagList(flags[SAVED_FLAG]);
    setFlag(SAVED_FLAG, saved ? list.filter((s) => s !== meta.slug) : [...list, meta.slug]);
  };

  const pctNum = Math.round(pct * 100);
  const minLeft = Math.max(0, Math.ceil(meta.mins * (1 - pct)));
  const closedCount = readList.length;
  const readXp = hydrated && !done.read ? 50 : 0;
  const debriefXp = debrief && !debriefDone ? 50 : 0;
  const rewardXp = readXp + debriefXp;
  const rootStyle = { "--reader-top": `${siteTop + barH}px` } as CSSProperties;

  return (
    <div style={rootStyle}>
      {/* Reader bar: back link, checkpoint, progress with checkpoint ticks */}
      <div ref={barRef} data-sticky-header className="sticky z-40 border-b border-line bg-[color-mix(in_srgb,var(--c-bg)_92%,transparent)] backdrop-blur" style={{ top: siteTop }}>
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-5 gap-y-0 px-4 sm:px-6">
          <Link href="/stories" className="inline-flex min-h-11 items-center gap-2 text-sm text-fg-3 no-underline hover:text-fg">
            ← Case files
          </Link>
          <span className="font-mono text-xs text-fg-3">
            <span className="hidden sm:inline">
              {meta.caseId}
              {n > 0 && ` · checkpoint ${cp + 1} of ${n}`}
              {sections.length > 0 && !isClosed && ` · ${nRead}/${sections.length} read`}
            </span>
            <span className="sm:hidden">
              {n > 0 ? `checkpoint ${cp + 1} / ${n} · ` : `${meta.caseId} · `}~{minLeft} min left
            </span>
          </span>
          <span className="grow" />
          <span className="hidden font-mono text-xs text-fg-3 sm:inline">~{minLeft} min left</span>
        </div>
        <div
          className="relative h-1 bg-surface-2"
          role="progressbar"
          aria-label="Reading progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pctNum}
        >
          <div className="absolute inset-y-0 left-0 bg-signal transition-[width] duration-300 ease-out" style={{ width: `${pctNum}%` }} />
          {checkpoints.map((c, k) => (
            <span
              key={c.id}
              aria-hidden
              className={`absolute top-0 h-1 w-0.5 ${k / n <= pct ? "bg-on-signal" : "bg-line-strong"}`}
              style={{ left: `${(k / n) * 100}%` }}
            />
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[1320px] px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        <div
          className={
            focus
              ? "mx-auto max-w-[760px]"
              : "lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[240px_minmax(0,760px)_240px] xl:justify-center xl:gap-12"
          }
        >
          {!focus && (
            <aside aria-label="Checkpoints" className="hidden lg:block">
              <div className="sticky flex flex-col gap-3.5" style={{ top: `calc(var(--reader-top) + 24px)` }}>
                <span className="label-mono text-fg-3">Checkpoints</span>
                {n > 0 ? (
                  <ol className="m-0 flex max-h-[calc(100vh_-_var(--reader-top)_-_64px)] list-none flex-col gap-0.5 overflow-y-auto p-0">
                    {checkpoints.map((c, k) => {
                      const passed = readSet.has(c.id) || isClosed;
                      const cur = k === cp;
                      const prog = Math.round(sectionProgress(c.id) * 100);
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => goTo(c.id)}
                            aria-current={cur ? "step" : undefined}
                            aria-label={`${c.label}, ${passed ? "read" : prog > 0 ? `${prog}% read` : "not read yet"}`}
                            className={`flex min-h-10 w-full items-center gap-2.5 px-2 py-1.5 text-left text-sm leading-[1.3] ${
                              cur ? "bg-surface-2 font-semibold text-fg" : passed ? "text-fg-2 hover:text-fg" : "text-fg-3 hover:text-fg"
                            }`}
                          >
                            <span
                              aria-hidden
                              className={`grid h-[22px] w-[22px] shrink-0 place-items-center font-mono text-[11px] ${
                                passed ? "bg-fg text-bg" : cur ? "border-2 border-signal text-signal-text" : "border border-line-strong"
                              }`}
                            >
                              {passed ? "✓" : k + 1}
                            </span>
                            <span className="flex min-w-0 flex-col gap-1">
                              <span>{c.label}</span>
                              {!passed && prog > 0 && (
                                <span aria-hidden className="block h-0.5 w-full bg-line">
                                  <span className="block h-full bg-signal" style={{ width: `${prog}%` }} />
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <span className="text-sm text-fg-3">One continuous file. No checkpoints.</span>
                )}
              </div>
            </aside>
          )}

          <article className="flex min-w-0 flex-col gap-6 sm:gap-7">
            <div className="flex flex-wrap gap-2 font-mono text-xs tracking-[0.06em]">
              <span className="bg-signal px-2 py-1 font-semibold text-on-signal">{meta.caseId}</span>
              <span className={meta.type === "incident" ? "border border-bad px-2 py-1 text-bad-text" : CHIP}>
                {CASE_TYPE_LABEL[meta.type].toUpperCase()}
              </span>
              <span className={CHIP}>{meta.mins} MIN</span>
              {meta.date && (
                <time dateTime={meta.date} className={CHIP}>
                  {formatLongDate(meta.date)}
                </time>
              )}
            </div>

            <h1 className="m-0 font-display text-[clamp(34px,5.2vw,72px)] font-extrabold leading-[0.95] tracking-[-0.045em] [text-wrap:balance]">
              {meta.title}
            </h1>

            <div className="flex flex-wrap items-center gap-3.5 border-b border-line pb-6">
              <span aria-hidden className="grid h-11 w-11 place-items-center bg-fg font-display text-base font-extrabold text-bg">
                HK
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold">Himanshu Kukreja</span>
                <span className="text-[13px] text-fg-3">{views}</span>
              </span>
              <span className="grow" />
              <div className="flex flex-wrap gap-1.5">
                <SaveOfflineButton title={meta.title} kind="story" url={`/stories/${meta.slug}`} />
                {ai?.features["lesson-qa"] && (
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new Event(ASK_LESSON_EVENT))}
                    className="inline-flex min-h-11 items-center gap-2 border border-signal px-3.5 text-sm text-signal-text hover:bg-signal hover:text-on-signal"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden /> Ask AI
                  </button>
                )}
                {readAloud.state !== "unsupported" && (
                  <button
                    type="button"
                    onClick={readAloud.toggle}
                    aria-pressed={readAloud.state === "playing"}
                    className={`inline-flex min-h-11 items-center gap-2 border px-3.5 text-sm ${
                      readAloud.state === "playing" ? "border-signal bg-signal text-on-signal" : "border-line-strong bg-transparent text-fg hover:bg-surface-2"
                    }`}
                  >
                    {readAloud.state === "playing" && (
                      <span aria-hidden className="inline-flex h-3.5 items-end gap-0.5">
                        {[0, 0.2, 0.4].map((d) => (
                          <span
                            key={d}
                            className={`h-3.5 w-[3px] origin-bottom bg-current ${styles.eq}`}
                            style={{ animationDelay: `${d}s` }}
                          />
                        ))}
                      </span>
                    )}
                    {readAloud.state === "playing" ? "Pause" : readAloud.state === "paused" ? "Resume" : "Read aloud"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFocus((f) => !f)}
                  aria-pressed={focus}
                  title="Focus mode (F)"
                  className="hidden min-h-11 border border-line-strong bg-transparent px-3.5 text-sm text-fg hover:bg-surface-2 lg:inline-flex lg:items-center"
                >
                  {focus ? "Exit focus" : "Focus mode"}
                </button>
                <button
                  type="button"
                  onClick={toggleSave}
                  aria-pressed={saved}
                  aria-label={saved ? "Remove bookmark" : "Bookmark this case file"}
                  title={saved ? "Bookmarked in this browser" : "Bookmark this case file"}
                  className={`grid h-11 w-11 place-items-center border bg-transparent ${saved ? "border-signal text-signal-text" : "border-line-strong text-fg hover:bg-surface-2"}`}
                >
                  <Bookmark className="h-4 w-4" fill={saved ? "currentColor" : "none"} aria-hidden />
                </button>
              </div>
            </div>

            {meta.cover && (
              <figure className="m-0 flex flex-col gap-2.5">
                <CaseCover src={meta.cover} motionSrc={meta.motionCover} alt={meta.coverAlt || meta.title} width={1536} height={1024} priority sizes="(min-width: 1280px) 760px, 100vw" />
                <figcaption className="font-mono text-xs text-fg-3">FIG. 1 · Blueprint · {meta.caseId}</figcaption>
              </figure>
            )}

            {lecture && <LectureEntry lecture={lecture} what="The whole case" className="m-0" />}

            <div className="course-content story-content">
              <StoryContentWrapper htmlContent={htmlContent} contentRef={contentRef} className={styles.prose} withReadAloud={false} />
              <CourseEnhancer lessonKey={`story/${meta.slug}`} />
            </div>

            <div ref={endRef} aria-hidden className="h-px" />

            {/* Case closed */}
            <section
              aria-labelledby="case-closed-h"
              className={`flex flex-col gap-3 p-5 sm:p-7 ${isClosed ? "border border-signal bg-surface" : "border border-dashed border-line-strong"}`}
            >
              <span className="label-mono text-signal-text">
                {isClosed ? `Case closed · ${meta.caseId}` : `End of file · ${meta.caseId}`}
              </span>
              <h2 id="case-closed-h" className="m-0 font-display text-[30px] font-extrabold leading-none tracking-[-0.035em] sm:text-[40px]">
                {isClosed ? (
                  <>
                    Case closed<span className="text-signal-text">.</span>
                  </>
                ) : (
                  "Read it through to close the case."
                )}
              </h2>
              <p className="m-0 text-[15px] leading-relaxed text-fg-2">
                {isClosed
                  ? `Filed to your record: ${closedCount} of ${totalCases} case files closed.`
                  : `${nRead}/${sections.length || n || 1} sections read. Each one counts after a few minutes of actual reading in it; skipping ahead doesn't. The case closes itself once every section is read.`}
                {hydrated && done.read ? " On-call badge ✓" : ""}
              </p>
              {!isClosed && sections.length > 0 && (
                <button
                  type="button"
                  onClick={closeCase}
                  disabled={!canClose || !hydrated}
                  className={`min-h-11 self-start px-4 text-sm font-semibold ${
                    canClose ? "bg-signal text-on-signal hover:brightness-110" : "border border-dashed border-line-strong text-fg-2"
                  } disabled:cursor-default`}
                >
                  {canClose ? `Close the case${readXp ? ` · +${readXp} XP` : ""}` : `Keep reading · ~${closeLeftMin} min left`}
                </button>
              )}
              {isClosed && (
                <div
                  className="grid max-w-[360px] gap-1"
                  style={{ gridTemplateColumns: `repeat(${Math.max(1, totalCases)}, minmax(0, 1fr))` }}
                  aria-hidden
                >
                  {Array.from({ length: totalCases }, (_, k) => (
                    <span key={k} className={`h-2.5 ${k < closedCount ? "bg-signal" : "border border-line-strong"}`} />
                  ))}
                </div>
              )}
              <Link href="/stories" className="self-start font-mono text-xs text-signal-text no-underline hover:underline">
                All case files →
              </Link>
            </section>

            {debrief && <DebriefCard slug={meta.slug} caseId={meta.caseId} debrief={debrief} />}

            {/* End-of-file activity (lazy, per story): after the article, so it never affects checkpoints or progress. */}
            <CaseActivity slug={meta.slug} caseId={meta.caseId} data={activity} />

            {shorts && <ArticleShorts of={shorts.of} shorts={shorts.items} what="case" className="m-0" />}

            {meta.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 xl:hidden" aria-label="Tags">
                {meta.tags.map((t) => (
                  <span key={t} className="border border-line-strong px-2 py-1 font-mono text-[11px] text-fg-2">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {(prev || next) && (
              <nav aria-label="More case files" className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-3">
                {prev && (
                  <Link href={`/stories/${prev.slug}`} className="flex flex-col gap-2 border border-line p-5 text-fg no-underline hover:border-line-strong hover:bg-surface hover:text-fg">
                    <span className="font-mono text-xs text-fg-3">
                      ← {prev.caseId} · {CASE_TYPE_LABEL[prev.type].toUpperCase()}
                    </span>
                    <span className="font-display text-xl font-bold leading-[1.15]">{prev.title}</span>
                  </Link>
                )}
                {next && (
                  <Link
                    href={`/stories/${next.slug}`}
                    className="flex flex-col gap-2 border border-line p-5 text-right text-fg no-underline hover:border-line-strong hover:bg-surface hover:text-fg"
                  >
                    <span className="font-mono text-xs text-fg-3">
                      {next.caseId} · {CASE_TYPE_LABEL[next.type].toUpperCase()} →
                    </span>
                    <span className="font-display text-xl font-bold leading-[1.15]">{next.title}</span>
                  </Link>
                )}
              </nav>
            )}

            {comments}
          </article>

          {!focus && (
            <aside aria-label="Case details" className="hidden xl:block">
              <div className="sticky flex flex-col gap-4" style={{ top: `calc(var(--reader-top) + 24px)` }}>
                <div className="flex flex-col gap-3 border border-line bg-surface p-[18px]">
                  <span className="label-mono text-fg-3">Case reward</span>
                  <span className="font-mono text-[28px] font-semibold text-signal-text">
                    {rewardXp > 0 ? `+${rewardXp} XP` : isClosed ? "CLOSED ✓" : "OPEN"}
                  </span>
                  <span className="text-[13px] leading-normal text-fg-2">
                    {rewardXp > 0
                      ? debrief && debriefXp > 0
                        ? "Read every section and pass the debrief."
                        : "Read every section to close the case."
                      : isClosed
                        ? "Filed to your record."
                        : "Read every section to file it to your record."}
                  </span>
                </div>
                {meta.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" aria-label="Tags">
                    {meta.tags.map((t) => (
                      <span key={t} className="border border-line-strong px-2 py-1 font-mono text-[11px] text-fg-2">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      <StorySelectionAsk rootRef={contentRef} title={meta.title} slug={meta.slug} />
      {/* the built-in AI, always at hand while reading: stacked above the read-aloud buttons in the corner */}
      {ai?.features["lesson-qa"] && readAloud.state !== "playing" && readAloud.state !== "paused" && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(ASK_LESSON_EVENT))}
          data-ask-fab
          aria-label="Ask AI about this case file"
          className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+152px)] right-4 z-40 flex h-11 items-center gap-2 bg-signal px-3.5 font-mono text-[12px] font-semibold text-on-signal shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition hover:brightness-110 lg:bottom-[84px] lg:right-6 lg:h-12 lg:px-4 lg:text-[13px]"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          Ask AI<span className="hidden font-normal opacity-80 lg:inline">about this case</span>
        </button>
      )}
      <DeepLinkResolver rootRef={contentRef} />

      {/* Existing ReadAloud controls, restyled from the outside and driven by the toolbar button. */}
      <div ref={dockRef} className={styles.dock}>
        {/* the recorded natural-voice narration (scripts/listen) when it was made from this text; never for an admin draft */}
        <ReadAloud contentRef={contentRef} listenKey={preview ? null : listenKey("case", "", meta.slug)} />
      </div>

      {replaySlot &&
        createPortal(
          <div className="flex flex-wrap items-center justify-between gap-4 border border-dashed border-line-strong px-5 py-5 sm:px-6">
            <span className="text-[15px] leading-normal text-fg-2">You&apos;ve seen the theory. Now try holding the door yourself.</span>
            <Link
              href="/#rush"
              className="inline-flex min-h-11 items-center border border-signal px-4 text-sm font-semibold text-signal-text hover:bg-signal hover:text-on-signal"
            >
              Replay as Tatkal Rush →
            </Link>
          </div>,
          replaySlot
        )}
    </div>
  );
}
