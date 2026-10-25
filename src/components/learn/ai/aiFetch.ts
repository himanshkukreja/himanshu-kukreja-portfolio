"use client";

/**
 * fetch() for the AI routes: the learner's session token, plus their own Anthropic key when they
 * added one (bring your own key). The key lives only in this browser and is sent only to /api/learn/ai/*.
 */
import { userFetch } from "@/components/learn/progress/userFetch";

const KEY = "hk.ai.key";
export const AI_KEY_EVENT = "hk:ai-key";

export function readOwnKey(): string {
  try {
    return window.localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function saveOwnKey(k: string) {
  try {
    if (k) window.localStorage.setItem(KEY, k);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event(AI_KEY_EVENT));
}

export function aiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const k = readOwnKey();
  if (k) headers.set("x-anthropic-key", k);
  return userFetch(input, { ...init, headers });
}
