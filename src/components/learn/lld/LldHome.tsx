"use client";

/**
 * /low-level-design: the home of the LLD section. Two halves, a suggested path and a pattern map:
 *   Design patterns   the catalogue by group (Foundations, Creational, Structural, Behavioural, In practice)
 *   Case studies      the 22 problems as cards with filters by pattern, difficulty and company
 * Progress is read in the browser (the same record the lessons write), so the page itself is static.
 * "Your LLD certificate" counts the same records (n/58: 28 pattern lessons + 30 case studies) and links
 * to /certificate#lld, where the claim is checked again on the server from the account's records.
 * The filter logic is pure (src/lib/learn/lld/filters.ts, tested); filters live in the URL so a
 * filtered list can be shared.
 */
import Link from "next/link";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { COURSE_ID } from "@/lib/learn/paths";
import { lessonKey } from "@/lib/learn/types";
import { useLearnProgress, type LessonProgress } from "@/lib/learn/progress";
import { useAuth } from "@/contexts/AuthContext";
import ReadinessCard from "@/components/learn/progress/ReadinessCard";
import { useGame } from "@/game/GameProvider";
import { LLD_CASES_NEEDED, LLD_CERT_HREF, LLD_CERT_NAME, LLD_PATTERNS_NEEDED } from "@/lib/certificates/core";
import { CORE_PATTERNS, PATTERN_GROUPS, PATTERNS, caseBySlug, patternBySlug, patternChipName, patternLessonId, type Difficulty } from "@/lib/learn/lld/meta";
import { NO_FILTERS, casePct, facets, filterCases, filtersToQuery, hasFilters, nextOnPath, parseFilters, patternMap, suggestedPath, type CaseRow, type Filters } from "@/lib/learn/lld/filters";
import { STEPS } from "@/lib/learn/lld/steps";
import LldIntroVideo from "@/components/learn/lld/LldIntroVideo";
import type { IntroVideo } from "@/lib/learn/lld/intro";

const LABEL = "font-mono text-[11px] uppercase tracking-label text-fg-3";
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";
const patternHref = (slug: string) => `/low-level-design/patterns/${slug}`;

const urlListeners = new Set<() => void>();
function subscribeUrl(cb: () => void) {
  urlListeners.add(cb);
  window.addEventListener("popstate", cb);
  return () => {
    urlListeners.delete(cb);
    window.removeEventListener("popstate", cb);
  };
}

/** Steps the learner has finished of a case study, and the card's progress (0-100). */
function progressOf(p: LessonProgress | undefined) {
  const steps = (p?.completedStages ?? []).filter((s) => /^step-[1-7]$/.test(s)).length;
  const pct = p?.status === "completed" ? 100 : Math.max(casePct(p), Math.min(99, Math.round((steps / STEPS.length) * 100)));
  return { steps, pct, state: p?.status === "completed" ? "done" : pct > 0 || p?.status === "in_progress" ? "started" : "new" } as const;
}

