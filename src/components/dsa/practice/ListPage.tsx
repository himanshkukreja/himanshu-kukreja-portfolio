"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Link2, Pencil, Play, Trash2 } from "lucide-react";
import DsaCrumbs from "../DsaCrumbs";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { encodeShare, MAX_PROBLEMS, nextUnsolved, progressOf } from "@/lib/dsa/my-lists";
import type { ProblemData } from "@/lib/dsa/problem-rows";
import { BTN_PRIMARY, BTN_SECONDARY, FILL, MID, TRACK } from "../ui/kit";
import { useDsaProgress } from "../progress/useDsaProgress";
import { useTried } from "./FilterGroups";
import { ProblemTable } from "./ProblemTable";
import { useMyLists } from "./useMyLists";
import { useSavedProblems } from "./useSavedProblems";
import type { Status } from "@/lib/dsa/problem-filters";

/**
 * /dsa/lists/<id>: one of the learner's lists. Progress (solved of total, easy/medium/hard), "Start the next unsolved", the
 * bank's own row style with reorder (drag, or the arrow keys on the grip, or Up/Down on a phone) and remove, rename and delete,
 * and for a signed-in learner a read-only share link (the list is encoded into the link; src/lib/dsa/my-lists.ts).
 */

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text";
const FIELD = `h-11 rounded-[10px] border border-line-strong bg-bg px-3 text-[15px] text-fg placeholder:text-fg-3 ${FOCUS}`;

