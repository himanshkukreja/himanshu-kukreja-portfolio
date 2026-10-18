"use client";

/**
 * Calendar export for the planner page: the .ics download (Apple Calendar, Outlook, Google import)
 * and the per-day Google Calendar links. Builds on src/lib/learn/plan/ics.ts.
 */
import { buildIcs, googleLink, validTz, type IcsDay } from "@/lib/learn/plan/ics";
import { dayTitle, type PlanDay } from "@/lib/learn/plan/schedule";
import { fmtDate, fmtMinutes } from "@/components/learn/progress/derive";
import { track } from "@/lib/track";
import { readExportLog, writeExportLog, type PlanView } from "./usePlan";

export function browserTz(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return validTz(tz) ? tz : null;
  } catch {
    return null;
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** One calendar event for a plan day. */
export function icsDay(day: PlanDay, view: PlanView, origin: string): IcsDay {
  const s = view.settings;
  const planUrl = `${origin}/learn/plan`;
  const first = day.entries[0];
  const lines: string[] = [];
  if (day.type === "buffer") {
    lines.push("A catch-up slot: finish anything you missed this week, or rest. Nothing new is planned.");
  } else {
    lines.push(`${fmtMinutes(day.minutes || s.minutes)} today:`);
    day.entries.forEach((e) => {
      const part = e.part ? ` (part ${e.part[0]} of ${e.part[1]})` : "";
      lines.push(`• ${e.tag} · ${e.title}${part}, ${e.minutes} min → ${origin}${e.href}`);
    });
  }
  lines.push("", `Interview: ${fmtDate(s.target, true)}. Your plan (re-plans itself if you fall behind): ${planUrl}`);
  const tag = day.type === "study" && first ? `${first.tag.replace(/ · /g, " ")} · ` : "";
  const summary = day.type === "buffer" ? "SDM · Catch-up day" : `SDM · ${tag}${dayTitle(day)}`;
  return {
    date: day.date,
    start: s.time,
    minutes: day.minutes || s.minutes,
    summary: clip(summary, 120),
    description: lines.join("\n"),
    url: first && day.type !== "buffer" ? `${origin}${first.href}` : planUrl,
  };
}

/** Days from today on, plus CANCELLED copies of dates this browser exported before that dropped out. */
export function exportDays(view: PlanView, origin: string): { days: IcsDay[]; cancelled: number; seq: number; reexport: boolean } {
  const future = view.live.days.filter((d) => d.date >= view.today);
  const days = future.map((d) => icsDay(d, view, origin));
  const log = readExportLog();
  const same = log && log.planId === view.record.id;
  const keep = new Set(days.map((d) => d.date));
  const dropped = same ? log!.dates.filter((d) => d >= view.today && !keep.has(d)) : [];
  dropped.forEach((date) =>
    days.push({
      date,
      start: view.settings.time,
      minutes: view.settings.minutes,
      summary: "SDM · (removed from your plan)",
      description: `This session moved when your plan was adjusted. Your plan: ${origin}/learn/plan`,
      url: `${origin}/learn/plan`,
      status: "CANCELLED",
    })
  );
  return { days, cancelled: dropped.length, seq: same ? log!.seq + 1 : 0, reexport: !!same };
}

export function downloadIcs(view: PlanView) {
  const origin = window.location.origin;
  const tz = browserTz();
  const { days, cancelled, seq, reexport } = exportDays(view, origin);
  const ics = buildIcs({ planId: view.record.id, days, tz, calName: "System Design Mastery · study plan", now: new Date(), alarm: view.settings.reminder, sequence: seq });
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sdm-study-plan.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  const live = days.filter((d) => d.status !== "CANCELLED").map((d) => d.date);
  const prev = readExportLog();
  const kept = prev && prev.planId === view.record.id ? prev.dates.filter((d) => d < view.today) : [];
  writeExportLog({ planId: view.record.id, seq, dates: [...kept, ...live], at: Date.now() });
  track("plan_export", { format: "ics", days: live.length, cancelled, sequence: seq, reexport, tz: tz ?? "floating", drift: view.drift.status });
  return { days: live.length, cancelled, reexport };
}

export function googleDayLink(day: PlanDay, view: PlanView): string {
  return googleLink(icsDay(day, view, window.location.origin), browserTz());
}
