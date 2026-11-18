/**
 * The instant search behind the Practice tab's search box and the DSA ⌘K palette. Pure and import-light: no AI, no network,
 * built to answer in a few milliseconds over the ~630 problems on every keystroke.
 *
 *   - A small index per item: stemmed tokens per field (title, aliases, topics, tags, lesson, domain, slug, summary).
 *   - A query becomes "units" (a word, or a phrase a synonym stands for) and filter words (easy / medium / hard, unsolved /
 *     solved / saved). Each unit is looked up ONCE against the index's vocabulary (exact, prefix, substring, typo), so
 *     scoring an item is map lookups only.
 *   - Ranking: an exact title or alias match first, then a title prefix, then field-weighted word matches; a unit that
 *     matches in the title beats the same unit in a topic, which beats the statement.
 *   - Each hit says why it matched ("topic: Sliding window") and where in the title to highlight.
 */
import { LEVEL_WORDS, STATUS_WORDS, STOPWORDS, SYNONYMS } from "./synonyms";

export type Level = "easy" | "medium" | "hard";
export type StatusWord = "unsolved" | "solved" | "saved";

export type SearchItem = {
  id: string;
  title: string;
  /** other names: the classic twin's name and number ("Two Sum", "LC 1") */
  aliases: string[];
  /** structure, algorithm and pattern labels ("Sliding window", "Hash map / set") */
  topics: string[];
  /** the pattern tags as written ("sliding-window-fixed") */
  tags: string[];
  /** company types and the story domain ("fintech", "payments") */
  domains: string[];
  level: Level;
  /** the lesson this problem belongs to */
  lesson: string;
  /** one line of the statement, and the signals that say when to reach for it (lower-case is fine) */
  summary: string;
  /** the ⌘K palette also lists lessons (Academy, streets, camp tents, sets): their page path ("dsa/sets/co-fintech/warm-up-round"); absent for problems */
  path?: string;
};

export type FieldId = "title" | "alias" | "topic" | "tag" | "lesson" | "domain" | "slug" | "summary";
const WEIGHT: Record<FieldId, number> = { title: 10, alias: 9, topic: 7, tag: 6, lesson: 4, domain: 4, slug: 2, summary: 1.5 };
const FIELD_LABEL: Record<FieldId, string> = { title: "title", alias: "also known as", topic: "topic", tag: "tag", lesson: "lesson", domain: "domain", slug: "name", summary: "in the statement" };

/* ------------------------------------------------------------------ text */

/** lower-case words: letters and digits, everything else separates. "3Sum" stays one word, "lc-1" becomes "lc" and "1". */
export function words(s: string): string[] {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").split(/[^a-z0-9]+/).filter(Boolean);
}

/** The light stem both sides use: a plural "s" drops ("pointers" to "pointer"), "ies" to "y". Short words stay. */
export function stem(w: string): string {
  if (w.length <= 3 || /^\d/.test(w)) return w;
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith("sses")) return w.slice(0, -2);
  if (w.endsWith("ss") || w.endsWith("us") || w.endsWith("is")) return w;
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

const stemmed = (s: string) => words(s).map(stem);

/** Damerau-Levenshtein (adjacent swap = 1) with an early exit when the distance must exceed `max`. */
export function distance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb];
}

/* ------------------------------------------------------------------ the query */

export type Unit = {
  /** the words the user typed for this unit (stemmed) */
  text: string;
  /** the ways to match it: the typed words first, then what synonyms stand for */
  alts: { tokens: string[]; weight: number }[];
};

export type ParsedQuery = {
  raw: string;
  /** the typed words, stemmed, without filter words and filler words */
  terms: string[];
  units: Unit[];
  levels: Level[];
  status: StatusWord | null;
  /** the filter words as typed, so the UI can show them and take them out of the text */
  filterWords: { word: string; kind: "level" | "status"; value: string }[];
  /** reads like a sentence: 4+ words or a question */
  natural: boolean;
};

