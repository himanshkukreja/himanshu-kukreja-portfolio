/**
 * The smart-search engine: BM25F over one index of every course resource (titles and keywords weigh more
 * than body text), a system-design synonym map, typo fixes against the index's own vocabulary, and a few
 * intent cues ("with a video", "interview next week", "hands-on") that favour the right kinds. Pure and
 * deterministic: the query route, the AI route and the eval all rank with this same code.
 *
 * Built once per server instance from /api/search/index (docs) and /api/search/transcripts (lecture
 * moments and shorts, reused as is), then each query is a few milliseconds.
 */
import { TRANSCRIPT_SHORT, TRANSCRIPT_UNTIMED, type TranscriptIndex } from "@/lib/learn/lecture/transcript";
import { ASKS, GROUPS } from "./synonyms";
import { editDistance, GLUE_WORDS, isNaturalQuery, lead, normalize, queryTokens, STOP, stem, tokens } from "./text";
import { KINDS, type Doc, type Hit, type Kind, type SmartResults } from "./types";

/** field weight (w) and length normalization (b) */
const FIELDS = [
  { get: (d: Doc) => d.title, w: 3, b: 0.4 },
  { get: (d: Doc) => d.kw, w: 1.6, b: 0.2 },
  { get: (d: Doc) => d.sub, w: 0.5, b: 0.3 },
  { get: (d: Doc) => d.text, w: 1, b: 0.75 },
];
const K1 = 1.2;
/** reading lists inside lessons: they name everything once, so they match everything a little */
const REF_LIST = /^(?:\d+(?:\.\d+)*\.?\s+)?(sources?|references?|further reading|reading list|recommended reading|(official )?documentation|docs|engineering (posts|blogs?)|blogs?|books?|papers?|resources?|links|videos?|talks?|tools?|credits?|related (lessons|reading))\b/i;
/** a best score under this is a weak match (a word or two in passing): the page says so */
const WEAK = 12;

/** How much a kind is worth before the query says anything (a lesson or concept beats a passing mention). */
const PRIOR: Record<Kind, number> = {
  lesson: 1.2,
  section: 1.0,
  lecture: 1.05,
  moment: 0.8,
  short: 0.75,
  quest: 1.1,
  problem: 1.1,
  lld: 1.05,
  case: 0.95,
  mock: 0.95,
  war: 0.9,
  concept: 1.2,
  faq: 0.7,
  // thousands of short pre-written answers, one chapter each: they help a narrow question, never lead a topic
  lfaq: 0.55,
  lab: 1.05,
  drill: 0.7,
  sheet: 0.85,
  // a few dense lines each (BM25 favours short texts), one per idea: below the lesson that teaches it
  card: 0.65,
  // an outside write-up the lesson points to (a paper, an engineering blog, a postmortem)
  trail: 0.75,
  company: 1.0,
};

/** What a query can say about the kind of resource it wants, and the kinds that gain. */
const INTENTS: { id: string; re: RegExp; boost: Partial<Record<Kind, number>> }[] = [
  { id: "video", re: /\b(videos?|watch|lectures?|visual(ly)?|animat\w*|explainer)\b/, boost: { moment: 1.9, lecture: 1.9, short: 1.5 } },
  { id: "quick", re: /\b(quick(ly)?|shorts?|reels?|tl ?dr|\d+ ?min(ute)?s?|in a hurry|only have)\b/, boost: { short: 1.6, concept: 1.3, sheet: 1.3, card: 1.2, lecture: 1.1 } },
  { id: "interview", re: /\b(interviews?|interviewing|onsite|hiring|sde ?\d?|faang|offer|recruiter|panel)\b/, boost: { company: 1.6, mock: 1.5, problem: 1.35, drill: 1.4, lld: 1.15, faq: 1.1, card: 1.15 } },
  { id: "practice", re: /\b(practi[cs]e|hands ?on|code|coding|implement\w*|build it|labs?|exercises?|drills?)\b/, boost: { lab: 1.8, drill: 1.5, lld: 1.2, mock: 1.2 } },
  { id: "revise", re: /\b(revise|revision|cheat ?sheets?|recap|refresher|one ?pager|summary|summari[sz]e)\b/, boost: { sheet: 1.7, card: 1.7, concept: 1.4, short: 1.2 } },
  { id: "real", re: /\b(outages?|incidents?|war ?stor(y|ies)|post ?mortems?|real ?world|in production|actually happened|case ?(file|stud(y|ies)))\b/, boost: { war: 1.8, case: 1.6, trail: 1.3 } },
  { id: "read", re: /\b(papers?|whitepapers?|blogs?|blog posts?|engineering blogs?|articles?|write ?ups?|further reading|reading (list|trail)|what (should|to) i read)\b/, boost: { trail: 1.9 } },
  { id: "lld", re: /\b(lld|low ?level|machine ?coding|class(es)? design|oop|object ?oriented)\b/, boost: { lld: 1.8 } },
  { id: "beginner", re: /\b(beginners?|new to|basics?|intro(duction)?|from scratch|fundamentals?|eli5|start(ing)? out|where (do|should) i start|teach me system design|learn system design)\b/, boost: { lesson: 1.25, concept: 1.2 } },
];

