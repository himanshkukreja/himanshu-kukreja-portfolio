/**
 * Smart model routing for the three chat features (course-chat, dsa-chat, dsa-tutor), owner-approved 12 Nov 2026:
 * Haiku 5.5 answers by default; a "hard" turn goes to Sonnet 5.5. Hard is decided by this cheap deterministic classifier
 * (no model call), in this order:
 *   down      the learner thumbed down the previous answer in this chat (the route checks the rating server side)
 *   deeper    an explicit "go deeper" (the "Go deeper" button sends those words, or the learner writes them); the
 *             "detailed" answer style is a standing preference, not a hard turn, so it stays on Haiku
 *   debug     debugging with failing code of DEBUG_MIN_LINES lines or more (the problem room's code with a failing
 *             Run/Submit or the debug mode; a code block in a chat message with error words)
 *   tradeoff  a multi-step design trade-off: comparison words, several design terms, and more than one step or
 *             constraint, in a message of some length
 * Never hard: a mock interview turn, the answer to a quick check, an off-topic turn. Whether a hard turn really gets
 * Sonnet is the quota's call (lib/ai/chat/quota.ts admitChat): only in the governor's green mode, only while the
 * feature runs on its default Haiku 5.5, and within the learner's daily Sonnet turns (ROUTING in features.ts).
 * Pure (no imports): the routes, the eval and the tests share it.
 */

export type RouteReason = "down" | "deeper" | "debug" | "tradeoff";
export type RouteFeature = "course-chat" | "dsa-chat" | "dsa-tutor";
export type RouteInput = {
  feature: RouteFeature;
  /** the learner's newest message */
  text: string;
  /** the previous answer in this chat was thumbed down (verified) */
  prevDown?: boolean;
  /** the problem room: the editor's code, the tutor mode and the last Run/Submit verdict */
  code?: string | null;
  mode?: string | null;
  verdict?: string | null;
  /** a mock interview turn or a quick-check answer: never routed */
  mock?: boolean;
  grading?: boolean;
};
export type RouteDecision = { hard: boolean; reason: RouteReason | null; signals: { words: number; codeLines: number; tradeoff: number; terms: number; steps: number } };

/** failing code of at least this many lines makes a debugging turn hard */
export const DEBUG_MIN_LINES = 25;

const DEEPER = /\b(?:go(?:ing)?|dig|dive)\s+deeper\b|\bin\s+(?:more\s+|greater\s+|full\s+)?(?:depth|detail)\b|\bdeep[- ]?dive\b|\bmore\s+detail(?:ed)?\b|\belaborate\b|\bexplain\s+(?:it|this|that)\s+(?:in\s+)?(?:more|further)\s+(?:detail|depth)\b|\bexplain\s+(?:it\s+|this\s+|that\s+)?further\b|\bunder\s+the\s+hood\b/i;
const FAILING = /\b\w*(?:Error|Exception)\b|\b(?:error|errors|exception|traceback|stack\s*trace|fails?|failing|failed|wrong\s+answer|bug|buggy|doesn'?t\s+work|not\s+working|broken|crash(?:es|ing)?|TLE|time\s+limit|segfault|stack\s*overflow|null\s*pointer|NPE|undefined|NaN|off[- ]by[- ]one|infinite\s+loop|WA\b|RE\b)/i;
const BAD_VERDICTS = new Set(["WA", "TLE", "RE", "CE", "MLE", "OLE", "ERR"]);

const TRADEOFF: RegExp[] = [
  /\btrade[- ]?offs?\b/i,
  /\bvs\.?\b|\bversus\b/i,
  /\bcompar(?:e|ed|ing|ison)\b/i,
  /\bpros\s+and\s+cons\b|\bdownsides?\b|\bdrawbacks?\b/i,
  /\bwhich\s+(?:one\s+)?(?:is|would\s+be|should|to)\b/i,
  /\bwhen\s+(?:should|would|do)\s+(?:i|you|we)\s+(?:use|choose|pick|prefer)\b/i,
  /\b(?:choose|pick|decide)\s+between\b|\bor\s+should\s+(?:i|we)\b|\binstead\s+of\b/i,
  /\bat\s+(?:this\s+|that\s+|our\s+)?scale\b|\bbottlenecks?\b/i,
];
const TERMS =
  /\b(?:cach(?:e|es|ing)|shard(?:s|ing)?|partition(?:s|ing)?|replica(?:s|tion)?|consisten(?:t|cy)|availability|latency|throughput|queues?|kafka|database|sql|nosql|postgres(?:ql)?|redis|cassandra|dynamo(?:db)?|index(?:es|ing)?|load\s+balanc(?:er|ing)|cdn|rate\s+limit(?:er|ing)?|idempoten(?:t|cy)|quorum|leader|consensus|raft|paxos|failover|microservices?|monolith|qps|rps|p99|eventual(?:ly)?|strong(?:ly)?|cap\s+theorem|pacelc|regions?|bloom\s+filter|hash(?:ing|es)?|write[- ]through|write[- ]back|cache[- ]aside|fan[- ]?out|pub[- ]?sub|websockets?|polling|batch(?:ing)?|stream(?:s|ing)?|heap|hash\s*map|trie|segment\s+tree|graph|bfs|dfs|dynamic\s+programming|\bdp\b|memoi[sz]ation|recursion|binary\s+search|sorted|sliding\s+window|two\s+pointers|complexity|o\([^)]{1,12}\)|memory|space)\b/gi;
