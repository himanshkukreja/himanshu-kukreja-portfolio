"use client";

/**
 * "Choose people" for the Custom list audience: everyone an email could go to (accounts, then newsletter
 * subscribers), searchable and filterable, with a checkbox each. The pasted address list stays the source
 * of truth: ticking someone adds their address to it, unticking removes it, so sending works as before.
 * Unsubscribed and bounced people are shown but can't be picked (the sender skips them anyway).
 */
import { useMemo, useState } from "react";
import { LABEL, fmtNum, useAdminData } from "@/components/admin/ui";
import { inputCls } from "@/components/admin/content/common";
import type { PickPerson } from "@/lib/campaigns/types";
import { Note, cx } from "./bits";

type Filter = "all" | "learners" | "never" | "subscribers";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "everyone" },
  { id: "learners", label: "started learning" },
  { id: "never", label: "never started" },
  { id: "subscribers", label: "subscribers only" },
];

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
/** the addresses in the pasted list, lower-cased, in order */
const parseList = (raw: string) => raw.split(/[\s,;]+/).map((s) => s.replace(/^<|>$/g, "").trim().toLowerCase()).filter((s) => EMAIL_RE.test(s));

function ago(ms: number): string {
  if (!ms) return "never active";
  const d = Math.floor((Date.now() - ms) / 86400_000);
  return d <= 0 ? "active today" : d === 1 ? "active yesterday" : d < 60 ? `active ${d}d ago` : `active ${Math.floor(d / 30)}mo ago`;
}

export default function PeoplePicker({ emails, onChange, readOnly }: { emails: string; onChange: (emails: string) => void; readOnly?: boolean }) {
  const { data, error, loading } = useAdminData<{ people: PickPerson[] }>("/api/admin/newsletter/people");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const picked = useMemo(() => new Set(parseList(emails)), [emails]);
  const people = useMemo(() => data?.people ?? [], [data]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return people.filter((p) => {
      if (filter === "learners" && (p.kind !== "account" || p.neverStarted)) return false;
      if (filter === "never" && (p.kind !== "account" || !p.neverStarted)) return false;
      if (filter === "subscribers" && p.kind !== "subscriber") return false;
      return !term || p.email.includes(term) || (p.name || "").toLowerCase().includes(term);
    });
  }, [people, q, filter]);

  /** writes the new selection back as one address per line, keeping any typed addresses not in the list */
  const write = (next: Set<string>) => {
    const known = new Set(people.map((p) => p.email));
    const extra = parseList(emails).filter((e) => !known.has(e) && next.has(e));
    const ordered = [...people.filter((p) => next.has(p.email)).map((p) => p.email), ...extra];
    onChange([...new Set(ordered)].join("\n"));
  };
  const toggle = (email: string) => {
    const next = new Set(picked);
    if (next.has(email)) next.delete(email);
    else next.add(email);
    write(next);
  };
  const pickable = shown.filter((p) => !p.blocked);
  const allShownPicked = pickable.length > 0 && pickable.every((p) => picked.has(p.email));
  const setShown = (on: boolean) => {
    const next = new Set(picked);
    for (const p of pickable) {
      if (on) next.add(p.email);
      else next.delete(p.email);
    }
    write(next);
  };

  return (
    <div className="flex flex-col gap-2 border border-line">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-2">
        <input className={`${inputCls} max-w-[280px] flex-1`} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search name or email" aria-label="Search people" />
        <div role="radiogroup" aria-label="Filter people" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cx("min-h-8 border px-2 font-mono text-[11px]", filter === f.id ? "border-signal text-signal-text" : "border-line text-fg-3 hover:text-fg")}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-xs text-fg-3">
          <span className="text-fg">{fmtNum(picked.size)}</span> picked
        </span>
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3 px-2 font-mono text-xs">
          <button type="button" className="text-signal-text hover:underline disabled:opacity-40" disabled={!pickable.length || allShownPicked} onClick={() => setShown(true)}>
            select all {q || filter !== "all" ? "shown" : ""} ({fmtNum(pickable.length)})
          </button>
          <button type="button" className="text-fg-3 hover:text-fg hover:underline disabled:opacity-40" disabled={!pickable.some((p) => picked.has(p.email))} onClick={() => setShown(false)}>
            clear {q || filter !== "all" ? "shown" : "all"}
          </button>
        </div>
      )}

      {error && <Note tone="bad" title="couldn't load people" className="mx-2">{error.message}</Note>}
      <ul role="list" aria-label="People" aria-busy={loading} className="m-0 max-h-[360px] list-none overflow-y-auto p-0">
        {loading && !data && <li className="px-3 py-4 font-mono text-xs text-fg-3">loading people…</li>}
        {data && !shown.length && <li className="px-3 py-4 font-mono text-xs text-fg-3">nobody matches</li>}
        {shown.map((p) => {
          const on = picked.has(p.email);
          const disabled = readOnly || !!p.blocked;
          return (
            <li key={p.email} className="border-t border-line first:border-t-0">
              <label className={cx("flex min-h-12 items-center gap-3 px-3 py-2", disabled ? "opacity-55" : "cursor-pointer hover:bg-surface-2")}>
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--c-signal)]" checked={on} disabled={disabled} onChange={() => toggle(p.email)} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-fg">{p.name || p.email}</span>
                  {p.name && <span className="truncate font-mono text-xs text-fg-3">{p.email}</span>}
                </span>
                <span className="shrink-0 text-right font-mono text-[11px] leading-tight text-fg-3">
                  {p.blocked ? (
                    <span className="text-bad-text">{p.blocked}</span>
                  ) : p.kind === "subscriber" ? (
                    "subscriber"
                  ) : (
                    <>
                      {p.neverStarted ? "never started" : `${fmtNum(p.completed)} lessons`}
                      <br />
                      {ago(p.lastActivity)}
                    </>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className={`${LABEL} m-0 px-2 pb-2`}>
        {fmtNum(people.length)} people · ticking adds them to the address list below
      </p>
    </div>
  );
}
