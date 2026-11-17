"use client";

/**
 * The DSA course home (redesign Phase 1): the kicker, the Continue card, "Your course" with its totals and the outline in
 * the main column; Today, the tutor, interview readiness and quick review in a 320 px column beside it (computers only: on
 * phones the order is kicker, Continue, two small tiles, the outline). The page around it is static ISR; everything
 * personal (progress, Continue, the column) paints in on the client.
 */
import { useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/contexts/AuthContext";
import QuietNudge from "@/components/learn/plan/QuietNudge";
import ReadinessCard from "@/components/learn/progress/ReadinessCard";
import { nextStep, bucketsOf, type ConceptInfo, type ProblemInfo } from "@/lib/dsa/continue";
import { moduleOfLesson, type Outline } from "@/lib/dsa/outline";
import type { WorldSpec } from "@/lib/dsa/types";
import { useDsaProgress } from "../progress/useDsaProgress";
import { openOnboarding, useRecommendedStart } from "../onboarding/useOnboarding";
import { useWelcome } from "../simple/view";
import ContinueCard from "./ContinueCard";
import CourseOutline from "./CourseOutline";
import QuickReview from "./QuickReview";
import TodayCard, { TodayTiles } from "./TodayCard";
import TutorCard from "./TutorCard";
import Welcome from "./Welcome";
import type { LectureRef } from "./useLectureSeconds";
import { FILL, SECTION_H, SEG, TRACK, seg } from "../ui/kit";

const VIEW_EVENT = "dsa:home-view";
const DESKTOP = "(min-width: 1024px)";
function useDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(DESKTOP);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

export type HomeProps = {
  outline: Outline;
  academy: WorldSpec;
  concepts: ConceptInfo[];
  problems: ProblemInfo[];
  lectures: Record<string, LectureRef>;
  mediaBase: string | null;
  /** short ids by lesson id, for Quick review */
  shorts: Record<string, string[]>;
  /** phase-2 widgets (course path, warm-up, heatmap) slot in here without a restyle: above Continue, and atop the side column */
  slots?: { top?: React.ReactNode; side?: React.ReactNode };
};

export default function CourseHome({ outline, academy, concepts, problems, lectures, mediaBase, shorts, slots }: HomeProps) {
  const progress = useDsaProgress();
  const welcome = useWelcome();
  const { user, profile, loading } = useAuth();
  const desktop = useDesktop();
  const recommended = useRecommendedStart(academy);
  // "?view=lectures" is read here, on the client, so the page itself stays one static ISR page
  const lecturesView = useSyncExternalStore(
    (cb) => {
      window.addEventListener(VIEW_EVENT, cb);
      window.addEventListener("popstate", cb);
      return () => {
        window.removeEventListener(VIEW_EVENT, cb);
        window.removeEventListener("popstate", cb);
      };
    },
    () => new URLSearchParams(window.location.search).get("view") === "lectures",
    () => false,
  );
  const setView = (lectures: boolean) => {
    const u = new URL(window.location.href);
    if (lectures) u.searchParams.set("view", "lectures");
    else u.searchParams.delete("view");
    window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    window.dispatchEvent(new Event(VIEW_EVENT));
  };

  const next = useMemo(() => (progress.ready ? nextStep(academy, concepts, problems, progress, { startRegion: recommended }) : null), [academy, concepts, problems, progress, recommended]);
  const here = next && next.state !== "empty" && next.state !== "caught-up" ? next : null;

  // the current lesson's practice problems (for the tutor card's sentence)
  const practice = useMemo(() => {
    if (!here) return [];
    const region = academy.regions.find((r) => r.code === here.regionCode);
    return (region ? (bucketsOf(region).get(here.lessonId)?.practice ?? []) : []).filter((p) => p.built && p.ref).map((p) => ({ id: p.ref!, title: p.title }));
  }, [academy, here]);

  // Quick review: the shorts of the lesson the learner is on, then of the last lesson they finished
  const quick = useMemo(() => {
    const ids: string[] = [];
    if (here) ids.push(...(shorts[here.lessonId] ?? []).slice(0, 2));
    const finished = outline.parts.flatMap((p) => p.modules.flatMap((m) => m.lessons)).filter((l) => progress.concepts.has(l.conceptId) && l.conceptId !== here?.lessonId);
    for (const l of finished.slice().reverse()) for (const s of shorts[l.conceptId] ?? []) if (ids.length < 3 && !ids.includes(s)) ids.push(s);
    for (const s of (here ? shorts[here.lessonId] : []) ?? []) if (ids.length < 3 && !ids.includes(s)) ids.push(s);
    return ids;
  }, [here, shorts, outline, progress.concepts]);

  const totals = useMemo(() => {
    const lessons = outline.parts.flatMap((p) => p.modules.flatMap((m) => m.lessons)).filter((l) => l.built);
    const done = lessons.filter((l) => progress.concepts.has(l.conceptId)).length;
    const bank = new Set(problems.map((p) => p.id));
    let solved = 0;
    for (const id of progress.solved) if (bank.has(id)) solved++;
    return { done, ready: outline.totals.ready, planned: outline.totals.planned, solved, problems: problems.length };
  }, [outline, progress.concepts, progress.solved, problems]);

  const firstName = (profile?.full_name || "").trim().split(/\s+/)[0] || "";
  const returning = !!here && here.state === "continue";
  const kicker = returning && firstName ? `Welcome back, ${firstName}` : returning ? "Welcome back" : "DSA Mastery";
  const welcomeCard = welcome === undefined || (welcome === null && loading);
  const showWelcome = welcome === null && !user && !loading;
  const currentModule = here ? moduleOfLesson(outline, here.lessonId) : null;

  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1248px] flex-col gap-10 px-4 pb-28 pt-[18px] sm:px-6 sm:pt-9 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:gap-7">
          <p className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3 sm:text-[12px]">{kicker}</p>

          {/* phase-2 slot: the course path / warm-up widgets sit here, above Continue */}
          {slots?.top ? <div data-slot="home-top">{slots.top}</div> : null}

          {welcomeCard ? <div aria-hidden className="min-h-[260px] rounded-2xl border border-line bg-surface sm:min-h-[330px] sm:rounded-[18px]" /> : showWelcome ? <Welcome /> : <ContinueCard next={next ?? { state: "empty" }} ready={progress.ready && !!next} />}
          {/* one quiet line for a DSA topic missed twice lately (signed-in learners; nothing for guests) */}
          <QuietNudge course="dsa" className="-mt-2 sm:-mt-3" />

          <TodayTiles />

          <section aria-labelledby="dsa-course-h" className="mt-1.5 flex flex-col gap-3 sm:mt-0 sm:gap-[18px]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <h2 id="dsa-course-h" className={SECTION_H}>
                    Your course
                  </h2>
                  <p className="m-0 mt-1.5 hidden text-[14px] text-fg-3 sm:block">Four parts, in order. Skip ahead any time: nothing is locked.</p>
                  <div className="mt-3">
                <div role="group" aria-label="Outline view" className={SEG}>
                  {[
                    { on: !lecturesView, label: "Lessons", pick: () => setView(false) },
                    { on: lecturesView, label: "Lectures", pick: () => setView(true) },
                  ].map((b) => (
                    <button key={b.label} type="button" aria-pressed={b.on} onClick={b.pick} className={`${seg(b.on)} !min-h-8 !px-3 !text-[12.5px]`}>
                      {b.label}
                    </button>
                  ))}
                </div>
                  </div>
                </div>
                <span className="shrink-0 text-[12px] text-fg-3 sm:hidden">
                  {totals.done} of {totals.ready} lessons
                </span>
              </div>
              <div className="hidden flex-col gap-2 sm:flex sm:w-[320px]">
                <div className="flex justify-between gap-3 text-[13px] text-fg-2">
                  <span>
                    {totals.done} of {totals.ready} lessons{totals.planned ? <span className="text-fg-3"> · {totals.planned} planned</span> : null}
                  </span>
                  <span className="shrink-0">
                    {totals.solved} of {totals.problems} problems
                  </span>
                </div>
                <span aria-hidden className={TRACK}>
                  <span className={`${FILL} bg-signal`} style={{ width: `${totals.ready ? Math.round((totals.done / totals.ready) * 100) : 0}%` }} />
                </span>
              </div>
            </div>
            <CourseOutline
              outline={outline}
              progress={progress}
              currentCode={currentModule?.mod.regionCode ?? null}
              nowLesson={here?.lessonId ?? null}
              lectures={lectures}
              mediaBase={mediaBase}
              lecturesView={lecturesView}
            />
          </section>

          {user ? (
            <button type="button" onClick={openOnboarding} className="min-h-10 self-start text-[13px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
              Redo the welcome tour
            </button>
          ) : null}
        </div>

        {/* reserved at 360 px on computers so the page doesn't shift when it fills in; nothing mounts on phones */}
        <aside aria-label="Today and review" className="hidden w-[360px] shrink-0 flex-col gap-[18px] pt-[30px] lg:sticky lg:top-[76px] lg:flex lg:max-h-[calc(100vh-92px)] lg:overflow-y-auto lg:overscroll-contain lg:pb-1">
          {desktop ? (
            <>
              {slots?.side ? <div data-slot="home-side">{slots.side}</div> : null}
              <TodayCard />
              {next ? <TutorCard next={next} problems={practice} /> : null}
              <ReadinessCard tracks={["dsa"]} id="dsa-home-readiness" compact rounded />
              <QuickReview ids={quick} />
            </>
          ) : null}
        </aside>
      </main>
    </div>
  );
}