export default function ListPage({ id, data }: { id: string; data: ProblemData }) {
  const api = useMyLists();
  const list = api.get(id);
  const progress = useDsaProgress();
  const tried = useTried();
  const saved = useSavedProblems();
  const { openAuthModal } = useAuthModal();
  const byId = useMemo(() => new Map(data.rows.map((r) => [r.id, r])), [data.rows]);
  const solved = (pid: string) => progress.solved.has(pid);
  const statusOf = (pid: string): Status => (progress.solved.has(pid) ? "solved" : tried.has(pid) ? "tried" : "todo");

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const editRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) nameRef.current?.focus();
  }, [editing]);

  // the share link follows the list while it is shown
  const ids = list?.ids;
  const lname = list?.name;
  const ldesc = list?.desc;
  useEffect(() => {
    let live = true;
    if (!link || !lname) return;
    encodeShare({ name: lname, desc: ldesc || "", ids: ids || [] }).then((code) => live && setLink(`${window.location.origin}/dsa/lists/shared#${code}`));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, lname, ldesc]);

  if (!api.ready) return <div aria-busy="true" aria-label="Loading your list" className="h-[240px] animate-pulse rounded-2xl bg-surface-2" />;
  if (!list) {
    return (
      <div className="flex flex-col gap-4">
        <DsaCrumbs items={[{ href: "/dsa/practice", label: "Practice" }, { href: "/dsa/practice?list=my-lists", label: "My lists" }, { label: "Not found" }]} />
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-line-strong px-5 py-10">
          <h1 className="m-0 font-display text-[24px] font-extrabold text-fg">This list isn&apos;t here</h1>
          <p className="m-0 max-w-[56ch] text-[15px] leading-relaxed text-fg-2">Lists live on the device where you made them until you sign in, and then they follow your account. It may have been deleted, or it was made on another device while signed out.</p>
          <Link href="/dsa/practice?list=my-lists" className={`${BTN_PRIMARY} ${MID}`}>
            Back to My lists
          </Link>
        </div>
      </div>
    );
  }

  const rows = list.ids.map((pid) => byId.get(pid)).filter((r): r is NonNullable<typeof r> => !!r);
  const missing = list.ids.length - rows.length;
  const p = progressOf(list.ids, (pid) => byId.get(pid)?.level, solved);
  const next = nextUnsolved(list.ids, (pid) => byId.has(pid), solved);
  const nextRow = next ? byId.get(next) : null;
  const pct = p.total ? Math.round((p.solved / p.total) * 100) : 0;

  const startEdit = () => {
    setName(list.name);
    setDesc(list.desc);
    setErr("");
    setEditing(true);
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const r = api.rename(list.id, name, desc);
    if (!r.ok) return setErr(r.reason);
    setEditing(false);
    requestAnimationFrame(() => editRef.current?.focus());
  };
  const share = async () => {
    if (!api.signedIn) return openAuthModal();
    const code = await encodeShare({ name: list.name, desc: list.desc, ids: list.ids });
    setLink(`${window.location.origin}/dsa/lists/shared#${code}`);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* the field is selectable for a manual copy */
    }
  };
  const del = () => {
    api.remove(list.id);
    window.location.assign("/dsa/practice?list=my-lists");
  };

  return (
    <div className="flex flex-col gap-5">
      <DsaCrumbs items={[{ href: "/dsa/practice", label: "Practice" }, { href: "/dsa/practice?list=my-lists", label: "My lists" }, { label: list.name }]} />

      <header className="flex flex-col gap-3">
        {editing ? (
          <form onSubmit={save} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4" aria-label="Rename this list">
            <label className="flex flex-col gap-1 text-[13px] text-fg-2">
              List name
              <input ref={nameRef} value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} maxLength={60} className={FIELD} aria-invalid={err ? true : undefined} aria-describedby={err ? "list-err" : undefined} />
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-fg-2">
              A note (optional)
              <input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} className={FIELD} />
            </label>
            {err ? (
              <p id="list-err" role="alert" className="m-0 text-[13.5px] text-bad-text">
                {err}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={!name.trim()} className={`${BTN_PRIMARY} ${MID} disabled:opacity-50`}>
                Save
              </button>
              <button type="button" onClick={() => { setEditing(false); editRef.current?.focus(); }} className={`${BTN_SECONDARY} ${MID}`}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <h1 className="m-0 min-w-0 break-words font-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[40px]">{list.name}</h1>
              <div className="flex flex-wrap gap-2">
                <button ref={editRef} type="button" onClick={startEdit} className={`${BTN_SECONDARY} ${MID}`}>
                  <Pencil className="h-4 w-4" aria-hidden /> Rename
                </button>
                <button type="button" onClick={() => setConfirmDelete(true)} className={`${BTN_SECONDARY} ${MID}`} aria-haspopup="dialog">
                  <Trash2 className="h-4 w-4" aria-hidden /> Delete
                </button>
              </div>
            </div>
            {list.desc ? <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-fg-2">{list.desc}</p> : null}
          </>
        )}

        {confirmDelete ? (
          <div role="alertdialog" aria-label={`Delete ${list.name}?`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line-strong bg-surface p-4">
            <p className="m-0 min-w-0 flex-1 text-[14.5px] text-fg">Delete &ldquo;{list.name}&rdquo;? The problems stay in the bank; only this list goes.</p>
            <button type="button" autoFocus onClick={del} className={`${BTN_PRIMARY} ${MID}`}>
              Delete list
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className={`${BTN_SECONDARY} ${MID}`}>
              Keep it
            </button>
          </div>
        ) : null}

        <section aria-label="Progress" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-[15px] text-fg">
              <span className="font-display text-[26px] font-extrabold tabular-nums">{progress.ready ? p.solved : "–"}</span>
              <span className="text-fg-2"> of {p.total} solved</span>
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] tabular-nums text-fg-2" aria-label="Difficulty split">
              <span><span className="text-ok-text">Easy</span> {p.solvedByLevel.easy}/{p.easy}</span>
              <span><span className="text-amber">Medium</span> {p.solvedByLevel.medium}/{p.medium}</span>
              <span><span className="text-bad-text">Hard</span> {p.solvedByLevel.hard}/{p.hard}</span>
            </div>
          </div>
          <span className={TRACK} role="progressbar" aria-label="Solved in this list" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={progress.ready ? p.solved : 0}>
            <span className={`${FILL} bg-signal`} style={{ width: `${progress.ready ? pct : 0}%` }} />
          </span>
          <div className="flex flex-wrap items-center gap-3">
            {nextRow ? (
              <Link href={`/dsa/problems/${nextRow.id}`} className={`${BTN_PRIMARY} ${MID} max-sm:w-full`}>
                <Play className="h-4 w-4 fill-current" aria-hidden /> Start the next unsolved
                <span className="sr-only">: {nextRow.title}</span>
              </Link>
            ) : p.total ? (
              <span className="inline-flex items-center gap-2 text-[14.5px] font-medium text-ok-text">
                <Check className="h-4 w-4" aria-hidden /> Every problem here is solved.
              </span>
            ) : null}
            {nextRow ? <span className="min-w-0 truncate text-[13.5px] text-fg-3">Next: {nextRow.title}</span> : null}
          </div>
        </section>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={share} className={`${BTN_SECONDARY} ${MID}`} aria-expanded={!!link}>
              <Link2 className="h-4 w-4" aria-hidden /> {api.signedIn ? "Share a read-only link" : "Sign in to share"}
            </button>
            <span className="font-mono text-[12px] text-fg-3">
              {list.ids.length} of {MAX_PROBLEMS} problems
            </span>
          </div>
          {link ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3 sm:flex-row sm:items-center">
              <label className="sr-only" htmlFor="share-link">
                Read-only link to this list
              </label>
              <input id="share-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={`${FIELD} min-w-0 flex-1 font-mono text-[12px]`} />
              <button type="button" onClick={copy} className={`${BTN_PRIMARY} ${MID}`}>
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? "Copied" : "Copy link"}
              </button>
              <span role="status" aria-live="polite" className="sr-only">
                {copied ? "Link copied" : ""}
              </span>
            </div>
          ) : null}
          {link ? <p className="m-0 font-mono text-[11.5px] text-fg-3">Anyone with the link sees this list as it is now and can copy it. They can&apos;t change yours. Share again after you edit.</p> : null}
        </div>
      </header>

      {rows.length ? (
        <ProblemTable rows={rows} d={data} statusOf={statusOf} isSaved={saved.isSaved} onSave={saved.toggle} myLists={api} manage={{ onMove: (from, to) => api.move(list.id, from, to), onRemove: (pid) => api.drop(list.id, pid) }} />
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-line-strong px-5 py-10">
          <p className="m-0 font-display text-[20px] font-bold text-fg">Nothing in this list yet</p>
          <p className="m-0 max-w-[52ch] text-[15px] leading-relaxed text-fg-2">Open the bank and press the list button on a problem to put it here.</p>
          <Link href="/dsa/practice" className={`${BTN_PRIMARY} ${MID}`}>
            Browse problems
          </Link>
        </div>
      )}
      {missing > 0 ? <p className="m-0 font-mono text-[12px] text-fg-3">{missing} saved problem{missing === 1 ? " is" : "s are"} not in the bank right now and {missing === 1 ? "is" : "are"} hidden.</p> : null}
    </div>
  );
}
