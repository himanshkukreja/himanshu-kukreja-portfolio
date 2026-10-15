"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { Dot, Prompt, container, ghostBtn, h2Class, primaryBtn } from "../../ui";
import {
  BRANCHES,
  ERAS,
  PERSON,
  SKILLS,
  SKILL_BY_ID,
  durationLabel,
  mIndex,
  monthsBetween,
  nowYm,
  type EraId,
  type SkillId,
} from "../data";
import { label } from "../parts";

/* ---------------------------------------------------------------- hero: tail -f */

type Log = { t: string; lvl: "INFO" | "PERF" | "SHIP" | "OSS" | "RUN"; src: string; msg: string };

const LOG: Log[] = [
  { t: "2019", lvl: "INFO", src: "thapar", msg: "enrolled · B.E. computer science" },
  { t: "2023-01", lvl: "INFO", src: "ikarus3d", msg: "joined as SDA, later SDE 1" },
  { t: "2023", lvl: "PERF", src: "ikarus3d", msg: "slicer → Cloud Run · infra cost −90%" },
  { t: "2023", lvl: "PERF", src: "ikarus3d", msg: "API latency −50% · login time −30%" },
  { t: "2023", lvl: "INFO", src: "thapar", msg: "graduated · CGPA 9.04" },
  { t: "2024-01", lvl: "INFO", src: "autoflow", msg: "git init · founding engineer #1" },
  { t: "2024", lvl: "SHIP", src: "autoflow", msg: "Product Hunt · Product of the Day" },
  { t: "2025-01", lvl: "INFO", src: "nativebridge", msg: "founding engineer · real devices over WebRTC" },
  { t: "2025", lvl: "PERF", src: "nativebridge", msg: "device streams under 100 ms" },
  { t: "2025", lvl: "OSS", src: "ios-bridge", msg: "open-sourced · 75★" },
  { t: "2026-03", lvl: "INFO", src: "markdrop", msg: "init · docs and files as links that render" },
  { t: "2026-03", lvl: "INFO", src: "pcloudy", msg: "streaming research · 5,000+ device cloud" },
  { t: "2026-04", lvl: "INFO", src: "senseloaf", msg: "senior swe · engineering lead" },
  { t: "now", lvl: "RUN", src: "senseloaf", msg: "building SIA + its MCP server" },
];

const LVL_CLS: Record<Log["lvl"], string> = {
  INFO: "text-fg-3",
  PERF: "text-ok",
  SHIP: "text-signal-text",
  OSS: "text-signal-text",
  RUN: "text-signal-text",
};

function Tail() {
  const [n, setN] = useState(LOG.length);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Replay the log from the top on mount; reduced-motion visitors get the full log at once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setN(3);
    const id = window.setInterval(() => setN((k) => (k >= LOG.length ? k : k + 1)), 650);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="flex min-w-0 flex-col border border-line-strong bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
        <span className={label}>tail -f ~/himanshu.log</span>
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-fg-3">
          <span aria-hidden className="h-2 w-2 bg-ok motion-safe:animate-hk-blink" /> live
        </span>
      </div>
      <ol className="m-0 flex min-h-[380px] list-none flex-col justify-end gap-0.5 overflow-hidden p-3.5 font-mono text-[12px] leading-[1.6] sm:text-[13px]" aria-label="Career log">
        {LOG.slice(0, n).map((l, i) => (
          <li key={i} className={`flex gap-2 ${i === n - 1 ? "motion-safe:animate-hk-in" : ""}`}>
            <span className="w-[54px] shrink-0 text-fg-4">{l.t}</span>
            <span className={`w-[34px] shrink-0 ${LVL_CLS[l.lvl]}`}>{l.lvl}</span>
            <span className="min-w-0">
              <span className="text-fg">{l.src}</span> <span className="text-fg-2">{l.msg}</span>
            </span>
          </li>
        ))}
        <li aria-hidden className="mt-1 h-[15px] w-2 bg-fg motion-safe:animate-hk-blink" />
      </ol>
    </div>
  );
}

