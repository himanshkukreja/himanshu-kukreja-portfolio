"use client";

import { useEffect, useRef, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { Prompt, container, h2Class } from "./ui";
import { BRANCHES, ERA_BY_ID, SKILLS, SKILL_BY_ID, type BranchId, type EraId, type Proof, type SkillId } from "./showcase/data";
import { label, proofWhere } from "./showcase/parts";
import { SKILL_EVT, openWorld } from "./showcase/bus";

// Skills as an RPG skill tree. Nothing is self-rated: every node is unlocked by receipts (shipped work),
// and the pips are just how many receipts are on file.

const isEra = (p: Proof): p is Proof & { era: EraId } => p.era in ERA_BY_ID;

function since(id: SkillId): string {
  const years = SKILL_BY_ID[id].proof.filter(isEra).map((p) => ERA_BY_ID[p.era].start[0]);
  return years.length ? String(Math.min(...years)) : "side projects";
}

function Pips({ n }: { n: number }) {
  return (
    <span aria-hidden className="flex shrink-0 gap-[3px]">
      {Array.from({ length: 4 }, (_, i) => (
        <span key={i} className={`h-1.5 w-2 ${i < n ? "bg-current" : "bg-current opacity-20"}`} />
      ))}
    </span>
  );
}

function Panel({ id, panelId }: { id: SkillId; panelId: string }) {
  const s = SKILL_BY_ID[id];
  const branch = BRANCHES.find((b) => b.id === s.branch)!;
  return (
    <div id={panelId} className="flex scroll-mt-24 flex-col gap-4" aria-live="polite">
      <div className="flex flex-col gap-1.5">
        <span className={label}>{branch.name}</span>
        <span className="font-display text-[30px] font-extrabold leading-none tracking-[-0.04em] text-fg sm:text-[36px]">{s.name}</span>
        <span className="font-mono text-xs text-fg-3">
          unlocked {since(id)} · {s.proof.length} receipt{s.proof.length === 1 ? "" : "s"} on file
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
        {s.proof.map((p, i) => (
          <li key={i} className="flex flex-col items-start gap-1 bg-bg px-3.5 py-3">
            {isEra(p) ? (
              <button
                type="button"
                onClick={() => openWorld(p.era)}
                className="-my-1 inline-flex min-h-8 items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-signal-text underline decoration-transparent underline-offset-4 hover:decoration-current"
              >
                {proofWhere(p.era)} · {ERA_BY_ID[p.era].period} →
              </button>
            ) : (
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{proofWhere(p.era)}</span>
            )}
            <span className="text-[15px] leading-snug text-fg-2">{p.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Dependencies() {
  const { award } = useGame();
  const [sel, setSel] = useState<SkillId>("webrtc");
  const [branch, setBranch] = useState<BranchId>("realtime");
  const [seen, setSeen] = useState<Set<SkillId>>(() => new Set(["webrtc"]));
  const seenRef = useRef(seen);

  const pick = (id: SkillId) => {
    setSel(id);
    setBranch(SKILL_BY_ID[id].branch);
    const next = new Set(seenRef.current).add(id);
    seenRef.current = next;
    setSeen(next);
    if (new Set([...next].map((k) => SKILL_BY_ID[k].branch)).size === BRANCHES.length) {
      award("tree", "Skill tree · every branch inspected");
    }
  };
  const pickRef = useRef(pick);
  useEffect(() => {
    pickRef.current = pick;
  });

  // The career map's "skills used" chips select a node here.
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<SkillId>).detail;
      if (SKILL_BY_ID[id]) pickRef.current(id);
    };
    window.addEventListener(SKILL_EVT, on);
    return () => window.removeEventListener(SKILL_EVT, on);
  }, []);

  const branchesDone = new Set([...seen].map((k) => SKILL_BY_ID[k].branch));

  const node = (id: SkillId, last: boolean) => {
    const s = SKILL_BY_ID[id];
    const on = sel === id;
    const was = seen.has(id);
    return (
      <li key={id} className="relative pl-5">
        {/* tree connectors */}
        <span aria-hidden className={`absolute left-[7px] top-0 w-px bg-line-strong ${last ? "h-1/2" : "h-full"}`} />
        <span aria-hidden className="absolute left-[7px] top-1/2 h-px w-[13px] bg-line-strong" />
        <button
          type="button"
          aria-pressed={on}
          aria-label={`${s.name}, ${s.proof.length} receipt${s.proof.length === 1 ? "" : "s"}${was ? ", inspected" : ""}`}
          onClick={() => pick(id)}
          className={`my-[3px] flex min-h-11 w-full items-center justify-between gap-2.5 border px-3 py-2 text-left font-mono text-[13px] transition-colors ${
            on
              ? "border-signal bg-signal text-on-signal"
              : was
                ? "border-line-strong bg-surface text-fg hover:border-fg-3"
                : "border-line bg-bg text-fg-2 hover:border-line-strong hover:text-fg"
          }`}
        >
          <span className="min-w-0">{s.name}</span>
          <span className={on ? "text-on-signal" : "text-signal-text"}>
            <Pips n={s.proof.length} />
          </span>
        </button>
      </li>
    );
  };

  const branchHead = (id: BranchId) => {
    const b = BRANCHES.find((x) => x.id === id)!;
    const done = branchesDone.has(id);
    return (
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={`mt-1 grid h-4 w-4 shrink-0 place-items-center text-[10px] font-bold ${done ? "bg-signal text-on-signal" : "border border-line-strong"}`}
        >
          {done ? "✓" : ""}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-display text-lg font-bold leading-tight tracking-[-0.02em] text-fg">{b.name}</span>
          <span className="text-[13px] leading-snug text-fg-3">{b.blurb}</span>
        </span>
      </div>
    );
  };

  return (
    <section id="skills" aria-labelledby="skills-h" className="scroll-mt-20 border-y border-line bg-raised">
      <div className={`${container} flex flex-col gap-7 py-12 sm:py-16`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-[720px] flex-col gap-3">
            <Prompt>./skills --tree --show-receipts</Prompt>
            <h2 id="skills-h" className={h2Class}>
              Skill tree
            </h2>
            <p className="m-0 text-base leading-relaxed text-fg-2 sm:text-[17px]">
              No bars out of ten. Every node is unlocked by something that shipped, and the pips count the receipts. Inspect
              a node in every branch for +40 XP.
            </p>
          </div>
          <span className="font-mono text-sm text-fg-3" aria-live="polite">
            branches <span className="text-fg">{branchesDone.size}</span>/{BRANCHES.length} · nodes{" "}
            <span className="text-fg">{seen.size}</span>/{SKILLS.length}
          </span>
        </div>

        {/* phones + tablets: one branch at a time */}
        <div className="flex flex-col gap-4 lg:hidden">
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Skill branches">
            {BRANCHES.map((b) => {
              const on = branch === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="tab"
                  id={`skill-tab-${b.id}`}
                  aria-controls="skill-tabpanel"
                  aria-selected={on}
                  onClick={() => setBranch(b.id)}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 border px-3 font-mono text-xs ${
                    on ? "border-fg bg-fg text-bg" : "border-line-strong text-fg-2"
                  }`}
                >
                  {branchesDone.has(b.id) && <span aria-hidden className={on ? "text-bg" : "text-signal-text"}>✓</span>}
                  {b.short}
                </button>
              );
            })}
          </div>
          <div role="tabpanel" id="skill-tabpanel" aria-labelledby={`skill-tab-${branch}`} className="flex flex-col gap-2">
            {branchHead(branch)}
            <ul className="m-0 grid list-none grid-cols-1 p-0 sm:grid-cols-2 sm:gap-x-3">
              {SKILLS.filter((s) => s.branch === branch).map((s, i, arr) => node(s.id, i === arr.length - 1))}
            </ul>
          </div>
          <div className="border border-line-strong bg-surface p-4">
            <Panel id={sel} panelId="skill-panel-m" />
          </div>
        </div>

        {/* desktop: the whole tree */}
        <div className="hidden gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="grid grid-cols-3 gap-x-6 gap-y-9">
            {BRANCHES.map((b) => {
              const items = SKILLS.filter((s) => s.branch === b.id);
              return (
                <div key={b.id} className="flex min-w-0 flex-col gap-2">
                  {branchHead(b.id)}
                  <ul className="m-0 list-none p-0">{items.map((s, i) => node(s.id, i === items.length - 1))}</ul>
                </div>
              );
            })}
          </div>
          <aside className="sticky top-24 self-start border border-line-strong bg-surface p-5" aria-label="Selected skill">
            <Panel id={sel} panelId="skill-panel" />
          </aside>
        </div>
      </div>
    </section>
  );
}
