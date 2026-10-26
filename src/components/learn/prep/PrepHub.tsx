"use client";

/**
 * /learn/prep: everything for the interview itself, grouped as who's hiring (companies, the question
 * bank), classic problems (problem bank, low-level design), interview night (revision decks, cheat
 * sheets, design sheets), the real loop (mock interviews solo and with a peer, code labs) and tools
 * (numbers playground, study planner). Each card carries this browser's state where it is cheap to read
 * (localStorage / game state, no extra requests).
 *
 * Offline (a saved copy of this page): every card says whether its page is saved on this device.
 */
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Building2, CalendarDays, Calculator, Code2, FileText, Layers, ListChecks, Map as MapIcon, Mic, PlayCircle, Users } from "lucide-react";
import { useGame } from "@/game/GameProvider";
import { useLabProgress } from "@/lib/learn/labs/progress";
import { labKey } from "@/lib/learn/labs/types";
import { useMockStatus } from "@/lib/learn/mock/store";
import type { CourseMock } from "@/lib/learn/mock/types";
import type { CompanySummary } from "@/lib/learn/prep/types";
import CompanyGrid from "./CompanyGrid";
import { LOGO_NOTE } from "./CompanyLogo";
import { daysBetween } from "@/lib/learn/plan/schedule";
import { fmtDate } from "@/components/learn/progress/derive";
import { usePlanRecord, useToday } from "@/components/learn/plan/usePlan";
import { REVISE_EVENT, readRevise, weekRevised, type ReviseState } from "@/components/learn/revise/store";
import { useOffline } from "@/components/offline/OfflineProvider";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";
import { pathOf } from "@/lib/offline/store";

export type PracticeData = {
  revision: { weeks: { key: string; id: string; code: string; title: string; lessons: string[] }[]; lessons: number; cards: number };
  labs: { id: string; xp: number }[];
  mocks: CourseMock[];
  /** companies with a prep page, and the question bank's size */
  companies: CompanySummary[];
  bank: { questions: number; reported: number };
  /** the problem bank and the low-level design track (lessons) */
  problems: { code: string; title: string; href: string }[];
  lld: { code: string; title: string; href: string }[];
  /** side-quest design sheets */
  sheets: { slug: string; code: string; title: string; href: string; diagrams: number }[];
  lectures: { count: number; minutes: number; first: { href: string; title: string } | null; groups: { name: string; anchor: string; code: string; count: number }[] };
};

const LABEL = "font-mono text-[11px] uppercase tracking-label";

/* ------------------------------------------------------------------ learner state */

