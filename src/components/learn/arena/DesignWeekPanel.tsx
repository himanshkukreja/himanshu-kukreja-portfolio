"use client";

/** Arena: this week's design challenge (phase, title, designs in), from the public summary endpoint. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { PHASE_LABEL } from "@/lib/design-week/core";
import type { HubSummary } from "@/lib/design-week/views";
import { useOffline } from "@/components/offline/OfflineProvider";
import { LABEL } from "./ui";

type Dow = { state: "loading" } | { state: "error" } | { state: "ok"; data: HubSummary };

export default function DesignWeekPanel() {
  const { offline } = useOffline();
  const [dow, setDow] = useState<Dow>({ state: "loading" });
  useEffect(() => {
    if (offline) return;
    let off = false;
    fetch("/api/learn/design-week/summary")
      .then((r) => (r.ok ? (r.json() as Promise<HubSummary>) : null))
      .then((d) => {
        if (!off) setDow(d ? { state: "ok", data: d } : { state: "error" });
      })
      .catch(() => {
        if (!off) setDow({ state: "error" });
      });
    return () => {
      off = true;
    };
  }, [offline]);

  const c = dow.state === "ok" ? dow.data.current : null;
  const phase = offline ? "needs a connection" : dow.state === "loading" ? "…" : c ? PHASE_LABEL[c.phase].toLowerCase() : "coming soon";
  const pitch = c
    ? c.phase === "open"
      ? "Submissions are open: write your design in markdown with Mermaid diagrams. Designs stay private until the gallery opens."
      : c.phase === "voting"
        ? "The gallery is open: vote for the designs you'd hire. Winners are featured with their profile."
        : "Read the brief, then the designs the community submitted."
    : "A new system design problem every Monday. Submit your design, vote on everyone else's, get featured.";
  return (
    <Link href="/learn/design-week" className="flex flex-wrap items-center justify-between gap-4 border border-line bg-surface px-5 py-4 hover:border-fg-4 sm:px-6">
      <span className="flex min-w-0 flex-[1_1_420px] flex-col gap-1">
        <span className={LABEL}>design of the week · {phase}</span>
        <span className="text-[17px] font-semibold text-fg">{c ? c.title : "One open problem a week"}</span>
        <span className="text-[14px] text-fg-3">{pitch}</span>
      </span>
      <span className="font-mono text-sm text-signal-text">
        {c && c.phase !== "upcoming" ? `${c.submitted} design${c.submitted === 1 ? "" : "s"} in · ` : ""}
        {c?.phase === "voting" ? "vote" : c?.phase === "open" ? "submit" : "open"} →
      </span>
    </Link>
  );
}
