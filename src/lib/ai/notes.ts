/**
 * Notebook pages and AI (convert, check, cards): the pure half. Shared by the routes (src/app/api/learn/ai/notes/*),
 * the UI (components/learn/ink/PageAiActions) and the test scripts (scripts/ai-notes-*.ts). No I/O.
 *
 *   pageItemsText   the typed text on a page (clips and text boxes) as the model sees it, capped
 *   cleanNotesMd    the model's Markdown made safe and tidy: no fences around the whole answer, no preamble, no plan
 *                   line, no course block syntax, bullets normalised, blank runs collapsed, length capped
 *   parseCheck      the check's JSON → items, each tied to a real section of the lesson (an invented section is dropped)
 *   parseCards      the cards' JSON → 3-8 clean question/answer pairs
 */
import type { NotebookPage } from "@/lib/learn/ink/types";

/** most Markdown a page's typed version keeps (a full page of small handwriting is about 3,000 characters) */
export const NOTES_MD_MAX = 12_000;
/** the typed items sent with the page image */
export const ITEMS_TEXT_MAX = 6000;
/** what the model answers for a page with nothing on it */
export const EMPTY_PAGE = "EMPTY_PAGE";

export type ItemText = { kind: "clip" | "text"; text: string; source?: string };

/** Clips and text boxes in page order (top to bottom), for the request body. */
export function pageItems(page: Pick<NotebookPage, "items">): ItemText[] {
  return [...page.items]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .flatMap((it): ItemText[] => (it.kind === "clip" ? [{ kind: "clip", text: it.text, source: it.source?.title }] : it.kind === "text" ? [{ kind: "text", text: it.text }] : []))
    .filter((x) => x.text.trim());
}

/** The typed items as one block for the model, within ITEMS_TEXT_MAX. */
export function pageItemsText(items: ItemText[]): string {
  let out = "";
  for (const it of items.slice(0, 30)) {
    const text = String(it.text || "").replace(/\s+\n/g, "\n").trim().slice(0, 2000);
    if (!text) continue;
    const head = it.kind === "clip" ? `<clip${it.source ? ` from="${String(it.source).replace(/["<>]/g, "").slice(0, 120)}"` : ""}>` : "<text_box>";
    const block = `${head}\n${text}\n${it.kind === "clip" ? "</clip>" : "</text_box>"}\n`;
    if (out.length + block.length > ITEMS_TEXT_MAX) break;
    out += block;
  }
  return out.trim();
}

/** The model's Markdown, tidied: see the file comment. Returns "" for an empty page. */
export function cleanNotesMd(raw: string): string {
  let t = String(raw || "").replace(/\r\n?/g, "\n");
  // a private plan line, if a prompt ever asks for one
  t = t.replace(/^\s*<plan>[\s\S]*?<\/plan>\s*/i, "");
  t = t.trim();
  if (t === EMPTY_PAGE || /^EMPTY_PAGE\b/.test(t)) return "";
  // the whole answer wrapped in a fence
  const fence = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i);
  if (fence) t = fence[1];
  // a chatty first line ("Here is the transcription:") before the notes
  t = t.replace(/^(?:here(?:'s| is| are)\b[^\n]{0,80}|sure[^\n]{0,60}|transcri(?:bed|ption)[^\n]{0,60}):\s*\n+/i, "");
  // a closing remark after the notes ("Let me know if…")
  t = t.replace(/\n+(?:let me know|i hope|feel free)[^\n]*$/i, "");
  // ~~struck~~ text is crossed out on the page: it never belongs in the notes (the prompt says so; this makes sure)
  t = t.replace(/~~[^~\n]*~~/g, "").replace(/[ \t]{2,}(?=\S)/g, (m, i, all) => (all.lastIndexOf("\n", i) === i - 1 ? m : " "));
  const lines = t.split("\n").map((l) =>
    l
      // trailing spaces, tabs as two spaces
      .replace(/\s+$/, "")
      .replace(/\t/g, "  ")
      // the course's own block syntax never belongs in a learner's notes
      .replace(/^\s*:{2,}.*$/, "")
      // "•", "◦", "▪" bullets → "-" (not dashes: "— from <source>" under a clip is not a bullet)
      .replace(/^(\s*)[•◦▪●·]\s+/, "$1- ")
      // "*" and "+" bullets → "-" (not bold: "**x**" keeps its asterisks)
      .replace(/^(\s*)[*+]\s+/, "$1- "),
  );
  t = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length > NOTES_MD_MAX) {
    const cut = t.slice(0, NOTES_MD_MAX);
    t = `${cut.slice(0, Math.max(cut.lastIndexOf("\n"), NOTES_MD_MAX * 0.8))}\n\n[?] (the rest of the page was too long to type)`;
  }
  return t;
}

/** The first JSON object in a model answer (it may wrap it in a fence or a sentence). */
export function firstJson<T>(raw: string): T | null {
  const t = String(raw || "").replace(/^\s*<plan>[\s\S]*?<\/plan>\s*/i, "");
  const start = t.indexOf("{");
  if (start < 0) return null;
  // walk to the matching brace (strings may hold braces)
  let depth = 0;
  let inStr = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(t.slice(start, i + 1)) as T;
      } catch {
        return null;
      }
    }
  }
  return null;
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

// ------------------------------------------------------------------ check

