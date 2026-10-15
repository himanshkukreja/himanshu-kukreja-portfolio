"use client";

import { useState } from "react";
import { useGame } from "@/game/GameProvider";
import { Dot, Prompt, container, h2Class } from "../../ui";
import { ERAS, PERSON, SKILLS, SKILL_BY_ID, ymLabel, type Era, type SkillId } from "../data";
import { EraBody, label, proofWhere } from "../parts";

/* ---------------------------------------------------------------- files */

type FileId = string;

const careerFile = (e: Era) => `career/${e.start[0]}-${e.id}.md`;

const FILES: { id: FileId; dir?: string }[] = [
  { id: "README.md" },
  { id: "now.md" },
  ...[...ERAS].reverse().map((e) => ({ id: careerFile(e), dir: "career" })),
  { id: "skills.lock" },
  { id: ".env" },
];

function Readme() {
  return (
    <div className="flex flex-col gap-5">
      <span className="font-mono text-xs text-fg-4"># README.md</span>
      <h1 className="m-0 font-display text-[clamp(48px,7vw,104px)] font-extrabold leading-[0.86] tracking-tightest text-fg">
        {PERSON.first}
        <br />
        {PERSON.last}
        <Dot />
      </h1>
      <p className="m-0 max-w-[560px] text-base leading-normal text-fg-2 sm:text-lg">
        Senior engineer and eng lead at Senseloaf AI. Ships product end to end: research, UI, frontend, backend, infra.
        This repo is me. Open a file.
      </p>
      <pre className="m-0 overflow-x-auto border border-line bg-bg p-3 font-mono text-[13px] text-fg-2">
        <span className="text-fg-4">$ </span>git clone himanshu &amp;&amp; cd himanshu{"\n"}
        <span className="text-fg-4">$ </span>cat career/*.md | wc -l <span className="text-fg-4"># {ERAS.length} chapters</span>
      </pre>
    </div>
  );
}

function Now() {
  return (
    <div className="flex flex-col gap-3 font-mono text-sm leading-relaxed text-fg-2">
      <span className="text-fg-4"># now.md · updated {ymLabel([new Date().getFullYear(), new Date().getMonth() + 1])}</span>
      <span>
        <span className="text-signal-text">-</span> {PERSON.now} at Senseloaf AI
      </span>
      <span>
        <span className="text-signal-text">-</span> {PERSON.side}
      </span>
      <span>
        <span className="text-signal-text">-</span> Writing case files and the System Design Mastery course
      </span>
    </div>
  );
}

function Lock({ open }: { open: (f: FileId) => void }) {
  return (
    <div className="flex flex-col gap-1 font-mono text-[13px] leading-relaxed">
      <span className="text-fg-4"># skills.lock · resolved from shipped work. do not edit by hand.</span>
      {SKILLS.map((s) => {
        const first = s.proof[0];
        const era = ERAS.find((e) => e.id === first.era);
        return (
          <div key={s.id} className="flex flex-wrap gap-x-2">
            <span className="text-signal-text">{s.id}</span>
            <span className="text-fg-4">@</span>
            <span className="text-fg">{s.proof.length}</span>
            <span className="text-fg-4">resolved</span>
            {era ? (
              <button type="button" onClick={() => open(careerFile(era))} className="min-h-6 text-fg-2 underline decoration-line-strong underline-offset-2 hover:text-fg">
                {careerFile(era)}
              </button>
            ) : (
              <span className="text-fg-2">{proofWhere(first.era)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FileView({ id, open }: { id: FileId; open: (f: FileId) => void }) {
  if (id === "README.md") return <Readme />;
  if (id === "now.md") return <Now />;
  if (id === "skills.lock") return <Lock open={open} />;
  if (id === ".env")
    return (
      <div className="flex flex-col gap-2 font-mono text-sm text-fg-2">
        <span>OPENAI_API_KEY=<span className="bg-fg text-fg">sk-nice-try-nice-try-nice-try</span></span>
        <span>HIRE_ME=true</span>
        <span className="text-fg-4"># secrets are in the other repo. +XP for looking though.</span>
      </div>
    );
  const era = ERAS.find((e) => careerFile(e) === id)!;
  return (
    <div className="flex flex-col gap-4">
      <span className="font-mono text-xs text-fg-4">---{"\n"}</span>
      <span className="font-mono text-xs uppercase tracking-label text-signal-text">
        {era.period}
        {era.place ? ` · ${era.place}` : ""} · {era.role}
      </span>
      <span className="font-display text-[28px] font-extrabold leading-[1.02] tracking-[-0.03em] text-fg sm:text-[40px]">
        # {era.org}
      </span>
      <span className="text-[17px] text-fg">{era.line}</span>
      <EraBody era={era} />
    </div>
  );
}

/* ---------------------------------------------------------------- explorer */

export function Explorer() {
  const { awardOnce } = useGame();
  const [file, setFile] = useState<FileId>("README.md");
  const [tabs, setTabs] = useState<FileId[]>(["README.md"]);
  const [opened, setOpened] = useState<Set<FileId>>(() => new Set(["README.md"]));

  const open = (f: FileId) => {
    setFile(f);
    setTabs((t) => (t.includes(f) ? t : [...t.slice(-3), f]));
    const next = new Set(opened).add(f);
    setOpened(next);
    if (f === ".env") awardOnce("showcase:env", 25, "Found the .env · nice try");
    if (next.size >= 6) awardOnce("showcase:repo", 40, "Repo explorer · 6 files opened");
  };

  return (
    <div className="flex min-w-0 flex-col border border-line-strong bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 font-mono text-xs text-fg-3">
        <span>~/himanshu — code</span>
        <span>{opened.size}/{FILES.length} opened</span>
      </div>
      <div className="grid min-h-[520px] grid-cols-[minmax(0,1fr)] md:grid-cols-[220px_minmax(0,1fr)]">
        {/* file tree */}
        <nav aria-label="Files" className="min-w-0 border-b border-line bg-raised md:border-b-0 md:border-r">
          <div className="hidden px-3 pb-1 pt-3 md:block">
            <span className={label}>explorer</span>
          </div>
          <ul className="m-0 flex list-none gap-1 overflow-x-auto p-2 md:flex-col md:gap-0 md:overflow-visible md:p-1.5">
            {FILES.map((f, i) => {
              const prevDir = FILES[i - 1]?.dir;
              const on = file === f.id;
              const name = f.dir ? f.id.slice(f.dir.length + 1) : f.id;
              return (
                <li key={f.id} className="shrink-0">
                  {f.dir && prevDir !== f.dir && (
                    <span className="hidden px-2 pb-0.5 pt-2 font-mono text-xs text-fg-3 md:block">▾ {f.dir}/</span>
                  )}
                  <button
                    type="button"
                    onClick={() => open(f.id)}
                    aria-current={on ? "true" : undefined}
                    className={`flex min-h-10 w-full items-center gap-2 whitespace-nowrap border px-2.5 text-left font-mono text-[13px] md:border-0 ${f.dir ? "md:pl-6" : ""} ${
                      on ? "border-signal bg-signal text-on-signal" : "border-line text-fg-2 hover:bg-surface-2 hover:text-fg"
                    }`}
                  >
                    <span className="md:hidden">{f.dir ? `${f.dir}/` : ""}</span>
                    {name}
                    {opened.has(f.id) && !on && <span aria-hidden className="ml-auto hidden h-1.5 w-1.5 bg-signal md:block" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        {/* editor */}
        <div className="flex min-w-0 flex-col">
          <div className="hidden overflow-x-auto border-b border-line md:flex" role="tablist" aria-label="Open files">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={t === file}
                onClick={() => open(t)}
                className={`min-h-10 shrink-0 border-r border-line px-3.5 font-mono text-xs ${
                  t === file ? "border-t-2 border-t-signal bg-bg text-fg" : "text-fg-3 hover:text-fg"
                }`}
              >
                {t.split("/").pop()}
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1 bg-bg p-4 sm:p-7" aria-live="polite">
            <FileView id={file} open={open} />
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-line bg-raised px-3 py-1.5 font-mono text-[11px] text-fg-3">
            <span>
              <span className="text-signal-text">⎇ main</span> · 0 problems
            </span>
            <span>{file}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- grep */

export function Grep() {
  const [q, setQ] = useState("webrtc");
  const needle = q.trim().toLowerCase();
  const hits = needle
    ? SKILLS.filter((s) => s.name.toLowerCase().includes(needle) || s.id.includes(needle) || s.proof.some((p) => p.text.toLowerCase().includes(needle)))
    : [];
  const quick: SkillId[] = ["python", "webrtc", "llm-agents", "mcp", "cloudrun", "typescript", "mentoring"];
  return (
    <section id="skills" aria-labelledby="grep-h" className="scroll-mt-20 border-y border-line bg-raised">
      <div className={`${container} flex flex-col gap-6 py-12 sm:py-16`}>
        <div className="flex flex-col gap-3">
          <Prompt>grep -rn &lt;skill&gt; ~/himanshu</Prompt>
          <h2 id="grep-h" className={h2Class}>
            Grep the receipts
          </h2>
          <p className="m-0 max-w-[680px] text-base leading-relaxed text-fg-2 sm:text-[17px]">
            Skills are claims. Search one and get the lines where it shipped.
          </p>
        </div>
        <label className="flex min-h-12 items-center gap-2 border border-line-strong bg-bg px-3 font-mono text-sm">
          <span className="text-signal-text">$ grep -rn</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search skills"
            className="min-w-0 flex-1 bg-transparent text-base text-fg outline-none sm:text-sm"
            spellCheck={false}
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {quick.map((k) => (
            <button key={k} type="button" onClick={() => setQ(SKILL_BY_ID[k].name.toLowerCase())} className="min-h-10 border border-line-strong px-2.5 font-mono text-xs text-fg-2 hover:text-fg">
              {SKILL_BY_ID[k].name}
            </button>
          ))}
        </div>
        <div className="border border-line bg-bg font-mono text-[13px]" aria-live="polite">
          {hits.length === 0 && <div className="p-4 text-fg-3">no matches · exit 1</div>}
          {hits.map((s) => (
            <div key={s.id} className="border-b border-line p-3 last:border-b-0 sm:p-4">
              <div className="mb-1.5 text-fg">{s.name}</div>
              {s.proof.map((p, i) => (
                <div key={i} className="flex flex-wrap gap-x-2 leading-relaxed">
                  <span className="text-signal-text">{proofWhere(p.era).toLowerCase().replace(/\s+/g, "-")}:{i + 1}</span>
                  <span className="text-fg-2">{p.text}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- git graph */

type Row = { lane: 0 | 1 | 2; date: string; msg: string; era?: Era["id"]; ref?: string; merge?: boolean };

const ROWS: Row[] = [
  { lane: 0, date: "Jun 2026", msg: "merge branch 'freelance/pcloudy'", merge: true, era: "pcloudy" },
  { lane: 0, date: "Apr 2026", msg: "feat: senseloaf ai · senior swe, eng lead", era: "senseloaf", ref: "HEAD -> main" },
  { lane: 2, date: "Mar 2026", msg: "init: markdrop", era: "markdrop", ref: "markdrop" },
  { lane: 1, date: "Mar 2026", msg: "freelance: pcloudy device-streaming research", era: "pcloudy" },
  { lane: 0, date: "Jan 2025", msg: "feat: nativebridge · founding engineer", era: "nativebridge" },
  { lane: 0, date: "Jan 2024", msg: "feat: autoflow · founding engineer #1", era: "autoflow" },
  { lane: 0, date: "Jan 2023", msg: "feat: ikarus 3d · sda → sde 1", era: "ikarus" },
  { lane: 0, date: "2019", msg: "init: thapar · b.e. computer science", era: "thapar" },
];

const LX = [14, 34, 54];
const RH = 56;

function Lanes({ i }: { i: number }) {
  const r = ROWS[i];
  // which lanes pass through this row
  const lane1 = i >= 0 && i <= 3; // pcloudy lives between row 3 (start) and row 0 (merge)
  const lane2 = i <= 2; // markdrop: row 2 up to the top, still open
  return (
    <svg aria-hidden width="68" height={RH} className="shrink-0">
      <line x1={LX[0]} y1={i === 0 ? RH / 2 : 0} x2={LX[0]} y2={i === ROWS.length - 1 ? RH / 2 : RH} stroke="var(--c-fg-3)" strokeWidth="2" />
      {i === 0 && <line x1={LX[0]} y1="0" x2={LX[0]} y2={RH / 2} stroke="var(--c-fg-3)" strokeWidth="2" strokeDasharray="3 3" />}
      {lane1 && (
        <line
          x1={LX[1]}
          y1={i === 0 ? RH / 2 : 0}
          x2={LX[1]}
          y2={i === 3 ? RH / 2 : RH}
          stroke="var(--c-signal)"
          strokeWidth="2"
        />
      )}
      {i === 0 && <line x1={LX[1]} y1={RH / 2} x2={LX[0]} y2={RH / 2} stroke="var(--c-signal)" strokeWidth="2" />}
      {i === 3 && <path d={`M${LX[1]} ${RH / 2} C ${LX[1]} ${RH}, ${LX[0]} ${RH / 2}, ${LX[0]} ${RH}`} fill="none" stroke="var(--c-signal)" strokeWidth="2" />}
      {lane2 && <line x1={LX[2]} y1="0" x2={LX[2]} y2={i === 2 ? RH / 2 : RH} stroke="var(--c-fg)" strokeWidth="2" />}
      {i === 2 && <path d={`M${LX[2]} ${RH / 2} C ${LX[2]} ${RH}, ${LX[0]} ${RH / 2}, ${LX[0]} ${RH}`} fill="none" stroke="var(--c-fg)" strokeWidth="2" />}
      <rect
        x={LX[r.lane] - 6}
        y={RH / 2 - 6}
        width="12"
        height="12"
        fill={r.merge ? "var(--c-bg)" : r.lane === 1 ? "var(--c-signal)" : r.lane === 2 ? "var(--c-fg)" : "var(--c-bg)"}
        stroke={r.lane === 1 || r.merge ? "var(--c-signal)" : r.lane === 2 ? "var(--c-fg)" : "var(--c-fg-3)"}
        strokeWidth="2"
      />
    </svg>
  );
}

export function GitGraph() {
  const { award } = useGame();
  const [sel, setSel] = useState<number>(1);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([1]));
  const pick = (i: number) => {
    setSel(i);
    const next = new Set(seen).add(i);
    setSeen(next);
    if (next.size === ROWS.length) award("replay", "Career replayed · every commit read");
  };
  const row = ROWS[sel];
  const era = ERAS.find((e) => e.id === row.era)!;
  return (
    <section id="career" aria-labelledby="git-h" className={`${container} flex scroll-mt-20 flex-col gap-7 pb-14 pt-16 sm:pb-16 sm:pt-[88px]`}>
      <div className="flex flex-col gap-3">
        <Prompt>git log --graph --all</Prompt>
        <h2 id="git-h" className={h2Class}>
          Three branches, one HEAD
          <Dot />
        </h2>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-px border border-line bg-line lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ol className="m-0 list-none bg-bg p-0 py-2">
          {ROWS.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                aria-pressed={sel === i}
                onClick={() => pick(i)}
                className={`flex w-full items-center gap-1 pr-3 text-left ${sel === i ? "bg-surface-2" : "hover:bg-surface"}`}
                style={{ height: RH }}
              >
                <Lanes i={i} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-mono text-[13px] text-fg">
                    {r.ref && <span className="mr-1.5 text-signal-text">({r.ref})</span>}
                    {r.msg}
                  </span>
                  <span className="font-mono text-[11px] text-fg-3">{r.date}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-3 bg-surface p-4 sm:p-6" aria-live="polite">
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">{era.period}</span>
          <span className="font-display text-[26px] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-[32px]">
            {era.org} · {era.role}
          </span>
          <EraBody era={era} />
        </div>
      </div>
    </section>
  );
}

export default function RepoHero() {
  return (
    <section aria-label="Intro" className={`${container} pb-14 pt-6 sm:pb-[72px] sm:pt-10`}>
      <Explorer />
    </section>
  );
}
