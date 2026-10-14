"use client";
import { useEffect, useState } from "react";

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

/** "1,234 reads" — records this visit (once per visitor, server-side) and shows the total. */
export default function StoryViewsClient({ slug }: { slug: string }) {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const visitorId = getOrCreateVisitorId();

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
  }, [slug]);

  if (total === null) {
    return (
      <span className="inline-flex items-center gap-1.5" aria-busy="true">
        <span aria-hidden className="inline-block h-3 w-8 animate-pulse bg-surface-2" />
        <span>reads</span>
      </span>
    );
  }

  return (
    <span>
      <span className="font-mono">{total.toLocaleString()}</span> {total === 1 ? "read" : "reads"}
    </span>
  );
}
