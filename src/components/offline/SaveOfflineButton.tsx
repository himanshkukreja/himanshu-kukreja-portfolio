"use client";

/**
 * "Save offline" for one article (lesson, preview, boss, side quest, trial, mock, case file) or a
 * video lecture (its page plus the recorded audio, music, captions and poster).
 * Saved → a small panel with the date, size, update / remove and the library link; a saved lesson
 * that has a video lecture offers that too (never saved automatically: it is ~10–20 MB).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, CloudDownload, Loader2, RefreshCw, WifiOff } from "lucide-react";
import type { CatalogItem, OfflineKind } from "@/lib/offline/types";
import { isQueued, enqueueSave, useSaveJob } from "@/lib/offline/jobs";
import { pathOf, removeSaved } from "@/lib/offline/store";
import { trackRemove } from "@/lib/offline/analytics";
import { findItem, useOffline, withHub } from "./OfflineProvider";
import { fmtBytes, fmtSaved } from "./format";
import { labRuntimeExtra } from "@/lib/offline/labs";
import { lectureSharedExtra } from "@/lib/offline/lectures";
import { defaultGroupOf } from "@/lib/offline/sections";

type Props = {
  title: string;
  kind: OfflineKind;
  /** defaults to the current page */
  url?: string;
  /** icon-only below lg (beside a breadcrumb) */
  compact?: boolean;
  /** lectures: the folder of the recorded media (used when the catalog doesn't list the lecture) */
  mediaBase?: string;
  className?: string;
};