const WORD_KEYS = Object.keys(SYNONYMS).filter((k) => !k.includes(" ") && k.length >= 5);
/** the synonym entry a misspelt word is one slip from ("hasmap" for "hashmap"), or undefined */
function nearSynonym(w: string): string[] | undefined {
  if (w.length < 5 || SYNONYMS[w] || /\d/.test(w)) return undefined;
  const max = w.length >= 8 ? 2 : 1;
  for (const k of WORD_KEYS) if (k[0] === w[0] && Math.abs(k.length - w.length) <= max && distance(w, k, max) <= max) return SYNONYMS[k];
  return undefined;
}

/** a misspelt filler word ("problmes") */
const STOP_LONG = [...STOPWORDS].filter((w) => w.length >= 6);
const nearStop = (w: string) => w.length >= 6 && STOP_LONG.some((k) => k[0] === w[0] && Math.abs(k.length - w.length) <= 1 && distance(w, k, 1) <= 1);

const PHRASE_KEYS = Object.keys(SYNONYMS).filter((k) => k.includes(" ")).sort((a, b) => b.length - a.length);

/** "I want to learn sliding window, give me medium string problems" is natural; "sliding window" and "lc 1" are not. */
export function isNatural(q: string): boolean {
  const t = q.trim();
  if (!t) return false;
  if (/\?\s*$/.test(t)) return true;
  const ws = t.split(/\s+/).filter(Boolean);
  return ws.length >= 4 || /^(how|what|which|where|why|can|could|should|i |show|give|find|help)\b/i.test(t) && ws.length >= 3;
}

export function parseQuery(raw: string): ParsedQuery {
  const q = raw.trim().slice(0, 200);
  const filterWords: ParsedQuery["filterWords"] = [];
  const levels: Level[] = [];
  let status: StatusWord | null = null;
  // multi-word filter phrases first ("not solved")
  let rest = ` ${q.toLowerCase()} `;
  for (const ph of Object.keys(STATUS_WORDS).filter((k) => k.includes(" "))) {
    if (rest.includes(` ${ph} `)) {
      rest = rest.replace(` ${ph} `, " ");
      status = STATUS_WORDS[ph];
      filterWords.push({ word: ph, kind: "status", value: STATUS_WORDS[ph] });
    }
  }
  const toks = rest.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  const multi = toks.length > 1;
  for (const t of toks) {
    const clean = t.replace(/[^a-z0-9]/g, "");
    // a word with punctuation inside is not a filter: "warm-up" is the title word of Warm-up round, "warmup" and "easy," are filters
    const plain = t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "") === clean;
    const lv = plain ? LEVEL_WORDS[clean] : undefined;
    const st = plain ? STATUS_WORDS[clean] : undefined;
    // a filter word is a filter when it sits next to other words, or alone ("hard", "solved")
    if (lv && (multi || toks.length === 1)) {
      if (!levels.includes(lv)) levels.push(lv);
      filterWords.push({ word: t, kind: "level", value: lv });
    } else if (st) {
      status = st;
      filterWords.push({ word: t, kind: "status", value: st });
    } else kept.push(t);
  }
  // a misspelt phrase the synonyms know ("priorty queue") is put right first
  for (let k = 0; k + 1 < kept.length; k++) {
    const bi = `${kept[k]} ${kept[k + 1]}`;
    if (bi.length < 9 || SYNONYMS[bi]) continue;
    const max = bi.length >= 14 ? 2 : 1;
    const key = PHRASE_KEYS.find((p) => p[0] === bi[0] && Math.abs(p.length - bi.length) <= max && distance(bi, p, max) <= max);
    if (key) kept.splice(k, 2, ...key.split(" "));
  }
  let text = ` ${kept.join(" ")} `;
  // phrase synonyms ("two pointer", "hash map") are found on the text before it is split into words
  const units: Unit[] = [];
  const claimed: { at: number; len: number; key: string }[] = [];
  for (const key of PHRASE_KEYS) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(` ${key} `, from);
      if (at < 0) break;
      claimed.push({ at, len: key.length + 1, key });
      text = `${text.slice(0, at)} ${"#".repeat(key.length)} ${text.slice(at + key.length + 2)}`;
      from = at + key.length;
    }
  }
  const phraseAt = new Map(claimed.map((c) => [c.at, c]));
  // walk the original kept text in order, emitting phrase units and word units
  const keptText = ` ${kept.join(" ")} `;
  let i = 0;
  const flush = (chunk: string) => {
    const ws = words(chunk);
    for (const w of ws) {
      if ((STOPWORDS.has(w) || nearStop(w)) && (ws.length > 1 || kept.length > 1)) continue;
      const s = stem(w);
      const near = SYNONYMS[s] || SYNONYMS[w] ? undefined : nearSynonym(s);
      const syn = SYNONYMS[s] || SYNONYMS[w] || near;
      units.push({ text: s, alts: [{ tokens: [s], weight: 1 }, ...(syn || []).map((p) => ({ tokens: stemmed(p), weight: near ? 0.7 : 0.85 }))] });
    }
  };
  let buf = "";
  while (i < keptText.length) {
    const c = phraseAt.get(i);
    if (c) {
      flush(buf);
      buf = "";
      const phrase = keptText.slice(i + 1, i + c.len);
      const toksP = stemmed(phrase);
      units.push({ text: toksP.join(" "), alts: [{ tokens: toksP, weight: 1 }, ...SYNONYMS[c.key].map((p) => ({ tokens: stemmed(p), weight: 0.85 }))] });
      i += c.len;
      continue;
    }
    buf += keptText[i];
    i++;
  }
  flush(buf);
  return { raw: q, terms: units.map((u) => u.text), units: units.slice(0, 12), levels, status, filterWords, natural: isNatural(q) };
}

