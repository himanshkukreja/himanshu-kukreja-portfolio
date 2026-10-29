"use client";

/**
 * The course chat's history: past conversations grouped by day, newest first. Open one to read and continue it;
 * rename or delete each, or delete them all. The same list is the sidebar on /learn/chat (computers), a drawer
 * there on phones and tablets, and a view inside the Ask panel. Storage and sync: ./history.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Cloud, HardDrive, MessageSquarePlus, Pencil, Search, Trash2, X } from "lucide-react";
import { groupByDay, whenLabel } from "@/lib/learn/chat-history";
import { track } from "@/lib/track";
import { deleteAllThreads, deleteThread, HISTORY_EVENT, isHistoryKey, openThread, readHistory, renameThread, syncHistory, syncState, type LocalThread, type SyncState } from "./history";

/** The history for one learner, kept in step with every chat view; syncs with the account when `sync`. */
export function useChatHistory(uid: string | null, sync: boolean) {
  const [state, setState] = useState<{ threads: LocalThread[]; active: string | null; remote: SyncState }>({ threads: [], active: null, remote: "unknown" });
  useEffect(() => {
    if (!uid) return;
    const load = () => setState({ ...readHistory(uid), remote: uid === "dev" ? "off" : syncState(uid) });
    load();
    const on = (e: Event) => {
      if (e instanceof StorageEvent && !isHistoryKey(uid, e.key)) return;
      load();
    };
    window.addEventListener(HISTORY_EVENT, on);
    window.addEventListener("storage", on);
    if (sync) void syncHistory(uid).then(load);
    return () => {
      window.removeEventListener(HISTORY_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, [uid, sync]);
  return state;
}

type Props = {
  uid: string;
  sync: boolean;
  /** start a new conversation (the chat's reset) */
  onNew: () => void;
  /** a conversation was opened (close a drawer, focus the box) */
  onOpened?: () => void;
  /** stop an answer that is still coming before switching */
  beforeSwitch?: () => void;
  busy?: boolean;
  /** "panel": the Ask panel's narrow view */
  variant?: "sidebar" | "sheet" | "panel";
};

export default function ChatHistory({ uid, sync, onNew, onOpened, beforeSwitch, busy, variant = "sidebar" }: Props) {
  const { threads, active, remote } = useChatHistory(uid, sync);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [gone, setGone] = useState(false);
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? threads.filter((t) => t.title.toLowerCase().includes(f)) : threads;
  }, [threads, filter]);
  const groups = useMemo(() => groupByDay(shown), [shown]);

  const open = useCallback(
    async (id: string) => {
      if (id === active) return onOpened?.();
      if (busy) {
        beforeSwitch?.();
        await new Promise((r) => setTimeout(r, 60));
      }
      const ok = await openThread(uid, id);
      setGone(!ok);
      if (ok) {
        track("chat_history_open", { from: variant });
        onOpened?.();
      }
    },
    [active, beforeSwitch, busy, onOpened, uid, variant],
  );

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${variant === "sidebar" ? "" : ""}`}>
      <div className="flex shrink-0 flex-col gap-2 px-3 pb-2 pt-3">
        <button
          type="button"
          onClick={() => {
            onNew();
            onOpened?.();
          }}
          className="inline-flex min-h-11 items-center justify-center gap-2 bg-signal px-3 text-[14px] font-semibold text-on-signal hover:brightness-110"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden />
          New chat
        </button>
        {threads.length > 6 && (
          <label className="flex min-h-10 items-center gap-2 border border-line bg-bg px-2.5 focus-within:border-fg-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-fg-4" aria-hidden />
            <span className="sr-only">Find a conversation</span>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a chat" className="min-w-0 flex-1 bg-transparent text-[16px] sm:text-[14px] text-fg outline-none placeholder:text-fg-4 focus-visible:outline-none" />
          </label>
        )}
      </div>

      <nav aria-label="Past conversations" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-2 pb-3">
        {gone && <p className="m-0 px-2 text-[13px] text-fg-3">That conversation was deleted on another device.</p>}
        {threads.length === 0 ? (
          <p className="m-0 px-2 pt-2 text-[13.5px] leading-relaxed text-fg-3">Your conversations show up here. Ask something to start one.</p>
        ) : groups.length === 0 ? (
          <p className="m-0 px-2 text-[13.5px] text-fg-3">No chat matches “{filter}”.</p>
        ) : (
          groups.map((g) => (
            <section key={g.label} className="flex flex-col gap-0.5">
              <h3 className="m-0 px-2 pb-1 font-mono text-[10.5px] uppercase tracking-label text-fg-4">{g.label}</h3>
              <ul className="m-0 flex list-none flex-col p-0">
                {g.items.map((t) => (
                  <Row key={t.id} t={t} on={t.id === active} editing={editing === t.id} onEdit={setEditing} onOpen={open} uid={uid} touch={variant !== "sidebar"} />
                ))}
              </ul>
            </section>
          ))
        )}
      </nav>

      <div className="flex shrink-0 flex-col gap-2 border-t border-line px-3 py-2.5">
        <p className="m-0 flex items-start gap-1.5 text-[11.5px] leading-snug text-fg-4">
          {remote === "on" ? <Cloud className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> : <HardDrive className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />}
          <span>{remote === "on" ? "Saved to your account for 90 days after the last message, on every device you sign in on." : "Kept on this device for 90 days after the last message."}</span>
        </p>
        {threads.length > 0 &&
          (confirmAll ? (
            <div role="group" aria-label="Delete every conversation?" className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-fg-2">Delete all {threads.length}?</span>
              <button
                type="button"
                onClick={() => {
                  void deleteAllThreads(uid);
                  setConfirmAll(false);
                  onNew();
                  track("chat_history_delete", { all: true, n: threads.length });
                }}
                className="min-h-10 bg-bad px-3 text-[13px] font-semibold text-white"
              >
                Delete all
              </button>
              <button type="button" onClick={() => setConfirmAll(false)} className="min-h-10 border border-line-strong px-3 text-[13px] text-fg-2 hover:text-fg">
                Keep them
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmAll(true)} className="inline-flex min-h-10 items-center gap-1.5 self-start px-1 font-mono text-[11.5px] text-fg-3 hover:text-bad-text [@media(pointer:coarse)]:min-h-11">
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete all chats
            </button>
          ))}
      </div>
    </div>
  );
}

function Rename({ t, uid, onDone }: { t: LocalThread; uid: string; onDone: () => void }) {
  const [name, setName] = useState(t.title);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.select();
  }, []);
  return (
      <li>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void renameThread(uid, t.id, name);
            onDone();
          }}
          className="flex items-center gap-1 border border-fg-3 bg-bg p-1"
        >
          <label htmlFor={`rn-${t.id}`} className="sr-only">
            Rename this chat
          </label>
          <input id={`rn-${t.id}`} ref={input} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.stopPropagation();
              onDone();
            }} className="min-h-10 min-w-0 flex-1 bg-transparent px-1.5 text-[16px] sm:text-[14px] text-fg outline-none focus-visible:outline-none" />
          <button type="submit" aria-label="Save the name" className="grid h-10 w-10 shrink-0 place-items-center text-ok hover:text-fg">
            <Check className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={onDone} aria-label="Cancel" className="grid h-10 w-10 shrink-0 place-items-center text-fg-3 hover:text-fg">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </form>
      </li>
  );
}

function Row({ t, on, editing, onEdit, onOpen, uid, touch }: { t: LocalThread; on: boolean; editing: boolean; onEdit: (id: string | null) => void; onOpen: (id: string) => void; uid: string; touch: boolean }) {
  const [confirm, setConfirm] = useState(false);
  if (editing) return <Rename t={t} uid={uid} onDone={() => onEdit(null)} />;

  if (confirm)
    return (
      <li className="flex flex-wrap items-center gap-1.5 border border-bad/50 bg-bad/5 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2">Delete “{t.title}”?</span>
        <button
          type="button"
          onClick={() => {
            void deleteThread(uid, t.id);
            track("chat_history_delete", { all: false });
          }}
          className="min-h-9 bg-bad px-2.5 text-[12.5px] font-semibold text-white"
        >
          Delete
        </button>
        <button type="button" onClick={() => setConfirm(false)} className="min-h-9 px-2 text-[12.5px] text-fg-3 hover:text-fg">
          Cancel
        </button>
      </li>
    );

  return (
    <li className={`group relative flex items-stretch ${on ? "bg-surface-2 shadow-[inset_2px_0_0_var(--c-signal)]" : "hover:bg-surface-2"}`}>
      <button type="button" onClick={() => onOpen(t.id)} aria-current={on ? "true" : undefined} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 py-2 pl-3 pr-1 text-left">
        <span className={`line-clamp-2 break-words text-[13.5px] leading-snug ${on ? "font-semibold text-fg" : "text-fg-2 group-hover:text-fg"}`}>{t.title}</span>
        <span className="font-mono text-[10.5px] text-fg-4">{whenLabel(t.updatedAt)}</span>
      </button>
      <span className={`flex shrink-0 items-center ${touch ? "" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"}`}>
        <button type="button" onClick={() => onEdit(t.id)} aria-label={`Rename “${t.title}”`} title="Rename" className={`grid h-11 place-items-center text-fg-4 hover:text-fg ${touch ? "w-11" : "w-9 [@media(pointer:coarse)]:w-11"}`}>
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button type="button" onClick={() => setConfirm(true)} aria-label={`Delete “${t.title}”`} title="Delete" className={`grid h-11 place-items-center text-fg-4 hover:text-bad-text ${touch ? "w-11" : "w-9 [@media(pointer:coarse)]:w-11"}`}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </span>
    </li>
  );
}
