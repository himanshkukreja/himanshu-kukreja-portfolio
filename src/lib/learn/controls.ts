import "server-only";
/**
 * Publishing controls (/admin/publishing): whether a released short or side quest is shown, a scheduled
 * go-live time, and the shorts pinned to the front of the feed. Rows live in content_controls
 * (supabase/migrations/20261028_content_controls.sql); no row = live. Read once per cache window
 * (tag CONTROLS_TAG, refreshed on every admin change), never per visit.
 */
import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";

export const CONTROLS_TAG = "content-controls";

export type Control = { key: string; kind: "short" | "quest"; status: "live" | "hidden" | "scheduled"; publish_at: string | null; pin: number | null; updated_by: string | null; updated_at: string };

async function load(): Promise<Control[]> {
  const { data, error } = await supabase.from("content_controls").select("key, kind, status, publish_at, pin, updated_by, updated_at").limit(5000);
  // a read failure must never hide content: no rows = everything live
  if (error) {
    console.warn("[controls]", error.message);
    return [];
  }
  return (data || []) as Control[];
}

// 5 minutes: a scheduled item goes live within minutes of its time on pages that rebuild
export const getControls = unstable_cache(load, ["content-controls-v1"], { revalidate: 300, tags: [CONTROLS_TAG] });

export const shortKey = (id: string) => `short:${id}`;
export const questKey = (slug: string) => `quest:${slug}`;

/** Live now? (no row = live; scheduled = live once its time has passed) */
export function isLive(c: Control | undefined, now = Date.now()): boolean {
  if (!c || c.status === "live") return true;
  if (c.status === "scheduled") return !!c.publish_at && Date.parse(c.publish_at) <= now;
  return false;
}

export async function controlMap(): Promise<Map<string, Control>> {
  return new Map((await getControls().catch(() => [] as Control[])).map((c) => [c.key, c]));
}
