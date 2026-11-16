"use client";

/**
 * The left pane of the problem page: Problem | Hints | Editorial | Solutions | Video. Problem holds the statement,
 * examples, constraints, meta, "Explain this problem simply" and the one-hint-at-a-time box. Hints, Editorial, Solutions
 * and Video need a sign-in; the last three keep the reveal rule (a solve, three failed submits, or "show the editorial").
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo } from "react";
import { Lock, MessageCircleQuestion, PlayCircle } from "lucide-react";
import styles from "@/components/learn/lesson/reader.module.css";
import { loadCourseEnhancer } from "@/lib/offline/lazy";
import ConnectedPanel from "@/components/learn/connections/ConnectedPanel";
import ConfirmDialog from "@/components/ConfirmDialog";
import { GateNotice } from "@/components/gate/SignInGate";
import Jargon from "../glossary/Jargon";
import DsaHydrator from "../concept/DsaHydrator";
import SolutionVideo from "./SolutionVideo";
import { mmss, type Room, type Tab } from "./useProblemRoom";

const CourseEnhancer = dynamic(loadCourseEnhancer, { ssr: false });

const PILL = "inline-flex min-h-9 items-center gap-1.5 rounded-[9px] border border-line-strong px-3 text-[14px] text-fg-2 hover:bg-surface-2 hover:text-fg";

function Html({ html, className = "" }: { html: string; className?: string }) {
  return <div className={`course-content ${styles.content} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

const LEVEL_TONE: Record<string, string> = { easy: "text-ok-text", medium: "text-[var(--c-amber)]", hard: "text-bad-text" };

/** "n ≤ 200,000" from the constraints, for the complexity-budget link (null when the statement has no such bound). */
function boundOf(html: string): string | null {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&le;|&lt;=/g, "≤").replace(/&amp;/g, "&");
  const m = text.match(/\b([nNmM])\s*(?:≤|<=)\s*(\d[\d,_]*)/);
  return m ? `${m[1]} ≤ ${m[2].replace(/_/g, ",")}` : null;
}

