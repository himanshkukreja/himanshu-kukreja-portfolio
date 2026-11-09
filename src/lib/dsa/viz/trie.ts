/**
 * The trie model and its operations as step-by-step scripts (the "trie" view). A trie stores words letter by letter: every node
 * is a prefix, every edge a letter, and a node marked as an end closes a stored word. A node is named by its prefix ("" is the
 * root), so the model is just the list of words and the picture is derived from them. Every operation is a pure function
 * (trie, word) -> { script, trie after }.
 *
 * The cost counter counts letters read or written (one step down one edge). Plain-word narration, one sentence a step, for a
 * first-time learner (Academy Part 2).
 */
import type { Frame, Script, TrieState } from "./types";

export type TrieModel = { words: string[] };
export type TrieOp = { op: "insert"; word: string } | { op: "search"; word: string } | { op: "starts_with"; word: string };
export type TrieOpName = TrieOp["op"];
export const TRIE_OPS: TrieOpName[] = ["insert", "search", "starts_with"];
export const TRIE_OP_LABEL: Record<TrieOpName, string> = { insert: "Insert", search: "Search for", starts_with: "Starts with" };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** A trie from words (repeats and empty words skipped). */
export const makeTrie = (words: string[]): TrieModel => ({ words: [...new Set(words.filter(Boolean))].sort() });

/** Every node of a trie as its prefix (the root is ""), alphabetical, for the words and an optional half-inserted word. */
export function prefixesOf(words: string[], grow = ""): string[] {
  const all = new Set<string>([""]);
  for (const w of [...words, grow]) for (let i = 1; i <= w.length; i++) all.add(w.slice(0, i));
  return [...all].sort();
}

export const trieText = (m: TrieModel) => `trie of ${plural(m.words.length, "word")}, ${plural(prefixesOf(m.words).length - 1, "node")}`;

export function snap(m: TrieModel, over: Partial<TrieState> = {}): TrieState {
  return { words: m.words, grow: "", walk: "", current: null, fresh: [], lit: [], endAt: null, out: null, ...over };
}

const script = (title: string, frames: Frame<TrieState>[], result?: string): Script<TrieState> => ({ view: "trie", title, costUnit: "letters", frames, result });

export function stillScript(m: TrieModel, note: string): Script<TrieState> {
  return { view: "trie", title: "Your trie", costUnit: "letters", frames: [{ state: snap(m), note, cost: 0 }], result: trieText(m) };
}

type Result = { script: Script<TrieState>; trie: TrieModel };
type Opts = { predict?: boolean };

export function insertWord(m0: TrieModel, word: string): Result {
  const f: Frame<TrieState>[] = [];
  const have = new Set(prefixesOf(m0.words));
  const isNew = !m0.words.includes(word);
  const fresh: string[] = [];
  f.push({ state: snap(m0, { current: "" }), note: `Insert "${word}". Start at the root, and walk one letter at a time.`, cost: 0 });
  for (let i = 0; i < word.length; i++) {
    const next = word.slice(0, i + 1);
    const ch = word[i];
    if (have.has(next)) {
      f.push({ state: snap(m0, { walk: next, current: next, fresh: [...fresh] }), note: `The edge "${ch}" is already there, so follow it. The letters "${next}" are shared with a word stored earlier.`, cost: i + 1 });
    } else {
      fresh.push(next);
      f.push({ state: snap(m0, { grow: next, walk: next, current: next, fresh: [...fresh] }), note: `There is no edge "${ch}" here, so make a new node for it and walk onto it.`, cost: i + 1 });
    }
  }
  const m = makeTrie([...m0.words, word]);
  f.push({
    state: snap(m, { walk: word, current: word, endAt: word, fresh, out: isNew ? "end marked" : "already stored" }),
    note: isNew ? `The last letter is reached, so mark this node as the end of a word. Without the mark, "${word}" would only be the start of longer words.` : `"${word}" was already stored, with its end marked, so nothing changes.`,
    cost: word.length,
  });
  return { script: script(`Insert "${word}"`, f, isNew ? `inserted ${word}` : "already stored"), trie: m };
}

/** Walk `word` from the root: how many letters match edges, and the node the walk stops on. */
function walkOf(m: TrieModel, word: string): { reached: number; node: string } {
  const have = new Set(prefixesOf(m.words));
  let i = 0;
  while (i < word.length && have.has(word.slice(0, i + 1))) i++;
  return { reached: i, node: word.slice(0, i) };
}

