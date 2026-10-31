"use client";

/**
 * A lesson's marks: load on open, undo / redo, and saving. Signed in: to the learner's lesson_annotations row 1 s after
 * the last change, at once when the tab is hidden or the page is left, with a localStorage backup of anything unsaved
 * (a dropped connection or a closed tab loses nothing; the next open picks it up). Signed out (or before the table
 * exists): this device's localStorage only. See src/lib/learn/ink/annotateStore.ts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ANNOT_LIMITS, annotBytes, emptyDoc, type AnnotDoc, type AnnotMark } from "@/lib/learn/ink/annotate";
import { AnnotError, dropBackup, dropLocal, loadAnnotations, saveAnnotations, saveLocal, writeBackup, type AnnotWhere } from "@/lib/learn/ink/annotateStore";

export type AnnotSaveState = "saved" | "pending" | "saving" | "offline" | "full" | "error";

const HISTORY = 100;

export function useAnnotations(lessonKey: string, signedIn: boolean, authLoading: boolean) {
  const [doc, setDoc] = useState<AnnotDoc>(emptyDoc);
  const [ready, setReady] = useState(false);
  const [where, setWhere] = useState<AnnotWhere>("device");
  const [note, setNote] = useState<string | null>(null);
  const [state, setState] = useState<AnnotSaveState>("saved");
  const [full, setFull] = useState(false);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });

  const docRef = useRef(doc);
  const savedRef = useRef<AnnotDoc | null>(doc);
  const whereRef = useRef<AnnotWhere>("device");
  const keyRef = useRef(lessonKey);
  const mergedLocal = useRef(false);
  const past = useRef<AnnotDoc[]>([]);
  const future = useRef<AnnotDoc[]>([]);
  const timer = useRef<number | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  const run = useCallback(async (): Promise<void> => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const d = docRef.current;
    const key = keyRef.current;
    if (d === savedRef.current) return;
    if (whereRef.current === "device") {
      saveLocal(key, d);
      savedRef.current = d;
      setState("saved");
      return;
    }
    if (inflight.current) {
      again.current = true;
      return inflight.current;
    }
    writeBackup(key, d);
    setState("saving");
    const job = (async () => {
      try {
        await saveAnnotations(key, d);
        savedRef.current = d;
        if (docRef.current === d) {
          dropBackup(key);
          setState("saved");
        }
        if (mergedLocal.current) {
          dropLocal(key);
          mergedLocal.current = false;
        }
      } catch (e) {
        const ae = e instanceof AnnotError ? e : null;
        if (ae?.code === "unavailable" || ae?.code === "auth") {
          // the account store isn't there (yet): keep them on this device
          whereRef.current = "device";
          setWhere("device");
          setNote(ae.message);
          saveLocal(key, d);
          savedRef.current = d;
          setState("saved");
        } else if (ae?.code === "full") {
          setState("full");
          setNote(ae.message);
        } else {
          setState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
          setNote(ae?.message || "Couldn't save your marks. They're kept on this device.");
        }
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = job;
    await job;
    if (again.current) {
      again.current = false;
      if (docRef.current !== savedRef.current) await run();
    }
  }, []);

  const schedule = useCallback(() => {
    setState((s) => (s === "saving" ? s : "pending"));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void run(), whereRef.current === "device" ? 300 : 1000);
  }, [run]);

  // load (again when the learner signs in or out)
  useEffect(() => {
    if (authLoading) return;
    let dead = false;
    keyRef.current = lessonKey;
    void loadAnnotations(lessonKey, signedIn).then((l) => {
      if (dead) return;
      docRef.current = l.doc;
      savedRef.current = l.dirty ? null : l.doc;
      whereRef.current = l.where;
      mergedLocal.current = l.mergedLocal;
      past.current = [];
      future.current = [];
      setDoc(l.doc);
      setWhere(l.where);
      setNote(l.note);
      setFull(annotBytes(l.doc) >= ANNOT_LIMITS.bytes);
      setHist({ undo: 0, redo: 0 });
      setState(l.dirty ? "pending" : "saved");
      setReady(true);
      if (l.dirty) schedule();
    });
    return () => {
      dead = true;
    };
  }, [lessonKey, signedIn, authLoading, schedule]);

  // hidden tab / leaving: keep a copy synchronously, then try the network
  useEffect(() => {
    const now = () => {
      const d = docRef.current;
      if (d === savedRef.current) return;
      if (whereRef.current === "device") saveLocal(keyRef.current, d);
      else writeBackup(keyRef.current, d);
      void run();
    };
    const onVis = () => document.visibilityState === "hidden" && now();
    const onOnline = () => docRef.current !== savedRef.current && void run();
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

  // retry a failed save every 20 s
  useEffect(() => {
    if (state !== "offline" && state !== "error") return;
    const id = window.setInterval(() => void run(), 20_000);
    return () => window.clearInterval(id);
  }, [state, run]);

  const commit = useCallback(
    (next: AnnotDoc) => {
      past.current = [...past.current.slice(-(HISTORY - 1)), docRef.current];
      future.current = [];
      docRef.current = next;
      setDoc(next);
      setHist({ undo: past.current.length, redo: 0 });
      setFull(annotBytes(next) >= ANNOT_LIMITS.bytes);
      schedule();
    },
    [schedule]
  );

  const add = useCallback(
    (m: AnnotMark) => {
      const next: AnnotDoc = { v: 1, marks: [...docRef.current.marks, m] };
      if (annotBytes(next) > ANNOT_LIMITS.bytes) {
        setFull(true);
        setNote("This lesson has as many marks as it can hold. Erase some to add more.");
        // a fresh array (same marks) so the layer drops the stroke it already drew
        const same: AnnotDoc = { v: 1, marks: [...docRef.current.marks] };
        if (savedRef.current === docRef.current) savedRef.current = same;
        docRef.current = same;
        setDoc(same);
        return;
      }
      commit(next);
    },
    [commit]
  );

  const remove = useCallback(
    (ids: Set<string>) => {
      const marks = docRef.current.marks.filter((m) => !ids.has(m.id));
      if (marks.length !== docRef.current.marks.length) commit({ v: 1, marks });
    },
    [commit]
  );

  /** restyle marks (recolour, thicker / thinner): one undo step */
  const patch = useCallback(
    (ids: Set<string>, fn: (m: AnnotMark) => AnnotMark) => {
      let hit = false;
      const marks = docRef.current.marks.map((m) => {
        if (!ids.has(m.id)) return m;
        hit = true;
        return fn(m);
      });
      if (hit) commit({ v: 1, marks });
    },
    [commit]
  );

  const step = useCallback(
    (dir: -1 | 1) => {
      const from = dir < 0 ? past.current : future.current;
      const to = dir < 0 ? future.current : past.current;
      const d = from.pop();
      if (!d) return;
      to.push(docRef.current);
      docRef.current = d;
      setDoc(d);
      setHist({ undo: past.current.length, redo: future.current.length });
      setFull(annotBytes(d) >= ANNOT_LIMITS.bytes);
      schedule();
    },
    [schedule]
  );
  const undo = useCallback(() => step(-1), [step]);
  const redo = useCallback(() => step(1), [step]);

  return { doc, ready, where, note, state, full, add, remove, patch, undo, redo, canUndo: hist.undo > 0, canRedo: hist.redo > 0, flush: run };
}
