"use client";

/**
 * Offline-reading analytics, one vocabulary for every event (sent with the site's track(), so
 * PostHog gets them; while offline they wait in the durable queue of lib/analytics/client.ts):
 *
 *   offline_save    scope article|world|collection|course, kind, slug, week, title, group, items,
 *                   failed, total, bytes, duration_ms, result ok|cancelled|error, error (code)
 *   offline_update  trigger auto|manual, count, failed, bytes, duration_ms, result, error
 *   offline_remove  scope article|world|all, slug, kind, week, title, group, items, bytes
 *   offline_open    a page answered from this device's copy: source saved|recent|fallback|library,
 *                   slug, kind, week, title
 *   pwa_install_prompt  outcome shown|accepted|dismissed, platform, via prompt|ios_sheet
 *   pwa_installed       platform
 * Learning events captured with no connection carry `offline: true` (+ offline_source).
 */
import { track } from "@/lib/track";
import type { OfflineKind, SavedMeta } from "./types";

/** The kinds as analytics names them (catalog "capstone" is the world's boss). */
export function kindName(kind: OfflineKind | string | undefined): string {
  switch (kind) {
    case "capstone":
      return "boss";
    case "sidequest":
      return "side_quest";
    case "story":
      return "case_file";
    case "hub":
      return "course_map";
    case "revision":
      return "revision_deck";
    case "cheatsheet":
      return "cheat_sheet";
    case "lab":
      return "code_lab";
    default:
      return kind || "page";
  }
}

/** slug / week (and course) of a saved path. */
export function refOf(url: string): { slug: string; week?: string; course?: string } {
  let path = url;
  try {
    path = new URL(url, "https://x").pathname;
  } catch {
    /* already a path */
  }
  const seg = path
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  if (seg[0] === "learn" && seg[1] === "mock" && seg[2]) return { slug: seg[2] };
  if (seg[0] === "learn" && seg[1] === "labs") return { slug: seg[2] || "labs" };
  if (seg[0] === "learn" && (seg[1] === "revise" || seg[1] === "cheatsheet") && seg[2]) return { week: seg[2], slug: seg[3] || seg[1] };
  if (seg[0] === "learn" && (seg[1] === "numbers" || seg[1] === "plan") && seg.length === 2) return { slug: seg[1] };
  if (seg[0] === "learn" && seg.length >= 4) return { course: seg[1], week: seg[2], slug: seg[3] };
  if (seg[0] === "learn" && seg.length === 2) return { course: seg[1], slug: seg[1] };
  if (seg[0] === "stories" && seg[1]) return { slug: seg[1] };
  return { slug: path };
}

const clip = (s: string | undefined, n = 120) => (s && s.length > n ? s.slice(0, n) : s);

export function itemProps(m: { url: string; kind?: OfflineKind | string; title?: string; group?: string }) {
  const r = refOf(m.url);
  return { kind: kindName(m.kind), slug: r.slug, ...(r.week ? { week: r.week } : {}), ...(m.title ? { title: clip(m.title) } : {}), ...(m.group ? { group: m.group } : {}) };
}

export type RemoveScope = "article" | "world" | "all";

export function trackRemove(scope: RemoveScope, items: SavedMeta[], group?: { id: string; title: string }) {
  if (!items.length) return;
  const bytes = items.reduce((a, m) => a + (m.size || 0), 0);
  const base = { scope, items: items.length, bytes };
  if (scope === "article") track("offline_remove", { ...base, ...itemProps(items[0]) });
  else if (scope === "world") track("offline_remove", { ...base, group: group?.id ?? items[0].group, title: clip(group?.title ?? items[0].groupTitle) });
  else track("offline_remove", { ...base, slug: "all" });
}

export type OpenSource = "saved" | "recent" | "fallback" | "library";

export function trackOpen(source: OpenSource, path: string, meta: SavedMeta | null) {
  const props = meta ? itemProps(meta) : source === "library" || source === "fallback" ? { kind: source } : itemProps({ url: path });
  // the fallback page knows which page was asked for
  let from: string | undefined;
  if (source === "fallback") {
    try {
      from = new URLSearchParams(window.location.search).get("from") || undefined;
    } catch {
      from = undefined;
    }
  }
  track("offline_open", { source, ...props, ...(from ? { requested: clip(from, 200), slug: refOf(from).slug } : {}) });
}
