import type { CourseMap } from "./types";

/**
 * Notebook vocabulary shared by the notebook, note editor and review cards.
 * content_notes.color keeps its stored values; this maps them to the Learn colour key
 * (no purple in the design system: legacy purple shows as "Marked").
 */
export type NoteColor = "yellow" | "green" | "blue" | "red" | "purple";
export type NoteType = "general" | "question" | "important" | "todo";

export const HIGHLIGHT_COLOURS: Record<NoteColor, { label: string; desc: string; swatch: string; tint: string }> = {
  yellow: { label: "Key idea", desc: "The sentence the lesson hangs on", swatch: "#FF6B2B", tint: "rgba(255,107,43,0.22)" },
  blue: { label: "Definition", desc: "Terms to say precisely", swatch: "var(--c-fg)", tint: "color-mix(in srgb, var(--c-fg) 13%, transparent)" },
  red: { label: "Numbers", desc: "Figures and back-of-envelope maths", swatch: "#8E8E95", tint: "rgba(142,142,149,0.24)" },
  green: { label: "Interview line", desc: "Phrasing worth saying out loud", swatch: "#3AB7BF", tint: "rgba(58,183,191,0.2)" },
  purple: { label: "Marked", desc: "Saved before the colour key", swatch: "#A3A3A8", tint: "rgba(163,163,168,0.18)" },
};

export const COLOUR_ORDER: NoteColor[] = ["yellow", "blue", "red", "green", "purple"];

/** Note types as text chips (no emoji). Stored values stay the same. */
export const NOTE_TYPES: { value: NoteType; label: string }[] = [
  { value: "general", label: "insight" },
  { value: "question", label: "question" },
  { value: "important", label: "important" },
  { value: "todo", label: "to-do" },
];

export const noteTypeLabel = (t: string) => NOTE_TYPES.find((n) => n.value === t)?.label || "note";

/**
 * Pick the phrase to blank out of a highlighted sentence for a cloze card.
 * Prefers the definition after "is/are/means", then the clause after a colon, then the tail.
 */
export function pickCloze(text: string): { before: string; blank: string; after: string } {
  const t = text.replace(/\s+/g, " ").trim();
  const def = t.match(/^(.{6,}?\b(?:is|are|means|equals|requires|prevents)\s+)(.{6,90}?)([.;!?]?)$/i) || t.match(/^(.{6,}?\b(?:is|are|means)\s+)(.{6,90}?)([.;,:](?:\s.*)?)$/i);
  if (def) return { before: def[1], blank: def[2], after: def[3] || "" };
  const colon = t.indexOf(": ");
  if (colon > 4 && t.length - colon - 2 >= 6 && t.length - colon - 2 <= 120) {
    const tail = t.slice(colon + 2);
    const end = tail.match(/[.!?]$/) ? tail.length - 1 : tail.length;
    return { before: t.slice(0, colon + 2), blank: tail.slice(0, end), after: tail.slice(end) };
  }
  const words = t.replace(/[.!?]$/, "").split(" ");
  const n = Math.min(Math.max(2, Math.round(words.length / 4)), 6);
  if (words.length <= 3) return { before: "", blank: t.replace(/[.!?]$/, ""), after: t.match(/[.!?]$/)?.[0] || "" };
  return { before: words.slice(0, words.length - n).join(" ") + " ", blank: words.slice(-n).join(" "), after: t.match(/[.!?]$/)?.[0] || "" };
}


export type LessonMeta = { key: string; week: string; slug: string; tag: string; title: string; href: string; order: number; weekCode: string | null };

/** Lookup for notebook / review / profile rows: real titles, tags and links in course order. */
export function indexLessons(map: CourseMap): Map<string, LessonMeta> {
  const out = new Map<string, LessonMeta>();
  let order = 0;
  const add = (week: string, slug: string, tag: string, title: string, href: string, weekCode: string | null) =>
    out.set(`${week}/${slug}`, { key: `${week}/${slug}`, week, slug, tag, title, href, order: order++, weekCode });
  if (map.plan) add(map.plan.week, map.plan.slug, "PLAN", map.plan.title, map.plan.href, null);
  map.weeks.forEach((w) => {
    w.lessons.forEach((l) => add(l.week, l.slug, l.tag, l.kind === "week-preview" ? `${w.title} · Preview` : l.title, l.href, w.code));
    if (w.boss) add(w.boss.week, w.boss.slug, w.boss.tag, w.boss.title, w.boss.href, w.code);
    if (w.trial) add(w.trial.week, w.trial.slug, `W${w.code} · TRIAL`, `Trial · ${w.title}`, w.trial.href, w.code);
  });
  map.sideQuests.forEach((l) => add(l.week, l.slug, l.tag, l.title, l.href, "SQ"));
  return out;
}

/** Fallback meta for a row whose lesson is not in the map (renamed or removed). */
export function fallbackMeta(courseId: string, week: string, slug: string): LessonMeta {
  const n = week.match(/week-(\d+)/)?.[1];
  const code = n ? n.padStart(2, "0") : null;
  return {
    key: `${week}/${slug}`,
    week,
    slug,
    tag: code ? `W${code}` : week.toUpperCase(),
    title: slug.replace(/^(day-\d+-|week-\d+-|foundations-|bonus-\d+-)/, "").replace(/-/g, " "),
    href: `/learn/${courseId}/${week}/${slug}`,
    order: 9999,
    weekCode: code,
  };
}
