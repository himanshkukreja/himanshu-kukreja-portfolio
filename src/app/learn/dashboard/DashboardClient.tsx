"use client";

/**
 * Player profile (/learn/dashboard): level + XP (game engine), streak, true counts against the
 * course's real denominators, trials passed, resume rows, badges, a 12-week activity heatmap and
 * the XP log. Guests see their own browser's data; signed-in learners see Supabase + local.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useGame } from "@/game/GameProvider";
import { BADGES, LEVELS, levelProgress } from "@/game/catalog";
import { supabaseClient } from "@/lib/supabase-client";
import type { CourseMap } from "@/lib/learn/types";
import { LEARN_XP, lessonKey } from "@/lib/learn/types";
import { activityByDay, findResume, readReviewLog, streakFrom, timeAgo, trialPassed, useLearnProgress, weekStates, xpLog } from "@/lib/learn/progress";
import { addDays, localDate } from "@/lib/learn/review";
import { useReviewCards } from "@/lib/learn/useReviewDue";
import { scoreMcqParts } from "@/lib/learn/actions";
import { fallbackMeta, indexLessons } from "@/lib/learn/notebook";
import AuthPromptBanner from "@/components/AuthPromptBanner";

const ICONS: Record<string, string> = {
  rush: "M4 17l5-5 4 4 7-8M14 8h6v6",
  root: "M4 6l6 6-6 6M12 18h8",
  completionist: "M4 5h16v14H4zM8 9h8M8 13h5",
  chaos: "M12 3v4M5 7l2 2M19 7l-2 2M4 14h16M7 14a5 5 0 0 1 10 0M6 18h12",
  oncall: "M12 3a6 6 0 0 1 6 6v5l2 3H4l2-3V9a6 6 0 0 1 6-6zM10 20h4",
  world: "M13 2L4 14h7l-1 8 9-12h-7z",
  side: "M5 3v18M5 4h11l-2 4 2 4H5",
};

type PassInfo = { passed: Set<string>; avg: number | null; source: "attempts" | "answers" | "local" };

function initialsOf(name?: string | null, email?: string | null) {
  const src = (name || email || "").trim();
  if (!src) return "··";
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || src.slice(0, 2).toUpperCase();
}

export default function DashboardClient({ map }: { map: CourseMap }) {
  const { user, profile, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { xp, hydrated } = useGame();
  const { ready, signedIn, lessons, done } = useLearnProgress(map.courseId);
  const { dueCount, due, ready: dueReady } = useReviewCards();
  const index = useMemo(() => indexLessons(map), [map]);
  const userId = user?.id ?? null;

  const [remotePass, setRemotePass] = useState<PassInfo | null>(null);
  const [streakDays, setStreakDays] = useState<Record<string, number>>({});
  const [reviewLog, setReviewLog] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState<{ notes: { id: string; week: string; lesson_slug: string; note_text: string | null; highlight_text: string | null }[]; bookmarks: { id: string; week: string; lesson_slug: string; custom_title: string | null; bookmark_text: string | null; note: string | null }[]; counts: [number, number] } | null>(null);
  const [savedTab, setSavedTab] = useState<"notes" | "bookmarks">("notes");

  useEffect(() => {
    const t = window.setTimeout(() => setReviewLog(readReviewLog()), 0);
    return () => window.clearTimeout(t);
  }, []);

  // Signed-in extras: trials (trial_attempts → mcq answers fallback), streak days, latest notes.
  useEffect(() => {
    if (!userId) return;
    let off = false;
    (async () => {
      const attempts = await supabaseClient.from("trial_attempts").select("week, part, score, total, passed").eq("user_id", userId).eq("course_id", map.courseId);
      if (!attempts.error) {
        const best = new Map<string, number>();
        const passed = new Set<string>();
        (attempts.data || []).forEach((a: { week: string; part: number; score: number; total: number; passed: boolean }) => {
          const k = `${a.week}/part-${a.part}`;
          if (a.passed) passed.add(k);
          if (a.total) best.set(k, Math.max(best.get(k) || 0, a.score / a.total));
        });
        const vals = Array.from(best.values());
        if (!off) setRemotePass({ passed, avg: vals.length ? Math.round((vals.reduce((x, y) => x + y, 0) / vals.length) * 100) : null, source: "attempts" });
        return;
      }
      // Fallback: score saved MCQ answers per part on the server (answer keys never reach the browser).
      const trials = map.weeks.filter((w) => w.trial).map((w) => w.trial!);
      const { data: assess } = await supabaseClient.from("mcq_assessments").select("id, week, lesson_slug").eq("course_id", map.courseId);
      const ids = (assess || []).map((a: { id: string }) => a.id);
      if (!ids.length) return;
      const { data: answers } = await supabaseClient.from("mcq_user_answers").select("assessment_id, question_number, selected_option").eq("user_id", userId).in("assessment_id", ids);
      const byWeek: Record<string, Record<string, string>> = {};
      (answers || []).forEach((r: { assessment_id: string; question_number: number; selected_option: string | null }) => {
        const a = (assess || []).find((x: { id: string }) => x.id === r.assessment_id) as { week: string; lesson_slug: string } | undefined;
        if (!a || !r.selected_option) return;
        (byWeek[`${a.week}|${a.lesson_slug}`] ||= {})[String(r.question_number)] = r.selected_option;
      });
      const input = Object.entries(byWeek)
        .map(([k, answers]) => {
          const [week, slug] = k.split("|");
          return { week, slug, answers };
        })
        .filter((x) => trials.some((t) => t.week === x.week && t.slug === x.slug));
      if (!input.length) return;
      const scored = await scoreMcqParts(input);
      const passed = new Set<string>();
      const pcts: number[] = [];
      Object.entries(scored).forEach(([week, parts]) =>
        parts.forEach((p) => {
          if (p.passed) passed.add(`${week}/part-${p.part}`);
          if (p.answered === p.total && p.total) pcts.push(p.correct / p.total);
        })
      );
      if (!off) setRemotePass({ passed, avg: pcts.length ? Math.round((pcts.reduce((x, y) => x + y, 0) / pcts.length) * 100) : null, source: "answers" });
    })().catch(() => undefined);

    const since = addDays(localDate(), -84);
    supabaseClient
      .from("learning_streaks")
      .select("activity_date, lessons_completed")
      .eq("user_id", userId)
      .gte("activity_date", since)
      .then(({ data, error }) => {
        if (off || error || !data) return;
        const m: Record<string, number> = {};
        data.forEach((r: { activity_date: string; lessons_completed: number | null }) => (m[r.activity_date.slice(0, 10)] = Math.max(1, r.lessons_completed || 1)));
        setStreakDays(m);
      });

    Promise.all([
      supabaseClient.from("content_notes").select("id, week, lesson_slug, note_text, highlight_text", { count: "exact" }).eq("user_id", userId).neq("note_text", "").not("note_text", "is", null).order("created_at", { ascending: false }).limit(3),
      supabaseClient.from("bookmarks").select("id, week, lesson_slug, custom_title, bookmark_text, note", { count: "exact" }).eq("user_id", userId).order("created_at", { ascending: false }).limit(3),
    ]).then(([n, b]) => {
      if (off) return;
      setSaved({ notes: (n.data || []) as never[], bookmarks: (b.data || []) as never[], counts: [n.count || 0, b.count || 0] });
    });
    return () => {
      off = true;
    };
  }, [userId, map]);

  const resume = useMemo(() => (ready ? findResume(map, lessons) : null), [ready, map, lessons]);
  const currentWeek = resume && resume.lesson.kind !== "bonus" ? resume.lesson.week : null;
  const states = useMemo(() => weekStates(map, lessons, done, currentWeek), [map, lessons, done, currentWeek]);

  const pass: PassInfo = useMemo(() => {
    const local = new Set<string>();
    map.weeks.forEach((w) => w.trial?.parts.forEach((p) => trialPassed(done, w, p.n) && local.add(`${w.trial!.week}/part-${p.n}`)));
    if (!remotePass) return { passed: local, avg: null, source: "local" };
    return { passed: new Set([...local, ...remotePass.passed]), avg: remotePass.avg, source: remotePass.source };
  }, [map.weeks, done, remotePass]);

  const counts = {
    core: states.reduce((a, s) => a + s.lessonsDone, 0),
    bosses: states.filter((s) => s.bossDone).length,
    parts: pass.passed.size,
    side: map.sideQuests.filter((l) => lessons[lessonKey(l.week, l.slug)]?.status === "completed").length,
  };

  const activity = useMemo(() => {
    const a = activityByDay(done, reviewLog);
    Object.entries(streakDays).forEach(([d, n]) => (a[d] = Math.max(a[d] || 0, n)));
    return a;
  }, [done, reviewLog, streakDays]);
  const local = streakFrom(activity);
  const remoteStreak = signedIn && profile && profile.current_streak > 0 ? profile.current_streak : 0;
  const streak = remoteStreak || local.current;
  const best = Math.max(signedIn && profile ? profile.longest_streak || 0 : 0, local.best, streak);

  const lp = levelProgress(hydrated ? xp : 0);
  const log = useMemo(() => xpLog(done, map).slice(0, 10), [done, map]);

  // Fastest route to the next level, from real remaining XP.
  const route = useMemo(() => {
    if (!lp.next || !ready) return null;
    const need = lp.next.min - xp;
    const cur = states.find((s) => s.week.key === currentWeek) || states.find((s) => !s.cleared);
    const opts: string[] = [];
    if (cur && !cur.cleared) {
      const rem =
        (cur.week.lessons.length - cur.lessonsDone) * LEARN_XP.lesson +
        (cur.week.boss && !cur.bossDone ? LEARN_XP.boss : 0) +
        ((cur.week.trial?.parts.length || 0) - cur.partsPassed.length) * LEARN_XP.trial +
        LEARN_XP.world;
      opts.push(`finish Week ${cur.week.code} (+${rem})`);
    }
    const sideLeft = map.sideQuests.length - counts.side;
    if (sideLeft > 0) {
      const k = Math.min(sideLeft, Math.max(1, Math.ceil(need / LEARN_XP.sideQuest)));
      opts.push(`${k === 1 ? "one side quest" : `${k} side quests`} (+${k * LEARN_XP.sideQuest})`);
    }
    return { need, text: opts.length ? `Fastest route: ${opts.join(" or ")}.` : "" };
  }, [lp.next, ready, xp, states, currentWeek, map.sideQuests.length, counts.side]);

  // Next trial part to take.
  const nextTrial = useMemo(() => {
    const order = [...states].sort((a, b) => (a.week.key === currentWeek ? -1 : b.week.key === currentWeek ? 1 : a.week.num - b.week.num));
    for (const s of order) {
      const p = s.week.trial?.parts.find((x) => !pass.passed.has(`${s.week.trial!.week}/part-${x.n}`));
      if (p) return { s, p };
    }
    return null;
  }, [states, currentWeek, pass.passed]);

  // Badges: site catalog + one per world + side-quester.
  const badges = [
    ...BADGES.map((b) => ({ id: b.id, name: b.name, how: b.how, icon: ICONS[b.id] || ICONS.world, earned: b.earned(done), state: "" })),
    ...states.map((s) => ({
      id: `world:${s.week.key}`,
      name: s.week.badge,
      how: `Clear Week ${s.week.code} · ${s.week.title}.`,
      icon: ICONS.world,
      earned: s.cleared,
      state: s.cleared ? "" : `${s.nodesDone}/${s.nodesTotal}`,
    })),
    { id: "side", name: "Side-quester", how: "Finish 5 side quests.", icon: ICONS.side, earned: counts.side >= 5, state: `${Math.min(counts.side, 5)}/5` },
  ];
  const earnedCount = badges.filter((b) => b.earned).length;

  // Heatmap: 12 columns (weeks) × 7 rows (Mon..Sun), ending this week.
  const heat = useMemo(() => {
    const today = new Date();
    const dow = (today.getDay() + 6) % 7; // Mon=0
    const end = localDate(today);
    const start = addDays(end, -(11 * 7 + dow));
    const cols: { d: string; v: number; future: boolean }[][] = [];
    for (let w = 0; w < 12; w++) {
      const col = [];
      for (let k = 0; k < 7; k++) {
        const d = addDays(start, w * 7 + k);
        col.push({ d, v: activity[d] || 0, future: d > end });
      }
      cols.push(col);
    }
    return cols;
  }, [activity]);
  const activeDays = heat.flat().filter((c) => c.v > 0).length;

  const name = profile?.full_name || user?.email?.split("@")[0] || "Guest learner";
  const provider = (user?.app_metadata?.provider as string | undefined) || null;

  if (!ready || loading) {
    return (
      <main className="mx-auto flex max-w-[1320px] flex-col gap-8 px-4 pb-24 pt-10 sm:px-6">
        <div aria-busy="true" className="h-[200px] animate-pulse border border-line bg-surface" />
        <div className="h-[120px] animate-pulse border border-line bg-surface" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-8 px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      {/* Player card */}
      <section className="flex flex-wrap items-center gap-6 border border-line bg-surface p-5 sm:gap-8 sm:p-8">
        <div className="grid h-16 w-16 shrink-0 place-items-center bg-fg font-display text-[26px] font-extrabold tracking-[-0.04em] text-bg sm:h-28 sm:w-28 sm:text-[44px]">
          {signedIn ? initialsOf(profile?.full_name, user?.email) : "··"}
        </div>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
          <span className="font-mono text-xs uppercase tracking-label text-fg-3">
            {signedIn ? `Player profile · signed in${provider === "google" ? " with Google" : provider === "email" ? " with email" : ""}` : "Player profile · guest · this browser"}
          </span>
          <h1 className="break-words font-display text-[clamp(36px,5vw,64px)] font-extrabold leading-[0.95] tracking-[-0.045em] text-fg">{name}</h1>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="bg-signal px-2.5 py-1.5 font-mono text-[13px] font-semibold tracking-label text-on-signal">
              {lp.level.code} · {lp.level.name.toUpperCase()}
            </span>
            <span className="font-mono text-[13px] text-fg-2">
              {xp} XP{lp.next ? ` · ${lp.next.min - xp} to ${lp.next.name}` : " · max level"}
            </span>
          </div>
          <div className="h-2 max-w-[560px] bg-surface-2" role="progressbar" aria-label="Progress to the next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={lp.pct}>
            <div className="h-2 bg-signal" style={{ width: `${lp.pct}%` }} />
          </div>
        </div>
        {lp.next && (
          <div className="flex flex-[1_1_260px] flex-col gap-2 border border-dashed border-line-strong px-5 py-[18px]">
            <span className="font-mono text-xs uppercase tracking-label text-fg-3">
              Next unlock · {lp.next.code} {lp.next.name}
            </span>
            <span className="text-[15px] leading-normal text-fg">{LEVELS[lp.index + 1]?.unlock}</span>
            {route?.text && <span className="text-[13px] text-fg-3">{route.text}</span>}
          </div>
        )}
      </section>

      {!signedIn && <AuthPromptBanner variant="profile" />}

      {/* Resume rows */}
      <section aria-labelledby="resume-h" className="flex flex-col gap-3">
        <h2 id="resume-h" className="font-mono text-xs font-medium uppercase tracking-label text-fg-3">
          Pick up where you left off
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-2">
          {resume && (
            <Link href={resume.lesson.href} className="flex flex-col gap-2 border border-signal bg-surface p-[18px] hover:bg-surface-2">
              <span className="font-mono text-[11px] text-signal-text">
                {resume.lesson.tag}
                {resume.progress?.completedStages.length ? ` · ${resume.progress.completedStages.length} STAGE${resume.progress.completedStages.length === 1 ? "" : "S"} DONE` : ""}
              </span>
              <span className="font-display text-[22px] font-bold text-fg">{resume.lesson.title}</span>
              <span className="text-[13px] text-fg-3">
                {resume.mode === "resume" ? "In progress" : resume.mode === "next" ? "Up next after your last cleared lesson" : "Start here"} · {resume.lesson.minutes} min read
              </span>
            </Link>
          )}
          {nextTrial && (
            <Link href={nextTrial.p.href} className="flex flex-col gap-2 border border-line bg-surface p-[18px] hover:bg-surface-2">
              <span className="font-mono text-[11px] text-fg-3">
                W{nextTrial.s.week.code} · TRIAL · PART {nextTrial.p.n}
              </span>
              <span className="font-display text-[22px] font-bold text-fg">
                {nextTrial.p.title} · {nextTrial.p.questions} Q
              </span>
              <span className="text-[13px] text-fg-3">Pass mark {nextTrial.s.week.trial?.passPct}% · +{LEARN_XP.trial} XP on first pass</span>
            </Link>
          )}
          <Link href="/learn/review" className="flex flex-col gap-2 border border-line bg-surface p-[18px] hover:bg-surface-2">
            <span className="font-mono text-[11px] text-fg-3">DAILY STANDUP</span>
            <span className="font-display text-[22px] font-bold text-fg">{!dueReady ? "Review cards" : dueCount ? `${dueCount} review card${dueCount === 1 ? "" : "s"} due` : "Nothing due today"}</span>
            <span className="text-[13px] text-fg-3">
              {dueCount
                ? `~${Math.max(1, Math.ceil((dueCount * 25) / 60))} min · ${[
                    ["trial_miss", "from missed trial questions"],
                    ["trial_flag", "flagged"],
                    ["highlight", "from highlights"],
                    ["interview", "interview"],
                  ]
                    .map(([k, l]) => [due.filter((c) => c.source === k).length, l] as const)
                    .filter(([n]) => n > 0)
                    .map(([n, l]) => `${n} ${l}`)
                    .join(", ")}`
                : "Misses, flags and highlights you turn into cards land here."}
            </span>
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section aria-label="Stats" className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-px border border-line bg-line">
        {[
          { n: counts.core, of: map.stats.coreLessons, label: "core lessons cleared · side quests apart" },
          { n: counts.bosses, of: map.stats.bosses, label: "bosses defeated" },
          { n: counts.parts, of: map.stats.trialParts, label: `trial parts passed${pass.avg !== null ? ` · avg ${pass.avg}%` : ""}` },
          { n: streak || "—", label: `day streak${best ? ` · best ${best}` : ""}`, accent: true },
          { n: counts.side, of: map.stats.sideQuests, label: "side quests done" },
        ].map((c) => (
          <div key={c.label} className="flex flex-col gap-1.5 bg-bg p-[22px]">
            <span className={`font-mono text-[34px] font-semibold ${c.accent && streak ? "text-signal-text" : "text-fg"}`}>
              {c.n}
              {c.of !== undefined && <span className="text-base text-fg-3">/{c.of}</span>}
            </span>
            <span className="text-[13px] text-fg-3">{c.label}</span>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby="badges-h" className="flex min-w-0 flex-[999_1_620px] flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="badges-h" className="font-display text-[32px] font-bold tracking-[-0.03em] text-fg sm:text-[36px]">
              Badge cabinet
            </h2>
            <span className="font-mono text-[13px] text-fg-3">
              {earnedCount} of {badges.length}
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))] gap-2">
            {badges.map((b) => (
              <div key={b.id} className={`flex min-h-[176px] flex-col gap-2.5 p-[18px] ${b.earned ? "border border-signal bg-bg" : "border border-dashed border-line-strong"}`}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden className={b.earned ? "text-signal-text" : "text-fg-4"}>
                  <path d={b.icon} />
                </svg>
                <span className="text-[15px] font-semibold leading-tight text-fg">{b.name}</span>
                <span className="text-xs leading-snug text-fg-3">{b.how}</span>
                <span className={`mt-auto font-mono text-[11px] tracking-label ${b.earned ? "text-signal-text" : "text-fg-3"}`}>{b.earned ? "EARNED" : b.state || "NOT YET"}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-[32px] font-bold tracking-[-0.03em] text-fg sm:text-[36px]">Last 12 weeks</h2>
              <span className="flex items-center gap-1.5 text-xs text-fg-3">
                less <span className="h-3 w-3 bg-surface-2" />
                <span className="h-3 w-3 bg-signal/35" />
                <span className="h-3 w-3 bg-signal/65" />
                <span className="h-3 w-3 bg-signal" /> more
              </span>
            </div>
            <div role="img" aria-label={`Learning activity heatmap, 12 weeks: ${activeDays} active days`} className="overflow-x-auto border border-line bg-surface p-[18px]">
              <div className="grid min-w-[520px] grid-cols-12 gap-1">
                {heat.map((col, w) => (
                  <div key={w} className="grid grid-rows-7 gap-1">
                    {col.map((c) => (
                      <span
                        key={c.d}
                        title={`${c.d}${c.v ? ` · ${c.v} event${c.v === 1 ? "" : "s"}` : ""}`}
                        className={`h-[18px] ${c.future ? "" : c.v === 0 ? "bg-surface-2" : c.v < 3 ? "bg-signal/35" : c.v < 6 ? "bg-signal/65" : "bg-signal"}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            {activeDays === 0 && <span className="text-[13px] text-fg-3">No activity yet. A finished stage, a lesson, a trial part or a review card lights up a day.</span>}
          </div>
        </section>

        <aside className="flex w-full min-w-0 flex-col gap-4 lg:w-auto lg:flex-[1_1_340px]">
          <section aria-labelledby="log-h" className="flex flex-col gap-3 border border-line bg-surface p-[22px]">
            <h2 id="log-h" className="font-mono text-xs font-medium uppercase tracking-label text-fg-3">
              XP log
            </h2>
            {log.length ? (
              <ol className="flex flex-col">
                {log.map((l) => (
                  <li key={l.key} className="flex items-baseline gap-3 border-b border-line py-2.5 last:border-b-0">
                    <span className="w-14 shrink-0 font-mono text-[13px] text-signal-text">+{l.xp}</span>
                    {l.href ? (
                      <Link href={l.href} className="min-w-0 flex-1 text-sm leading-snug text-fg hover:underline">
                        {l.what}
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1 text-sm leading-snug text-fg">{l.what}</span>
                    )}
                    <span className="whitespace-nowrap font-mono text-[11px] text-fg-3">{timeAgo(l.at)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-fg-3">Nothing earned yet. Finish a stage (+{LEARN_XP.stage}) or a lesson (+{LEARN_XP.lesson}) to start the log.</p>
            )}
          </section>

          <section aria-labelledby="saved-h" className="flex flex-col gap-3.5 border border-line bg-surface p-[22px]">
            <h2 id="saved-h" className="sr-only">
              Notes and bookmarks
            </h2>
            {signedIn ? (
              <>
                <div role="tablist" aria-label="Saved" className="flex flex-wrap gap-1.5">
                  {(["notes", "bookmarks"] as const).map((t, k) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={savedTab === t}
                      onClick={() => setSavedTab(t)}
                      className={`min-h-10 px-3 text-sm ${savedTab === t ? "bg-fg font-semibold text-bg" : "border border-line-strong text-fg-2"}`}
                    >
                      {t === "notes" ? "Notes" : "Bookmarks"} {saved ? saved.counts[k] : ""}
                    </button>
                  ))}
                  <Link href={`/learn/notebook?tab=${savedTab}`} className="ml-auto inline-flex min-h-10 items-center px-1 font-mono text-xs text-signal-text">
                    open notebook →
                  </Link>
                </div>
                <div className="flex flex-col gap-2.5">
                  {!saved && <span className="h-16 animate-pulse bg-surface-2" />}
                  {saved && (savedTab === "notes" ? saved.notes : saved.bookmarks).length === 0 && (
                    <span className="text-sm text-fg-3">{savedTab === "notes" ? "No notes yet. Select text in a lesson and press N." : "No bookmarks yet. Select text in a lesson and press B."}</span>
                  )}
                  {saved &&
                    (savedTab === "notes" ? saved.notes : saved.bookmarks).map((r) => {
                      const m = index.get(lessonKey(r.week, r.lesson_slug)) || fallbackMeta(map.courseId, r.week, r.lesson_slug);
                      const isNote = savedTab === "notes";
                      const n = r as { note_text?: string | null; highlight_text?: string | null; custom_title?: string | null; bookmark_text?: string | null; note?: string | null };
                      const quote = isNote ? n.highlight_text : n.bookmark_text || n.custom_title;
                      const body = isNote ? n.note_text : n.note;
                      return (
                        <Link key={r.id} href={`/learn/notebook?tab=${savedTab}`} className="flex flex-col gap-1.5 border border-line bg-bg p-3.5 hover:border-line-strong">
                          <span className="font-mono text-[11px] text-fg-3">
                            {m.tag} · {m.title.toUpperCase()}
                          </span>
                          {quote && <span className="line-clamp-2 pl-2.5 text-sm leading-normal text-fg shadow-[inset_2px_0_0_var(--c-signal)]">“{quote}”</span>}
                          {body && <span className="line-clamp-2 text-[13px] text-fg-2">{body}</span>}
                        </Link>
                      );
                    })}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <span className="font-mono text-xs uppercase tracking-label text-fg-3">Notes and bookmarks</span>
                <span className="text-sm leading-normal text-fg-2">Highlights, notes and bookmarks are saved to an account so you can search them in your notebook.</span>
                <button type="button" onClick={openAuthModal} className="min-h-11 self-start border border-line-strong px-4 text-sm text-fg hover:bg-surface-2">
                  Sign in to take notes
                </button>
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
