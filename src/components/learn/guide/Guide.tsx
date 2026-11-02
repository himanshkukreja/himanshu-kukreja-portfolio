/**
 * /guide: how System Design Mastery works. The welcome trailer up top, then the twelve features
 * in the order of the video series, each with its video (or a real screenshot until the video is
 * published), "How to use it" steps, tips, where the AI helps, and the in-depth reference. Numbers
 * come from the code that enforces them (./facts.ts, <ReadingFact/>) and from the live course map, so
 * the guide changes when the product does. Screenshots: `npm run guide:shots`. Videos:
 * src/lib/learn/guide/videos.ts (behind NEXT_PUBLIC_GUIDE_VIDEOS=1 and published.json).
 */
import Link from "next/link";
import type { CourseMap } from "@/lib/learn/types";
import { Marker } from "./Shot";
import { GuideTocMenu, GuideTocSide, type TocItem } from "./GuideToc";
import { LABEL } from "./ui";
import { CASE_ACTIVITIES, LEARN_XP, QUIZ_XP } from "./facts";
import FeatureSection, { type Feature } from "./FeatureSection";
import { guideFeatures } from "./features";
import Reference from "./sections/Reference";
import { COURSE, type GuideLectures } from "./sections/types";
import InlineVideo from "./videos/InlineVideo";
import FullTourButton from "./videos/FullTourButton";
import { FEATURE_VIDEOS, fmtClock, guideVideo } from "@/lib/learn/guide/videos";

export type { GuideLectures };

const LOOP = [
  { t: "Read a lesson", d: "Each lesson is split into stages. Start anywhere; nothing is locked." },
  { t: "Clear stages", d: "A stage clears after real reading. Quick checks inside test you as you go." },
  { t: "Earn XP", d: `+${LEARN_XP.stage} a stage, +${LEARN_XP.lesson} a lesson, +${QUIZ_XP} per quick check right first time.` },
  { t: "Review", d: "What you miss comes back in the daily standup, right before you forget it." },
  { t: "Beat the boss & trial", d: "End each world with a timed interview and the week's MCQ parts. After most worlds, a full mock interview loop." },
  { t: "Climb leagues", d: "Signed in, your activity scores weekly points. The top of each league moves up." },
];

const SCROLL = "scroll-mt-[calc(var(--hk-header-h,61px)+64px)] lg:scroll-mt-[calc(var(--hk-header-h,61px)+24px)]";