/* ------------------------------------------------------------------ the index */

type Doc = {
  item: SearchItem;
  /** stemmed token lists per field; a field can hold several values (one list each) */
  f: Record<FieldId, string[][]>;
  title: string;
  /** the stemmed title as one string, for exact and prefix checks */
  titleN: string;
  aliasN: string[];
  /** the title's stemmed words, for the whole-word check */
  titleW: Set<string>;
  /** the title's words as written (not stemmed): "refunds" typed finds "refunds" a little ahead of "refund" */
  titleR: Set<string>;
};

/** vocab word to where it occurs, packed as doc << 10 | field << 6 | list (the list's place inside the field) */
export type SearchIndex = { docs: Doc[]; vocab: string[]; byLen: Map<number, string[]>; postings: Map<string, number[]>; memo: Map<string, Map<string, Match>> };
const FIELDS = Object.keys(WEIGHT) as FieldId[];

export function buildIndex(items: SearchItem[]): SearchIndex {
  const vocab = new Set<string>();
  const postings = new Map<string, number[]>();
  const docs = items.map((item, di): Doc => {
    const f: Doc["f"] = {
      title: [stemmed(item.title)],
      alias: item.aliases.map(stemmed),
      topic: item.topics.map(stemmed),
      tag: item.tags.map(stemmed),
      lesson: item.lesson ? [stemmed(item.lesson)] : [],
      domain: item.domains.map(stemmed),
      slug: [stemmed(item.id)],
      summary: item.summary ? [stemmed(item.summary)] : [],
    };
    FIELDS.forEach((fid, fi) => f[fid].forEach((l, li) => new Set(l).forEach((w) => {
      vocab.add(w);
      let p = postings.get(w);
      if (!p) postings.set(w, (p = []));
      p.push(di << 10 | fi << 6 | Math.min(li, 63));
    })));
    return { item, f, title: item.title, titleN: f.title[0].join(" "), aliasN: f.alias.map((a) => a.join(" ")), titleW: new Set(f.title[0]), titleR: new Set(words(item.title)) };
  });
  const list = [...vocab];
  const byLen = new Map<number, string[]>();
  for (const w of list) {
    const a = byLen.get(w.length);
    if (a) a.push(w);
    else byLen.set(w.length, [w]);
  }
  return { docs, vocab: list, byLen, postings, memo: new Map() };
}

