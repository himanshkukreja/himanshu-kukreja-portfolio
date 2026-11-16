"use client";

import { useEffect, useState } from "react";

/** A concept's lecture: its media folder's slug and the script hash its recording must match. */
export type LectureRef = { slug: string; source: string };

/** Seconds of a lecture's recording, when it is published and made from this exact script (else null). Read from media.json once per page view. */
const durations = new Map<string, number | null>();

export function useLectureSeconds(base: string | null, lec: LectureRef | null, enabled = true): number | null {
  const key = lec ? `${lec.slug}@${lec.source}` : "";
  const ok = enabled && !!lec && !!base && /^https?:\/\//.test(base);
  const [, bump] = useState(0);
  useEffect(() => {
    if (!ok || !lec || !base || durations.has(key)) return;
    let off = false;
    fetch(`${base.replace(/\/$/, "")}/${lec.slug}/media.json`)
      .then((r) => (r.ok ? (r.json() as Promise<{ source?: string; duration?: number }>) : null))
      .then((m) => {
        durations.set(key, m && m.source === lec.source && m.duration ? m.duration : null);
        if (!off) bump((x) => x + 1);
      })
      .catch(() => durations.set(key, null));
    return () => {
      off = true;
    };
  }, [ok, base, lec, key]);
  return ok ? (durations.get(key) ?? null) : null;
}

/** 905 seconds as "15:05". */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
