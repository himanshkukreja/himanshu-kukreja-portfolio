"use client";

/**
 * /learn/search: one box for the whole course. Keywords or plain English; the results (from
 * /api/search/smart, no AI) come grouped by kind in a few hundred ms, and for a question or a plain-English
 * ask a signed-in learner also gets a short learning path (/api/learn/ai/search) chosen only from those
 * results. The path loads on its own: the results never wait for it, and if it fails they stay as they are.
 *
 * The query lives in the URL (?q=…, &ask=1 for "Ask" on a keyword search), so results can be shared and
 * the back button works.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Bookmark, BookmarkCheck, Clock, Search, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { userFetch } from "@/components/learn/progress/userFetch";
import { aiFetch } from "@/components/learn/ai/aiFetch";
import { setAiCredits, useAiStatus } from "@/components/learn/ai/useAiStatus";
import { AI_FREE_LINE } from "@/components/learn/ai/AiFreeNote";
import { COURSE_SEARCH_EVENT } from "@/components/SearchBar";
import { track } from "@/lib/track";
import { SMART_SEARCH_PUBLIC } from "@/lib/search/smart/flag";
import { isNaturalQuery } from "@/lib/search/smart/text";
import { KIND_LABEL, type Hit, type Kind, type PathStep, type SmartAnswer, type SmartResults } from "@/lib/search/smart/types";
import type { SearchExample } from "@/lib/search/smart/examples";
import { useSavedPaths } from "@/components/learn/saved/useSavedPaths";
import MiniToast, { type MiniToastState } from "@/components/learn/hub/MiniToast";
import KindIcon from "./KindIcon";
import CitedAnswer from "./CitedAnswer";
import ShareAnswerButton from "./ShareAnswerButton";
import ExampleGallery from "./ExampleGallery";
import { useSmartAccess } from "./useSmartAccess";

/** a saved set of results keeps the best of them, in score order */
const SAVE_RESULTS_MAX = 10;

const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(Math.floor(s % 60)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

type Load<T> = { state: "idle" } | { state: "loading" } | { state: "done"; data: T } | { state: "error"; message: string };

/** Marks the searched words (and their longer forms) in a line of text. */
function Marked({ text, words }: { text: string; words: string[] }) {
  const parts = useMemo(() => {
    const ws = words.filter((w) => w.length > 2).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return ws.length ? text.split(new RegExp(`(\\b(?:${ws.join("|")})[a-z]*)`, "ig")) : [text];
  }, [text, words]);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <mark key={i} className="bg-transparent text-fg shadow-[inset_0_-2px_0_var(--c-signal)]">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Tag({ kind, at }: { kind: Kind; at?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-signal-text">
      <KindIcon kind={kind} className="h-3.5 w-3.5" />
      {KIND_LABEL[kind].tag}
      {kind === "moment" && at !== undefined && at >= 0 && (
        <span className="ml-1 inline-flex items-center gap-1 border border-line-strong px-1.5 py-px text-fg">
          <Clock className="h-3 w-3" aria-hidden />
          {clock(at)}
        </span>
      )}
    </span>
  );
}

function PathCard({ step, n }: { step: PathStep; n: number }) {
  return (
    <li className="flex">
      <Link href={step.href} className="group flex w-full gap-3 border border-line-strong bg-surface p-4 hover:border-fg-3 sm:gap-4 sm:p-5">
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center bg-signal font-mono text-sm font-bold text-on-signal sm:h-9 sm:w-9">
          {n}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Tag kind={step.kind} at={step.at} />
          <span className="font-display text-[19px] font-bold leading-[1.15] tracking-[-0.01em] text-fg sm:text-[21px]">{step.title}</span>
          {step.why && <span className="text-[15px] leading-relaxed text-fg-2">{step.why}</span>}
          <span className="truncate font-mono text-[12px] text-fg-3">{step.sub}</span>
        </span>
        <ArrowRight className="mt-1 hidden h-4 w-4 shrink-0 text-fg-3 group-hover:text-fg sm:block" aria-hidden />
      </Link>
    </li>
  );
}

function PathSkeleton() {
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex gap-4 border border-line bg-surface p-5">
          <span className="h-9 w-9 shrink-0 animate-pulse bg-surface-2" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-3 w-24 animate-pulse bg-surface-2" />
            <span className="h-5 w-2/3 animate-pulse bg-surface-2" />
            <span className="h-4 w-full animate-pulse bg-surface-2" />
          </span>
        </li>
      ))}
    </ol>
  );
}