export default function ProblemTabs({ room }: { room: Room }) {
  const { p, tab, setTab, unlocked, gate, hints, editorial, videoTeaser, tabsRef } = room;
  const hasVideo = !!videoTeaser || !!editorial.video;
  const lockedWord = gate.locked ? "sign in to open" : "opens after a solve";
  const tabs: { id: Tab; label: string; note?: string; locked?: boolean }[] = [
    { id: "problem", label: "Problem" },
    { id: "hints", label: "Hints", note: `${hints}/${p.hints.length}`, locked: gate.locked },
    { id: "editorial", label: "Editorial", locked: gate.locked || !unlocked },
    { id: "solutions", label: "Solutions", note: "4 langs", locked: gate.locked || !unlocked },
    ...(hasVideo ? [{ id: "video" as const, label: "Video", note: videoTeaser ? `${Math.max(1, Math.round(videoTeaser.duration / 60))} min` : undefined, locked: gate.locked || !unlocked }] : []),
  ];
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={tabsRef} role="tablist" aria-label="Problem" className="flex shrink-0 scroll-mt-[calc(var(--hk-header-h,61px)+56px)] gap-0.5 overflow-x-auto border-b border-line px-2.5 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`pt-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="pt-panel"
            onClick={() => setTab(t.id)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 text-[14px] [@media(pointer:coarse)]:min-h-11 ${tab === t.id ? "border-signal font-semibold text-fg" : "border-transparent font-medium text-fg-3 hover:text-fg"}`}
          >
            {t.label}
            {t.note && <span className="font-mono text-[11px] text-fg-3">{t.note}</span>}
            {t.locked && <Lock className="h-3 w-3 text-fg-3" aria-label={lockedWord} />}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="pt-panel" aria-labelledby={`pt-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-[26px] sm:py-6">
        {tab === "problem" && <ProblemTab room={room} />}
        {tab === "hints" && <HintsTab room={room} />}
        {(tab === "editorial" || tab === "solutions" || tab === "video") && <RevealTab room={room} which={tab} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Problem */

function HintBox({ room }: { room: Room }) {
  const { p, hints, openHint, gate, setTab } = room;
  const next = p.hints[hints];
  const last = hints > 0 ? p.hints[hints - 1] : null;
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-4 py-3.5" data-hint-box>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-semibold text-fg">Stuck? One hint at a time</span>
        <span className="font-mono text-[12px] text-fg-3">
          {hints} of {p.hints.length} shown
        </span>
      </div>
      {gate.locked ? (
        <button type="button" onClick={() => gate.ask("hints")} className="inline-flex min-h-9 items-center gap-2 self-start rounded-[9px] border border-line-strong px-3 text-[13px] font-medium text-fg hover:bg-surface-2">
          <Lock className="h-3.5 w-3.5" aria-hidden /> Sign in to open the hints
        </button>
      ) : (
        <>
          {last && (
            <p className="m-0 text-[14px] leading-relaxed text-fg-2">
              <span className="font-mono text-[12px] text-signal-text">Hint {hints}: </span>
              {last.title.replace(/^Rung \d+:\s*/, "")}.{" "}
              <button type="button" onClick={() => setTab("hints")} className="text-signal-text underline decoration-line-strong underline-offset-4">
                Read it
              </button>
            </p>
          )}
          {next ? (
            <button type="button" onClick={() => openHint()} className="inline-flex min-h-9 items-center self-start rounded-[9px] border border-line-strong px-3 text-[13px] font-medium text-fg hover:bg-surface-2">
              Show hint {hints + 1}
            </button>
          ) : (
            <p className="m-0 font-mono text-[12px] text-fg-3">All hints are open.</p>
          )}
        </>
      )}
    </div>
  );
}

function ProblemTab({ room }: { room: Room }) {
  const { p, solved, isDaily, statementRef, explain, videoTeaser, unlocked, gate, showLeft, fails } = room;
  const constraints = p.sections.find((s) => s.id === "constraints");
  const bound = useMemo(() => (constraints ? boundOf(constraints.html) : null), [constraints]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="m-0 min-w-0 flex-1 font-display text-[24px] font-extrabold leading-[1.1] tracking-[-0.02em] text-fg sm:text-[28px]">{p.title}</h1>
          <span className={`rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[12px] uppercase ${LEVEL_TONE[p.level] || "text-fg-2"}`}>{p.level}</span>
          {solved && <span className="rounded-full border border-ok px-2.5 py-0.5 font-mono text-[12px] uppercase text-ok-text">✓ Solved</span>}
          {isDaily.daily && (
            <Link href="/dsa/daily" className="rounded-full border border-signal px-2.5 py-0.5 font-mono text-[12px] uppercase text-signal-text hover:bg-surface-2">
              Daily #{isDaily.number}
            </Link>
          )}
        </div>
        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px] text-fg-3" data-problem-meta>
          {p.lineLabel && <span>{p.lineLabel}</span>}
          {p.minutes ? <span>~{p.minutes} min</span> : null}
          <span>
            {p.limits.timeMs / 1000}s · {p.limits.memoryMb} MB
          </span>
          {p.complexity && (
            <span title="The complexity this problem is aimed at">
              target {p.complexity.time} time, {p.complexity.space} space
            </span>
          )}
          {p.classic.length > 0 && <span>classic twin: {p.classic.join(", ")}</span>}
          {p.patterns.length > 0 && <span>{p.patterns.join(" · ")}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={explain} className="inline-flex min-h-9 items-center gap-1.5 rounded-[9px] border border-signal px-3 text-[14px] font-medium text-signal-text hover:bg-[var(--c-dsa-hl)]">
            <MessageCircleQuestion className="h-4 w-4" aria-hidden />
            Explain this problem simply
          </button>
          {videoTeaser && (
            <button type="button" onClick={() => showLeft("video")} className={PILL}>
              <PlayCircle className="h-4 w-4 text-signal-text" aria-hidden />
              Solution video · {mmss(videoTeaser.duration)}
              {(!unlocked || gate.locked) && <Lock className="h-3.5 w-3.5 text-fg-3" aria-label={gate.locked ? "opens when you sign in" : "opens with the editorial"} />}
            </button>
          )}
        </div>
      </div>

      <div ref={statementRef} className={`course-content ${styles.content} flex flex-col gap-2`} data-problem-statement>
        {/* "Scenario to model" is hint rung 1, so it isn't repeated here */}
        {p.sections
          .filter((s) => s.id !== "model")
          .map((s) => (
            <section key={s.id} aria-labelledby={`ps-${s.id}`}>
              <h2 id={`ps-${s.id}`} className="!m-0 !mb-1 !mt-4 font-mono !text-[12px] font-normal uppercase tracking-label text-fg-3">
                {s.title}
              </h2>
              <div className={s.id === "task" ? "rounded-[10px] bg-bg px-4 py-3" : ""} dangerouslySetInnerHTML={{ __html: s.html }} />
            </section>
          ))}
        <CourseEnhancer lessonKey={`dsa/${p.id}`} />
        <Jargon rootRef={statementRef} deps={p.id} />
      </div>

      <Link href="/dsa/complexity" className="self-start text-[14px] text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
        {bound ? `What fits ${bound}?` : "What fits these limits?"} Open the complexity budget
      </Link>

      <HintBox room={room} />
      {fails > 0 && !unlocked && (
        <p className="m-0 font-mono text-[12px] text-fg-3">
          {fails}/3 failed submits: the editorial, solutions and video open at 3.
        </p>
      )}

      <ConnectedPanel page={`dsa-problem:${p.id}`} className="mt-2" />
      {p.sdmLinks.length > 0 && (
        <aside aria-label="Related" className="flex flex-col gap-2 border-t border-line pt-4">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Where this is used: System Design Mastery</span>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {p.sdmLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-line px-3 text-[13px] text-fg hover:bg-surface-2">
                  <span className="font-mono text-[10px] uppercase tracking-label text-signal-text">{l.kind === "lab" ? "Lab" : l.kind === "problem" ? "Problem" : "Lesson"}</span>
                  {l.title}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Hints */

function HintsTab({ room }: { room: Room }) {
  const { p, hints, openHint, gate } = room;
  if (gate.locked) return <GateNotice kind="dsa-problem" feature="hints" title="Sign in to open the hints" />;
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[14px] text-fg-2">Five hints, from restating the task to a skeleton with blanks. Open one at a time and try again after each.</p>
      {p.hints.slice(0, hints).map((h, i) => (
        <article key={i} className="rounded-xl border border-line bg-surface px-4 py-2">
          <h3 className="m-0 mt-2 font-mono text-[12px] uppercase tracking-label text-signal-text">{h.title}</h3>
          <Html html={h.html} />
        </article>
      ))}
      {hints < p.hints.length ? (
        <button type="button" onClick={() => openHint()} className="min-h-11 self-start rounded-[10px] border-2 border-signal px-4 text-[15px] font-semibold text-signal-text hover:bg-[var(--c-dsa-hl)]">
          Open hint {hints + 1}: {p.hints[hints]?.title.replace(/^Rung \d+:\s*/, "")}
        </button>
      ) : (
        <p className="m-0 font-mono text-[12px] text-fg-3">All five hints are open. The editorial opens after a solve or three failed submits.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Editorial, Solutions, Video */

const WHAT: Record<"editorial" | "solutions" | "video", { title: string; of: string }> = {
  editorial: { title: "the editorial", of: "The write-up: the first attempt, the key insight, the pattern and the invariant." },
  solutions: { title: "the solutions", of: "Reference solutions in Python, JavaScript, Java and C++, marked step by step." },
  video: { title: "the solution video", of: "A narrated walkthrough with captions and chapters." },
};

function RevealTab({ room, which }: { room: Room; which: "editorial" | "solutions" | "video" }) {
  const { p, unlocked, gate, fails, editorial, videoTeaser, hints, openHint, setAskReveal, askReveal, revealEditorial, revealText, editorialRef, solutionsRef, lang, setTab } = room;
  const what = WHAT[which];
  if (gate.locked) {
    const title = which === "video" && videoTeaser ? `Sign in for the ${mmss(videoTeaser.duration)} solution video` : which === "solutions" ? "Sign in for the four-language solutions" : "Sign in for the editorial and the solutions";
    return <GateNotice kind="dsa-problem" feature={which} title={title} />;
  }
  if (!unlocked) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
        <p className="m-0 text-[15px] text-fg">
          <Lock className="mr-1.5 inline h-4 w-4 align-[-2px] text-fg-3" aria-hidden />
          {which === "editorial" ? "The editorial, the solutions and the video open" : `${what.title[0].toUpperCase()}${what.title.slice(1)} opens with the editorial`}: after you solve the problem, or after three failed submits ({fails}/3 so far).
        </p>
        <p className="m-0 text-[14px] text-fg-2">{what.of} Keeping them closed first keeps the practice worth doing.</p>
        {videoTeaser && which === "video" && (
          <div className="relative aspect-video w-full max-w-[560px] overflow-hidden rounded-xl bg-[var(--c-plate)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={videoTeaser.poster} alt="" className="h-full w-full object-cover opacity-40 blur-[6px]" loading="lazy" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-[var(--c-plate-fg)]">
              <Lock className="h-6 w-6" aria-hidden />
              <span className="font-mono text-[12px] uppercase tracking-label">Solution video · {mmss(videoTeaser.duration)}</span>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {hints < p.hints.length && (
            <button type="button" onClick={() => (openHint(), setTab("hints"))} className="inline-flex min-h-11 items-center rounded-[10px] border-2 border-signal px-4 text-[14px] font-semibold text-signal-text hover:bg-[var(--c-dsa-hl)]">
              Open hint {hints + 1} instead
            </button>
          )}
          <button type="button" onClick={() => setAskReveal(true)} className="min-h-11 rounded-[10px] border border-line-strong px-4 text-[14px] text-fg-2 hover:text-fg">
            Give up and show the editorial
          </button>
        </div>
        <RevealDialog open={askReveal} text={revealText} onYes={revealEditorial} onNo={() => setAskReveal(false)} />
      </div>
    );
  }
  if (editorial.state === "error") return <p className="m-0 text-[14px] text-bad-text">The editorial couldn&apos;t load. Please try again.</p>;
  if (editorial.state !== "ready") return <p className="m-0 text-[14px] text-fg-3">Loading…</p>;
  if (which === "video") {
    return editorial.video ? (
      <div id="solution-video">
        <SolutionVideo video={editorial.video} lang={lang} />
      </div>
    ) : (
      <p className="m-0 text-[14px] text-fg-3">There is no solution video for this problem yet.</p>
    );
  }
  const html = which === "editorial" ? editorial.editorial : editorial.solutions;
  const ref = which === "editorial" ? editorialRef : solutionsRef;
  if (!html) return <p className="m-0 text-[14px] text-fg-3">{which === "solutions" ? "The solutions are part of the editorial for this problem." : "No editorial for this problem yet."}</p>;
  return (
    <div ref={ref} className="flex flex-col gap-4">
      {which === "editorial" && editorial.video && (
        <button type="button" onClick={() => setTab("video")} className={`${PILL} self-start`}>
          <PlayCircle className="h-4 w-4 text-signal-text" aria-hidden /> Watch the solution video
        </button>
      )}
      <Html html={html} />
      <DsaHydrator rootRef={ref} deps={`${which}${html.length}`} />
      {/* the code blocks' Copy (and other chrome) buttons bind inside the pane */}
      <CourseEnhancer lessonKey={`dsa/${p.id}/${which}`} />
    </div>
  );
}

function RevealDialog({ open, text, onYes, onNo }: { open: boolean; text: string; onYes: () => void; onNo: () => void }) {
  return <ConfirmDialog isOpen={open} tone="notice" title="Show the editorial?" message={text} confirmText="Show the editorial" cancelText="Keep trying" onConfirm={onYes} onCancel={onNo} />;
}
