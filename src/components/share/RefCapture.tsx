"use client";

/**
 * Referral capture. A visit to /u/<handle> or any page with ?ref=<handle> remembers the referrer
 * in this browser (first touch, 30 days, survives the OAuth round trip) and records one visit row;
 * when this browser signs in, the sign-up is attributed once (POST /api/learn/share/claim).
 * Skipped entirely when the admin's no-track flag is set.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { isValidHandle } from "@/lib/share/handle";
import { userFetch } from "@/components/learn/progress/userFetch";

const KEY = "hk.ref.v1";
const TTL = 30 * 86_400_000;

type Stored = { h: string; at: number; claimed?: boolean; sent?: string[] };

function read(): Stored | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Stored) : null;
    return v && isValidHandle(v.h) && typeof v.at === "number" && Date.now() - v.at < TTL ? v : null;
  } catch {
    return null;
  }
}

function write(v: Stored) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* storage blocked: attribution for this page view only */
  }
}

const noTrack = () => {
  try {
    return window.localStorage.getItem("hk.notrack") === "1";
  } catch {
    return false;
  }
};

const visitorId = () => {
  try {
    return window.localStorage.getItem("analytics_visitor_id");
  } catch {
    return null;
  }
};

export default function RefCapture({ handle }: { handle?: string }) {
  const pathname = usePathname();
  const { user, session } = useAuth();
  const uid = user?.id ?? null;
  const token = session?.access_token ?? null;

  // 1. remember the referrer + record the visit (once per referrer per browser)
  useEffect(() => {
    if (noTrack()) return;
    const q = new URLSearchParams(window.location.search);
    const fromUrl = (q.get("ref") || "").toLowerCase();
    const h = isValidHandle(handle) ? handle : isValidHandle(fromUrl) ? fromUrl : null;
    if (!h) return;
    const cur = read();
    const next: Stored = cur || { h, at: Date.now() };
    write(next);
    if ((next.sent || []).includes(h)) return;
    // the tracker creates the visitor id on its first page view; give it a moment
    const t = window.setTimeout(() => {
      const vid = visitorId();
      if (!vid) return;
      const body = JSON.stringify({ h, vid, path: window.location.pathname, ch: q.get("utm_source") || (document.referrer ? "direct" : null) });
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      fetch("/api/share/visit", { method: "POST", headers, body, keepalive: true })
        .then((r) => {
          if (!r.ok) return;
          const s = read() || next;
          write({ ...s, sent: [...new Set([...(s.sent || []), h])].slice(-20) });
        })
        .catch(() => {});
    }, 1200);
    return () => window.clearTimeout(t);
  }, [pathname, handle, token]);

  // 2. attribute the sign-up once this browser has an account
  useEffect(() => {
    if (!uid || noTrack()) return;
    const s = read();
    if (!s || s.claimed) return;
    let off = false;
    userFetch("/api/learn/share/claim", { method: "POST", body: JSON.stringify({ h: s.h, vid: visitorId(), at: s.at }) })
      .then((r) => {
        if (!off && r.ok) write({ ...(read() || s), claimed: true });
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [uid]);

  return null;
}
