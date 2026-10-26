/**
 * The offline library's model: every catalog item and every saved page, merged by path, sorted into
 * sections (sections.ts) and, inside a section, sub-groups (a world, a lecture playlist section,
 * stories vs war rooms). Works without the catalog too (offline): then it is built from the saved
 * records alone.
 */
import type { Catalog, CatalogGroup, OfflineKind, SavedMeta } from "./types";
import type { SaveInput } from "./store";
import { SECTIONS, sectionOf, worldOf, worldTitle, type Section, type SectionId } from "./sections";

export type Entry = {
  /** path, the key */
  url: string;
  title: string;
  kind: OfflineKind;
  tag: string;
  section: SectionId;
  group: string;
  groupTitle: string;
  groupOrder: number;
  order: number;
  /** what saving it would store (null: not in the catalog, e.g. offline) */
  item: SaveInput | null;
  meta: SavedMeta | null;
  update: boolean;
  /** stored size, else the estimate */
  bytes: number;
  /** lectures: poster image URL and running time */
  poster?: string;
  minutes?: number;
};

export type SubGroup = { id: string; title: string; order: number; entries: Entry[] };

export type SectionModel = {
  section: Section;
  entries: Entry[];
  groups: SubGroup[];
  saved: number;
  total: number;
  savedBytes: number;
  /** catalog items not saved yet */
  missing: SaveInput[];
  /** saved entries with a newer version online */
  stale: Entry[];
};

const norm = (p: string) => {
  try {
    return encodeURI(decodeURI(p.replace(/\/+$/, "") || "/"));
  } catch {
    return p;
  }
};

function subgroup(section: SectionId, url: string, g: (CatalogGroup & { index: number }) | null, meta: SavedMeta | null, catalog: Catalog | null): { id: string; title: string; order: number } {
  const order = g ? g.index : 999;
  const world = g?.kind === "world" ? g.id : worldOf(url) || (meta && /^week-\d+/.test(meta.group) ? meta.group : null);
  switch (section) {
    case "course":
      if (world) return { id: world, title: g?.kind === "world" ? g.title : worldTitle(world, catalog), order };
      return { id: "course-map", title: "Course map & plan", order: -1 };
    case "revision":
    case "labs":
      if (world) return { id: world, title: g?.kind === "world" ? g.title : meta?.groupTitle && meta.group === world ? meta.groupTitle : worldTitle(world, catalog), order };
      return { id: `${section}-index`, title: section === "labs" ? "All labs" : "Index", order: -1 };
    case "lectures": {
      if (g) return { id: g.id, title: g.title, order };
      const id = meta?.group || "lectures";
      const title = meta?.groupTitle && meta.groupTitle !== "Video lectures" ? meta.groupTitle : "Lectures";
      const cg = catalog?.groups.findIndex((x) => x.id === id) ?? -1;
      return { id, title, order: cg >= 0 ? cg : playlistOrder(title) };
    }
    case "war":
      return /\/war-room\//.test(url) ? { id: "war-rooms", title: "War rooms", order: 1 } : { id: "stories", title: "Stories", order: 0 };
    default:
      return { id: section, title: "", order: 0 };
  }
}

/** Playlist order of a lecture section with no catalog at hand (offline): weeks, then the tracks. */
const TRACKS = ["Mock interviews", "Side quests", "Interview problems", "Low-level design", "Case files"];
function playlistOrder(title: string): number {
  const w = /^W(\d+)/.exec(title);
  if (w) return 500 + Number(w[1]);
  const t = TRACKS.indexOf(title);
  return t >= 0 ? 600 + t : 999;
}

function posterOf(item: SaveInput | null, meta: SavedMeta | null): string | undefined {
  const saved = meta?.files?.find((f) => /\/poster\.[a-z]+(?:\?|$)/.test(f.url))?.url;
  if (saved) return saved;
  if (item?.mediaBase) return `${item.mediaBase.replace(/\/?$/, "/")}poster.jpg`;
  return undefined;
}

export function buildLibrary(catalog: Catalog | null, saved: Map<string, SavedMeta>, updates: Set<string>): Map<SectionId, SectionModel> {
  const byUrl = new Map<string, Entry>();
  catalog?.groups.forEach((g, gi) => {
    g.items.forEach((it, i) => {
      const url = norm(it.url);
      if (byUrl.has(url)) return;
      const meta = saved.get(url) ?? null;
      const section = sectionOf(it);
      const sg = subgroup(section, url, { ...g, index: gi }, meta, catalog);
      const item: SaveInput = { ...it, groupTitle: g.title };
      byUrl.set(url, {
        url,
        title: it.title,
        kind: it.kind,
        tag: it.tag,
        section,
        group: sg.id,
        groupTitle: sg.title,
        groupOrder: sg.order,
        order: i,
        item,
        meta,
        update: !!meta && updates.has(url),
        bytes: meta?.size ?? it.bytes,
        poster: posterOf(item, meta),
        minutes: it.minutes,
      });
    });
  });
  for (const m of saved.values()) {
    if (byUrl.has(m.url)) continue;
    const section = sectionOf(m);
    const sg = subgroup(section, m.url, null, m, catalog);
    byUrl.set(m.url, {
      url: m.url,
      title: m.title,
      kind: m.kind,
      tag: m.tag,
      section,
      group: sg.id,
      groupTitle: sg.title,
      groupOrder: sg.order,
      order: 999,
      item: null,
      meta: m,
      update: updates.has(m.url),
      bytes: m.size,
      poster: posterOf(null, m),
      minutes: m.minutes,
    });
  }

  const out = new Map<SectionId, SectionModel>();
  for (const s of SECTIONS) out.set(s.id, { section: s, entries: [], groups: [], saved: 0, total: 0, savedBytes: 0, missing: [], stale: [] });
  for (const e of byUrl.values()) {
    const sm = out.get(e.section)!;
    sm.entries.push(e);
    sm.total++;
    if (e.meta) {
      sm.saved++;
      sm.savedBytes += e.meta.size || 0;
      if (e.update) sm.stale.push(e);
    } else if (e.item) sm.missing.push(e.item);
  }
  for (const sm of out.values()) {
    const by = new Map<string, SubGroup>();
    sm.entries.sort((a, b) => a.groupOrder - b.groupOrder || a.order - b.order || a.tag.localeCompare(b.tag) || a.title.localeCompare(b.title));
    for (const e of sm.entries) {
      const g = by.get(e.group) ?? { id: e.group, title: e.groupTitle, order: e.groupOrder, entries: [] };
      g.entries.push(e);
      by.set(e.group, g);
    }
    sm.groups = [...by.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  }
  return out;
}

/** Stored bytes split for the storage card: lecture media (shared files once) vs everything else. */
export function storageSplit(saved: Iterable<SavedMeta>): { videos: number; articles: number } {
  const files = new Map<string, number>();
  let videos = 0;
  let articles = 0;
  for (const m of saved) {
    if (m.kind === "lecture") {
      const media = (m.files ?? []).reduce((a, f) => a + f.bytes, 0);
      videos += Math.max(0, (m.size || 0) - media);
      for (const f of m.files ?? []) files.set(f.key, f.bytes);
    } else articles += m.size || 0;
  }
  for (const b of files.values()) videos += b;
  return { videos, articles };
}
