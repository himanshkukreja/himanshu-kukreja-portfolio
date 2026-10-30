"use client";

/**
 * Notebook pages: saving. usePageAutosave saves a page 1 s after the last change, at once when the tab is hidden
 * or the page is left (visibilitychange / pagehide), and keeps a localStorage copy of every unsaved page so a
 * dropped connection or a closed tab loses nothing: the next open of that page picks the copy up (loadPage) and
 * saves it. Also useInkUser: who is writing (the signed-in learner, or the dev stand-in).
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getPage, InkError, inkDevStore, savePage } from "./client";
import type { NotebookPage } from "./types";

const BACKUP = (id: string) => `hk.ink.backup:${id}`;

type Backup = { page: NotebookPage; at: number };

function readBackup(id: string): Backup | null {
  try {
    const raw = window.localStorage.getItem(BACKUP(id));
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}
function writeBackup(page: NotebookPage) {
  try {
    window.localStorage.setItem(BACKUP(page.id), JSON.stringify({ page, at: Date.now() } satisfies Backup));
  } catch {
    // storage full or blocked: the network save is still tried
  }
}
function dropBackup(id: string) {
  try {
    window.localStorage.removeItem(BACKUP(id));
  } catch {
    // ignore
  }
}

/**
 * Loads a page, preferring this device's unsaved copy when there is one (it is newer than anything saved: the
 * copy is dropped as soon as a save lands). `restored` says the copy was used (it still needs saving).
 */
export async function loadPage(id: string): Promise<{ page: NotebookPage | null; restored: boolean }> {
  const b = readBackup(id);
  try {
    const page = await getPage(id);
    // the copy wins unless the page was saved (from another device) after it was made
    if (b && page && b.at > (Date.parse(page.updatedAt) || 0)) return { page: { ...b.page, notebookId: page.notebookId, position: page.position }, restored: true };
    if (b) dropBackup(id);
    return { page, restored: false };
  } catch (e) {
    // offline: the copy on this device, if any
    if (b && !(e instanceof InkError && (e.code === "auth" || e.code === "unavailable"))) return { page: b.page, restored: true };
    throw e;
  }
}

export type SaveState = "saved" | "pending" | "saving" | "offline" | "full" | "error";

/**
 * Autosave for one page. Pass every new version of the page (immutable updates); `dirty` is false for the version
 * that was just loaded. Returns the state for the toolbar ("Saved", "Saving…", "Offline · kept on this device") and
 * flush() to save now (before navigating to another page).
 */
export function usePageAutosave(page: NotebookPage | null, opts?: { delay?: number; dirty?: boolean }) {
  const delay = opts?.delay ?? 1000;
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<NotebookPage | null>(null);
  const savedRef = useRef<NotebookPage | null>(null);
  const timer = useRef<number | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  const run = useCallback(async (): Promise<void> => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const p = latest.current;
    if (!p || p === savedRef.current) return;
    if (inflight.current) {
      again.current = true;
      return inflight.current;
    }
    writeBackup(p);
    setState("saving");
    const job = (async () => {
      try {
        await savePage(p);
        savedRef.current = p;
        if (latest.current === p) {
          dropBackup(p.id);
          setState("saved");
        }
        setError(null);
      } catch (e) {
        const ie = e instanceof InkError ? e : null;
        setState(ie?.code === "full" ? "full" : ie?.code === "network" || !navigator.onLine ? "offline" : "error");
        setError(ie?.message || "Couldn't save. Your page is kept on this device.");
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = job;
    await job;
    if (again.current) {
      again.current = false;
      if (latest.current && latest.current !== savedRef.current) await run();
    }
  }, []);

  // a new version: save after `delay`
  useEffect(() => {
    if (!page) return;
    if (latest.current?.id !== page.id) {
      // another page opened: the old one was flushed by its owner; this version is the saved state unless dirty
      latest.current = page;
      savedRef.current = opts?.dirty ? null : page;
       
      setState(opts?.dirty ? "pending" : "saved");
      if (!opts?.dirty) return;
    }
    latest.current = page;
    if (page === savedRef.current) return;
    setState((s) => (s === "saving" ? s : "pending"));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void run(), delay);
  }, [page, delay, run, opts?.dirty]);

  // hidden tab / leaving: back up synchronously, then try the network
  useEffect(() => {
    const now = () => {
      const p = latest.current;
      if (p && p !== savedRef.current) {
        writeBackup(p);
        void run();
      }
    };
    const onVis = () => document.visibilityState === "hidden" && now();
    const onOnline = () => latest.current !== savedRef.current && void run();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", now);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", now);
      window.removeEventListener("online", onOnline);
      now();
    };
  }, [run]);

  // retry an offline save every 20 s
  useEffect(() => {
    if (state !== "offline" && state !== "error") return;
    const id = window.setInterval(() => void run(), 20_000);
    return () => window.clearInterval(id);
  }, [state, run]);

  return { state, error, flush: run };
}

// ------------------------------------------------------------------ who

const noop = () => () => {};
/** The dev stand-in flag, read after mount (localStorage). */
export function useInkDev(): boolean {
  return useSyncExternalStore(noop, inkDevStore, () => false);
}

/** The learner the notebook writes for: signed in, or the dev stand-in's fake user under `next dev`. */
export function useInkUser(): { userId: string | null; loading: boolean; dev: boolean } {
  const { user, loading } = useAuth();
  const dev = useInkDev();
  if (dev) return { userId: "dev", loading: false, dev: true };
  return { userId: user?.id ?? null, loading, dev: false };
}
