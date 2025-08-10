"use client";
import { useEffect, useMemo, useState } from "react";

function getOrCreateVisitorId(): string {
  try {
    const key = "story_visitor_id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function EyeIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function StoryViewsClient({ slug }: { slug: string }) {
  const [total, setTotal] = useState<number | null>(null);
  const visitorId = useMemo(() => getOrCreateVisitorId(), []);

  useEffect(() => {
    const ac = new AbortController();

    async function readCounts() {
      try {
        const res = await fetch(`/api/stories/${encodeURIComponent(slug)}/track-view`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "x-visitor-id": visitorId,
          },
          signal: ac.signal,
        });
        if (!res.ok) throw new Error("post_failed");
        const data = await res.json();
        if (typeof data?.totalViews === "number") setTotal(data.totalViews);
      } catch {
        // Fallback to GET (no increment) so we at least show current count
        try {
          const r = await fetch(`/api/stories/${encodeURIComponent(slug)}/track-view`, {
            method: "GET",
            headers: { "Cache-Control": "no-store" },
            signal: ac.signal,
          });
          const d = await r.json();
          if (typeof d?.totalViews === "number") setTotal(d.totalViews);
        } catch {
          // ignore
        }
      }
    }

    readCounts();

    return () => ac.abort();
  }, [slug, visitorId]);

  if (total === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-white/60">
        <span className="relative inline-flex h-4 w-6 overflow-hidden rounded">
          <span className="absolute inset-0 bg-white/10" />
          <span className="absolute inset-0 -translate-x-full animate-[shimmer_1.2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </span>
        <EyeIcon className="h-4 w-4 animate-pulse opacity-70" />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-white/60">
      <EyeIcon className="h-4 w-4" />
      {total.toLocaleString()}
    </span>
  );
}
