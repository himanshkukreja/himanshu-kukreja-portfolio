"use client";

/**
 * The company-targeted plan (owner-approved 12 Nov 2026): "Plan for <company>" on a company page, and the plan itself on
 * /plan. The items come from the server (lib/learner/planning.ts companyPlan: the company page's reported and likely
 * questions and its rounds, the learner's readiness estimate per track and recent misses), across System Design, LLD and
 * DSA; this page dates them with the /plan engine (lib/learn/plan/schedule.ts) from the learner's settings, the game flag
 * `plan:co`, every time it opens, so it re-plans as they progress: finished items drop out, missed days move the rest.
 * One AI paragraph on the priorities (FEATURES "plan-coach"), on request, kept a week. Signed-in learners only.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useGame } from "@/game/GameProvider";
import { userFetch } from "@/components/learn/progress/userFetch";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import { fmtDate, fmtMinutes } from "@/components/learn/progress/derive";
import { addDays, daysBetween, schedule, type PlanSettings, type Weekday } from "@/lib/learn/plan/schedule";
import { cleanRecord } from "@/lib/learn/plan/schedule";
import { cleanCompanyPlan, COMPANY_PLAN_FLAG, type CompanyItem, type CompanyPlanRecord, type Track } from "@/lib/learner/planning-model";
import type { ItemStatus } from "@/lib/learn/plan/schedule";
import { track } from "@/lib/track";
import { PLAN_FLAG, useToday } from "./usePlan";

type Data = {
  plan: { company: { slug: string; name: string; href: string; rounds: string[]; focus: string[] }; items: CompanyItem[]; status: Record<string, ItemStatus>; weights: Record<Track, number>; bands: Partial<Record<Track, string>>; struggles: string[] };
  paragraph: string | null;
  memoryTarget: string | null;
};

const TRACK: Record<Track, string> = { sdm: "System design", lld: "LLD", dsa: "DSA" };
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dow = (d: string) => WD[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7];

const memo = new Map<string, { at: number; p: Promise<Data | null> }>();
function loadCompany(slug: string, userId: string): Promise<Data | null> {
  const k = `${userId}|${slug}`;
  const hit = memo.get(k);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = userFetch(`/api/learn/planning/company?slug=${slug}`)
    .then(async (r) => (r.ok ? ((await r.json()) as Data) : null))
    .catch(() => null);
  memo.set(k, { at: Date.now(), p });
  return p;
}

function useCompanyData(slug: string | null) {
  const { user } = useAuth();
  const [d, setD] = useState<{ k: string; v: Data | null } | null>(null);
  const k = user && slug ? `${user.id}|${slug}` : "";
  useEffect(() => {
    if (!k || !slug || !user) return;
    let off = false;
    loadCompany(slug, user.id).then((v) => !off && setD({ k, v }));
    return () => {
      off = true;
    };
  }, [k, slug, user]);
  return d && d.k === k ? d.v : undefined;
}

function useCompanyRecord() {
  const { flags, setFlag, hydrated } = useGame();
  const rec = useMemo(() => (hydrated ? cleanCompanyPlan(flags[COMPANY_PLAN_FLAG]) : null), [flags, hydrated]);
  const sdm = useMemo(() => (hydrated ? cleanRecord(flags[PLAN_FLAG]) : null), [flags, hydrated]);
  return { rec, sdm, hydrated, save: (r: CompanyPlanRecord) => setFlag(COMPANY_PLAN_FLAG, r), remove: () => setFlag(COMPANY_PLAN_FLAG, null) };
}

function scheduleOf(d: Data, rec: CompanyPlanRecord, today: string) {
  const settings: PlanSettings = {
    target: rec.target,
    days: rec.days as Weekday[],
    minutes: rec.minutes,
    time: "20:00",
    include: { core: true, bosses: false, trials: false, sideQuests: false, mocks: true },
    mocksAt: "worlds",
    revision: 2,
    buffer: true,
    startWeek: null,
    reminder: 0,
  };
  const [y, m, dd] = today.split("-").map(Number);
  // finished before the plan was made: not part of it; finished since: ticked in place
  return schedule({ items: d.plan.items, stretch: [], status: d.plan.status, settings, from: today, cutoff: Math.min(rec.createdAt || 0, new Date(y, m - 1, dd).getTime()) });
}

/* ------------------------------------------------------------------ the company page's entry */