export function TraceHero() {
  return (
    <section aria-label="Intro" className={`${container} grid items-start gap-10 pb-14 pt-6 sm:pb-[72px] sm:pt-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]`}>
      <div className="flex min-w-0 flex-col gap-6">
        <span className="font-mono text-[13px] text-signal-text">❯ GET /himanshu · 200 OK</span>
        <h1 className="m-0 font-display text-[clamp(56px,8vw,120px)] font-extrabold leading-[0.84] tracking-tightest text-fg">
          {PERSON.first}
          <br />
          {PERSON.last}
          <Dot />
        </h1>
        <p className="m-0 max-w-[600px] text-base leading-normal text-fg-2 [text-wrap:pretty] sm:text-xl">
          Senior engineer and eng lead at Senseloaf AI. I ship product end to end: research, UI, frontend, backend, infra.
        </p>
        <dl className="m-0 grid max-w-[600px] grid-cols-3 gap-px border border-line bg-line">
          {[
            ["<100ms", "device streams"],
            ["−90%", "infra cost"],
            ["75★", "iOS Bridge"],
          ].map(([v, k]) => (
            <div key={k} className="flex flex-col-reverse gap-1 bg-bg p-3 sm:p-4">
              <dt className="text-[12px] text-fg-3 sm:text-[13px]">{k}</dt>
              <dd className="m-0 font-display text-[24px] font-extrabold leading-none tracking-[-0.04em] text-fg sm:text-[34px]">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2.5">
          <a href="#career" className={primaryBtn}>
            Open the trace ↓
          </a>
          <a href="/resume.pdf" target="_blank" rel="noopener" className={ghostBtn}>
            cat resume.pdf
          </a>
        </div>
      </div>
      <Tail />
    </section>
  );
}

/* ---------------------------------------------------------------- waterfall + heatmap */

const T0 = mIndex([2019, 8]);

function useNowIdx() {
  return mIndex(nowYm());
}

const ORDER: EraId[] = ["thapar", "ikarus", "autoflow", "nativebridge", "pcloudy", "markdrop", "senseloaf"];
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

function heat(skill: SkillId, year: number) {
  return ERAS.filter((e) => {
    if (!e.skills.includes(skill)) return false;
    const end = e.end ? e.end[0] : nowYm()[0];
    return e.start[0] <= year && end >= year;
  }).length;
}

export function CareerTrace() {
  const { award, awardOnce } = useGame();
  const nowIdx = useNowIdx();
  const span = nowIdx - T0 + 1;
  const [sel, setSel] = useState<EraId>("senseloaf");
  const [seen, setSeen] = useState<Set<EraId>>(() => new Set(["senseloaf"]));
  const [focus, setFocus] = useState<SkillId | null>(null);
  const [focused, setFocused] = useState<Set<SkillId>>(() => new Set());

  const pickEra = (id: EraId) => {
    setSel(id);
    const next = new Set(seen).add(id);
    setSeen(next);
    if (next.size === ORDER.length) award("replay", "Career replayed · every span inspected");
  };
  const pickSkill = (id: SkillId) => {
    const on = focus === id ? null : id;
    setFocus(on);
    if (!on) return;
    const next = new Set(focused).add(id);
    setFocused(next);
    if (new Set([...next].map((k) => SKILL_BY_ID[k].branch)).size === BRANCHES.length)
      awardOnce("showcase:heat", 40, "Heatmap read · every branch traced");
  };

  const era = ERAS.find((e) => e.id === sel)!;
  const months = monthsBetween(era.start, era.end ?? nowYm());

  return (
    <>
      <section id="career" aria-labelledby="trace-h" className={`${container} flex scroll-mt-20 flex-col gap-7 pb-14 pt-16 sm:pb-16 sm:pt-[88px]`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-[760px] flex-col gap-3">
            <Prompt>trace --service himanshu --since 2019</Prompt>
            <h2 id="trace-h" className={h2Class}>
              One long-running request
              <Dot />
            </h2>
            <p className="m-0 text-base leading-relaxed text-fg-2 sm:text-[17px]">
              Every chapter is a span, to the month. Overlaps are real: side quests run in parallel. Click a span for its
              attributes.
            </p>
          </div>
          <span className="font-mono text-sm text-fg-3">
            spans inspected <span className="text-fg">{seen.size}</span>/{ORDER.length}
          </span>
        </div>

        <div className="grid gap-px border border-line bg-line lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col bg-bg p-3 sm:p-5">
            {/* axis */}
            <div className="relative mb-2 h-5 font-mono text-[10px] text-fg-4 sm:ml-[180px]">
              {YEARS.map((y) => {
                const x = ((mIndex([y, 1]) - T0) / span) * 100;
                if (x < 0) return null;
                return (
                  <span key={y} className="absolute top-0 -translate-x-1/2" style={{ left: `${x}%` }}>
                    {`'${String(y).slice(2)}`}
                  </span>
                );
              })}
            </div>
            <ol className="m-0 flex list-none flex-col gap-1 p-0">
              {ORDER.map((id) => {
                const e = ERAS.find((x) => x.id === id)!;
                const s = mIndex(e.start);
                const end = e.end ? mIndex(e.end) : nowIdx;
                const left = (Math.max(0, s - T0) / span) * 100;
                const width = ((end - Math.max(s, T0) + 1) / span) * 100;
                const on = sel === id;
                const hit = focus ? e.skills.includes(focus) : true;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => pickEra(id)}
                      aria-label={`${e.org}, ${e.role}, ${e.period}`}
                      className={`group flex w-full flex-col gap-1 py-1.5 text-left sm:flex-row sm:items-center sm:gap-0 ${on ? "bg-surface-2" : "hover:bg-surface"} ${hit ? "" : "opacity-35"}`}
                    >
                      <span className="flex min-w-0 items-baseline gap-2 px-1 sm:w-[180px] sm:shrink-0 sm:flex-col sm:items-start sm:gap-0">
                        <span className="truncate font-mono text-[13px] text-fg">{e.org}</span>
                        <span className="truncate font-mono text-[11px] text-fg-3">{e.period}</span>
                      </span>
                      <span className="relative block h-7 w-full">
                        {YEARS.map((y) => {
                          const x = ((mIndex([y, 1]) - T0) / span) * 100;
                          return x > 0 ? <span key={y} aria-hidden className="absolute inset-y-0 w-px bg-line" style={{ left: `${x}%` }} /> : null;
                        })}
                        <span
                          aria-hidden
                          className={`absolute inset-y-1 flex items-center overflow-hidden px-1.5 font-mono text-[10px] ${
                            on ? "bg-signal text-on-signal" : e.kind === "venture" || e.kind === "freelance" ? "border border-dashed border-fg-3 bg-surface text-fg-2" : "bg-fg-3 text-bg"
                          }`}
                          style={{ left: `${left}%`, width: `${width}%`, minWidth: 6 }}
                        >
                          <span className="hidden whitespace-nowrap sm:inline">{durationLabel(end - Math.max(s, T0) + 1)}</span>
                        </span>
                        {!e.end && <span aria-hidden className="absolute inset-y-1 right-0 w-1 bg-signal motion-safe:animate-hk-blink" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="flex min-w-0 flex-col gap-3.5 bg-surface p-4 sm:p-6" aria-live="polite">
            <span className={label}>span attributes</span>
            <span className="font-display text-[26px] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-[32px]">{era.org}</span>
            <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 font-mono text-[13px]">
              <dt className="text-fg-4">role</dt>
              <dd className="m-0 text-fg">{era.role}</dd>
              <dt className="text-fg-4">period</dt>
              <dd className="m-0 text-fg">{era.period}</dd>
              <dt className="text-fg-4">duration</dt>
              <dd className="m-0 text-fg">{durationLabel(months)}{era.end ? "" : " · running"}</dd>
              {era.place && (
                <>
                  <dt className="text-fg-4">where</dt>
                  <dd className="m-0 text-fg">{era.place}</dd>
                </>
              )}
            </dl>
            <span className={label}>events</span>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px] leading-normal text-fg-2">
              {era.points.map((p) => (
                <li key={p} className="flex gap-2.5">
                  <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 bg-signal" />
                  {p}
                </li>
              ))}
            </ul>
            <span className={label}>tags</span>
            <div className="flex flex-wrap gap-1.5">
              {era.skills.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => pickSkill(k)}
                  aria-pressed={focus === k}
                  className={`min-h-9 border px-2 font-mono text-xs ${focus === k ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:text-fg"}`}
                >
                  {SKILL_BY_ID[k].name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="skills" aria-labelledby="heat-h" className="scroll-mt-20 border-y border-line bg-raised">
        <div className={`${container} flex flex-col gap-6 py-12 sm:py-16`}>
          <div className="flex flex-col gap-3">
            <Prompt>heatmap --skills --by-year</Prompt>
            <h2 id="heat-h" className={h2Class}>
              Skills, over time
            </h2>
            <p className="m-0 max-w-[700px] text-base leading-relaxed text-fg-2 sm:text-[17px]">
              Not bars out of ten. A cell lights up when a skill was in production that year; brighter means more than one
              place at once. Tap a row to trace it.
            </p>
          </div>
          <div className="overflow-x-auto border border-line bg-bg" role="region" aria-label="Skills heatmap" tabIndex={0}>
            <table className="w-full min-w-[320px] table-fixed border-collapse font-mono text-[11px] sm:text-[12px]">
              <thead>
                <tr>
                  <th className="sticky left-0 w-[104px] bg-bg p-2 text-left font-normal text-fg-4 sm:w-[200px]">skill</th>
                  {YEARS.map((y) => (
                    <th key={y} className="p-1 text-center font-normal text-fg-4">
                      {`'${String(y).slice(2)}`}
                    </th>
                  ))}
                  <th className="p-1 text-center font-normal text-fg-4">oss</th>
                </tr>
              </thead>
              {BRANCHES.map((b) => (
                <tbody key={b.id}>
                  <tr>
                    <th colSpan={YEARS.length + 2} className="border-t border-line px-2 pb-1 pt-3 text-left text-[10px] font-normal uppercase tracking-label text-signal-text">
                      {b.name}
                    </th>
                  </tr>
                  {SKILLS.filter((s) => s.branch === b.id).map((s) => {
                    const side = s.proof.some((p) => p.era === "oss" || p.era === "writing" || p.era === "stack");
                    const on = focus === s.id;
                    return (
                      <tr key={s.id} className={on ? "bg-surface-2" : ""}>
                        <th scope="row" className="sticky left-0 bg-inherit p-0 text-left font-normal">
                          <button
                            type="button"
                            onClick={() => pickSkill(s.id)}
                            aria-pressed={on}
                            className={`min-h-8 w-full truncate bg-bg px-2 text-left ${on ? "text-signal-text" : "text-fg-2 hover:text-fg"}`}
                          >
                            {s.name}
                          </button>
                        </th>
                        {YEARS.map((y) => {
                          const v = heat(s.id, y);
                          return (
                            <td key={y} className="p-[2px]">
                              <span
                                className="block h-6"
                                title={v ? `${s.name} · ${y}` : undefined}
                                style={{
                                  background: v
                                    ? `color-mix(in srgb, var(--c-signal) ${v >= 3 ? 100 : v === 2 ? 65 : 35}%, transparent)`
                                    : "var(--c-surface-2)",
                                }}
                              />
                            </td>
                          );
                        })}
                        <td className="p-[2px]">
                          <span className="block h-6" style={{ background: side ? "var(--c-fg-3)" : "var(--c-surface-2)" }} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