type Phrase = { toks: string[]; exp: string[][]; slotOf: "self" | "asks" };
type QTerm = { t: string; w: number; slot: number };
type QPhrase = { toks: string[]; w: number; slot: number };

export type SearchOpts = {
  /** publishing gate check (quest:<slug>, short:<id>); a doc whose gate fails is never returned */
  live?: (gate: string) => boolean;
  /** how many ranked hits to keep (default 400) */
  limit?: number;
};

export type Ranked = { doc: Doc; score: number };

const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(Math.floor(s % 60)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};
export const atClock = clock;

/** Lecture moments and shorts from the ⌘K transcript index, as docs. */
export function transcriptDocs(t: TranscriptIndex): Doc[] {
  const out: Doc[] = [];
  const seen = new Map<string, number>();
  t.m.forEach(([src, at, text]) => {
    const [id, title, code, href, kind] = t.l[src];
    if (kind === TRANSCRIPT_SHORT) {
      const lecture = id.split("--")[1] || "";
      out.push({
        id: `SH:${id}`,
        kind: "short",
        title,
        sub: code ? `${code} · short` : "Short",
        href,
        summary: lead(text, 160),
        text,
        kw: "",
        gate: [`short:${id}`, lecture.startsWith("bonus-") ? `quest:${lecture}` : ""].filter(Boolean).join(" "),
        rel: [],
        parent: "",
        at: -1,
      });
      return;
    }
    const timed = kind !== TRANSCRIPT_UNTIMED && at >= 0;
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    out.push({
      id: timed ? `M:${id}@${at}` : `M:${id}#${n}`,
      kind: "moment",
      title,
      sub: `${code} · ${timed ? clock(at) : "lecture"}`,
      href: timed && at > 0 ? `${href}?t=${at}&autoplay=1` : `${href}?autoplay=1`,
      summary: lead(text, 160),
      text,
      kw: "",
      gate: id.startsWith("bonus-") ? `quest:${id}` : "",
      rel: [],
      parent: `V:${id}`,
      at: timed ? at : -1,
    });
  });
  return out;
}

/** Sorted doc ids and their saturated weights, per term. */
type Posting = { d: Int32Array; w: Float32Array };

