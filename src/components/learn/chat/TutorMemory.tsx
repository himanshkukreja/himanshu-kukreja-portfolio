"use client";

/**
 * You → Tutor memory (v2, 12 Nov 2026; AI audit O14): what the AI knows about your learning, where each item came from,
 * and every control over it.
 *
 *   What the AI knows   the shared memory's notes (goals, level, how you like answers; then System Design Mastery's and
 *                       DSA Mastery's own: studied, found hard, recent practice, mistakes, session notes), each with its
 *                       provenance (course chat, DSA chat or tutor, edited by you) and date, a pencil to rewrite it and a
 *                       × to forget it; plus what the features take from your graded results (explain-back, mock, lab…),
 *                       forgotten by deleting the results behind it
 *   Graded results      the outcome log (learner_events): kind, what, verdict or level, date; × per row, delete all
 *   Which features      a short list of what reads memory
 *   Clear all           memory notes and/or graded results; the on/off switch stays at the top
 * The learner's own rows only (/api/learn/ai/chat/memory, /api/learn/ai/outcomes; verified session).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Brain, Check, Pencil, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { userFetch } from "@/components/learn/progress/userFetch";
import { track } from "@/lib/track";
import { DSA_TAG, isEmptyMemory, srcKey, untag, type ChatMemory, type MemoryField } from "@/lib/ai/chat/memory-model";
import { outcomeKindLabel, outcomeWords, SRC_LABEL, type KnownItem, type KnownSrc, type ViewRow } from "@/lib/learner/memory-view-model";
import { DSA_FULL } from "@/lib/dsa/flags";
import { dsaClientSignals } from "@/lib/dsa/ai/client-signals";
import WatchHowItWorks from "@/components/learn/guide/videos/WatchHowItWorks";

type State = { available: boolean; paused: boolean; memory: ChatMemory };
type Outcomes = { available: boolean; rows: ViewRow[]; known: KnownItem[] };
type DsaView = { available: boolean; paused: boolean; brief: string[] };

const day = (v: string | number) => {
  const d = typeof v === "number" ? new Date(v) : new Date(`${v}T12:00:00Z`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
};

/** One note or derived item: its words, where it came from and when, and its controls. */
type Item = {
  key: string;
  text: string;
  src: KnownSrc;
  /** "12 Nov"; "by 8 Nov" for a note from before provenance was kept */
  when: string;
  /** a memory note (editable) or results-derived (forget deletes the rows) */
  note?: { field: MemoryField; stored: string };
  ids?: number[];
};

function ItemRow({ it, busy, onRemove, onEdit }: { it: Item; busy: boolean; onRemove: (it: Item) => void; onEdit: (it: Item, text: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(it.text);
  const save = async () => {
    if (draft.trim() === it.text) return setEditing(false);
    if (await onEdit(it, draft)) setEditing(false);
  };
  return (
    <li className="flex items-start gap-2 border-b border-line py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={it.note?.field === "sessions" ? 280 : 180}
              aria-label="Edit this note"
              autoFocus
              className="min-h-10 min-w-0 flex-1 border border-line-strong bg-bg px-2.5 text-[15px] text-fg outline-none focus:border-signal"
            />
            <button type="submit" disabled={busy || !draft.trim()} className="inline-flex min-h-10 items-center gap-1.5 bg-signal px-3 font-mono text-[12px] font-semibold text-on-signal disabled:opacity-50">
              <Check className="h-3.5 w-3.5" aria-hidden /> Save
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(it.text);
                setEditing(false);
              }}
              className="min-h-10 border border-line-strong px-3 font-mono text-[12px] text-fg-2"
            >
              Cancel
            </button>
          </form>
        ) : (
          <span className="block text-[15px] leading-snug text-fg-2">{it.text}</span>
        )}
        <span className="mt-0.5 block font-mono text-[11px] text-fg-4">
          {it.note ? SRC_LABEL[it.src] : `from your ${SRC_LABEL[it.src]} results`}
          {it.when ? ` · ${it.when}` : ""}
        </span>
      </div>
      {!editing && (
        <div className="flex shrink-0 items-center">
          {it.note && (
            <button type="button" disabled={busy} onClick={() => setEditing(true)} aria-label={`Edit "${it.text}"`} title="Edit" className="inline-flex h-9 w-9 items-center justify-center text-fg-4 hover:text-fg">
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => onRemove(it)} aria-label={`Forget "${it.text}"`} title={it.note ? "Forget this" : "Forget this (deletes the results behind it)"} className="inline-flex h-9 w-9 items-center justify-center text-fg-4 hover:text-bad-text">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </li>
  );
}

function Group({ label, items, ...rest }: { label: string; items: Item[]; busy: boolean; onRemove: (it: Item) => void; onEdit: (it: Item, text: string) => Promise<boolean> }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{label}</span>
      <ul className="m-0 flex list-none flex-col p-0">
        {items.map((it) => (
          <ItemRow key={it.key} it={it} {...rest} />
        ))}
      </ul>
    </div>
  );
}

