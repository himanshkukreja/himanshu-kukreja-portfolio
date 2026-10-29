"use client";

/**
 * You → Saved paths (/learn/saved): learning paths and sets of results saved from smart search (or the
 * course chat), each a checklist to follow from any tab or device. A step that is a whole lesson or side
 * quest is also done once the lesson is completed in normal progress. A path whose steps have dates (scheduled
 * by the course chat's study plan) shows them and downloads as a calendar (.ics), built in the browser.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarArrowDown, Check, Clock, Route, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import MiniToast, { type MiniToastState } from "@/components/learn/hub/MiniToast";
import KindIcon from "@/components/learn/search/KindIcon";
import { KIND_LABEL } from "@/lib/search/smart/types";
import { examplesIn } from "@/lib/search/smart/examples";
import { hasStepDues, type SavedPath, type SavedStep } from "@/lib/learn/saved-paths";
import { SITE_ORIGIN, savedPathPlan, toIcs } from "@/lib/learn/study-plan";
import { track } from "@/lib/track";
import { useSavedPaths } from "./useSavedPaths";

const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(Math.floor(s % 60)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

const dateLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** "Tue, 3 Nov" for a yyyy-mm-dd (read as that calendar day, never shifted by the zone) */
const dueLabel = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};

/** The path's dated steps as an .ics file, generated here and saved through a Blob link. */
function downloadPathIcs(p: SavedPath): number {
  const plan = savedPathPlan(p);
  if (!plan) return 0;
  const ics = toIcs(plan, { title: p.title, url: `${SITE_ORIGIN}/learn/saved#p-${p.id}`, now: new Date(), sequence: Math.floor(p.updatedAt / 1000) });
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "study-plan"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  track("saved_path", { action: "ics", source: p.source, days: plan.days.length });
  return plan.days.length;
}

export function StepTag({ step }: { step: Pick<SavedStep, "kind" | "at"> }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-signal-text">
      <KindIcon kind={step.kind} className="h-3.5 w-3.5" />
      {KIND_LABEL[step.kind].tag}
      {step.kind === "moment" && step.at >= 0 && (
        <span className="ml-1 inline-flex items-center gap-1 border border-line-strong px-1.5 py-px text-fg">
          <Clock className="h-3 w-3" aria-hidden />
          {clock(step.at)}
        </span>
      )}
    </span>
  );
}

