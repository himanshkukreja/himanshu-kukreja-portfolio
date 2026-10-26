"use client";

/**
 * One save queue per tab (module state, so it keeps going across client-side navigations): single
 * articles, a whole world or the whole course go through it one article at a time, with progress
 * for the UI. A connection drop, a full disk or a site update stops the run with a reason; what is
 * already saved stays saved and the next run skips it.
 */
import { useSyncExternalStore } from "react";
import { track } from "@/lib/track";
import { itemProps } from "./analytics";
import { notifyChanged, OfflineSaveError, pathOf, requestPersistence, saveArticle, type SaveInput } from "./store";

export type SaveJob = {
  label: string;
  /** urls in this run, in order */
  urls: string[];
  done: number;
  failed: number;
  /** bytes stored so far in this run */
  bytes: number;
  current: string | null;
  /** bytes downloaded so far for the current item (lectures report as their audio arrives) */
  currentBytes?: number;
  status: "running" | "done" | "stopped";
  /** why the run stopped, in words for the reader */
  error: string | null;
  code: OfflineSaveError["code"] | null;
};

let job: SaveJob | null = null;
let queue: SaveInput[] = [];
let cancelled = false;
const listeners = new Set<() => void>();

function emit(next: SaveJob | null) {
  job = next ? { ...next } : null;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSaveJob(): SaveJob | null {
  return useSyncExternalStore(
    subscribe,
    () => job,
    () => null
  );
}

export function isQueued(url: string): boolean {
  return !!job && job.status === "running" && (job.current === url || queue.some((q) => q.url === url));
}

export function cancelSave() {
  cancelled = true;
}

export function dismissJob() {
  if (job && job.status !== "running") emit(null);
}

let asked = false;

// ---- analytics: one offline_save / offline_update per request (a request = one enqueueSave) --

export type SaveScope = "article" | "world" | "collection" | "course" | "update";

export type SaveMeta = {
  scope: SaveScope;
  /** updates: background refresh or the reader's "update" */
  trigger?: "auto" | "manual";
  /** world / collection: the catalog group */
  group?: { id: string; title: string };
};

type SaveRequest = SaveMeta & {
  urls: Set<string>;
  primary: SaveInput | null;
  start: number;
  done: number;
  failed: number;
  bytes: number;
};

let requests: SaveRequest[] = [];

function report(r: SaveRequest, result: "ok" | "cancelled" | "error", error: string | null) {
  const ok = r.done - r.failed;
  const common = { failed: r.failed, total: r.urls.size, bytes: r.bytes, duration_ms: Date.now() - r.start, result, ...(error ? { error } : {}) };
  if (r.scope === "update") {
    track("offline_update", { trigger: r.trigger ?? "manual", count: ok, ...common });
    return;
  }
  track("offline_save", {
    scope: r.scope,
    items: ok,
    ...common,
    ...(r.scope === "article" && r.primary ? itemProps(r.primary) : {}),
    ...(r.group ? { group: r.group.id, title: r.group.title.slice(0, 120) } : {}),
  });
}

function settle(url: string, ok: boolean, bytes: number) {
  const key = pathOf(url);
  requests = requests.filter((r) => {
    if (!r.urls.has(key)) return true;
    r.done++;
    if (!ok) r.failed++;
    r.bytes += bytes;
    if (r.done < r.urls.size) return true;
    report(r, r.failed === r.done ? "error" : "ok", r.failed === r.done ? "http" : null);
    return false;
  });
}

function stopRequests(result: "cancelled" | "error", error: string | null) {
  for (const r of requests) report(r, result, error);
  requests = [];
}

/**
 * Queue articles for saving; runs immediately unless a run is going (then they join it).
 * `meta` says what the reader asked for (analytics): one article, a world, the course, an update.
 */
export function enqueueSave(label: string, items: SaveInput[], meta: SaveMeta = { scope: "article" }) {
  const fresh = items.filter((i) => !queue.some((q) => q.url === i.url) && job?.current !== i.url);
  if (!fresh.length) return;
  requests.push({
    ...meta,
    urls: new Set(fresh.map((f) => pathOf(f.url))),
    // the page the reader saved (the course map rides along with any first save)
    primary: items.find((i) => i.kind !== "hub") ?? items[0] ?? null,
    start: Date.now(),
    done: 0,
    failed: 0,
    bytes: 0,
  });
  if (!asked) {
    asked = true;
    void requestPersistence(); // first save: ask the browser to keep the library (silent where granted)
  }
  if (job && job.status === "running") {
    queue.push(...fresh);
    emit({ ...job, urls: [...job.urls, ...fresh.map((f) => f.url)], label: job.label === label ? label : "Saving for offline" });
    return;
  }
  queue = [...fresh];
  cancelled = false;
  emit({ label, urls: fresh.map((f) => f.url), done: 0, failed: 0, bytes: 0, current: null, status: "running", error: null, code: null });
  void run();
}

async function run() {
  while (queue.length && job) {
    if (cancelled) {
      queue = [];
      emit({ ...job, current: null, status: "stopped", error: "Stopped. Everything saved so far stays saved.", code: null });
      stopRequests("cancelled", null);
      notifyChanged();
      return;
    }
    const item = queue.shift()!;
    emit({ ...job, current: item.url, currentBytes: 0 });
    try {
      let got = 0;
      let last = 0;
      const rec = await saveArticle(item, {
        onBytes: (n) => {
          got += n;
          // a few updates a second at most
          const now = Date.now();
          if (job && now - last > 250) {
            last = now;
            emit({ ...job, currentBytes: got });
          }
        },
      });
      emit({ ...job, done: job.done + 1, bytes: job.bytes + rec.size, currentBytes: 0 });
      settle(item.url, true, rec.size);
    } catch (e) {
      if (e instanceof OfflineSaveError && e.code !== "http") {
        queue = [];
        emit({ ...job, current: null, status: "stopped", error: e.message, code: e.code });
        stopRequests("error", e.code);
        notifyChanged();
        return;
      }
      emit({ ...job, done: job.done + 1, failed: job.failed + 1 });
      settle(item.url, false, 0);
    }
    // other components re-read the library as items land (cheap: meta records only)
    if (job.done % 5 === 0 || !queue.length) notifyChanged();
  }
  if (job) emit({ ...job, current: null, status: "done" });
  // anything still open (an item two requests shared that only one of them counted)
  for (const r of requests) report(r, r.failed && r.failed === r.done ? "error" : "ok", null);
  requests = [];
  notifyChanged();
}
