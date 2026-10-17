"use client";

/**
 * /learn/offline: everything saved on this device (size, date, updates, remove), storage used,
 * persistence, install, and saving more (a world, side quests, mocks, case files, the whole course).
 * Precached by the service worker, so it opens with no network too.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HardDrive, Trash2, WifiOff } from "lucide-react";
import type { Catalog, SavedMeta } from "@/lib/offline/types";
import { enqueueSave, isQueued, useSaveJob } from "@/lib/offline/jobs";
import { pathOf, removeAll, removeSaved, requestPersistence, storageInfo, type StorageInfo } from "@/lib/offline/store";
import { autoUpdateOn, findItem, setAutoUpdate, useOffline, withHub } from "./OfflineProvider";
import { SaveGroupButton } from "./SaveOfflineButton";
import { InstallButton, useCanInstall } from "./Install";
import { fmtBytes, fmtSaved } from "./format";

const COURSE_GROUPS = (c: Catalog) => c.groups.filter((g) => g.kind !== "case-files");

/** Save every course article not saved yet (worlds, side quests, mocks, the map and the plan). */
export function SaveCourseButton({ className = "" }: { className?: string }) {
  const { supported, saved, updates, offline, catalog, loadCatalog } = useOffline();
  const job = useSaveJob();
  useEffect(() => {
    if (supported && !offline) void loadCatalog();
  }, [supported, offline, loadCatalog]);
  if (!supported) return null;
  const groups = catalog ? COURSE_GROUPS(catalog) : [];
  const items = groups.flatMap((g) => g.items.map((i) => ({ ...i, groupTitle: g.title })));
  const missing = items.filter((i) => !saved.has(pathOf(i.url)) || updates.has(pathOf(i.url)));
  const est = missing.reduce((a, i) => a + i.bytes, 0) + (catalog && saved.size === 0 ? catalog.appBytes : 0);
  const running = !!job && job.status === "running" && items.some((i) => isQueued(pathOf(i.url)));
  const done = !!catalog && items.length > 0 && !missing.length;
  return (
    <button
      type="button"
      disabled={!catalog || offline || running || done}
      onClick={() => enqueueSave("The entire course", withHub(catalog, saved, missing))}
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

function StorageCard() {
  const { saved } = useOffline();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const read = useCallback(() => void storageInfo().then(setInfo), []);
  useEffect(() => {
    // storage estimate is browser state, read after mount and whenever the library changes
    read();
  }, [read, saved]);
  const pct = info?.usage && info.quota ? Math.min(100, Math.max(1, Math.round((info.usage / info.quota) * 100))) : 0;
  const mine = [...saved.values()].reduce((a, m) => a + m.size, 0);
  return (
    <div className="flex flex-col gap-3 border border-line-strong bg-surface p-5">
      <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-fg-3">
        <HardDrive className="h-3.5 w-3.5" aria-hidden /> Storage
      </span>
      <span className="font-display text-[26px] font-bold leading-none tracking-[-0.02em] text-fg">{info?.usage != null ? fmtBytes(info.usage) : fmtBytes(mine)}</span>
      <div className="h-1.5 bg-surface-2" aria-hidden>
        <div className="h-1.5 bg-signal" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs leading-relaxed text-fg-3">
        {info?.quota ? `used of ${fmtBytes(info.quota)} this browser allows the site. ` : ""}
        Articles {fmtBytes(mine)}; the rest is the reader app (shared by every saved page) and images.
      </span>
      {info?.persisted === true ? (
        <span className="text-xs text-ok">Kept: the browser won&apos;t clear it to free space.</span>
      ) : info?.persisted === false ? (
        <span className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
          The browser may clear it when the device is low on space.
          <button
            type="button"
            onClick={() => void requestPersistence().then(read)}
            className="min-h-9 border border-line-strong px-2.5 font-mono text-[11px] text-fg hover:bg-surface-2"
          >
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
    <div className="flex flex-col gap-3 border border-line-strong bg-surface p-5">
      <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-fg-3">
        {offline ? <WifiOff className="h-3.5 w-3.5" aria-hidden /> : <span aria-hidden className="h-2 w-2 bg-ok" />} {offline ? "Offline" : "Online"}
      </span>
      <span className="font-display text-[26px] font-bold leading-none tracking-[-0.02em] text-fg">{install.installed ? "App installed ✓" : "Reading app"}</span>
      <span className="text-xs leading-relaxed text-fg-3">
        {install.installed
          ? "Saved lessons open from the home-screen icon, with or without internet."
          : install.ios
            ? "On iPhone, add the course to your Home Screen so saved lessons stay: Safari can clear a site's data after a week without a visit. Lessons saved in Safari don't carry over into the app, so save them from the app."
            : can
              ? "Install the course as an app: it opens from your home screen or dock, full screen, with your saved lessons."
              : "Saved lessons open in this browser with no internet. Bookmark this page to find them."}
      </span>
      {can && <InstallButton className="self-start" />}
    </div>
  );
}

function SavedRow({ m, update, onUpdate }: { m: SavedMeta; update: boolean; onUpdate: (() => void) | null }) {
  const job = useSaveJob();
  const saving = !!job && job.status === "running" && isQueued(m.url);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line py-3">
      <span className="w-[104px] shrink-0 font-mono text-[11px] tracking-label text-fg-3">{m.tag || m.kind.toUpperCase()}</span>
      <span className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
        <Link href={m.url} className="text-[15px] font-medium text-fg hover:underline">
          {m.title}
        </Link>
        <span className="font-mono text-[11px] text-fg-3">
          {fmtBytes(m.size)} · saved {fmtSaved(m.updatedAt)}
          {update && <span className="ml-2 bg-signal px-1.5 py-0.5 font-semibold text-on-signal">UPDATE AVAILABLE</span>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {update && onUpdate && (
          <button type="button" disabled={saving} onClick={onUpdate} className="min-h-10 border border-signal px-3 font-mono text-xs text-signal-text hover:bg-surface-2 disabled:opacity-60">
            {saving ? "updating…" : "update"}
          </button>
        )}
        <button
          type="button"
          onClick={() => void removeSaved(m.url)}
          aria-label={`Remove ${m.title} from this device`}
          className="grid h-10 w-10 place-items-center border border-line-strong text-fg-3 hover:text-fg"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </span>
    </li>
  );
}

export default function OfflineLibrary() {
  const { checked, supported, ready, saved, updates, offline, catalog, loadCatalog } = useOffline();
  const [auto, setAuto] = useState(true);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    // per-browser preference, read after mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuto(autoUpdateOn());
  }, []);
  useEffect(() => {
    if (supported && !offline) void loadCatalog();
  }, [supported, offline, loadCatalog]);

  // saved items grouped, in course order when the catalog is known
  const groups = useMemo(() => {
    const order = new Map((catalog?.groups ?? []).map((g, i) => [g.id, i]));
    const itemOrder = new Map((catalog?.groups ?? []).flatMap((g) => g.items.map((it, i) => [pathOf(it.url), i] as const)));
    const by = new Map<string, { id: string; title: string; items: SavedMeta[] }>();
    for (const m of saved.values()) {
      const g = by.get(m.group) ?? { id: m.group, title: m.groupTitle, items: [] };
      g.items.push(m);
      by.set(m.group, g);
    }
    const list = [...by.values()];
    list.forEach((g) => g.items.sort((a, b) => (itemOrder.get(a.url) ?? 999) - (itemOrder.get(b.url) ?? 999) || a.title.localeCompare(b.title)));
    return list.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) || a.title.localeCompare(b.title));
  }, [saved, catalog]);

  const updateOne = (m: SavedMeta) => {
    const item = findItem(catalog, m.url);
    if (item) enqueueSave(item.title, [item]);
  };
  const staleItems = [...saved.values()].filter((m) => updates.has(m.url));
  const total = [...saved.values()].reduce((a, m) => a + m.size, 0);

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      <section className="flex flex-col gap-4">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">Learn · offline reading</span>
        <h1 className="m-0 font-display text-[clamp(48px,7vw,104px)] font-extrabold leading-[0.86] tracking-tightest text-fg">
          Offline library<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 max-w-[680px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
          Save lessons, a whole world or the entire course on this device and read them with no internet: on a flight, on the metro, anywhere. Diagrams, code, quick checks and trials all work offline, and the progress you
          make syncs to your account when you&apos;re back online.
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
          <section aria-label="This device" className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-2">
            <AppCard />
            <StorageCard />
          </section>

          <section aria-labelledby="saved-h" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="saved-h" className="m-0 font-display text-[34px] font-bold tracking-[-0.03em] text-fg sm:text-[40px]">
                On this device
              </h2>
              <span className="font-mono text-xs text-fg-3">
                {saved.size} saved · {fmtBytes(total)}
                {staleItems.length > 0 && ` · ${staleItems.length} with updates`}
              </span>
            </div>
            {staleItems.length > 0 && !offline && (
              <button
                type="button"
                onClick={() => {
                  const items = staleItems.map((m) => findItem(catalog, m.url)).filter((i): i is NonNullable<typeof i> => !!i);
                  if (items.length) enqueueSave("Updating saved lessons", items);
                }}
                className="min-h-11 self-start border border-signal px-4 font-mono text-xs text-signal-text hover:bg-surface-2"
              >
                update all {staleItems.length}
              </button>
            )}
            {ready && saved.size === 0 && (
              <p className="m-0 max-w-[680px] border border-dashed border-line-strong p-5 text-[15px] leading-relaxed text-fg-2">
                Nothing saved yet. Open any lesson and tap <b className="text-fg">Save offline</b> next to the title, or save a whole world below.
              </p>
            )}
            {groups.map((g) => (
              <div key={g.id} className="flex flex-col">
                <div className="flex items-center justify-between gap-3 border-b border-line-strong pb-2 pt-3">
                  <h3 className="m-0 text-base font-semibold text-fg">{g.title}</h3>
                  <button
                    type="button"
                    onClick={() => void Promise.all(g.items.map((m) => removeSaved(m.url)))}
                    className="min-h-9 px-2 font-mono text-[11px] text-fg-3 hover:text-fg"
                  >
                    remove {g.items.length === 1 ? "it" : `all ${g.items.length}`}
                  </button>
                </div>
                <ul className="m-0 list-none p-0">
                  {g.items.map((m) => (
                    <SavedRow key={m.url} m={m} update={updates.has(m.url)} onUpdate={offline ? null : () => updateOne(m)} />
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section aria-labelledby="more-h" className="flex flex-col gap-4">
            <h2 id="more-h" className="m-0 font-display text-[34px] font-bold tracking-[-0.03em] text-fg sm:text-[40px]">
              Save more
            </h2>
            {offline ? (
              <p className="m-0 text-[15px] text-fg-3">Saving needs a connection. Everything above opens now.</p>
            ) : (
              <>
                <div className="flex flex-col gap-3 border border-line-strong bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex flex-col gap-1">
                    <span className="text-base font-semibold text-fg">The entire course</span>
                    <span className="text-sm text-fg-3">Every world, boss, trial, side quest and mock interview, with the course map. Large: best on wifi.</span>
                  </span>
                  <SaveCourseButton />
                </div>
                {!catalog ? (
                  <p className="m-0 font-mono text-xs text-fg-3">loading the course list…</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col p-0">
                    {catalog.groups
                      .filter((g) => g.kind !== "course")
                      .map((g) => (
                        <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3">
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-[15px] font-medium text-fg">{g.title}</span>
                            <span className="font-mono text-[11px] text-fg-3">
                              {g.items.length} {g.items.length === 1 ? "article" : "articles"} · ~{fmtBytes(g.items.reduce((a, i) => a + i.bytes, 0))}
                            </span>
                          </span>
                          <SaveGroupButton group={g.id} label={g.kind === "world" ? "Save world" : "Save all"} />
                        </li>
                      ))}
                  </ul>
                )}
              </>
            )}
          </section>

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
              <span>Keep saved lessons up to date: when online, refresh copies whose lesson changed (in the background).</span>
            </label>
            {saved.size > 0 &&
              (confirmAll ? (
                <span className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
                  Remove all {saved.size} saved articles from this device?
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmAll(false);
                      void removeAll();
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
            <p className="m-0 max-w-[680px] text-xs leading-relaxed text-fg-3">
              Saved copies live in this browser only (each browser and the installed app keep their own). Comments, Ask Claude, the leaderboard, search, sign-in and sharing need a connection; reading, diagrams,
              quick checks, trials, stage clears and XP don&apos;t.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