/** `caseActivities`: live count (repo TSX activities + published CMS ones); falls back to the repo count. */
export default function Guide({ map, caseActivities = CASE_ACTIVITIES, lectures = null }: { map: CourseMap | null; caseActivities?: number; lectures?: GuideLectures | null }) {
  const s = map?.stats;
  const features = guideFeatures({ map, caseActivities, lectures });
  const trailer = guideVideo("welcome-trailer");
  const videos = FEATURE_VIDEOS.length > 0;
  const toc: TocItem[] = [
    { id: "overview", label: "Start here" },
    ...features.map((f) => ({ id: f.id, n: f.n, label: f.short })),
    { id: "account", label: "Account & data" },
    { id: "faq", label: "FAQ" },
    { id: "glossary", label: "Glossary" },
  ];

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-8 px-4 pb-32 pt-8 sm:px-6 sm:pt-14 lg:pb-24">
      {/* ------------------------------------------------------------ hero */}
      <header id="overview" className={`flex flex-col gap-8 ${SCROLL}`}>
        <div className={trailer ? "grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center xl:gap-12" : "flex flex-col"}>
          <div className="flex flex-col gap-5">
            <span className="font-mono text-xs uppercase tracking-label text-signal-text">Learn · the guide{trailer ? ` · start with the ${Math.max(1, Math.round(trailer.duration / 60))}-minute video` : ""}</span>
            <h1
              className={`m-0 font-display font-extrabold leading-[0.9] tracking-tightest text-fg ${trailer ? "max-w-[14ch] text-[clamp(40px,5.6vw,80px)]" : "max-w-[16ch] text-[clamp(42px,7vw,96px)]"}`}
            >
              How System Design Mastery works<span className="text-signal-text">.</span>
            </h1>
            <p className="m-0 max-w-[62ch] text-[17px] leading-relaxed text-fg-2 sm:text-[18px]">
              A free course{s ? ` of ${s.worlds} worlds, ${s.coreLessons} core lessons, ${s.bosses} interview bosses and ${s.sideQuests} side quests` : ""} where you learn system design by doing: read it, build it, draw it,
              get judged, get interviewed. It&apos;s for engineers preparing for a system design interview, developers who want to design real systems, students who have never designed one and anyone moving into backend or a
              senior role. Reading never needs an account. Below, every feature {videos ? "has a short video" : "comes with screenshots"} and the steps to use it.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={COURSE} className="inline-flex min-h-12 items-center bg-signal px-6 text-[15px] font-semibold text-on-signal hover:brightness-110">
                Open the course →
              </Link>
              <FullTourButton />
            </div>
          </div>
          {trailer && (
            <div className="flex min-w-0 flex-col gap-2">
              <InlineVideo id="welcome-trailer" priority showChapters={false} sizes="(min-width: 1320px) 700px, (min-width: 1024px) 56vw, 100vw" />
              <p className="m-0 font-mono text-[11.5px] leading-relaxed text-fg-3">The videos show a demo learner on the real site; the counts on screen may have grown since.</p>
            </div>
          )}
        </div>

        <ol aria-label="The core loop" className="m-0 grid list-none grid-cols-1 gap-px border border-line bg-line p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {LOOP.map((step, i) => (
            <li key={step.t} className="flex flex-col gap-2 bg-bg p-4">
              <span className="flex items-center gap-2">
                <Marker n={i + 1} />
                <span className="text-[16px] font-semibold text-fg">{step.t}</span>
                {i < LOOP.length - 1 && <span aria-hidden className="ml-auto font-mono text-fg-4 xl:hidden">↓</span>}
              </span>
              <span className="text-[14px] leading-snug text-fg-2">{step.d}</span>
            </li>
          ))}
        </ol>
      </header>

      <GuideTocMenu items={toc} />

      <div className="grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)] xl:gap-14">
        <aside className="hidden lg:block">
          <GuideTocSide items={toc} />
        </aside>

        <div className="flex min-w-0 flex-col gap-16">
          <FeatureIndex features={features} videos={videos} />
          {features.map((f) => (
            <FeatureSection key={f.id} f={f} />
          ))}
          <Reference />
        </div>
      </div>
    </main>
  );
}

/** The twelve features at a glance: one tile each, jumping to its section. */
function FeatureIndex({ features, videos }: { features: Feature[]; videos: boolean }) {
  return (
    <section id="features" aria-labelledby="features-h" className={`relative flex flex-col gap-4 ${SCROLL}`}>
      <span id="glance" aria-hidden className={`absolute left-0 top-0 h-px w-px ${SCROLL}`} />
      <div className="flex flex-col gap-2">
        <span className={LABEL}>the twelve features{videos ? " · a short video each" : ""}</span>
        <h2 id="features-h" className="m-0 font-display text-[30px] font-extrabold leading-none tracking-[-0.035em] text-fg sm:text-[40px]">
          Everything in the course<span className="text-signal-text">.</span>
        </h2>
      </div>
      <ol className="m-0 grid list-none grid-cols-1 gap-px border border-line bg-line p-0 sm:grid-cols-2 xl:grid-cols-3">
        {features.map((f) => {
          const v = guideVideo(f.video);
          return (
            <li key={f.id} className="flex">
              <a href={`#${f.id}`} className="group flex w-full flex-col gap-1.5 bg-bg p-4 hover:bg-surface">
                <span className="flex items-baseline gap-2.5">
                  <span className="font-mono text-[12px] font-semibold text-signal-text">{f.n}</span>
                  <span className="text-[16px] font-semibold leading-snug text-fg group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">{f.title}</span>
                  {v && (
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-fg-3">
                      <span aria-hidden className="text-signal-text">▶</span> {fmtClock(v.duration)}
                      <span className="sr-only"> video</span>
                    </span>
                  )}
                </span>
                <span className="text-[13.5px] leading-snug text-fg-2 max-sm:hidden">{f.line}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