export function CompanyPlanEntry({ slug, name }: { slug: string; name: string }) {
  const { user, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const today = useToday();
  const { rec, sdm, hydrated, save } = useCompanyRecord();
  const d = useCompanyData(user ? slug : null);
  const [target, setTarget] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const mine = rec?.company === slug ? rec : null;
  const sch = useMemo(() => (d && mine && today ? scheduleOf(d, mine, today) : null), [d, mine, today]);
  if (loading || !hydrated || !today) return null;

  if (!user) {
    return (
      <p className="m-0 text-[14px] text-fg-3">
        <button type="button" onClick={() => openAuthModal()} className="font-semibold text-signal-text underline decoration-line-strong underline-offset-4">
          Sign in
        </button>{" "}
        for a dated plan for {name} across system design, LLD and DSA, built from your own progress.
      </p>
    );
  }

  if (mine && sch) {
    const next = sch.days.filter((x) => x.date >= today && x.entries.some((e) => !e.done)).slice(0, 3);
    return (
      <section aria-labelledby="coplan-h" className="flex flex-col gap-3 border border-signal/60 bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="coplan-h" className="m-0 font-mono text-[11px] uppercase tracking-label text-signal-text">
            your plan for {name} · interview {fmtDate(mine.target, true)}
          </h2>
          <span className={`font-mono text-[11px] ${sch.fits ? "text-fg-3" : "text-signal-text"}`}>{sch.fits ? `${daysBetween(today, mine.target)} days to go` : "doesn't fit at this pace"}</span>
        </div>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {next.map((day) => (
            <li key={day.date} className="flex gap-3 text-[14px] leading-snug">
              <span className="w-[74px] shrink-0 font-mono text-[12px] text-fg-3">{day.date === today ? "Today" : `${dow(day.date)} ${fmtDate(day.date)}`}</span>
              <span className="min-w-0 text-fg-2">
                {day.entries
                  .filter((e) => !e.done)
                  .map((e) => e.title)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
        <Link href="/plan#company-plan" className="self-start font-mono text-[13px] text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
          open the whole plan →
        </Link>
      </section>
    );
  }

  const seed = target ?? (rec?.company === slug ? rec.target : null) ?? sdm?.settings.target ?? d?.memoryTarget ?? addDays(today, 42);
  const mins = minutes ?? sdm?.settings.minutes ?? 60;
  const make = () => {
    const now = Date.now();
    save({ v: 1, company: slug, name, target: seed, minutes: mins, days: sdm?.settings.days ?? [0, 1, 2, 3, 4], createdAt: now, updatedAt: now });
    track("company_plan_create", { company: slug, days_to_interview: daysBetween(today, seed), minutes: mins, replaced: !!rec && rec.company !== slug });
  };
  return (
    <section aria-labelledby="coplan-h" className="flex flex-col gap-3 border border-line-strong bg-surface p-4 sm:p-5">
      <h2 id="coplan-h" className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-fg">
        Plan for {name}
      </h2>
      <p className="m-0 max-w-[680px] text-[14px] leading-relaxed text-fg-2">
        A dated plan built from what {name} asks (the questions and rounds below) and your own readiness, across system design, LLD{d?.plan.weights.dsa ? " and DSA" : ""}. It re-plans as you go.
        {rec && rec.company !== slug ? ` It replaces your plan for ${rec.name}.` : ""}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 font-mono text-[11px] uppercase tracking-label text-fg-3">
          interview
          <input type="date" value={seed} min={addDays(today, 3)} onChange={(e) => setTarget(e.target.value || null)} className="min-h-11 border border-line-strong bg-bg px-3 font-sans text-[15px] normal-case tracking-normal text-fg" />
        </label>
        <label className="flex flex-col gap-1 font-mono text-[11px] uppercase tracking-label text-fg-3">
          a day
          <select value={mins} onChange={(e) => setMinutes(Number(e.target.value))} className="min-h-11 border border-line-strong bg-bg px-3 font-sans text-[15px] normal-case tracking-normal text-fg">
            {[30, 45, 60, 90, 120, 180].map((m) => (
              <option key={m} value={m}>
                {fmtMinutes(m)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={make} disabled={!d} className="min-h-11 bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110 disabled:opacity-60">
          {d === undefined ? "Loading your progress…" : `Make my ${name} plan`}
        </button>
      </div>
      {d?.memoryTarget && !target && seed === d.memoryTarget && <span className="text-[12.5px] text-fg-3">The date is from your tutor memory&apos;s goals.</span>}
    </section>
  );
}

/* ------------------------------------------------------------------ /plan's section */

export default function CompanyPlanSection({ today }: { today: string }) {
  const { user } = useAuth();
  const ai = useAiStatus();
  const { rec, remove } = useCompanyRecord();
  const d = useCompanyData(user && rec ? rec.company : null);
  const [para, setPara] = useState<{ text: string } | null>(null);
  const [asking, setAsking] = useState<"idle" | "loading" | "err">("idle");
  const [confirm, setConfirm] = useState(false);
  const sch = useMemo(() => (d && rec ? scheduleOf(d, rec, today) : null), [d, rec, today]);
  if (!user) return null;
  if (!rec) {
    return (
      <p className="m-0 text-[14px] text-fg-3">
        Targeting one company?{" "}
        <Link href="/prep/companies" className="font-semibold text-signal-text underline decoration-line-strong underline-offset-4">
          Pick it on Companies
        </Link>{" "}
        for a plan across system design, LLD and DSA built from what it asks.
      </p>
    );
  }
  if (d === undefined) return <div aria-busy="true" className="h-[160px] animate-pulse border border-line bg-surface" />;
  if (!d || !sch) return <p className="m-0 text-[14px] text-fg-3">Your plan for {rec.name} couldn&apos;t load just now. Refresh in a minute.</p>;

  const paragraph = para?.text ?? d.paragraph;
  const aiOn = !!ai?.signedIn && !!ai.features["plan-coach"];
  const ask = async () => {
    setAsking("loading");
    const r = await userFetch("/api/learn/planning/company", { method: "POST", body: JSON.stringify({ slug: rec.company, target: rec.target, minutes: rec.minutes, days: rec.days }) }).catch(() => null);
    const b = (await r?.json().catch(() => null)) as { paragraph?: string } | null;
    if (r?.ok && b?.paragraph) {
      setPara({ text: b.paragraph });
      setAsking("idle");
      memo.clear();
      track("company_plan_why", { company: rec.company });
    } else setAsking("err");
  };
  const tracks = (Object.keys(d.plan.weights) as Track[]).filter((t) => d.plan.weights[t] > 0);
  const tot = tracks.reduce((a, t) => a + d.plan.weights[t], 0) || 1;
  const upcoming = sch.days.filter((x) => x.date >= today).slice(0, 21);
  const itemTrack = new Map(d.plan.items.map((i) => [i.id, i.track]));

  return (
    <section id="company-plan" aria-labelledby="company-plan-h" className="flex scroll-mt-28 flex-col gap-4 border-t border-line pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
            company plan · interview {dow(rec.target)} {fmtDate(rec.target, true)} · {daysBetween(today, rec.target)} days
          </span>
          <h2 id="company-plan-h" className="m-0 font-display text-[28px] font-extrabold leading-[1] tracking-[-0.035em] text-fg sm:text-[36px]">
            Plan for {d.plan.company.name}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={d.plan.company.href} className="inline-flex min-h-11 items-center border border-line-strong px-4 text-sm text-fg hover:bg-surface-2">
            {d.plan.company.name}&apos;s questions
          </Link>
          {confirm ? (
            <>
              <button type="button" onClick={remove} className="min-h-11 border border-bad px-4 text-sm text-bad-text">
                Delete it
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="min-h-11 px-3 text-sm text-fg-3">
                Keep
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="min-h-11 px-3 text-sm text-fg-3 underline-offset-4 hover:text-fg hover:underline">
              Delete plan
            </button>
          )}
        </div>
      </div>

      <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12.5px] text-fg-3">
        {tracks.map((t) => (
          <span key={t}>
            {TRACK[t]} {Math.round((d.plan.weights[t] / tot) * 100)}%{d.plan.bands[t] ? ` · ${d.plan.bands[t]?.toLowerCase()}` : ""}
          </span>
        ))}
        <span>
          {fmtMinutes(rec.minutes)} on {rec.days.map((x) => WD[x]).join(", ")}
        </span>
      </p>

      {paragraph ? (
        <p className="m-0 max-w-[860px] text-[15px] leading-relaxed text-fg-2">
          <span className="mr-2 font-mono text-[11px] uppercase tracking-label text-signal-text">priorities</span>
          {paragraph}
        </p>
      ) : aiOn ? (
        <p className="m-0 text-[14px] text-fg-3">
          <button type="button" onClick={ask} disabled={asking === "loading"} className="min-h-8 font-semibold text-signal-text underline decoration-line-strong underline-offset-4 disabled:opacity-60">
            {asking === "loading" ? "Writing…" : "Why these priorities? (one paragraph, AI)"}
          </button>
          {asking === "err" ? " That didn't come through. Try again in a moment." : ""}
        </p>
      ) : null}

      {!sch.fits && (
        <p className="m-0 border border-dashed border-signal p-3 text-[14px] text-fg-2">
          At {fmtMinutes(rec.minutes)} a day, {fmtMinutes(sch.overflowMinutes)} doesn&apos;t fit before {fmtDate(rec.target)}: the plan below runs the most important items first.
        </p>
      )}

      <ol className="m-0 flex list-none flex-col border border-line p-0">
        {upcoming.map((day) => (
          <li key={day.date} className={`flex flex-col gap-1.5 border-b border-line px-4 py-3 last:border-b-0 sm:flex-row sm:gap-4 ${day.date === today ? "bg-surface-2 shadow-[inset_3px_0_0_var(--c-signal)]" : "bg-bg"}`}>
            <span className="shrink-0 font-mono text-[12px] text-fg sm:w-[92px]">
              {dow(day.date)} {fmtDate(day.date)}
              {day.date === today && <span className="ml-2 text-[11px] tracking-label text-signal-text sm:ml-0 sm:block">TODAY</span>}
            </span>
            {day.type === "buffer" ? (
              <span className="text-[14px] text-fg-3">Catch-up day. Nothing new.</span>
            ) : (
              <ul className="m-0 flex min-w-0 flex-1 list-none flex-col gap-1 p-0">
                {day.entries.map((e, i) => (
                  <li key={`${e.id}-${i}`} className="flex items-baseline gap-2 text-[14px] leading-snug">
                    <span aria-hidden className={`w-3 shrink-0 font-mono text-[12px] ${e.done ? "text-signal-text" : "text-fg-4"}`}>
                      {e.done ? "✓" : "·"}
                    </span>
                    <Link href={e.href} className={`min-w-0 ${e.done ? "text-fg-3 line-through decoration-fg-4" : "text-fg-2 hover:text-fg"}`}>
                      <span className="font-mono text-[11px] text-fg-3">{e.kind === "revision" ? "REVISION" : (TRACK[itemTrack.get(e.id) ?? "sdm"] ?? "").toUpperCase()}</span> {e.title}
                      {e.part ? ` (${e.part[0]}/${e.part[1]})` : ""}
                    </Link>
                    <span className="ml-auto shrink-0 font-mono text-[11.5px] text-fg-3">{e.minutes}m</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      <p className="m-0 text-[13px] text-fg-3">
        Built from {d.plan.company.name}&apos;s page (reported questions first) and your readiness estimate. Finished items drop out and missed days move the rest each time you open it.
      </p>
    </section>
  );
}
