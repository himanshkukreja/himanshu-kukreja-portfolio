"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ListPlus, ListChecks } from "lucide-react";
import { MAX_LISTS, type MyList } from "@/lib/dsa/my-lists";
import type { MyLists } from "./useMyLists";

/**
 * "Add to list": a small popover from a problem's row (or the problem page's bar) that shows the learner's lists as checkboxes
 * (a problem can be in many) and a "New list" field. It is drawn in a portal inside the page's `.dsa-theme` box (so the theme
 * tokens apply and the bank table's horizontal scroller cannot clip it), positioned from the button, closed by Escape, a click
 * outside or a scroll, and focus returns to the button.
 */

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text";

function Popover({ anchor, problemId, title, api, from, onClose }: { anchor: HTMLElement; problemId: string; title: string; api: MyLists; from: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; w: number } | null>(null);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const id = useId();
  const host = anchor.closest(".dsa-theme") as HTMLElement | null;

  const place = useCallback(() => {
    const r = anchor.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    const h = box.current?.offsetHeight || 220;
    const below = r.bottom + 6 + h <= window.innerHeight - 8 || r.top < h + 14;
    setPos({ w, left, top: below ? r.bottom + 6 : Math.max(8, r.top - h - 6) });
  }, [anchor]);
  useLayoutEffect(() => {
    // the popover's place is measured from the button once it is mounted
    // eslint-disable-next-line react-hooks/set-state-in-effect
    place();
  }, [place, api.lists.length, msg]);

  useEffect(() => {
    const away = (e: Event) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        anchor.focus();
      }
    };
    const scroll = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) place();
    };
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [anchor, onClose, place]);

  useEffect(() => {
    box.current?.querySelector<HTMLElement>("input")?.focus();
  }, []);

  const toggle = (l: MyList) => {
    if (l.ids.includes(problemId)) {
      api.drop(l.id, problemId);
      setMsg(`Removed from ${l.name}.`);
    } else {
      const r = api.add(l.id, problemId, from);
      setMsg(r.ok ? `Added to ${l.name}.` : r.reason);
    }
  };
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const r = api.create(name);
    if (!r.ok) return setMsg(r.reason);
    api.add(r.list.id, problemId, from);
    setName("");
    setMsg(`Made ${r.list.name} and added the problem.`);
  };

  const body = (
    <div
      ref={box}
      role="dialog"
      aria-label={`Add ${title} to a list`}
      style={pos ? { top: pos.top, left: pos.left, width: pos.w } : { visibility: "hidden", top: 0, left: 0, width: 300 }}
      className="fixed z-[70] flex max-h-[min(420px,calc(100dvh-16px))] flex-col gap-2 overflow-y-auto rounded-[14px] border border-line bg-surface p-3 text-fg shadow-lg"
    >
      <p className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">Add to a list</p>
      {api.lists.length ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {api.lists.map((l) => (
            <li key={l.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-[14px] hover:bg-surface-2 md:min-h-10 [@media(pointer:coarse)]:md:min-h-11">
                <input type="checkbox" checked={l.ids.includes(problemId)} onChange={() => toggle(l)} className={`h-4 w-4 shrink-0 accent-[var(--c-signal)] ${FOCUS}`} />
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <span className="font-mono text-[11px] tabular-nums text-fg-3">{l.ids.length}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13.5px] leading-snug text-fg-2">You have no lists yet. Name one and this problem goes straight in.</p>
      )}
      {api.lists.length < MAX_LISTS ? (
        <form onSubmit={create} className="flex flex-col gap-2 border-t border-line pt-2">
          <label htmlFor={`${id}-n`} className="font-mono text-[11px] uppercase tracking-label text-fg-3">
            New list
          </label>
          <div className="flex gap-2">
            <input
              id={`${id}-n`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Google prep"
              autoComplete="off"
              className={`h-11 min-w-0 flex-1 rounded-[10px] border border-line-strong bg-bg px-3 text-[14px] text-fg placeholder:text-fg-3 ${FOCUS}`}
            />
            <button type="submit" disabled={!name.trim()} className={`h-11 shrink-0 rounded-[10px] bg-signal px-3 text-[14px] font-semibold text-on-signal disabled:opacity-50 ${FOCUS}`}>
              Create
            </button>
          </div>
        </form>
      ) : (
        <p className="m-0 border-t border-line pt-2 text-[12.5px] text-fg-3">You have {MAX_LISTS} lists, the most you can keep.</p>
      )}
      <p role="status" aria-live="polite" className="m-0 min-h-[1em] font-mono text-[12px] text-fg-2">
        {msg}
      </p>
    </div>
  );
  return createPortal(body, host || document.body);
}

type Props = { problemId: string; title: string; api: MyLists; /** the problem is in at least one list */ inAny: boolean; from?: string; /** "icon": the bank's 44 px square; "bar": icon and label for the problem page */ variant?: "icon" | "bar" };

export default function AddToList({ problemId, title, api, inAny, from = "bank", variant = "icon" }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const Icon = inAny ? ListChecks : ListPlus;
  const cls =
    variant === "bar"
      ? `inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-line px-3 text-[14px] font-medium hover:bg-surface-2 [@media(pointer:coarse)]:min-h-11 ${inAny ? "text-signal-text" : "text-fg"} ${FOCUS}`
      : `grid h-11 w-11 place-items-center md:h-9 [@media(pointer:coarse)]:md:h-11 ${inAny ? "text-signal-text" : "text-fg-3 hover:text-fg"} ${FOCUS} focus-visible:-outline-offset-2`;
  return (
    <>
      <button type="button" onClick={(e) => setAnchor(anchor ? null : e.currentTarget)} aria-haspopup="dialog" aria-expanded={!!anchor} aria-label={`${inAny ? "Lists for" : "Add to a list:"} ${title}`} className={cls}>
        <Icon className="h-4 w-4" aria-hidden />
        {variant === "bar" ? <span className="hidden sm:inline">Add to list</span> : null}
      </button>
      {anchor ? <Popover anchor={anchor} problemId={problemId} title={title} api={api} from={from} onClose={close} /> : null}
    </>
  );
}
