/**
 * The offline library's types of things ("sections"): every saved page and every catalog item lands
 * in exactly one, by its kind and, for copies saved before the catalog knew their kind (problems,
 * LLD, war stories were saved as plain "lesson" / group "saved"), by its URL. Plain functions, used
 * by the library, the save buttons and the saved-record migration in store.ts.
 */
import type { Catalog, OfflineKind } from "./types";

export type SectionId = "course" | "lectures" | "sidequests" | "problems" | "lld" | "mocks" | "cases" | "war" | "revision" | "labs" | "tools";

export type Section = {
  id: SectionId;
  title: string;
  /** one line under the title */
  blurb: string;
  /** "lesson" / "lectures" … for counts */
  unit: [string, string];
};

export const SECTIONS: Section[] = [
  { id: "course", title: "The course", blurb: "Worlds 0–10: previews, lessons, bosses and trials, with the course map and the plan.", unit: ["page", "pages"] },
  { id: "lectures", title: "Video lectures", blurb: "Animated, narrated lectures with their audio, music, captions and checkpoints. ~10–20 MB each.", unit: ["lecture", "lectures"] },
  { id: "sidequests", title: "Side quests", blurb: "Real systems designed end to end: UPI, WhatsApp, Netflix, Uber and more.", unit: ["quest", "quests"] },
  { id: "problems", title: "Interview problems", blurb: "The problem bank: classic interview designs, worked through.", unit: ["problem", "problems"] },
  { id: "lld", title: "Low-level design", blurb: "Machine-coding and object design problems.", unit: ["problem", "problems"] },
  { id: "mocks", title: "Mock interviews", blurb: "Full mock interviews with a rubric, practised without a connection.", unit: ["mock", "mocks"] },
  { id: "cases", title: "Case files", blurb: "Long reads on real incidents and launches, with their images.", unit: ["case file", "case files"] },
  { id: "war", title: "War stories", blurb: "Two-minute true stories and war-room incident simulations.", unit: ["story", "stories"] },
  { id: "revision", title: "Revision & cheat sheets", blurb: "Interview-night decks and one-page cheat sheets, per world.", unit: ["deck", "decks"] },
  { id: "labs", title: "Code labs", blurb: "Runnable Python labs. The first one also stores the Python runtime (~13.5 MB, once).", unit: ["lab", "labs"] },
  { id: "tools", title: "Tools", blurb: "Planner, numbers playground, concept map, reading trail and the prep hubs.", unit: ["tool", "tools"] },
];

export const SECTION_BY_ID = new Map(SECTIONS.map((s) => [s.id, s]));

const segs = (url: string): string[] => {
  let path = url;
  try {
    path = new URL(url, "https://x.invalid").pathname;
  } catch {
    // already a path
  }
  return path.split("/").filter(Boolean);
};

/** The kind a URL implies (null: nothing specific, keep what the record says). */
export function kindFromUrl(url: string): OfflineKind | null {
  const s = segs(url);
  if (s[0] === "stories" && s[1]) return "story";
  if (s[0] !== "learn") return null;
  if (s[1] === "lectures" && s[2]) return "lecture";
  if (s[1] === "war-stories") return "warstory";
  if (s[1] === "mock") return s[2] ? "mock" : "tool";
  if (s[1] === "labs") return "lab";
  if (s[1] === "revise") return s[2] ? "revision" : "tool";
  if (s[1] === "cheatsheet" && s[2]) return "cheatsheet";
  if (s.length === 2 && ["plan", "numbers", "prep", "reading", "mastery", "practice"].includes(s[1])) return "tool";
  if (s.length >= 4) {
    if (s[2] === "problem-bank") return "problem";
    if (s[2] === "low-level-design") return "lld";
    if (s[2] === "bonus-problems") return "sidequest";
    if (s[2] === "overview") return "plan";
    if (/-preview$/.test(s[3])) return "preview";
  }
  if (s.length === 2) return "hub";
  return null;
}

/** Which library section a page belongs to. */
export function sectionOf(x: { kind: OfflineKind | string; url: string }): SectionId {
  const k = kindFromUrl(x.url) ?? x.kind;
  switch (k) {
    case "lecture":
      return "lectures";
    case "sidequest":
      return "sidequests";
    case "problem":
      return "problems";
    case "lld":
      return "lld";
    case "mock":
      return "mocks";
    case "story":
      return "cases";
    case "warstory":
      return "war";
    case "revision":
    case "cheatsheet":
      return "revision";
    case "lab":
      return "labs";
    case "tool":
      return "tools";
    default:
      return "course";
  }
}

/** "week-04-caching" from a course, revision, cheat-sheet or lab URL (null: not in a world). */
export function worldOf(url: string): string | null {
  const s = segs(url);
  if (s[0] !== "learn") return null;
  if ((s[1] === "revise" || s[1] === "cheatsheet") && s[2]) return s[2];
  if (s.length >= 4 && /^week-\d+/.test(s[2])) return s[2];
  return null;
}

/** "World 04 · Caching" for a world key, from the catalog when known. */
export function worldTitle(key: string, catalog: Catalog | null): string {
  const g = catalog?.groups.find((x) => x.id === key);
  if (g) return g.title;
  const m = /^week-(\d+)-?(.*)$/.exec(key);
  if (!m) return key;
  const name = m[2].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `World ${m[1].padStart(2, "0")}${name ? ` · ${name}` : ""}`;
}

/** Group titles the library shows for records saved before their group existed. */
export function defaultGroupOf(kind: OfflineKind | string, url: string): { group: string; groupTitle: string } {
  const sec = sectionOf({ kind, url });
  const world = worldOf(url);
  if ((sec === "course" || sec === "labs") && world && kind !== "revision" && kind !== "cheatsheet") return { group: world, groupTitle: worldTitle(world, null) };
  if (sec === "revision" && world) return { group: world, groupTitle: worldTitle(world, null) };
  switch (sec) {
    case "sidequests":
      return { group: "side-quests", groupTitle: "Side quests" };
    case "problems":
      return { group: "problems", groupTitle: "Interview problems" };
    case "lld":
      return { group: "lld", groupTitle: "Low-level design" };
    case "mocks":
      return { group: "mocks", groupTitle: "Mock interviews" };
    case "cases":
      return { group: "case-files", groupTitle: "Case files" };
    case "war":
      return { group: "war-stories", groupTitle: "War stories" };
    case "lectures":
      return { group: "lectures", groupTitle: "Video lectures" };
    default:
      return { group: "course", groupTitle: "Course map" };
  }
}

/** Short type label for a row ("LESSON", "BOSS", "LECTURE"…). */
export function kindLabel(kind: OfflineKind | string): string {
  switch (kind) {
    case "hub":
      return "Course map";
    case "plan":
      return "Plan";
    case "preview":
      return "Preview";
    case "capstone":
      return "Boss";
    case "sidequest":
      return "Side quest";
    case "problem":
      return "Problem";
    case "lld":
      return "LLD";
    case "trial":
      return "Trial";
    case "mock":
      return "Mock";
    case "story":
      return "Case file";
    case "warstory":
      return "War story";
    case "lecture":
      return "Lecture";
    case "revision":
      return "Deck";
    case "cheatsheet":
      return "Cheat sheet";
    case "lab":
      return "Code lab";
    case "tool":
      return "Tool";
    default:
      return "Lesson";
  }
}
