"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "@/game/GameProvider";
import type { Stage } from "@/lib/course/types";
import { articleRoot, findChecklist, findProblem, findTurns, phasePrompt, sectionFor, stageSections, type Problem } from "./dom";
import BossHud from "./BossHud";
import { BOSS_XP, bossKey, type Phase } from "./shared";
import BossDebrief from "./BossDebrief";

export type BossModeProps = { week: string; slug: string; stages: Stage[]; title: string };


type Screen = "brief" | "fight" | "debrief";
type Mode = "interview" | "read";


type Saved = {
  screen: Screen;
  mode: Mode;
  phase: number;
  maxPhase: number;
  /** seconds used per phase id */
  used: Record<string, number>;
  revealed: Record<string, boolean>;
  rub: boolean[];
  attempts: number;
  /** a fight in progress (started and not yet debriefed) */
  live: boolean;
};

const FRESH: Saved = { screen: "brief", mode: "interview", phase: 0, maxPhase: 0, used: {}, revealed: {}, rub: [], attempts: 0, live: false };

type Discovered = {
  problem: Problem | null;
  intro: string | null;
  then: string | null;
  prompts: Record<string, string | null>;
  checklist: string[];
  /** the interviewer's last line ("Excellent work. …") */
  closing: string | null;
  hasSections: boolean;
};


/** Height of whatever is pinned to the top of the viewport (site header, learn nav, stage rail). */
function topChrome(): number {
  let bottom = 0;
  document.querySelectorAll<HTMLElement>("header, nav, [data-reader-ui], body > div *").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < -1 || r.top > 260 || r.bottom <= bottom || r.height > 320 || r.width < window.innerWidth * 0.5) return;
    const pos = getComputedStyle(el).position;
    if (pos === "sticky" || pos === "fixed") bottom = r.bottom;
  });
  return Math.min(bottom, 320);
}

