"use client";

/**
 * Is the signed-in user an admin? For the site's "Admin" links (header, course nav, account menu). Asks the server
 * (GET /api/admin/me?soft=1 with the session's Bearer token: { admin, owner }, never the admin list) once per user
 * per browser tab session: the answer is kept in sessionStorage under the user's id and shared by every caller.
 * Signed out, still asking, or the check failing: not an admin (nothing shows). An admin added or removed while a tab
 * is open sees the change in a new tab or after signing in again; the server checks every admin request anyway.
 */
import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { adminFetch } from "./fetch";

export type AdminMe = { admin: boolean; owner: boolean };

const KEY = "hk.adminMe.";
const EVENT = "hk-admin-me";
const NO: AdminMe = { admin: false, owner: false };
const answers = new Map<string, AdminMe>();
const asking = new Set<string>();

function read(id: string): AdminMe | null {
  const hit = answers.get(id);
  if (hit) return hit;
  try {
    const v = window.sessionStorage.getItem(KEY + id);
    if (v === "0" || v === "1" || v === "2") {
      const me = { admin: v !== "0", owner: v === "2" };
      answers.set(id, me);
      return me;
    }
  } catch {
    /* storage blocked: ask the server */
  }
  return null;
}

function save(id: string, me: AdminMe) {
  answers.set(id, me);
  try {
    window.sessionStorage.setItem(KEY + id, me.owner ? "2" : me.admin ? "1" : "0");
  } catch {
    /* storage blocked: this page view still knows */
  }
  window.dispatchEvent(new Event(EVENT));
}

async function ask(id: string) {
  if (asking.has(id) || read(id)) return;
  asking.add(id);
  try {
    const r = await adminFetch("/api/admin/me?soft=1");
    const b = (await r.json().catch(() => ({}))) as Partial<AdminMe>;
    save(id, r.ok && b.admin === true ? { admin: true, owner: b.owner === true } : NO);
  } catch {
    // offline or a network blip: no link this time, ask again on the next page load
  } finally {
    asking.delete(id);
  }
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
};

export function useIsAdmin(): AdminMe {
  const { user } = useAuth();
  const id = user?.id ?? null;
  const me = useSyncExternalStore(
    subscribe,
    () => (id ? read(id) : null),
    () => null,
  );
  useEffect(() => {
    if (id) void ask(id);
  }, [id]);
  return me ?? NO;
}
