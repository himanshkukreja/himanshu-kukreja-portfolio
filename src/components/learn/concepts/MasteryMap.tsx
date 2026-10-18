"use client";

/**
 * /learn/mastery: every concept of the course as a tile, grouped by the week it is taught in and
 * coloured by how well this learner knows it (src/lib/concepts/mastery.ts). Tapping a tile opens
 * its 2-minute refresher: definition, the key points, the evidence, "go to the lesson" and
 * "practise". Guests: this browser's data; signed in: the account's synced progress, trial attempts
 * and review cards plus this browser's quick checks.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CourseMap } from "@/lib/learn/types";
import { useProgressData } from "@/components/learn/progress/useProgressData";
import { useReviewCards } from "@/lib/learn/useReviewDue";
import { readLocalStore } from "@/components/learn/trial/engine";
import { supabaseClient } from "@/lib/supabase-client";
import { track } from "@/lib/track";
import { assess, conceptMatcher, STATES, type Assessment, type MasteryConcept, type MasteryData, type MasteryInputs, type MasteryState } from "@/lib/concepts/mastery";
import TermsToggle from "./TermsToggle";

type Props = { data: MasteryData; map: CourseMap };

const TILE: Record<MasteryState, string> = {
  "not-started": "border border-dashed border-line-strong bg-transparent text-fg-3 hover:border-fg-3 hover:text-fg-2",
  seen: "border border-line-strong bg-surface text-fg-2 hover:border-fg-3",
  shaky: "border border-bad/70 bg-bad/10 text-fg hover:bg-bad/15",
  solid: "border border-ok/70 bg-ok/10 text-fg hover:bg-ok/15",
  mastered: "border border-signal bg-signal text-on-signal hover:brightness-105",
};
const GLYPH_COLOR: Record<MasteryState, string> = {
  "not-started": "text-fg-4",
  seen: "text-fg-3",
  shaky: "text-bad-text",
  solid: "text-ok",
  mastered: "text-on-signal",
};
const SEGMENT: Record<MasteryState, string> = {
  "not-started": "bg-transparent",
  seen: "bg-fg-4/40",
  shaky: "bg-bad",
  solid: "bg-ok",
  mastered: "bg-signal",
};

function readJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Latest finished trial attempt per part for a signed-in learner, as week → question → label. */
async function remoteTrialAnswers(userId: string, courseId: string): Promise<Record<string, Record<number, string>>> {
  const out: Record<string, Record<number, string>> = {};
  try {
    const { data, error } = await supabaseClient
      .from("trial_attempts")
      .select("week, part, answers, finished_at")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1000);
    if (error || !data) return out;
    const seen = new Set<string>();
    (data as { week: string; part: number; answers: Record<string, string> | null }[]).forEach((r) => {
      const k = `${r.week}|${r.part}`;
      if (seen.has(k)) return;
      seen.add(k);
      const w = (out[r.week] ||= {});
      Object.entries(r.answers || {}).forEach(([q, v]) => {
        if (w[Number(q)] === undefined) w[Number(q)] = String(v);
      });
    });
  } catch {
    // offline or table missing: this browser's attempts still count
  }
  return out;
}

function pct(a: Assessment) {
  return a.score === null ? null : Math.round(a.score * 100);
}

