"use client";

/**
 * /learn/offline: everything saved on this device, sorted by type (the course by world, video
 * lectures by playlist section, side quests, interview problems, LLD, mocks, case files, war
 * stories, revision, code labs, tools), with counts and sizes, search, per-type save all / remove
 * all, updates, storage (videos vs articles), persistence and install.
 * Precached by the service worker, so it opens with no network too (then it is built from the saved
 * records alone: the catalog of what else could be saved needs a connection).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import {
  BookOpen,
  Boxes,
  Clapperboard,
  CloudDownload,
  Compass,
  FlaskConical,
  FolderSearch,
  HardDrive,
  Layers,
  Library,
  Loader2,
  Mic,
  Play,
  Puzzle,
  RefreshCw,
  Search,
  Siren,
  Trash2,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import type { Catalog } from "@/lib/offline/types";
import { enqueueSave, isQueued, useSaveJob, type SaveMeta } from "@/lib/offline/jobs";
import { pathOf, removeMany, removeSaved, requestPersistence, storageInfo, type SaveInput, type StorageInfo } from "@/lib/offline/store";
import { SECTIONS, kindLabel, type SectionId } from "@/lib/offline/sections";
import { buildLibrary, storageSplit, type Entry, type SectionModel, type SubGroup } from "@/lib/offline/library";
import { autoUpdateOn, findItem, setAutoUpdate, useOffline, withHub } from "./OfflineProvider";
import { InstallButton, useCanInstall } from "./Install";
import { fmtBytes, fmtSaved } from "./format";
import { labRuntimeExtra } from "@/lib/offline/labs";
import { lectureSharedExtra } from "@/lib/offline/lectures";
import { trackRemove } from "@/lib/offline/analytics";

type IconT = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const ICON: Record<SectionId | "all", IconT> = {
  all: Library,
  course: BookOpen,
  lectures: Clapperboard,
  sidequests: Compass,
  problems: Puzzle,
  lld: Boxes,
  mocks: Mic,
  cases: FolderSearch,
  war: Siren,
  revision: Layers,
  labs: FlaskConical,
  tools: Wrench,
};

/** Saves above this ask first (a whole playlist of lectures is gigabytes). */
const CONFIRM_BYTES = 300 * 1024 * 1024;

/** The course for "Save the entire course": not the lectures (GBs), case files or war stories. */
const COURSE_GROUPS = (c: Catalog) => c.groups.filter((g) => g.kind !== "case-files" && g.kind !== "lectures" && g.kind !== "war-stories");

/** Bytes a save of these items stores, with the once-per-device extras (app files, Python runtime, lecture music). */
function useEstimate() {
  const { catalog, saved } = useOffline();
  return useCallback(
    (items: SaveInput[]) => items.reduce((a, i) => a + i.bytes, 0) + (catalog && saved.size === 0 && items.length ? catalog.appBytes : 0) + labRuntimeExtra(catalog, saved, items) + lectureSharedExtra(catalog, saved, items),
    [catalog, saved]
  );
}

/** Save every course article not saved yet (worlds, side quests, problems, LLD, mocks, the map and the plan). */
export function SaveCourseButton({ className = "" }: { className?: string }) {
  const { supported, saved, updates, offline, catalog, loadCatalog } = useOffline();
  const job = useSaveJob();
  const estimate = useEstimate();
  useEffect(() => {
    if (supported && !offline) void loadCatalog();
  }, [supported, offline, loadCatalog]);
  if (!supported) return null;
  const groups = catalog ? COURSE_GROUPS(catalog) : [];
  const items = groups.flatMap((g) => g.items.map((i) => ({ ...i, groupTitle: g.title })));
  const missing = items.filter((i) => !saved.has(pathOf(i.url)) || updates.has(pathOf(i.url)));
  const est = estimate(missing.filter((i) => !saved.has(pathOf(i.url))));
  const running = !!job && job.status === "running" && items.some((i) => isQueued(pathOf(i.url)));
  const done = !!catalog && items.length > 0 && !missing.length;
  return (
    <button
      type="button"
      disabled={!catalog || offline || running || done}
      onClick={() => enqueueSave("The entire course", withHub(catalog, saved, missing), { scope: "course" })}
      className={`inline-flex min-h-[52px] items-center justify-center gap-2 px-5 text-[15px] font-semibold disabled:cursor-default ${
        done ? "border border-line-strong text-fg-2" : "bg-signal text-on-signal disabled:opacity-60"
      } ${className}`}
    >
      {done
        ? `Entire course saved ✓ · ${items.length} articles`
        : running
          ? "Saving the course…"
          : offline
            ? "Saving needs a connection"
            : !catalog
              ? "Save the entire course"
              : `Save the entire course · ~${fmtBytes(est)}`}
    </button>
  );
}