function ResultRow({ h, words }: { h: Hit; words: string[] }) {
  return (
    <li>
      <Link href={h.href} className="flex flex-col gap-1 border-b border-line px-1 py-3.5 hover:bg-surface-2 sm:px-3">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Tag kind={h.kind} at={h.at} />
          <span className="min-w-0 truncate font-mono text-[12px] text-fg-3">{h.sub}</span>
        </span>
        <span className="text-[17px] font-semibold leading-snug text-fg">
          <Marked text={h.title} words={words} />
        </span>
        {h.summary && (
          <span className="line-clamp-2 text-[14px] leading-relaxed text-fg-2">
            {h.kind === "moment" ? "“" : ""}
            <Marked text={h.summary} words={words} />
            {h.kind === "moment" ? "”" : ""}
          </span>
        )}
      </Link>
    </li>
  );
}

/** "Save path" / "Save results": the search's copy in You → Saved paths (same search again: updated, ticks kept). */
function SaveButton({ saved, onSave, label, savedLabel }: { saved: boolean; onSave: () => void; label: string; savedLabel: string }) {
  return saved ? (
    <Link href="/learn/saved" className="inline-flex min-h-10 items-center gap-2 border border-line-strong px-3 text-[14px] text-fg hover:border-fg-3">
      <BookmarkCheck className="h-4 w-4 text-signal-text" aria-hidden />
      {savedLabel}
    </Link>
  ) : (
    <button type="button" onClick={onSave} className="inline-flex min-h-10 items-center gap-2 border border-line-strong px-3 text-[14px] font-semibold text-fg hover:border-fg-3">
      <Bookmark className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}

export default function SmartSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const q = (params.get("q") || "").trim();
  const asked = params.get("ask") === "1";
  // `next dev` only: ?preview=1 opens the page without signing in (screenshots, local tries)
  const dev = process.env.NODE_ENV === "development" && params.get("preview") === "1";
  const realAccess = useSmartAccess();
  const access = dev ? "open" : realAccess;
  const { user } = useAuth();
  const uid = dev ? "dev" : user?.id ?? null;
  const devHeaders: Record<string, string> = dev ? { "x-smart-preview": "1" } : {};
  const { openAuthModal } = useAuthModal();
  const ai = useAiStatus();
  const [draft, setDraft] = useState(q);
  const [results, setResults] = useState<Load<SmartResults>>({ state: "idle" });
  const [answer, setAnswer] = useState<Load<SmartAnswer>>({ state: "idle" });
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [toast, setToast] = useState<MiniToastState>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const saved = useSavedPaths();

  useEffect(() => setDraft(q), [q]);
  useEffect(() => setFilter("all"), [q]);

  const go = useCallback(
    (text: string, ask = false) => {
      const t = text.trim().slice(0, 300);
      if (!t) {
        inputRef.current?.focus();
        return;
      }
      router.push(`/learn/search?q=${encodeURIComponent(t)}${ask ? "&ask=1" : ""}${dev ? "&preview=1" : ""}`, { scroll: false });
    },
    [router, dev],
  );
  const pick = useCallback(
    (x: SearchExample) => {
      track("smart_example", { category: x.category, ai: x.ai });
      go(x.text, x.ai);
    },
    [go],
  );
  const onSaved = (r: ReturnType<typeof saved.save>, what: string) =>
    setToast(
      r.ok
        ? { id: Date.now(), text: r.updated ? `${what} updated` : `${what} saved`, link: { label: "Open", href: `/learn/saved#p-${r.id}` } }
        : { id: Date.now(), text: r.reason === "full" ? `You have ${saved.max} saved. Remove one in You → Saved paths first.` : "Couldn't save that. Try again." },
    );

  // the results: no AI, for everyone with access
  useEffect(() => {
    if (!q || access !== "open") return;
    let off = false;
    setResults({ state: "loading" });
    const url = `/api/search/smart?q=${encodeURIComponent(q)}`;
    const t0 = performance.now();
    (SMART_SEARCH_PUBLIC ? fetch(url) : dev ? fetch(url, { headers: { "x-smart-preview": "1" } }) : userFetch(url))
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.error || "Search didn't load. Try again.");
        return body as SmartResults;
      })
      .then((data) => {
        if (off) return;
        setResults({ state: "done", data });
        track("smart_search", { q_len: q.length, natural: data.natural, results: data.total, ms: Math.round(performance.now() - t0) });
      })
      .catch((e: Error) => !off && setResults({ state: "error", message: e.message }));
    return () => {
      off = true;
    };
  }, [q, access, dev]);

  const natural = isNaturalQuery(q);
  const wantsPath = !!q && (natural || asked);
  const aiOn = dev || !!ai?.features["smart-search"];

  // the learning path: signed-in learners, natural-language asks (or "Ask"), alongside the results
  useEffect(() => {
    if (!wantsPath || access !== "open" || !uid || !aiOn) {
      setAnswer({ state: "idle" });
      return;
    }
    let off = false;
    setAnswer({ state: "loading" });
    aiFetch("/api/learn/ai/search", { method: "POST", body: JSON.stringify({ q }), headers: devHeaders })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (body && "creditsLeft" in body) setAiCredits(body.creditsLeft);
        if (!r.ok) throw new Error(body?.error || "The learning path didn't load.");
        return body as SmartAnswer;
      })
      .then((data) => {
        if (off) return;
        setAnswer({ state: "done", data });
        track("smart_path", { ok: true, steps: data.path.length, scope: data.scope, cached: data.cached });
      })
      .catch((e: Error) => {
        if (off) return;
        setAnswer({ state: "error", message: e.message });
        track("smart_path", { ok: false });
      });
    return () => {
      off = true;
    };
    // devHeaders follows `dev`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, wantsPath, access, uid, aiOn, dev]);

  if (access !== "open") {
    return (
      <main className="mx-auto flex max-w-[960px] flex-col gap-5 px-4 pb-32 pt-10 sm:px-6 sm:pt-16">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">Learn · search</span>
        {access === "checking" ? (
          <p className="text-fg-3">Checking access…</p>
        ) : (
          <>
            <h1 className="m-0 font-display text-[clamp(36px,6vw,64px)] font-extrabold leading-[0.95] tracking-tightest text-fg">Not open yet</h1>
            <p className="max-w-[620px] text-[17px] leading-relaxed text-fg-2">
              This page is being tested. Meanwhile, search every lesson, lecture and question from the search box at the top, or press{" "}
              <kbd className="border border-line-strong px-1.5 font-mono text-[13px]">⌘K</kbd>.
            </p>
            <button type="button" onClick={() => window.dispatchEvent(new Event(COURSE_SEARCH_EVENT))} className="min-h-12 self-start bg-signal px-5 font-semibold text-on-signal">
              Search the course
            </button>
          </>
        )}
      </main>
    );
  }

  const data = results.state === "done" ? results.data : null;
  // mark the query's own words and the first few synonyms (not every expansion: too much underlining)
  const words = data ? [...data.terms, ...data.fixes.map((f) => f.to), ...data.expanded.slice(0, 3).flatMap((e) => e.split(" "))] : [];
  const groups = data ? data.groups.filter((g) => filter === "all" || g.kind === filter) : [];

  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-8 px-4 pb-32 pt-10 sm:px-6 sm:pt-14">
      <header className="flex flex-col gap-5">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">
          Learn · smart search{!SMART_SEARCH_PUBLIC && <span className="ml-2 border border-line-strong px-1.5 py-px text-fg-3">admin preview</span>}
        </span>
        <form
          role="search"
          aria-label="Search the whole course"
          onSubmit={(e) => {
            e.preventDefault();
            go(draft);
          }}
          className="flex flex-col gap-4"
        >
          <label htmlFor="smart-q" className="font-display text-[clamp(36px,6.4vw,76px)] font-extrabold leading-[0.92] tracking-tightest text-fg">
            What do you want to learn<span className="text-signal-text">?</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex min-h-14 flex-1 items-center gap-3 border border-line-strong bg-surface px-4 focus-within:border-fg-3 focus-within:shadow-[inset_0_-2px_0_var(--c-signal)]">
              <Search className="h-5 w-5 shrink-0 text-signal-text" aria-hidden />
              <input
                id="smart-q"
                ref={inputRef}
                type="search"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={300}
                autoFocus={!q}
                enterKeyHint="search"
                placeholder="A topic, or a question in plain English"
                className="min-h-12 min-w-0 flex-1 appearance-none bg-transparent text-[17px] text-fg outline-none placeholder:text-fg-4 sm:text-lg [&::-webkit-search-cancel-button]:hidden"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="min-h-14 flex-1 border border-line-strong bg-bg px-5 font-semibold text-fg hover:border-fg-3 sm:flex-none">
                Search
              </button>
              <button
                type="button"
                onClick={() => go(draft, true)}
                className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 bg-signal px-5 font-semibold text-on-signal sm:flex-none"
                aria-describedby="smart-ask-hint"
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                Ask
              </button>
            </div>
          </div>
          <p id="smart-ask-hint" className="m-0 text-[14px] text-fg-3">
            Search covers lessons and their sections, lecture moments, shorts, side quests, interview problems, LLD rounds, case files, mocks, war stories, concepts, FAQs, labs, drills and design
            sheets. <span className="text-fg-2">Ask</span> also answers in plain words, citing the course, and writes a short learning path you can save{user ? "" : " (sign in free)"}.
          </p>
        </form>
        {!q && (
          <section aria-labelledby="try-h" className="flex flex-col gap-3">
            <h2 id="try-h" className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">
              What you can search
            </h2>
            <ExampleGallery onPick={pick} signedIn={!!uid} />
          </section>
        )}
      </header>

      {q && wantsPath && (
        <section aria-labelledby="path-h" aria-busy={answer.state === "loading"} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="path-h" className="m-0 font-mono text-xs uppercase tracking-label text-fg-3">
              Answer and learning path
            </h2>
            {answer.state === "done" && answer.data.cached && <span className="font-mono text-[11px] text-fg-4">from a recent identical search · no credits used</span>}
          </div>
          {!uid ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-line-strong px-4 py-4">
              <span className="text-[15px] text-fg-2">
                Sign in to get a direct answer and a learning path: an answer in plain words that cites the course, then the right lessons, lecture moments and practice, in order. The results
                below are ready now.
              </span>
              <button type="button" onClick={openAuthModal} className="min-h-11 bg-signal px-4 font-semibold text-on-signal">
                Sign in for an answer
              </button>
            </div>
          ) : !aiOn ? (
            <p className="m-0 border border-dashed border-line-strong px-4 py-3 text-[15px] text-fg-3">{ai ? "Learning paths are resting right now. The results below are complete." : "Checking AI…"}</p>
          ) : answer.state === "loading" ? (
            <>
              <p className="m-0 text-[14px] text-fg-3" role="status">
                Answering from the results below and putting the best of them in order…
              </p>
              <PathSkeleton />
            </>
          ) : answer.state === "error" ? (
            <p className="m-0 border border-dashed border-line-strong px-4 py-3 text-[15px] text-fg-3" role="status">
              {answer.message} The results below are ready.
            </p>
          ) : answer.state === "done" ? (
            <div className="flex flex-col gap-3">
              {answer.data.intent && <p className="m-0 font-display text-[22px] font-bold leading-snug text-fg sm:text-[26px]">{answer.data.intent}</p>}
              {(answer.data.answer?.length ?? 0) > 0 && (
                <div className="border-l-2 border-signal pl-4">
                  <CitedAnswer answer={answer.data.answer} cites={answer.data.cites ?? []} />
                  <ShareAnswerButton question={q} answer={answer.data.answer} cites={answer.data.cites ?? []} />
                </div>
              )}
              {answer.data.note && (
                <p className={`m-0 border-l-2 pl-3 text-[15px] leading-relaxed ${answer.data.scope === "covered" ? "border-line-strong text-fg-2" : "border-signal text-fg"}`}>{answer.data.note}</p>
              )}
              {answer.data.path.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">The path · {answer.data.path.length} steps</span>
                  <SaveButton
                    saved={!!saved.savedFor("path", q)}
                    label="Save path"
                    savedLabel="Saved · open in You"
                    onSave={() => onSaved(saved.save({ source: "path", q, title: answer.data.intent, note: answer.data.scope === "covered" ? "" : answer.data.note, steps: answer.data.path }), "Path")}
                  />
                </div>
              )}
              {answer.data.path.length > 0 && (
                <ol className="m-0 flex list-none flex-col gap-2 p-0">
                  {answer.data.path.map((s, i) => (
                    <PathCard key={s.id} step={s} n={i + 1} />
                  ))}
                </ol>
              )}
              {answer.data.quick && (
                <div className="flex flex-col gap-2 border border-line bg-bg p-4">
                  <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">If you only have 10 minutes</span>
                  <Link href={answer.data.quick.href} className="flex flex-col gap-1 hover:text-fg">
                    <Tag kind={answer.data.quick.kind} at={answer.data.quick.at} />
                    <span className="text-[17px] font-semibold text-fg">{answer.data.quick.title}</span>
                    {answer.data.quick.why && <span className="text-[14px] text-fg-2">{answer.data.quick.why}</span>}
                  </Link>
                </div>
              )}
              <p className="m-0 font-mono text-[11px] text-fg-4">Chosen by AI from the results below; every link is a real course page. {AI_FREE_LINE}</p>
            </div>
          ) : null}
        </section>
      )}

      {q && (
        <section aria-labelledby="results-h" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
            <h2 id="results-h" className="m-0 font-mono text-xs uppercase tracking-label text-fg-3">
              Results
            </h2>
            <span className="font-mono text-[12px] text-fg-3" role="status" aria-live="polite">
              {results.state === "loading" ? "searching…" : data ? `${data.total} across ${data.groups.length} kinds · ${data.ms} ms` : ""}
            </span>
          </div>
          {data && (data.fixes.length > 0 || data.expanded.length > 0) && (
            <p className="m-0 text-[14px] text-fg-3">
              {data.fixes.length > 0 && (
                <>
                  Showing results for <span className="text-fg">{data.fixes.map((f) => f.to).join(", ")}</span> (you typed {data.fixes.map((f) => f.from).join(", ")}).{" "}
                </>
              )}
              {data.expanded.length > 0 && (
                <>
                  Also searched: <span className="text-fg-2">{data.expanded.slice(0, 6).join(", ")}</span>.
                </>
              )}
            </p>
          )}
          {data && data.total > 1 && (
            <div className="flex justify-end">
              <SaveButton
                saved={!!saved.savedFor("results", q)}
                label="Save these results"
                savedLabel="Results saved · open in You"
                onSave={() =>
                  onSaved(
                    saved.save({
                      source: "results",
                      q,
                      title: q,
                      steps: data.groups
                        .flatMap((g) => g.hits)
                        .sort((a, b) => b.score - a.score)
                        .slice(0, SAVE_RESULTS_MAX),
                    }),
                    "Results",
                  )
                }
              />
            </div>
          )}
          {data?.weak && data.total > 0 && <p className="m-0 border-l-2 border-signal pl-3 text-[15px] text-fg-2">Only passing mentions match this. The course may not teach it directly; the closest pages are below.</p>}
          {results.state === "loading" && (
            <ul className="m-0 flex list-none flex-col p-0" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <li key={i} className="flex flex-col gap-2 border-b border-line py-4">
                  <span className="h-3 w-28 animate-pulse bg-surface-2" />
                  <span className="h-5 w-1/2 animate-pulse bg-surface-2" />
                </li>
              ))}
            </ul>
          )}
          {results.state === "error" && <p className="m-0 text-fg-3">{results.message}</p>}
          {data && data.total === 0 && (
            <p className="m-0 text-[15px] text-fg-3">
              Nothing in the course matches <span className="text-fg">“{q}”</span>. Try other words, or a topic like caching, sharding or rate limiting.
            </p>
          )}
          {data && data.groups.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show one kind">
              {[{ kind: "all" as const, n: data.total }, ...data.groups.map((g) => ({ kind: g.kind, n: g.hits.length }))].map((c) => (
                <button
                  key={c.kind}
                  type="button"
                  aria-pressed={filter === c.kind}
                  onClick={() => setFilter(c.kind)}
                  className={`min-h-9 px-2.5 font-mono text-xs ${filter === c.kind ? "bg-fg font-semibold text-bg" : "border border-line-strong text-fg-2 hover:text-fg"}`}
                >
                  {c.kind === "all" ? "all" : KIND_LABEL[c.kind].group.toLowerCase()} {c.n}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
            {groups.map((g) => (
              <section key={g.kind} aria-labelledby={`g-${g.kind}`} className="flex min-w-0 flex-col">
                <h3 id={`g-${g.kind}`} className="m-0 flex items-center gap-2 border-b border-line-strong pb-2 font-mono text-[12px] uppercase tracking-label text-fg">
                  <KindIcon kind={g.kind} className="h-4 w-4 text-signal-text" />
                  {KIND_LABEL[g.kind].group}
                  <span className="text-fg-3">· {g.hits.length}</span>
                </h3>
                <ul className="m-0 list-none p-0">
                  {g.hits.map((h) => (
                    <ResultRow key={h.id} h={h} words={words} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {data && (
            <details className="group border-t border-line pt-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-mono text-xs uppercase tracking-label text-fg-3 hover:text-fg [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
                More things to try
              </summary>
              <div className="pt-3">
                <ExampleGallery onPick={pick} signedIn={!!uid} compact />
              </div>
            </details>
          )}
        </section>
      )}
      <MiniToast toast={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}