export default function MasteryMap({ data, map }: Props) {
  const d = useProgressData(map);
  const { cards, ready: cardsReady } = useReviewCards();
  const [local, setLocal] = useState<{ quiz: MasteryInputs["quizStores"]; trials: MasteryInputs["trialAnswers"] } | null>(null);
  const [remoteTrials, setRemoteTrials] = useState<{ uid: string; answers: MasteryInputs["trialAnswers"] } | null>(null);
  const [filter, setFilter] = useState<MasteryState | "all">("all");
  const [open, setOpen] = useState<{ id: string; via: string } | null>(null);
  const userId = d.user?.id ?? null;

  // this browser: quick-check stores and trial records (read after mount, like the progress page)
  useEffect(() => {
    const read = () => {
      const quiz: MasteryInputs["quizStores"] = {};
      data.lessons.forEach((lk) => (quiz[lk] = readJSON(`sd:quiz:${data.course}/${lk}`)));
      const trials: MasteryInputs["trialAnswers"] = {};
      data.weeks.forEach((wk) => {
        const store = readLocalStore(data.course, wk);
        const ans: Record<number, string> = {};
        Object.values(store.parts).forEach((p) => Object.entries(p.last?.answers || {}).forEach(([q, v]) => (ans[Number(q)] = String(v))));
        trials[wk] = ans;
      });
      setLocal({ quiz, trials });
    };
    const t = window.setTimeout(read, 0);
    window.addEventListener("storage", read);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("storage", read);
    };
  }, [data]);

  useEffect(() => {
    if (!userId) return;
    let off = false;
    remoteTrialAnswers(userId, data.course).then((answers) => !off && setRemoteTrials({ uid: userId, answers }));
    return () => {
      off = true;
    };
  }, [userId, data.course]);

  const matchers = useMemo(() => new Map(data.concepts.map((c) => [c.id, conceptMatcher(c)])), [data]);
  const ready = d.ready && local !== null && cardsReady;

  const results = useMemo(() => {
    if (!local) return null;
    const trialAnswers: MasteryInputs["trialAnswers"] = { ...local.trials };
    if (remoteTrials && remoteTrials.uid === userId)
      Object.entries(remoteTrials.answers).forEach(([wk, a]) => (trialAnswers[wk] = { ...(trialAnswers[wk] || {}), ...a }));
    const inputs: MasteryInputs = { done: d.done, lessons: d.lessons, quizStores: local.quiz, trialAnswers, cards };
    return new Map(data.concepts.map((c) => [c.id, assess(c, data, inputs, matchers.get(c.id) ?? null)]));
  }, [local, remoteTrials, userId, d.done, d.lessons, cards, data, matchers]);

  const counts = useMemo(() => {
    const out: Record<MasteryState, number> = { "not-started": 0, seen: 0, shaky: 0, solid: 0, mastered: 0 };
    results?.forEach((a) => out[a.state]++);
    return out;
  }, [results]);

  // analytics: once per visit, when the map is computed
  const tracked = useRef(false);
  useEffect(() => {
    if (!ready || !results || tracked.current) return;
    tracked.current = true;
    track("mastery_open", { concepts: data.concepts.length, mastered: counts.mastered, solid: counts.solid, shaky: counts.shaky, seen: counts.seen, signed_in: d.signedIn });
  }, [ready, results, counts, data.concepts.length, d.signedIn]);

  const openConcept = useCallback(
    (id: string, via: string) => {
      setOpen({ id, via });
      const a = results?.get(id);
      track("refresher_open", { concept: id, state: a?.state ?? "unknown", via });
      try {
        window.history.replaceState(null, "", `#c-${id}`);
      } catch {
        // ignore
      }
    },
    [results],
  );

  // /learn/mastery#c-<id> (from a term card's "concept map" link) opens that refresher
  const deepLinked = useRef(false);
  const openRef = useRef(openConcept);
  useEffect(() => {
    openRef.current = openConcept;
  }, [openConcept]);
  useEffect(() => {
    if (!ready || deepLinked.current) return;
    deepLinked.current = true;
    const m = window.location.hash.match(/^#c-([a-z0-9-]+)$/);
    if (!m || !data.concepts.some((c) => c.id === m[1])) return;
    document.getElementById(`c-${m[1]}`)?.scrollIntoView({ block: "center" });
    // after this render: the refresher reads the computed states
    window.setTimeout(() => openRef.current(m[1], "link"), 0);
  }, [ready, data.concepts]);

  const closeConcept = useCallback(() => {
    const id = open?.id;
    setOpen(null);
    try {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch {
      // ignore
    }
    if (id) window.setTimeout(() => document.getElementById(`c-${id}`)?.focus({ preventScroll: true }), 0);
  }, [open]);

  const byGroup = useMemo(() => {
    const g = new Map<string, MasteryConcept[]>();
    data.concepts.forEach((c) => {
      if (!g.has(c.group)) g.set(c.group, []);
      g.get(c.group)!.push(c);
    });
    return g;
  }, [data]);

  const total = data.concepts.length;
  const known = counts.solid + counts.mastered;
  const current = open ? data.concepts.find((c) => c.id === open.id) || null : null;

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-8 px-4 pb-32 pt-8 sm:px-6 sm:pt-12 lg:gap-10 lg:pb-24">
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-label text-fg-3">
          <Link href="/learn/dashboard" className="hover:text-fg">
            ← progress
          </Link>
          <span aria-hidden>/</span>
          <span className="text-signal-text">concept map</span>
        </div>
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-[34px] font-extrabold leading-[0.95] tracking-[-0.04em] text-fg sm:text-[52px]">What you know, concept by concept</h1>
          <p className="max-w-[62ch] text-[15px] leading-relaxed text-fg-2">
            {total} concepts from the course, coloured by your quick checks, trial answers and review cards. Tap a shaky one for a two-minute refresher.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-6" aria-live="polite">
          <div className="col-span-2 flex flex-col gap-1 bg-bg p-4 sm:col-span-1 lg:col-span-1">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">known</span>
            <span className="font-display text-[34px] font-extrabold leading-none tracking-[-0.04em] text-fg">
              {ready ? known : "·"}
              <span className="ml-1 font-mono text-[13px] font-normal tracking-normal text-fg-3">/ {total}</span>
            </span>
            <span className="text-[12px] text-fg-3">solid or mastered</span>
          </div>
          {[...STATES].reverse().map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setFilter((f) => (f === s.id ? "all" : s.id))}
              aria-pressed={filter === s.id}
              title={s.hint}
              className={`flex min-h-[84px] flex-col items-start gap-1 p-4 text-left ${filter === s.id ? "bg-surface-2 shadow-[inset_0_-2px_0_var(--c-signal)]" : "bg-bg hover:bg-surface"}`}
            >
              <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-fg-3">
                <span aria-hidden className={`grid h-4 w-4 place-items-center text-[11px] ${s.id === "mastered" ? "bg-signal text-on-signal" : GLYPH_COLOR[s.id]}`}>
                  {s.glyph}
                </span>
                {s.label}
              </span>
              <span className="font-display text-[28px] font-extrabold leading-none tracking-[-0.04em] text-fg">{ready ? counts[s.id] : "·"}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <details className="group max-w-[70ch] text-[13px] leading-relaxed text-fg-3">
            <summary className="inline-flex min-h-10 cursor-pointer items-center font-mono text-[12px] text-fg-2 hover:text-fg">how is this worked out? ›</summary>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
              <li>Quick checks in the stage where a concept is taught (first tries), weighted towards questions that mention it.</li>
              <li>Trial questions that mention it, from your last attempt at each part.</li>
              <li>Review cards that mention it, by Leitner box; an &ldquo;Again&rdquo; counts as missed.</li>
              <li>Seen = you finished the stage it&apos;s taught in. Shaky = under 60% right. Mastered = 85%+ across three or more checks from two kinds of practice.</li>
              <li>{d.signedIn ? "Your account's progress, trial attempts and review cards, plus this browser's quick checks." : "Everything comes from this browser. Sign in to carry it across devices."}</li>
            </ul>
          </details>
          <div className="w-full lg:w-[360px]">
            <TermsToggle />
          </div>
        </div>
      </header>

      {filter !== "all" && (
        <div className="-mt-4 flex items-center gap-3 font-mono text-[12px] text-fg-3">
          showing {STATES.find((s) => s.id === filter)?.label.toLowerCase()} only
          <button type="button" onClick={() => setFilter("all")} className="min-h-10 text-signal-text hover:underline">
            show all
          </button>
        </div>
      )}

      <div className="flex flex-col gap-9">
        {data.groups.map((g) => {
          const list = byGroup.get(g.key) || [];
          const shown = list.filter((c) => filter === "all" || results?.get(c.id)?.state === filter);
          if (!shown.length) return null;
          const seg = STATES.map((s) => [s.id, list.filter((c) => results?.get(c.id)?.state === s.id).length] as const);
          return (
            <section key={g.key} aria-labelledby={`g-${g.key}`} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-line pb-2">
                <h2 id={`g-${g.key}`} className="flex items-baseline gap-2.5">
                  <span className="font-mono text-[12px] text-signal-text">{g.code}</span>
                  <span className="font-display text-[20px] font-bold tracking-[-0.02em] text-fg sm:text-[24px]">{g.title}</span>
                </h2>
                <span className="flex items-center gap-3 font-mono text-[11px] text-fg-3">
                  <span aria-hidden className="flex h-1.5 w-28 overflow-hidden border border-line bg-bg">
                    {ready &&
                      [...seg].reverse().map(([id, n]) => (n ? <span key={id} className={`h-full ${SEGMENT[id]}`} style={{ width: `${(n / list.length) * 100}%` }} /> : null))}
                  </span>
                  {ready ? `${seg.find(([id]) => id === "mastered")![1] + seg.find(([id]) => id === "solid")![1]}/${list.length} known` : `${list.length} concepts`}
                </span>
              </div>
              <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {shown.map((c) => {
                  const a = results?.get(c.id);
                  const state: MasteryState = ready && a ? a.state : "not-started";
                  const meta = STATES.find((s) => s.id === state)!;
                  const p = a ? pct(a) : null;
                  return (
                    <li key={c.id} className="min-w-0">
                      <button
                        id={`c-${c.id}`}
                        type="button"
                        onClick={() => openConcept(c.id, "tile")}
                        aria-label={`${c.term}: ${ready ? meta.label : "loading"}${p !== null && ready ? `, ${p}% right` : ""}. Open the refresher.`}
                        className={`flex h-full min-h-[64px] w-full flex-col justify-between gap-1.5 px-3 py-2.5 text-left transition-colors ${ready ? TILE[state] : "border border-line bg-surface text-fg-3"} ${open?.id === c.id ? "outline outline-2 outline-offset-2 outline-signal" : ""}`}
                      >
                        <span className="line-clamp-2 text-[13.5px] font-semibold leading-snug">{c.term}</span>
                        <span className="flex items-center justify-between gap-2 font-mono text-[10.5px] uppercase tracking-[0.06em]">
                          <span className={`flex items-center gap-1 ${state === "mastered" ? "text-on-signal" : "opacity-80"}`}>
                            <span aria-hidden className={GLYPH_COLOR[state]}>
                              {meta.glyph}
                            </span>
                            {ready ? meta.label : "…"}
                          </span>
                          {ready && p !== null && <span className={state === "mastered" ? "text-on-signal" : "text-fg-3"}>{p}%</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {current && results && <Refresher concept={current} a={results.get(current.id)!} data={data} onClose={closeConcept} onOpen={(id) => openConcept(id, "related")} />}
    </main>
  );
}

/* ------------------------------------------------------------------ refresher dialog */

function Refresher({ concept: c, a, data, onClose, onOpen }: { concept: MasteryConcept; a: Assessment; data: MasteryData; onClose: () => void; onOpen: (id: string) => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !boxRef.current) return;
      // keep focus inside the dialog
      const f = Array.from(boxRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, c.id]);

  const meta = STATES.find((s) => s.id === a.state)!;
  const related = c.related.map((id) => data.concepts.find((x) => x.id === id)).filter((x): x is MasteryConcept => !!x);
  const evidence: string[] = [];
  if (a.quiz.total) evidence.push(`Quick checks: ${a.quiz.right} of ${a.quiz.total} right first time`);
  if (a.trial.total) evidence.push(`Trial: ${a.trial.right} of ${a.trial.total} right`);
  if (a.review.cards) evidence.push(`Review: ${a.review.cards} card${a.review.cards > 1 ? "s" : ""}${a.review.avgBox !== null ? `, box ${a.review.avgBox}` : ""}${a.review.again ? `, ${a.review.again} marked again` : ""}`);
  if (!evidence.length) evidence.push(a.seen ? "Read, but not tested yet." : "Not read or tested yet.");
  const practise = c.practice.quiz || c.practice.trial || "/learn/review";
  const practiseLabel = c.practice.quiz ? "Practise · quick check" : c.practice.trial ? "Practise · trial questions" : "Practise · review queue";

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rf-title"
        aria-describedby="rf-def"
        className="flex max-h-[88vh] w-full max-w-[560px] animate-hk-in flex-col overflow-hidden border border-line-strong bg-surface pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
            <span className="text-signal-text">2-minute refresher</span> · {c.code}
          </span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close refresher" className="-mr-2 grid h-10 w-10 place-items-center font-mono text-fg-3 hover:text-fg">
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 id="rf-title" className="font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg">
              {c.term}
            </h2>
            <span className={`inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.06em] ${TILE[a.state]}`}>
              <span aria-hidden className={GLYPH_COLOR[a.state]}>
                {meta.glyph}
              </span>
              {meta.label}
              {a.score !== null && ` · ${Math.round(a.score * 100)}%`}
            </span>
          </div>
          <p id="rf-def" className="border-l-2 border-signal pl-3 text-[15.5px] leading-relaxed text-fg">
            {c.def}
          </p>
          <ul className="flex flex-col gap-2.5">
            {c.refresher.map((r, i) => (
              <li key={i} className="flex gap-3 text-[14.5px] leading-relaxed text-fg-2">
                <span aria-hidden className="mt-[3px] font-mono text-[11px] text-signal-text">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1 border border-line bg-bg px-3 py-2.5">
            <span className="font-mono text-[10px] uppercase tracking-label text-fg-4">your evidence</span>
            {evidence.map((e) => (
              <span key={e} className="text-[13px] text-fg-2">
                {e}
              </span>
            ))}
          </div>
          {related.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 font-mono text-[10px] uppercase tracking-label text-fg-4">related</span>
              {related.map((r) => (
                <button key={r.id} type="button" onClick={() => onOpen(r.id)} className="inline-flex min-h-9 items-center border border-line px-2.5 text-[12.5px] text-fg-2 hover:border-fg-3 hover:text-fg">
                  {r.term}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-px border-t border-line bg-line sm:grid-cols-2">
          <Link href={c.href} className="flex min-h-[52px] flex-col justify-center bg-surface px-5 py-2 hover:bg-surface-2">
            <span className="text-sm font-semibold text-fg">Go to the lesson →</span>
            <span className="truncate font-mono text-[11px] text-fg-3">
              {c.code}
              {c.title ? ` · ${c.title}` : ""}
            </span>
          </Link>
          <Link href={practise} className="flex min-h-[52px] flex-col justify-center bg-signal px-5 py-2 text-on-signal hover:brightness-105">
            <span className="text-sm font-semibold">{practiseLabel} →</span>
            <span className="font-mono text-[11px] opacity-80">{c.practice.quiz ? "jumps to the question" : c.practice.trial ? "opens the trial part" : "today's due cards"}</span>
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}
