import "server-only";
/**
 * Where viewers leave each short, from the feed's own short_watch events (one per view, sent since 28 Oct 2026):
 * `pct` is the furthest point reached as a share of the short's length and `loops` > 0 means it played to the
 * end and went round again. (`sec` is time played, loops included, so it isn't a position.) A view's furthest
 * point is pct x the recorded length; the retention curve at second t is the share of views whose furthest
 * point is at least t. The owner's test traffic is dropped. The event rows are read once per 10 minutes per range.
 */
import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";
import { dropInternal } from "@/lib/analytics/excludeServer";
import type { ShortPack } from "./pack";

type Row = { visitor_id: string | null; user_id: string | null; metadata: Record<string, unknown> | null };

/** A view's furthest point as a share of the length (0–1); 1 when it looped. */
export type Views = Record<string, number[]>;

async function load(days: number): Promise<Views> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows: Row[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await supabase
      .from("analytics_events")
      .select("visitor_id, user_id, metadata")
      .eq("event_type", "event")
      .eq("metadata->>name", "short_watch")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`analytics_events: ${error.message}`);
    rows.push(...((data || []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  const out: Views = {};
  for (const r of await dropInternal(rows)) {
    const m = r.metadata || {};
    const id = String(m.short || "");
    if (!id.startsWith("shorts--")) continue;
    const pct = Number(m.loops) > 0 ? 1 : Math.max(0, Math.min(1, Number(m.pct) || 0));
    (out[id] ||= []).push(pct);
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a - b);
  return out;
}

const cached = unstable_cache(load, ["shorts-retention-v1"], { revalidate: 600 });
export const shortViews = (days: number) => cached(days);

/** Under this many views a short's numbers are shown but not judged. */
export const MIN_VIEWS = 20;
/** The hook: the first 3 seconds. */
export const HOOK_SEC = 3;
/** Reaching 90% counts as finished (the feed's `done`): leaving after that isn't a drop. */
export const DONE_AT = 0.9;

export type Drop = { step: number; from: number; to: number; scene: number; sceneTitle: string; /** share of all views lost during this step */ lost: number };

export type RetentionSummary = {
  id: string;
  views: number;
  duration: number;
  /** share of views past 3 s */
  hold: number | null;
  /** share of views that reached 90% */
  finish: number | null;
  /** median furthest point, seconds */
  median: number | null;
  /** the step that loses the most viewers after the hook */
  drop: Drop | null;
  timing: ShortPack["timing"] | null;
};

const lengthOf = (p: ShortPack | undefined, fallback: number) => p?.duration ?? fallback;

/** Seconds reached per view. */
const reached = (pcts: number[], dur: number) => pcts.map((p) => p * dur);

/** Viewers lost during each step (share of all views), counting only those past the hook who didn't finish. */
export function lossByStep(pcts: number[], pack: ShortPack, dur: number): number[] {
  const n = pcts.length;
  const f = reached(pcts, dur);
  return pack.starts.map((from, i) => {
    const to = i + 1 < pack.starts.length ? pack.starts[i + 1] : dur;
    const lo = Math.max(from, HOOK_SEC);
    if (!n || to <= lo) return 0;
    return f.filter((x) => x >= lo && x < to && x < dur * DONE_AT).length / n;
  });
}

export function summarize(id: string, pcts: number[], pack: ShortPack | undefined, fallbackLength: number): RetentionSummary {
  const dur = lengthOf(pack, fallbackLength);
  const n = pcts.length;
  const f = reached(pcts, dur);
  let drop: Drop | null = null;
  if (pack && n) {
    const loss = lossByStep(pcts, pack, dur);
    let best = -1;
    for (let i = 0; i < loss.length; i++) if (loss[i] > 0 && (best < 0 || loss[i] > loss[best])) best = i;
    if (best >= 0) {
      const scene = pack.stepScene[best] ?? 0;
      drop = { step: best, from: pack.starts[best], to: best + 1 < pack.starts.length ? pack.starts[best + 1] : dur, scene, sceneTitle: pack.sceneTitles[scene] ?? "", lost: loss[best] };
    }
  }
  return {
    id,
    views: n,
    duration: dur,
    hold: n ? f.filter((x) => x >= HOOK_SEC).length / n : null,
    finish: n ? pcts.filter((p) => p >= DONE_AT).length / n : null,
    median: n ? Math.round(f[Math.floor((n - 1) / 2)] * 10) / 10 : null,
    drop,
    timing: pack?.timing ?? null,
  };
}

/** Share of views still watching at each whole second, 0..ceil(length). */
export function curve(pcts: number[], dur: number): number[] {
  const f = reached(pcts, dur);
  const n = f.length;
  const out: number[] = [];
  for (let t = 0; t <= Math.ceil(dur); t++) out.push(n ? f.filter((x) => x >= t - 1e-6).length / n : 0);
  return out;
}
