"use client";

import ActivityShell from "./ActivityShell";
import { ChoiceStep, ClassifyStep, OrderStep } from "./kit";
import type { ActivityProps } from "./registry";
import type { ActivityDef } from "./types";

function Cluster() {
  const nodes = [
    { name: "Leader · US-East", state: "UNRESPONSIVE", lag: "—", dead: true },
    { name: "Follower 1 · US-West", state: "sync follower", lag: "0.2 s" },
    { name: "Follower 2 · Europe", state: "async follower", lag: "2.6 s" },
    { name: "Follower 3 · US-East", state: "async follower", lag: "1.1 s" },
  ];
  return (
    <div className="border border-line-strong bg-bg">
      <div className="border-b border-line px-3 py-2 font-mono text-[11px] text-fg-3">streamflix-db · 02:00 · Black Friday</div>
      <ul className="m-0 grid list-none gap-px bg-line p-0 sm:grid-cols-2">
        {nodes.map((n) => (
          <li key={n.name} className="flex flex-col gap-1 bg-bg px-3 py-2.5">
            <span className={`font-mono text-[12.5px] font-semibold ${n.dead ? "text-bad-text line-through" : "text-fg"}`}>{n.name}</span>
            <span className="font-mono text-[11.5px] text-fg-3">
              {n.state} · replication lag <span className={n.dead ? "" : "text-fg"}>{n.lag}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DEF: ActivityDef = {
  kind: "timeline",
  title: "Failover drill",
  blurb:
    "2 AM, Black Friday, and StreamFlix's leader just went dark. Pick the follower to promote, put the failover dance in order, route five kinds of writes, and keep split-brain away.",
  minutes: 2,
  steps: [
    {
      id: "promote",
      label: "Promote a follower",
      max: 1,
      render: (ctx) => (
        <div className="flex flex-col gap-4">
          <Cluster />
          <ChoiceStep
            ctx={ctx}
            prompt="All writes have halted. Which follower do you promote to leader?"
            options={["Follower 1 · US-West (0.2 s behind)", "Follower 2 · Europe (2.6 s behind)", "Follower 3 · US-East (1.1 s behind)", "Wait for the old leader to come back"]}
            answer={0}
            explain="The election picks the most up-to-date follower: the smallest replication lag loses the fewest recent writes. Waiting keeps every signup, purchase and profile update down for as long as the leader is gone."
          />
        </div>
      ),
    },
    {
      id: "order",
      label: "The failover dance",
      max: 5,
      render: (ctx) => (
        <OrderStep
          ctx={ctx}
          seed="streamflix-failover"
          prompt="Put the failover dance in order."
          items={[
            { id: "detect", text: "Detection: monitoring sees the leader unresponsive", note: "10–30 seconds" },
            { id: "elect", text: "Election: choose the most up-to-date follower" },
            { id: "promote", text: "Promotion: that follower becomes write-capable" },
            { id: "redirect", text: "Traffic redirection: apps point at the new leader" },
            { id: "reconcile", text: "Data reconciliation: other followers sync to it" },
          ]}
        />
      ),
    },
    {
      id: "route",
      label: "Sync or async?",
      max: 5,
      render: (ctx) => (
        <ClassifyStep
          ctx={ctx}
          prompt="The hybrid approach: how should each write replicate?"
          buckets={[
            { id: "sync", label: "Synchronous", hint: "wait for the follower" },
            { id: "semi", label: "Semi-synchronous", hint: "balance of both" },
            { id: "async", label: "Asynchronous", hint: "reply now, copy later" },
          ]}
          items={[
            {
              label: "payment",
              text: "A $9.99 Premium purchase",
              bucket: "sync",
              explain: "Payments can't be lost: the write only completes once the follower acknowledges it. Zero data loss if the leader dies.",
            },
            {
              label: "history",
              text: "Your “continue watching” position",
              bucket: "async",
              explain: "Slightly stale viewing history is annoying, not catastrophic, so it replicates asynchronously and the write returns immediately.",
            },
            {
              label: "auth",
              text: "User authentication data",
              bucket: "semi",
              explain: "StreamFlix runs authentication semi-synchronously: a balance between safety and latency.",
            },
            {
              label: "subscription",
              text: "Upgrading a subscription plan",
              bucket: "sync",
              explain: "Subscription changes sit with payments: money is involved, so synchronous.",
            },
            {
              label: "prefs",
              text: "Updated recommendation preferences",
              bucket: "async",
              explain: "Preferences and recommendations favour performance: asynchronous, and slow followers never block writes.",
            },
          ]}
        />
      ),
    },
    {
      id: "split",
      label: "Split-brain",
      max: 1,
      render: (ctx) => (
        <ChoiceStep
          ctx={ctx}
          prompt="A network partition, not a crash. The old leader is alive on its side and the promoted follower takes writes on the other. What prevents two leaders?"
          options={[
            "A shorter replication lag alert (under 5 seconds).",
            "Fence the old leader, with witness nodes deciding who is primary.",
            "Hourly incremental backups.",
            "Switching every follower to asynchronous replication.",
          ]}
          answer={1}
          explain="The story's split-brain disaster ended in conflicting writes, data corruption and a 4-hour recovery. Proper fencing (the old leader can't accept writes) plus witness nodes keeps it to one writer."
        />
      ),
    },
  ],
};

export default function FailoverDrill({ slug, caseId }: ActivityProps) {
  return <ActivityShell slug={slug} caseId={caseId} def={DEF} />;
}