/** how a query word matches each vocabulary word: exact 1, prefix .8, substring .45, typo .65 minus .1 per edit */
type Match = { s: number; kind: "exact" | "prefix" | "substring" | "typo" };
function matchVocab(index: SearchIndex, t: string, fuzzy: boolean): Map<string, Match> {
  const out = new Map<string, Match>();
  const maxEdits = t.length >= 8 ? 2 : t.length >= 4 ? 1 : 0;
  for (const v of index.vocab) {
    if (v === t) out.set(v, { s: 1, kind: "exact" });
    else if (t.length >= 2 && v.startsWith(t)) out.set(v, { s: t.length >= 3 ? 0.8 : 0.55, kind: "prefix" });
    else if (fuzzy && t.length >= 4 && v.includes(t)) out.set(v, { s: 0.45, kind: "substring" });
  }
  // a word the index knows is spelt right: no typo search for it (and none for synonyms' words)
  if (fuzzy && maxEdits && !/\d/.test(t) && !index.postings.has(t)) {
    // typos: only words of a near length are compared; a first letter that differs is allowed only for long words
    for (let len = t.length - maxEdits; len <= t.length + maxEdits; len++) {
      for (const v of index.byLen.get(len) || []) {
        if (out.has(v) || (v[0] !== t[0] && t.length < 6)) continue;
        const d = distance(t, v, maxEdits);
        if (d <= maxEdits) out.set(v, { s: 0.65 - 0.1 * d, kind: "typo" });
      }
    }
    // a long word typed so far with a slip ("slidng" on its way to "sliding"): its start is one edit from the word's start
    if (t.length >= 5) {
      for (let len = t.length + 1; len <= t.length + 5; len++) {
        for (const v of index.byLen.get(len) || []) {
          if (out.has(v) || v[0] !== t[0]) continue;
          if (distance(t, v.slice(0, t.length), 1) <= 1) out.set(v, { s: 0.5, kind: "typo" });
        }
      }
    }
  }
  return out;
}

export type Why = { field: FieldId; label: string; text: string };
export type Hit = {
  item: SearchItem;
  /** index in the list the index was built from */
  at: number;
  score: number;
  /** the best reason that is not "title"; null when the title says it */
  why: Why | null;
  /** character ranges of the title to highlight */
  ranges: [number, number][];
};

export type SearchOptions = {
  limit?: number;
  /** keep an item only when ... (progress filters, the AI's filters) */
  accept?: (item: SearchItem) => boolean;
  /** "all": every unit must match (typed queries); "any": units are soft (the AI's keywords) */
  require?: "all" | "any";
  /** extra soft words (the AI's keywords), searched as units on top of the typed ones */
  boost?: string[];
  /** with no typed words: keep accepted items that match no boost word too (after the ones that do) */
  fill?: boolean;
  /** added to an item's score (the AI's topics: items about them rise); an item with a bonus is kept even if no word matched */
  bonus?: (item: SearchItem) => number;
};

const EXACT_TITLE = 1000;
const EXACT_ALIAS = 900;
const PREFIX_TITLE = 300;
const PREFIX_ALIAS = 260;
const PHRASE_TITLE = 60;
/** a typed word (or phrase) that is a whole word of the title, on top of the field weight: "refunds" in "Match refunds with payments" beats the same word in a topic, tag or statement */
const TITLE_WORD = 8;
/** the typed word spelt exactly as the title spells it (no stemming), among equals */
const TITLE_LITERAL = 3;

function unitFromText(text: string): Unit | null {
  const toks = stemmed(text).filter((t) => !STOPWORDS.has(t));
  if (!toks.length) return null;
  return { text: toks.join(" "), alts: [{ tokens: toks, weight: 1 }] };
}

