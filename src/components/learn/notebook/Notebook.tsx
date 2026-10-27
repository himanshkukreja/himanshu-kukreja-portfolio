"use client";

/**
 * Notebook (/learn/notebook): Highlights (content_notes without note text) · Notes · Bookmarks.
 * Search, week + colour filters, grouped by lesson with real titles, "Open at Part II" links
 * (stage located on the server; falls back to the old #note- / #bookmark- offsets), inline edit,
 * inline delete confirm with undo, "+ Review card", Export Markdown.
 * Saved shorts (bookmarks under course "shorts", saved from /learn/shorts) sit in their own row on top.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseClient } from "@/lib/supabase-client";
import type { CourseMap } from "@/lib/learn/types";
import { lessonKey } from "@/lib/learn/types";
import { COLOUR_ORDER, HIGHLIGHT_COLOURS, fallbackMeta, indexLessons, noteTypeLabel, pickCloze, type LessonMeta, type NoteColor } from "@/lib/learn/notebook";
import { locateStages, type StageLocation } from "@/lib/learn/actions";
import { addReviewCard, removeReviewCard } from "@/lib/learn/review";
import { useReviewCards } from "@/lib/learn/useReviewDue";
import { findResume, timeAgo, useLearnProgress } from "@/lib/learn/progress";
import AuthPromptBanner from "@/components/AuthPromptBanner";
import MiniToast, { type MiniToastState } from "@/components/learn/hub/MiniToast";
import Overlay from "@/components/learn/hub/Overlay";

export type NotebookTab = "highlights" | "notes" | "bookmarks";

type NoteRow = {
  id: string;
  user_id?: string;
  course_id: string;
  week: string;
  lesson_slug: string;
  note_text: string | null;
  note_type: "general" | "question" | "important" | "todo";
  highlight_text: string | null;
  highlight_offset: number | null;
  color: NoteColor;
  is_private?: boolean;
  created_at: string;
  updated_at: string;
};

type BookmarkRow = {
  id: string;
  user_id?: string;
  course_id: string;
  week: string;
  lesson_slug: string;
  custom_title: string | null;
  note: string | null;
  tags?: string[] | null;
  bookmark_text?: string | null;
  bookmark_offset?: number | null;
  created_at: string;
  updated_at: string;
};

type Item = {
  id: string;
  kind: NotebookTab;
  meta: LessonMeta;
  quote: string;
  note: string;
  title: string;
  color: NoteColor | null;
  noteType: string | null;
  at: number;
  offset: number | null;
};

const NOUN: Record<NotebookTab, [string, string]> = {
  highlights: ["highlight", "highlights"],
  notes: ["note", "notes"],
  bookmarks: ["bookmark", "bookmarks"],
};
const plural = (n: number, t: NotebookTab) => `${n} ${NOUN[t][n === 1 ? 0 : 1]}`;

export default function Notebook({ map, initialTab = "highlights" }: { map: CourseMap; initialTab?: NotebookTab }) {
  const { user, loading: authLoading } = useAuth();
  const { lessons } = useLearnProgress(map.courseId);
  const { cards } = useReviewCards();
  const index = useMemo(() => indexLessons(map), [map]);
  const metaOf = useCallback((week: string, slug: string) => index.get(lessonKey(week, slug)) || fallbackMeta(map.courseId, week, slug), [index, map.courseId]);

  const [tab, setTab] = useState<NotebookTab>(initialTab);
  // The page is served from the cache (one HTML for everyone), so the ?tab= deep link is applied
  // here on the client after hydration rather than read on the server.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the deep link after mount
    if (t === "highlights" || t === "notes" || t === "bookmarks") setTab(t);
  }, []);
  const [q, setQ] = useState("");
  const [week, setWeek] = useState<string>("all");
  const [colour, setColour] = useState<"all" | NoteColor>("all");
  const [notes, setNotes] = useState<NoteRow[] | null>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkRow[] | null>(null);
  const [savedShorts, setSavedShorts] = useState<BookmarkRow[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [locs, setLocs] = useState<Record<string, StageLocation>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<MiniToastState>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const userId = user?.id ?? null;

  const toastSeq = useRef(0);
  const flash = useCallback((t: Omit<NonNullable<MiniToastState>, "id">, ms = 4200) => {
    toastSeq.current += 1;
    setToast({ ...t, id: toastSeq.current });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  // Load everything once (two queries), then locate stages on the server.
  useEffect(() => {
    if (!userId) return;
    let off = false;
    Promise.all([
      supabaseClient.from("content_notes").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabaseClient.from("bookmarks").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    ])
      .then(([n, b]) => {
        if (off) return;
        if (n.error || b.error) setLoadError(true);
        const nr = (n.data || []) as NoteRow[];
        const all = (b.data || []) as BookmarkRow[];
        // shorts saved from the feed are listed on their own, not as lesson bookmarks
        const br = all.filter((x) => x.course_id !== "shorts");
        setSavedShorts(all.filter((x) => x.course_id === "shorts"));
        setNotes(nr);
        setBookmarks(br);
        const items = [
          ...nr.filter((x) => x.highlight_text).map((x) => ({ id: x.id, week: x.week, slug: x.lesson_slug, text: x.highlight_text as string })),
          ...br.filter((x) => x.bookmark_text).map((x) => ({ id: x.id, week: x.week, slug: x.lesson_slug, text: x.bookmark_text as string })),
        ];
        if (items.length)
          locateStages(items)
            .then((r) => {
              if (!off) setLocs(r);
            })
            .catch(() => undefined);
      })
      .catch(() => {
        if (!off) {
          setLoadError(true);
          setNotes([]);
          setBookmarks([]);
        }
      });
    return () => {
      off = true;
    };
  }, [userId]);

  const setTabUrl = (t: NotebookTab) => {
    setTab(t);
    setColour("all");
    setEditId(null);
    setConfirmId(null);
    window.history.replaceState(null, "", `/learn/notebook?tab=${t}`);
  };

  const all = useMemo(() => {
    const out: Record<NotebookTab, Item[]> = { highlights: [], notes: [], bookmarks: [] };
    (notes || []).forEach((n) => {
      const hasNote = !!(n.note_text && n.note_text.trim());
      const kind: NotebookTab = hasNote ? "notes" : "highlights";
      if (!hasNote && !n.highlight_text) return;
      out[kind].push({
        id: n.id,
        kind,
        meta: metaOf(n.week, n.lesson_slug),
        quote: n.highlight_text || "",
        note: n.note_text || "",
        title: "",
        color: n.color || "yellow",
        noteType: n.note_type,
        at: Date.parse(n.created_at) || 0,
        offset: n.highlight_offset,
      });
    });
    (bookmarks || []).forEach((b) => {
      const meta = metaOf(b.week, b.lesson_slug);
      out.bookmarks.push({
        id: b.id,
        kind: "bookmarks",
        meta,
        quote: b.bookmark_text || "",
        note: b.note || "",
        title: b.custom_title || "",
        color: null,
        noteType: null,
        at: Date.parse(b.created_at) || 0,
        offset: b.bookmark_offset ?? null,
      });
    });
    return out;
  }, [notes, bookmarks, metaOf]);

  const ql = q.trim().toLowerCase();
  const matchQ = useCallback(
    (x: Item) => !ql || [x.quote, x.note, x.title, x.meta.title, x.meta.tag, locs[x.id]?.label || "", locs[x.id]?.title || ""].join(" ").toLowerCase().includes(ql),
    [ql, locs]
  );
  const weekOf = (x: Item) => (x.meta.weekCode === "SQ" ? "SQ" : x.meta.weekCode ? `W${x.meta.weekCode}` : "—");
  const base = all[tab].filter(matchQ).filter((x) => tab !== "highlights" || colour === "all" || x.color === colour);
  const list = base.filter((x) => week === "all" || weekOf(x) === week);

  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    list.forEach((x) => {
      const arr = m.get(x.meta.key) || [];
      arr.push(x);
      m.set(x.meta.key, arr);
    });
    return Array.from(m.values())
      .map((items) => ({ meta: items[0].meta, items: items.sort((a, b) => b.at - a.at) }))
      .sort((a, b) => a.meta.order - b.meta.order);
  }, [list]);

  const reviewByRef = useMemo(() => {
    const m = new Map<string, (typeof cards)[number]>();
    cards.filter((c) => c.source === "highlight").forEach((c) => m.set(c.sourceRef, c));
    return m;
  }, [cards]);

  const resume = useMemo(() => findResume(map, lessons), [map, lessons]);
  const weekChips = useMemo(() => {
    const codes = ["all", ...map.weeks.map((w) => `W${w.code}`), ...(all[tab].some((x) => x.meta.weekCode === "SQ") ? ["SQ"] : [])];
    return codes.map((c) => ({ code: c, count: c === "all" ? base.length : base.filter((x) => weekOf(x) === c).length }));
  }, [map.weeks, all, tab, base]);
  const currentWeekCode = resume && resume.lesson.kind !== "bonus" ? `W${resume.lesson.tag.slice(1, 3)}` : null;

  const hrefFor = (x: Item) => {
    const loc = locs[x.id];
    if (loc) return { href: `${x.meta.href}#${loc.stageId}`, label: `Open at ${loc.label} ›`, stage: loc.label };
    if (x.offset !== null && x.offset !== undefined) return { href: `${x.meta.href}#${x.kind === "bookmarks" ? "bookmark" : "note"}-${x.offset}`, label: x.kind === "bookmarks" ? "Open at bookmark ›" : "Open at highlight ›", stage: "" };
    return { href: x.meta.href, label: "Open lesson ›", stage: "whole lesson" };
  };

  // ------------------------------------------------------------ actions

  const saveEdit = async (x: Item) => {
    if (!userId) return;
    const value = draft.trim();
    setBusy(x.id);
    const now = new Date().toISOString();
    const res =
      x.kind === "bookmarks"
        ? await supabaseClient.from("bookmarks").update({ custom_title: value || null, updated_at: now }).eq("id", x.id).eq("user_id", userId)
        : await supabaseClient.from("content_notes").update({ note_text: value, updated_at: now }).eq("id", x.id).eq("user_id", userId);
    setBusy(null);
    if (res.error) {
      flash({ text: "Couldn't save. Try again." });
      return;
    }
    if (x.kind === "bookmarks") setBookmarks((b) => (b || []).map((r) => (r.id === x.id ? { ...r, custom_title: value || null, updated_at: now } : r)));
    else setNotes((n) => (n || []).map((r) => (r.id === x.id ? { ...r, note_text: value, updated_at: now } : r)));
    setEditId(null);
    flash({ text: x.kind === "highlights" && value ? "Saved · it now lives under Notes" : "Saved" });
  };

  const makeCard = async (x: Item) => {
    if (!x.quote) return;
    const c = pickCloze(x.quote);
    const loc = locs[x.id];
    const r = await addReviewCard({
      source: "highlight",
      sourceRef: x.id,
      courseId: map.courseId,
      week: x.meta.week,
      lessonSlug: x.meta.slug,
      stage: loc?.stageId,
      front: x.quote,
      back: c.blank,
      detail: {
        why: x.note || undefined,
        context: `${x.meta.tag} · ${x.meta.title}${loc ? ` · ${loc.label}` : ""}`,
        short: x.quote.length > 48 ? `${x.quote.slice(0, 46).trim()}…` : x.quote,
      },
    });
    flash(
      r.ok
        ? { text: r.duplicate ? "Already in your review deck" : "Added to review · due today in Box 1", link: { label: "Open review ›", href: "/learn/review" } }
        : { text: "Couldn't add the card" }
    );
  };

  const doDelete = async (x: Item) => {
    if (!userId) return;
    setBusy(x.id);
    const table = x.kind === "bookmarks" ? "bookmarks" : "content_notes";
    const row = x.kind === "bookmarks" ? (bookmarks || []).find((r) => r.id === x.id) : (notes || []).find((r) => r.id === x.id);
    const { error } = await supabaseClient.from(table).delete().eq("id", x.id).eq("user_id", userId);
    setBusy(null);
    setConfirmId(null);
    if (error || !row) {
      flash({ text: "Couldn't delete. Try again." });
      return;
    }
    const card = reviewByRef.get(x.id);
    if (card) await removeReviewCard(card);
    if (x.kind === "bookmarks") setBookmarks((b) => (b || []).filter((r) => r.id !== x.id));
    else setNotes((n) => (n || []).filter((r) => r.id !== x.id));
    const noun = NOUN[x.kind][0];
    flash(
      {
        text: `${noun.charAt(0).toUpperCase() + noun.slice(1)} deleted`,
        action: {
          label: "Undo",
          onClick: async () => {
            setToast(null);
            const { error: e2 } = await supabaseClient.from(table).insert(row);
            if (e2) {
              flash({ text: "Couldn't restore it" });
              return;
            }
            if (x.kind === "bookmarks") setBookmarks((b) => [row as BookmarkRow, ...(b || [])]);
            else setNotes((n) => [row as NoteRow, ...(n || [])]);
            if (card) await makeCard(x);
          },
        },
      },
      6000
    );
  };

  // ------------------------------------------------------------ export

  const exportMd = useMemo(() => {
    const md = [`# Notebook · ${map.title}`, `_${plural(list.length, tab)}${week !== "all" ? ` · ${week}` : ""} · exported ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}_`, ""];
    groups.forEach((g) => {
      md.push(`## ${g.meta.tag.replace(/\b(DAY|PART|BOSS|PREVIEW|TRIAL)\b/g, (m) => m.charAt(0) + m.slice(1).toLowerCase())} · ${g.meta.title}`, "");
      g.items.forEach((x) => {
        const where = locs[x.id]?.label || (x.kind === "bookmarks" && !x.quote ? "whole lesson" : "");
        if (x.kind === "bookmarks") {
          md.push(`- [ ] **${x.title || x.quote || g.meta.title}**${where ? ` (${where})` : ""}${x.note ? ` — ${x.note}` : ""}`);
          return;
        }
        if (x.quote) md.push(`> ${x.quote.replace(/\n+/g, " ")}`, "");
        if (x.kind === "highlights") md.push(`\`${HIGHLIGHT_COLOURS[x.color || "yellow"].label.toLowerCase()}\`${where ? ` · ${where}` : ""}`, "");
        else md.push(`${x.note}${where ? ` _(${where})_` : ""}`, "");
      });
      if (tab === "bookmarks") md.push("");
    });
    return md.join("\n");
  }, [groups, list.length, tab, week, map.title, locs]);

  const copyMd = async () => {
    try {
      await navigator.clipboard.writeText(exportMd);
      setCopied(true);
    } catch {
      const pre = document.getElementById("nb-export-pre");
      if (pre) {
        const r = document.createRange();
        r.selectNodeContents(pre);
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
      }
      flash({ text: "Selected. Press ⌘C to copy." });
    }
  };

  // ------------------------------------------------------------ render

  const loading = authLoading || (!!userId && (notes === null || bookmarks === null));
  const counts = { highlights: all.highlights.length, notes: all.notes.length, bookmarks: all.bookmarks.length };
  const inReview = cards.filter((c) => c.source === "highlight").length;
  const hasFilters = week !== "all" || colour !== "all" || !!ql;
  const wkName = week === "all" ? "any week" : week;
  const empty = !loading && list.length === 0;

  let emptyTitle = "";
  let emptyBody = "";
  if (ql) {
    emptyTitle = `No ${NOUN[tab][1]} match “${q.trim()}”.`;
    emptyBody = "Search looks at the quote, your note, the lesson title and the stage.";
  } else if (tab === "highlights") {
    emptyTitle = `Nothing highlighted in ${wkName} yet.`;
    emptyBody = "Select any sentence in a lesson and pick Highlight from the popover. On a phone, long-press. With a keyboard, select and press H.";
  } else if (tab === "notes") {
    emptyTitle = `No notes in ${wkName} yet.`;
    emptyBody = "Notes attach to a sentence. Select text and press N, or choose Note in the selection popover.";
  } else {
    emptyTitle = `No bookmarks in ${wkName} yet.`;
    emptyBody = "Bookmarks save a place in a lesson. Select text and press B, or use the bookmark button in the lesson.";
  }

  const colourChips = (["all", ...COLOUR_ORDER] as ("all" | NoteColor)[]).filter((k) => k === "all" || k !== "purple" || all.highlights.some((x) => x.color === "purple"));
  const hlWeek = all.highlights.filter(matchQ).filter((x) => week === "all" || weekOf(x) === week);

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-7 px-4 pb-24 pt-10 sm:px-6">
      <section aria-labelledby="nb-h" className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-3.5">
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">❯ notebook · {map.title.toLowerCase()}</span>
          <h1 id="nb-h" className="font-display text-[clamp(48px,7vw,96px)] font-extrabold leading-[0.88] tracking-tightest text-fg">
            Notebook<span className="text-signal-text">.</span>
          </h1>
          <p className="max-w-[620px] text-[17px] leading-relaxed text-fg-2 sm:text-lg">
            Everything you marked while reading, in one place. Each item opens the lesson at the stage you saved it from, not a scroll position.
          </p>
        </div>
        {userId && (
          <div className="flex flex-wrap items-center gap-2.5">
            <Link href="/learn/review" className="inline-flex min-h-12 items-center gap-2.5 border border-line-strong px-[18px] text-[15px] text-fg hover:bg-surface-2">
              <span className="font-mono text-signal-text">{inReview}</span>in your review deck ›
            </Link>
            <button
              type="button"
              onClick={() => {
                setCopied(false);
                setExportOpen(true);
              }}
              disabled={loading || list.length === 0}
              className="inline-flex min-h-12 items-center gap-2.5 bg-signal px-[18px] text-[15px] font-semibold text-on-signal disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 3v12" />
                <path d="M7 10l5 5 5-5" />
                <path d="M4 20h16" />
              </svg>
              Export Markdown
            </button>
          </div>
        )}
      </section>

      {userId && savedShorts.length > 0 && (
        <SavedShorts
          rows={savedShorts}
          onRemove={async (row) => {
            setSavedShorts((r) => r.filter((x) => x.id !== row.id));
            const { error } = await supabaseClient.from("bookmarks").delete().eq("id", row.id).eq("user_id", userId);
            if (error) setSavedShorts((r) => [row, ...r]);
          }}
        />
      )}

      {!authLoading && !userId ? (
        <div className="flex flex-wrap items-start gap-8">
          <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-4">
            <AuthPromptBanner variant="notebook" persistent layout="stack" />
            <p className="text-sm text-fg-3">
              Reading never needs an account. <Link href={`/learn/${map.courseId}`} className="text-signal-text underline">Go to the skill tree</Link>.
            </p>
          </div>
          <CaptureTips />
        </div>
      ) : (
        <>
          <section aria-label="Notebook tools" className="flex flex-col gap-4 border-b border-line pb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="tablist" aria-label="Notebook sections" className="grid w-full grid-cols-3 border border-line-strong sm:flex sm:w-auto">
                {(["highlights", "notes", "bookmarks"] as NotebookTab[]).map((t) => {
                  const on = tab === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setTabUrl(t)}
                      className={`inline-flex min-h-12 items-center justify-center gap-2 px-3 text-sm sm:px-[18px] sm:text-[15px] ${on ? "bg-fg font-semibold text-bg" : "text-fg-2 hover:text-fg"}`}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                      <span className={`font-mono text-xs ${on ? "text-bg" : "text-fg-3"}`}>{loading ? "·" : counts[t]}</span>
                    </button>
                  );
                })}
              </div>
              <label className="flex min-h-12 w-full items-center gap-2.5 border border-line-strong bg-surface px-3 sm:w-auto sm:flex-[0_1_380px]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-fg-3" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" />
                </svg>
                <span className="sr-only">Search your notebook</span>
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={`Search ${NOUN[tab][1]}, notes, lessons…`}
                  className="min-h-11 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-4"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="font-mono text-xs tracking-label text-fg-3">WEEK</span>
              <div role="group" aria-label="Filter by week" className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
                {weekChips.map((w) => {
                  const on = week === w.code;
                  const zero = w.count === 0;
                  return (
                    <button
                      key={w.code}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${w.code === "all" ? "All weeks" : w.code === "SQ" ? "Side quests" : `Week ${w.code.slice(1)}`}, ${w.count} items${w.code === currentWeekCode ? ", current week" : ""}`}
                      onClick={() => {
                        setWeek(w.code);
                        setEditId(null);
                        setConfirmId(null);
                      }}
                      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 px-3 font-mono text-[13px] ${
                        on ? "border border-signal bg-signal font-semibold text-on-signal" : zero ? "border border-dashed border-line-strong text-fg-3" : "border border-line-strong bg-surface text-fg"
                      }`}
                    >
                      {w.code === "all" ? "All" : w.code}
                      <span className={`text-[11px] ${on ? "text-on-signal" : zero ? "text-fg-4" : "text-fg-3"}`}>{w.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {tab === "highlights" && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <span className="font-mono text-xs tracking-label text-fg-3">COLOUR</span>
                <div role="group" aria-label="Filter by highlight colour" className="flex flex-wrap gap-1">
                  {colourChips.map((k) => {
                    const on = colour === k;
                    const n = k === "all" ? hlWeek.length : hlWeek.filter((x) => x.color === k).length;
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setColour(k)}
                        className={`inline-flex min-h-11 items-center gap-2 px-3 text-sm ${on ? "border border-fg bg-surface-2 text-fg" : "border border-line-strong text-fg-2"}`}
                      >
                        {k === "all" ? (
                          <span aria-hidden className="flex h-3.5 w-3.5">
                            {COLOUR_ORDER.slice(0, 4).map((c) => (
                              <span key={c} className="h-3.5 flex-1" style={{ background: HIGHLIGHT_COLOURS[c].swatch }} />
                            ))}
                          </span>
                        ) : (
                          <span aria-hidden className="h-3.5 w-3.5" style={{ background: HIGHLIGHT_COLOURS[k].swatch }} />
                        )}
                        {k === "all" ? "All colours" : HIGHLIGHT_COLOURS[k].label}
                        <span className="font-mono text-[11px] text-fg-3">{n}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <div className="flex flex-wrap items-start gap-8">
            <section aria-live="polite" aria-label={`Results`} className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2.5">
                <span className="font-mono text-[13px] text-fg-2">
                  {loading
                    ? "loading your notebook…"
                    : empty
                      ? `0 ${NOUN[tab][1]}`
                      : `${plural(list.length, tab)} · ${groups.length} ${groups.length === 1 ? "lesson" : "lessons"}${week !== "all" ? ` · ${week}${week === currentWeekCode ? " (current week)" : ""}` : " · all weeks"}${tab === "highlights" && colour !== "all" ? ` · ${HIGHLIGHT_COLOURS[colour].label.toLowerCase()}` : ""}`}
                </span>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setWeek("all");
                      setColour("all");
                      setQ("");
                    }}
                    className="min-h-11 px-1 text-sm text-fg-3 underline hover:text-fg"
                  >
                    Clear filters
                  </button>
                )}
              </div>
              {loadError && <p className="border border-line-strong px-4 py-3 text-sm text-fg-2">Some of your notebook could not be loaded. What is shown is what came back.</p>}

              {loading &&
                [0, 1, 2].map((i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <span className="h-7 w-1/2 animate-pulse bg-surface-2" />
                    <span className="h-24 animate-pulse border border-line bg-surface" />
                  </div>
                ))}

              {!loading &&
                groups.map((g) => (
                  <div key={g.meta.key} className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-1">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3.5 gap-y-1">
                        <span className="font-mono text-xs tracking-label text-fg-3">{g.meta.tag}</span>
                        <h2 className="font-display text-2xl font-bold tracking-[-0.025em] text-fg sm:text-[26px]">{g.meta.title}</h2>
                        <span className="font-mono text-xs text-fg-3">{plural(g.items.length, tab)}</span>
                      </div>
                      <Link href={g.meta.href} className="inline-flex min-h-11 items-center text-sm text-signal-text">
                        Open lesson ›
                      </Link>
                    </div>
                    {g.items.map((x) => {
                      const h = hrefFor(x);
                      const editing = editId === x.id;
                      const confirming = confirmId === x.id;
                      const card = reviewByRef.get(x.id);
                      const col = x.color ? HIGHLIGHT_COLOURS[x.color] : null;
                      const noun = NOUN[tab][0];
                      const lp = lessons[x.meta.key];
                      const resumeHere = !!resume && resume.lesson.week === x.meta.week && resume.lesson.slug === x.meta.slug;
                      const bmState =
                        x.kind !== "bookmarks"
                          ? null
                          : locs[x.id] && lp?.completedStages.includes(locs[x.id]!.stageId)
                            ? { text: "✓ STAGE DONE", cls: "border border-fg bg-fg text-bg" }
                            : lp?.status === "completed"
                              ? { text: "✓ LESSON DONE", cls: "border border-fg bg-fg text-bg" }
                              : resumeHere
                                ? { text: "▶ RESUME HERE", cls: "border border-signal text-signal-text" }
                                : lp && lp.status !== "not_started"
                                  ? { text: "STARTED", cls: "border border-line-strong text-fg-2" }
                                  : { text: "NOT STARTED", cls: "border border-dashed border-line-strong text-fg-2" };
                      return (
                        <article
                          key={x.id}
                          className={`flex flex-col gap-2 bg-surface px-4 pb-3.5 pt-2.5 sm:px-[18px] ${confirming ? "border border-bad" : editing ? "border border-signal" : "border border-line"}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                              {x.kind === "highlights" && col && (
                                <span className="inline-flex items-center gap-2 border border-line-strong px-2 py-1 font-mono text-[11px] tracking-label text-fg">
                                  <span aria-hidden className="h-2.5 w-2.5" style={{ background: col.swatch }} />
                                  {col.label.toUpperCase()}
                                </span>
                              )}
                              {x.kind === "notes" && (
                                <span className="inline-flex items-center border border-line-strong px-2 py-1 font-mono text-[11px] tracking-label text-fg">{noteTypeLabel(x.noteType || "general").toUpperCase()}</span>
                              )}
                              {bmState && <span className={`inline-flex items-center px-2 py-1 font-mono text-[11px] tracking-label ${bmState.cls}`}>{bmState.text}</span>}
                              {h.stage && <span className="font-mono text-xs text-fg-3">{h.stage}</span>}
                              <span className="font-mono text-xs text-fg-4">{timeAgo(x.at)}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              <Link href={h.href} className="inline-flex min-h-11 items-center px-2.5 text-sm font-semibold text-signal-text">
                                {h.label}
                              </Link>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditId(editing ? null : x.id);
                                  setDraft(x.kind === "bookmarks" ? x.title : x.note);
                                  setConfirmId(null);
                                }}
                                aria-label={`Edit ${noun} from ${x.meta.title}`}
                                className="inline-flex min-h-11 items-center gap-1.5 border border-line-strong px-2.5 text-[13px] text-fg hover:bg-surface-2"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                  <path d="M4 20h4L19 9l-4-4L4 16z" />
                                </svg>
                                Edit
                              </button>
                              {x.kind !== "bookmarks" && x.quote && !card && (
                                <button
                                  type="button"
                                  onClick={() => makeCard(x)}
                                  aria-label={`Turn this ${noun} into a review card`}
                                  className="inline-flex min-h-11 items-center gap-1.5 border border-signal px-2.5 text-[13px] text-signal-text hover:bg-signal/10"
                                >
                                  <span aria-hidden className="font-mono">
                                    +
                                  </span>
                                  Review card
                                </button>
                              )}
                              {x.kind !== "bookmarks" && card && (
                                <Link href="/learn/review" className="inline-flex min-h-11 items-center gap-1.5 border border-line bg-surface-2 px-2.5 text-[13px] text-fg">
                                  <span aria-hidden className="font-mono text-signal-text">
                                    ✓
                                  </span>
                                  In review · Box {card.box} ›
                                </Link>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmId(x.id);
                                  setEditId(null);
                                }}
                                aria-label={`Delete ${noun} from ${x.meta.title}`}
                                className="grid h-11 w-11 place-items-center border border-line-strong text-fg-3 hover:text-fg"
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                  <path d="M4 7h16" />
                                  <path d="M9 7V4h6v3" />
                                  <path d="M6 7l1 13h10l1-13" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {x.kind === "bookmarks" && (
                            <span className="font-display text-[22px] font-bold leading-tight tracking-[-0.015em] text-fg">{x.title || (x.quote ? `“${x.quote.slice(0, 120)}${x.quote.length > 120 ? "…" : ""}”` : x.meta.title)}</span>
                          )}
                          {(x.kind === "notes" || x.kind === "bookmarks") && x.note && !editing && <p className="text-[17px] leading-relaxed text-fg">{x.note}</p>}
                          {x.kind !== "bookmarks" && x.quote && (
                            <p className={x.kind === "highlights" ? "text-[17px] leading-[1.7] text-fg" : "pl-3.5 text-[15px] leading-relaxed text-fg-3 shadow-[inset_1px_0_0_var(--c-line-strong)]"}>
                              {x.kind === "highlights" && col ? (
                                <span className="py-0.5 [box-decoration-break:clone]" style={{ background: col.tint, boxShadow: `inset 0 -2px 0 ${col.swatch}` }}>
                                  {x.quote}
                                </span>
                              ) : (
                                x.quote
                              )}
                            </p>
                          )}
                          {x.kind === "bookmarks" && x.title && x.quote && <p className="pl-3.5 text-[15px] leading-relaxed text-fg-3 shadow-[inset_1px_0_0_var(--c-line-strong)]">{x.quote}</p>}

                          {editing && (
                            <div className="flex animate-hk-in flex-col gap-2 border border-line-strong bg-bg p-3.5">
                              <label className="flex flex-col gap-1.5">
                                <span className="font-mono text-[11px] tracking-label text-fg-3">{x.kind === "bookmarks" ? "BOOKMARK LABEL" : "YOUR NOTE"}</span>
                                <textarea
                                  rows={x.kind === "bookmarks" ? 1 : 3}
                                  value={draft}
                                  autoFocus
                                  onChange={(e) => setDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") setEditId(null);
                                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") saveEdit(x);
                                  }}
                                  placeholder={x.kind === "bookmarks" ? "Name this bookmark" : "Why did this matter?"}
                                  className="resize-y border border-signal bg-surface px-3 py-2.5 text-[15px] leading-normal text-fg outline-none placeholder:text-fg-4"
                                />
                              </label>
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => saveEdit(x)} disabled={busy === x.id} className="min-h-11 bg-signal px-4 text-sm font-semibold text-on-signal disabled:opacity-60">
                                  {busy === x.id ? "Saving…" : "Save"}
                                </button>
                                <button type="button" onClick={() => setEditId(null)} className="min-h-11 border border-line-strong px-4 text-sm text-fg">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {confirming && (
                            <div role="alertdialog" aria-label={`Delete this ${noun}?`} className="flex animate-hk-in flex-wrap items-center justify-between gap-3 border border-bad bg-bg px-3.5 py-3">
                              <span className="flex flex-col gap-0.5">
                                <span className="text-[15px] font-semibold text-fg">Delete this {noun}?</span>
                                <span className="text-[13px] text-fg-3">{card ? "Its review card goes too. You can undo for a few seconds." : "You can undo for a few seconds."}</span>
                              </span>
                              <span className="flex gap-2">
                                <button type="button" autoFocus onClick={() => setConfirmId(null)} className="min-h-11 border border-line-strong px-4 text-sm text-fg">
                                  Keep it
                                </button>
                                <button type="button" onClick={() => doDelete(x)} disabled={busy === x.id} className="min-h-11 bg-bad px-4 text-sm font-semibold text-[#120203] disabled:opacity-60">
                                  {busy === x.id ? "Deleting…" : "Delete"}
                                </button>
                              </span>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ))}

              {empty && (
                <div className="flex animate-hk-in flex-col items-start gap-3.5 border border-dashed border-line-strong bg-raised px-6 py-10 sm:px-8">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" strokeWidth="1.5" aria-hidden className="text-fg-4">
                    <rect x="7" y="5" width="26" height="30" stroke="currentColor" />
                    <path d="M12 13h16M12 19h16M12 25h9" stroke="currentColor" />
                    <path d="M27 25l6 6" stroke="var(--c-signal)" />
                  </svg>
                  <span className="font-display text-[28px] font-bold tracking-[-0.02em] text-fg">{emptyTitle}</span>
                  <span className="max-w-[560px] text-base leading-relaxed text-fg-2">{emptyBody}</span>
                  <div className="flex flex-wrap gap-2.5">
                    {hasFilters && (
                      <button
                        type="button"
                        onClick={() => {
                          setWeek("all");
                          setColour("all");
                          setQ("");
                        }}
                        className="min-h-12 bg-fg px-[18px] text-[15px] font-semibold text-bg"
                      >
                        {ql ? "Clear search and filters" : "Show all weeks"}
                      </button>
                    )}
                    <Link href={`/learn/${map.courseId}`} className="inline-flex min-h-12 items-center border border-line-strong px-[18px] text-[15px] text-fg">
                      Go to the skill tree
                    </Link>
                  </div>
                </div>
              )}
            </section>

            <aside className="flex w-full flex-col gap-4 lg:w-auto lg:max-w-[340px] lg:flex-[1_1_280px]">
              {tab === "highlights" && (
                <div className="flex flex-col gap-3 border border-line bg-surface p-[18px]">
                  <span className="font-mono text-xs uppercase tracking-label text-fg-3">Colour key</span>
                  {COLOUR_ORDER.filter((k) => k !== "purple" || all.highlights.some((x) => x.color === "purple")).map((k) => (
                    <div key={k} className="flex items-start gap-3">
                      <span aria-hidden className="mt-0.5 h-4 w-4 shrink-0" style={{ background: HIGHLIGHT_COLOURS[k].swatch }} />
                      <span className="flex flex-1 flex-col gap-0.5">
                        <span className="text-sm font-semibold text-fg">{HIGHLIGHT_COLOURS[k].label}</span>
                        <span className="text-[13px] text-fg-3">{HIGHLIGHT_COLOURS[k].desc}</span>
                      </span>
                      <span className="font-mono text-[13px] text-fg-2">{all.highlights.filter((x) => x.color === k).length}</span>
                    </div>
                  ))}
                </div>
              )}
              <CaptureTips />
            </aside>
          </div>
        </>
      )}

      {exportOpen && (
        <Overlay labelledBy="nb-export-h" onClose={() => setExportOpen(false)} align="top" className="max-w-[760px] border border-line-strong bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <span className="flex flex-col gap-1">
              <span className="font-mono text-xs tracking-label text-signal-text">EXPORT · MARKDOWN</span>
              <h2 id="nb-export-h" className="font-display text-[26px] font-bold tracking-[-0.02em] text-fg">
                {plural(list.length, tab)} {week !== "all" ? `from ${week}` : "from all weeks"}
              </h2>
            </span>
            <button type="button" onClick={() => setExportOpen(false)} aria-label="Close export" className="grid h-11 w-11 place-items-center border border-line-strong text-lg text-fg">
              ×
            </button>
          </div>
          <div className="flex flex-col gap-3 px-5 py-4">
            <span className="text-sm text-fg-3">Exports what you see: the current tab, week{tab === "highlights" ? " and colour" : ""} filters and search. Each item keeps its lesson and stage, so you can find it again.</span>
            <pre id="nb-export-pre" className="max-h-[360px] overflow-auto whitespace-pre-wrap border border-line bg-bg p-4 font-mono text-[13px] leading-[1.65] text-fg-2">
              {exportMd}
            </pre>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
            <button type="button" onClick={() => setExportOpen(false)} className="min-h-12 border border-line-strong px-[18px] text-[15px] text-fg">
              Close
            </button>
            <button type="button" onClick={copyMd} className="min-h-12 bg-signal px-5 text-[15px] font-semibold text-on-signal">
              {copied ? "Copied ✓" : "Copy Markdown"}
            </button>
          </div>
        </Overlay>
      )}

      <MiniToast toast={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}

function CaptureTips() {
  return (
    <div className="flex w-full flex-col gap-4 lg:w-auto lg:max-w-[340px] lg:flex-[1_1_280px]">
      <div className="flex flex-col gap-2.5 border border-line bg-surface p-[18px]">
        <span className="font-mono text-xs uppercase tracking-label text-fg-3">Capture while reading</span>
        <span className="text-sm leading-normal text-fg-2">Select text and a popover offers highlight, note and bookmark. On a phone, long-press a sentence.</span>
        <div className="flex flex-col gap-1.5 text-[13px] text-fg-2">
          {[
            ["H", "highlight selection"],
            ["N", "add a note"],
            ["B", "bookmark this place"],
          ].map(([k, t]) => (
            <span key={k} className="flex items-center gap-2.5">
              <kbd className="min-w-6 border border-line-strong px-1.5 py-0.5 text-center font-mono text-xs">{k}</kbd>
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2.5 border border-line bg-surface p-[18px]">
        <span className="font-mono text-xs uppercase tracking-label text-fg-3">Highlight → review card</span>
        <span className="text-sm leading-normal text-fg-2">“+ Review card” blanks the key phrase and adds it to your daily standup in Box 1.</span>
        <Link href="/learn/review" className="inline-flex min-h-11 items-center text-sm font-semibold text-signal-text">
          Open daily standup ›
        </Link>
      </div>
    </div>
  );
}

/** Shorts saved from the feed: a row of 9:16 cards that reopen the feed at that short. */
function SavedShorts({ rows, onRemove }: { rows: BookmarkRow[]; onRemove: (row: BookmarkRow) => void }) {
  const media = (process.env.NEXT_PUBLIC_LECTURE_MEDIA || "").replace(/\/$/, "");
  return (
    <section aria-labelledby="nb-shorts" className="flex flex-col gap-3 border-b border-line pb-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="nb-shorts" className="m-0 font-mono text-xs uppercase tracking-label text-signal-text">
          saved shorts · {rows.length}
        </h2>
        <Link href="/learn/shorts" className="font-mono text-xs text-fg-3 hover:text-fg">
          watch more ›
        </Link>
      </div>
      <ul className="m-0 flex list-none gap-3 overflow-x-auto p-0 pb-1 [scrollbar-width:thin]">
        {rows.map((r) => (
          <li key={r.id} className="group relative w-[132px] shrink-0 sm:w-[150px]">
            <Link href={`/learn/shorts?v=${encodeURIComponent(r.lesson_slug)}`} className="flex flex-col gap-1.5">
              <span className="relative block aspect-[9/16] overflow-hidden border border-line-strong bg-[#0b0b0c]">
                {media && (
                  // eslint-disable-next-line @next/next/no-img-element -- the short's own poster frame from the media host
                  <img src={`${media}/${r.lesson_slug}/poster.jpg`} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                )}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-6 font-mono text-[10px] uppercase tracking-[0.06em] text-[#f3f2ee]">▶ play</span>
              </span>
              {r.bookmark_text && <span className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-fg-3">{r.bookmark_text}</span>}
              <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-fg">{r.custom_title || r.lesson_slug}</span>
            </Link>
            <button
              type="button"
              onClick={() => onRemove(r)}
              aria-label={`Remove ${r.custom_title || "short"} from saved`}
              className="absolute right-1 top-1 grid h-7 w-7 place-items-center bg-black/60 text-[13px] text-[#f3f2ee] hover:bg-signal hover:text-on-signal"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