// ------------------------------------------------------------------------------------------------
// device cards

function StorageCard() {
  const { saved } = useOffline();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const read = useCallback(() => void storageInfo().then(setInfo), []);
  useEffect(() => {
    // storage estimate is browser state, read after mount and whenever the library changes
    read();
  }, [read, saved]);
  const { videos, articles } = storageSplit(saved.values());
  const mine = videos + articles;
  const used = info?.usage != null ? Math.max(info.usage, mine) : mine;
  const other = Math.max(0, used - mine);
  // the bar is the browser's allowance, so it fills as the device fills (not always 100% of what's used)
  const cap = info?.quota ? Math.max(info.quota, used) : used;
  const pct = (n: number) => (cap ? `${Math.max(n > 0 ? 1 : 0, (n / cap) * 100)}%` : "0%");
  const quotaPct = info?.usage && info.quota ? Math.min(100, Math.max(1, Math.round((info.usage / info.quota) * 100))) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3 border border-line-strong bg-surface p-5">
      <span className="flex items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-label text-fg-3">
        <span className="flex items-center gap-2">
          <HardDrive className="h-3.5 w-3.5" aria-hidden /> Storage on this device
        </span>
        {quotaPct !== null && <span>{quotaPct}% of quota</span>}
      </span>
      <span className="font-display text-[30px] font-bold leading-none tracking-[-0.02em] text-fg">
        {fmtBytes(used)}
        {info?.quota ? <span className="ml-2 font-mono text-xs font-normal tracking-normal text-fg-3">used · {fmtBytes(Math.max(0, info.quota - used))} free</span> : null}
      </span>
      <div className="flex h-2 w-full overflow-hidden bg-surface-2" role="img" aria-label={`Videos ${fmtBytes(videos)}, articles ${fmtBytes(articles)}, app files and other ${fmtBytes(other)}`}>
        <span className="h-2 bg-signal" style={{ width: pct(videos) }} />
        <span className="h-2 bg-fg-2" style={{ width: pct(articles) }} />
        <span className="h-2 bg-fg-4" style={{ width: pct(other) }} />
      </div>
      {info?.quota ? (
        <span className="-mt-1 text-xs text-fg-3">
          The browser lets this site use up to ~{fmtBytes(info.quota)} right now. It sets that from your free disk space and may raise it as you save more.
        </span>
      ) : null}
      <dl className="m-0 grid grid-cols-3 gap-2 font-mono text-[11px] text-fg-3">
        {[
          ["bg-signal", "Videos", videos],
          ["bg-fg-2", "Articles", articles],
          ["bg-fg-4", "App & other", other],
        ].map(([dot, label, n]) => (
          <div key={label as string} className="flex min-w-0 flex-col gap-0.5">
            <dt className="flex items-center gap-1.5 uppercase tracking-label">
              <span aria-hidden className={`h-2 w-2 shrink-0 ${dot}`} />
              {label}
            </dt>
            <dd className="m-0 text-[13px] text-fg">{fmtBytes(n as number)}</dd>
          </div>
        ))}
      </dl>
      {info?.persisted === true ? (
        <span className="text-xs text-ok">Kept: the browser won&apos;t clear it to free space.</span>
      ) : info?.persisted === false ? (
        <span className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
          The browser may clear it when the device is low on space.
          <button type="button" onClick={() => void requestPersistence().then(read)} className="min-h-9 border border-line-strong px-2.5 font-mono text-[11px] text-fg hover:bg-surface-2">
            ask to keep it
          </button>
        </span>
      ) : null}
    </div>
  );
}

