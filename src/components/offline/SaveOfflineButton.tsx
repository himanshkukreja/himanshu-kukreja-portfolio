"use client";

/**
 * "Save offline" for one article (lesson, preview, boss, side quest, trial, mock, case file).
 * Saved → a small panel with the date, size, update / remove and the library link.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, CloudDownload, Loader2, RefreshCw, WifiOff } from "lucide-react";
import type { OfflineKind } from "@/lib/offline/types";
import { isQueued, enqueueSave, useSaveJob } from "@/lib/offline/jobs";
import { pathOf, removeSaved } from "@/lib/offline/store";
import { trackRemove } from "@/lib/offline/analytics";
import { findItem, useOffline, withHub } from "./OfflineProvider";
import { fmtBytes, fmtSaved } from "./format";
import { labRuntimeExtra } from "@/lib/offline/labs";

type Props = {
  title: string;
  kind: OfflineKind;
  /** defaults to the current page */
  url?: string;
  /** icon-only below lg (beside a breadcrumb) */
  compact?: boolean;
  className?: string;
};

export default function SaveOfflineButton({ title, kind, url, compact = false, className = "" }: Props) {
  const pathname = usePathname() || "/";
  const target = url ?? pathname;
  const { supported, saved, updates, offline, loadCatalog } = useOffline();
  const job = useSaveJob();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const key = supported ? pathOf(target) : target;
  const rec = saved.get(key) ?? null;
  const update = !!rec && updates.has(key);
  const saving = busy || (!!job && job.status === "running" && isQueued(key));

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
      const item = findItem(cat, key) ?? { url: key, title, kind, tag: "", group: kind === "story" ? "case-files" : "saved", groupTitle: kind === "story" ? "Case files" : "Saved", version: "unknown", bytes: 0 };
      enqueueSave(item.title || title, withHub(cat, saved, [item]), update ? { scope: "update", trigger: "manual" } : { scope: "article" });
    } finally {
      setBusy(false);
    }
  };

  const label = saving ? "Saving…" : update ? "Update offline" : rec ? "Saved offline" : offline ? "Offline" : "Save offline";
  const Icon = saving ? Loader2 : update ? RefreshCw : rec ? Check : offline ? WifiOff : CloudDownload;
  const compactCls = compact ? "max-lg:h-11 max-lg:w-11 max-lg:justify-center max-lg:px-0 max-lg:[&>span]:sr-only" : "";

  return (
    <div ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        disabled={saving || (!rec && offline)}
        aria-expanded={rec ? open : undefined}
        aria-haspopup={rec ? "dialog" : undefined}
        title={!rec && offline ? "Saving needs a connection" : rec ? "Saved for offline reading" : "Save this page to read without internet"}
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
            Saved {fmtSaved(rec.updatedAt)} · {fmtBytes(rec.size)}. Opens with no internet, from this page or your offline library.
            {update && <span className="mt-1 block text-fg">A newer version is online.</span>}
          </p>
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
  const est = missing.reduce((a, i) => a + i.bytes, 0) + labRuntimeExtra(catalog, saved, missing);
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