const FEATURES_USING: [string, string][] = [
  ["Course chat", "all of it, to pick up where you left off"],
  ["DSA Mastery chat and problem tutor", "your level, how you like answers and the DSA notes"],
  ["Ask this lesson, Explain a snip", "your level, how you like answers, what you found hard"],
  ["Lab hints and reviews, explain-it-back", "your earlier tries at the same lab or concept"],
  ["Mock and LLD mock interviewers and scorecards", "your goal and how earlier rounds went"],
  ["Design and canvas reviews", "your level and what you found hard"],
];

export default function TutorMemory() {
  const { user, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [s, setS] = useState<State | null>(null);
  const [o, setO] = useState<Outcomes | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | "all" | "results">(null);
  const [clearWhat, setClearWhat] = useState({ memory: true, results: true });
  const [showAll, setShowAll] = useState(false);
  const [dsa, setDsa] = useState<DsaView | null>(null);

  const loadOutcomes = useCallback(() => {
    userFetch("/api/learn/ai/outcomes")
      .then(async (r) => (r.ok ? setO((await r.json()) as Outcomes) : setO({ available: false, rows: [], known: [] })))
      .catch(() => setO({ available: false, rows: [], known: [] }));
  }, []);
  const load = useCallback(() => {
    userFetch("/api/learn/ai/chat/memory")
      .then(async (r) => {
        if (!r.ok) throw new Error("Couldn't load what the tutor remembers.");
        setS((await r.json()) as State);
      })
      .catch((e: Error) => setErr(e.message));
    loadOutcomes();
    // what DSA Mastery's tutors read about you right now (your record and this device's choices); quiet when it fails
    if (DSA_FULL) {
      const c = dsaClientSignals();
      const q = new URLSearchParams({ ...(c.lang ? { lang: c.lang } : {}), ...(c.full ? { full: "1" } : {}), ...(c.exp ? { exp: c.exp } : {}) });
      userFetch(`/api/learn/ai/dsa/memory?${q}`)
        .then(async (r) => (r.ok ? setDsa((await r.json()) as DsaView) : null))
        .catch(() => {});
    }
  }, [loadOutcomes]);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const flash = (t: string) => {
    setNote(t);
    window.setTimeout(() => setNote(""), 2500);
  };

  const memCall = async (body: unknown, method = "PATCH") => {
    setBusy(true);
    const r = await userFetch("/api/learn/ai/chat/memory", { method, ...(body ? { body: JSON.stringify(body) } : {}) }).catch(() => null);
    setBusy(false);
    return r;
  };
  const forgetRows = async (body: { ids: number[] } | { all: true }) => {
    setBusy(true);
    const r = await userFetch("/api/learn/ai/outcomes", { method: "DELETE", body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    return r?.ok ?? false;
  };

  const remove = async (it: Item) => {
    if (it.note) {
      const r = await memCall({ remove: { field: it.note.field, item: it.note.stored } });
      if (r?.ok) {
        track("chat_memory", { action: "remove", field: it.note.field, course: it.note.stored.startsWith(DSA_TAG) ? "dsa" : "sdm" });
        flash("Forgotten.");
        load();
      } else setErr("Couldn't forget that just now. Try again.");
    } else if (it.ids?.length) {
      if (await forgetRows({ ids: it.ids })) {
        track("chat_memory", { action: "remove_result", src: it.src, n: it.ids.length });
        flash(`Forgotten (${it.ids.length} result${it.ids.length === 1 ? "" : "s"} deleted).`);
        loadOutcomes();
      } else setErr("Couldn't forget that just now. Try again.");
    }
  };
  const edit = async (it: Item, text: string): Promise<boolean> => {
    if (!it.note) return false;
    const r = await memCall({ edit: { field: it.note.field, item: it.note.stored, text } });
    if (r?.ok) {
      track("chat_memory", { action: "edit", field: it.note.field });
      flash("Saved.");
      load();
      return true;
    }
    const b = (await r?.json().catch(() => null)) as { error?: string } | null;
    setNote(b?.error || "Couldn't save that just now. Try again.");
    return false;
  };
  const removeRow = async (id: number) => {
    if (await forgetRows({ ids: [id] })) {
      track("chat_memory", { action: "remove_result", src: "row", n: 1 });
      flash("Result deleted.");
      loadOutcomes();
    } else setErr("Couldn't delete that just now. Try again.");
  };
  const clearAll = async () => {
    const what = confirm === "results" ? { memory: false, results: true } : clearWhat;
    let ok = true;
    if (what.memory) ok = !!(await memCall(null, "DELETE"))?.ok && ok;
    if (what.results) ok = (await forgetRows({ all: true })) && ok;
    setConfirm(null);
    if (ok) {
      track("chat_memory", { action: "clear", memory: what.memory, results: what.results });
      flash("Cleared.");
      load();
    } else setErr("Couldn't clear it just now. Try again.");
  };
  const toggle = async (paused: boolean) => {
    const r = await memCall({ paused });
    if (r?.ok) {
      track("chat_memory", { action: paused ? "off" : "on" });
      load();
    } else setErr("Couldn't change it just now. Try again.");
  };

  const m = s?.memory;
  const v = useMemo(() => {
    if (!m) return null;
    const legacy = m.updatedAt ? `by ${day(m.updatedAt)}` : "";
    const noteItem = (field: MemoryField, stored: string): Item => {
      const p = m.src?.[srcKey(field as Exclude<MemoryField, "sessions">, stored)];
      const src: KnownSrc = p ? p.by : stored.startsWith(DSA_TAG) || field === "mistakes" ? "dsa" : "chat";
      return { key: `${field}|${stored}`, text: untag(stored), src, when: p ? day(p.at) : legacy, note: { field, stored } };
    };
    const notes = (field: Exclude<MemoryField, "level" | "sessions">, dsaOnes: boolean) => m[field].filter((x) => x.startsWith(DSA_TAG) === dsaOnes).map((x) => noteItem(field, x));
    const sessions = (dsaOnes: boolean) =>
      m.sessions.filter((x) => (x.course === "dsa") === dsaOnes).map((x): Item => ({ key: `s|${x.chat}|${x.summary}`, text: x.summary, src: dsaOnes ? "dsa" : "chat", when: day(x.at), note: { field: "sessions", stored: x.summary } }));
    const known = (course: "sdm" | "dsa") => (o?.known ?? []).filter((k) => k.course === course).map((k): Item => ({ key: k.key, text: k.text, src: k.src, when: day(k.at), ids: k.ids }));
    return {
      shared: { goals: m.goals.map((x) => noteItem("goals", x)), level: m.level ? [noteItem("level", m.level)] : [], prefs: m.prefs.map((x) => noteItem("prefs", x)) },
      sdm: { studied: notes("studied", false), hard: [...notes("struggles", false), ...known("sdm")], quiz: m.quiz.map((x) => noteItem("quiz", x)), sessions: sessions(false) },
      dsa: { studied: notes("studied", true), hard: [...notes("struggles", true), ...known("dsa")], mistakes: m.mistakes.map((x) => noteItem("mistakes", x)), sessions: sessions(true) },
    };
  }, [m, o]);
  const anyDsa = !!v && v.dsa.studied.length + v.dsa.hard.length + v.dsa.mistakes.length + v.dsa.sessions.length > 0;
  const anySdm = !!v && v.sdm.studied.length + v.sdm.hard.length + v.sdm.quiz.length + v.sdm.sessions.length > 0;
  const anyShared = !!v && v.shared.goals.length + v.shared.level.length + v.shared.prefs.length > 0;
  const rows = o?.rows ?? [];
  const shownRows = showAll ? rows : rows.slice(0, 25);
  const g = { busy, onRemove: remove, onEdit: edit };

  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-7 px-4 pb-32 pt-10 sm:px-6">
      <section aria-labelledby="tm-title" className="flex flex-col gap-3.5">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">❯ tutor memory</span>
        <h1 id="tm-title" className="m-0 font-display text-[clamp(40px,6.5vw,80px)] font-extrabold leading-[0.92] tracking-tightest text-fg">
          What the AI knows<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 max-w-[660px] text-[17px] leading-relaxed text-fg-2">
          So the{" "}
          <Link href="/chat" className="underline decoration-line-strong underline-offset-2 hover:text-fg">
            course tutor
          </Link>{" "}
          and the other AI features can pick up where you left off, they keep short learning notes and your graded results. Here is all of it, where each item came from, and the controls: edit or forget any item,
          clear everything, or switch memory off.
        </p>
        <WatchHowItWorks id="ai-tutor" chapter="It remembers you" guide="ai-chat" />
      </section>

      {loading ? null : !user ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-line-strong px-4 py-4">
          <span className="text-[15px] text-fg-2">The tutor and its memory are for signed-in learners.</span>
          <button type="button" onClick={openAuthModal} className="min-h-11 bg-signal px-4 font-semibold text-on-signal">
            Sign in free
          </button>
        </div>
      ) : err ? (
        <p className="m-0 text-fg-3" role="status">
          {err}
        </p>
      ) : !s ? (
        <p className="m-0 font-mono text-[13px] text-fg-3">loading…</p>
      ) : !s.available ? (
        <p className="m-0 border border-dashed border-line-strong px-4 py-4 text-[15px] text-fg-2">Memory isn&apos;t switched on for the course yet. The tutor still knows your progress and the page you are on in every chat.</p>
      ) : (
        <>
          <section aria-label="Memory switch" className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface px-4 py-3.5">
            <span className="flex items-center gap-2.5 text-[15px] text-fg">
              <Brain className="h-4 w-4 shrink-0 text-signal-text" aria-hidden />
              {s.paused ? "Memory is off: no notes are kept and no results are recorded." : "Memory is on: the tutors keep notes, and the AI features see a few lines from them and your graded results."}
            </span>
            <button type="button" disabled={busy} onClick={() => toggle(!s.paused)} className={`min-h-10 px-3.5 font-mono text-[12.5px] ${s.paused ? "bg-signal font-semibold text-on-signal" : "border border-line-strong text-fg-2 hover:text-fg"}`}>
              {s.paused ? "Turn memory on" : "Turn memory off (and forget)"}
            </button>
          </section>

          <p role="status" aria-live="polite" className={`m-0 -my-4 h-4 font-mono text-[12px] text-signal-text ${note ? "" : "invisible"}`}>
            {note}
          </p>

          <section aria-labelledby="tm-knows" className="flex flex-col gap-5 border border-line-strong bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="tm-knows" className="m-0 font-display text-[22px] font-bold text-fg">
                What it knows
              </h2>
              {m && m.updatedAt > 0 && <span className="font-mono text-[11px] text-fg-4">notes updated {day(m.updatedAt)}</span>}
            </div>
            {!v || (!anyShared && !anySdm && !anyDsa) ? (
              <p className="m-0 text-[15px] text-fg-3">{s.paused ? "Nothing: memory is off." : "Nothing yet. Chat with the tutor for a few messages, or grade an answer, and its notes show up here."}</p>
            ) : (
              <>
                {anyShared && (
                  <div className="flex flex-col gap-4">
                    <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">about you · both courses</span>
                    <Group label="goals" items={v.shared.goals} {...g} />
                    <Group label="level" items={v.shared.level} {...g} />
                    <Group label="how you like answers" items={v.shared.prefs} {...g} />
                  </div>
                )}
                {anySdm && (
                  <div className="flex flex-col gap-4 border-t border-line pt-4">
                    <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">system design mastery</span>
                    <Group label="found hard" items={v.sdm.hard} {...g} />
                    <Group label="studied" items={v.sdm.studied} {...g} />
                    <Group label="recent practice" items={v.sdm.quiz} {...g} />
                    <Group label="session notes" items={v.sdm.sessions} {...g} />
                  </div>
                )}
                {anyDsa && (
                  <div id="dsa" className="flex flex-col gap-4 border-t border-line pt-4">
                    <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">dsa mastery</span>
                    <Group label="found hard" items={v.dsa.hard} {...g} />
                    <Group label="mistakes to watch for" items={v.dsa.mistakes} {...g} />
                    <Group label="studied" items={v.dsa.studied} {...g} />
                    <Group label="session notes" items={v.dsa.sessions} {...g} />
                  </div>
                )}
              </>
            )}
          </section>

          {dsa?.available && !dsa.paused && dsa.brief.length > 0 && (
            <section aria-label="What DSA Mastery's tutors read" className="flex flex-col gap-2 border border-line bg-surface px-4 py-3.5">
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">what dsa mastery&apos;s tutors read with each message</span>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[14px] text-fg-2">
                {dsa.brief.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="tm-results" className="flex flex-col gap-3 border border-line-strong bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="tm-results" className="m-0 font-display text-[22px] font-bold text-fg">
                Graded results <span className="font-mono text-[13px] font-normal text-fg-4">{rows.length}</span>
              </h2>
              {rows.length > 0 &&
                (confirm === "results" ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] text-fg-2">Delete all {rows.length}?</span>
                    <button type="button" disabled={busy} onClick={clearAll} className="min-h-9 bg-bad px-3 font-mono text-[12px] font-semibold text-on-bad">
                      Yes, delete
                    </button>
                    <button type="button" onClick={() => setConfirm(null)} className="min-h-9 border border-line-strong px-3 font-mono text-[12px] text-fg-2">
                      Keep
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirm("results")} className="min-h-9 font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-bad-text">
                    delete all my results
                  </button>
                ))}
            </div>
            <p className="m-0 text-[13.5px] text-fg-3">Verdicts and levels the AI graders gave (explain-backs, mock scorecards, lab hints and reviews, war rooms, papers, chat quizzes): never your answers or code.</p>
            {!o ? (
              <p className="m-0 font-mono text-[13px] text-fg-3">loading…</p>
            ) : !rows.length ? (
              <p className="m-0 text-[14px] text-fg-3">None recorded.</p>
            ) : (
              <>
                <ul aria-label="Graded results" className="m-0 flex list-none flex-col p-0">
                  {shownRows.map((r) => (
                    <li key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-x-2 border-b border-line py-2 last:border-b-0 sm:grid-cols-[64px_120px_1fr_auto]">
                      <span className="order-3 col-span-2 font-mono text-[11px] text-fg-4 sm:order-none sm:col-span-1 sm:text-[12px]">
                        {day(r.at)}
                        <span className="sm:hidden"> · {outcomeKindLabel(r.kind)}</span>
                        {r.course === "dsa" ? " · DSA" : ""}
                      </span>
                      <span className="hidden font-mono text-[12px] text-fg-3 sm:block">{outcomeKindLabel(r.kind)}</span>
                      <span className="min-w-0 text-[14.5px] text-fg-2">
                        {r.name}
                        {r.part ? <span className="text-fg-3"> · {r.part}</span> : null}
                        {r.outcome ? <span className="ml-1.5 whitespace-nowrap border border-line-strong px-1.5 py-px font-mono text-[11.5px] text-fg">{outcomeWords(r.outcome)}</span> : null}
                      </span>
                      <button type="button" disabled={busy} onClick={() => removeRow(r.id)} aria-label={`Delete this result: ${outcomeKindLabel(r.kind)}, ${r.name}${r.part ? `, ${r.part}` : ""}, ${outcomeWords(r.outcome)}`} title="Delete this result" className="inline-flex h-9 w-9 items-center justify-center justify-self-end text-fg-4 hover:text-bad-text">
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
                {rows.length > shownRows.length && (
                  <button type="button" onClick={() => setShowAll(true)} className="self-start font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
                    show all {rows.length}
                  </button>
                )}
              </>
            )}
          </section>

          <section aria-labelledby="tm-uses" className="flex flex-col gap-2">
            <h2 id="tm-uses" className="m-0 font-mono text-[11px] font-normal uppercase tracking-label text-fg-3">
              which features use memory
            </h2>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px] text-fg-2">
              {FEATURES_USING.map(([f, what]) => (
                <li key={f}>
                  <span className="text-fg">{f}</span>
                  <span className="text-fg-3"> · {what}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Clear all" className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            {confirm === "all" ? (
              <>
                <span className="text-[14px] text-fg-2">Clear, for good:</span>
                <label className="inline-flex min-h-10 items-center gap-2 text-[14px] text-fg-2">
                  <input type="checkbox" checked={clearWhat.memory} onChange={(e) => setClearWhat((c) => ({ ...c, memory: e.target.checked }))} className="h-4 w-4" />
                  memory notes
                </label>
                <label className="inline-flex min-h-10 items-center gap-2 text-[14px] text-fg-2">
                  <input type="checkbox" checked={clearWhat.results} onChange={(e) => setClearWhat((c) => ({ ...c, results: e.target.checked }))} className="h-4 w-4" />
                  graded results ({rows.length})
                </label>
                <button type="button" disabled={busy || (!clearWhat.memory && !clearWhat.results)} onClick={clearAll} className="min-h-10 bg-bad px-3.5 font-mono text-[12.5px] font-semibold text-on-bad disabled:opacity-50">
                  Yes, clear
                </button>
                <button type="button" onClick={() => setConfirm(null)} className="min-h-10 border border-line-strong px-3.5 font-mono text-[12.5px] text-fg-2">
                  Keep it
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirm("all")} className="inline-flex min-h-10 items-center gap-2 border border-line-strong px-3.5 font-mono text-[12.5px] text-fg-2 hover:border-bad hover:text-bad-text">
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear all…
              </button>
            )}
          </section>

          <details className="group text-[11.5px] leading-snug text-fg-4">
            <summary className="cursor-pointer list-none py-1.5 font-mono text-[11px] hover:text-fg-3 [&::-webkit-details-marker]:hidden [@media(pointer:coarse)]:py-3">
              learning notes only · yours alone · <span className="underline decoration-line-strong underline-offset-2 group-open:text-fg-3">how memory is kept</span>
            </summary>
            <p className="m-0 mt-1.5 max-w-[70ch]">
              A small AI model (Anthropic&apos;s Claude) writes the notes from your chats; the graders record only verdicts and levels. No contact details, no links, never your answers or code. Kept with your
              account, read only by you and the site, deleted with the account. Your chat messages themselves are kept 90 days, then deleted. Your progress (lessons, trials, solves) is used either way.
            </p>
          </details>
        </>
      )}
    </main>
  );
}
