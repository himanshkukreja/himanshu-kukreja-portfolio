/**
 * Text handling for smart search: one tokenizer and one light stemmer for the index and the query, so
 * "hashing" finds "hash", "caches" finds "cache" and "partitioned" finds "partition". Pure.
 */

/**
 * Words that carry no topic. Two lists: English glue, and the way people ask ("how do I", "explain",
 * "what should I study"), so "how do I stop my cache from melting at midnight" searches cache, melt,
 * midnight. Intent words (video, interview, practice) are read before they are dropped (see intents).
 */
const GLUE =
  "a an the and or but nor of to in on at for from by with without into onto over under about above below between through during before after as is are was were be been being am do does did done doing have has had having it its it's this that these those there here then than so such very too also just only not no yes if else when where which who whom whose what why how can could should would will shall may might must i me my mine we us our ours you your yours he him his she her they them their theirs one ones any some all each every both few more most other same own again further s t don't isn't aren't wasn't weren't won't can't couldn't shouldn't i'm i've i'd i'll let's im ive ill dont doesnt didnt isnt arent wasnt cant couldnt shouldnt wont whats hows wheres whos lets thats theres youre get got gets getting make makes made making use uses used using way ways thing things something anything everything lot lots really actually basically kind sort like etc vs versus via per";
const ASKING =
  "new keep keeps kept explain explained explaining explanation teach teaches teaching tell show shows showing learn learning learnt understand understanding study studying studied revise revising prepare preparing prep help helps need needs needed want wants wanted know knowing please pls plz give gives me good best great better recommend recommended suggest start started starting begin beginner beginners basics basic intro introduction overview simple simply easy quick quickly short brief briefly minutes minute min mins hour hours today tomorrow week weeks next upcoming soon watch watching video videos lecture lectures resource resources material materials course lesson lessons topic topics concept concepts mean means meaning definition define difference differ different compare comparison work works working happen happens happening deal handle handling avoid avoiding stop stopping prevent preventing fix fixing solve solving problem problems issue issues question questions interview interviews interviewing round rounds cracking crack ace system systems design designing designs";

export const STOP = new Set([...GLUE.split(/\s+/), ...ASKING.split(/\s+/)]);
/** English glue only: what synonym expansions drop ("interview problem" keeps both words) */
export const GLUE_WORDS = new Set(GLUE.split(/\s+/));

/** Words that start a question (a natural-language ask, not a keyword search). */
const QUESTION_START = /^(how|what|why|when|where|which|who|should|can|could|would|is|are|do|does|did|explain|teach|help|tell|show|give|i|i'm|im|my|we|our|suggest|recommend|best|walk)\b/;

export const isNaturalQuery = (q: string): boolean => {
  const t = q.trim().toLowerCase();
  if (!t) return false;
  if (t.includes("?")) return true;
  const words = t.split(/\s+/).filter(Boolean);
  return words.length >= 5 || (words.length >= 3 && QUESTION_START.test(t));
};

/** Lowercase, apostrophes folded, everything else that isn't a letter or digit a space. */
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The query as the per-query caches key it: normalized, words in order, capped. */
export const queryKey = (q: string) => normalize(q).split(" ").filter(Boolean).slice(0, 40).join(" ").slice(0, 300);

/**
 * A light stemmer (not Porter: predictable beats clever here). Plurals, -ing, -ed and a final -e go,
 * so cache/caches/caching/cached → "cach", shard/sharding/sharded → "shard", queue/queues → "queu".
 * Short words and numbers are left alone.
 */
export function stem(w: string): string {
  if (w.length <= 3 || /^\d/.test(w)) return w;
  let s = w;
  if (s.endsWith("ies") && s.length > 4) s = `${s.slice(0, -3)}y`;
  else if (s.endsWith("sses")) s = s.slice(0, -2);
  else if (s.endsWith("es") && /(?:ch|sh|x|z|ss)es$/.test(s)) s = s.slice(0, -2);
  else if (s.endsWith("s") && !s.endsWith("ss") && !s.endsWith("us") && !s.endsWith("is") && s.length > 3) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ed") && !s.endsWith("eed")) s = s.slice(0, -2);
  // running → run, sharded → shard (a doubled final consonant after a cut)
  if (s !== w && s.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(s) && !/(ll|ss|zz)$/.test(s)) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

/** Index tokens: every word (stop words too: they cost nothing and keep phrases findable), stemmed. */
export const tokens = (s: string): string[] => {
  const n = normalize(s);
  if (!n) return [];
  return n.split(" ").map(stem);
};

/** Query tokens: stop words dropped (unless nothing would be left), stemmed. */
export function queryTokens(q: string): { raw: string[]; terms: string[] } {
  const raw = normalize(q).split(" ").filter(Boolean);
  const kept = raw.filter((w) => !STOP.has(w) && w.length > 1);
  const use = kept.length ? kept : raw.filter((w) => w.length > 1);
  return { raw, terms: [...new Set(use.map(stem))] };
}

/** Edit distance (a swap of neighbours counts as one edit), with an early exit once it passes `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // a swap of two neighbours counts as one edit ("kafak" → "kafka")
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

/** Plain text from markdown: code, directives, links, emphasis and tables reduced to their words. */
export function mdPlain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/^[ \t]*:{2,}[^\n]*$/gm, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\s)[*_]([^*_\n]+)[*_]/g, "$1$2")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/^[\s:-]+$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Text from HTML (sheets, war stories): tags out, entities decoded. */
export const htmlPlain = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** The first sentence or two, up to `max` characters, cut at a word. */
export function lead(text: string, max = 180): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const sentence = t.slice(0, max + 1).match(/^[\s\S]*?[.!?](?=\s|$)/);
  if (sentence && sentence[0].length >= max * 0.45) return sentence[0];
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,;:\s-]+$/, "")}…`;
}
