"use client";

/**
 * /labs: every code lab by world, with difficulty, time, tests and your progress. Filters for world,
 * difficulty, language and type (lab, project, incident), learning paths (a lab joins one with
 * `paths:` in its front matter), and an interview badge for labs passed in interview mode.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useGame } from "@/game/GameProvider";
import { useInterviews, useLabProgress } from "@/lib/learn/labs/progress";
import { PYTHON_VERSION, RUNTIME_DOWNLOAD_LABEL } from "@/lib/learn/labs/runtime";
import { DIFFICULTY_LABEL, labInterviewKey, labKey, LANG_LABEL, LANG_SHORT, LAB_LANGS, LAB_TYPES, PATHS, pathTitle, TYPE_LABEL, type LabDifficulty, type LabLang, type LabSummary, type LabType } from "@/lib/learn/labs/types";
import { SaveGroupButton } from "@/components/offline/SaveOfflineButton";
import WatchHowItWorks from "@/components/learn/guide/videos/WatchHowItWorks";

type Filters = { world: number | null; difficulty: LabDifficulty | null; lang: LabLang | null; type: LabType | null; path: string | null };
const NONE: Filters = { world: null, difficulty: null, lang: null, type: null, path: null };

export default function LabsIndex({ labs }: { labs: LabSummary[] }) {
  const { done, hydrated } = useGame();
  const progress = useLabProgress();
  const interviews = useInterviews();
  const [f, setF] = useState<Filters>(NONE);
  const state = (l: LabSummary) => ((hydrated && done[labKey(l.id)]) || progress[l.id]?.passedAt ? "done" : progress[l.id]?.runs ? "started" : "new");
  const ivBest = (l: LabSummary) => interviews[l.id]?.best;
  const ivPassed = (l: LabSummary) => (hydrated && !!done[labInterviewKey(l.id)]) || !!ivBest(l)?.passed;
  const cleared = labs.filter((l) => state(l) === "done").length;
  const ivCount = labs.filter(ivPassed).length;
  const xpLeft = labs.filter((l) => state(l) !== "done").reduce((a, l) => a + l.xp, 0);

  const worldsAll = useMemo(() => [...new Map(labs.map((l) => [l.week, l.worldTitle])).entries()].sort((a, b) => a[0] - b[0]), [labs]);
  const langsAll = LAB_LANGS.filter((l) => labs.some((x) => x.languages.includes(l)));
  const typesAll = LAB_TYPES.filter((t) => labs.some((x) => x.type === t));
  const pathsAll = useMemo(() => {
    const ids = [...new Set(labs.flatMap((l) => l.paths))];
    return ids.sort((a, b) => (PATHS.findIndex((p) => p.id === a) + 1 || 99) - (PATHS.findIndex((p) => p.id === b) + 1 || 99));
  }, [labs]);

  const shown = labs.filter(
    (l) => (f.world == null || l.week === f.world) && (!f.difficulty || l.difficulty === f.difficulty) && (!f.lang || l.languages.includes(f.lang)) && (!f.type || l.type === f.type) && (!f.path || l.paths.includes(f.path))
  );
  const worlds = useMemo(() => {
    const m = new Map<number, LabSummary[]>();
    for (const l of shown) m.set(l.week, [...(m.get(l.week) ?? []), l]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [shown]);
  const active = Object.values(f).some((v) => v != null);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((x) => ({ ...x, [k]: x[k] === v ? null : v }));
  const path = f.path ? PATHS.find((p) => p.id === f.path) : null;

  const card = (l: LabSummary, n?: number) => {
    const s = state(l);
    const runs = progress[l.id]?.runs ?? 0;
    const best = ivBest(l);
    return (
      <li key={l.id}>
        <Link href={l.href} className={`flex h-full min-w-0 flex-col gap-3 border bg-surface p-5 hover:border-fg-3 ${s === "done" ? "border-line" : "border-line-strong"}`}>
          <span className="flex items-center justify-between gap-2 font-mono text-[11px] tracking-label">
            <span className="min-w-0 truncate text-signal-text">
              {n != null ? `${n}. ` : ""}
              {l.type === "lab" ? "LAB" : TYPE_LABEL[l.type].toUpperCase()} · W{l.weekCode} · {l.topic.toUpperCase()}
            </span>
            <span className={`shrink-0 ${s === "done" ? "text-ok-text" : s === "started" ? "text-signal-text" : "text-fg-3"}`}>{s === "done" ? "CLEARED ✓" : s === "started" ? `${runs} RUN${runs === 1 ? "" : "S"}` : "NEW"}</span>
          </span>
          <span className="break-words font-display text-[24px] font-bold leading-[1.08] tracking-[-0.02em] text-fg">{l.title}</span>
          {l.summary && <span className="text-sm leading-relaxed text-fg-2">{l.summary}</span>}
          {l.lessons[0] && (
            <span className="text-xs text-fg-3">
              From {l.lessons[0].code} · {l.lessons[0].title}
            </span>
          )}
          <span className="flex flex-wrap gap-1 font-mono text-[10.5px] uppercase tracking-[0.06em]">
            {l.languages.map((x) => (
              <span key={x} className="border border-line px-1.5 py-0.5 text-fg-2">
                {LANG_SHORT[x]}
              </span>
            ))}
            {l.features.stages > 0 && <span className="border border-line px-1.5 py-0.5 text-fg-2">{l.features.stages} stages</span>}
            {l.features.viz && <span className="border border-line px-1.5 py-0.5 text-fg-2">visualiser</span>}
            {l.features.chaos && <span className="border border-line px-1.5 py-0.5 text-fg-2">chaos</span>}
            {l.features.scale && <span className="border border-line px-1.5 py-0.5 text-fg-2">scale</span>}
            {l.features.followUps > 0 && <span className="border border-line px-1.5 py-0.5 text-fg-2">{l.features.followUps} follow-ups</span>}
            {ivPassed(l) && (
              <span className="border border-ok px-1.5 py-0.5 text-ok-text" title="Passed in interview mode">
                interview ✓{best ? ` ${best.score}` : ""}
              </span>
            )}
          </span>
          <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 font-mono text-[12px] text-fg-3">
            <span className="text-fg">{DIFFICULTY_LABEL[l.difficulty]}</span>
            <span>~{l.minutes} min</span>
            <span>
              {l.tests.visible} + {l.tests.hidden} hidden tests
            </span>
            <span className={`ml-auto ${s === "done" ? "text-fg-3" : "text-signal-text"}`}>+{l.xp} XP</span>
          </span>
        </Link>
      </li>
    );
  };

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 pb-32 pt-10 sm:px-6 sm:pt-16 lg:pb-24">
      <header className="flex flex-col gap-5">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">Learn · code labs · free</span>
        <h1 className="font-display text-[clamp(44px,7vw,104px)] font-extrabold leading-[0.88] tracking-tightest text-fg">
          Build it yourself<span className="text-signal-text">.</span>
        </h1>
        <p className="max-w-[760px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
          More interviews now include an &ldquo;implement this component&rdquo; round: a rate limiter, an LRU cache, a consistent hashing ring. Each lab here is one of those, taken straight from a lesson. Write {langsAll.map((l) => LANG_LABEL[l]).join(langsAll.length > 2 ? ", " : " or ").replace(/, ([^,]*)$/, " or $1")} in the browser and run it against example tests and hidden edge cases.
        </p>
        <WatchHowItWorks id="code-labs" />
        <div className="flex flex-wrap gap-px self-start border border-line bg-line font-mono">
          <span className="bg-bg px-4 py-2.5 text-[13px] text-fg-3">
            <span className="text-xl font-semibold text-fg">{cleared}</span>/{labs.length} cleared
          </span>
          <span className="bg-bg px-4 py-2.5 text-[13px] text-fg-3">
            <span className="text-xl font-semibold text-signal-text">{xpLeft}</span> XP to earn
          </span>
          {ivCount > 0 && (
            <span className="bg-bg px-4 py-2.5 text-[13px] text-fg-3">
              <span className="text-xl font-semibold text-ok-text">{ivCount}</span> interview pass{ivCount === 1 ? "" : "es"}
            </span>
          )}
          <span className="bg-bg px-4 py-2.5 text-[13px] text-fg-3">Python {PYTHON_VERSION} · JS · TS · runs on your device</span>
        </div>
        <ul className="m-0 grid max-w-[980px] list-none gap-px border border-line bg-line p-0 text-sm text-fg-2 sm:grid-cols-3">
          <li className="bg-surface p-4">
            <span className="mb-1 block font-mono text-[11px] uppercase tracking-label text-fg">No install, no server</span>
            Python runs in your browser (Pyodide, CPython compiled to WebAssembly; the first run downloads it once, {RUNTIME_DOWNLOAD_LABEL}). JavaScript and TypeScript run in a sandboxed worker.
          </li>
          <li className="bg-surface p-4">
            <span className="mb-1 block font-mono text-[11px] uppercase tracking-label text-fg">Practice like the real round</span>
            Interview mode puts a clock on it, takes the hints away and asks the follow-ups. Chaos and scale tests show what passing tests miss.
          </li>
          <li className="bg-surface p-4">
            <span className="mb-1 block font-mono text-[11px] uppercase tracking-label text-fg">Works offline</span>
            Save a lab (or a whole world) and it runs with no internet. Your code autosaves in this browser.
          </li>
        </ul>
      </header>

      {labs.length > 0 && (
        <section aria-label="Filter labs" className="flex flex-col gap-3 border-y border-line py-4" data-hk-lab-filters="">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-fg-3">
              World
              <select
                value={f.world ?? ""}
                onChange={(e) => setF((x) => ({ ...x, world: e.target.value === "" ? null : Number(e.target.value) }))}
                className="min-h-10 max-w-[60vw] border border-line bg-bg px-2 font-mono text-[12px] normal-case tracking-normal text-fg sm:max-w-[280px]"
              >
                <option value="">All worlds</option>
                {worldsAll.map(([w, t]) => (
                  <option key={w} value={w}>
                    {String(w).padStart(2, "0")} · {t}
                  </option>
                ))}
              </select>
            </label>
            <ChipGroup label="Level" options={(["easy", "medium", "hard"] as const).map((d) => ({ id: d, label: DIFFICULTY_LABEL[d] }))} value={f.difficulty} onPick={(v) => set("difficulty", v)} />
            {langsAll.length > 1 && <ChipGroup label="Language" options={langsAll.map((l) => ({ id: l, label: LANG_SHORT[l] }))} value={f.lang} onPick={(v) => set("lang", v)} />}
            {typesAll.length > 1 && <ChipGroup label="Type" options={typesAll.map((t) => ({ id: t, label: TYPE_LABEL[t] }))} value={f.type} onPick={(v) => set("type", v)} />}
          </div>
          {pathsAll.length > 0 && <ChipGroup label="Learning paths" options={pathsAll.map((p) => ({ id: p, label: pathTitle(p) }))} value={f.path} onPick={(v) => set("path", v)} />}
          <div className="flex flex-wrap items-center gap-3 font-mono text-[12px] text-fg-3">
            <span aria-live="polite">
              {shown.length} of {labs.length} labs
            </span>
            {active && (
              <button type="button" onClick={() => setF(NONE)} className="inline-flex min-h-9 items-center gap-1 text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg">
                <X className="h-3.5 w-3.5" aria-hidden /> clear filters
              </button>
            )}
          </div>
        </section>
      )}

      {!labs.length && <p className="text-fg-3">No labs are published yet. Check back soon.</p>}
      {labs.length > 0 && !shown.length && <p className="text-fg-3">No labs match these filters yet.</p>}

      {f.path ? (
        <section aria-labelledby="labs-path" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 border-b border-line pb-3">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Learning path · {shown.length} labs, in order</span>
            <h2 id="labs-path" className="m-0 font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-fg">
              {pathTitle(f.path)}
            </h2>
            {path?.blurb && <p className="m-0 mt-1 text-[15px] text-fg-2">{path.blurb}</p>}
          </div>
          <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">{shown.map((l, i) => card(l, i + 1))}</ol>
        </section>
      ) : (
        worlds.map(([week, list]) => (
          <section key={week} aria-labelledby={`labs-w${week}`} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
              <h2 id={`labs-w${week}`} className="m-0 flex min-w-0 flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{list[0].weekCode === "DP" ? "Section" : "World"} {list[0].weekCode}</span>
                <span className="font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-fg">{list[0].worldTitle}</span>
              </h2>
              {list[0].weekKey && <SaveGroupButton group={list[0].weekKey} label="Save world offline" />}
            </div>
            <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">{list.map((l) => card(l))}</ol>
          </section>
        ))
      )}
    </main>
  );
}

function ChipGroup<T extends string>({ label, options, value, onPick }: { label: string; options: { id: T; label: string }[]; value: T | null; onPick: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="mr-1 font-mono text-[11px] uppercase tracking-label text-fg-3">{label}</span>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onPick(o.id)}
          className={`min-h-9 border px-2.5 font-mono text-[12px] ${value === o.id ? "border-fg bg-fg text-bg" : "border-line text-fg-2 hover:border-fg-3 hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
