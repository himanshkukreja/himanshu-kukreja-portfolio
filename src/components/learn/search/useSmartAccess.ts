"use client";

/**
 * May this person use smart search? Everyone once SMART_SEARCH_PUBLIC is true; until then only admins
 * (checked once per sign-in with GET /api/admin/me, shared by the page and the ⌘K "Ask" row).
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { userFetch } from "@/components/learn/progress/userFetch";
import { SMART_SEARCH_PUBLIC } from "@/lib/search/smart/flag";

export type SmartAccess = "open" | "closed" | "checking";

const known = new Map<string, Promise<boolean>>();

export function useSmartAccess(): SmartAccess {
  const { user, loading } = useAuth();
  const [admin, setAdmin] = useState<{ id: string; ok: boolean } | null>(null);
  const uid = user?.id ?? null;
  useEffect(() => {
    if (SMART_SEARCH_PUBLIC || !uid) return;
    let off = false;
    if (!known.has(uid)) known.set(uid, userFetch("/api/admin/me").then((r) => r.ok).catch(() => false));
    known.get(uid)!.then((ok) => !off && setAdmin({ id: uid, ok }));
    return () => {
      off = true;
    };
  }, [uid]);
  if (SMART_SEARCH_PUBLIC) return "open";
  if (loading) return "checking";
  if (!uid) return "closed";
  if (!admin || admin.id !== uid) return "checking";
  return admin.ok ? "open" : "closed";
}
