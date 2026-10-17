"use client";

/**
 * Course search (⌘K on /learn). Grouped results: lessons, interview questions, your notes.
 * Data: the existing /api/search payload (loaded the first time the palette opens, not on mount)
 * plus, for signed-in learners, their own content_notes.
 *
 * Variants: "nav" (course search in the site header), "bar" (full-width trigger), "floating" (legacy: the
 * the site header owns search now, so it renders nothing). Only an instance with `hotkey` listens
 * for ⌘K / Ctrl+K and for the `hk:course-search` window event.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import Fuse from "fuse.js";
import type { LearningResource } from "@/lib/github";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseClient } from "@/lib/supabase-client";
import { track } from "@/lib/track";
import { InlineLoader } from "@/components/ui/loader";

type Doc = LearningResource & { content?: string; excerpt?: string };
type Group = "lessons" | "questions" | "notes";
type Hit = {
  id: string;
  group: Group;
  badge: string;
  title: string;
  sub: string;
  meta?: string;
  href: string;
};

const COURSE = "system-design-mastery";
const RECENT_KEY = "hk.search.recent";
export const COURSE_SEARCH_EVENT = "hk:course-search";

const pad = (n: number) => String(n).padStart(2, "0");

function weekNum(week: string) {
  const m = week.match(/week-(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function badgeFor(d: { week: string; slug: string; type?: string }) {
  const n = weekNum(d.week);
  const W = n === null ? "" : `W${pad(n)}`;
  if (d.type === "bonus" || d.week === "bonus-problems") return `SQ-${pad(parseInt(d.slug.match(/bonus-(\d+)/)?.[1] || "0", 10))}`;
  if (d.type === "overview" || d.week === "overview") return "PLAN";
  if (d.type === "capstone" || d.slug.includes("capstone")) return `${W}·B`;
  if (d.type === "week-preview" || d.slug.includes("preview")) return `${W}·PRE`;
  if (d.type === "mcq" || d.slug.includes("mcq")) return `${W}·T`;
  const part = d.slug.match(/part-(\d+)/)?.[1];
  if (part) return `${W}·P${part}`;
  const day = d.slug.match(/day-(\d+)/)?.[1];
  if (day) return `${W}·D${parseInt(day, 10)}`;
  return W || "—";
}

function topicFor(week: string) {
  if (week === "overview") return "Course plan";
  if (week === "bonus-problems") return "Side quests";
  const m = week.match(/week-(\d+)-(.+)/);
  if (!m) return week;
  return `Week ${pad(parseInt(m[1], 10))} · ${m[2].replace(/-/g, " ").replace("tanency", "tenancy")}`;
}

function snippet(text: string, q: string, span = 70) {
  if (!text) return "";
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, span * 2).trim() + (text.length > span * 2 ? "…" : "");
  const start = Math.max(0, i - span);
  const end = Math.min(text.length, i + q.length + span);
  return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}

/** Wraps case-insensitive matches of q in <mark>. */
function Highlight({ text, q, soft }: { text: string; q: string; soft?: boolean }) {
  const parts = useMemo(() => {
    const t = q.trim();
    if (!t) return [text];
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.split(new RegExp(`(${esc})`, "ig"));
  }, [text, q]);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            className={soft ? "bg-transparent text-fg-2 shadow-[inset_0_-1px_0_var(--c-signal)]" : "bg-signal/25 text-fg shadow-[inset_0_-2px_0_var(--c-signal)]"}
          >
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

type NoteRow = { id: string; week: string; lesson_slug: string; note_text: string | null; highlight_text: string | null; note_type: string; created_at: string; highlight_offset: number | null };

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | Group>("all");
  const [sel, setSel] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  // the course index couldn't load (offline): say so instead of "nothing matches"
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    try {
      setRecent(JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]").slice(0, 5));
    } catch {
      setRecent([]);
    }
    let off = false;
    fetch("/api/search")
      .then((r) => r.json())
      .then((d) => {
        if (!off) setDocs((d.results || []) as Doc[]);
      })
      .catch(() => {
        if (!off) {
          setDocs([]);
          setFailed(true);
        }
      });
    return () => {
      off = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let off = false;
    supabaseClient
      .from("content_notes")
      .select("id, week, lesson_slug, note_text, highlight_text, note_type, created_at, highlight_offset")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        if (!off && data) setNotes(data as NoteRow[]);
      });
    return () => {
      off = true;
    };
  }, [user]);

  const titleOf = useMemo(() => {
    const m = new Map<string, string>();
    (docs || []).forEach((d) => m.set(`${d.week}/${d.slug}`, d.title));
    return m;
  }, [docs]);

  const questions = useMemo(() => {
    const out: { id: string; doc: Doc; n: string; text: string }[] = [];
    (docs || []).forEach((d) => {
      const re = /Question\s+(\d+)\s*[:.]\s*["“]([^"”]{8,220})["”]/g;
      let m: RegExpExecArray | null;
      const content = d.content || "";
      while ((m = re.exec(content))) out.push({ id: `${d.week}/${d.slug}/q${m[1]}/${m.index}`, doc: d, n: m[1], text: m[2].trim() });
    });
    return out;
  }, [docs]);

  const fuse = useMemo(
    () =>
      docs
        ? new Fuse(docs, {
            keys: [
              { name: "title", weight: 3 },
              { name: "content", weight: 1 },
              { name: "week", weight: 0.6 },
            ],
            threshold: 0.35,
            ignoreLocation: true,
            minMatchCharLength: 2,
          })
        : null,
    [docs]
  );

  const { hits, ms } = useMemo(() => {
    const t = q.trim();
    if (!t || !docs) return { hits: [] as Hit[], ms: 0 };
    const t0 = performance.now();
    const lower = t.toLowerCase();
    const lessonHits: Hit[] = (fuse?.search(t).slice(0, 8) || []).map(({ item: d }) => ({
      id: `l:${d.week}/${d.slug}`,
      group: "lessons",
      badge: badgeFor(d),
      title: d.title,
      sub: snippet(d.content || d.excerpt || "", t, 60) || topicFor(d.week),
      meta: topicFor(d.week),
      href: `/learn/${COURSE}/${d.week}/${d.slug}?highlight=${encodeURIComponent(t)}`,
    }));
    const qHits: Hit[] = questions
      .filter((x) => x.text.toLowerCase().includes(lower))
      .slice(0, 6)
      .map((x) => ({
        id: `q:${x.id}`,
        group: "questions",
        badge: `Q ${x.n}`,
        title: `“${x.text}”`,
        sub: `${x.doc.title} · ${topicFor(x.doc.week)} · strong answer inside`,
        href: `/learn/${COURSE}/${x.doc.week}/${x.doc.slug}?highlight=${encodeURIComponent(x.text.slice(0, 60))}`,
      }));
    const nHits: Hit[] = notes
      .filter((n) => `${n.note_text || ""} ${n.highlight_text || ""}`.toLowerCase().includes(lower))
      .slice(0, 6)
      .map((n) => {
        const isNote = !!(n.note_text && n.note_text.trim());
        return {
          id: `n:${n.id}`,
          group: "notes",
          badge: isNote ? "NOTE" : "HL",
          title: (isNote ? n.note_text : n.highlight_text) || "",
          sub: `${isNote ? "note" : "highlight"} · ${titleOf.get(`${n.week}/${n.lesson_slug}`) || n.lesson_slug} · ${new Date(n.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`,
          href: `/learn/${COURSE}/${n.week}/${n.lesson_slug}${n.highlight_offset !== null ? `#note-${n.highlight_offset}` : ""}`,
        };
      });
    return { hits: [...lessonHits, ...qHits, ...nHits], ms: Math.max(1, Math.round(performance.now() - t0)) };
  }, [q, docs, fuse, questions, notes, titleOf]);

  const counts = useMemo(
    () => ({
      all: hits.length,
      lessons: hits.filter((h) => h.group === "lessons").length,
      questions: hits.filter((h) => h.group === "questions").length,
      notes: hits.filter((h) => h.group === "notes").length,
    }),
    [hits]
  );
  const visible = filter === "all" ? hits : hits.filter((h) => h.group === filter);

  useEffect(() => {
    setSel(0);
  }, [q, filter]);

  // analytics: one `search` event per settled query (1.2 s idle) — length only, never the text
  useEffect(() => {
    const t = q.trim();
    if (!t || !docs) return;
    const id = window.setTimeout(() => track("search", { q_len: t.length, results: hits.length }), 1200);
    return () => window.clearTimeout(id);
  }, [q, docs, hits.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const remember = useCallback(() => {
    const t = q.trim();
    if (!t) return;
    try {
      const next = [t, ...recent.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 5);
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, [q, recent]);

  const open = useCallback(
    (h: Hit, newTab = false) => {
      remember();
      if (newTab) {
        window.open(h.href, "_blank", "noopener");
        return;
      }
      onClose();
      router.push(h.href);
    },
    [remember, onClose, router]
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (visible.length) setSel((s) => (s + 1) % visible.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (visible.length) setSel((s) => (s - 1 + visible.length) % visible.length);
    } else if (e.key === "Enter" && visible[sel]) {
      e.preventDefault();
      open(visible[sel], e.metaKey || e.ctrlKey);
    } else if (e.key === "Tab" && visible.length && e.target === inputRef.current) {
      // tab jumps to the first result of the next group
      e.preventDefault();
      const cur = visible[sel]?.group;
      const order: Group[] = ["lessons", "questions", "notes"];
      const start = cur ? order.indexOf(cur) : -1;
      for (let k = 1; k <= 3; k++) {
        const g = order[(start + (e.shiftKey ? -k + 3 : k)) % 3];
        const idx = visible.findIndex((h) => h.group === g);
        if (idx >= 0) {
          setSel(idx);
          break;
        }
      }
    }
  };

  const groups: { key: Group; label: string; more?: { label: string; href: string } }[] = [
    { key: "lessons", label: "Lessons" },
    { key: "questions", label: "Interview questions" },
    { key: "notes", label: "Your notes", more: { label: "open notebook →", href: "/learn/notebook?tab=notes" } },
  ];
  const chip = (on: boolean) =>
    `min-h-8 px-2.5 font-mono text-xs ${on ? "bg-fg font-semibold text-bg" : "border border-line-strong text-fg-2 hover:text-fg"}`;

  let idx = -1;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/70 px-3 pt-[8vh] sm:px-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Search the course" className="flex max-h-[calc(100dvh-8vh-110px)] w-full max-w-[700px] lg:max-h-[84vh] animate-hk-in flex-col border border-line-strong bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.7)]">
        <label className="flex min-h-[60px] items-center gap-3 border-b border-line px-4 focus-within:shadow-[inset_0_-2px_0_var(--c-signal)]">
          <Search className="h-[18px] w-[18px] shrink-0 text-signal-text" aria-hidden />
          <span className="sr-only">Search lessons, interview questions and your notes</span>
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            aria-controls="course-search-results"
            placeholder="Search lessons, questions, notes…"
            className="min-h-11 min-w-0 flex-1 appearance-none bg-transparent text-lg text-fg outline-none placeholder:text-fg-4 focus-visible:outline-none sm:text-xl [&::-webkit-search-cancel-button]:hidden"
          />
          {q.trim() && docs && (
            <span className="hidden whitespace-nowrap font-mono text-[11px] text-fg-3 sm:inline">
              {counts.all} results · {ms} ms
            </span>
          )}
          <button type="button" onClick={onClose} aria-label="Close search" className="min-h-8 min-w-11 border border-line-strong font-mono text-[11px] text-fg-3 hover:text-fg">
            esc
          </button>
        </label>

        {q.trim() && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2.5">
            {(
              [
                ["all", "all"],
                ["lessons", "lessons"],
                ["questions", "interview qs"],
                ...(user ? [["notes", "your notes"]] : []),
              ] as [("all" | Group), string][]
            ).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={chip(filter === k)}>
                {label} {counts[k]}
              </button>
            ))}
          </div>
        )}

        {!q.trim() && recent.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2">
            <span className="pr-1 font-mono text-[11px] tracking-label text-fg-4">RECENT</span>
            {recent.map((r) => (
              <button key={r} type="button" onClick={() => setQ(r)} className="min-h-8 border border-dashed border-line-strong px-2 font-mono text-xs text-fg-3 hover:text-fg">
                {r}
              </button>
            ))}
          </div>
        )}

        <div id="course-search-results" ref={listRef} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 pt-1.5">
          {!q.trim() && (
            <p className="px-2 py-6 text-sm leading-relaxed text-fg-3">
              Titles, headings, interview questions{user ? " and your own notes" : ""}. Try <span className="font-mono text-fg-2">idempotency</span>, <span className="font-mono text-fg-2">half-open</span> or{" "}
              <span className="font-mono text-fg-2">hot keys</span>.
            </p>
          )}
          {q.trim() && docs === null && <p className="px-2 py-6"><InlineLoader label="loading the course index" /></p>}
          {q.trim() && failed && visible.length === 0 && (
            <p className="px-2 py-6 text-sm leading-relaxed text-fg-3">
              Search needs a connection. Lessons saved on this device are in the{" "}
              <Link href="/learn/offline" onClick={onClose} className="text-signal-text underline decoration-line-strong underline-offset-4">
                offline library
              </Link>
              .
            </p>
          )}
          {q.trim() && docs && !failed && visible.length === 0 && (
            <p className="px-2 py-6 text-sm text-fg-3">
              Nothing matches <span className="text-fg">“{q.trim()}”</span>. Search looks at lesson titles and text{user ? ", interview questions and your notes" : " and interview questions"}.
            </p>
          )}
          {groups.map((g) => {
            const items = visible.filter((h) => h.group === g.key);
            if (!items.length) return null;
            return (
              <div key={g.key}>
                <div className="flex justify-between px-2 pb-1.5 pt-3 font-mono text-[11px] tracking-label text-fg-3">
                  <span>
                    {g.label.toUpperCase()} · {items.length}
                  </span>
                  {g.more && (
                    <a href={g.more.href} className="text-fg-3 hover:text-fg">
                      {g.more.label}
                    </a>
                  )}
                </div>
                {items.map((h) => {
                  idx++;
                  const i = idx;
                  const on = i === sel;
                  return (
                    <a
                      key={h.id}
                      href={h.href}
                      role="option"
                      aria-selected={on}
                      data-idx={i}
                      onMouseEnter={() => setSel(i)}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey) return;
                        e.preventDefault();
                        open(h);
                      }}
                      className={`flex min-h-[52px] items-center gap-3 border px-2.5 py-1.5 ${on ? "border-signal bg-surface-2" : "border-transparent"}`}
                    >
                      <span
                        className={`grid h-7 w-[62px] shrink-0 place-items-center font-mono text-[11px] ${
                          h.group === "notes"
                            ? "bg-fg font-semibold text-bg"
                            : h.group === "questions"
                              ? "border border-line-strong text-fg"
                              : on
                                ? "bg-signal font-semibold text-on-signal"
                                : "border border-dashed border-line-strong text-fg-3"
                        }`}
                      >
                        {h.badge}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px] text-fg">
                          <Highlight text={h.title} q={q} />
                        </span>
                        <span className="line-clamp-1 text-xs text-fg-3">
                          <Highlight text={h.sub} q={q} soft />
                        </span>
                      </span>
                      {on && <span className="hidden font-mono text-[13px] text-signal-text sm:inline" aria-hidden>↵</span>}
                    </a>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="hidden flex-wrap justify-between gap-2 border-t border-line px-4 py-2.5 font-mono text-[11px] text-fg-3 sm:flex">
          <span>
            <span className="text-fg">↑↓</span> move · <span className="text-fg">↵</span> open · <span className="text-fg">⌘↵</span> new tab · <span className="text-fg">tab</span> next group ·{" "}
            <span className="text-fg">esc</span> close
          </span>
          <span>titles · text · questions{user ? " · your notes" : ""}</span>
        </div>
      </div>
    </div>
  );
}

type SearchBarProps = {
  variant?: "bar" | "floating" | "nav";
  /** listen for ⌘K / Ctrl+K and the hk:course-search event (one instance per page: the site header) */
  hotkey?: boolean;
};

export default function SearchBar({ variant = "bar", hotkey = false }: SearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((o) => !o);
      }
    };
    const onOpen = () => setIsOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(COURSE_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(COURSE_SEARCH_EVENT, onOpen);
    };
  }, [hotkey]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (variant === "floating") return null;

  return (
    <>
      {variant === "nav" ? (
        <>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setIsOpen(true)}
            className="hidden min-h-10 w-[240px] items-center gap-2.5 border border-line-strong bg-bg px-3 text-left text-sm text-fg-4 hover:text-fg-3 md:flex"
          >
            <Search className="h-[15px] w-[15px] text-fg-3" aria-hidden />
            <span className="flex-1">Search lessons, topics…</span>
            <kbd className="border border-line-strong px-1.5 py-0.5 font-mono text-[11px] text-fg-3">⌘K</kbd>
          </button>
          <button type="button" onClick={() => setIsOpen(true)} aria-label="Search the course" className="grid h-11 w-11 shrink-0 place-items-center border border-line-strong text-fg md:hidden">
            <Search className="h-4 w-4" aria-hidden />
          </button>
        </>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex min-h-12 w-full items-center justify-between gap-3 border border-line-strong bg-surface px-4 text-left hover:border-fg-4"
        >
          <span className="flex items-center gap-3 text-fg-3">
            <Search className="h-4 w-4" aria-hidden />
            <span className="text-sm sm:text-base">Search lessons, topics, concepts…</span>
          </span>
          <kbd className="hidden border border-line-strong px-1.5 py-0.5 font-mono text-[11px] text-fg-3 sm:inline">⌘K</kbd>
        </button>
      )}
      {isOpen && typeof document !== "undefined" && createPortal(<Palette onClose={close} />, document.body)}
    </>
  );
}
