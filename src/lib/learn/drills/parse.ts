/**
 * Follow-up drills for a side quest (resources/quest-drills/<quest slug>.md, spec in that folder's
 * README): the interviewer's push-backs after you present the design, each with a strong answer, the
 * points it must hit and a common weak answer. Pure: shared by the page loader and scripts/check-drills.mjs's
 * rules (kept in step by hand).
 */

export const DRILLS_DIR = "resources/quest-drills";
export const DRILL_KINDS = ["failure", "scale", "trade-off", "alternative", "consistency", "security", "cost"] as const;
export type DrillKind = (typeof DRILL_KINDS)[number];
/** a file never shows more than this many (the spec asks for 8–12) */
export const MAX_DRILLS = 12;

export type DrillItem = {
  /** stable per question text: keys the learner's local answer and "practised" mark */
  id: string;
  /** the follow-up, as the interviewer asks it */
  q: string;
  kind: DrillKind | null;
  /** the weak spot it probes */
  pushesOn: string;
  /** the strong answer, one paragraph per source line (inline **bold** and `code` only) */
  strong: string[];
  /** 2–3 points the answer has to hit */
  must: string[];
  /** a common weak answer, and why it falls short */
  weak: string;
  /** the quest heading it builds on, as written */
  section: string | null;
  /** that heading's id on the quest page (set by the loader), or null when it can't be found */
  sectionId?: string | null;
};

export type QuestDrills = { quest: string; items: DrillItem[] };

/** FNV-1a, base 36: short, stable, no crypto (runs on the client too). */
export function drillId(q: string): string {
  let h = 0x811c9dc5;
  const s = q.trim().toLowerCase().replace(/\s+/g, " ");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const FIELD = /^\*\*(Kind|Pushes on|Strong answer|Must mention|Weak answer|Section):\*\*[ \t]*(.*)$/i;
type FieldName = "kind" | "pushes on" | "strong answer" | "must mention" | "weak answer" | "section";

const oneLine = (lines: string[]) => lines.join(" ").replace(/\s+/g, " ").trim();
// each line of the strong answer is its own short paragraph
const paragraphs = (lines: string[]) => lines.map((l) => l.trim()).filter(Boolean);
const bullets = (lines: string[]) =>
  lines
    .join("\n")
    .split(/\n(?=\s*[-*]\s)/)
    .map((b) => b.replace(/^\s*[-*]\s+/, "").replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);

function parseItem(block: string): DrillItem | null {
  const [head, ...rest] = block.split("\n");
  const q = head.replace(/\s+#+\s*$/, "").trim();
  const fields = new Map<FieldName, string[]>();
  let cur: FieldName | null = null;
  for (const line of rest) {
    const m = line.match(FIELD);
    if (m) {
      cur = m[1].toLowerCase() as FieldName;
      fields.set(cur, m[2] ? [m[2]] : []);
    } else if (cur) fields.get(cur)!.push(line);
  }
  const get = (f: FieldName) => fields.get(f) ?? [];
  const kindRaw = oneLine(get("kind")).toLowerCase();
  const kind = (DRILL_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as DrillKind) : null;
  const strong = paragraphs(get("strong answer"));
  const must = bullets(get("must mention"));
  const section = oneLine(get("section")).replace(/^\[(.*)\]$/, "$1").trim() || null;
  const item: DrillItem = { id: drillId(q), q, kind, pushesOn: oneLine(get("pushes on")), strong, must, weak: oneLine(get("weak answer")), section };
  // an item missing its question, strong answer or must-mention points was cut off: it isn't shown
  return item.q && strong.length && must.length ? item : null;
}

export function parseDrills(raw: string, quest: string): QuestDrills | null {
  const body = raw.replace(/^﻿/, "").replace(/^---\n[\s\S]*?\n---\n/, "");
  const seen = new Set<string>();
  const items = body
    .split(/^##[ \t]+/m)
    .slice(1)
    .map((b) => parseItem(b.trim()))
    .filter((x): x is DrillItem => !!x && !seen.has(x.id) && !!seen.add(x.id))
    .slice(0, MAX_DRILLS);
  return items.length ? { quest, items } : null;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Points each item's `section` at a heading id on the quest page (exact text first, then a prefix match). */
export function linkSections(drills: QuestDrills, toc: { id: string; text: string }[]): QuestDrills {
  const heads = toc.map((t) => ({ id: t.id, n: norm(t.text) })).filter((t) => t.n);
  const find = (section: string | null): string | null => {
    if (!section) return null;
    const s = norm(section);
    if (!s) return null;
    return heads.find((h) => h.n === s)?.id ?? heads.find((h) => h.n.startsWith(s) || (h.n.length >= 8 && s.startsWith(h.n)))?.id ?? null;
  };
  return { ...drills, items: drills.items.map((it) => ({ ...it, sectionId: find(it.section) })) };
}