function AppCard() {
  const { install, offline } = useOffline();
  const can = useCanInstall();
  return (
    <div className="flex min-w-0 flex-col gap-3 border border-line-strong bg-surface p-5">
      <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-fg-3">
        {offline ? <WifiOff className="h-3.5 w-3.5" aria-hidden /> : <span aria-hidden className="h-2 w-2 bg-ok" />} {offline ? "Offline" : "Online"}
      </span>
      <span className="font-display text-[26px] font-bold leading-none tracking-[-0.02em] text-fg">{install.installed ? "App installed ✓" : "Reading app"}</span>
      <span className="text-xs leading-relaxed text-fg-3">
        {install.installed
          ? "Saved lessons and lectures open from the home-screen icon, with or without internet."
          : install.ios
            ? "On iPhone, add the course to your Home Screen so saved lessons stay: Safari can clear a site's data after a week without a visit. Lessons saved in Safari don't carry over into the app, so save them from the app."
            : can
              ? "Install the course as an app: it opens from your home screen or dock, full screen, with everything you saved."
              : "Saved pages and lectures open in this browser with no internet. Bookmark this page to find them."}
      </span>
      {can && <InstallButton className="self-start" />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// buttons

/** Save a list of catalog items (a type, a world, a playlist section), asking first when it is big. */
function SaveItemsButton({ items, label, meta, small = false }: { items: SaveInput[]; label: string; meta: SaveMeta; small?: boolean }) {
  const { saved, offline, catalog } = useOffline();
  const job = useSaveJob();
  const estimate = useEstimate();
  const [ask, setAsk] = useState(false);
  if (!items.length) return null;
  const est = estimate(items);
  const running = !!job && job.status === "running" && items.some((i) => isQueued(pathOf(i.url)));
  const go = () => {
    setAsk(false);
    enqueueSave(label, withHub(catalog, saved, items), meta);
  };
  const cls = small
    ? "inline-flex min-h-9 items-center gap-1.5 border border-line-strong px-2.5 font-mono text-[11px] text-fg-2 hover:border-signal hover:text-fg disabled:opacity-60"
    : "inline-flex min-h-11 items-center gap-2 bg-signal px-4 font-mono text-xs font-semibold text-on-signal disabled:opacity-60";
  if (ask)
    return (
      <span className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
        Store ~{fmtBytes(est)} on this device? Best on wifi.
        <button type="button" onClick={go} className="min-h-9 border border-signal px-3 font-mono text-xs text-signal-text hover:bg-surface-2">
          save {items.length}
        </button>
        <button type="button" onClick={() => setAsk(false)} className="min-h-9 border border-line-strong px-3 font-mono text-xs text-fg-3 hover:text-fg">
          cancel
        </button>
      </span>
    );
  return (
    <button type="button" disabled={offline || running} onClick={() => (est > CONFIRM_BYTES ? setAsk(true) : go())} className={cls} title={offline ? "Saving needs a connection" : undefined}>
      {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CloudDownload className="h-3.5 w-3.5" aria-hidden />}
      {running ? "saving…" : offline ? "needs a connection" : `${small ? "save" : "Save"} ${items.length === 1 ? "it" : `all ${items.length}`} · ~${fmtBytes(est)}`}
    </button>
  );
}

function RemoveEntriesButton({ entries, what, group, small = false }: { entries: Entry[]; what: string; group: { id: string; title: string }; small?: boolean }) {
  const [ask, setAsk] = useState(false);
  const metas = entries.flatMap((e) => (e.meta ? [e.meta] : []));
  if (!metas.length) return null;
  const bytes = metas.reduce((a, m) => a + m.size, 0);
  if (ask)
    return (
      <span className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
        Remove {metas.length === 1 ? "it" : `${metas.length} ${what}`} ({fmtBytes(bytes)})?
        <button
          type="button"
          onClick={() => {
            setAsk(false);
            trackRemove(metas.length === 1 ? "article" : "world", metas, group);
            void removeMany(metas.map((m) => m.url));
          }}
          className="min-h-9 border border-bad px-3 font-mono text-xs text-bad-text"
        >
          yes, remove
        </button>
        <button type="button" onClick={() => setAsk(false)} className="min-h-9 border border-line-strong px-3 font-mono text-xs text-fg-3 hover:text-fg">
          cancel
        </button>
      </span>
    );
  return (
    <button
      type="button"
      onClick={() => setAsk(true)}
      className={`inline-flex items-center gap-1.5 font-mono text-fg-3 hover:text-fg ${small ? "min-h-9 px-2 text-[11px]" : "min-h-11 border border-line-strong px-3 text-xs"}`}
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden /> remove {metas.length === 1 ? "it" : `all ${metas.length}`}
    </button>
  );
}

function UpdateEntriesButton({ entries, small = false }: { entries: Entry[]; small?: boolean }) {
  const { offline, catalog } = useOffline();
  const job = useSaveJob();
  const items = entries.filter((e) => e.update).flatMap((e) => (e.item ? [e.item] : findItem(catalog, e.url) ?? []));
  if (!items.length || offline) return null;
  const running = !!job && job.status === "running" && items.some((i) => isQueued(pathOf(i.url)));
  return (
    <button
      type="button"
      disabled={running}
      onClick={() => enqueueSave(items.length === 1 ? items[0].title : "Updating saved pages", items, { scope: "update", trigger: "manual" })}
      className={`inline-flex items-center gap-1.5 border border-signal font-mono text-signal-text hover:bg-surface-2 disabled:opacity-60 ${small ? "min-h-9 px-2.5 text-[11px]" : "min-h-11 px-3 text-xs"}`}
    >
      <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} aria-hidden /> update {items.length === 1 ? "" : `all ${items.length}`}
    </button>
  );
}

// ------------------------------------------------------------------------------------------------
// rows

function Thumb({ e }: { e: Entry }) {
  const Icon = ICON[e.section];
  if (e.section === "lectures" && e.poster)
    return (
      <span className="relative block h-[45px] w-[80px] shrink-0 overflow-hidden border border-line bg-[#0b0b0c]">
        {/* eslint-disable-next-line @next/next/no-img-element -- poster lives on the media host (R2) or this device's saved copy */}
        <img src={e.poster} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" onError={(ev) => ((ev.currentTarget as HTMLImageElement).style.visibility = "hidden")} />
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-black/70 text-signal">
            <Play className="h-3 w-3 translate-x-[1px]" aria-hidden />
          </span>
        </span>
      </span>
    );
  return (
    <span className={`grid h-10 w-10 shrink-0 place-items-center border ${e.meta ? "border-line-strong text-fg-2" : "border-line text-fg-4"}`}>
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

function Row({ e, showSection = false }: { e: Entry; showSection?: boolean }) {
  const { offline } = useOffline();
  const job = useSaveJob();
  const queued = !!job && job.status === "running" && isQueued(e.url);
  const current = queued && job?.current === e.url;
  const open = !!e.meta || !offline;
  const sectionTitle = SECTIONS.find((s) => s.id === e.section)?.title;
  return (
    <li className="flex items-center gap-3 border-b border-line py-3">
      <Thumb e={e} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10.5px] uppercase tracking-label text-fg-3">
          <span className={e.meta ? "text-signal-text" : ""}>{showSection && sectionTitle ? sectionTitle : kindLabel(e.kind)}</span>
          {e.tag && !kindLabel(e.kind).toUpperCase().includes(e.tag.toUpperCase()) && e.tag !== "HUB" && <span className="truncate">{e.tag}</span>}
          {e.minutes ? <span>{e.minutes} min</span> : null}
        </span>
        {open ? (
          <Link href={e.url} className={`min-w-0 break-words text-[15px] font-medium leading-snug hover:underline ${e.meta ? "text-fg" : "text-fg-2"}`}>
            {e.title}
          </Link>
        ) : (
          <span className="min-w-0 break-words text-[15px] font-medium leading-snug text-fg-3">{e.title}</span>
        )}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-fg-3">
          {e.meta ? (
            <>
              <span>{fmtBytes(e.meta.size)}</span>
              <span aria-hidden>·</span>
              <span>saved {fmtSaved(e.meta.updatedAt)}</span>
              {e.update && <span className="bg-signal px-1.5 py-0.5 font-semibold text-on-signal">UPDATE</span>}
            </>
          ) : queued ? (
            <span className="text-signal-text">{current ? `saving… ${job?.currentBytes ? fmtBytes(job.currentBytes) : ""}` : "queued"}</span>
          ) : (
            <span>not saved · ~{fmtBytes(e.bytes)}</span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {e.meta ? (
          <>
            {e.update && !offline && (e.item ? <UpdateEntriesButton entries={[e]} small /> : null)}
            <button
              type="button"
              onClick={() => {
                trackRemove("article", [e.meta!]);
                void removeSaved(e.url);
              }}
              aria-label={`Remove ${e.title} from this device`}
              title="Remove from this device"
              className="grid h-10 w-10 place-items-center border border-line-strong text-fg-3 hover:text-fg"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </>
        ) : e.item ? (
          <button
            type="button"
            disabled={offline || queued}
            onClick={() => enqueueSave(e.title, [e.item!], { scope: "article" })}
            aria-label={`Save ${e.title} for offline`}
            title={offline ? "Saving needs a connection" : `Save · ~${fmtBytes(e.bytes)}`}
            className="grid h-10 w-10 place-items-center border border-line-strong text-fg-2 hover:border-signal hover:text-signal-text disabled:opacity-50"
          >
            {queued ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CloudDownload className="h-4 w-4" aria-hidden />}
          </button>
        ) : null}
      </span>
    </li>
  );
}

// ------------------------------------------------------------------------------------------------
// navigation

type Tab = SectionId | "all";

function Nav({ tab, setTab, model, totalSaved, totalBytes }: { tab: Tab; setTab: (t: Tab) => void; model: Map<SectionId, SectionModel>; totalSaved: number; totalBytes: number }) {
  const items: { id: Tab; title: string; saved: number; total: number; bytes: number; stale: number }[] = [
    { id: "all", title: "Everything saved", saved: totalSaved, total: 0, bytes: totalBytes, stale: [...model.values()].reduce((a, s) => a + s.stale.length, 0) },
    ...SECTIONS.map((s) => {
      const m = model.get(s.id)!;
      return { id: s.id as Tab, title: s.title, saved: m.saved, total: m.total, bytes: m.savedBytes, stale: m.stale.length };
    }).filter((x) => x.total > 0 || x.saved > 0),
  ];
  return (
    <nav aria-label="Types of saved things" className="min-w-0">
      {/* phones and tablets: one scrollable row of chips (the strip scrolls, never the page) */}
      <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden">
        <ul className="m-0 flex w-max list-none gap-1.5 p-0">
          {items.map((it) => {
            const Icon = ICON[it.id];
            const on = tab === it.id;
            return (
              <li key={it.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTab(it.id)}
                  className={`inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap border px-3 text-[13px] ${on ? "border-signal bg-surface text-fg" : "border-line-strong text-fg-2"}`}
                >
                  <Icon className={`h-3.5 w-3.5 ${on ? "text-signal-text" : ""}`} aria-hidden />
                  {it.id === "all" ? "All saved" : it.title}
                  <span className="font-mono text-[11px] text-fg-3">{it.saved}</span>
                  {it.stale > 0 && <span aria-label="updates available" className="h-1.5 w-1.5 bg-signal" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {/* desktop: a sidebar */}
      <ul className="m-0 hidden list-none flex-col p-0 lg:flex">
        {items.map((it, k) => {
          const Icon = ICON[it.id];
          const on = tab === it.id;
          return (
            <li key={it.id} className={k === 0 ? "mb-2 border-b border-line pb-2" : ""}>
              <button
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => setTab(it.id)}
                className={`flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left ${on ? "border-signal bg-surface" : "border-transparent hover:bg-surface"}`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${on ? "text-signal-text" : "text-fg-3"}`} aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate text-[14px] ${on ? "font-semibold text-fg" : "text-fg-2"}`}>{it.title}</span>
                  <span className="font-mono text-[10.5px] text-fg-3">
                    {it.id === "all" ? `${it.saved} saved` : `${it.saved}/${it.total}`}
                    {it.bytes > 0 ? ` · ${fmtBytes(it.bytes)}` : ""}
                  </span>
                </span>
                {it.stale > 0 && (
                  <span className="shrink-0 bg-signal px-1.5 font-mono text-[10px] font-semibold text-on-signal" title={`${it.stale} with updates`}>
                    {it.stale}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ------------------------------------------------------------------------------------------------
// panels

const match = (e: Entry, q: string) => !q || `${e.title} ${e.tag} ${e.groupTitle} ${kindLabel(e.kind)}`.toLowerCase().includes(q);

function GroupBlock({ g, section, view, q }: { g: SubGroup; section: SectionModel; view: "saved" | "all"; q: string }) {
  const rows = g.entries.filter((e) => (view === "all" || e.meta) && match(e, q));
  if (!rows.length) return null;
  const savedHere = g.entries.filter((e) => e.meta);
  const missing = g.entries.flatMap((e) => (!e.meta && e.item ? [e.item] : []));
  const multi = section.groups.length > 1 && g.title;
  return (
    <div className="flex min-w-0 flex-col">
      {multi && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-2 pt-4">
          <h3 className="m-0 min-w-0 text-[15px] font-semibold text-fg">
            {g.title}
            <span className="ml-2 font-mono text-[11px] font-normal text-fg-3">
              {savedHere.length}/{g.entries.length}
              {savedHere.length ? ` · ${fmtBytes(savedHere.reduce((a, e) => a + (e.meta?.size || 0), 0))}` : ""}
            </span>
          </h3>
          <span className="flex flex-wrap items-center gap-1.5">
            {view === "all" && missing.length > 0 && <SaveItemsButton small items={missing} label={g.title} meta={{ scope: "collection", group: { id: g.id, title: g.title } }} />}
            <UpdateEntriesButton entries={savedHere} small />
            <RemoveEntriesButton entries={savedHere} what={section.section.unit[1]} group={{ id: g.id, title: g.title || section.section.title }} small />
          </span>
        </div>
      )}
      <ul className="m-0 list-none p-0">
        {rows.map((e) => (
          <Row key={e.url} e={e} />
        ))}
      </ul>
    </div>
  );
}

function SectionPanel({ sm, q, setQ }: { sm: SectionModel; q: string; setQ: (q: string) => void }) {
  const { offline, catalog } = useOffline();
  const [view, setView] = useState<"saved" | "all">("saved");
  const s = sm.section;
  const Icon = ICON[s.id];
  const needle = q.trim().toLowerCase();
  const visible = sm.entries.filter((e) => (view === "all" || e.meta) && match(e, needle)).length;
  const [one, many] = s.unit;
  return (
    <section aria-labelledby="sec-h" className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-3 border border-line-strong bg-surface p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center border border-signal text-signal-text">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <h2 id="sec-h" className="m-0 font-display text-[26px] font-bold leading-none tracking-[-0.02em] text-fg sm:text-[30px]">
              {s.title}
            </h2>
            <span className="text-sm leading-relaxed text-fg-3">{s.blurb}</span>
          </span>
        </div>
        <span className="font-mono text-xs text-fg-2">
          {sm.saved} of {sm.total || sm.saved} {sm.total === 1 ? one : many} saved
          {sm.savedBytes > 0 && ` · ${fmtBytes(sm.savedBytes)} on this device`}
          {sm.stale.length > 0 && <span className="text-signal-text"> · {sm.stale.length} with updates</span>}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {!offline && sm.missing.length > 0 && <SaveItemsButton items={sm.missing} label={s.title} meta={{ scope: s.id === "course" ? "course" : "collection", group: { id: s.id, title: s.title } }} />}
          <UpdateEntriesButton entries={sm.stale} />
          <RemoveEntriesButton entries={sm.entries} what={many} group={{ id: s.id, title: s.title }} />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-0 flex-[1_1_220px] items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-fg-3" aria-hidden />
          <span className="sr-only">Search {s.title}</span>
          <input
            type="search"
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            placeholder={`Search ${s.title.toLowerCase()}`}
            className="min-h-11 w-full border border-line-strong bg-bg pl-9 pr-9 text-[15px] text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-1 grid h-9 w-9 place-items-center text-fg-3 hover:text-fg">
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </label>
        <div role="radiogroup" aria-label="Show" className="flex shrink-0 border border-line-strong">
          {(
            [
              ["saved", `On device · ${sm.saved}`],
              ["all", `All · ${sm.total || sm.saved}`],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={`min-h-11 px-3 font-mono text-xs ${view === v ? "bg-surface-2 text-fg" : "text-fg-3 hover:text-fg"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "saved" && sm.saved === 0 ? (
        <div className="flex flex-col items-start gap-3 border border-dashed border-line-strong p-6">
          <Icon className="h-6 w-6 text-fg-4" aria-hidden />
          <p className="m-0 max-w-[560px] text-[15px] leading-relaxed text-fg-2">
            No {many} saved on this device yet.{" "}
            {offline
              ? "Saving needs a connection; come back online to pick some."
              : s.id === "lectures"
                ? "Save a lecture from its page (Save offline under the title) or pick some here: the audio, captions and checkpoints all work with no internet."
                : `Save one from its page, or pick some here.`}
          </p>
          {!offline && sm.total > 0 && (
            <button type="button" onClick={() => setView("all")} className="inline-flex min-h-11 items-center gap-2 border border-signal px-4 font-mono text-xs text-signal-text hover:bg-surface-2">
              browse all {sm.total} {sm.total === 1 ? one : many} →
            </button>
          )}
        </div>
      ) : view === "all" && !catalog && !sm.saved ? (
        <p className="m-0 font-mono text-xs text-fg-3">{offline ? "The list of what can be saved needs a connection." : "loading what can be saved…"}</p>
      ) : visible === 0 ? (
        <p className="m-0 text-[15px] text-fg-3">Nothing matches “{q}”.</p>
      ) : (
        <div className="flex min-w-0 flex-col">
          {sm.groups.map((g) => (
            <GroupBlock key={g.id} g={g} section={sm} view={view} q={needle} />
          ))}
          {view === "all" && offline && <p className="m-0 mt-3 font-mono text-xs text-fg-3">Saving needs a connection.</p>}
        </div>
      )}
    </section>
  );
}

function EverythingPanel({ model, q, setQ, setTab }: { model: Map<SectionId, SectionModel>; q: string; setQ: (q: string) => void; setTab: (t: Tab) => void }) {
  const { ready, offline, catalog } = useOffline();
  const needle = q.trim().toLowerCase();
  const sections = SECTIONS.map((s) => model.get(s.id)!);
  const withSaved = sections.filter((sm) => sm.saved > 0);
  const total = withSaved.reduce((a, sm) => a + sm.saved, 0);
  return (
    <section aria-label="Everything saved" className="flex min-w-0 flex-col gap-5">
      {total > 0 && (
        <label className="relative flex min-w-0 items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-fg-3" aria-hidden />
          <span className="sr-only">Search everything saved</span>
          <input
            type="search"
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            placeholder={`Search ${total} saved`}
            className="min-h-11 w-full border border-line-strong bg-bg pl-9 pr-9 text-[15px] text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-1 grid h-9 w-9 place-items-center text-fg-3 hover:text-fg">
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </label>
      )}
      {ready && total === 0 && (
        <p className="m-0 max-w-[680px] border border-dashed border-line-strong p-5 text-[15px] leading-relaxed text-fg-2">
          Nothing saved yet. Open any lesson or lecture and tap <b className="text-fg">Save offline</b> next to the title, or pick a type below and save it all.
        </p>
      )}
      {withSaved.map((sm) => {
        const rows = sm.entries.filter((e) => e.meta && match(e, needle));
        if (!rows.length) return null;
        const Icon = ICON[sm.section.id];
        return (
          <div key={sm.section.id} className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-strong pb-2">
              <h2 className="m-0 flex items-center gap-2 text-[17px] font-semibold text-fg">
                <Icon className="h-4 w-4 text-signal-text" aria-hidden />
                {sm.section.title}
                <span className="font-mono text-[11px] font-normal text-fg-3">
                  {sm.saved}
                  {sm.total ? `/${sm.total}` : ""} · {fmtBytes(sm.savedBytes)}
                </span>
              </h2>
              <button type="button" onClick={() => setTab(sm.section.id)} className="min-h-9 px-1 font-mono text-[11px] text-signal-text hover:underline">
                open →
              </button>
            </div>
            <ul className="m-0 list-none p-0">
              {rows.map((e) => (
                <Row key={e.url} e={e} />
              ))}
            </ul>
          </div>
        );
      })}
      {needle && !withSaved.some((sm) => sm.entries.some((e) => e.meta && match(e, needle))) && <p className="m-0 text-[15px] text-fg-3">Nothing saved matches “{q}”.</p>}

      {!offline && (
        <div className="flex flex-col gap-3 pt-4">
          <h2 className="m-0 font-display text-[26px] font-bold tracking-[-0.02em] text-fg">Save more</h2>
          <div className="flex flex-col gap-3 border border-line-strong bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex flex-col gap-1">
              <span className="text-base font-semibold text-fg">The entire course</span>
              <span className="text-sm text-fg-3">Every world, boss, trial, side quest, interview problem, LLD problem and mock interview, with the course map. Not the video lectures.</span>
            </span>
            <SaveCourseButton />
          </div>
          {catalog ? (
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-2 p-0">
              {sections
                .filter((sm) => sm.total > 0)
                .map((sm) => {
                  const Icon = ICON[sm.section.id];
                  const left = sm.missing.reduce((a, i) => a + i.bytes, 0);
                  return (
                    <li key={sm.section.id}>
                      <button type="button" onClick={() => setTab(sm.section.id)} className="flex h-full w-full flex-col gap-2 border border-line-strong p-4 text-left hover:border-signal">
                        <span className="flex items-center gap-2 text-[15px] font-semibold text-fg">
                          <Icon className="h-4 w-4 text-signal-text" aria-hidden />
                          {sm.section.title}
                        </span>
                        <span className="h-1 w-full bg-surface-2" aria-hidden>
                          <span className="block h-1 bg-signal" style={{ width: `${sm.total ? (sm.saved / sm.total) * 100 : 0}%` }} />
                        </span>
                        <span className="font-mono text-[11px] text-fg-3">
                          {sm.saved}/{sm.total} saved{sm.missing.length ? ` · rest ~${fmtBytes(left)}` : " ✓"}
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          ) : (
            <p className="m-0 font-mono text-xs text-fg-3">loading what can be saved…</p>
          )}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------

const TABS = new Set<string>(["all", ...SECTIONS.map((s) => s.id)]);

export default function OfflineLibrary() {
  const { checked, supported, saved, updates, offline, catalog, loadCatalog } = useOffline();
  const [auto, setAuto] = useState(true);
  const [confirmAll, setConfirmAll] = useState(false);
  const [tab, setTabState] = useState<Tab>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    // per-browser preference and the tab in the URL (#lectures), read after mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuto(autoUpdateOn());
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (TABS.has(h)) setTabState(h as Tab);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  useEffect(() => {
    if (supported && !offline) void loadCatalog();
  }, [supported, offline, loadCatalog]);

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    setQ("");
    try {
      window.history.replaceState(window.history.state, "", t === "all" ? window.location.pathname : `#${t}`);
    } catch {
      // history unavailable
    }
  }, []);

  const model = useMemo(() => buildLibrary(catalog, saved, updates), [catalog, saved, updates]);
  const totalBytes = useMemo(() => [...saved.values()].reduce((a, m) => a + (m.size || 0), 0), [saved]);
  const stale = [...model.values()].flatMap((s) => s.stale);
  const sm = tab === "all" ? null : model.get(tab)!;

  return (
    <main className="mx-auto flex w-full max-w-[1320px] flex-col gap-8 px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      <section className="flex flex-col gap-3">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">Learn · offline library</span>
        <h1 className="m-0 font-display text-[clamp(44px,6.5vw,92px)] font-extrabold leading-[0.88] tracking-tightest text-fg">
          Offline library<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 max-w-[720px] text-[17px] leading-relaxed text-fg-2">
          Lessons, video lectures, side quests, problems, case files and more, saved on this device to read and watch with no internet. Progress you make offline syncs to your account when you&apos;re back.
        </p>
      </section>

      {!checked ? (
        <p className="m-0 font-mono text-xs text-fg-3">reading this device…</p>
      ) : !supported ? (
        <p className="m-0 max-w-[680px] border border-line-strong bg-surface p-5 text-[15px] leading-relaxed text-fg-2">
          This browser can&apos;t store pages for offline reading (private browsing blocks it too). Current Chrome, Edge, Firefox and Safari can.
        </p>
      ) : (
        <>
          <section aria-label="This device" className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <StorageCard />
            <AppCard />
          </section>

          {stale.length > 0 && !offline && (
            <div className="flex flex-wrap items-center justify-between gap-3 border border-signal bg-surface px-5 py-3">
              <span className="flex items-center gap-2 text-[15px] text-fg">
                <RefreshCw className="h-4 w-4 text-signal-text" aria-hidden />
                {stale.length} saved {stale.length === 1 ? "page has" : "pages have"} a newer version online.
              </span>
              <UpdateEntriesButton entries={stale} />
            </div>
          )}

          <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
            <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
              <Nav tab={tab} setTab={setTab} model={model} totalSaved={saved.size} totalBytes={totalBytes} />
            </div>
            <div className="min-w-0">{sm ? <SectionPanel key={sm.section.id} sm={sm} q={q} setQ={setQ} /> : <EverythingPanel model={model} q={q} setQ={setQ} setTab={setTab} />}</div>
          </div>

          <section aria-label="Settings" className="flex flex-col gap-3 border-t border-line pt-6">
            <label className="flex cursor-pointer items-start gap-3 text-[15px] text-fg-2">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => {
                  setAuto(e.target.checked);
                  setAutoUpdate(e.target.checked);
                }}
                className="mt-1 h-4 w-4 accent-[var(--c-signal)]"
              />
              <span>Keep saved pages up to date: when online, refresh copies whose content changed (in the background).</span>
            </label>
            {saved.size > 0 &&
              (confirmAll ? (
                <span className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
                  Remove all {saved.size} saved items ({fmtBytes(totalBytes)}) from this device?
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmAll(false);
                      trackRemove("all", [...saved.values()]);
                      void removeMany([...saved.keys()]);
                    }}
                    className="min-h-10 border border-bad px-3 font-mono text-xs text-bad-text"
                  >
                    yes, remove
                  </button>
                  <button type="button" onClick={() => setConfirmAll(false)} className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg-3">
                    cancel
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmAll(true)} className="min-h-10 self-start font-mono text-xs text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
                  remove everything saved on this device
                </button>
              ))}
            <p className="m-0 max-w-[720px] text-xs leading-relaxed text-fg-3">
              Saved copies live in this browser only (each browser and the installed app keep their own). Comments, Ask Claude, the leaderboard, search, sign-in and sharing need a connection; reading, diagrams, lectures, quick checks,
              trials, stage clears and XP don&apos;t.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