export function searchWord(m: TrieModel, word: string, opts: Opts = {}): Result {
  const f: Frame<TrieState>[] = [];
  const { reached, node } = walkOf(m, word);
  const full = reached === word.length;
  const isWord = full && m.words.includes(word);
  const why = isWord ? "The walk ends on a node marked as a word end." : full ? "The walk works, but the last node is not marked as a word end: it is only a prefix." : "The edge for one of its letters is missing.";
  f.push({
    state: snap(m, { current: "" }),
    note: `Is "${word}" stored? Walk its letters from the root.`,
    cost: 0,
    ask: opts.predict ? { prompt: `Is "${word}" a stored word?`, choices: [{ label: "Yes", correct: isWord, why }, { label: "No", correct: !isWord, why }] } : null,
  });
  for (let i = 0; i < reached; i++) f.push({ state: snap(m, { walk: word.slice(0, i + 1), current: word.slice(0, i + 1) }), note: `Follow the edge "${word[i]}".`, cost: i + 1 });
  if (!full) {
    f.push({ state: snap(m, { walk: node, current: node, out: "no" }), note: `There is no edge "${word[reached]}" here, so "${word}" is not stored. The walk stopped after ${plural(reached, "letter")}.`, cost: reached + 1 });
    return { script: script(`Search for "${word}"`, f, "no"), trie: m };
  }
  f.push({
    state: snap(m, { walk: node, current: node, endAt: isWord ? node : null, out: isWord ? "yes" : "no" }),
    note: isWord ? `The last node is marked as a word end, so "${word}" is stored. The cost is its ${plural(word.length, "letter")}, however many words are stored.` : `Every letter matched, but this node is not marked as a word end. "${word}" is only the start of longer words, so it is not stored.`,
    cost: word.length,
  });
  return { script: script(`Search for "${word}"`, f, isWord ? "yes" : "no"), trie: m };
}

export function startsWith(m: TrieModel, prefix: string, opts: Opts = {}): Result {
  const f: Frame<TrieState>[] = [];
  const { reached, node } = walkOf(m, prefix);
  const full = reached === prefix.length;
  const under = full ? prefixesOf(m.words).filter((p) => p.startsWith(prefix) && p !== prefix) : [];
  const hits = m.words.filter((w) => w.startsWith(prefix));
  const why = full ? "The walk reaches a node, so some word goes through it." : "An edge for one of its letters is missing.";
  f.push({
    state: snap(m, { current: "" }),
    note: `Does any stored word start with "${prefix}"? Walk the letters of the prefix.`,
    cost: 0,
    ask: opts.predict ? { prompt: `Does any word start with "${prefix}"?`, choices: [{ label: "Yes", correct: full, why }, { label: "No", correct: !full, why }] } : null,
  });
  for (let i = 0; i < reached; i++) f.push({ state: snap(m, { walk: prefix.slice(0, i + 1), current: prefix.slice(0, i + 1) }), note: `Follow the edge "${prefix[i]}".`, cost: i + 1 });
  if (!full) {
    f.push({ state: snap(m, { walk: node, current: node, out: "no" }), note: `There is no edge "${prefix[reached]}" here, so no stored word starts with "${prefix}".`, cost: reached + 1 });
    return { script: script(`Starts with "${prefix}"?`, f, "no"), trie: m };
  }
  f.push({
    state: snap(m, { walk: node, current: node, lit: under, out: "yes" }),
    note: `The whole prefix was walked, so yes. The cost is ${plural(prefix.length, "letter")}, and it does not depend on how many words are stored.${hits.length ? ` Every word below this node starts with it: ${hits.join(", ")}.` : ""}`,
    cost: prefix.length,
  });
  return { script: script(`Starts with "${prefix}"?`, f, "yes"), trie: m };
}

/** The word-list-and-trie picture (a demo with view: memory): shared prefixes are stored once. */
export function trieMemoryPicture(m: TrieModel): Script<TrieState> {
  const letters = m.words.reduce((a, w) => a + w.length, 0);
  const nodes = prefixesOf(m.words).length - 1;
  const f: Frame<TrieState>[] = [];
  f.push({ state: snap({ words: [] }), note: `A plain list of ${plural(m.words.length, "word")} stores every letter of every word: ${plural(letters, "letter")} in all.`, cost: 0 });
  f.push({ state: snap(m), note: `A trie stores the same words as one tree. A letter shared by several words is stored once, so there are ${plural(nodes, "node")}.`, cost: 0 });
  f.push({ state: snap(m, { out: `${nodes} nodes vs ${letters} letters` }), note: `${plural(nodes, "node")} in the trie against ${plural(letters, "letter")} in the list. The more words share a start, the more a trie saves. And a lookup reads only the letters of the word asked for.`, cost: 0 });
  return { view: "trie", title: "A trie and a plain list", costUnit: "letters", frames: f, result: `${nodes} nodes or ${letters} letters` };
}

export function runTrieOp(m: TrieModel, op: TrieOp, opts: Opts = {}): Result {
  switch (op.op) {
    case "insert":
      return insertWord(m, op.word);
    case "search":
      return searchWord(m, op.word, opts);
    case "starts_with":
      return startsWith(m, op.word, opts);
  }
}