function lowerBound(a: Int32Array, x: number, lo = 0): number {
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class SmartEngine {
  readonly docs: Doc[];
  readonly built: string;
  private post = new Map<string, Posting>();
  private df = new Map<string, number>();
  private byId = new Map<string, number>();
  /** synonym and ask phrases by their first stemmed token */
  private phrases = new Map<string, Phrase[]>();
  /** stemmed company-name tokens → company doc index (a named company is decisive) */
  private companies = new Map<string, number>();
  private vocab: string[] = [];
  /** a stem's first spelling seen in the index ("cach" → "cache"), for "showing results for …" */
  private surface = new Map<string, string>();
  /** every word the synonym map names: real terms (helm, saml, pinecone), never typos to "fix" */
  private known = new Set<string>();

  constructor(input: Doc[], built: string, extraGroups: string[][] = []) {
    this.docs = SmartEngine.resolve(input);
    this.built = built;
    const docs = this.docs;
    docs.forEach((d, i) => this.byId.set(d.id, i));
    this.index();
    this.loadPhrases([...GROUPS, ...extraGroups]);
    docs.forEach((d, i) => {
      if (d.kind !== "company") return;
      const t = tokens(d.title).filter((w) => w.length > 2 && !STOP.has(w));
      if (t.length) this.companies.set(t.join(" "), i);
    });
  }

  /**
   * Fills in what the index rows leave out to stay small: a section's, FAQ's or drill's link ("#id" on its
   * lesson; a lecture FAQ's "?at=<chapter>" on its lecture), its place ("W04 · DAY 03 · Thundering Herd")
   * and a summary from its text. A row whose lesson or lecture is missing (hidden since) is dropped.
   */
  static resolve(input: Doc[]): Doc[] {
    const byId = new Map(input.map((d) => [d.id, d]));
    const out: Doc[] = [];
    for (const d of input) {
      const p = d.parent ? byId.get(d.parent) : undefined;
      if (d.href.startsWith("#") || d.href.startsWith("?")) {
        if (!p) continue;
        d.href = `${p.href}${d.href}`;
      }
      if (p && d.kind === "section" && !d.sub) d.sub = `${p.sub.split(" · ")[0]} · ${p.title}`;
      else if (p && (d.kind === "faq" || d.kind === "drill") && !d.sub.includes(" · ")) d.sub = `${d.sub} · ${p.title}`;
      // a lecture FAQ's row holds its chapter's title: "<lecture> · <chapter>"
      else if (p && d.kind === "lfaq" && !d.sub.startsWith(p.title)) d.sub = d.sub ? `${p.title} · ${d.sub}` : p.title;
      if (!d.summary) d.summary = lead(d.text, 180);
      out.push(d);
    }
    return out;
  }

  /** The lesson (or quest, lecture, page) a doc belongs to: a section's lesson, a moment's lecture's lesson, itself. */
  family(d: Doc): string {
    let cur = d;
    for (let k = 0; k < 3 && cur.parent; k++) {
      const up = this.doc(cur.parent);
      if (!up) return cur.parent;
      cur = up;
    }
    return cur.id;
  }

  get size() {
    return this.docs.length;
  }

  doc(id: string): Doc | null {
    const i = this.byId.get(id);
    return i === undefined ? null : this.docs[i];
  }

  private index() {
    const N = this.docs.length;
    const lens = FIELDS.map(() => 0);
    const counts = FIELDS.map(() => 0);
    const perDoc: { tf: Map<string, number[]>; len: number[] }[] = new Array(N);
    for (let i = 0; i < N; i++) {
      const d = this.docs[i];
      const tf = new Map<string, number[]>();
      const len = FIELDS.map((f, k) => {
        const words = normalize(f.get(d)).split(" ").filter(Boolean);
        const ts = words.map((w) => {
          const st = stem(w);
          const seen = this.surface.get(st);
          if (!seen || w.length < seen.length) this.surface.set(st, w);
          return st;
        });
        for (const t of ts) {
          let a = tf.get(t);
          if (!a) tf.set(t, (a = [0, 0, 0, 0]));
          a[k]++;
        }
        if (ts.length) {
          lens[k] += ts.length;
          counts[k]++;
        }
        return ts.length;
      });
      perDoc[i] = { tf, len };
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    const avg = lens.map((l, k) => (counts[k] ? l / counts[k] : 1));
    const build = new Map<string, { d: number[]; w: number[] }>();
    for (let i = 0; i < N; i++) {
      const { tf, len } = perDoc[i];
      for (const [t, a] of tf) {
        let x = 0;
        for (let k = 0; k < FIELDS.length; k++) if (a[k]) x += (FIELDS[k].w * a[k]) / (1 - FIELDS[k].b + (FIELDS[k].b * len[k]) / avg[k]);
        const sat = (x * (K1 + 1)) / (x + K1);
        let p = build.get(t);
        if (!p) build.set(t, (p = { d: [], w: [] }));
        p.d.push(i);
        p.w.push(sat);
      }
    }
    for (const [t, p] of build) this.post.set(t, { d: Int32Array.from(p.d), w: Float32Array.from(p.w) });
    this.vocab = [...this.df.keys()].filter((t) => t.length >= 3 && !/^\d+$/.test(t));
  }

  private loadPhrases(groups: string[][]) {
    const add = (from: string, exp: string[], slotOf: Phrase["slotOf"]) => {
      const toks = tokens(from);
      if (!toks.length) return;
      for (const w of [...toks, ...exp.flatMap(tokens)]) this.known.add(w);
      const ex = exp.map((e) => tokens(e).filter((w) => !GLUE_WORDS.has(w))).filter((e) => e.length && e.join(" ") !== toks.join(" "));
      if (!ex.length) return;
      const list = this.phrases.get(toks[0]) ?? [];
      list.push({ toks, exp: ex, slotOf });
      this.phrases.set(toks[0], list);
    };
    for (const g of groups) for (const m of g) add(m, g.filter((x) => x !== m), "self");
    for (const [k, v] of Object.entries(ASKS)) add(k, v, "asks");
  }

  private idf(t: string): number {
    const df = this.df.get(t) ?? 0;
    const N = this.docs.length;
    return Math.log(1 + (N - df + 0.5) / (df + 0.5));
  }

  /** A word the index doesn't know (or barely knows) → the closest common one, if there is one. */
  private fix(word: string): string | null {
    const t = stem(word);
    if (word.length < 4 || /^\d/.test(word) || STOP.has(word)) return null;
    // a term the synonym map names is real, not a typo ("helm" isn't "held", "saml" isn't "same")
    if (this.known.has(t)) return null;
    // a known word stays, unless its stem is only a stop word ("hasing" → "has": a typo of "hashing")
    const own = STOP.has(t) ? 0 : this.df.get(t) ?? 0;
    if (own >= 3) return null;
    const max = word.length >= 8 ? 2 : 1;
    const forms = ["", "s", "e", "es", "ing", "ed", "er", "y"];
    let best: { w: string; d: number; df: number } | null = null;
    for (const v of this.vocab) {
      // typos rarely change the first letter; this also keeps the scan short
      if (v[0] !== word[0] || v === t || v.length > word.length + max || v.length < word.length - max - 3) continue;
      // never into English glue ("wasm" → "was", "hive" → "have"): it would match every document
      if (GLUE_WORDS.has(v)) continue;
      const df = this.df.get(v) ?? 0;
      if (df < 3 || df < own * 20) continue;
      let d = max + 1;
      for (const f of forms) {
        const form = v + f;
        if (Math.abs(form.length - word.length) > max) continue;
        d = Math.min(d, editDistance(word, form, max));
        if (d === 0) break;
      }
      if (d > max || d === 0) continue;
      if (!best || d < best.d || (d === best.d && df > best.df)) best = { w: v, d, df };
    }
    return best?.w ?? null;
  }

  /** The query as weighted terms and phrases, each in a "slot" (one idea of the query: a word and its synonyms). */
  analyse(q: string) {
    const { raw, terms } = queryTokens(q);
    const nq = ` ${normalize(q)} `;
    const seq = raw.map(stem);
    const intents = INTENTS.filter((x) => x.re.test(nq)).map((x) => x.id);
    const qt: QTerm[] = [];
    const qp: QPhrase[] = [];
    const fixes: { from: string; to: string }[] = [];
    const expanded: string[] = [];
    let slots = 0;
    const slotOfTerm = new Map<string, number>();

    // typo fixes first, so a fixed word still finds its synonyms
    const fixed = terms.map((t) => {
      const from = raw.find((w) => stem(w) === t) ?? t;
      const f = this.fix(from);
      if (f) fixes.push({ from, to: this.surface.get(f) ?? f });
      return { t, f };
    });
    const seqFixed = seq.map((s) => fixed.find((x) => x.t === s)?.f ?? s);

    // synonym / ask phrases found in the query (longest first at each position)
    const covered = new Set<string>();
    let asksShown = 0;
    for (let i = 0; i < seqFixed.length; i++) {
      const list = (this.phrases.get(seqFixed[i]) ?? []).filter((p) => p.toks.every((w, k) => seqFixed[i + k] === w)).sort((a, b) => b.toks.length - a.toks.length);
      for (const p of list) {
        const content = p.toks.filter((w) => !STOP.has(w));
        // a phrase made only of stop words ("real time" stays: "real" and "time" aren't both stop words)
        if (!content.length && p.slotOf === "self") continue;
        const own = content.find((w) => slotOfTerm.has(w));
        const slot = own !== undefined ? slotOfTerm.get(own)! : slots++;
        content.forEach((w) => slotOfTerm.set(w, slot));
        if (content.length > 1) qp.push({ toks: content, w: 1, slot });
        for (const e of p.exp) {
          const key = e.join(" ");
          if (covered.has(key)) continue;
          covered.add(key);
          // what people say ("melting at midnight") leads what the course calls the topic's neighbours
          if (p.slotOf === "asks") expanded.splice(asksShown++, 0, key);
          else expanded.push(key);
          if (e.length === 1) qt.push({ t: e[0], w: p.slotOf === "asks" ? 0.75 : 0.55, slot });
          else qp.push({ toks: e, w: p.slotOf === "asks" ? 0.8 : 0.6, slot });
        }
      }
    }

    // the query's own words (when the whole query was a known ask made of stop words, its expansions stand in for them)
    const allStop = !raw.some((w) => !STOP.has(w) && w.length > 1);
    const askOnly = allStop && expanded.length > 0;
    for (const { t, f } of askOnly ? [] : fixed) {
      const slot = slotOfTerm.get(t) ?? slotOfTerm.get(f ?? "") ?? slots++;
      slotOfTerm.set(t, slot);
      if (f) {
        qt.push({ t: f, w: 0.9, slot });
        if ((this.df.get(t) ?? 0) > 0 && !STOP.has(t)) qt.push({ t, w: 0.4, slot });
      } else qt.push({ t, w: 1, slot });
    }
    // neighbouring query words as a phrase (proximity: "consistent hashing" beats "consistent" + "hashing" apart)
    const content = seqFixed.filter((w, i) => !STOP.has(raw[i]) && raw[i].length > 1);
    for (let i = 0; i + 1 < content.length; i++) {
      const a = content[i];
      const b = content[i + 1];
      if (a === b) continue;
      qp.push({ toks: [a, b], w: 0.5, slot: slotOfTerm.get(a) ?? 0 });
    }
    // companies named in the query
    const named: number[] = [];
    for (const [name, i] of this.companies) if (` ${seqFixed.join(" ")} `.includes(` ${name} `)) named.push(i);

    return { raw, askOnly, terms: askOnly ? [] : fixed.map((x) => x.f ?? x.t), intents, qt, qp, fixes, expanded, slots: Math.max(1, slots), named };
  }

  /** Every doc that matches, best first (gated docs left out). */
  rank(q: string, opts: SearchOpts = {}) {
    const a = this.analyse(q);
    const N = this.docs.length;
    const acc = new Float64Array(N);
    const mask = new Int32Array(N);
    const touched: number[] = [];
    const add = (i: number, v: number, slot: number) => {
      if (acc[i] === 0) touched.push(i);
      acc[i] += v;
      mask[i] |= 1 << Math.min(30, slot);
    };
    // merge duplicate terms (a word and its synonym can be the same stem): keep the higher weight
    const terms = new Map<string, QTerm>();
    for (const t of a.qt) {
      const o = terms.get(t.t);
      if (!o || o.w < t.w) terms.set(t.t, t);
    }
    for (const t of terms.values()) {
      const p = this.post.get(t.t);
      if (!p) continue;
      const idf = this.idf(t.t);
      for (let k = 0; k < p.d.length; k++) add(p.d[k], t.w * idf * p.w[k], t.slot);
    }
    for (const ph of a.qp) {
      if (ph.toks.length < 2) continue;
      const ps = ph.toks.map((t) => this.post.get(t));
      if (ps.some((p) => !p)) continue;
      const lists = ps as Posting[];
      const order = lists.map((p, k) => ({ p, k, idf: this.idf(ph.toks[k]) })).sort((x, y) => x.p.d.length - y.p.d.length);
      const [first, ...rest] = order;
      for (let j = 0; j < first.p.d.length; j++) {
        const doc = first.p.d[j];
        let s = first.idf * first.p.w[j];
        let ok = true;
        for (const r of rest) {
          const at = lowerBound(r.p.d, doc);
          if (at >= r.p.d.length || r.p.d[at] !== doc) {
            ok = false;
            break;
          }
          s += r.idf * r.p.w[at];
        }
        // both words in the doc: a co-occurrence bonus (adjacency is checked on the best docs below)
        if (ok) add(doc, (ph.w * s) / (1 + rest.length) / 2, ph.slot);
      }
    }

    const boost: Partial<Record<Kind, number>> = {};
    for (const id of a.intents) for (const [k, v] of Object.entries(INTENTS.find((x) => x.id === id)!.boost)) boost[k as Kind] = (boost[k as Kind] ?? 1) * v;
    const named = new Set(a.named);
    const beginner = a.intents.includes("beginner");
    const live = opts.live;
    const scored: Ranked[] = [];
    for (const i of touched) {
      const d = this.docs[i];
      if (d.gate && live && !d.gate.split(" ").every(live)) continue;
      let bits = 0;
      for (let m = mask[i]; m; m &= m - 1) bits++;
      const cover = bits / a.slots;
      let s = acc[i] * PRIOR[d.kind] * (boost[d.kind] ?? 1) * (d.kind === "section" && REF_LIST.test(d.title) ? 0.3 : 1) * (a.slots > 1 ? 0.25 + 0.75 * cover ** 1.5 : 1);
      if (named.has(i)) s *= 3;
      // a beginner's ask: the foundations and the plan first
      if (beginner && (d.sub.startsWith("W00") || d.id.includes("week-00-") || d.id === "L:overview/plan")) s *= 1.8;
      scored.push({ doc: d, score: s });
    }
    scored.sort((x, y) => y.score - x.score);

    // the best few hundred: exact phrases and the whole query in a title count for more
    const phrases = a.qp.filter((p) => p.toks.length > 1);
    const head = scored.slice(0, 300);
    const qTitle = a.terms.join(" ");
    for (const r of head) {
      const title = ` ${tokens(r.doc.title).join(" ")} `;
      const body = ` ${tokens(`${r.doc.title} ${r.doc.kw} ${r.doc.text.slice(0, 4000)}`).join(" ")} `;
      let bonus = 1;
      for (const p of phrases) if (body.includes(` ${p.toks.join(" ")} `)) bonus *= 1 + 0.25 * p.w;
      if (qTitle && title.includes(` ${qTitle} `)) bonus *= 1.5;
      r.score *= Math.min(bonus, 2.5);
    }
    head.sort((x, y) => y.score - x.score);
    const ranked = [...head, ...scored.slice(300)].slice(0, opts.limit ?? 400);
    return { a, ranked };
  }

  /** A line of the doc around its first matching word, for results whose summary doesn't show the match. */
  snippet(d: Doc, terms: string[], width = 170): string {
    const set = new Set(terms);
    if (!d.text || !set.size) return d.summary;
    const sumHit = tokens(d.summary).some((w) => set.has(w));
    if (sumHit && d.kind !== "moment") return d.summary;
    const re = /[A-Za-z0-9][A-Za-z0-9'’-]*/g;
    let m: RegExpExecArray | null;
    let at = -1;
    while ((m = re.exec(d.text))) {
      if (set.has(stem(normalize(m[0]).split(" ")[0] || ""))) {
        at = m.index;
        break;
      }
    }
    if (at < 0) return d.summary;
    if (d.text.length <= width) return d.text;
    let start = Math.max(0, at - Math.round(width * 0.3));
    let end = Math.min(d.text.length, start + width);
    start = Math.max(0, end - width);
    if (start > 0) start = d.text.indexOf(" ", start) + 1 || start;
    if (end < d.text.length) {
      const sp = d.text.lastIndexOf(" ", end);
      if (sp > start) end = sp;
    }
    return `${start > 0 ? "…" : ""}${d.text.slice(start, end).trim()}${end < d.text.length ? "…" : ""}`;
  }

  toHit(r: Ranked, terms: string[], top: number): Hit {
    const d = r.doc;
    return { id: d.id, kind: d.kind, title: d.title, sub: d.sub, href: d.href, summary: this.snippet(d, terms), at: d.at, score: top ? Math.round((r.score / top) * 1000) / 1000 : 0 };
  }

  /**
   * The AI's candidates: the best 40, spread across kinds (at most 2 moments per lecture, 3 sections per
   * lesson), each section's lesson and each concept's teaching section pulled in too. A company the query
   * names comes first, and its study path (the articles its questions link to) is kept in the list.
   */
  candidates(ranked: Ranked[], named: number[] = [], n = 40): Ranked[] {
    const cap: Partial<Record<Kind, number>> = { moment: 8, section: 10, faq: 3, lfaq: 2, short: 3, drill: 3, lecture: 4, war: 3, case: 3, sheet: 3, card: 2, trail: 2, company: 2 };
    const perKind = new Map<Kind, number>();
    const perParent = new Map<string, number>();
    const out: Ranked[] = [];
    const ids = new Set<string>();
    const top = ranked[0]?.score ?? 0;
    const rankOf = new Map(ranked.map((r, i) => [r.doc.id, i]));
    const scored = (d: Doc, fallback: number): Ranked => {
      const i = rankOf.get(d.id);
      return i === undefined ? { doc: d, score: fallback } : ranked[i];
    };
    const push = (r: Ranked) => {
      if (ids.has(r.doc.id) || out.length >= n) return false;
      ids.add(r.doc.id);
      out.push(r);
      perKind.set(r.doc.kind, (perKind.get(r.doc.kind) ?? 0) + 1);
      if (r.doc.parent) perParent.set(r.doc.parent, (perParent.get(r.doc.parent) ?? 0) + 1);
      return true;
    };
    // a named company, and room kept for its study path
    const path: Doc[] = [];
    for (const i of named.slice(0, 2)) {
      const c = this.docs[i];
      push(scored(c, top));
      for (const id of c.rel.slice(0, 6)) {
        const d = this.doc(id);
        if (d && !path.includes(d)) path.push(d);
      }
    }
    const room = n - path.length;
    for (const r of ranked) {
      if (out.length >= room) break;
      if (r.score < top * 0.04) break;
      const k = r.doc.kind;
      if ((perKind.get(k) ?? 0) >= (cap[k] ?? 6)) continue;
      if (r.doc.parent && (perParent.get(r.doc.parent) ?? 0) >= (k === "section" ? 3 : 2)) continue;
      push(r);
      // a section's lesson, a moment's lecture, a concept's teaching section
      const up = r.doc.parent ? this.doc(r.doc.parent) : null;
      if (up && out.length < room) push(scored(up, r.score * 0.9));
      if (k === "concept" && r.doc.rel[0] && out.length < room) {
        const t = this.doc(r.doc.rel[0]);
        if (t) push(scored(t, r.score * 0.85));
      }
    }
    for (const d of path) push(scored(d, top * 0.3));
    return out;
  }

  /** Deterministic results, grouped by kind (each group best first; groups by their best hit, the kinds the query asks for first). */
  search(q: string, opts: SearchOpts = {}): SmartResults & { candidates: Ranked[] } {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const { a, ranked } = this.rank(q, opts);
    const terms = [...new Set([...a.terms, ...a.qt.map((x) => x.t)])];
    const top = ranked[0]?.score ?? 0;
    const LIMIT: Partial<Record<Kind, number>> = { section: 8, moment: 8, faq: 5, lfaq: 4, card: 4, trail: 4, lesson: 6 };
    const groups = new Map<Kind, Hit[]>();
    const perParent = new Map<string, number>();
    for (const r of ranked) {
      if (r.score < top * 0.03) break;
      const k = r.doc.kind;
      const g = groups.get(k) ?? [];
      if (g.length >= (LIMIT[k] ?? 6)) continue;
      if (k === "moment" || k === "section" || k === "faq" || k === "lfaq" || k === "card" || k === "trail") {
        const c = perParent.get(`${k}:${r.doc.parent}`) ?? 0;
        if (c >= 2) continue;
        perParent.set(`${k}:${r.doc.parent}`, c + 1);
      }
      g.push(this.toHit(r, terms, top));
      groups.set(k, g);
    }
    // kinds the query asks for ("with a video", "interview") lead
    const wanted = new Set<Kind>();
    for (const id of a.intents) for (const k of Object.keys(INTENTS.find((x) => x.id === id)!.boost)) wanted.add(k as Kind);
    if (a.intents.includes("video")) ["moment", "lecture"].forEach((k) => wanted.add(k as Kind));
    const lift = (k: Kind) => (a.intents.includes("video") && (k === "moment" || k === "lecture") ? 2 : wanted.has(k) ? 1.15 : 1);
    const ordered = [...groups.entries()].sort((x, y) => y[1][0].score * lift(y[0]) - x[1][0].score * lift(x[0]) || KINDS.indexOf(x[0]) - KINDS.indexOf(y[0]));
    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const show = (t: string) => t.split(" ").map((w) => this.surface.get(w) ?? w).join(" ");
    return {
      q,
      terms: a.terms.map(show),
      fixes: a.fixes,
      expanded: a.expanded.slice(0, 12).map(show),
      natural: isNaturalQuery(q),
      intents: a.intents,
      weak: top < WEAK && !a.askOnly,
      groups: ordered.map(([kind, hits]) => ({ kind, hits })),
      total: ordered.reduce((n, [, h]) => n + h.length, 0),
      ms: Math.round((t1 - t0) * 10) / 10,
      built: this.built,
      candidates: this.candidates(ranked, a.named),
    };
  }
}
