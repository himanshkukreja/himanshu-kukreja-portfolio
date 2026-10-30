"use client";

/**
 * The "Pages" tab of /learn/notebook: the learner's notebooks, then the pages of the one picked (thumbnails drawn
 * from the ink). Create a notebook or a page (choose its paper), rename, reorder pages, delete with undo (the
 * delete is held back for a few seconds so Undo needs no copy, and runs at once if the tab is left).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { createNotebook, createPage, deleteNotebook, deletePage, InkError, listNotebooks, listPages, movePage, renameNotebook, savePage } from "@/lib/learn/ink/client";
import { INBOX_TITLE, LIMITS, PAPERS, type Notebook, type NotebookPage, type Paper } from "@/lib/learn/ink/types";
import { timeAgo } from "@/lib/learn/progress";
import MiniToast, { type MiniToastState } from "@/components/learn/hub/MiniToast";
import PageThumb from "./PageThumb";

const paperLabel = (p: Paper) => PAPERS.find((x) => x.id === p)?.label || p;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export default function PagesTab({ onCount }: { onCount?: (n: number) => void }) {
  const [notebooks, setNotebooks] = useState<Notebook[] | null>(null);
  const [error, setError] = useState<InkError | null>(null);
  const [nbId, setNbId] = useState<string | null>(null);
  const [pages, setPages] = useState<NotebookPage[] | null>(null);
  const [hiddenNb, setHiddenNb] = useState<Set<string>>(new Set());
  const [hiddenPg, setHiddenPg] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [paper, setPaper] = useState<Paper>("ruled");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<MiniToastState>(null);
  const seq = useRef(0);
  const toastTimer = useRef(0);
  const pending = useRef(new Map<string, { timer: number; run: () => Promise<void> }>());

  const flash = useCallback((t: Omit<NonNullable<MiniToastState>, "id">, ms = 6000) => {
    seq.current += 1;
    setToast({ ...t, id: seq.current });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);
  const fail = useCallback((e: unknown, fallback: string) => flash({ text: e instanceof InkError ? e.message : fallback }), [flash]);

  // ------------------------------------------------------------------ load

  useEffect(() => {
    let off = false;
    listNotebooks()
      .then((nbs) => {
        if (off) return;
        setNotebooks(nbs);
        setError(null);
        onCount?.(nbs.reduce((n, b) => n + (b.pageCount || 0), 0));
        const fromUrl = new URLSearchParams(window.location.search).get("nb");
        setNbId((cur) => (cur && nbs.some((b) => b.id === cur) ? cur : fromUrl && nbs.some((b) => b.id === fromUrl) ? fromUrl : (nbs[0]?.id ?? null)));
      })
      .catch((e) => {
        if (off) return;
        setError(e instanceof InkError ? e : new InkError("network", "Couldn't load your notebooks."));
        setNotebooks([]);
      });
    return () => {
      off = true;
    };
  }, [onCount]);

  useEffect(() => {
    if (!nbId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no notebook picked: no pages
      setPages(null);
      return;
    }
    let off = false;
    setPages(null);
    listPages(nbId)
      .then((p) => !off && setPages(p))
      .catch((e) => {
        if (off) return;
        setPages([]);
        fail(e, "Couldn't load the pages.");
      });
    const u = new URL(window.location.href);
    if (u.searchParams.get("nb") !== nbId) {
      u.searchParams.set("tab", "pages");
      u.searchParams.set("nb", nbId);
      window.history.replaceState(null, "", u.pathname + u.search);
    }
    return () => {
      off = true;
    };
  }, [nbId, fail]);

  // held-back deletes run now if the learner leaves
  useEffect(() => {
    const map = pending.current;
    const flushAll = () => {
      map.forEach((p) => {
        window.clearTimeout(p.timer);
        void p.run();
      });
      map.clear();
    };
    window.addEventListener("pagehide", flushAll);
    return () => {
      window.removeEventListener("pagehide", flushAll);
      flushAll();
    };
  }, []);

  const later = (key: string, run: () => Promise<void>, undo: () => void, text: string) => {
    const timer = window.setTimeout(() => {
      pending.current.delete(key);
      void run();
    }, 6500);
    pending.current.set(key, { timer, run });
    flash({
      text,
      action: {
        label: "Undo",
        onClick: () => {
          const p = pending.current.get(key);
          if (p) window.clearTimeout(p.timer);
          pending.current.delete(key);
          setToast(null);
          undo();
        },
      },
    });
  };

  // ------------------------------------------------------------------ actions

  const visibleNbs = useMemo(() => (notebooks || []).filter((n) => !hiddenNb.has(n.id)), [notebooks, hiddenNb]);
  const nb = visibleNbs.find((n) => n.id === nbId) || null;
  const visiblePages = useMemo(() => (pages || []).filter((p) => !hiddenPg.has(p.id)), [pages, hiddenPg]);

  const addNotebook = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const n = await createNotebook(newTitle.trim() || `Notebook ${(notebooks?.length || 0) + 1}`);
      setNotebooks((x) => [n, ...(x || [])]);
      setNbId(n.id);
      setCreating(false);
      setNewTitle("");
    } catch (e) {
      fail(e, "Couldn't make the notebook.");
    }
    setBusy(false);
  };

  const rename = async (n: Notebook) => {
    const t = draft.trim();
    setRenaming(null);
    if (!t || t === n.title) return;
    setNotebooks((x) => (x || []).map((b) => (b.id === n.id ? { ...b, title: t } : b)));
    try {
      await renameNotebook(n.id, t);
    } catch (e) {
      setNotebooks((x) => (x || []).map((b) => (b.id === n.id ? n : b)));
      fail(e, "Couldn't rename it.");
    }
  };

  const removeNotebook = (n: Notebook) => {
    setHiddenNb((s) => new Set(s).add(n.id));
    if (nbId === n.id) setNbId(visibleNbs.find((b) => b.id !== n.id)?.id ?? null);
    later(
      `nb:${n.id}`,
      async () => {
        try {
          await deleteNotebook(n.id);
          setNotebooks((x) => (x || []).filter((b) => b.id !== n.id));
        } catch (e) {
          setHiddenNb((s) => {
            const t = new Set(s);
            t.delete(n.id);
            return t;
          });
          fail(e, "Couldn't delete the notebook.");
        }
      },
      () => {
        setHiddenNb((s) => {
          const t = new Set(s);
          t.delete(n.id);
          return t;
        });
        setNbId(n.id);
      },
      `“${n.title}” deleted${n.pageCount ? ` with its ${plural(n.pageCount, "page")}` : ""}`
    );
  };

  const addPage = async () => {
    if (!nb || busy) return;
    setBusy(true);
    try {
      const p = await createPage(nb.id, { paper });
      setPages((x) => [...(x || []), p]);
      setNotebooks((x) => (x || []).map((b) => (b.id === nb.id ? { ...b, pageCount: (b.pageCount || 0) + 1 } : b)));
      window.location.assign(`/learn/notebook/page/${p.id}`);
    } catch (e) {
      fail(e, "Couldn't add a page.");
    }
    setBusy(false);
  };

  const removePage = (p: NotebookPage) => {
    setHiddenPg((s) => new Set(s).add(p.id));
    later(
      `pg:${p.id}`,
      async () => {
        try {
          await deletePage(p.id);
          setPages((x) => (x || []).filter((q) => q.id !== p.id));
          setNotebooks((x) => (x || []).map((b) => (b.id === p.notebookId ? { ...b, pageCount: Math.max(0, (b.pageCount || 1) - 1) } : b)));
        } catch (e) {
          setHiddenPg((s) => {
            const t = new Set(s);
            t.delete(p.id);
            return t;
          });
          fail(e, "Couldn't delete the page.");
        }
      },
      () =>
        setHiddenPg((s) => {
          const t = new Set(s);
          t.delete(p.id);
          return t;
        }),
      `“${p.title || "Untitled page"}” deleted`
    );
  };

  const renamePage = async (p: NotebookPage, title: string) => {
    const t = title.trim();
    if (!t || t === p.title) return;
    const np = { ...p, title: t };
    setPages((x) => (x || []).map((q) => (q.id === p.id ? np : q)));
    try {
      await savePage(np);
    } catch (e) {
      setPages((x) => (x || []).map((q) => (q.id === p.id ? p : q)));
      fail(e, "Couldn't rename the page.");
    }
  };

  const reorder = async (p: NotebookPage, to: number) => {
    const list = visiblePages;
    const from = list.findIndex((q) => q.id === p.id);
    if (from < 0 || to < 0 || to >= list.length || to === from) return;
    const next = list.filter((q) => q.id !== p.id);
    next.splice(to, 0, p);
    setPages(next);
    try {
      await movePage(p.id, to);
      if (nbId) setPages(await listPages(nbId));
    } catch (e) {
      setPages(list);
      fail(e, "Couldn't move the page.");
    }
  };

  // drag to reorder (mouse / trackpad); the arrow buttons do the same from a keyboard or touch
  const dragId = useRef<string | null>(null);

  // ------------------------------------------------------------------ render

  if (notebooks === null)
    return (
      <div className="grid gap-4 sm:grid-cols-[260px_1fr]">
        <span className="h-40 animate-pulse border border-line bg-surface" />
        <span className="h-64 animate-pulse border border-line bg-surface" />
      </div>
    );

  if (error?.code === "unavailable" || error?.code === "auth")
    return (
      <div className="flex flex-col items-start gap-3 border border-dashed border-line-strong bg-raised px-6 py-10">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">pages · coming online</span>
        <span className="font-display text-[26px] font-bold tracking-[-0.02em] text-fg">{error.message}</span>
        <span className="max-w-[560px] text-base leading-relaxed text-fg-2">Notebook pages are handwritten pages for iPad and tablet, beside each lesson. Your highlights, notes and bookmarks are in the other tabs.</span>
      </div>
    );

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <section aria-labelledby="nb-books" className="flex w-full shrink-0 flex-col gap-2 lg:w-[280px]">
        <div className="flex items-center justify-between">
          <h2 id="nb-books" className="m-0 font-mono text-xs uppercase tracking-label text-fg-3">
            notebooks · {visibleNbs.length}
          </h2>
          <button
            type="button"
            onClick={() => setCreating((c) => !c)}
            disabled={visibleNbs.length >= LIMITS.notebooks}
            className="inline-flex min-h-10 items-center gap-1.5 border border-line-strong px-3 text-[13px] text-fg hover:bg-surface-2 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden /> New notebook
          </button>
        </div>
        {creating && (
          <form
            className="flex gap-2 border border-signal bg-surface p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void addNotebook();
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">Notebook name</span>
              <input autoFocus value={newTitle} maxLength={LIMITS.titleChars} onChange={(e) => setNewTitle(e.target.value)} placeholder="Name it (e.g. Week 3 · Replication)" className="min-h-10 w-full border border-line-strong bg-bg px-2.5 text-[14px] text-fg outline-none focus:border-signal" />
            </label>
            <button type="submit" disabled={busy} className="min-h-10 bg-signal px-3 text-[13px] font-semibold text-on-signal disabled:opacity-60">
              Create
            </button>
          </form>
        )}
        {visibleNbs.length === 0 && !creating && <p className="m-0 border border-dashed border-line-strong px-4 py-5 text-[14px] text-fg-3">No notebooks yet. Make one, or open the Notebook beside any lesson and one is made for that week.</p>}
        <ul className="m-0 flex list-none flex-row gap-2 overflow-x-auto p-0 pb-1 lg:flex-col lg:overflow-visible">
          {visibleNbs.map((n) => {
            const on = n.id === nbId;
            return (
              <li key={n.id} className="min-w-[210px] lg:min-w-0">
                {renaming === n.id ? (
                  <form
                    className="flex gap-1.5 border border-signal bg-surface p-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void rename(n);
                    }}
                  >
                    <input autoFocus value={draft} maxLength={LIMITS.titleChars} onChange={(e) => setDraft(e.target.value)} onBlur={() => void rename(n)} aria-label="Notebook name" className="min-h-10 min-w-0 flex-1 bg-bg px-2 text-[14px] text-fg outline-none" />
                  </form>
                ) : (
                  <div className={`group flex items-stretch border ${on ? "border-fg bg-surface" : "border-line bg-surface hover:border-line-strong"}`}>
                    <button type="button" onClick={() => setNbId(n.id)} aria-pressed={on} className="flex min-h-14 min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 text-left">
                      <span className="truncate text-[15px] font-semibold text-fg">
                        {n.title === INBOX_TITLE && <span className="mr-1.5 font-mono text-[10px] text-signal-text">INBOX</span>}
                        {n.title}
                      </span>
                      <span className="font-mono text-[11px] text-fg-3">
                        {plural(n.pageCount || 0, "page")} · {timeAgo(Date.parse(n.updatedAt))}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(n.title);
                        setRenaming(n.id);
                      }}
                      aria-label={`Rename ${n.title}`}
                      className="grid w-10 shrink-0 place-items-center text-fg-3 hover:text-fg"
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button type="button" onClick={() => removeNotebook(n)} aria-label={`Delete ${n.title}`} className="grid w-10 shrink-0 place-items-center text-fg-3 hover:text-bad-text">
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label={nb ? `Pages in ${nb.title}` : "Pages"} className="flex min-w-0 flex-1 flex-col gap-4">
        {nb && (
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-label text-fg-3">{plural(visiblePages.length, "page")}</span>
              <h2 className="m-0 truncate font-display text-[26px] font-bold tracking-[-0.025em] text-fg">{nb.title}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Paper</span>
                <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)} className="min-h-11 border border-line-strong bg-surface px-2 text-[14px] text-fg">
                  {PAPERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => void addPage()} disabled={busy || visiblePages.length >= LIMITS.pagesPerNotebook} className="inline-flex min-h-11 items-center gap-2 bg-signal px-4 text-[15px] font-semibold text-on-signal disabled:opacity-50">
                <Plus className="h-4 w-4" aria-hidden /> New page
              </button>
            </div>
          </div>
        )}
        {nb && pages === null && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2].map((i) => (
              <span key={i} className="aspect-[1000/1414] animate-pulse border border-line bg-surface" />
            ))}
          </div>
        )}
        {nb && pages && visiblePages.length === 0 && (
          <div className="flex flex-col items-start gap-3 border border-dashed border-line-strong bg-raised px-6 py-10">
            <span className="font-display text-[24px] font-bold tracking-[-0.02em] text-fg">An empty notebook.</span>
            <span className="max-w-[520px] text-[15px] leading-relaxed text-fg-2">Pick a paper (ruled, grid, Cornell notes or a design-interview sheet) and start a page. Write with Apple Pencil, a stylus, a finger or a mouse.</span>
          </div>
        )}
        {nb && pages && visiblePages.length > 0 && (
          <ol className="m-0 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 xl:grid-cols-4">
            {visiblePages.map((p, i) => (
              <li
                key={p.id}
                draggable
                onDragStart={(e) => {
                  dragId.current = p.id;
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (dragId.current && dragId.current !== p.id) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = visiblePages.find((q) => q.id === dragId.current);
                  dragId.current = null;
                  if (from) void reorder(from, i);
                }}
                className="group flex min-w-0 flex-col gap-1.5"
              >
                <Link href={`/learn/notebook/page/${p.id}`} className="relative block border border-line-strong bg-surface transition hover:border-fg" aria-label={`Open page ${i + 1}: ${p.title || "Untitled page"}`}>
                  <PageThumb page={p} width={220} />
                  <span className="absolute left-0 top-0 bg-fg px-1.5 py-0.5 font-mono text-[11px] text-bg">{i + 1}</span>
                  {p.convertedMd && <span className="absolute right-0 top-0 bg-signal px-1.5 py-0.5 font-mono text-[10px] text-on-signal">TYPED</span>}
                </Link>
                <PageTitle page={p} onRename={(t) => void renamePage(p, t)} />
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate font-mono text-[11px] text-fg-3">
                    {paperLabel(p.paper)} · {timeAgo(Date.parse(p.updatedAt))}
                  </span>
                  <span className="flex shrink-0">
                    <button type="button" onClick={() => void reorder(p, i - 1)} disabled={i === 0} aria-label={`Move page ${i + 1} earlier`} className="grid h-9 w-8 place-items-center text-fg-3 hover:text-fg disabled:opacity-25">
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                    </button>
                    <button type="button" onClick={() => void reorder(p, i + 1)} disabled={i === visiblePages.length - 1} aria-label={`Move page ${i + 1} later`} className="grid h-9 w-8 place-items-center text-fg-3 hover:text-fg disabled:opacity-25">
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </button>
                    <button type="button" onClick={() => removePage(p)} aria-label={`Delete page ${i + 1}`} className="grid h-9 w-8 place-items-center text-fg-3 hover:text-bad-text">
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <MiniToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function PageTitle({ page, onRename }: { page: NotebookPage; onRename: (t: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(page.title);
  if (!edit)
    return (
      <button
        type="button"
        onClick={() => {
          setV(page.title);
          setEdit(true);
        }}
        className="truncate text-left text-[14px] font-semibold text-fg hover:underline"
        title="Rename"
      >
        {page.title || "Untitled page"}
      </button>
    );
  return (
    <input
      autoFocus
      value={v}
      maxLength={LIMITS.titleChars}
      aria-label="Page title"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setEdit(false);
        onRename(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setV(page.title);
          setEdit(false);
        }
      }}
      className="min-h-8 border border-signal bg-bg px-1.5 text-[14px] text-fg outline-none"
    />
  );
}
