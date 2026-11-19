"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import DsaCrumbs from "../DsaCrumbs";
import { decodeShare, progressOf, type SharedList } from "@/lib/dsa/my-lists";
import type { ProblemData } from "@/lib/dsa/problem-rows";
import type { Status } from "@/lib/dsa/problem-filters";
import { BTN_PRIMARY, MID } from "../ui/kit";
import { useDsaProgress } from "../progress/useDsaProgress";
import { useTried } from "./FilterGroups";
import { ProblemTable } from "./ProblemTable";
import { useMyLists } from "./useMyLists";
import { useSavedProblems } from "./useSavedProblems";

/**
 * /dsa/lists/shared#<code>: a list someone shared, read-only. The list is in the link (after the #, so it never reaches a server);
 * "Copy to my lists" makes the viewer a list of their own.
 */

export default function SharedListPage({ data }: { data: ProblemData }) {
  const api = useMyLists();
  const progress = useDsaProgress();
  const tried = useTried();
  const saved = useSavedProblems();
  const [shared, setShared] = useState<SharedList | null | undefined>(undefined);
  const [made, setMade] = useState<{ id: string; name: string } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    decodeShare(window.location.hash.slice(1)).then(setShared);
  }, []);
  const byId = useMemo(() => new Map(data.rows.map((r) => [r.id, r])), [data.rows]);

  if (shared === undefined) return <div aria-busy="true" aria-label="Opening the shared list" className="h-[240px] animate-pulse rounded-2xl bg-surface-2" />;
  if (!shared) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-line-strong px-5 py-10">
        <h1 className="m-0 font-display text-[24px] font-extrabold text-fg">This link doesn&apos;t open a list</h1>
        <p className="m-0 max-w-[56ch] text-[15px] leading-relaxed text-fg-2">It may have been cut short when it was copied. Ask for the link again.</p>
        <Link href="/dsa/practice" className={`${BTN_PRIMARY} ${MID}`}>
          Browse problems
        </Link>
      </div>
    );
  }
  const rows = shared.ids.map((i) => byId.get(i)).filter((r): r is NonNullable<typeof r> => !!r);
  const p = progressOf(shared.ids, (i) => byId.get(i)?.level, (i) => progress.solved.has(i));
  const statusOf = (i: string): Status => (progress.solved.has(i) ? "solved" : tried.has(i) ? "tried" : "todo");
  const copy = () => {
    const r = api.copy(shared);
    if (r.ok) setMade({ id: r.list.id, name: r.list.name });
    else setErr(r.reason);
  };

  return (
    <div className="flex flex-col gap-5">
      <DsaCrumbs items={[{ href: "/dsa/practice", label: "Practice" }, { label: "Shared list" }]} />
      <header className="flex flex-col gap-3">
        <p className="m-0 font-mono text-[12px] uppercase tracking-label text-signal-text">Shared list · read-only</p>
        <h1 className="m-0 break-words font-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[40px]">{shared.name}</h1>
        {shared.desc ? <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-fg-2">{shared.desc}</p> : null}
        <p className="m-0 font-mono text-[12px] tabular-nums text-fg-3">
          {p.total} problems · {p.easy} easy · {p.medium} medium · {p.hard} hard{progress.ready && p.total ? ` · you have solved ${p.solved}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {made ? (
            <p role="status" className="m-0 text-[14.5px] text-fg">
              Copied as &ldquo;{made.name}&rdquo;.{" "}
              <Link href={`/dsa/lists/${made.id}`} className="font-semibold text-signal-text underline underline-offset-4">
                Open it
              </Link>
            </p>
          ) : (
            <button type="button" onClick={copy} disabled={!api.ready || !rows.length} className={`${BTN_PRIMARY} ${MID} disabled:opacity-50 max-sm:w-full`}>
              <Copy className="h-4 w-4" aria-hidden /> Copy to my lists
            </button>
          )}
          {err ? (
            <p role="alert" className="m-0 text-[13.5px] text-bad-text">
              {err}
            </p>
          ) : null}
        </div>
      </header>
      {rows.length ? <ProblemTable rows={rows} d={data} statusOf={statusOf} isSaved={saved.isSaved} onSave={saved.toggle} myLists={api} /> : <p className="m-0 text-[15px] text-fg-2">None of this list&apos;s problems are in the bank right now.</p>}
    </div>
  );
}
