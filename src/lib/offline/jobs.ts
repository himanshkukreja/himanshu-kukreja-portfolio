"use client";

/**
 * One save queue per tab (module state, so it keeps going across client-side navigations): single
 * articles, a whole world or the whole course go through it one article at a time, with progress
 * for the UI. A connection drop, a full disk or a site update stops the run with a reason; what is
 * already saved stays saved and the next run skips it.
 */
import { useSyncExternalStore } from "react";
import { notifyChanged, OfflineSaveError, requestPersistence, saveArticle, type SaveInput } from "./store";

export type SaveJob = {
  label: string;
  /** urls in this run, in order */
  urls: string[];
  done: number;
  failed: number;
  /** bytes stored so far in this run */
  bytes: number;
  current: string | null;
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

/** Queue articles for saving; runs immediately unless a run is going (then they join it). */
export function enqueueSave(label: string, items: SaveInput[]) {
  const fresh = items.filter((i) => !queue.some((q) => q.url === i.url) && job?.current !== i.url);
  if (!fresh.length) return;
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
      notifyChanged();
      return;
    }
    const item = queue.shift()!;
    emit({ ...job, current: item.url });
    try {
      const rec = await saveArticle(item);
      emit({ ...job, done: job.done + 1, bytes: job.bytes + rec.size });
    } catch (e) {
      if (e instanceof OfflineSaveError && e.code !== "http") {
        queue = [];
        emit({ ...job, current: null, status: "stopped", error: e.message, code: e.code });
        notifyChanged();
        return;
      }
      emit({ ...job, done: job.done + 1, failed: job.failed + 1 });
    }
    // other components re-read the library as items land (cheap: meta records only)
    if (job.done % 5 === 0 || !queue.length) notifyChanged();
  }
  if (job) emit({ ...job, current: null, status: "done" });
  notifyChanged();
}
