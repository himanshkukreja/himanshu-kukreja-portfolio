"use client";

/**
 * The signed-in learner's share settings (GET/PUT /api/learn/share), shared by every Share button,
 * the share sheet and the settings panel on the progress page. One fetch per session; a module
 * store read through useSyncExternalStore so all buttons agree.
 */
import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { userFetch, userJson } from "@/components/learn/progress/userFetch";
import type { ShareSettings, ShareState, Visibility } from "@/lib/share/model";

type Snap = { uid: string | null; state: ShareState | null; loading: boolean; error: string | null };

const EMPTY: Snap = { uid: null, state: null, loading: false, error: null };
let snap: Snap = EMPTY;
const subs = new Set<() => void>();

function set(next: Partial<Snap>) {
  snap = { ...snap, ...next };
  subs.forEach((f) => f());
}

function subscribe(cb: () => void) {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

export async function loadShare(uid: string, fresh = false) {
  if (snap.loading && snap.uid === uid && !fresh) return;
  set({ uid, loading: true, error: null, state: snap.uid === uid ? snap.state : null });
  try {
    const s = await userJson<ShareState>(`/api/learn/share${fresh ? "?fresh=1" : ""}`);
    if (snap.uid === uid) set({ state: s, loading: false });
  } catch (e) {
    if (snap.uid === uid) set({ loading: false, error: (e as Error).message || "Couldn't load your share settings" });
  }
}

export class ShareSaveError extends Error {
  problem?: string;
}

export async function saveShare(input: { enabled: boolean; handle: string; visibility: Visibility }): Promise<ShareSettings> {
  const res = await userFetch("/api/learn/share", { method: "PUT", body: JSON.stringify(input) }).catch(() => null);
  const body = res ? ((await res.json().catch(() => ({}))) as { settings?: ShareSettings; error?: string; problem?: string }) : {};
  if (!res || !res.ok || !body.settings) {
    const err = new ShareSaveError(body.error || (res ? `HTTP ${res.status}` : "You're offline"));
    err.problem = body.problem;
    throw err;
  }
  if (snap.state) set({ state: { ...snap.state, settings: body.settings, suggested: body.settings.handle } });
  return body.settings;
}

export async function checkHandle(h: string): Promise<{ ok: boolean; problem?: string; message?: string }> {
  return userJson(`/api/learn/share/handle?h=${encodeURIComponent(h)}`);
}

/** Share state for the current user; loads on first use. */
export function useShare() {
  const { user, loading: authLoading } = useAuth();
  const s = useSyncExternalStore(subscribe, () => snap, () => EMPTY);
  const uid = user?.id ?? null;
  useEffect(() => {
    if (uid && snap.uid !== uid) void loadShare(uid);
  }, [uid]);
  const mine = uid && s.uid === uid ? s : null;
  return {
    authLoading,
    signedIn: !!uid,
    uid,
    state: mine?.state ?? null,
    loading: authLoading || (!!uid && (!mine || mine.loading) && !mine?.state),
    error: mine?.error ?? null,
    refresh: (fresh = false) => uid && loadShare(uid, fresh),
  };
}