export default function LldHome({ cases, livePatterns, intro = null }: { cases: CaseRow[]; livePatterns: string[]; intro?: IntroVideo | null }) {
  const { lessons, ready } = useLearnProgress(COURSE_ID);
  const live = useMemo(() => new Set(livePatterns), [livePatterns]);
  const [mapPick, setMapPick] = useState<string | null>(null);

  const known = useMemo(() => ({ patterns: PATTERNS.map((p) => p.slug), companies: cases.flatMap((c) => c.companies.map((x) => x.slug)) }), [cases]);
  // the filters live in the URL (shareable); the page is static, so they are read in the browser
  const search = useSyncExternalStore(subscribeUrl, () => window.location.search, () => "");
  const filters = useMemo(() => parseFilters(new URLSearchParams(search), known), [search, known]);
  const apply = useCallback((next: Filters) => {
    try {
      window.history.replaceState(null, "", `${window.location.pathname}${filtersToQuery(next)}${window.location.hash}`);
    } catch {
      /* the list still filters */
    }
    urlListeners.forEach((l) => l());
  }, []);

  const shown = useMemo(() => filterCases(cases, filters), [cases, filters]);
  const fac = useMemo(() => facets(cases, filters, PATTERNS), [cases, filters]);
  const map = useMemo(() => patternMap(cases), [cases]);
  const path = useMemo(() => suggestedPath(cases, PATTERNS, CORE_PATTERNS), [cases]);
  const prog = (slug: string) => progressOf(lessons[lessonKey("low-level-design", slug)]);
  const done = useMemo(() => new Set(cases.filter((c) => progressOf(lessons[lessonKey("low-level-design", c.slug)]).state === "done").map((c) => c.slug)), [cases, lessons]);
  const next = ready ? nextOnPath(path, done) : null;
  const startedAny = ready && cases.some((c) => progressOf(lessons[lessonKey("low-level-design", c.slug)]).state !== "new");
  const nextCase = next ? cases.find((c) => c.slug === next.case) : null;
  // the design-pattern lessons come first (owner, 11 Nov 2026): progress and the next lesson start there
  const patDone = (slug: string) => progressOf(lessons[lessonKey("low-level-design", patternLessonId(patternBySlug(slug)!))]).state === "done";
  const livePats = PATTERNS.filter((p) => live.has(p.slug));
  const patsDone = ready ? livePats.filter((p) => patDone(p.slug)).length : 0;
  const nextPat = ready ? livePats.find((p) => !patDone(p.slug)) : livePats[0];
  const { user } = useAuth();
  const { done: game } = useGame();
  const cert = {
    patterns: { done: ready ? PATTERNS.filter((p) => patDone(p.slug)).length : 0, total: Math.max(LLD_PATTERNS_NEEDED, PATTERNS.length) },
    cases: { done: ready ? done.size : 0, total: Math.max(LLD_CASES_NEEDED, cases.length) },
    certified: !!game["cert:lld"],
    signedIn: !!user,
  };

  return (
    <main className="pb-20">
      {/* ------------------------------------------------------------ header */}
      <section className="mx-auto max-w-[1320px] px-4 pb-6 pt-2 sm:px-6 sm:pt-4 lg:pb-8 lg:pt-7">
        <nav aria-label="Breadcrumb" className="flex items-center gap-x-2 font-mono text-[12px] sm:text-[13px]">
          <Link href="/" className="py-3 text-fg-3 hover:text-fg">course</Link>
          <span aria-hidden className="text-line-strong">›</span>
          <span aria-current="page" className="text-fg">Low-level design</span>
        </nav>
        {/* the intro video sits beside the hero from lg; below it on phones */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:items-start lg:gap-10">
        <div className="min-w-0">
        <p className={`${LABEL} mt-2`}>interview prep · machine coding</p>
        <h1 className="m-0 mt-2 break-words font-display text-[clamp(34px,9vw,52px)] font-extrabold leading-[0.95] tracking-[-0.04em] lg:text-[clamp(44px,5vw,76px)] lg:leading-[0.9] lg:tracking-[-0.05em]">
          Low-level design<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 mt-3 max-w-[680px] text-[15px] leading-snug text-fg-2 sm:text-base lg:text-lg lg:leading-relaxed">
          The round where you turn a vague problem into classes, interfaces and running code in 60 to 90 minutes. Learn the design patterns, then work the {cases.length} classic problems one interview step at a time.
        </p>
        <dl className="m-0 mt-5 flex flex-wrap gap-x-8 gap-y-3">
          <Stat label="design patterns" value={ready ? `${patsDone}/${livePats.length}` : String(livePats.length)} sub={ready ? "lessons done" : "lessons"} />
          <Stat label="case studies" value={ready ? `${done.size}/${cases.length}` : String(cases.length)} sub={ready ? "rounds done" : "interview rounds"} />
        </dl>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {nextPat ? (
            <Link href={patternHref(nextPat.slug)} className={`inline-flex min-h-11 items-center bg-fg px-4 text-sm font-semibold text-bg hover:opacity-90 ${FOCUS}`}>
              {patsDone ? "Continue" : "Start"} with {patternChipName(nextPat)} ›
            </Link>
          ) : nextCase ? (
            <Link href={nextCase.href} className={`inline-flex min-h-11 items-center bg-fg px-4 text-sm font-semibold text-bg hover:opacity-90 ${FOCUS}`}>
              {startedAny ? "Continue" : "Start"} with {nextCase.name} ›
            </Link>
          ) : (
            <a href="#path" className={`inline-flex min-h-11 items-center bg-fg px-4 text-sm font-semibold text-bg hover:opacity-90 ${FOCUS}`}>
              See the suggested path ›
            </a>
          )}
          {!intro && (
            <Link href="/lectures/low-level-design--lld-intro" className={`inline-flex min-h-11 items-center gap-2 border border-line-strong px-4 text-sm font-semibold text-fg hover:border-fg ${FOCUS}`}>
              <span aria-hidden className="text-signal-text">▶</span> Watch the intro
            </Link>
          )}
          <nav aria-label="On this page" className="flex flex-wrap gap-x-1 text-[13px]">
            {[
              ["#path", "Suggested path"],
              ["#patterns", "Design patterns"],
              ["#case-studies", "Case studies"],
              ["#pattern-map", "Pattern map"],
            ].map(([href, label]) => (
              <a key={href} href={href} className={`inline-flex min-h-11 items-center px-2 text-fg-2 underline-offset-4 hover:text-fg hover:underline ${FOCUS}`}>
                {label}
              </a>
            ))}
          </nav>
        </div>
        </div>
        {intro && (
          <div className="mt-6 lg:mt-2">
            <LldIntroVideo video={intro} />
          </div>
        )}
        </div>
      </section>

      <div className="mx-auto flex max-w-[1320px] flex-col gap-12 px-4 sm:px-6 lg:gap-16">
        <LldCertificate {...cert} ready={ready} />
        {user && <ReadinessCard tracks={["lld"]} id="lld-readiness" />}

        {/* ------------------------------------------------------------ path */}
        <Section id="path" kicker="suggested path" title="Where to start" aside="Foundations, then the core patterns, then easy and hard case studies.">
          <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 xl:grid-cols-4">
            {path.map((s, i) => (
              <li key={s.id} className="flex min-w-0 flex-col gap-2 border border-line bg-surface p-4">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-signal-text">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="m-0 font-display text-lg font-bold tracking-[-0.02em] text-fg">{s.title}</h3>
                </div>
                <p className="m-0 text-[13px] leading-snug text-fg-3">{s.note}</p>
                {(() => {
                  // a step's items, in order: its patterns, then its case studies; the card shows progress and the next one
                  const items = [
                    ...s.patterns.map((slug) => ({ key: slug, name: patternBySlug(slug) ? patternChipName(patternBySlug(slug)!) : slug, href: patternHref(slug), done: ready && live.has(slug) && patDone(slug) })),
                    ...s.cases.flatMap((slug) => {
                      const c = cases.find((x) => x.slug === slug);
                      return c ? [{ key: slug, name: c.name, href: c.href, done: done.has(slug) }] : [];
                    }),
                  ];
                  const n = items.filter((x) => x.done).length;
                  const up = items.find((x) => !x.done);
                  return (
                    <>
                      <p className="m-0 text-[13px] leading-snug text-fg-2">
                        {items.slice(0, 4).map((x) => x.name).join(", ")}
                        {items.length > 4 ? ` and ${items.length - 4} more` : ""}
                      </p>
                      <div className="mt-auto flex flex-col gap-2 pt-2">
                        <span aria-hidden className="h-1 w-full bg-surface-2">
                          <span className="block h-full bg-signal" style={{ width: `${items.length ? Math.round((n / items.length) * 100) : 0}%` }} />
                        </span>
                        <span className="flex items-center justify-between gap-2 font-mono text-xs">
                          {up ? (
                            <Link href={up.href} className={`min-w-0 truncate text-signal-text hover:underline ${FOCUS}`}>
                              {n ? "NEXT" : "START"} · {up.name} →
                            </Link>
                          ) : (
                            <span className="text-fg">COMPLETED ✓</span>
                          )}
                          <span className="shrink-0 text-fg-3">
                            {n}/{items.length}
                          </span>
                        </span>
                      </div>
                    </>
                  );
                })()}
              </li>
            ))}
          </ol>
        </Section>

        {/* ------------------------------------------------------------ patterns */}
        <Section id="patterns" kicker="half one" title="Design patterns" aside="The vocabulary of the round, in the order to learn it. Each lesson gives the problem, the class diagram, code in four languages, when not to use it, a lab and a lecture.">
          <div className="flex flex-col gap-8">
            {PATTERN_GROUPS.map((g) => {
              const items = PATTERNS.filter((p) => p.group === g.id);
              return (
                <div key={g.id} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="m-0 font-display text-xl font-bold tracking-[-0.02em] text-fg">{g.label}</h3>
                    {ready && <span className="font-mono text-[12px] text-fg-3">{items.filter((p) => live.has(p.slug) && patDone(p.slug)).length}/{items.length}</span>}
                    <span className="text-[13px] text-fg-3">{g.note}</span>
                  </div>
                  <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((p) => {
                      const used = map[p.slug]?.length ?? 0;
                      const isLive = live.has(p.slug);
                      return (
                        <li key={p.slug} className="relative flex min-w-0 flex-col gap-2 border border-line bg-surface p-4 hover:border-line-strong">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="m-0 min-w-0 text-[16px] font-semibold leading-snug text-fg">
                              <span className="mb-1 block font-mono text-[11px] font-normal tracking-label text-fg-3">DP-{String(p.n).padStart(2, "0")}</span>
                              <Link href={patternHref(p.slug)} className={`after:absolute after:inset-0 ${FOCUS}`}>
                                {p.name}
                              </Link>
                            </h4>
                            {!isLive ? (
                              <span className="shrink-0 border border-line-strong px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-fg-3">coming soon</span>
                            ) : ready && patDone(p.slug) ? (
                              <span className="shrink-0 font-mono text-[11px] text-signal-text">done ✓</span>
                            ) : null}
                          </div>
                          <p className="m-0 text-[13px] leading-snug text-fg-2">{p.problem}</p>
                          {used > 0 && <p className="m-0 mt-auto pt-1 font-mono text-[11px] text-fg-3">used in {used} case {used === 1 ? "study" : "studies"}</p>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ------------------------------------------------------------ case studies */}
        <Section id="case-studies" kicker="half two" title="Case studies" aside="Each one is a full interview walkthrough: requirements, entities, class diagram, patterns, code, concurrency, follow-ups.">
          <div className="flex flex-col gap-4">
            <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end" onSubmit={(e) => e.preventDefault()} aria-label="Filter the case studies">
              <fieldset className="m-0 min-w-0 border-0 p-0">
                <legend className={`${LABEL} mb-1 p-0`}>Difficulty</legend>
                <div className="flex flex-wrap gap-1.5">
                  <Pill on={!filters.difficulty} onClick={() => apply({ ...filters, difficulty: null })}>
                    All
                  </Pill>
                  {fac.difficulties.map((d) => (
                    <Pill key={d.value} on={filters.difficulty === d.value} disabled={d.count === 0 && filters.difficulty !== d.value} onClick={() => apply({ ...filters, difficulty: filters.difficulty === d.value ? null : (d.value as Difficulty) })}>
                      {d.value} <span className="text-fg-3">{d.count}</span>
                    </Pill>
                  ))}
                </div>
              </fieldset>
              <Select
                label="Pattern"
                value={filters.pattern ?? ""}
                onChange={(v) => apply({ ...filters, pattern: v || null })}
                options={[{ value: "", label: "Any pattern" }, ...fac.patterns.map((p) => ({ value: p.value.slug, label: `${p.value.name} (${p.count})`, disabled: p.count === 0 && filters.pattern !== p.value.slug }))]}
              />
              <Select
                label="Company"
                value={filters.company ?? ""}
                onChange={(v) => apply({ ...filters, company: v || null })}
                options={[{ value: "", label: "Any company" }, ...fac.companies.map((c) => ({ value: c.value.slug, label: `${c.value.name} (${c.count})`, disabled: c.count === 0 && filters.company !== c.value.slug }))]}
                hint={fac.companies.length ? undefined : "No company data yet"}
              />
              <button type="button" onClick={() => apply(NO_FILTERS)} disabled={!hasFilters(filters)} className={`min-h-11 border border-line-strong px-3 text-sm text-fg-2 hover:border-fg hover:text-fg disabled:cursor-default disabled:opacity-40 disabled:hover:border-line-strong disabled:hover:text-fg-2 ${FOCUS}`}>
                Clear filters
              </button>
            </form>
            <p role="status" aria-live="polite" className="m-0 text-[13px] text-fg-3">
              {shown.length === cases.length ? `All ${cases.length} case studies` : `${shown.length} of ${cases.length} case studies`}
              {filters.pattern && ` using ${patternBySlug(filters.pattern)?.name}`}
            </p>
            {shown.length === 0 ? (
              <div className="border border-dashed border-line-strong p-6 text-[15px] text-fg-2">
                No case study matches all three filters. <button type="button" onClick={() => apply(NO_FILTERS)} className={`text-signal-text underline ${FOCUS}`}>Clear them</button> to see everything.
              </div>
            ) : (
              <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
                {shown.map((c) => (
                  <CaseCard key={c.slug} c={c} progress={ready ? prog(c.slug) : null} />
                ))}
              </ul>
            )}
          </div>
        </Section>

        {/* ------------------------------------------------------------ pattern map */}
        <Section id="pattern-map" kicker="pattern map" title="Which case studies use a pattern" aside="Pick a pattern to see every problem that uses it.">
          <div className="flex flex-col gap-4">
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Patterns used in case studies">
              {PATTERNS.filter((p) => map[p.slug]).sort((a, b) => map[b.slug].length - map[a.slug].length || a.name.localeCompare(b.name)).map((p) => (
                <li key={p.slug}>
                  <button type="button" aria-pressed={mapPick === p.slug} onClick={() => setMapPick(mapPick === p.slug ? null : p.slug)} className={`inline-flex min-h-11 items-center gap-2 border px-3 text-sm ${mapPick === p.slug ? "border-fg bg-fg text-bg" : "border-line-strong text-fg hover:border-fg"} ${FOCUS}`}>
                    {patternChipName(p)}
                    <span className={`font-mono text-[11px] ${mapPick === p.slug ? "text-bg" : "text-fg-3"}`}>{map[p.slug].length}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div role="region" aria-live="polite" aria-label="Case studies for the chosen pattern" className="border border-line bg-surface p-4">
              {mapPick && patternBySlug(mapPick) ? (
                <>
                  <p className="m-0 text-[15px] text-fg">
                    <b>{patternBySlug(mapPick)!.name}</b> shows up in {map[mapPick].length} case {map[mapPick].length === 1 ? "study" : "studies"}.{" "}
                    <Link href={patternHref(mapPick)} className={`text-signal-text underline ${FOCUS}`}>Read the pattern</Link>
                  </p>
                  <ul className="m-0 mt-3 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
                    {map[mapPick].map((c) => (
                      <li key={c.slug}>
                        <Link href={c.href} className={`flex min-h-11 items-center justify-between gap-3 border border-line-strong px-3 text-[14px] text-fg hover:border-fg ${FOCUS}`}>
                          <span className="min-w-0">{c.name}</span>
                          <span className="shrink-0 font-mono text-[11px] text-fg-3">{c.difficulty}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="m-0 text-[14px] text-fg-3">Choose a pattern above. The number is how many case studies use it.</p>
              )}
            </div>
          </div>
        </Section>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ pieces */

/** "Your LLD certificate": n/58 lessons done, and the way to claim it once both halves are complete. */
function LldCertificate({ patterns, cases, certified, signedIn, ready }: { patterns: { done: number; total: number }; cases: { done: number; total: number }; certified: boolean; signedIn: boolean; ready: boolean }) {
  const doneN = patterns.done + cases.done;
  const total = patterns.total + cases.total;
  const eligible = ready && patterns.done >= patterns.total && cases.done >= cases.total;
  const pct = Math.round((doneN / Math.max(1, total)) * 100);
  return (
    <section id="certificate" aria-labelledby="lld-cert-h" className="flex scroll-mt-24 flex-col gap-3 border border-line bg-surface p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className={`${LABEL} m-0 text-signal-text`}>certificate · {LLD_CERT_NAME.toLowerCase()}</p>
        <h2 id="lld-cert-h" className="m-0 font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-fg sm:text-[26px]">
          Your LLD certificate
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-[15px] text-fg">
            {ready ? doneN : "–"}/{total} <span className="text-fg-3">done</span>
          </span>
          <span className="font-mono text-[12px] text-fg-3">
            {ready ? patterns.done : "–"}/{patterns.total} pattern lessons · {ready ? cases.done : "–"}/{cases.total} case studies
          </span>
        </div>
        <div className="h-1.5 max-w-[520px] bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={ready ? doneN : 0} aria-label="LLD certificate progress">
          <div className="h-full bg-signal" style={{ width: `${ready ? pct : 0}%` }} />
        </div>
        <p className="m-0 text-[13px] leading-snug text-fg-3">
          {certified
            ? "You're certified. View, share or download it from your certificates."
            : eligible
              ? signedIn
                ? "Every pattern lesson and case study done: claim it now."
                : "Every pattern lesson and case study done. Sign in to claim it; certificates are checked against your account."
              : `Complete all ${patterns.total} design-pattern lessons and all ${cases.total} case studies to earn a verifiable certificate.`}
        </p>
      </div>
      <Link
        href={LLD_CERT_HREF}
        className={`inline-flex min-h-11 shrink-0 items-center justify-center px-4 text-sm font-semibold sm:self-center ${eligible && !certified ? "bg-signal text-on-signal hover:brightness-110" : "border border-line-strong text-fg hover:border-fg"} ${FOCUS}`}
      >
        {certified ? "View certificate ›" : eligible ? "Claim your certificate ›" : "See the requirements ›"}
      </Link>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className={LABEL}>{label}</dt>
      <dd className="m-0 font-display text-3xl font-extrabold leading-none tracking-[-0.03em] text-fg">
        {value}
        {sub && <span className="ml-2 font-sans text-[13px] font-normal tracking-normal text-fg-3">{sub}</span>}
      </dd>
    </div>
  );
}

function Section({ id, kicker, title, aside, children }: { id: string; kicker: string; title: string; aside: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-24 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
        <div className="min-w-0">
          <p className={`${LABEL} m-0`}>{kicker}</p>
          <h2 id={`${id}-h`} className="m-0 font-display text-[26px] font-extrabold tracking-[-0.03em] text-fg sm:text-3xl">
            {title}
          </h2>
        </div>
        <p className="m-0 max-w-[560px] text-[13px] leading-snug text-fg-3">{aside}</p>
      </div>
      {children}
    </section>
  );
}

function Pill({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick} className={`inline-flex min-h-11 items-center gap-1.5 border px-3 text-sm disabled:cursor-default disabled:opacity-40 ${on ? "border-fg bg-fg text-bg" : "border-line-strong text-fg hover:border-fg"} ${FOCUS}`}>
      {children}
    </button>
  );
}

function Select({ label, value, onChange, options, hint }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string; disabled?: boolean }[]; hint?: string }) {
  const id = `lld-f-${label.toLowerCase()}`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`min-h-11 w-full min-w-0 border border-line-strong bg-bg px-2 text-sm text-fg ${FOCUS}`}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className="text-[12px] text-fg-4">{hint}</span>}
    </div>
  );
}

function CaseCard({ c, progress }: { c: CaseRow; progress: ReturnType<typeof progressOf> | null }) {
  const meta = caseBySlug(c.slug);
  const chips = c.patterns.flatMap((s) => {
    const p = patternBySlug(s);
    return p ? [{ slug: s, name: patternChipName(p) }] : [];
  });
  const label = !progress || progress.state === "new" ? "Not started" : progress.state === "done" ? "Done" : `${progress.steps}/${STEPS.length} steps`;
  return (
    <li className="relative flex min-w-0 flex-col gap-2.5 border border-line bg-surface p-4 hover:border-line-strong">
      <div className="flex items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-label">
        <span className="text-fg-3">LLD {String(c.n).padStart(2, "0")}</span>
        <span className={`border px-1.5 py-0.5 ${c.difficulty === "Medium" ? "border-line-strong text-fg-2" : c.difficulty === "Hard" ? "border-fg text-fg" : "border-signal text-signal-text"}`}>{c.difficulty}</span>
      </div>
      <h3 className="m-0 font-display text-[20px] font-bold leading-tight tracking-[-0.02em] text-fg">
        <Link href={c.href} className={`after:absolute after:inset-0 ${FOCUS}`}>
          {c.name}
        </Link>
      </h3>
      <p className="m-0 text-[13px] leading-snug text-fg-2">{c.blurb}</p>
      <dl className="m-0 flex flex-col gap-1 text-[13px]">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-fg-3">Round</dt>
          <dd className="m-0 text-fg-2">~{c.roundMinutes} min</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-fg-3">Patterns</dt>
          <dd className="m-0 min-w-0 text-fg-2">
            {/* above the card's full-size link (z-10), so each chip opens its own pattern page */}
            {chips.map((x, i) => (
              <span key={x.slug}>
                {i > 0 && ", "}
                <Link href={patternHref(x.slug)} className={`relative z-10 inline-block py-0.5 underline decoration-line-strong underline-offset-2 hover:text-fg ${FOCUS}`}>
                  {x.name}
                </Link>
              </span>
            ))}
          </dd>
        </div>
        {c.companies.length > 0 && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-fg-3">Asked at</dt>
            <dd className="m-0 min-w-0 text-fg-2">
              {c.companies.slice(0, 4).map((x) => x.name).join(", ")}
              {c.companies.length > 4 ? ` +${c.companies.length - 4}` : ""}
            </dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-fg-3">Code</dt>
          <dd className="m-0 text-fg-2">{(meta?.langs ?? c.langs).map((l) => (l === "cpp" ? "C++" : l === "javascript" ? "JavaScript" : l[0].toUpperCase() + l.slice(1))).join(", ")}</dd>
        </div>
      </dl>
      <div className="mt-auto flex flex-col gap-1 pt-1">
        <div className="h-1 bg-surface-2" role="presentation">
          <div className="h-full bg-signal" style={{ width: `${progress?.pct ?? 0}%` }} />
        </div>
        <span className="font-mono text-[11px] text-fg-3">{label}</span>
      </div>
    </li>
  );
}
