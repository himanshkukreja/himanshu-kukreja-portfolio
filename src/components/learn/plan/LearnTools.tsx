"use client";

/** Course hub: the two prep tools (study planner, numbers playground). */
import Link from "next/link";
import { daysBetween } from "@/lib/learn/plan/schedule";
import { fmtDate } from "@/components/learn/progress/derive";
import { usePlanRecord, useToday } from "./usePlan";

export default function LearnTools() {
  const today = useToday();
  const { record } = usePlanRecord();
  const left = record && today ? daysBetween(today, record.settings.target) : null;
  return (
    <section aria-label="Interview prep tools" className="grid gap-2 sm:grid-cols-2">
      <Link href="/learn/plan" className="flex flex-col gap-1.5 border border-line-strong bg-surface p-4 hover:border-fg-4 sm:p-5">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">study planner</span>
        <span className="font-display text-[22px] font-bold leading-[1.1] tracking-[-0.02em] text-fg">
          {record && left !== null ? (left > 0 ? `Interview in ${left} days` : "Your plan") : "Plan to your interview date"}
        </span>
        <span className="text-[14px] text-fg-3">{record ? `Day-by-day to ${fmtDate(record.settings.target, true)}, adjusted to your progress. Open today's session →` : "A day-by-day plan with revision days and a calendar file. Adjusts if you fall behind →"}</span>
      </Link>
      <Link href="/learn/numbers" className="flex flex-col gap-1.5 border border-line-strong bg-surface p-4 hover:border-fg-4 sm:p-5">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">numbers playground</span>
        <span className="font-display text-[22px] font-bold leading-[1.1] tracking-[-0.02em] text-fg">50k QPS × 2 KB × 30 days = ?</span>
        <span className="text-[14px] text-fg-3">Latency, throughput and size numbers, with a calculator that shows the working →</span>
      </Link>
    </section>
  );
}
