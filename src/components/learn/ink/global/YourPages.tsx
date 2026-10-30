"use client";

/**
 * "Your pages" at the top of /learn/notebook: the newest handwritten pages as big cards (a horizontal row on a
 * phone), so a saved page is the first thing there, not at the end of a tab. One small query lists them
 * (recentPages: no ink); the thumbnails' ink loads after first paint in one more query and each card draws when it
 * scrolls into view (PageThumb). No pages yet: how to start one.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { createPage, InkError, notebookNamed, pagesInk, type PageSummary } from "@/lib/learn/ink/client";
import type { NotebookPage } from "@/lib/learn/ink/types";
import { timeAgo } from "@/lib/learn/progress";
import PageThumb from "../PageThumb";
import { describeKey } from "./context";
import { NotebookPenIcon, useRecentPages } from "./RecentPages";

const CARDS = 8;
type Ink = Pick<NotebookPage, "paper" | "strokes" | "items">;

/** Where a page belongs, in a few words: a lesson's notebook ("Week 01 · Data at Scale"), else the kind of place. */
export const placeLabel = (p: PageSummary) => {
  const where = describeKey(p.lessonKey);
  if (!where) return p.notebookTitle;
  return where.kind === "lesson" ? p.notebookTitle || where.short : where.short;
};

function Card({ p, ink }: { p: PageSummary; ink: Ink | undefined }) {
  const t = Date.parse(p.updatedAt);
  return (
    <Link
      href={`/learn/notebook/page/${p.id}`}
      className="group flex w-[152px] shrink-0 snap-start flex-col border border-line-strong bg-surface hover:border-fg focus-visible:border-fg sm:w-full"
    >
      {/* the top of the page, where the writing starts */}
      <span className="relative block aspect-[5/4] overflow-hidden border-b border-line">
        {ink ? (
          <PageThumb page={ink} width={220} />
        ) : (
          // the paper until the ink arrives
          <span aria-hidden className="block h-full w-full bg-surface [background-image:repeating-linear-gradient(to_bottom,transparent_0,transparent_13px,var(--c-line)_13px,var(--c-line)_14px)] [background-position:0_22px]" />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-1 p-2.5">
        <span className="line-clamp-2 text-[14.5px] font-semibold leading-snug text-fg group-hover:underline">{p.title || "Untitled page"}</span>
        <span className="truncate font-mono text-[11px] text-fg-3">{placeLabel(p)}</span>
        <span className="truncate font-mono text-[11px] text-fg-4">{Number.isFinite(t) ? `edited ${timeAgo(t)}` : ""}</span>
      </span>
    </Link>
  );
}

export default function YourPages({ onAllNotebooks }: { onAllNotebooks: () => void }) {
  const router = useRouter();
  const { pages, error } = useRecentPages(CARDS, true);
  const [ink, setInk] = useState<Map<string, Ink>>(new Map());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // thumbnails after the cards are on screen
  useEffect(() => {
    if (!pages?.length) return;
    let off = false;
    const ids = pages.map((p) => p.id);
    const go = () =>
      pagesInk(ids)
        .then((m) => !off && setInk(m))
        .catch(() => undefined);
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const h = ric ? ric(go, { timeout: 800 }) : window.setTimeout(go, 200);
    return () => {
      off = true;
      if (!ric) window.clearTimeout(h);
    };
  }, [pages]);

  const newPage = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    try {
      // in the notebook used last, else "Notes"
      const nbId = pages?.[0]?.notebookId || (await notebookNamed("Notes")).id;
      const p = await createPage(nbId, { paper: "ruled" });
      router.push(`/learn/notebook/page/${p.id}`);
    } catch (e) {
      setFailed(e instanceof InkError ? e.message : "Couldn't start a page.");
      setBusy(false);
    }
  };

  // the tables aren't there (or signed out): the tabs below say so
  if (error && pages?.length === 0 && /switched on|Sign in/.test(error)) return null;

  return (
    <section aria-labelledby="your-pages-h" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="your-pages-h" className="m-0 flex items-center gap-2.5 font-display text-[22px] font-bold tracking-[-0.02em] text-fg sm:text-[26px]">
          <span aria-hidden className="grid h-9 w-9 place-items-center bg-signal text-on-signal">
            <NotebookPenIcon />
          </span>
          Your pages
        </h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void newPage()} disabled={busy} className="inline-flex min-h-11 items-center gap-1.5 border border-line-strong px-3.5 text-[14px] font-semibold text-fg hover:bg-surface-2 disabled:opacity-60">
            <Plus className="h-4 w-4" aria-hidden />
            {busy ? "Starting…" : "New page"}
          </button>
          <button type="button" onClick={onAllNotebooks} className="inline-flex min-h-11 items-center gap-1.5 px-3 text-[14px] text-fg-2 hover:text-fg">
            All notebooks
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      {failed && <p className="m-0 text-[14px] text-bad-text">{failed}</p>}
      {pages === null ? (
        <div aria-hidden className="-mx-4 flex gap-3 overflow-hidden px-4 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] sm:px-0">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="block h-[200px] w-[152px] shrink-0 animate-pulse bg-surface-2 sm:w-auto" />
          ))}
        </div>
      ) : pages.length === 0 ? (
        <div className="flex flex-col gap-2 border border-dashed border-line-strong p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <p className="m-0 max-w-[720px] text-[15px] leading-relaxed text-fg-2">
            <strong className="font-semibold text-fg">No pages yet.</strong> Tap the pen button in the corner of any course page (or press{" "}
            <kbd className="border border-line-strong px-1 font-mono text-[12px]">N</kbd>), or the Notebook button beside a lesson. Write with Apple Pencil, clip text, snip diagrams; your pages show up here.
          </p>
          <button type="button" onClick={() => void newPage()} disabled={busy} className="inline-flex min-h-12 shrink-0 items-center gap-2 self-start bg-signal px-5 text-[15px] font-semibold text-on-signal disabled:opacity-60 sm:self-auto">
            <NotebookPenIcon />
            Start a page
          </button>
        </div>
      ) : (
        <ul className="-mx-4 my-0 flex list-none snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] sm:overflow-visible sm:px-0 sm:pb-0">
          {pages.map((p) => (
            <li key={p.id} className="flex">
              <Card p={p} ink={ink.get(p.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
