/**
 * The smart-search AI request and the checks on its answer. Pure: the route and the eval build and
 * validate exactly the same way.
 *
 * Guarantees enforced here (and tested in scripts/smart-search-check.ts):
 * - the model only ever sees short ids (c1..cN) for real index entries, and only those come back: an id
 *   that isn't a candidate is dropped, and every link, title and time shown is the index's, never the model's;
 * - a path keeps at most PER_FAMILY steps from one lesson or quest (its sections, lecture, moments, sheet);
 * - its free text (intent, note, why) is plain: no URLs, markdown or HTML survive, and each is length-capped;
 * - nothing about the learner is in the request: the query and the candidates only.
 */
import { atClock, type Ranked } from "./engine";
import { KIND_LABEL, type Hit, type PathStep, type SmartAnswer } from "./types";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s);

/** At most this many steps from one family (a lesson or quest with its sections, lecture, moments, sheet, FAQs). */
export const PER_FAMILY = 3;

/**
 * One candidate per line, compact: id | kind | title | where | summary | family. `family` (from
 * SmartEngine.family) groups a lesson with its sections, lecture, moments and sheet, so the model can
 * spread the path, and parseSmartAnswer can hold it to PER_FAMILY.
 */
export function candidateLines(c: Ranked[], family: (d: Ranked["doc"]) => string = (d) => d.id): { text: string; ids: Map<string, Ranked>; fam: Map<string, string> } {
  const ids = new Map<string, Ranked>();
  const fam = new Map<string, string>();
  const short = new Map<string, string>();
  const lines = c.map((r, i) => {
    const id = `c${i + 1}`;
    ids.set(id, r);
    const f = family(r.doc);
    fam.set(r.doc.id, f);
    if (!short.has(f)) short.set(f, `f${short.size + 1}`);
    const d = r.doc;
    const kind = d.kind === "moment" && d.at >= 0 ? `lecture moment at ${atClock(d.at)}` : KIND_LABEL[d.kind].tag.toLowerCase();
    const clean = (s: string) => s.replace(/[|\n\r]+/g, " ").replace(/\s+/g, " ").trim();
    return `${id} | ${kind} | ${clip(clean(d.title), 110)} | ${clip(clean(d.sub), 80)} | ${clip(clean(d.summary || d.text), 190)} | ${short.get(f)}`;
  });
  return { text: lines.join("\n"), ids, fam };
}

/** The user message: the query (as data) and the candidates. */
export function smartSearchUser(query: string, lines: string): string {
  return `<query>\n${query.replace(/<\/?query>/gi, "").slice(0, 300)}\n</query>\n\n<candidates>\n${lines}\n</candidates>`;
}

/** Free text from the model as plain text: no links, markup or control characters, capped. */
export function plain(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  const t = s
    .replace(/<[^>]*>/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clip(t, max);
}

const toHit = (r: Ranked): Hit => ({ id: r.doc.id, kind: r.doc.kind, title: r.doc.title, sub: r.doc.sub, href: r.doc.href, summary: r.doc.summary, at: r.doc.at, score: 0 });

/** The first {...} in the text (tolerates a code fence or a stray word around it). */
function firstJson(text: string): unknown {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(text.slice(s, e + 1));
  } catch {
    return null;
  }
}

export type ParseResult = { ok: true; answer: Omit<SmartAnswer, "cached" | "creditsLeft">; dropped: string[] } | { ok: false; reason: string };

/**
 * Validates the model's JSON against the candidates. Unknown ids are dropped; at most 7 steps (4 for a
 * partial match) and `perFamily` from one lesson family (PER_FAMILY, or 2 for an interview or a beginner's ask).
 */
export function parseSmartAnswer(text: string, ids: Map<string, Ranked>, fam?: Map<string, string>, perFamily = PER_FAMILY): ParseResult {
  const j = firstJson(text) as { intent?: unknown; scope?: unknown; note?: unknown; path?: unknown; quick?: unknown } | null;
  if (!j || typeof j !== "object") return { ok: false, reason: "not JSON" };
  const scope = j.scope === "partial" || j.scope === "off_topic" ? j.scope : "covered";
  const dropped: string[] = [];
  const seen = new Set<string>();
  const step = (x: unknown): PathStep | null => {
    if (!x || typeof x !== "object") return null;
    const id = String((x as { id?: unknown }).id ?? "").trim();
    const r = ids.get(id);
    if (!r) {
      if (id) dropped.push(id);
      return null;
    }
    return { ...toHit(r), why: plain((x as { why?: unknown }).why, 200) };
  };
  const path: PathStep[] = [];
  const used = new Map<string, number>();
  // a topic the course doesn't teach: a short path of the nearest material, not a full course
  const max = scope === "partial" ? 4 : 7;
  if (scope !== "off_topic" && Array.isArray(j.path)) {
    for (const x of j.path) {
      const s = step(x);
      if (!s || seen.has(s.id)) continue;
      const f = fam?.get(s.id) ?? s.id;
      if ((used.get(f) ?? 0) >= perFamily) continue;
      used.set(f, (used.get(f) ?? 0) + 1);
      seen.add(s.id);
      path.push(s);
      if (path.length >= max) break;
    }
  }
  const quick = scope !== "off_topic" && path.length ? step(j.quick) : null;
  return {
    ok: true,
    answer: { intent: plain(j.intent, 160), scope, note: plain(j.note, 280), path, quick },
    dropped,
  };
}
