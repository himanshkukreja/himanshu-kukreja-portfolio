"use client";

import Link from "next/link";
import { useState } from "react";
import { ListPlus } from "lucide-react";
import { MAX_LISTS, progressOf } from "@/lib/dsa/my-lists";
import type { FilterRow } from "@/lib/dsa/problem-filters";
import { BTN_PRIMARY, FILL, MID, TRACK } from "../ui/kit";
import type { MyLists } from "./useMyLists";

/**
 * Practice > My lists: the learner's lists as cards (name, note, solved of total) and a "New list" form. Each card opens the list's
 * own page (/dsa/lists/<id>). Lists stay on this device for guests and follow the account once signed in.
 */

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text";

export default function MyListsHub({ api, rows, solved, onBrowse }: { api: MyLists; rows: Pick<FilterRow, "id" | "level">[]; solved: (id: string) => boolean; onBrowse: () => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState("");
  const level = new Map(rows.map((r) => [r.id, r.level as string]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = api.create(name, desc);
    if (!r.ok) return setErr(r.reason);
    setName("");
    setDesc("");
    setErr("");
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-label="Make a new list">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] text-fg-2">
            List name
            <input value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} maxLength={60} placeholder="e.g. Google prep" autoComplete="off" aria-describedby={err ? "mylists-err" : undefined} aria-invalid={err ? true : undefined} className={`h-11 rounded-[10px] border border-line-strong bg-bg px-3 text-[15px] text-fg placeholder:text-fg-3 ${FOCUS}`} />
          </label>
          <label className="flex min-w-0 flex-[1.4] flex-col gap-1 text-[13px] text-fg-2">
            A note (optional)
            <input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} placeholder="Six weeks, mediums first" autoComplete="off" className={`h-11 rounded-[10px] border border-line-strong bg-bg px-3 text-[15px] text-fg placeholder:text-fg-3 ${FOCUS}`} />
          </label>
          <button type="submit" disabled={!name.trim() || !api.ready} className={`${BTN_PRIMARY} ${MID} self-end disabled:opacity-50 max-sm:w-full`}>
            <ListPlus className="h-4 w-4" aria-hidden /> Make list
          </button>
        </div>
        {err ? (
          <p id="mylists-err" role="alert" className="m-0 text-[13.5px] text-bad-text">
            {err}
          </p>
        ) : null}
      </form>

      {api.ready && !api.lists.length ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-line-strong px-5 py-10">
          <p className="m-0 font-display text-[20px] font-bold text-fg">No lists yet</p>
          <p className="m-0 max-w-[52ch] text-[15px] leading-relaxed text-fg-2">Name a list above, then use the list button on any problem (in the bank, in search, or on its page) to put it in. A problem can sit in as many lists as you like.</p>
          <button type="button" onClick={onBrowse} className={`inline-flex h-11 items-center rounded-[10px] bg-signal px-5 text-[14px] font-semibold text-on-signal ${FOCUS}`}>
            Browse all problems
          </button>
        </div>
      ) : null}

      {api.lists.length ? (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
          {api.lists.map((l) => {
            const p = progressOf(l.ids, (id) => level.get(id), solved);
            return (
              <li key={l.id}>
                <Link href={`/dsa/lists/${l.id}`} className={`flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-4 hover:border-line-strong hover:bg-surface-2 ${FOCUS}`}>
                  <span className="font-display text-[19px] font-bold leading-tight text-fg">{l.name}</span>
                  {l.desc ? <span className="text-[14px] leading-snug text-fg-2">{l.desc}</span> : null}
                  <span className="mt-auto flex items-center gap-3 pt-1 font-mono text-[12px] tabular-nums text-fg-3">
                    <span className={`${TRACK} flex-1`} aria-hidden>
                      <span className={`${FILL} bg-signal`} style={{ width: `${p.total ? Math.round((p.solved / p.total) * 100) : 0}%` }} />
                    </span>
                    {p.solved} of {p.total} solved
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      <section aria-label="How lists work" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h3 className="m-0 text-[16px] font-semibold text-fg">How lists work</h3>
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0 text-[14.5px] leading-snug text-fg-2">
          {[
            ["Add from anywhere.", "The list button next to the bookmark on a problem row, in search results, and on the problem page. One problem can be in many lists."],
            ["Put them in your order.", "Drag the grip on a list page, or focus it and press the up and down arrows. On a phone, use the Up and Down buttons."],
            ["Share or keep going.", "Signed in, copy a read-only link. Whoever opens it can copy the list into their own. Start the next unsolved from the list page."],
          ].map(([h, t], i) => (
            <li key={h} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[12px] text-fg-2" aria-hidden>
                {i + 1}
              </span>
              <span>
                <span className="font-semibold text-fg">{h}</span> {t}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <p className="m-0 font-mono text-[11.5px] text-fg-3">
        {api.lists.length} of {MAX_LISTS} lists · {api.signedIn ? "synced to your account" : "on this device; sign in and they follow your account"}
      </p>
    </div>
  );
}
