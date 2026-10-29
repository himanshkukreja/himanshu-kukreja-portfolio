"use client";

/**
 * The instant results beside the chat: the deterministic smart search (/api/search/smart, no AI, CDN-cached
 * per query) for what is being typed or was last asked. For everyone, signed in or not; when the chat can't
 * answer, these are the answer.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { track } from "@/lib/track";
import { atClock } from "@/lib/search/smart/engine";
import { KIND_LABEL, type Hit, type Kind, type SmartResults } from "@/lib/search/smart/types";
import KindIcon from "@/components/learn/search/KindIcon";

type Load = { state: "idle" } | { state: "loading"; q: string } | { state: "done"; q: string; data: SmartResults } | { state: "error"; q: string; message: string };

function Marked({ text, words }: { text: string; words: string[] }) {
  const parts = useMemo(() => {
    const ws = words.filter((w) => w.length > 2).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return ws.length ? text.split(new RegExp(`(\\b(?:${ws.join("|")})[a-z]*)`, "ig")) : [text];
  }, [text, words]);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <mark key={i} className="bg-transparent text-fg shadow-[inset_0_-2px_0_var(--c-signal)]">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Row({ h, words }: { h: Hit; words: string[] }) {
  return (
    <li>
      <Link href={h.href} className="flex flex-col gap-1 border-b border-line px-1 py-3 hover:bg-surface-2">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-label text-signal-text">
            <KindIcon kind={h.kind} className="h-3.5 w-3.5" />
            {KIND_LABEL[h.kind].tag}
          </span>
          {h.kind === "moment" && h.at >= 0 && (
            <span className="inline-flex items-center gap-1 border border-line-strong px-1 font-mono text-[10.5px] text-fg">
              <Clock className="h-3 w-3" aria-hidden />
              {atClock(h.at)}
            </span>
          )}
          <span className="min-w-0 truncate font-mono text-[11px] text-fg-4">{h.sub}</span>
        </span>
        <span className="text-[15px] font-semibold leading-snug text-fg">
          <Marked text={h.title} words={words} />
        </span>
        {h.summary && (
          <span className="line-clamp-2 text-[13.5px] leading-relaxed text-fg-3">
            <Marked text={h.summary} words={words} />
          </span>
        )}
      </Link>
    </li>
  );
}

export default function ResultsRail({ q, headers, onCount, className = "" }: { q: string; headers?: Record<string, string>; onCount?: (n: number | null) => void; className?: string }) {
  const [load, setLoad] = useState<Load>({ state: "idle" });
  const [filter, setFilter] = useState<Kind | "all">("all");
  const key = q.trim().slice(0, 300);
  useEffect(() => setFilter("all"), [key]);
  useEffect(() => {
    if (key.length < 2) {
      setLoad({ state: "idle" });
      onCount?.(null);
      return;
    }
    let off = false;
    setLoad((l) => (l.state === "done" ? l : { state: "loading", q: key }));
    const t0 = performance.now();
    fetch(`/api/search/smart?q=${encodeURIComponent(key)}`, { headers })
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b?.error || "Search didn't load.");
        return b as SmartResults;
      })
      .then((data) => {
        if (off) return;
        setLoad({ state: "done", q: key, data });
        onCount?.(data.total);
        track("smart_search", { q_len: key.length, natural: data.natural, results: data.total, ms: Math.round(performance.now() - t0), from: "chat" });
      })
      .catch((e: Error) => !off && setLoad({ state: "error", q: key, message: e.message }));
    return () => {
      off = true;
    };
    // headers and onCount are stable for the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const data = load.state === "done" ? load.data : null;
  const words = data ? [...data.terms, ...data.fixes.map((f) => f.to), ...data.expanded.slice(0, 3).flatMap((e) => e.split(" "))] : [];
  const groups = data ? data.groups.filter((g) => filter === "all" || g.kind === filter) : [];
  const flat = filter === "all" ? groups.flatMap((g) => g.hits.slice(0, 3)).sort((a, b) => b.score - a.score) : groups.flatMap((g) => g.hits);
  return (
    <section aria-labelledby="rail-h" className={`flex min-w-0 flex-col gap-3 ${className}`}>
      <div className="flex items-baseline justify-between gap-2 border-b border-line pb-2">
        <h2 id="rail-h" className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">
          Instant results
        </h2>
        <span className="font-mono text-[11px] text-fg-4" role="status" aria-live="polite">
          {load.state === "loading" ? "searching…" : data ? `${data.total} · ${data.ms} ms · no AI` : ""}
        </span>
      </div>
      {load.state === "idle" && <p className="m-0 text-[14px] leading-relaxed text-fg-3">Type to search every lesson, lecture moment, short, quest, problem, mock, war story, drill and sheet. Results appear as you type, for everyone.</p>}
      {load.state === "error" && <p className="m-0 text-[14px] text-fg-3">{load.message}</p>}
      {data && (data.fixes.length > 0 || data.weak) && (
        <p className="m-0 text-[13px] text-fg-3">
          {data.fixes.length > 0 && <>Showing results for <span className="text-fg">{data.fixes.map((f) => f.to).join(", ")}</span>. </>}
          {data.weak && "Only passing mentions match: the course may not teach this directly."}
        </p>
      )}
      {data && data.total === 0 && <p className="m-0 text-[14px] text-fg-3">Nothing in the course matches “{load.state === "done" ? load.q : ""}”. Try other words.</p>}
      {data && data.groups.length > 1 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Show one kind">
          {[{ kind: "all" as const, n: data.total }, ...data.groups.map((g) => ({ kind: g.kind, n: g.hits.length }))].map((c) => (
            <button
              key={c.kind}
              type="button"
              aria-pressed={filter === c.kind}
              onClick={() => setFilter(c.kind)}
              className={`min-h-8 px-2 font-mono text-[11px] ${filter === c.kind ? "bg-fg font-semibold text-bg" : "border border-line-strong text-fg-3 hover:text-fg"}`}
            >
              {c.kind === "all" ? "top" : KIND_LABEL[c.kind].group.toLowerCase()} {c.n}
            </button>
          ))}
        </div>
      )}
      {flat.length > 0 && (
        <ul className="m-0 list-none p-0" aria-busy={load.state === "loading"}>
          {flat.slice(0, filter === "all" ? 14 : 30).map((h) => (
            <Row key={h.id} h={h} words={words} />
          ))}
        </ul>
      )}
      {data && data.total > 0 && (
        <Link href={`/learn/search?q=${encodeURIComponent(load.state === "done" ? load.q : "")}&view=results`} className="self-start font-mono text-[11px] text-fg-3 underline decoration-line-strong underline-offset-2 hover:text-fg">
          {data.total} results in all →
        </Link>
      )}
    </section>
  );
}
