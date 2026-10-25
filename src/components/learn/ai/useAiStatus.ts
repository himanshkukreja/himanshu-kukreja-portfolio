"use client";

/**
 * Which AI features this person can use right now and their credits left today, from
 * /api/learn/ai/status. One request per sign-in state, shared by every component; features call
 * `setAiCredits` after each answer so the count stays current without refetching.
 */
import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { userFetch } from "@/components/learn/progress/userFetch";

export type AiStatus = {
  available: boolean;
  preview: boolean;
  signedIn: boolean;
  mode: "green" | "amber" | "red" | "off";
  features: Partial<Record<string, boolean>>;
  creditsLeft: number | null;
  creditsPerDay: number;
};

let state: { key: string; s: AiStatus | null } = { key: "", s: null };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let inflight: string | null = null;

function load(key: string) {
  if (inflight === key || state.key === key) return;
  inflight = key;
  userFetch("/api/learn/ai/status")
    .then((r) => (r.ok ? (r.json() as Promise<AiStatus>) : null))
    .then((s) => {
      state = { key, s };
      emit();
    })
    .catch(() => {
      state = { key, s: null };
      emit();
    })
    .finally(() => {
      inflight = null;
    });
}

export function setAiCredits(creditsLeft: number | null | undefined) {
  if (!state.s || creditsLeft === undefined) return;
  state = { ...state, s: { ...state.s, creditsLeft } };
  emit();
}

export function useAiStatus(): AiStatus | null {
  const { user, loading } = useAuth();
  const key = loading ? "" : user?.id || "guest";
  useEffect(() => {
    if (key) load(key);
  }, [key]);
  const snap = useSyncExternalStore(
    (cb) => (subs.add(cb), () => subs.delete(cb)),
    () => state,
    () => state,
  );
  return snap.key === key ? snap.s : null;
}