function useRevised(): ReviseState | null {
  const [s, setS] = useState<ReviseState | null>(null);
  useEffect(() => {
    const read = () => setS(readRevise());
    read();
    window.addEventListener(REVISE_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(REVISE_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return s;
}

/** Offline: is this page saved on the device? Online everything is reachable. */
function useReach() {
  const { offline, saved, supported } = useOffline();
  return (href: string): "online" | "saved" | "away" => {
    if (!offline) return "online";
    if (!supported) return "away";
    try {
      return saved.has(pathOf(href)) ? "saved" : "away";
    } catch {
      return "away";
    }
  };
}

/* ------------------------------------------------------------------ page */

export default function PracticeHub({ data }: { data: PracticeData }) {
  const { done, hydrated } = useGame();
  const labProgress = useLabProgress();
  const revised = useRevised();
  const mocks = useMockStatus(data.mocks, null);
  const today = useToday();
  const { record } = usePlanRecord();
  const { offline } = useOffline();
  const reach = useReach();

  const ready = hydrated && revised !== null;
  const lessonsRevised = revised ? data.revision.weeks.reduce((a, w) => a + w.lessons.filter((l) => !!revised.lessons[`${w.key}/${l}`]).length, 0) : 0;
  const worldsRevised = revised ? data.revision.weeks.filter((w) => weekRevised(revised, w.key, w.lessons)).length : 0;
  const labsCleared = data.labs.filter((l) => (hydrated && !!done[labKey(l.id)]) || !!labProgress[l.id]?.passedAt).length;
  const labXpLeft = data.labs.filter((l) => !((hydrated && !!done[labKey(l.id)]) || !!labProgress[l.id]?.passedAt)).reduce((a, l) => a + l.xp, 0);
  const mocksDone = mocks.filter((m) => m.state === "done").length;
  const mockLive = mocks.find((m) => m.state === "live") || null;
  const offers = mocks.filter((m) => m.offer).length;
  const daysLeft = record && today ? daysBetween(today, record.settings.target) : null;

  const planLine = !hydrated ? "…" : record && daysLeft !== null ? (daysLeft > 0 ? `interview in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : daysLeft === 0 ? "interview today" : "interview date passed") : "no plan yet";

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-12 px-4 pb-32 pt-10 sm:px-6 sm:pt-16 lg:pb-24">
      {/* hero */}
      <header className="flex flex-col gap-5">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">Learn · interview prep · free, no sign-up</span>
        <h1 className="font-display text-[clamp(44px,7vw,104px)] font-extrabold leading-[0.88] tracking-tightest text-fg">
          Interview prep<span className="text-signal-text">.</span>
        </h1>
        <p className="max-w-[720px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
          The course teaches it; this gets you hired. See what each company asks, work the classic problems, sit a timed mock (alone or with a real person), and revise the night before.
        </p>
        <dl className="m-0 grid grid-cols-2 gap-px self-start border border-line bg-line font-mono sm:flex sm:flex-wrap">
          <Stat label="lessons revised" value={ready ? `${lessonsRevised}` : "–"} of={data.revision.lessons} />
          <Stat label="labs cleared" value={hydrated ? `${labsCleared}` : "–"} of={data.labs.length} />
          <Stat label="mocks done" value={hydrated ? `${mocksDone}` : "–"} of={data.mocks.length} />
          <div className="flex flex-col justify-center bg-bg px-4 py-2.5">
            <dt className="text-[11px] uppercase tracking-label text-fg-3">study plan</dt>
            <dd className={`m-0 text-[15px] font-semibold ${record ? "text-signal-text" : "text-fg"}`}>{planLine}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <SaveOfflineButton title="Interview prep" kind="tool" url="/learn/prep" />
          <Link href="/learn/guide#practice" className="inline-flex min-h-10 items-center font-mono text-[13px] text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
            how each tool works →
          </Link>
        </div>
      </header>

      {/* video lectures */}
      {data.lectures.count > 0 && (
        <Group id="lectures" kicker="video lectures" title="Watch it, in order" aside="Every lecture in course sequence, then the side quests and the rest.">
          <Card
            href="/learn/prep/lectures"
            icon={PlayCircle}
            kicker="all lectures"
            state={`${data.lectures.count} lectures`}
            title="The whole playlist"
            pitch="Animated, narrated lectures for the course's lessons, the side quests and more: the idea, where the obvious design breaks, the real one, and what to say. Quiz checkpoints, and ask the AI about any moment."
            meta={`${Math.floor(data.lectures.minutes / 60)} h ${data.lectures.minutes % 60} min · captions · chapters`}
            reach={reach("/learn/prep/lectures")}
            footer={
              <WorldChips
                label="jump to"
                items={data.lectures.groups.map((g) => ({ href: `/learn/prep/lectures#${g.anchor}`, code: g.code, title: `${g.name} · ${g.count} lecture${g.count === 1 ? "" : "s"}` }))}
                reach={reach}
              />
            }
          />
          {data.lectures.first && (
            <Card
              href={data.lectures.first.href}
              icon={PlayCircle}
              kicker="start here"
              state="lecture 1"
              title={data.lectures.first.title}
              pitch="Begin at the first lecture and keep going: each one ends by playing the next, and picks up where you left off."
              meta="in course order · resumes where you stopped"
              reach={reach(data.lectures.first.href)}
            />
          )}
        </Group>
      )}

      {/* who's hiring */}
      <Group id="hiring" kicker="who's hiring" title="Prep for a company" aside="What candidates reported, with sources, and the lessons that teach it.">
        <div className="col-span-full flex flex-col gap-4">
          {data.companies.length > 0 ? (
            <CompanyGrid companies={data.companies} limit={12} />
          ) : (
            <p className="m-0 border border-dashed border-line p-5 text-[15px] text-fg-3">The company pages are being researched.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href="/learn/prep/companies" className="inline-flex min-h-11 items-center gap-2 border border-line-strong px-4 text-sm font-medium text-fg hover:border-fg-3">
              <Building2 className="h-4 w-4" aria-hidden /> All {data.companies.length} companies
            </Link>
            <Link href="/learn/prep/questions" className="inline-flex min-h-11 items-center gap-2 border border-line-strong px-4 text-sm font-medium text-fg hover:border-fg-3">
              <ListChecks className="h-4 w-4" aria-hidden /> Question bank · {data.bank.questions} questions{data.bank.reported ? ` · ${data.bank.reported} reported` : ""}
            </Link>
          </div>
          <p className="m-0 max-w-[700px] text-[12px] leading-relaxed text-fg-4">{LOGO_NOTE}</p>
        </div>
      </Group>

      {/* classic problems */}
      {(data.problems.length > 0 || data.lld.length > 0) && (
        <Group id="problems" kicker="classic problems" title="The questions everyone asks" aside="Short walkthroughs that link into the full lessons.">
          {data.problems.length > 0 && <ProblemList title="Problem bank" sub="High-level design, 15–30 min each" items={data.problems} reach={reach} />}
          {data.lld.length > 0 && <ProblemList title="Low-level design" sub="Machine coding: classes, interfaces, patterns" items={data.lld} reach={reach} />}
        </Group>
      )}

      {/* interview night */}
      <Group id="night" kicker="interview night" title="Revise fast" aside="For the evening before, or the train to the office.">
        <Card
          href="/learn/revise"
          icon={Layers}
          kicker="revision decks"
          state={ready ? (lessonsRevised ? `${lessonsRevised}/${data.revision.lessons} revised${worldsRevised ? ` · ${worldsRevised} world${worldsRevised === 1 ? "" : "s"} ✓` : ""}` : "not started") : null}
          title="Five minutes a lesson"
          pitch="Swipeable cards: key ideas, numbers to remember, the trade-off table, classic mistakes and what to say when asked."
          meta={`${data.revision.cards} cards · ${data.revision.lessons} lessons`}
          reach={reach("/learn/revise")}
          footer={
            data.revision.weeks.length > 0 && (
              <WorldChips
                label="revise a world"
                items={data.revision.weeks.map((w) => ({
                  href: `/learn/revise/${w.id}`,
                  code: w.code,
                  title: `World ${w.code} · ${w.title} deck`,
                  done: !!revised && weekRevised(revised, w.key, w.lessons),
                }))}
                reach={reach}
              />
            )
          }
        />
        <Card
          href={data.revision.weeks[0] ? `/learn/cheatsheet/${data.revision.weeks[0].id}` : "/learn/revise"}
          icon={FileText}
          kicker="cheat sheets"
          state={`${data.revision.weeks.length} world${data.revision.weeks.length === 1 ? "" : "s"}`}
          title="A whole world on one page"
          pitch="Prints on a single A4 or Letter sheet. Download it as a PDF or share the link."
          meta="print · PDF · share"
          reach={reach(data.revision.weeks[0] ? `/learn/cheatsheet/${data.revision.weeks[0].id}` : "/learn/revise")}
          footer={
            data.revision.weeks.length > 0 && (
              <WorldChips label="open a sheet" items={data.revision.weeks.map((w) => ({ href: `/learn/cheatsheet/${w.id}`, code: w.code, title: `World ${w.code} · ${w.title} cheat sheet` }))} reach={reach} />
            )
          }
        />
        {data.sheets.length > 0 && (
          <Card
            href="/learn/sheets"
            icon={MapIcon}
            kicker="design sheets"
            state={`${data.sheets.length} side quest${data.sheets.length === 1 ? "" : "s"}`}
            title="A whole design in ten minutes"
            pitch="Each side quest on a few pages: the numbers, the architecture with real tech icons, sequence, class and state diagrams, the decisions and what breaks."
            meta={`${data.sheets.reduce((a, s) => a + s.diagrams, 0)} diagrams · PDF · share`}
            reach={reach("/learn/sheets")}
            footer={
              <WorldChips
                label="open a sheet"
                items={data.sheets.map((s) => ({ href: s.href, code: s.code.replace(/^SQ-/, ""), title: `${s.code} · ${s.title} design sheet` }))}
                reach={reach}
              />
            }
          />
        )}
      </Group>

      {/* build & drill */}
      <Group id="drill" kicker="the real loop" title="Do it for real" aside="Timed rounds, a real person, working code.">
        <Card
          href="/learn/labs"
          icon={Code2}
          kicker="code labs"
          state={hydrated ? `${labsCleared}/${data.labs.length} cleared` : null}
          title="Implement it in Python"
          pitch="A rate limiter, an LRU cache, a hash ring, an outbox relay: write it in the browser and run it against hidden tests."
          meta={hydrated && labXpLeft ? `+${labXpLeft} XP to earn` : "runs on your device"}
          reach={reach("/learn/labs")}
        />
        <Card
          href="/learn/mock"
          icon={Mic}
          kicker="mock interviews"
          state={hydrated ? (mockLive ? "round in progress" : `${mocksDone}/${data.mocks.length} done${offers ? ` · ${offers} offer${offers === 1 ? "" : "s"}` : ""}`) : null}
          title="The real loop, timed"
          pitch="An unseen problem from a fictional company, a named interviewer, curveballs, then a levelled rubric and a verdict."
          meta={`${data.mocks.length} loops between worlds`}
          reach={reach("/learn/mock")}
        />
        <Card
          href="/learn/mock/peers"
          icon={Users}
          kicker="peer mocks"
          state="with a real person"
          title="Practise with another learner"
          pitch="Post a time and a mock, someone pairs up, you both get a free video room. One interviews, then you swap."
          meta="needs an account"
          reach={offline ? "away" : "online"}
        />
      </Group>

      {/* tools */}
      <Group id="tools" kicker="tools" title="Numbers and a plan" aside="Estimate out loud; plan to your interview date.">
        <Card
          href="/learn/numbers"
          icon={Calculator}
          kicker="numbers playground"
          state="works offline"
          title="50k QPS × 2 KB × 30 days = ?"
          pitch="Type an estimate the way you'd say it and get the worked answer, next to the latency and size numbers the course teaches."
          meta="calculator · reference numbers"
          reach={reach("/learn/numbers")}
        />
        <Card
          href="/learn/plan"
          icon={CalendarDays}
          kicker="study planner"
          state={hydrated ? (record ? `to ${fmtDate(record.settings.target, true)}` : "no plan yet") : null}
          title={record && daysLeft !== null && daysLeft > 0 ? `Interview in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : "Plan to your interview date"}
          pitch="A day-by-day plan from your real progress, with revision days at the end. Fall behind and it adjusts."
          meta="calendar file · Google Calendar"
          reach={reach("/learn/plan")}
        />
      </Group>
    </main>
  );
}

/* ------------------------------------------------------------------ pieces */

function ProblemList({ title, sub, items, reach }: { title: string; sub: string; items: { code: string; title: string; href: string }[]; reach: (href: string) => Reach }) {
  return (
    <section className="flex flex-col gap-3 border border-line bg-surface p-4 sm:p-[18px]">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 font-display text-[20px] font-bold tracking-[-0.02em] text-fg">{title}</h3>
        <span className={`${LABEL} text-fg-3`}>{items.length}</span>
      </div>
      <p className="m-0 text-[13px] text-fg-3">{sub}</p>
      <ul className="m-0 flex list-none flex-col p-0">
        {items.map((it) => (
          <li key={it.href} className="border-t border-line first:border-t-0">
            <Link href={it.href} className={`flex items-baseline gap-3 py-2 text-[15px] hover:text-signal-text ${reach(it.href) === "away" ? "text-fg-4" : "text-fg"}`}>
              <span className="w-14 shrink-0 font-mono text-xs text-fg-3">{it.code}</span>
              <span>{it.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value, of }: { label: string; value: string; of: number }) {
  return (
    <div className="flex flex-col justify-center bg-bg px-4 py-2.5">
      <dt className="text-[11px] uppercase tracking-label text-fg-3">{label}</dt>
      <dd className="m-0 text-[13px] text-fg-3">
        <span className="text-xl font-semibold text-fg">{value}</span>/{of}
      </dd>
    </div>
  );
}

function Group({ id, kicker, title, aside, children }: { id: string; kicker: string; title: string; aside: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
        <h2 id={`${id}-h`} className="m-0 flex flex-col gap-1">
          <span className={`${LABEL} text-signal-text`}>{kicker}</span>
          <span className="font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-fg sm:text-[34px]">{title}</span>
        </h2>
        <span className="text-[14px] text-fg-3">{aside}</span>
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(290px,100%),1fr))]">{children}</div>
    </section>
  );
}

type Reach = "online" | "saved" | "away";

function ReachTag({ reach }: { reach: Reach }) {
  if (reach === "online") return null;
  return <span className={`${LABEL} ${reach === "saved" ? "text-ok" : "text-fg-4"}`}>{reach === "saved" ? "saved ✓" : "needs a connection"}</span>;
}

/**
 * One tool: the whole card opens it (a stretched link on the title), the footer can hold its own
 * links above that layer (world chips).
 */
function Card({
  href,
  icon: Icon,
  kicker,
  state,
  title,
  pitch,
  meta,
  reach,
  footer,
}: {
  href: string;
  icon: LucideIcon;
  kicker: string;
  state: ReactNode;
  title: string;
  pitch: string;
  meta: ReactNode;
  reach: Reach;
  footer?: ReactNode;
}) {
  const away = reach === "away";
  return (
    <article className={`group relative flex min-w-0 flex-col gap-3 border bg-surface p-5 hover:border-fg-3 ${away ? "border-line" : "border-line-strong"}`}>
      <div className="flex items-start justify-between gap-3">
        <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center border ${away ? "border-line text-fg-4" : "border-line-strong text-signal-text group-hover:border-signal"}`}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <span className="flex min-w-0 flex-col items-end gap-1 text-right">
          <span className={`${LABEL} text-signal-text`}>{kicker}</span>
          {state && <span className="font-mono text-[11px] text-fg-3">{state}</span>}
        </span>
      </div>
      <h3 className="m-0 font-display text-[23px] font-bold leading-[1.08] tracking-[-0.02em] text-fg sm:text-[25px]">
        <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-signal">
          {title}
        </Link>
      </h3>
      <p className={`m-0 text-[14px] leading-relaxed ${away ? "text-fg-3" : "text-fg-2"}`}>{pitch}</p>
      {footer}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 font-mono text-[12px] text-fg-3">
        <span>{meta}</span>
        <span className="ml-auto flex items-center gap-3">
          <ReachTag reach={reach} />
          <span aria-hidden className={away ? "text-fg-4" : "text-signal-text"}>
            open →
          </span>
        </span>
      </div>
    </article>
  );
}

function WorldChips({ label, items, reach }: { label: string; items: { href: string; code: string; title: string; done?: boolean }[]; reach: (href: string) => Reach }) {
  return (
    <div className="relative z-10 flex flex-col gap-1.5">
      <span className={`${LABEL} text-fg-4`}>{label}</span>
      <div className="flex flex-wrap gap-1">
        {items.map((it) => {
          const r = reach(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              title={`${it.title}${it.done ? " · revised" : ""}${r === "saved" ? " · saved offline" : r === "away" ? " · needs a connection" : ""}`}
              className={`inline-grid h-9 min-w-[2.75rem] place-items-center border px-2 font-mono text-xs ${
                r === "away" ? "border-dashed border-line text-fg-4" : it.done ? "border-fg-3 bg-surface-2 text-fg" : "border-line-strong text-fg-2 hover:border-signal hover:text-fg"
              }`}
            >
              <span aria-hidden>
                {it.done ? "✓" : ""}
                {it.code}
              </span>
              <span className="sr-only">{it.title}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