const STEPS = /\?[^?]*\?|(?:^|\n)\s*(?:\d+[.)]|[-*])\s+\S[^\n]*\n\s*(?:\d+[.)]|[-*])\s+\S|\b(?:and\s+then|after\s+that|step\s+by\s+step|walk\s+me\s+through|end[- ]to[- ]end|from\s+scratch|what\s+happens\s+when|what\s+if)\b/i;
const CONSTRAINT = /\b\d+(?:\.\d+)?\s*(?:k|m|b|million|billion|thousand|qps|rps|tps|gb|tb|pb|mb|ms|s|seconds|users|requests|writes|reads)\b/gi;

/** code lines in a message: fenced blocks, or runs of lines that look like code */
export function codeLinesOf(text: string): number {
  let n = 0;
  for (const m of text.matchAll(/```[^\n]*\n([\s\S]*?)(?:```|$)/g)) n += m[1].split("\n").filter((l) => l.trim()).length;
  if (n) return n;
  return text.split("\n").filter((l) => /[;{}=]\s*$|^\s*(?:def|class|for|while|if|return|function|const|let|var|public|private|int|import)\b|\)\s*:\s*$/.test(l)).length;
}

export function classifyTurn(i: RouteInput): RouteDecision {
  const text = i.text || "";
  const words = text.split(/\s+/).filter(Boolean).length;
  const codeLines = i.code != null && i.code.trim() ? i.code.split("\n").filter((l) => l.trim()).length : codeLinesOf(text);
  const prose = text.replace(/```[\s\S]*?(?:```|$)/g, " ");
  const tradeoff = TRADEOFF.filter((r) => r.test(prose)).length;
  const terms = new Set([...prose.matchAll(TERMS)].map((m) => m[0].toLowerCase().replace(/\s+/g, " "))).size;
  const steps = (STEPS.test(prose) ? 1 : 0) + ([...prose.matchAll(CONSTRAINT)].length >= 2 ? 1 : 0);
  const signals = { words, codeLines, tradeoff, terms, steps };
  const no = { hard: false, reason: null, signals } as const;
  if (i.mock || i.grading) return no;
  if (i.prevDown) return { hard: true, reason: "down", signals };
  if (DEEPER.test(prose)) return { hard: true, reason: "deeper", signals };
  const failing = (i.verdict ? BAD_VERDICTS.has(i.verdict) : false) || i.mode === "debug" || FAILING.test(prose);
  if (codeLines >= DEBUG_MIN_LINES && failing) return { hard: true, reason: "debug", signals };
  if ((tradeoff >= 1 && terms >= 2 && steps >= 1 && words >= 25) || (tradeoff >= 2 && terms >= 3 && words >= 18)) return { hard: true, reason: "tradeoff", signals };
  return no;
}
