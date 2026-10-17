"use client";

/** Sends progress queued while offline (lib/offline/syncQueue) once the connection is back. */
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { isOffline } from "@/lib/offline/connectivity";
import { flushQueue, pendingCount } from "@/lib/offline/syncQueue";

export default function OfflineSync() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let t: number | null = null;
    const run = (force = false) => {
      if (isOffline() || !pendingCount(userId)) return;
      void flushQueue(userId, { force });
    };
    run(true); // anything left from an earlier offline session
    const onReconnect = () => run(true);
    const onVisible = () => document.visibilityState === "visible" && run();
    // a write was queued while online (a failed request): try again shortly
    const onQueued = () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => run(), 4000);
    };
    window.addEventListener("hk:reconnected", onReconnect);
    window.addEventListener("online", onReconnect);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("hk:sync-queue", onQueued);
    return () => {
      if (t) window.clearTimeout(t);
      window.removeEventListener("hk:reconnected", onReconnect);
      window.removeEventListener("online", onReconnect);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("hk:sync-queue", onQueued);
    };
  }, [userId]);

  return null;
}
