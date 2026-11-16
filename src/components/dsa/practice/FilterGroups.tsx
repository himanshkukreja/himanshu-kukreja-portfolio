"use client";

import { useEffect, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import type { FilterState, GroupId, Status } from "@/lib/dsa/problem-filters";
import type { GroupDef } from "../problems/problem-options";

/** The filter pieces Practice shares between its inline menus, its "More filters" panel and the phone sheet (moved from the old problem browser; behaviour unchanged). */

export function Group({ def, state, counts, base, onToggle, bare = false }: { bare?: boolean; def: GroupDef; state: FilterState; counts: Map<string, number>; base: Map<string, number> | null; onToggle: (g: GroupId, v: string) => void }) {
  const selected = state.sel[def.id];
  const [open, setOpen] = useState(def.open || selected.length > 0);
  const [all, setAll] = useState(false);
  // options nothing in the whole bank has are left out (they appear on their own once content arrives)
  const options = def.options.filter((o) => def.id === "status" || def.id === "level" || def.id === "kind" || def.id === "time" || (base?.get(o.id) || 0) > 0 || selected.includes(o.id));
  if (!options.length) return null;
  const visible = all ? options : options.filter((o, i) => i < def.max || selected.includes(o.id));
  const hidden = options.length - visible.length;
  const panel = `fg-${def.id}`;
  const shown = bare || open;
  return (
    <section className={bare ? "py-1" : "border-b border-line py-1"}>
      {bare ? null : (
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full items-center justify-between gap-2 text-left font-mono text-[12px] font-semibold uppercase tracking-label text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text"
        >
          <span>
            {def.title}
            {selected.length ? <span className="ml-2 bg-signal px-1.5 py-0.5 text-[11px] text-on-signal">{selected.length}</span> : null}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-fg-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </h3>
      )}
      {shown ? (
        <div id={panel} className="flex flex-col pb-2">
          {visible.map((o) => {
            const on = selected.includes(o.id);
            const n = counts.get(o.id) || 0;
            const dead = n === 0 && !on;
            return (
              <label
                key={o.id}
                className={`flex min-h-10 cursor-pointer items-center gap-3 px-1 text-[14px] hover:bg-surface-2 lg:min-h-9 ${dead ? "text-fg-3" : "text-fg"} has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal-text`}
              >
                <input type="checkbox" checked={on} onChange={() => onToggle(def.id, o.id)} className="peer sr-only" />
                <span aria-hidden className="grid h-[18px] w-[18px] shrink-0 place-items-center border-2 border-line-strong peer-checked:border-signal peer-checked:bg-signal">
                  {on ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="text-on-signal">
                      <path d="M4 12.5l5 5L20 6.5" />
                    </svg>
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 leading-snug">
                  {o.label}
                  {o.hint ? <span className="block font-mono text-[11px] text-fg-3">{o.hint}</span> : null}
                </span>
                <span className="font-mono text-[12px] tabular-nums text-fg-3" aria-label={`${n} problems`}>
                  {n}
                </span>
              </label>
            );
          })}
          {hidden > 0 || all ? (
            <button type="button" onClick={() => setAll(!all)} className="min-h-10 self-start px-1 font-mono text-[12px] text-signal-text underline decoration-line-strong underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text">
              {all ? "Show fewer" : `Show all ${options.length}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * The problems with a published solution video (GET /api/dsa/problem-videos), fetched once the page is interactive:
 * the page itself carries none, since working them out takes every problem's solution and media. null until it arrives;
 * empty when it can't be had (no row shows a video mark).
 */
export function useVideoIds(): Set<string> | null {
  const [ids, setIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    fetch("/api/dsa/problem-videos", { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ids?: unknown } | null) => setIds(new Set(Array.isArray(j?.ids) ? j.ids.filter((x): x is string => typeof x === "string") : [])))
      .catch(() => {
        if (!ctl.signal.aborted) setIds(new Set());
      });
    return () => ctl.abort();
  }, []);
  return ids;
}

/** "Tried" on this device: a problem with a submission history or failed runs saved by the problem room, and not solved. */
export function useTried(): Set<string> {
  const [tried, setTried] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const t = new Set<string>();
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i) || "";
        const m = k.match(/^dsa\.(?:history|fails)\.(.+)$/);
        if (!m) continue;
        const v = window.localStorage.getItem(k) || "";
        if (v && v !== "[]" && v !== "0") t.add(m[1]);
      }
      // device state, readable only after hydration
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTried(t);
    } catch {
      /* storage blocked: no "Tried" */
    }
  }, []);
  return tried;
}

export function Chip({ label, remove, onRemove }: { label: string; remove: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter ${remove}`}
      className="inline-flex min-h-10 items-center gap-2 border border-signal bg-surface px-3 font-mono text-[12px] text-fg hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text"
    >
      {label}
      <X className="h-3.5 w-3.5 text-fg-3" aria-hidden />
    </button>
  );
}