function PathCard({ p, open, onToggle, onRemove }: { p: SavedPath; open: boolean; onToggle: () => void; onRemove: () => void }) {
  const { tick, stepState } = useSavedPaths();
  const states = p.steps.map((s) => stepState(p, s));
  const doneN = states.filter((s) => s.done).length;
  const next = p.steps.findIndex((_, i) => !states[i].done);
  const pct = Math.round((doneN / p.steps.length) * 100);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const listId = `sp-steps-${p.id}`;
  const dated = hasStepDues(p);
  const range = dated
    ? (() => {
        const ds = p.steps.map((s) => s.due).filter((d): d is string => !!d).sort();
        return ds[0] === ds[ds.length - 1] ? dueLabel(ds[0]) : `${dueLabel(ds[0])} – ${dueLabel(ds[ds.length - 1])}`;
      })()
    : "";

  return (
    <article id={`p-${p.id}`} aria-labelledby={`sp-h-${p.id}`} className="flex scroll-mt-28 flex-col border border-line-strong bg-surface">
      <header className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
            {p.source === "path" ? "Learning path" : "Saved results"} · saved {dateLabel(p.createdAt)}
          </span>
          <span className="font-mono text-[12px] text-fg-2">
            {doneN === p.steps.length ? "all done" : `${doneN} of ${p.steps.length} done`}
          </span>
        </div>
        <h2 id={`sp-h-${p.id}`} className="m-0 font-display text-[22px] font-bold leading-[1.15] tracking-[-0.01em] text-fg sm:text-[26px]">
          {p.title}
        </h2>
        {p.q && p.q !== p.title && (
          <p className="m-0 text-[14px] text-fg-3">
            You searched <span className="text-fg-2">“{p.q}”</span>
          </p>
        )}
        {p.note && <p className="m-0 border-l-2 border-signal pl-3 text-[14px] leading-relaxed text-fg-2">{p.note}</p>}
        {dated && <p className="m-0 font-mono text-[12px] text-fg-2">Scheduled · {range}</p>}
        <div className="h-1.5 w-full bg-surface-2" role="progressbar" aria-label="Steps done" aria-valuemin={0} aria-valuemax={p.steps.length} aria-valuenow={doneN}>
          <div className="h-full bg-signal transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {next >= 0 && (
            <Link href={p.steps[next].href} className="inline-flex min-h-11 items-center gap-2 bg-signal px-4 text-[15px] font-semibold text-on-signal">
              {doneN ? "Continue" : "Start"}: step {next + 1}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
          <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={listId} className="min-h-11 border border-line-strong px-4 text-[15px] text-fg hover:border-fg-3">
            {open ? "Hide steps" : `Show ${p.steps.length} steps`}
          </button>
          {dated && (
            <button
              type="button"
              onClick={() => setSaved(downloadPathIcs(p))}
              className="inline-flex min-h-11 items-center gap-2 border border-line-strong px-4 text-[15px] text-fg hover:border-fg-3"
            >
              <CalendarArrowDown className="h-4 w-4" aria-hidden />
              Download calendar (.ics)
            </button>
          )}
          {p.q && (
            <Link href={`/learn/chat?q=${encodeURIComponent(p.q)}`} className="inline-flex min-h-11 items-center gap-2 px-3 text-[14px] text-fg-3 hover:text-fg">
              <Search className="h-4 w-4" aria-hidden />
              Search again
            </Link>
          )}
          <span className="ml-auto">
            {confirm ? (
              <span className="inline-flex items-center gap-2">
                <span className="text-[14px] text-fg-2">Remove this path?</span>
                <button type="button" onClick={onRemove} className="min-h-10 bg-fg px-3 text-[14px] font-semibold text-bg">
                  Remove
                </button>
                <button type="button" onClick={() => setConfirm(false)} className="min-h-10 px-2 text-[14px] text-fg-3 hover:text-fg">
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirm(true)} className="min-h-10 px-2 text-[14px] text-fg-3 hover:text-fg">
                Remove
              </button>
            )}
          </span>
        </div>
        {saved !== null && (
          <p role="status" className="m-0 text-[14px] text-fg-2">
            {saved ? `Calendar saved: ${saved} day${saved === 1 ? "" : "s"}, one all-day event each. Open the file to add it to your calendar.` : "No dated steps to export."}
          </p>
        )}
      </header>
      {open && (
        <ol id={listId} className="m-0 flex list-none flex-col border-t border-line p-0">
          {p.steps.map((s, i) => {
            const st = states[i];
            return (
              <li key={s.id} className={`flex gap-3 border-b border-line px-4 py-3.5 last:border-b-0 sm:gap-4 sm:px-5 ${i === next ? "bg-bg" : ""}`}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={st.done}
                  aria-label={`Step ${i + 1} done: ${s.title}`}
                  disabled={st.lessonDone && !st.ticked}
                  onClick={() => tick(p.id, s.id)}
                  className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center border font-mono text-sm font-bold sm:h-9 sm:w-9 ${
                    st.done ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:border-fg-3"
                  }`}
                >
                  {st.done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                </button>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StepTag step={s} />
                    {i === next && <span className="font-mono text-[11px] uppercase tracking-label text-fg">next</span>}
                    {st.lessonDone && <span className="font-mono text-[11px] text-fg-3">lesson completed</span>}
                    {s.due && <span className="font-mono text-[11px] text-fg-2">{dueLabel(s.due)}</span>}
                  </span>
                  <Link href={s.href} className={`text-[17px] font-semibold leading-snug hover:underline ${st.done ? "text-fg-3 line-through decoration-1" : "text-fg"}`}>
                    {s.title}
                  </Link>
                  {s.why && <span className="text-[14px] leading-relaxed text-fg-2">{s.why}</span>}
                  {s.sub && <span className="truncate font-mono text-[12px] text-fg-3">{s.sub}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}

export default function SavedPaths() {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { hydrated, paths, max, remove, restore } = useSavedPaths();
  // open: the path the link points at (#p-<id>), else the newest; the learner's own toggles after that
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<MiniToastState>(null);
  const starters = useMemo(() => [...examplesIn("path").slice(0, 2), ...examplesIn("ask").slice(0, 1)], []);
  // hydrated is false on the server and the first client render, so reading the hash here can't mismatch
  const hashId = hydrated ? window.location.hash.replace(/^#p-/, "") : "";
  const target = paths.some((p) => p.id === hashId) ? hashId : "";
  const isOpen = (id: string) => toggled[id] ?? (target ? id === target : id === paths[0]?.id);

  useEffect(() => {
    if (target) window.setTimeout(() => document.getElementById(`p-${target}`)?.scrollIntoView({ block: "start" }), 50);
  }, [target]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const toggle = (id: string) => setToggled((t) => ({ ...t, [id]: !isOpen(id) }));

  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-7 px-4 pb-32 pt-10 sm:px-6">
      <section aria-labelledby="sp-title" className="flex flex-col gap-3.5">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">❯ saved paths</span>
        <h1 id="sp-title" className="m-0 font-display text-[clamp(44px,7vw,88px)] font-extrabold leading-[0.9] tracking-tightest text-fg">
          Saved paths<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 max-w-[640px] text-[17px] leading-relaxed text-fg-2">
          Learning paths and results you saved from search, as checklists. Tick a step when you finish it; a lesson you complete ticks itself.
        </p>
        {hydrated && !user && (
          <div className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-line-strong px-4 py-3">
            <span className="text-[15px] text-fg-2">Saved in this browser only. Sign in free to keep them on every device.</span>
            <button type="button" onClick={openAuthModal} className="min-h-11 bg-signal px-4 font-semibold text-on-signal">
              Sign in
            </button>
          </div>
        )}
      </section>

      {!hydrated ? (
        <div className="flex flex-col gap-3" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-3 border border-line bg-surface p-5">
              <span className="h-3 w-40 animate-pulse bg-surface-2" />
              <span className="h-6 w-2/3 animate-pulse bg-surface-2" />
              <span className="h-1.5 w-full animate-pulse bg-surface-2" />
            </div>
          ))}
        </div>
      ) : paths.length === 0 ? (
        <section aria-labelledby="sp-empty" className="flex flex-col gap-4 border border-dashed border-line-strong p-5 sm:p-6">
          <h2 id="sp-empty" className="m-0 flex items-center gap-2 font-display text-[22px] font-bold text-fg">
            <Route className="h-5 w-5 text-signal-text" aria-hidden />
            Nothing saved yet
          </h2>
          <p className="m-0 max-w-[600px] text-[15px] leading-relaxed text-fg-2">
            Ask search for a learning path, then press <span className="text-fg">Save path</span>. It shows up here, in order, ready to tick off.
          </p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {starters.map((x) => (
              <li key={x.text}>
                <Link
                  href={`/learn/chat?q=${encodeURIComponent(x.text)}${x.ai ? "&ask=1" : ""}`}
                  className="inline-flex min-h-10 items-center border border-dashed border-line-strong px-3 text-[14px] text-fg-2 hover:border-fg-3 hover:text-fg"
                >
                  {x.text}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <p className="m-0 font-mono text-[12px] text-fg-3">
            {paths.length} saved{paths.length >= max ? ` · the most you can keep is ${max}; remove one to save another` : ""}
          </p>
          <div className="flex flex-col gap-4">
            {paths.map((p) => (
              <PathCard
                key={p.id}
                p={p}
                open={isOpen(p.id)}
                onToggle={() => toggle(p.id)}
                onRemove={() => {
                  remove(p.id);
                  setToast({ id: Date.now(), text: "Path removed", action: { label: "Undo", onClick: () => (restore(p), setToast(null)) } });
                }}
              />
            ))}
          </div>
        </>
      )}
      <MiniToast toast={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}