/** Rank the index for a query. Pure; the filter words in the query (easy, unsolved ...) are the caller's to apply (see parseQuery). */
export function search(index: SearchIndex, query: string | ParsedQuery, opts: SearchOptions = {}): Hit[] {
  const pq = typeof query === "string" ? parseQuery(query) : query;
  const boost = (opts.boost || []).map(unitFromText).filter((u): u is Unit => !!u).slice(0, 12);
  const units = pq.units;
  const accept = opts.accept;
  const limit = opts.limit ?? 50;
  const n = index.docs.length;

  // nothing to match on: every accepted item in index order (the caller's order), e.g. just "hard"
  if (!units.length && !boost.length) {
    const out: Hit[] = [];
    for (let at = 0; at < n && out.length < limit; at++) {
      const d = index.docs[at];
      if (accept && !accept(d.item)) continue;
      out.push({ item: d.item, at, score: 0, why: null, ranges: [] });
    }
    return out;
  }

  // each token, resolved once against the vocabulary, then against the postings: per document its best field match
  type TokHit = Map<number, { v: number; fi: number; li: number }>;
  const mapOf = (t: string, fuzzy = true) => {
    const key = fuzzy ? t : `=${t}`;
    let m = index.memo.get(key);
    if (!m) {
      m = matchVocab(index, t, fuzzy);
      if (index.memo.size > 400) index.memo.clear();
      index.memo.set(key, m);
    }
    return m;
  };
  const tokHits = new Map<string, TokHit>();
  const hitsOf = (t: string, fuzzy: boolean): TokHit => {
    const key = fuzzy ? t : `=${t}`;
    let th = tokHits.get(key);
    if (th) return th;
    th = new Map();
    for (const [w, mm] of mapOf(t, fuzzy)) {
      for (const p of index.postings.get(w) || []) {
        const di = p >> 10;
        const fi = (p >> 6) & 15;
        const v = WEIGHT[FIELDS[fi]] * mm.s;
        const cur = th.get(di);
        if (!cur || v > cur.v) th.set(di, { v, fi, li: p & 63 });
      }
    }
    tokHits.set(key, th);
    return th;
  };

  const total = new Float64Array(n);
  const matched = new Uint8Array(n);
  const why = new Map<number, { v: number; fi: number; text: string }>();
  const runUnit = (u: Unit, soft: boolean, scale: number) => {
    // per document, the best alternative; an alternative counts when each of its words matched somewhere
    const best = new Map<number, number>();
    for (const alt of u.alts) {
      const fz = alt.weight === 1;
      const first = hitsOf(alt.tokens[0], fz);
      const rest = alt.tokens.slice(1).map((t) => hitsOf(t, fz));
      for (const [di, h0] of first) {
        let sum = h0.v;
        let same = true;
        let ok = true;
        let top = h0;
        for (const r of rest) {
          const h = r.get(di);
          if (!h) {
            ok = false;
            break;
          }
          sum += h.v;
          if (h.fi !== h0.fi) same = false;
          if (h.v > top.v) top = h;
        }
        if (!ok) continue;
        let v = (sum / alt.tokens.length) * alt.weight * (soft ? 0.8 : 1);
        if (alt.tokens.length > 1 && same) v *= 1.25;
        if (v > (best.get(di) || 0)) {
          best.set(di, v);
          if (FIELDS[top.fi] !== "title") {
            const w = why.get(di);
            if (!w || v > w.v) {
              const it = index.docs[di].item;
              const fid = FIELDS[top.fi];
              const raw = fid === "topic" ? it.topics[top.li] : fid === "tag" ? it.tags[top.li] : fid === "alias" ? it.aliases[top.li] : fid === "domain" ? it.domains[top.li] : fid === "lesson" ? it.lesson : fid === "slug" ? it.id : "";
              why.set(di, { v, fi: top.fi, text: raw || "" });
            }
          }
        }
      }
    }
    for (const [di, v] of best) {
      total[di] += v * scale;
      matched[di]++;
    }
  };
  const typedN = units.map((u) => u.text).join(" ");
  const need = opts.require === "any" ? 1 : units.length <= 3 ? units.length : Math.ceil(units.length * 0.6);
  for (const u of units) runUnit(u, false, 1);
  const typedMatched = matched.slice();
  for (const u of boost) runUnit(u, true, 0.7);

  // the typed words, in order, found side by side in one title, alias, topic, tag or lesson (typos allowed): "binary search"
  // is the topic Binary search, not "search" in one title and "binary" in another
  const seq = units.length >= 2 && units.length <= 4 && units.every((u) => u.alts[0].tokens.length === 1) ? units.map((u) => mapOf(u.alts[0].tokens[0])) : null;
  const PHRASE: Partial<Record<FieldId, number>> = { title: 48, alias: 24, topic: 20, tag: 18, lesson: 10 };
  const phraseBonus = (d: Doc) => {
    if (!seq) return 0;
    let best = 0;
    for (const fid of Object.keys(PHRASE) as FieldId[]) {
      const b = PHRASE[fid] as number;
      if (b + 22 <= best) continue;
      for (const l of d.f[fid]) {
        for (let s = 0; s + seq.length <= l.length; s++) {
          if (seq.every((m, k) => m.has(l[s + k]))) {
            // the whole topic or tag, nothing more: "binary search" is the topic Binary search
            best = (fid === "topic" || fid === "tag") && l.length === seq.length ? b + 22 : b;
            break;
          }
        }
        if (best >= b) break;
      }
    }
    return best;
  };

  const typedWords = words(pq.raw);
  const hits: Hit[] = [];
  for (let at = 0; at < n; at++) {
    const d = index.docs[at];
    if (units.length && typedMatched[at] < need) continue;
    if (accept && !accept(d.item)) continue;
    const extra = opts.bonus ? opts.bonus(d.item) : 0;
    if (!total[at] && !extra && !(opts.fill && !units.length)) continue;
    let sc = total[at] + extra + (total[at] ? phraseBonus(d) : 0);
    if (typedN) {
      if (d.titleN === typedN) sc += EXACT_TITLE;
      else if (d.titleN.startsWith(typedN)) sc += PREFIX_TITLE;
      else if ((` ${d.titleN} `).includes(` ${typedN} `)) sc += PHRASE_TITLE;
      if (d.aliasN.some((a) => a === typedN)) sc += EXACT_ALIAS;
      else if (d.aliasN.some((a) => a.startsWith(typedN))) sc += PREFIX_ALIAS;
    }
    for (const w of typedWords) if (d.titleR.has(w)) sc += TITLE_LITERAL;
    for (const u of units) {
      const tk = u.alts[0].tokens;
      if (tk.length && tk.every((t) => d.titleW.has(t))) sc += TITLE_WORD;
    }
    // a keyword that is a whole title or alias ("two sum", "lru cache") says which problem is meant
    for (const u of boost) {
      if (d.titleN === u.text) sc += EXACT_TITLE / 2;
      else if (d.aliasN.includes(u.text)) sc += EXACT_ALIAS / 2;
    }
    // shorter titles rank a little ahead among equals
    sc -= Math.min(d.titleN.length, 80) * 0.02;
    hits.push({ item: d.item, at, score: sc, why: null, ranges: [] });
  }
  hits.sort((a, b) => b.score - a.score || a.at - b.at);
  const top = hits.slice(0, limit);

  // highlight and the reason, for the hits that are shown
  const all = [...units, ...boost];
  for (const h of top) {
    const ranges: [number, number][] = [];
    const re = /[A-Za-z0-9]+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(h.item.title))) {
      const w = stem(m[0].toLowerCase());
      let hit = false;
      for (const u of all) {
        for (const alt of u.alts) for (const t of alt.tokens) {
          const mm = mapOf(t, alt.weight === 1).get(w);
          if (mm && mm.kind !== "substring") hit = true;
        }
      }
      if (hit) ranges.push([m.index, m.index + m[0].length]);
    }
    h.ranges = ranges;
    const w = why.get(h.at);
    if (w && w.text && !ranges.length) h.why = { field: FIELDS[w.fi], label: FIELD_LABEL[FIELDS[w.fi]], text: w.text };
  }
  return top;
}

/** the "topic: Sliding window" line for a hit (or "" when the title already shows the match) */
export const whyText = (h: Hit): string => (h.why ? `${h.why.label}: ${h.why.text}` : "");
