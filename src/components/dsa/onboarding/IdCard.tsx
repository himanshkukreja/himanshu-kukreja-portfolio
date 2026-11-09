"use client";

import UserAvatar from "@/components/avatar/UserAvatar";
import { DsaMark } from "../DsaMark";

export type IdFields = {
  name: string;
  avatar: string | null;
  no: string;
  topics: number | null;
  start: string | null;
  pace: string | null;
  goal: string | null;
  level: string | null;
};

/**
 * The DSA Mastery learner card: a dark plate (like the lecture screens, dark in every theme) with the learner's name and
 * avatar, and rows that fill in as the onboarding goes ("—" until then). Square edges, mono labels, teal strip.
 */
export default function IdCard({ f, compact = false }: { f: IdFields; compact?: boolean }) {
  const rows: [string, string | null][] = [
    ["Topics", f.topics === null ? null : `${f.topics} of 12 known`],
    ["Starting point", f.start],
    ["Pace", f.pace],
    ["Goal", f.goal],
    ["Level", f.level],
  ];
  return (
    <figure
      aria-label={`DSA Mastery learner card for ${f.name || "you"}`}
      className="relative m-0 flex w-full max-w-[420px] flex-col overflow-hidden border border-[var(--c-plate-fg-2)]/30 bg-[var(--c-plate)] text-[var(--c-plate-fg)] shadow-[8px_8px_0_var(--c-signal)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--c-plate-fg-2)]/25 px-4 py-2.5">
        <span className="inline-flex items-center gap-2 font-display text-[15px] font-extrabold tracking-[-0.02em]">
          <DsaMark className="h-6 w-6" />
          DSA Mastery<span className="text-[var(--c-plate-accent)]">.</span>
        </span>
        <span className="font-mono text-[10.5px] uppercase tracking-label text-[var(--c-plate-fg-2)]">Learner card</span>
      </div>
      <div className={`flex items-center gap-4 px-4 ${compact ? "py-3" : "py-4"}`}>
        <UserAvatar src={f.avatar} name={f.name} size={compact ? 52 : 68} initialsClassName="bg-[var(--c-signal)] text-[var(--c-on-signal)]" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-display text-[24px] font-extrabold leading-[1.05] tracking-[-0.03em]">{f.name || "New learner"}</span>
          <span className="font-mono text-[11px] text-[var(--c-plate-fg-2)]">No. {f.no}</span>
        </div>
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-[var(--c-plate-fg-2)]/25 px-4 py-3">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-mono text-[10.5px] uppercase leading-[1.7] tracking-label text-[var(--c-plate-fg-2)]">{k}</dt>
            <dd key={v ?? "empty"} className={`m-0 text-[13.5px] leading-snug ${v ? "ob-card-in text-[var(--c-plate-fg)]" : "text-[var(--c-plate-fg-2)]"}`}>
              {v ?? <span aria-label="not filled in yet">· · ·</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div aria-hidden className="h-2 bg-[var(--c-signal)]" />
    </figure>
  );
}
