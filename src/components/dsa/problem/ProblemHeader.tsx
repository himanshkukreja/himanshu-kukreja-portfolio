"use client";

/**
 * The problem page's own bar under the site header (a focus page: no course tabs): "← lesson", "PRACTICE n OF m",
 * previous / next inside the lesson's Practice list, Interview, and the ⋯ menu (Reset problem, Save offline, Save for
 * later, Notebook, Show everything).
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, MessageSquareQuote, MoreHorizontal, NotebookPen } from "lucide-react";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";
import { INK_EVENTS } from "@/lib/learn/ink/types";
import { track } from "@/lib/track";
import { ShowEverything } from "../simple/view";
import ResetProblem from "./ResetProblem";
import { store, type ProblemPosition, type Room } from "./useProblemRoom";

const SAVED_KEY = "dsa.saved";
const readSaved = (): string[] => {
  try {
    const v = JSON.parse(store.get(SAVED_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

const LINK = "inline-flex min-h-10 items-center text-[14px] text-fg-2 hover:text-fg [@media(pointer:coarse)]:min-h-11";
const ITEM = "flex min-h-10 w-full items-center gap-2 px-3 text-left text-[14px] text-fg-2 hover:bg-surface-2 hover:text-fg [@media(pointer:coarse)]:min-h-11";

export default function ProblemHeader({ room, position }: { room: Room; position: ProblemPosition | null }) {
  const { p, solved, hints, fails, history, seenEarly, drawer, setDrawer, freshStart } = room;
  const [menu, setMenu] = useState(false);
  const [saved, setSaved] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // device state, read after hydration
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(readSaved().includes(p.id));
  }, [p.id]);
  useEffect(() => {
    if (!menu) return;
    const away = (e: Event) => {
      // a dialog opened from the menu (Reset, Save offline) is not "away"
      const t = e.target as HTMLElement;
      if (!box.current?.contains(t) && !t.closest('[role="dialog"], [role="alertdialog"]')) setMenu(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
    };
  }, [menu]);

  const toggleSaved = () => {
    const cur = readSaved();
    const next = cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id];
    store.set(SAVED_KEY, JSON.stringify(next));
    setSaved(next.includes(p.id));
    track("dsa_save_for_later", { problem: p.id, saved: next.includes(p.id) });
  };

  const prev = position?.prev ?? p.prev;
  const next = position?.next ?? p.next;
  const lesson = position?.lesson ?? { title: p.conceptTitle, href: `/dsa/concepts/${p.concept}#practice` };
  const dirty = solved || hints > 0 || fails > 0 || history.length > 0 || seenEarly;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-surface px-4 py-1.5 sm:px-6" data-problem-header>
      <Link href={lesson.href} className={`${LINK} min-w-0 max-w-[60vw] truncate sm:max-w-[320px]`}>
        <span aria-hidden>←&nbsp;</span>
        <span className="truncate">{lesson.title}</span>
      </Link>
      {position ? (
        <span className="border border-line-strong px-2.5 py-1 font-mono text-[12px] uppercase tracking-label text-fg-2" data-practice-position>
          Practice {position.n} of {position.m}
        </span>
      ) : (
        <span className="font-mono text-[12px] uppercase tracking-label text-fg-3">Practice</span>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
        {prev ? (
          <Link href={`/dsa/problems/${prev.id}`} className={LINK} title={prev.title}>
            ← Previous
          </Link>
        ) : null}
        {next ? (
          <Link href={`/dsa/problems/${next.id}`} className={LINK} title={next.title}>
            Next problem →
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => setDrawer(drawer === "interview" ? null : "interview")}
          aria-pressed={drawer === "interview"}
          className="inline-flex min-h-10 items-center gap-1.5 border border-line-strong px-3 text-[14px] font-medium text-fg hover:border-signal [@media(pointer:coarse)]:min-h-11"
        >
          <MessageSquareQuote className="h-4 w-4 text-signal-text" aria-hidden />
          Interview
        </button>
        <div ref={box} className="relative">
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            aria-haspopup="true"
            aria-expanded={menu}
            aria-label="More: reset, save, notebook"
            className="inline-flex min-h-10 w-10 items-center justify-center border border-line-strong text-fg-2 hover:bg-surface-2 hover:text-fg [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:w-11"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
          {/* kept mounted so the dialogs it opens (Reset, Save offline) outlive closing the menu */}
          <div hidden={!menu} className="absolute right-0 top-full z-40 mt-1 flex w-60 flex-col border border-line-strong bg-surface py-1 shadow-lg">
            <button type="button" onClick={toggleSaved} className={ITEM}>
              {saved ? <BookmarkCheck className="h-4 w-4 text-signal-text" aria-hidden /> : <Bookmark className="h-4 w-4" aria-hidden />}
              {saved ? "Saved for later ✓" : "Save for later"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                window.dispatchEvent(new CustomEvent(INK_EVENTS.open, { detail: {} }));
              }}
              className={ITEM}
            >
              <NotebookPen className="h-4 w-4" aria-hidden /> Notebook
            </button>
            <div className="px-3 py-1">
              <SaveOfflineButton title={p.title} kind="dsa-problem" />
            </div>
            {dirty && (
              <div className="px-1">
                <ResetProblem
                  id={p.id}
                  title={p.title}
                  onDone={() => {
                    setMenu(false);
                    freshStart();
                  }}
                />
              </div>
            )}
            <div className="px-3 py-1">
              <ShowEverything />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
