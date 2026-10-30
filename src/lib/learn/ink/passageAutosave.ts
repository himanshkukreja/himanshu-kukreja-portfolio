"use client";

/**
 * Autosave for a handwritten note on a passage, the way usePageAutosave saves a notebook page: 900 ms after the last
 * stroke, at once when the tab is hidden or the page is left, with a localStorage copy of every unsaved version so
 * a dropped connection or a closed tab loses nothing (the next open of that note, or of a new note on the same
 * passage, picks the copy up). The first save of a new note creates its content_notes row; an empty pad never
 * creates one.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  backupKey,
  createInkNote,
  dropInkBackup,
  InkNoteError,
  updateInkNote,
  writeInkBackup,
  type InkNoteAnchor,
  type InkNoteInk,
  type InkNoteRow,
} from "./passage";

export type InkNoteSaveState = "saved" | "pending" | "saving" | "offline" | "full" | "error";

export const INK_SAVE_TEXT: Record<InkNoteSaveState, string> = {
  saved: "Saved",
  pending: "Writing…",
  saving: "Saving…",
  offline: "Offline · kept on this device",
  full: "Note full",
  error: "Not saved · kept on this device",
};

type Opts = {
  userId: string | null;
  anchor: InkNoteAnchor;
  /** the row, when the note already exists */
  noteId: string | null;
  /** the first save created the row */
  onCreated: (row: InkNoteRow) => void;
  /** a later save landed */
  onSaved: (id: string, ink: InkNoteInk, updatedAt: string) => void;
  delay?: number;
};

export function useInkNoteAutosave(opts: Opts) {
  const delay = opts.delay ?? 900;
  const [state, setState] = useState<InkNoteSaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const O = useRef(opts);
  useEffect(() => {
    O.current = opts;
  });
  const idRef = useRef<string | null>(opts.noteId);
  const latest = useRef<InkNoteInk | null>(null);
  const saved = useRef<InkNoteInk | null>(null);
  const timer = useRef<number | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  const key = () => backupKey(idRef.current, O.current.anchor);

  const run = useCallback(async (): Promise<void> => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const ink = latest.current;
    if (!ink || ink === saved.current) return;
    if (inflight.current) {
      again.current = true;
      return inflight.current;
    }
    const { userId, anchor } = O.current;
    // nothing written on a new note yet: nothing to create
    if (!idRef.current && !ink.strokes.length) {
      saved.current = ink;
      dropInkBackup(key());
      setState("saved");
      return;
    }
    writeInkBackup(key(), { ink, at: Date.now(), anchor });
    if (!userId) {
      setState("error");
      setError("Sign in to keep handwritten notes. This note is kept on this device.");
      return;
    }
    setState("saving");
    const job = (async () => {
      try {
        if (!idRef.current) {
          const before = key();
          const row = await createInkNote(userId, anchor, ink);
          idRef.current = row.id;
          dropInkBackup(before);
          O.current.onCreated(row);
        } else {
          const at = await updateInkNote(userId, idRef.current, { ink });
          if (at === null) throw new InkNoteError("not_found", "This note was deleted somewhere else.");
          O.current.onSaved(idRef.current, ink, at);
        }
        saved.current = ink;
        if (latest.current === ink) {
          dropInkBackup(key());
          setState("saved");
        } else writeInkBackup(key(), { ink: latest.current!, at: Date.now(), anchor });
        setError(null);
      } catch (e) {
        const ie = e instanceof InkNoteError ? e : null;
        setState(ie?.code === "full" ? "full" : ie?.code === "network" || !navigator.onLine ? "offline" : "error");
        setError(ie?.message || "Couldn't save. Your note is kept on this device.");
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = job;
    await job;
    if (again.current) {
      again.current = false;
      if (latest.current && latest.current !== saved.current) await run();
    }
  }, []);

  /** A new version of the ink (immutable: a new object per change). `dirty: false` marks the loaded version as saved. */
  const change = useCallback(
    (ink: InkNoteInk, dirty = true) => {
      latest.current = ink;
      if (!dirty) {
        saved.current = ink;
        return;
      }
      writeInkBackup(key(), { ink, at: Date.now(), anchor: O.current.anchor });
      setState((s) => (s === "saving" ? s : "pending"));
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void run(), delay);
    },
    [delay, run]
  );

  /** Save now; resolves with the row id (null when nothing was ever written). */
  const flush = useCallback(async (): Promise<string | null> => {
    await run();
    if (inflight.current) await inflight.current;
    return idRef.current;
  }, [run]);

  // hidden tab / leaving / back online
  useEffect(() => {
    const now = () => {
      const ink = latest.current;
      if (ink && ink !== saved.current) {
        writeInkBackup(key(), { ink, at: Date.now(), anchor: O.current.anchor });
        void run();
      }
    };
    const onVis = () => document.visibilityState === "hidden" && now();
    const onOnline = () => latest.current !== saved.current && void run();
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

  return { state, error, change, flush, id: () => idRef.current };
}
