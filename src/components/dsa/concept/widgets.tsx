"use client";

/**
 * The small DSA lesson widgets the hydrator mounts into the renderer's `[data-dsa]` figures (detect/dsa.ts): code tabs,
 * polls, the template reorder, review cards and the checkpoint gate. Each one works on the server-rendered figure
 * (reading its static content, toggling attributes) and never changes course text, so highlight offsets stay valid.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import { DSA_LANG_LABEL, dsaKeys, type ConceptCheckpoint, type DsaLang } from "@/lib/dsa/types";
import { useDsaAward } from "@/components/dsa/rewards/useDsaBits";

/* ------------------------------------------------------------------ language preference (shared by every tab set) */

const LANG_KEY = "dsa.lang";
const LANG_EVENT = "dsa:lang";

export function readLang(): DsaLang {
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    if (v === "python" || v === "javascript" || v === "java" || v === "cpp") return v;
  } catch {
    /* storage blocked */
  }
  return "python";
}

export function writeLang(l: DsaLang) {
  try {
    window.localStorage.setItem(LANG_KEY, l);
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: l }));
}

function subscribeLang(cb: () => void) {
  window.addEventListener(LANG_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(LANG_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useLang(): [DsaLang, (l: DsaLang) => void] {
  const lang = useSyncExternalStore(subscribeLang, readLang, () => "python" as DsaLang);
  return [lang, writeLang];
}

/* ------------------------------------------------------------------ code tabs */

export function CodeTabs({ fig }: { fig: HTMLElement }) {
  const [lang, setLang] = useLang();
  const panes = useMemo(() => Array.from(fig.querySelectorAll<HTMLElement>(".dsa-pane")), [fig]);
  const langs = panes.map((p) => (p.dataset.lang || "") as DsaLang);
  const active = langs.includes(lang) ? lang : langs[0];

  useEffect(() => {
    fig.setAttribute("data-hydrated", "");
    panes.forEach((p) => {
      p.hidden = p.dataset.lang !== active;
    });
  }, [fig, panes, active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const at = langs.indexOf(active);
    const next = langs[(at + (e.key === "ArrowRight" ? 1 : langs.length - 1)) % langs.length];
    setLang(next);
    (e.currentTarget.querySelector(`[data-tab="${next}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <div role="tablist" aria-label="Language" onKeyDown={onKey} className="dsa-ui flex flex-wrap gap-0 border-b border-line px-2">
      {langs.map((l) => (
        <button
          key={l}
          type="button"
          role="tab"
          data-tab={l}
          aria-selected={l === active}
          tabIndex={l === active ? 0 : -1}
          onClick={() => setLang(l)}
          className={`min-h-11 border-b-2 px-3 font-mono text-[12px] uppercase tracking-label ${l === active ? "border-signal text-fg" : "border-transparent text-fg-3 hover:text-fg"}`}
        >
          {DSA_LANG_LABEL[l] || l}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ poll */

export function Poll({ fig, conceptId }: { fig: HTMLElement; conceptId: string }) {
  const id = fig.dataset.pollId || "poll";
  const key = `dsa.poll.${conceptId}.${id}`;
  const options = useMemo(() => Array.from(fig.querySelectorAll(".dsa-poll-options li")).map((li) => (li.textContent || "").trim()), [fig]);
  // mounted only in the browser (a portal the hydrator adds after load), so storage can seed the state
  const [pick, setPick] = useState<number | null>(() => {
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? null : Number(v);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    fig.setAttribute("data-hydrated", "");
  }, [fig]);
  const choose = (i: number) => {
    setPick(i);
    try {
      window.localStorage.setItem(key, String(i));
    } catch {
      /* storage blocked */
    }
    track("dsa_poll", { concept: conceptId, poll: id, pick: i });
  };
  return (
    <div className="dsa-ui flex flex-col gap-2 p-4" role="group" aria-label="Your answer">
      {options.map((o, i) => (
        <button
          key={i}
          type="button"
          aria-pressed={pick === i}
          onClick={() => choose(i)}
          className={`min-h-11 border-2 px-3 py-2 text-left text-[15px] ${pick === i ? "border-signal bg-[var(--c-dsa-hl)] text-fg" : "border-line-strong bg-bg text-fg-2 hover:border-signal"}`}
        >
          {pick === i ? "● " : "○ "}
          {o}
        </button>
      ))}
      <p aria-live="polite" className="m-0 min-h-[1.4em] text-[14px] text-fg-3">
        {pick !== null ? "Noted. Keep your choice in mind: the next beat puts it to the test." : "Pick one. There is no wrong answer here."}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ rebuild the template */

/** Seeded shuffle (the same order on every visit), never the identity. */
function shuffled<T>(xs: T[], seed: number): T[] {
  const a = xs.map((x, i) => ({ x, k: Math.sin(seed * 9301 + i * 49297) }));
  a.sort((p, q) => p.k - q.k);
  const out = a.map((p) => p.x);
  if (out.every((x, i) => x === xs[i]) && out.length > 1) out.push(out.shift() as T);
  return out;
}

export function Reorder({ code, tabsId }: { code: Partial<Record<DsaLang, string>>; tabsId: string }) {
  const [lang] = useLang();
  const use = (code[lang] ? lang : (Object.keys(code)[0] as DsaLang)) || "python";
  // a new language starts a fresh puzzle (keyed)
  return <ReorderLines key={use} source={code[use] || ""} lang={use} seed={tabsId.length} />;
}

function ReorderLines({ source, lang: use, seed }: { source: string; lang: DsaLang; seed: number }) {
  const lines = useMemo(
    () =>
      source
        .split("\n")
        .filter((l) => l.trim() && !/^\s*(#|\/\/)/.test(l))
        .map((l, i) => ({ id: i, text: l })),
    [source],
  );
  const [order, setOrder] = useState(() => shuffled(lines, seed));
  const [checked, setChecked] = useState(false);
  const move = (at: number, by: number) => {
    const to = at + by;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[at], next[to]] = [next[to], next[at]];
    setOrder(next);
    setChecked(false);
  };
  const right = order.filter((l, i) => l.id === i).length;
  const solved = checked && right === order.length;
  if (!lines.length) return null;
  return (
    <div className="dsa-ui flex flex-col gap-3 p-4">
      <p className="m-0 text-[15px] text-fg">
        Rebuild the template ({DSA_LANG_LABEL[use]}): move each line to its place, then check. Comments are left out; indentation is a clue.
      </p>
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {order.map((l, i) => (
          <li key={l.id} className={`flex items-center gap-2 border px-2 py-1 ${checked ? (l.id === i ? "border-ok" : "border-bad") : "border-line"} bg-bg`}>
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-[13px] text-fg">{l.text}</code>
            <span className="sr-only">{checked ? (l.id === i ? "in place" : "out of place") : ""}</span>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move line ${i + 1} up`} className="grid h-9 w-9 place-items-center border border-line-strong text-fg disabled:opacity-30">
              ↑
            </button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move line ${i + 1} down`} className="grid h-9 w-9 place-items-center border border-line-strong text-fg disabled:opacity-30">
              ↓
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setChecked(true)} className="min-h-11 bg-signal px-4 text-[14px] font-semibold text-on-signal">
          Check the order
        </button>
        <button type="button" onClick={() => setOrder(lines)} className="min-h-11 px-2 font-mono text-[12px] text-fg-3 underline">
          show the answer
        </button>
        <span aria-live="polite" className={`text-[14px] ${solved ? "text-ok-text" : "text-fg-2"}`}>
          {checked ? (solved ? "✓ Every line is in place." : `${right} of ${order.length} lines in place.`) : ""}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ review cards */

export function ReviewCards({ cards }: { cards: { front: string; back: string }[] }) {
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  if (!cards.length) return null;
  return (
    <ul className="dsa-ui m-0 grid list-none grid-cols-1 gap-2 p-4 sm:grid-cols-2">
      {cards.map((c, i) => (
        <li key={i}>
          <button
            type="button"
            aria-expanded={!!flipped[i]}
            onClick={() => setFlipped((f) => ({ ...f, [i]: !f[i] }))}
            className={`flex min-h-[120px] w-full flex-col gap-2 border-2 p-4 text-left ${flipped[i] ? "border-signal bg-[var(--c-dsa-hl)]" : "border-line-strong bg-bg"}`}
          >
            <span className="font-mono text-[10px] uppercase tracking-label text-fg-3">{flipped[i] ? "Answer" : `Card ${i + 1} · tap to flip`}</span>
            <span className="text-[14px] leading-relaxed text-fg">{flipped[i] ? c.back : c.front}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ checkpoint gate */

function scoreOf(fig: HTMLElement) {
  const qs = Array.from(fig.querySelectorAll<HTMLElement>("li.sd-quiz-q"));
  return { total: qs.length, answered: qs.filter((q) => q.dataset.state === "right" || q.dataset.state === "wrong").length, right: qs.filter((q) => q.dataset.state === "right").length };
}

/**
 * Watches the checkpoint's quiz figures (made interactive by the course's QuizHydrator) and, once every question is
 * answered with `pass` (80%) right, records the checkpoint quiz (`dsa:cpq:<node>`), which the map reads.
 */
export function CheckpointGate({ fig, checkpoint }: { fig: HTMLElement; checkpoint: ConceptCheckpoint | null }) {
  const { done } = useGame();
  const { award } = useDsaAward();
  const [score, setScore] = useState(() => scoreOf(fig));
  useEffect(() => {
    const mo = new MutationObserver(() => setScore(scoreOf(fig)));
    mo.observe(fig, { subtree: true, attributes: true, attributeFilter: ["data-state"] });
    return () => mo.disconnect();
  }, [fig]);

  const pass = checkpoint?.pass ?? 0.8;
  const key = checkpoint ? dsaKeys.checkpointQuiz(checkpoint.nodeId) : null;
  const passed = !!key && !!done[key];
  const complete = score.total > 0 && score.answered === score.total;
  const ok = complete && score.right / score.total >= pass;
  useEffect(() => {
    if (ok && key && !passed) {
      award([key], "Checkpoint quiz passed");
      track("dsa_gate", { node: checkpoint?.nodeId, right: score.right, of: score.total });
    }
  }, [ok, key, passed, award, checkpoint?.nodeId, score.right, score.total]);

  const need = Math.ceil(pass * score.total);
  return (
    <div className="dsa-ui flex flex-col gap-2 border-t border-line p-4" aria-live="polite">
      <p className="m-0 font-mono text-[12px] uppercase tracking-label text-fg-3">
        {score.answered}/{score.total} answered · {score.right} right · pass mark {need}
      </p>
      {passed || ok ? (
        <p className="m-0 text-[15px] font-semibold text-ok-text">
          ✓ {checkpoint && checkpoint.own === false ? "Quiz passed." : "Checkpoint quiz passed."}
          {checkpoint && checkpoint.own === false
            ? " It is saved with this lesson. The section's checkpoint comes at the end of the section."
            : checkpoint && checkpoint.problems.some((p) => !p.built)
            ? " The section is marked done on the map once the checkpoint's two mixed problems are solved too; they arrive with the next wave."
            : " This section is now marked done on the map."}
        </p>
      ) : complete ? (
        <p className="m-0 text-[15px] text-bad-text">Not yet: {score.right} of {score.total}. Use “Retry” on a block to answer again.</p>
      ) : (
        <p className="m-0 text-[14px] text-fg-2">
          Answer every question. {Math.round(pass * 100)}% or more passes{checkpoint?.own === false ? " and is saved with this lesson." : ", and marks this section done on the Academy map."}
        </p>
      )}
    </div>
  );
}
