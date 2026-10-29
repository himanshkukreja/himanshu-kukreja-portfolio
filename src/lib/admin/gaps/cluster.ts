/**
 * Grouping asks into topics for the content-gap radar. Pure.
 *
 * A query's topic is, in order:
 *   1. words the course has never used ("new-words"): the strongest gap signal, kept apart so a known word
 *      next to them ("graphql federation caching") doesn't hide them inside "caching";
 *   2. the longest phrase it shares with the concept catalogue (term + aliases → the concept id) or the smart
 *      search synonym map (a GROUPS row → its head word; an ASKS phrase → the group it points at), concepts
 *      first on a tie;
 *   3. otherwise its content words, stemmed and sorted ("words"), so word order and plurals don't split it.
 * Tokens come from smart search's own tokenizer and stemmer, so "sharded"/"sharding"/"shards" agree.
 * `isNew(word)` says whether the course has never used a word (the report asks the search index); without
 * it, step 1 is skipped.
 */
import { STOP, normalize, stem, tokens } from "@/lib/search/smart/text";
import type { GapEvent, GapTopic } from "./types";

type Entry = { toks: string[]; key: string; label: string; via: "concept" | "synonym"; conceptId: string | null };
export type Vocab = Map<string, Entry[]>;
export type ConceptLite = { id: string; term: string; aliases: string[] };

const phraseToks = (p: string) => tokens(p);
const contentOf = (toks: string[]) => toks.filter((t) => !STOP.has(t) && t.length > 1);

export function buildVocab(groups: string[][], asks: Record<string, string[]>, concepts: ConceptLite[]): Vocab {
  const vocab: Vocab = new Map();
  const byPhrase = new Map<string, Entry>();
  const add = (phrase: string, e: Omit<Entry, "toks">) => {
    const toks = phraseToks(phrase);
    if (!toks.length || !contentOf(toks).length) return;
    const k = toks.join(" ");
    // first owner wins (concepts are added first)
    if (byPhrase.has(k)) return;
    const entry = { ...e, toks };
    byPhrase.set(k, entry);
    const list = vocab.get(toks[0]) ?? [];
    list.push(entry);
    vocab.set(toks[0], list);
  };
  for (const c of concepts) {
    const e = { key: `concept:${c.id}`, label: c.term, via: "concept" as const, conceptId: c.id };
    for (const p of [c.term, ...c.aliases]) if (p && p.trim().length > 2) add(p.toLowerCase(), e);
  }
  for (const g of groups) {
    // a synonym group that names a concept joins that concept's topic
    const owner = g.map((p) => byPhrase.get(phraseToks(p).join(" "))).find((x) => x?.via === "concept");
    const e = owner ? { key: owner.key, label: owner.label, via: owner.via, conceptId: owner.conceptId } : { key: `syn:${g[0]}`, label: g[0], via: "synonym" as const, conceptId: null };
    for (const p of g) add(p, e);
  }
  for (const [phrase, targets] of Object.entries(asks)) {
    const to = targets.map((t) => byPhrase.get(phraseToks(t).join(" "))).find(Boolean);
    const e = to ? { key: to.key, label: to.label, via: to.via, conceptId: to.conceptId } : { key: `syn:${targets[0]}`, label: targets[0], via: "synonym" as const, conceptId: null };
    add(phrase, e);
  }
  return vocab;
}

export type TopicOf = { key: string; label: string; via: GapTopic["via"]; conceptId: string | null };

/** The topic of one normalised query (null when it has no words left). */
export function topicOf(q: string, vocab: Vocab, isNew?: (word: string) => boolean): TopicOf | null {
  const raw = normalize(q).split(" ").filter(Boolean);
  if (!raw.length) return null;
  const toks = raw.map(stem);
  let best: { e: Entry; at: number; len: number } | null = null;
  for (let i = 0; i < toks.length; i++) {
    for (const e of vocab.get(toks[i]) ?? []) {
      if (!e.toks.every((t, k) => toks[i + k] === t)) continue;
      const len = contentOf(e.toks).length;
      if (!best || len > best.len || (len === best.len && e.via === "concept" && best.e.via !== "concept")) best = { e, at: i, len };
    }
  }
  const covered = new Set<number>();
  if (best) for (let k = 0; k < best.e.toks.length; k++) covered.add(best.at + k);
  const content = raw.map((w, i) => ({ w, s: toks[i], i })).filter((x) => !STOP.has(x.w) && x.w.length > 1 && !/^\d+$/.test(x.w));

  if (isNew) {
    const fresh = content.filter((x) => !covered.has(x.i) && x.w.length > 2 && isNew(x.w));
    if (fresh.length) {
      const words = [...new Set(fresh.map((x) => x.w))];
      const stems = [...new Set(fresh.map((x) => x.s))].sort().slice(0, 4);
      return { key: `new:${stems.join(" ")}`, label: best ? `${words.join(" ")} (+ ${best.e.label})` : words.join(" "), via: "new-words", conceptId: null };
    }
  }
  if (best) return { key: best.e.key, label: best.e.label, via: best.e.via, conceptId: best.e.conceptId };
  if (!content.length) return null;
  const stems = [...new Set(content.map((x) => x.s))].sort().slice(0, 5);
  return { key: `w:${stems.join(" ")}`, label: content.map((x) => x.w).join(" "), via: "words", conceptId: null };
}

/** A topic with its asks, before the report adds closest material and a verdict. */
export type Cluster = TopicOf & {
  events: GapEvent[];
  users: Set<string>;
  anon: number;
  queries: Map<string, number>;
  top: Map<string, number>;
};

export function clusterEvents(events: GapEvent[], vocab: Vocab, isNew?: (word: string) => boolean): { clusters: Cluster[]; offTopic: number } {
  const byKey = new Map<string, Cluster>();
  const memo = new Map<string, TopicOf | null>();
  let offTopic = 0;
  for (const ev of events) {
    if (ev.scope === "off_topic") {
      offTopic++;
      continue;
    }
    if (!memo.has(ev.q)) memo.set(ev.q, topicOf(ev.q, vocab, isNew));
    const t = memo.get(ev.q);
    if (!t) continue;
    let c = byKey.get(t.key);
    if (!c) byKey.set(t.key, (c = { ...t, events: [], users: new Set(), anon: 0, queries: new Map(), top: new Map() }));
    c.events.push(ev);
    if (ev.user) c.users.add(ev.user);
    else c.anon++;
    c.queries.set(ev.q, (c.queries.get(ev.q) ?? 0) + 1);
    ev.top.forEach((id, i) => c.top.set(id, (c.top.get(id) ?? 0) + (5 - Math.min(i, 4))));
  }
  // a "words" topic is labelled by its most asked wording
  for (const c of byKey.values()) if (c.via === "words") c.label = [...c.queries].sort((a, b) => b[1] - a[1])[0][0];
  return { clusters: [...byKey.values()], offTopic };
}