export type CheckItem = { kind: "right" | "wrong" | "missing" | "outside"; note: string; lesson: string; section: string | null; quote?: string };
export type CheckResult = { summary: string; items: CheckItem[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Match a section the model named to a real heading of the lesson (exact, then contains); null if none. */
export function matchSection(name: string, headings: string[]): string | null {
  const n = norm(name.replace(/^\[|\]$/g, ""));
  if (!n) return null;
  const exact = headings.find((h) => norm(h) === n);
  if (exact) return exact;
  const part = headings.find((h) => {
    const hn = norm(h);
    return hn.length > 3 && (hn.includes(n) || n.includes(hn));
  });
  return part ?? null;
}

const quoteWords = (s: string) => norm(s).split(" ").filter((w) => w.length > 2);

/** Is `quote` the lesson's own words in `text`? (exact after normalising, or 85% of its words, for a quote with a slip) */
export function quoteIn(quote: string, text: string): boolean {
  const q = norm(quote);
  if (q.length < 8) return false;
  const t = norm(text);
  if (t.includes(q)) return true;
  const qw = quoteWords(quote);
  const tw = new Set(quoteWords(text));
  return qw.length >= 4 && qw.filter((w) => tw.has(w)).length / qw.length >= 0.85;
}

/**
 * The check's answer → items. Grounding is enforced here too: a "right", "wrong" or "missing" item must name a section
 * the model was shown; one that doesn't is kept only as "outside" (the lesson doesn't cover it), never as wrong. A
 * "wrong" item must also quote the lesson's own words from that section (`texts`, when given): without a quote that is
 * really there, or with "the lesson doesn't say…" as its reason, the lesson doesn't settle the claim: not in this lesson.
 */
export function parseCheck(raw: string, headings: string[], texts?: Record<string, string>): CheckResult | null {
  type J = { summary?: unknown; right?: unknown; wrong?: unknown; missing?: unknown; outside?: unknown };
  const j = firstJson<J>(raw);
  if (!j) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 12) : []) as Record<string, unknown>[];
  const items: CheckItem[] = [];
  const add = (kind: CheckItem["kind"], o: Record<string, unknown>) => {
    const note = clip(o.note ?? o.point ?? o.claim, 400);
    const lesson = clip(o.lesson ?? o.fix ?? o.says, 500);
    if (!note && !lesson) return;
    if (kind === "outside") return items.push({ kind, note: note || lesson, lesson: "", section: null });
    const section = matchSection(clip(o.section, 160), headings);
    // a claim tied to no real section isn't grounded: it can't be called right or wrong from this lesson
    if (!section && kind !== "missing") return items.push({ kind: "outside", note: note || lesson, lesson: "", section: null });
    if (!section) return; // "missing" with no section: not grounded, drop it
    if (kind === "wrong") {
      const quote = clip(o.quote, 300).replace(/^["“']|["”']$/g, "");
      const unsettled = !lesson || /\b(?:does not|doesn't|do not|don't|is not|isn't|never)\b[^.]{0,30}\b(?:describe|cover|mention|discuss|include|define|say|state|promise|claim|specify|give)|\bnot (?:in|covered|mentioned|described|stated|one of|part of|among)\b|\bnever (?:covers|mentions|describes|discusses)\b/i.test(lesson);
      const quoted = !texts || (!!quote && quoteIn(quote, texts[section] ?? Object.values(texts).join("\n")));
      if (unsettled || !quoted) return items.push({ kind: "outside", note, lesson: "", section: null });
      // a "wrong" whose own reason says the note matches is not wrong (a small model sometimes argues itself round)
      if (/\b(?:this|it|that|which) (?:matches|agrees)\b|\bno error\b|\b(?:is|are) (?:correct|right)\b|\bsame (?:amount|value|thing)\b/i.test(lesson)) return items.push({ kind: "right", note, lesson: "", section });
      if (/\bnot (?:contradicted|wrong|an error)\b|\bnarrower\b|\bless precise\b|\bsimplif/i.test(lesson)) return items.push({ kind: "outside", note, lesson: "", section: null });
      return items.push({ kind, note, lesson, section, ...(quote ? { quote } : {}) });
    }
    items.push({ kind, note, lesson, section });
  };
  list(j.right).forEach((o) => add("right", o));
  list(j.wrong).forEach((o) => add("wrong", o));
  list(j.missing).forEach((o) => add("missing", o));
  list(j.outside).forEach((o) => add("outside", typeof o === "string" ? { note: o } : o));
  return { summary: clip(j.summary, 400), items };
}

// ------------------------------------------------------------------ cards

export type NoteCard = { q: string; a: string };
export const CARDS_MIN = 3;
export const CARDS_MAX = 8;

/** The cards' answer → at most 8 distinct cards (none if the model found too little to ask about). */
export function parseCards(raw: string): NoteCard[] {
  const j = firstJson<{ cards?: unknown }>(raw);
  const arr = Array.isArray(j?.cards) ? (j!.cards as Record<string, unknown>[]) : [];
  const seen = new Set<string>();
  const out: NoteCard[] = [];
  for (const c of arr) {
    const q = clip(c?.q ?? c?.question ?? c?.front, 300);
    const a = clip(c?.a ?? c?.answer ?? c?.back, 600);
    if (q.length < 8 || !a) continue;
    const k = norm(q);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ q: /[?:.]$/.test(q) ? q : `${q}?`, a });
    if (out.length >= CARDS_MAX) break;
  }
  return out;
}

/** A short stable id for a card (its question), for the review queue's sourceRef. */
export function cardRef(pageId: string, q: string): string {
  let h = 2166136261;
  const s = norm(q);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `ink:${pageId}:${(h >>> 0).toString(36)}`;
}

/** The course notes and cards are filed under (lib/learn/course COURSE_ID; that module is server-only). */
export const NOTES_COURSE_ID = "system-design-mastery";

/** Rough credits each action costs on Haiku 5.5 (measured: every call well under $0.001, so 1 credit). */
export const NOTES_CREDITS = { convert: 1, check: 1, cards: 1 } as const;
