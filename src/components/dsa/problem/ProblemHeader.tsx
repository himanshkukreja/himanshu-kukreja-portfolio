"use client";

/**
 * The problem page's own bar under the site header (a focus page: no course tabs): "← lesson", "PRACTICE n OF m",
 * previous / next inside the lesson's Practice list, Interview, and the ⋯ menu (Reset problem, Save offline, Save for
 * later, Notebook).
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, MessageSquareQuote, MoreHorizontal, NotebookPen } from "lucide-react";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";
import { INK_EVENTS } from "@/lib/learn/ink/types";
import ResetProblem from "./ResetProblem";
import { useSavedProblems } from "@/components/dsa/practice/useSavedProblems";
import { useMyLists } from "@/components/dsa/practice/useMyLists";
import AddToList from "@/components/dsa/practice/AddToList";
import type { ProblemPosition, Room } from "./useProblemRoom";

const LINK = "inline-flex min-h-10 items-center text-[14px] text-fg-2 hover:text-fg [@media(pointer:coarse)]:min-h-11";
const ITEM = "flex min-h-10 w-full items-center gap-2 px-3 text-left text-[14px] text-fg-2 hover:bg-surface-2 hover:text-fg [@media(pointer:coarse)]:min-h-11";

export default function ProblemHeader({ room, position }: { room: Room; position: ProblemPosition | null }) {
  const { p, solved, hints, fails, history, seenEarly, drawer, setDrawer, freshStart } = room;
  const [menu, setMenu] = useState(false);
  const { isSaved, toggle } = useSavedProblems();
  const saved = isSaved(p.id);
  const myLists = useMyLists();
  const inAnyList = myLists.lists.some((l) => l.ids.includes(p.id));
  const box = useRef<HTMLDivElement>(null);
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

  const toggleSaved = () => toggle(p.id);

  const prev = position?.prev ?? p.prev;
  const next = position?.next ?? p.next;
  const lesson = position?.lesson ?? { title: "Practice", href: "/dsa/practice" };
  const dirty = solved || hints > 0 || fails > 0 || history.length > 0 || seenEarly;

  return (
    <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-surface px-4 py-1.5 sm:px-6" data-problem-header>
      <Link href={lesson.href} className={`${LINK} min-w-0 max-w-[60vw] truncate sm:max-w-[320px]`}>
        <span aria-hidden>←&nbsp;</span>
        <span className="truncate">{lesson.title}</span>
      </Link>
      {position && position.m > 0 ? (
        <span className="rounded-full bg-surface-2 px-2.5 py-[5px] font-mono text-[12px] uppercase text-fg-2" data-practice-position>
          Practice {position.n} of {position.m}
        </span>
      ) : (
        <span className="rounded-full bg-surface-2 px-2.5 py-[5px] font-mono text-[12px] uppercase text-fg-3">Practice</span>
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
          className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-line px-3 text-[14px] font-medium text-fg hover:bg-surface-2 [@media(pointer:coarse)]:min-h-11"
        >
          <MessageSquareQuote className="h-4 w-4 text-signal-text" aria-hidden />
          Interview
        </button>
        <AddToList problemId={p.id} title={p.title} api={myLists} inAny={inAnyList} from="problem" variant="bar" />
        <div ref={box} className="relative">
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            aria-haspopup="true"
            aria-expanded={menu}
            aria-label="More: reset, save, notebook"
            className="inline-flex min-h-9 w-9 items-center justify-center rounded-[10px] border border-line text-fg-2 hover:bg-surface-2 hover:text-fg [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:w-11"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
          {/* kept mounted so the dialogs it opens (Reset, Save offline) outlive closing the menu */}
          <div hidden={!menu} className={`${menu ? "flex" : "hidden"} absolute right-0 top-full z-40 mt-1 w-60 flex-col overflow-hidden rounded-[14px] border border-line bg-surface py-1 shadow-lg`}>
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
          </div>
        </div>
      </div>
    </div>
  );
}
