"use client";

/**
 * Browser side of Design of the week: who is viewing (Supabase session, or a dev fixture persona),
 * fetch with the right Bearer token, the viewer's state for a challenge, and XP awards.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseClient } from "@/lib/supabase-client";
import { useGame } from "@/game/GameProvider";
import type { Award } from "@/lib/design-week/core";
import type { MeState } from "@/lib/design-week/views";

const DEV = process.env.NODE_ENV === "development";
const PERSONA_KEY = "hk.dowFx";
const EVT = "hk-dow-persona";

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(EVT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVT, cb);
  };
};
const noop = () => () => {};
const readPersona = () => {
  if (!DEV) return null;
  try {
    return window.localStorage.getItem(PERSONA_KEY);
  } catch {
    return null;
  }
};

/** Dev-only: act as a fixture learner (DOW_FIXTURES=1 on the server). */
export function setPersona(id: string | null) {
  if (!DEV) return;
  try {
    if (id) window.localStorage.setItem(PERSONA_KEY, id);
    else window.localStorage.removeItem(PERSONA_KEY);
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event(EVT));
}

export function usePersona(): string | null {
  return useSyncExternalStore(subscribe, readPersona, () => null);
}

export type Viewer = { ready: boolean; signedIn: boolean; key: string | null };

export function useViewer(): Viewer {
  const { user, loading } = useAuth();
  const persona = usePersona();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (DEV && persona) return { ready: mounted, signedIn: true, key: persona };
  return { ready: mounted && !loading, signedIn: !!user, key: user?.id ?? null };
}

export async function dowFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const persona = readPersona();
  if (DEV && persona) headers.set("Authorization", `Bearer fixture.${persona}`);
  else {
    const { data } = await supabaseClient.auth.getSession();
    if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(input, { ...init, headers, cache: "no-store" });
}

export type DowFetchError = Error & { status?: number; code?: string; fields?: Record<string, string> };

export async function dowJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await dowFetch(input, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || `HTTP ${res.status}`), { status: res.status, code: body?.code, fields: body?.fields }) as DowFetchError;
  return body as T;
}

/** Apply XP awards once (awardOnce is idempotent per key). */
export function useApplyAwards() {
  const { awardOnce, hydrated } = useGame();
  return useCallback(
    (awards: Award[] | undefined) => {
      if (!hydrated || !awards) return;
      awards.forEach((a) => awardOnce(a.key, a.xp, a.label));
    },
    [awardOnce, hydrated]
  );
}

/** The viewer's state for one challenge (null when signed out). */
export function useMe(slug: string) {
  const viewer = useViewer();
  const apply = useApplyAwards();
  const [state, setState] = useState<{ key: string; me: MeState | null; error: string | null } | null>(null);
  const [nonce, setNonce] = useState(0);
  const key = viewer.signedIn ? `${viewer.key}|${slug}|${nonce}` : null;
  const applied = useRef<string | null>(null);

  useEffect(() => {
    if (!viewer.ready || !key) return;
    let off = false;
    dowJson<MeState>(`/api/learn/design-week/${encodeURIComponent(slug)}/me`)
      .then((me) => {
        if (!off) setState({ key, me, error: null });
      })
      .catch((e: DowFetchError) => {
        if (!off) setState({ key, me: null, error: e.message });
      });
    return () => {
      off = true;
    };
  }, [viewer.ready, key, slug]);

  const me = state && state.key === key ? state.me : null;
  useEffect(() => {
    if (!me || applied.current === key) return;
    applied.current = key;
    apply(me.awards);
  }, [me, key, apply]);

  const patch = useCallback((fn: (m: MeState) => MeState) => setState((s) => (s && s.me ? { ...s, me: fn(s.me) } : s)), []);
  return {
    viewer,
    me,
    loading: !!key && (!state || state.key !== key),
    error: state && state.key === key ? state.error : null,
    refresh: () => setNonce((n) => n + 1),
    patch,
  };
}

/** Deterministic per-viewer shuffle seed (no herding on gallery order while counts are hidden). */
export function viewerSeed(): number {
  let v = "";
  try {
    v = window.localStorage.getItem("analytics_visitor_id") || window.sessionStorage.getItem("hk.dowSeed") || "";
    if (!v) {
      v = Math.random().toString(36).slice(2);
      window.sessionStorage.setItem("hk.dowSeed", v);
    }
  } catch {
    v = "anon";
  }
  let h = 2166136261;
  for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