const isPhase = (s: Stage) => /^phase[-\s]?\d/i.test(s.id) || /^phase\b/i.test(s.label);
const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export default function BossMode({ week, slug, stages = [], title }: BossModeProps) {
  const { awardOnce, done, hydrated } = useGame();
  const storeKey = `hk.boss.v1:${week}/${slug}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<Saved>(FRESH);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [found, setFound] = useState<Discovered | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [scrollTo, setScrollTo] = useState<string | null>(null);

  const phases: Phase[] = useMemo(() => stages.filter(isPhase).map((s, k) => ({ ...s, n: k + 1, prompt: found?.prompts[s.id] ?? null })), [stages, found]);
  const timed = phases.some((p) => !!p.budgetMinutes);
  const totalMin = phases.reduce((a, p) => a + (p.budgetMinutes || 0), 0);
  const readMin = stages.reduce((a, s) => a + (s.minutes || 0), 0);
  const simple = phases.length === 0;
  const defeated = hydrated && !!done[bossKey(week)];
  const rubricN = found?.checklist.length ?? 0;

  // ---------------------------------------------------------- load / save

  useEffect(() => {
    let saved: Saved = FRESH;
    const d: Record<string, string> = {};
    try {
      const raw = window.localStorage.getItem(storeKey);
      if (raw) saved = { ...FRESH, ...(JSON.parse(raw) as Partial<Saved>) };
      stages.filter(isPhase).forEach((p) => {
        const v = window.localStorage.getItem(`${storeKey}:draft:${p.id}`);
        if (v) d[p.id] = v;
      });
    } catch {
      // unreadable storage: start fresh
    }
    Promise.resolve().then(() => {
      setState(saved);
      setDrafts(d);
      setLoaded(true);
    });
  }, [storeKey, stages]);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(storeKey, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state, loaded, storeKey]);

  const draftTimer = useRef<number | null>(null);
  const setDraft = (id: string, v: string) => {
    setDrafts((d) => ({ ...d, [id]: v }));
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      try {
        if (v) window.localStorage.setItem(`${storeKey}:draft:${id}`, v);
        else window.localStorage.removeItem(`${storeKey}:draft:${id}`);
      } catch {
        // ignore
      }
    }, 300);
  };

  // ---------------------------------------------------------- read the article

  useEffect(() => {
    const read = () => {
      const root = articleRoot();
      if (!root) {
        setFound({ problem: null, intro: null, then: null, prompts: {}, checklist: [], closing: null, hasSections: false });
        return;
      }
      const phaseStages = stages.filter(isPhase);
      const firstPhaseEl = phaseStages.length ? sectionFor(phaseStages[0].id) : null;
      const turns = findTurns(root);
      const pre = turns.filter((t) => !firstPhaseEl || !!(t.el.compareDocumentPosition(firstPhaseEl) & Node.DOCUMENT_POSITION_FOLLOWING));
      const preInt = pre.filter((t) => t.who === "interviewer");
      const order = stageSections().map((s) => s.getAttribute("data-stage-id") || s.id);
      const prompts: Record<string, string | null> = {};
      phaseStages.forEach((p) => {
        const idx = order.indexOf(p.id);
        prompts[p.id] = phasePrompt(turns, p.id, idx > 0 ? order[idx - 1] : null);
      });
      setFound({
        problem: findProblem(root, firstPhaseEl),
        intro: preInt[0]?.text ?? null,
        then: preInt.length > 1 ? preInt[preInt.length - 1].text : null,
        prompts,
        checklist: findChecklist(root),
        closing: [...turns].reverse().find((t) => t.who === "interviewer")?.text ?? null,
        hasSections: phaseStages.some((p) => !!sectionFor(p.id)),
      });
    };
    const id = window.requestAnimationFrame(read);
    return () => window.cancelAnimationFrame(id);
  }, [stages]);

  // ---------------------------------------------------------- hide unrevealed phases while fighting

  const fighting = state.screen === "fight" && state.mode === "interview" && !simple;
  useEffect(() => {
    if (!fighting) return;
    const touched: { el: HTMLElement; display: string }[] = [];
    phases.forEach((p) => {
      if (state.revealed[p.id]) return;
      const el = sectionFor(p.id);
      if (!el) return;
      touched.push({ el, display: el.style.display });
      el.style.display = "none";
      el.setAttribute("data-boss-hidden", "");
      el.setAttribute("aria-hidden", "true");
    });
    return () => {
      touched.forEach(({ el, display }) => {
        el.style.display = display;
        el.removeAttribute("data-boss-hidden");
        el.removeAttribute("aria-hidden");
      });
    };
  }, [fighting, phases, state.revealed]);

  // scroll after the DOM shows the target
  useEffect(() => {
    if (!scrollTo) return;
    const id = window.setTimeout(() => {
      const el = scrollTo === "__panel" ? rootRef.current : sectionFor(scrollTo);
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - topChrome() - 16;
        window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
      }
      setScrollTo(null);
    }, 60);
    return () => window.clearTimeout(id);
  }, [scrollTo]);

  // ---------------------------------------------------------- clock

  const cur = phases[Math.min(state.phase, Math.max(0, phases.length - 1))];
  const clockOn = running && fighting && !!cur && !state.revealed[cur.id];
  useEffect(() => {
    if (!clockOn || !cur) return;
    const id = window.setInterval(() => {
      setState((s) => ({ ...s, used: { ...s.used, [cur.id]: (s.used[cur.id] || 0) + 1 } }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [clockOn, cur]);

  // ---------------------------------------------------------- actions

  const startInterview = useCallback(() => {
    phases.forEach((p) => {
      try {
        window.localStorage.removeItem(`${storeKey}:draft:${p.id}`);
      } catch {
        // ignore
      }
    });
    setDrafts({});
    setState((s) => ({ ...FRESH, screen: "fight", mode: "interview", attempts: s.attempts + 1, live: true, rub: [] }));
    setRunning(true);
    setScrollTo("__panel");
  }, [phases, storeKey]);

  const resumeInterview = () => {
    setState((s) => ({ ...s, screen: "fight", mode: "interview" }));
    setRunning(false);
    setScrollTo("__panel");
  };

  const startRead = () => {
    setState((s) => ({ ...s, screen: "fight", mode: "read", live: false }));
    setRunning(false);
  };

  const reveal = () => {
    if (!cur) return;
    setRunning(false);
    setState((s) => ({ ...s, revealed: { ...s.revealed, [cur.id]: true } }));
    setScrollTo(cur.id);
  };

  const goPhase = (k: number) => {
    setState((s) => ({ ...s, phase: k, maxPhase: Math.max(s.maxPhase, k) }));
    setRunning(true);
    setScrollTo("__panel");
  };

  const toDebrief = () => {
    setRunning(false);
    setState((s) => ({ ...s, screen: "debrief" }));
    setScrollTo("__panel");
  };

  const toBrief = () => {
    setRunning(false);
    setState((s) => ({ ...s, screen: "brief" }));
    setScrollTo("__panel");
  };

  const claim = () => awardOnce(bossKey(week), BOSS_XP, `Boss defeated · ${found?.problem?.title || title}`);

  // ---------------------------------------------------------- render

  if (!loaded || !found) return <div ref={rootRef} className="min-h-[120px]" aria-busy="true" />;

  const name = bossName(found.problem?.title) || title;
  const weekNum = week.match(/^week-(\d+)/)?.[1]?.padStart(2, "0") ?? "";
  const totalUsed = phases.reduce((a, p) => a + (state.used[p.id] || 0), 0);

  return (
    <div ref={rootRef} className="mb-10 flex scroll-mt-24 flex-col gap-6" data-boss-mode={state.screen}>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-2.5 font-semibold text-fg">
          <span aria-hidden="true" className="h-[11px] w-[11px] rotate-45 border-[1.5px] border-fg" />
          Boss · {name}
        </span>
        <span className="border border-line-strong px-2 py-1 font-mono text-[11px] tracking-label text-fg-2">
          {state.screen === "brief" ? "BRIEFING" : state.screen === "debrief" ? "DEBRIEF" : state.mode === "interview" ? "INTERVIEW MODE" : "READ MODE"}
        </span>
        {defeated && <span className="bg-signal px-2 py-1 font-mono text-[11px] font-semibold tracking-label text-on-signal">DEFEATED ✓</span>}
      </div>

      {state.screen === "brief" && (
        <Briefing
          name={name}
          title={title}
          weekNum={weekNum}
          found={found}
          phases={phases}
          totalMin={totalMin}
          readMin={readMin}
          timed={timed}
          simple={simple}
          attempts={state.attempts}
          rubricN={rubricN}
          mode={state.mode}
          setMode={(mode) => setState((s) => ({ ...s, mode }))}
          live={state.live}
          defeated={defeated}
          onStart={() => (simple || state.mode === "read" ? startRead() : startInterview())}
          onResume={resumeInterview}
          onDebrief={toDebrief}
        />
      )}

      {state.screen === "fight" && state.mode === "read" && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-line-strong bg-surface px-5 py-4">
          <span className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
            <span className="font-mono text-xs tracking-label text-fg-2">READ MODE · UNTIMED · NO XP</span>
            <span className="text-sm leading-normal text-fg-3">
              The whole model answer is open below. When you are done, score yourself against the capstone&apos;s own checklist.
            </span>
          </span>
          <div className="flex flex-wrap gap-2">
            {!simple && (
              <button type="button" onClick={startInterview} className="min-h-[44px] border border-signal px-3.5 text-sm font-semibold text-signal-text hover:bg-surface-2">
                Fight it timed instead
              </button>
            )}
            <button type="button" onClick={toDebrief} className="min-h-[44px] bg-fg px-3.5 text-sm font-semibold text-bg">
              Score yourself →
            </button>
            <button type="button" onClick={toBrief} className="min-h-[44px] border border-line-strong px-3.5 text-sm text-fg hover:border-fg-3">
              Briefing
            </button>
          </div>
        </div>
      )}

      {fighting && cur && (
        <FightPanel
          phase={cur}
          count={phases.length}
          revealed={!!state.revealed[cur.id]}
          draft={drafts[cur.id] || ""}
          onDraft={(v) => setDraft(cur.id, v)}
          onReveal={reveal}
          onRead={() => setScrollTo(cur.id)}
          onNext={() => (state.phase + 1 >= phases.length ? toDebrief() : goPhase(state.phase + 1))}
          isLast={state.phase + 1 >= phases.length}
          nextName={phases[state.phase + 1]?.title}
          hasSection={found.hasSections}
          timed={!!cur.budgetMinutes}
        />
      )}

      {fighting && cur && (
        <BossHud
          phases={phases}
          current={state.phase}
          maxPhase={state.maxPhase}
          used={state.used}
          revealed={state.revealed}
          running={clockOn}
          canRun={!state.revealed[cur.id]}
          totalMin={totalMin}
          totalUsed={totalUsed}
          timed={timed}
          onToggle={() => setRunning((r) => !r)}
          onGo={goPhase}
          onReveal={reveal}
          onNext={() => (state.phase + 1 >= phases.length ? toDebrief() : goPhase(state.phase + 1))}
          onExit={toBrief}
          isLast={state.phase + 1 >= phases.length}
        />
      )}

      {state.screen === "debrief" && (
        <BossDebrief
          name={name}
          weekNum={weekNum}
          mode={simple ? "read" : state.mode}
          phases={phases}
          used={state.used}
          revealed={state.revealed}
          drafts={drafts}
          totalMin={totalMin}
          timed={timed}
          checklist={found.checklist}
          closing={found.closing}
          rub={state.rub}
          setRub={(rub) => setState((s) => ({ ...s, rub }))}
          defeated={defeated}
          onClaim={claim}
          onRetry={simple ? undefined : startInterview}
          onBack={state.mode === "interview" && !simple ? () => setState((s) => ({ ...s, screen: "fight" })) : undefined}
          onBrief={toBrief}
        />
      )}
    </div>
  );
}

/** "Design a Global Flash Sale System for “MegaMart”" → "Flash sale for MegaMart" is nicer, but keep the source words. */
function bossName(problemTitle?: string | null): string | null {
  if (!problemTitle) return null;
  return problemTitle.replace(/^design\s+(an?\s+)?/i, "").replace(/["“”]/g, "").trim() || problemTitle;
}

// ---------------------------------------------------------------------------------------------
// Briefing
// ---------------------------------------------------------------------------------------------

function Briefing(props: {
  name: string;
  title: string;
  weekNum: string;
  found: Discovered;
  phases: Phase[];
  totalMin: number;
  readMin: number;
  timed: boolean;
  simple: boolean;
  attempts: number;
  rubricN: number;
  mode: Mode;
  setMode: (m: Mode) => void;
  live: boolean;
  defeated: boolean;
  onStart: () => void;
  onResume: () => void;
  onDebrief: () => void;
}) {
  const { found, phases, totalMin, simple, timed, mode } = props;
  const p = found.problem;
  const interview = mode === "interview" && !simple;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-stretch gap-6">
        <section aria-labelledby="boss-h" className="flex min-w-0 flex-[1_1_380px] flex-col gap-5 border border-line-strong bg-surface p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <span className="font-mono text-xs uppercase tracking-label text-signal-text">Boss{props.weekNum ? ` · Week ${props.weekNum} capstone` : " · capstone"}</span>
            {props.readMin > 0 && <span className="font-mono text-xs text-fg-3">{props.readMin} min read</span>}
          </div>
          <div aria-hidden="true" className="hidden h-[190px] place-items-center sm:grid">
            <div className="relative grid h-[104px] w-[104px] rotate-45 place-items-center border-2 border-fg sm:h-[132px] sm:w-[132px]">
              <div className="grid h-[70px] w-[70px] place-items-center border border-dashed border-line-strong sm:h-[88px] sm:w-[88px]">
                <div className="grid h-[38px] w-[38px] place-items-center bg-signal sm:h-[46px] sm:w-[46px]">
                  <span className="-rotate-45 font-mono text-[15px] font-semibold text-on-signal">{props.weekNum || "◆"}</span>
                </div>
              </div>
              <span className="absolute -left-[5px] -top-[5px] h-2 w-2 bg-fg" />
              <span className="absolute -bottom-[5px] -right-[5px] h-2 w-2 bg-fg" />
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <h2 id="boss-h" className="m-0 font-display text-[clamp(34px,4.6vw,60px)] font-extrabold leading-[0.92] tracking-[-0.05em] text-fg">
              {props.name}
              <span className="text-signal-text">.</span>
            </h2>
            <span className="text-[15px] leading-normal text-fg-2">{props.title}</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(84px,100%),1fr))] gap-px border border-line bg-line">
            <MiniStat value={simple ? "—" : String(phases.length)} label="phases" />
            <MiniStat value={timed ? String(totalMin) : "—"} label="min budget" />
            <MiniStat value={props.rubricN ? String(props.rubricN) : "—"} label="rubric items" />
            <MiniStat value={String(props.attempts)} label="attempts" />
          </div>
        </section>

        <section aria-label="Problem statement" className="flex min-w-0 flex-[999_1_560px] flex-col gap-3.5">
          {found.intro && <Bubble text={found.intro} />}
          <div className="flex flex-grow flex-col border border-fg bg-raised">
            <div className="flex justify-between gap-3 border-b border-line px-[18px] py-3 font-mono text-xs uppercase tracking-label">
              <span className="text-fg">Whiteboard · problem statement</span>
              <span className="text-fg-3">they write</span>
            </div>
            {p ? (
              <div className="flex flex-col gap-[18px] px-5 py-6 sm:px-8 sm:pb-8 sm:pt-7">
                <h3 className="m-0 font-display text-[26px] font-bold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[34px]">{p.title}</h3>
                {p.lines.map((l, k) => (
                  <p key={k} className="m-0 text-base leading-relaxed text-fg-2 sm:text-lg">
                    {l}
                  </p>
                ))}
                {p.bullets.length > 0 && (
                  <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-px border border-line bg-line p-0">
                    {p.bullets.map((b, k) => (
                      <li key={k} className="bg-raised px-4 py-3.5 text-[15px] leading-snug text-fg-2">
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="m-0 px-6 py-6 text-base leading-relaxed text-fg-2">The problem statement is at the top of the capstone below.</p>
            )}
            {found.then && (
              <div className="mt-auto flex flex-wrap items-baseline gap-x-3.5 gap-y-2 border-t border-dashed border-line-strong px-5 py-4 sm:px-8">
                <span className="font-mono text-[11px] tracking-label text-fg-3">INTERVIEWER, THEN</span>
                <span className="text-[15px] leading-normal text-fg-2">“{found.then}”</span>
              </div>
            )}
          </div>
        </section>
      </div>

      {!simple && (
        <section aria-labelledby="map-h" className="flex flex-col gap-4 border border-line bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 id="map-h" className="m-0 font-display text-[28px] font-bold tracking-[-0.025em] text-fg">
              The fight · {phases.length} phases{timed ? `, ${totalMin} minutes` : ""}
            </h2>
            <span className="max-w-[620px] text-sm text-fg-3">
              {timed ? `Budgets are the capstone's own and add up to ${totalMin} min. The clock runs over budget, not out.` : "This capstone gives no time budgets, so the phases are untimed."}
            </span>
          </div>
          <div aria-hidden="true" className="flex gap-[3px]">
            {phases.map((ph) => (
              <span
                key={ph.id}
                className={`grid h-[34px] min-w-0 place-items-center font-mono text-[11px] font-semibold ${ph.n === 1 ? "bg-signal text-on-signal" : "border border-line-strong text-fg-2"}`}
                style={{ flex: `${ph.budgetMinutes || Math.max(1, ph.minutes)} 1 0px` }}
              >
                P{ph.n}
              </span>
            ))}
          </div>
          <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-x-8 p-0">
            {phases.map((ph) => (
              <li key={ph.id} className="flex items-baseline gap-3.5 border-b border-line py-[11px]">
                <span className="w-[26px] shrink-0 font-mono text-xs text-signal-text">P{ph.n}</span>
                <span className="flex-grow text-[15px] text-fg-2">{ph.title}</span>
                <span className="whitespace-nowrap font-mono text-xs text-fg-3">{ph.budgetMinutes ? `${ph.budgetMinutes} min` : "untimed"}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="flex flex-wrap items-stretch gap-6">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-3.5">
          {simple ? (
            <div className="flex flex-col gap-3 border border-line p-5">
              <span className="font-mono text-xs uppercase tracking-label text-fg-3">Read mode only</span>
              <span className="text-[15px] leading-relaxed text-fg-2">
                This capstone is not split into timed phases here, so the fight runs as a read: study the model answer below, then score yourself against its Self-Assessment Checklist. XP is only awarded in a timed interview.
              </span>
            </div>
          ) : (
            <fieldset className="m-0 flex flex-col gap-3.5 border-0 p-0">
              <legend className="pb-3.5 font-display text-[28px] font-bold tracking-[-0.025em] text-fg">Pick a mode</legend>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-3">
                <ModeCard
                  on={mode === "interview"}
                  onPick={() => props.setMode("interview")}
                  name="Interview mode"
                  tag={`${timed ? "TIMED" : "UNTIMED"} · ANSWER HIDDEN · +${BOSS_XP} XP`}
                  text={`${timed ? "A clock per phase. " : ""}You write your answer in the scratchpad first; the model answer in the lesson stays hidden until you reveal it.`}
                  accent
                />
                <ModeCard
                  on={mode === "read"}
                  onPick={() => props.setMode("read")}
                  name="Read mode"
                  tag="UNTIMED · MODEL ANSWER OPEN · NO XP"
                  text="Study the model answer phase by phase, blueprints included. Same rubric at the end, but XP is only awarded in interview mode."
                />
              </div>
              <div className="flex flex-col gap-3 border border-line px-5 py-5">
                <span className="font-mono text-xs uppercase tracking-label text-fg-3">Rules of the fight</span>
                <ol className="m-0 flex flex-col gap-2 pl-[22px] text-[15px] leading-normal text-fg-2">
                  {timed && <li>The clock runs over budget, not out. Overtime is recorded, never cut off.</li>}
                  <li>Write before you reveal. Each phase of the model answer stays hidden until you submit it.</li>
                  <li>After the reveal, compare honestly. Nobody is watching but you.</li>
                  <li>
                    Debrief against the capstone&apos;s own Self-Assessment Checklist.{" "}
                    {props.rubricN ? `${Math.ceil(props.rubricN * 0.7)} of ${props.rubricN} defeats the boss.` : "70% defeats the boss."}
                  </li>
                </ol>
              </div>
            </fieldset>
          )}
        </div>

        <aside aria-label="Reward" className="flex min-w-0 flex-[1_1_340px] flex-col gap-[18px] border border-signal bg-surface p-6">
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">Reward</span>
          <div className="flex items-center gap-[22px]">
            <div aria-hidden="true" className="m-2.5 grid h-16 w-16 shrink-0 rotate-45 place-items-center bg-signal">
              <span className="-rotate-45 font-mono text-xs font-semibold text-on-signal">{props.defeated ? "✓" : props.weekNum || "◆"}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[30px] font-semibold text-fg">+{BOSS_XP} XP</span>
              <span className="text-[15px] text-fg-2">{props.defeated ? "Boss already defeated" : "first defeat of this boss"}</span>
            </div>
          </div>
          <span className="text-sm leading-normal text-fg-3">Clears the boss node on this week&apos;s skill tree. Awarded once, in interview mode, at 70% or better on the rubric.</span>
          <div className="flex-grow" />
          {props.live && interview ? (
            <>
              <button type="button" onClick={props.onResume} className="flex min-h-[56px] items-center justify-between gap-3 bg-signal px-5 text-[17px] font-semibold text-on-signal hover:opacity-90">
                <span>Resume the interview</span>
                <span aria-hidden="true" className="font-mono text-sm">❯</span>
              </button>
              <button type="button" onClick={props.onStart} className="min-h-[48px] border border-line-strong px-4 text-sm text-fg hover:border-fg-3">
                Start over (attempt {props.attempts + 1})
              </button>
            </>
          ) : (
            <button type="button" onClick={props.onStart} className="flex min-h-[56px] items-center justify-between gap-3 bg-signal px-5 text-[17px] font-semibold text-on-signal hover:opacity-90">
              <span>{interview ? "Start the interview ❯" : "Open the model answer ❯"}</span>
              <span className="font-mono text-sm">{interview ? (timed ? `${totalMin}:00` : "untimed") : "untimed"}</span>
            </button>
          )}
          {simple && (
            <button type="button" onClick={props.onDebrief} className="min-h-[48px] border border-line-strong px-4 text-sm text-fg hover:border-fg-3">
              Score yourself now
            </button>
          )}
          <span className="text-[13px] text-fg-3">
            {interview ? (timed ? "The clock starts on Phase 1. You can pause it any time." : "No clock: write, reveal, compare, phase by phase.") : "Read mode never awards XP."}
          </span>
        </aside>
      </div>
    </div>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-bg px-3 py-2.5">
      <span className="font-mono text-xl font-semibold text-fg">{value}</span>
      <span className="text-xs text-fg-3">{label}</span>
    </div>
  );
}

function Bubble({ text, label = "INTERVIEWER" }: { text: string; label?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 border border-line-strong px-[7px] py-[5px] font-mono text-[11px] tracking-label text-fg-2">{label}</span>
      <p className="m-0 border border-line bg-surface-2 px-4 py-3 text-base leading-relaxed text-fg-2">“{text}”</p>
    </div>
  );
}

function ModeCard({ on, onPick, name, tag, text, accent }: { on: boolean; onPick: () => void; name: string; tag: string; text: string; accent?: boolean }) {
  return (
    <label className={`flex cursor-pointer flex-col gap-2.5 p-5 ${on ? "border-2 border-signal bg-surface" : "border border-line-strong bg-transparent hover:border-fg-3"}`}>
      <span className="flex items-center gap-3">
        <input type="radio" name="boss-mode" checked={on} onChange={onPick} className="m-0 h-5 w-5 accent-[#FF6B2B]" />
        <span className="font-display text-2xl font-bold tracking-[-0.02em] text-fg">{name}</span>
      </span>
      <span className={`font-mono text-xs tracking-label ${accent ? "text-signal-text" : "text-fg-3"}`}>{tag}</span>
      <span className="text-[15px] leading-normal text-fg-2">{text}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------------------------
// Fight panel (in the page, where boss mode is mounted)
// ---------------------------------------------------------------------------------------------

function FightPanel(props: {
  phase: Phase;
  count: number;
  revealed: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onReveal: () => void;
  onRead: () => void;
  onNext: () => void;
  isLast: boolean;
  nextName?: string;
  hasSection: boolean;
  timed: boolean;
}) {
  const { phase, revealed, draft } = props;
  const w = words(draft);
  return (
    <section aria-labelledby="ph-h" className="flex flex-col gap-5 border border-line-strong bg-surface p-5 sm:p-7">
      <div className="flex flex-col gap-2.5">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">
          Phase {phase.n} of {props.count} · {phase.budgetMinutes ? `${phase.budgetMinutes} min budget` : "untimed"}
        </span>
        <h2 id="ph-h" className="m-0 font-display text-[clamp(32px,4.4vw,56px)] font-extrabold leading-[0.95] tracking-[-0.045em] text-fg">
          {phase.title}
          <span className="text-signal-text">.</span>
        </h2>
      </div>
      {phase.prompt && <Bubble text={phase.prompt} />}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={`boss-scratch-${phase.id}`} className="font-mono text-xs uppercase tracking-label text-fg">
            ❯ Your answer · scratchpad
          </label>
          <span className="font-mono text-xs text-fg-3">{w} words · autosaved</span>
        </div>
        <textarea
          id={`boss-scratch-${phase.id}`}
          value={draft}
          onChange={(e) => props.onDraft(e.target.value)}
          placeholder="Think out loud. Bullets, numbers, boxes and arrows in plain text are all fine."
          className={`w-full resize-y border border-line-strong bg-raised p-4 font-mono text-[15px] leading-[1.7] text-fg outline-none focus:border-signal ${revealed ? "min-h-[140px]" : "min-h-[240px] sm:min-h-[300px]"}`}
        />
      </div>

      {!revealed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-signal bg-bg px-5 py-4">
          <span className="text-sm text-fg-2">
            {w === 0 ? "Nothing written yet. Revealing now counts this phase as a blank answer." : `${w} words in.${props.timed ? " The clock pauses when you reveal." : ""}`}
          </span>
          <button type="button" onClick={props.onReveal} className="min-h-[52px] bg-signal px-5 text-base font-semibold text-on-signal hover:opacity-90">
            I&apos;ve answered → reveal model answer
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-raised px-5 py-4">
          <span className="flex min-w-0 flex-[1_1_360px] flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-label text-ok">Model answer revealed</span>
            <span className="text-[15px] leading-normal text-fg-2">
              {props.hasSection ? `Phase ${phase.n} is open in the capstone below. Read it against what you wrote.` : "Read this phase in the capstone below and compare it with what you wrote."}
              {!props.isLast && props.nextName ? ` Next up: ${props.nextName}.` : ""}
            </span>
          </span>
          <div className="flex flex-wrap gap-2">
            {props.hasSection && (
              <button type="button" onClick={props.onRead} className="min-h-[52px] border border-line-strong px-4 text-[15px] text-fg hover:border-fg-3">
                Read it ↓
              </button>
            )}
            <button type="button" onClick={props.onNext} className="min-h-[52px] bg-fg px-5 text-base font-semibold text-bg">
              {props.isLast ? "Finish → debrief" : "Next phase →"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
