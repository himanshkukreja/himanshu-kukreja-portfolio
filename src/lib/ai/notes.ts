/**
 * Notebook pages and AI (convert, check, cards): the pure half. Shared by the routes (src/app/api/learn/ai/notes/*),
 * the UI (components/learn/ink/PageAiActions) and the test scripts (scripts/ai-notes-*.ts). No I/O.
 *
 *   pageItemsText   the typed text on a page (clips and text boxes) as the model sees it, capped
 *   cleanNotesMd    the model's Markdown made safe and tidy: no fences around the whole answer, no preamble, no plan
 *                   line, no course block syntax, bullets normalised, blank runs collapsed, length capped
 *   parseCheck      the check's JSON → items, each tied to a real section of the lesson (an invented section is dropped),
 *                   and no "missing" point the notes already have (notesHave)
 *   parseCards      the cards' JSON → 3-8 clean question/answer pairs
 *   inkSignature    a fingerprint of a page's ink and items, stamped on its typed version (withInkStamp / readTyped)
 *                   so the page can tell when the handwriting changed after it was typed up
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
  const found = walkJson<T>(t);
  if (found !== null) return found;
  // a small model's slips at the end of a list: a stray quote after the last comma ("…",\"}]), trailing commas
  const fixed = t.replace(/,\s*"\s*(?=[}\]])/g, "").replace(/,\s*(?=[}\]])/g, "");
  if (fixed !== t) {
    const j = walkJson<T>(fixed);
    if (j !== null) return j;
  }
  // the last string left unclosed before the final brace ("summary":"…coalescing.}): close it
  const closed = fixed.replace(/([^"\s\]}])\s*}\s*$/, '$1"}');
  return closed === fixed ? null : walkJson<T>(closed);
}

function walkJson<T>(t: string): T | null {
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

export type CheckItem = { kind: "right" | "wrong" | "missing" | "outside"; note: string; lesson: string; section: string | null; quote?: string; term?: string };
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

// words that name the kind of thing, not the thing ("the quorum rule" is about "quorum")
const GENERIC = new Set(
  "the a an and or of to in on for is are be it its this that with as at by from not no vs via per rule rules formula concept idea pattern example examples definition condition math meaning point points key detail details note notes lesson section term terms basic basics overview general consistency guarantee problem technique approach strategy mechanism method model".split(" "),
);
const fold = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
/** The words of a text, lowercased, symbols out, simple plurals folded ("Quorums:" → "quorum"). */
const termWords = (s: string) => norm(s.replace(/[’']/g, "")).split(" ").filter(Boolean).map(fold);
/** Formulas and number ranges, spaces and case out: "W + R > N" → "w+r>n", "10 - 30 s" → "10-30s". */
const tight = (s: string) =>
  s
    .toLowerCase()
    .replace(/[≥⩾]/g, ">=")
    .replace(/[≤⩽]/g, "<=")
    .replace(/[−–]/g, "-")
    .replace(/×/g, "*")
    // spaces around an operator go ("W + R > N" → "w+r>n"); spaces between words stay, so a formula never swallows them
    .replace(/\s*([+*/=<>^≈-])\s*/g, "$1");
function formulas(s: string): string[] {
  const t = tight(s);
  const out = t.match(/[a-z0-9.]+(?:(?:[+*/=<>^≈]+|(?<=\d)-(?=\d))[a-z0-9.]+)+/g) ?? [];
  return out.filter((f) => f.length >= 5 && /[+*/=<>^≈]/.test(f));
}

/**
 * Do the notes already have this point? A "missing" item the notes contain (a small model sometimes lists the
 * quorum rule as missing beside "quorum: W + R > N") is dropped. Yes when: one of its formulas is in the notes
 * (spaces and case aside), or every word of its `term` (the idea's name, generic words like "rule" aside) is in the
 * notes (a notes word may be the start of it: "repl" for "replication"), or, with no term, nearly every word of the
 * point is (a restatement of the notes).
 */
export function notesHave(item: { note: string; term?: string }, notes: string): boolean {
  if (!notes.trim()) return false;
  const compact = tight(notes);
  if (formulas(`${item.term ?? ""} ${item.note}`).some((f) => compact.includes(f))) return true;
  const have = new Set(termWords(notes));
  const inNotes = (w: string) => have.has(w) || [...have].some((h) => h.length >= 4 && w.startsWith(h));
  const term = item.term ? termWords(item.term).filter((w) => !GENERIC.has(w) && (w.length > 1 || /\d/.test(w))) : [];
  if (term.length) {
    if (term.every(inNotes)) return true;
    // the term written as one phrase in the notes ("read-your-writes" for "read your writes")
    if (norm(notes).includes(norm(item.term!))) return true;
    return false;
  }
  const words = termWords(item.note).filter((w) => !GENERIC.has(w) && w.length > 2);
  return words.length >= 3 && words.filter(inNotes).length / words.length >= 0.8;
}

/** The shown section a note comes from: one holding its formula, else nearly all (75%) of its words; null if none. */
function shownSectionFor(note: string, texts: Record<string, string>): string | null {
  const fs = formulas(note);
  const nw = [...new Set(termWords(note).filter((w) => w.length > 2 && !GENERIC.has(w)))];
  let best: string | null = null;
  let top = 0;
  for (const [h, t] of Object.entries(texts)) {
    const tt = tight(t);
    const tw = new Set(termWords(`${h} ${t}`));
    const sc = fs.filter((f) => tt.includes(f)).length * 2 + (nw.length >= 2 ? nw.filter((w) => tw.has(w)).length / nw.length : 0);
    if (sc > top) {
      top = sc;
      best = h;
    }
  }
  return top >= 0.75 ? best : null;
}

/**
 * The check's answer → items. Grounding is enforced here too: a "right", "wrong" or "missing" item must name a section
 * the model was shown; one that doesn't is kept only as "outside" (the lesson doesn't cover it), never as wrong. A
 * "wrong" item must also quote the lesson's own words from that section (`texts`, when given): without a quote that is
 * really there, or with "the lesson doesn't say…" as its reason, the lesson doesn't settle the claim: not in this lesson.
 * With `notes`, a "missing" point the notes already have is dropped (notesHave). A "right" that names a section it
 * wasn't shown (often the chapter above the one it read) stays right when a shown section holds the note's formula or
 * nearly all its words, or (with `outline`, every heading of the lesson) when the heading it names is a real one
 * named for the note's topic ("split brain → fencing token" under "8.2 Fencing: The Solution to Split-Brain"): the
 * lesson does cover it, so "not in this lesson" would be false.
 */
export function parseCheck(raw: string, headings: string[], texts?: Record<string, string>, notes?: string, outline?: string[]): CheckResult | null {
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
    if (!section && kind === "right" && note) {
      // the model judged it right but named a section it wasn't shown (often the chapter above the one it read):
      // a shown section that holds the note's formula or nearly all its words is where it is from
      const shown = texts && shownSectionFor(note, texts);
      if (shown) return items.push({ kind, note, lesson: "", section: shown });
      // or a real section of the lesson named for the note's topic
      const real = outline && matchSection(clip(o.section, 160), outline);
      const topic = real && termWords(real).filter((w) => w.length > 2 && !GENERIC.has(w));
      const said = new Set(termWords(note));
      if (real && topic && topic.some((w) => said.has(w))) return items.push({ kind, note, lesson: "", section: real });
    }
    // a claim tied to no real section isn't grounded: it can't be called right or wrong from this lesson
    if (!section && kind !== "missing") return items.push({ kind: "outside", note: note || lesson, lesson: "", section: null });
    if (!section) return; // "missing" with no section: not grounded, drop it
    if (kind === "missing") {
      const term = clip(o.term ?? o.name, 80);
      if (notes && notesHave({ note: note || lesson, term }, notes)) return;
      return items.push({ kind, note: note || lesson, lesson: "", section, ...(term ? { term } : {}) });
    }
    if (kind === "wrong") {
      // a "wrong" whose own reason says the note matches is right, quote or not (a small model sometimes argues itself
      // round: "the lesson rates locking for moderate traffic, which matches the notes")
      if (/\b(?:this|it|that|which) (?:matches|agrees)\b|\bmatch(?:es)? the notes?\b|\b(?:is|are) consistent with\b|\bconsistent with the (?:notes?|lesson)\b|\bno error\b|\b(?:the notes?|this|it|that|which) (?:is|are) (?:correct|right)\b|\bsame (?:amount|value|thing)\b/i.test(lesson)) return items.push({ kind: "right", note, lesson: "", section });
      const quote = clip(o.quote, 300).replace(/^["“']|["”']$/g, "");
      const unsettled = !lesson || /\b(?:does not|doesn't|do not|don't|is not|isn't|never)\b[^.]{0,30}\b(?:describe|cover|mention|discuss|include|define|say|state|promise|claim|specify|give)|\bnot (?:in|covered|mentioned|described|stated|one of|part of|among)\b|\bnever (?:covers|mentions|describes|discusses)\b/i.test(lesson);
      const quoted = !texts || (!!quote && quoteIn(quote, texts[section] ?? Object.values(texts).join("\n")));
      if (unsettled || !quoted) return items.push({ kind: "outside", note, lesson: "", section: null });
      if (/\bnot (?:contradicted|wrong|an error)\b|\bnarrower\b|\bless precise\b|\bsimplif/i.test(lesson)) return items.push({ kind: "outside", note, lesson: "", section: null });
      return items.push({ kind, note, lesson, section, ...(quote ? { quote } : {}) });
    }
    items.push({ kind, note, lesson, section });
  };
  list(j.right).forEach((o) => add("right", o));
  list(j.wrong).forEach((o) => add("wrong", o));
  list(j.missing).forEach((o) => add("missing", o));
  list(j.outside).forEach((o) => add("outside", typeof o === "string" ? { note: o } : o));
  // one claim, one verdict: a "not in this lesson" that restates a claim already judged right (a small model sometimes
  // lists "locking suits moderate traffic" as right and "locking is best for moderate traffic" as wrong, which the
  // grounding above then turns into outside) is the same claim, and the lesson does cover it
  const rights = items.filter((i) => i.kind === "right").map((i) => new Set(claimWords(i.note)));
  const kept = items.filter((i) => {
    if (i.kind !== "outside") return true;
    const w = claimWords(i.note);
    return !(w.length >= 2 && rights.some((r) => w.filter((x) => r.has(x)).length / w.length >= 0.8));
  });
  return { summary: checkSummary(clip(j.summary, 400), kept), items: kept };
}

/** a claim's content words (generic words and the claim-shape words "best", "use" aside), for matching a restatement */
const claimWords = (s: string) => [...new Set(termWords(s.replace(/\([^)]*\)/g, " ")).filter((w) => w.length > 2 && !GENERIC.has(w) && !CLAIM_FILLER.has(w)))];
const CLAIM_FILLER = new Set("best good better use used using suit suits suited works work only also just very".split(" "));

// a summary that speaks of an error in the notes ("one claim is wrong", "mislabels locking", "only partly supported")
const SUMMARY_FAULT = /\b(?:wrong|incorrect|inaccurate|mistaken|mistakes?|errors?|contradict\w*|conflict\w*|revers\w*|mix\w* up|mislabel\w*|misstat\w*|misread\w*|confus\w*|should (?:be|say|read)|not quite|doesn'?t match|don'?t match|partly|partially|loose(?:ly)?|slip\w*|off by)\b/i;
// "no errors", "nothing wrong": a fault word that says the opposite
const SUMMARY_CLEAN = /\b(?:no|without|nothing|none)\b[^.,;]{0,20}\b(?:wrong|incorrect|errors?|mistakes?|contradict\w*|conflict\w*)/i;
const COUNT_WORDS = /\b(?:a few|several|some|many|two|three|four|five|\d+)\b[^.,;]{0,25}\b(?:wrong|incorrect|errors|mistakes|claims)\b/i;

/**
 * The summary must agree with the items the learner sees under it (the grounding above can move a claim the model
 * called wrong to right or "not in this lesson", and a small model sometimes summarises a claim it then judged right as
 * an error). Kept when it names an error only if one is listed, mentions it when one is, and doesn't say "a few" for one;
 * otherwise rebuilt from the items, so the summary can't contradict the list.
 */
export function checkSummary(summary: string, items: CheckItem[]): string {
  const wrong = items.filter((i) => i.kind === "wrong");
  const faulty = SUMMARY_FAULT.test(summary) && !SUMMARY_CLEAN.test(summary);
  const ok = summary && (wrong.length ? faulty && !(wrong.length === 1 && COUNT_WORDS.test(summary)) : !faulty);
  return ok ? summary : derivedSummary(items);
}

/** One plain sentence from the items: how many match, which one doesn't, how many key points are missing. */
export function derivedSummary(items: CheckItem[]): string {
  const n = (k: CheckItem["kind"]) => items.filter((i) => i.kind === k).length;
  const [right, wrong, missing, outside] = [n("right"), n("wrong"), n("missing"), n("outside")];
  if (!right && !wrong && !missing) return "";
  const pl = (k: number, one: string, many: string) => (k === 1 ? `1 ${one}` : `${k} ${many}`);
  const first = items.find((i) => i.kind === "wrong")?.note ?? "";
  const short = first.length > 70 ? `${first.slice(0, 68).replace(/\s+\S*$/, "")}…` : first;
  let s = "";
  if (right && wrong) s = `${pl(right, "point matches", "points match")} the lesson, but ${wrong === 1 ? `one doesn't: “${short}”` : `${wrong} don't`}.`;
  else if (right) s = `${pl(right, "point matches", "points match")} the lesson${outside ? `; ${outside === 1 ? "1 isn't" : `${outside} aren't`} covered by it` : ""}.`;
  else if (wrong) s = wrong === 1 ? `One claim doesn't match the lesson: “${short}”.` : `${wrong} claims don't match the lesson.`;
  if (missing) s += `${s ? " " : ""}${pl(missing, "key point", "key points")} from the lesson ${missing === 1 ? "is" : "are"} missing.`;
  return s;
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

// ------------------------------------------------------------------ the typed version's ink stamp

/**
 * A fingerprint of what the AI reads on a page: every stroke (its id, length, ends) and every clip, snip and text box
 * (id, text, place). Drawing, erasing, moving or typing changes it; undoing back to the typed state restores it.
 */
export function inkSignature(page: Pick<NotebookPage, "strokes" | "items">): string {
  let h = 2166136261;
  const mix = (s: string | number) => {
    const t = String(s);
    for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
    h = Math.imul(h ^ 124, 16777619);
  };
  for (const st of page.strokes) {
    const p = st.pts;
    mix(st.id);
    mix(p.length);
    mix(`${p[0]},${p[1]},${p[p.length - 3]},${p[p.length - 2]}`);
  }
  for (const it of page.items) {
    mix(it.id);
    mix(`${Math.round(it.x)},${Math.round(it.y)},${Math.round(it.w)}`);
    if (it.kind !== "snip") mix(it.text);
  }
  return `${page.strokes.length.toString(36)}.${page.items.length.toString(36)}.${(h >>> 0).toString(36)}`;
}

/**
 * The typed version keeps the signature of the page it was made from as an HTML comment on its last line (no
 * database column needed): "<!-- ink:v1:<signature>[:edited] -->". It never shows: readTyped takes it off before the
 * text is rendered, copied, edited, saved to notes or sent to the AI.
 */
const STAMP = /\n*<!--\s*ink:v1:([a-z0-9.]+)(:edited)?\s*-->\s*$/;
export function readTyped(md: string | null | undefined): { md: string; sig: string | null; edited: boolean } {
  const t = String(md || "");
  const m = t.match(STAMP);
  return { md: (m ? t.slice(0, m.index) : t).trim(), sig: m ? m[1] : null, edited: !!m?.[2] };
}
export function withInkStamp(md: string, sig: string | null, edited = false): string {
  const t = readTyped(md).md;
  return t && sig ? `${t}\n\n<!-- ink:v1:${sig}${edited ? ":edited" : ""} -->` : t;
}

/** The course notes and cards are filed under (lib/learn/course COURSE_ID; that module is server-only). */
export const NOTES_COURSE_ID = "system-design-mastery";

/** Rough credits each action costs on Haiku 5.5 (measured: every call well under $0.001, so 1 credit). */
export const NOTES_CREDITS = { convert: 1, check: 1, cards: 1 } as const;