export default function SaveOfflineButton({ title, kind, url, compact = false, mediaBase, className = "" }: Props) {
  const pathname = usePathname() || "/";
  const target = url ?? pathname;
  const { supported, saved, updates, offline, catalog, loadCatalog } = useOffline();
  const job = useSaveJob();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const key = supported ? pathOf(target) : target;
  const rec = saved.get(key) ?? null;
  const update = !!rec && updates.has(key);
  const saving = busy || (!!job && job.status === "running" && isQueued(key));
  const lecture = kind === "lecture";
  // a lecture says how big it is before it is saved (the catalog is one cached request per tab)
  useEffect(() => {
    if (lecture && supported && !offline) void loadCatalog();
  }, [lecture, supported, offline, loadCatalog]);
  const known = supported ? findItem(catalog, key) : null;
  const est = lecture && known ? known.bytes + lectureSharedExtra(catalog, saved, [known]) : 0;
  // this page's video lecture (a lesson, side quest, problem, case file or mock that has one)
  const lectureItem: (CatalogItem & { groupTitle: string }) | null = (() => {
    if (lecture || !catalog) return null;
    for (const g of catalog.groups) {
      if (g.kind !== "lectures") continue;
      const hit = g.items.find((i) => i.subject && pathOf(i.subject) === key);
      if (hit) return { ...hit, groupTitle: g.title };
    }
    return null;
  })();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!supported) return null;

  const save = async () => {
    setBusy(true);
    try {
      const cat = await loadCatalog();
      const item = findItem(cat, key) ?? { url: key, title, kind, tag: "", ...defaultGroupOf(kind, key), version: "unknown", bytes: 0, ...(mediaBase ? { mediaBase } : {}) };
      enqueueSave(item.title || title, withHub(cat, saved, [item]), update ? { scope: "update", trigger: "manual" } : { scope: "article" });
    } finally {
      setBusy(false);
    }
  };

  const label = saving
    ? job?.current === key && job.currentBytes
      ? `Saving… ${fmtBytes(job.currentBytes)}`
      : "Saving…"
    : update
      ? "Update offline"
      : rec
        ? "Saved offline"
        : offline
          ? "Offline"
          : est
            ? `Save offline · ${fmtBytes(est)}`
            : "Save offline";
  const Icon = saving ? Loader2 : update ? RefreshCw : rec ? Check : offline ? WifiOff : CloudDownload;
  const compactCls = compact ? "max-lg:h-11 max-lg:w-11 max-lg:justify-center max-lg:px-0 max-lg:[&>span]:sr-only" : "";

  return (
    <div ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        disabled={saving || (!rec && offline)}
        aria-expanded={rec ? open : undefined}
        aria-haspopup={rec ? "dialog" : undefined}
        title={
          !rec && offline
            ? "Saving needs a connection"
            : rec
              ? lecture
                ? "Saved for offline watching"
                : "Saved for offline reading"
              : lecture
                ? "Save this lecture (audio, captions, the page) to watch without internet"
                : "Save this page to read without internet"
        }
        onClick={() => (rec ? setOpen((o) => !o) : void save())}
        className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap border px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          rec ? "border-signal text-signal-text" : "border-line-strong text-fg-2 hover:border-fg-3 hover:text-fg"
        } ${compactCls}`}
      >
        <Icon className={`h-4 w-4 shrink-0 ${saving ? "animate-spin" : ""}`} aria-hidden />
        <span>{label}</span>
      </button>
      {open && rec && (
        <div role="dialog" aria-label="Offline copy" className="absolute right-0 top-[calc(100%+6px)] z-[60] flex w-[min(300px,calc(100vw-32px))] animate-hk-in flex-col gap-3 border border-line-strong bg-surface p-4 text-left shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
          <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">Saved for offline</span>
          <p className="m-0 text-sm leading-relaxed text-fg-2">
            Saved {fmtSaved(rec.updatedAt)} · {fmtBytes(rec.size)}. {lecture ? "Plays" : "Opens"} with no internet, from this page or your offline library.
            {update && <span className="mt-1 block text-fg">A newer version is online.</span>}
          </p>
          {lectureItem && <LectureOffer item={lectureItem} />}
          <div className="flex flex-wrap gap-2">
            {!offline && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void save();
                }}
                className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg hover:bg-surface-2"
              >
                {update ? "update now" : "re-save"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                trackRemove("article", [rec]);
                void removeSaved(key);
              }}
              className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg-3 hover:text-fg"
            >
              remove
            </button>
            <Link href="/learn/offline" onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center px-1 font-mono text-xs text-signal-text underline decoration-line-strong underline-offset-4">
              offline library →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** In a saved lesson's panel: its video lecture, saved separately (it is big). */
function LectureOffer({ item }: { item: CatalogItem & { groupTitle: string } }) {
  const { saved, updates, offline, catalog } = useOffline();
  const job = useSaveJob();
  const key = pathOf(item.url);
  const have = saved.get(key);
  const running = !!job && job.status === "running" && isQueued(key);
  const est = item.bytes + lectureSharedExtra(catalog, saved, [item]);
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Video lecture{item.minutes ? ` · ${item.minutes} min` : ""}</span>
      {have ? (
        <span className="text-sm text-fg-2">
          Saved too · {fmtBytes(have.size)}
          {updates.has(key) ? " · update available" : ""}.{" "}
          <Link href={item.url} className="text-signal-text underline decoration-line-strong underline-offset-4">
            watch
          </Link>
        </span>
      ) : (
        <button
          type="button"
          disabled={offline || running}
          onClick={() => enqueueSave(item.title, [item], { scope: "article" })}
          className="inline-flex min-h-10 items-center gap-2 self-start border border-signal px-3 font-mono text-xs text-signal-text hover:bg-surface-2 disabled:opacity-60"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CloudDownload className="h-3.5 w-3.5" aria-hidden />}
          {running ? `saving${job?.current === key && job.currentBytes ? ` · ${fmtBytes(job.currentBytes)}` : "…"}` : offline ? "needs a connection" : `save the lecture too · ~${fmtBytes(est)}`}
        </button>
      )}
    </div>
  );
}

/** "Save world offline" / "Save all side quests": every article in a catalog group, with progress. */
export function SaveGroupButton({ group, label, className = "" }: { group: string; label: string; className?: string }) {
  const { supported, saved, updates, offline, catalog, loadCatalog } = useOffline();
  const job = useSaveJob();
  useEffect(() => {
    if (supported && !offline) void loadCatalog();
  }, [supported, offline, loadCatalog]);
  if (!supported) return null;
  const g = catalog?.groups.find((x) => x.id === group);
  const items = g?.items ?? [];
  const have = items.filter((i) => saved.has(pathOf(i.url)));
  const stale = have.filter((i) => updates.has(pathOf(i.url)));
  const missing = items.filter((i) => !saved.has(pathOf(i.url)));
  // a world with code labs also stores the Python runtime (once per device)
  const est = missing.reduce((a, i) => a + i.bytes, 0) + labRuntimeExtra(catalog, saved, missing) + lectureSharedExtra(catalog, saved, missing);
  const running = !!job && job.status === "running" && items.some((i) => isQueued(pathOf(i.url)));
  const all = items.length > 0 && !missing.length;

  const go = () => {
    if (!g) return;
    const todo = [...missing, ...stale].map((i) => ({ ...i, groupTitle: g.title }));
    if (todo.length)
      enqueueSave(g.title, withHub(catalog, saved, todo), missing.length ? { scope: g.kind === "world" ? "world" : "collection", group: { id: g.id, title: g.title } } : { scope: "update", trigger: "manual" });
  };

  let text: string;
  if (running) text = `Saving… ${have.length}/${items.length}`;
  else if (all && !stale.length) text = `Saved offline ✓ · ${items.length}`;
  else if (all) text = `Update ${stale.length} offline`;
  else if (!catalog) text = offline ? "Saving needs a connection" : label;
  else text = `${label} · ~${fmtBytes(est)}`;

  return (
    <button
      type="button"
      onClick={go}
      disabled={running || offline || !g || (all && !stale.length)}
      title={offline ? "Saving needs a connection" : undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 border px-3.5 font-mono text-xs transition-colors disabled:cursor-default ${
        all && !stale.length ? "border-line-strong text-fg-2" : "border-signal text-signal-text hover:bg-surface-2 disabled:opacity-60"
      } ${className}`}
    >
      {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : all && !stale.length ? <Check className="h-4 w-4" aria-hidden /> : <CloudDownload className="h-4 w-4" aria-hidden />}
      <span>{text}</span>
      {have.length > 0 && !all && !running && <span className="text-fg-3">· {have.length}/{items.length} saved</span>}
    </button>
  );
}
