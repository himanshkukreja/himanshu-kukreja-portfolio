/**
 * Instant clean-up of dictated text, in the browser (no network): what the speech engine hands back is lower-case,
 * unpunctuated and full of "um"s. Fillers and stutters go, spoken punctuation ("comma", "question mark") becomes
 * marks, sentences get capitals and an end mark (a question mark when the sentence asks), "i" becomes "I", and the
 * course's terms get their usual spelling (API, Redis, Kafka, p99). The words themselves stay: this never rewrites
 * grammar (components/learn/chat/polishDictation.ts does that afterwards, on-device or with Haiku).
 */

const FILLERS = /\b(?:u+m+|u+h+m*|e+r+m+|e+h+|a+h+|h+m+|mm+)\b[,.]?\s*/gi;

const SPOKEN_MARKS: [RegExp, string][] = [
  // not "period": "grace period", "retention period" are course words
  [/\s*\bfull stop\b/gi, "."],
  [/\s*\bcomma\b/gi, ","],
  [/\s*\bquestion mark\b/gi, "?"],
  [/\s*\bexclamation (?:mark|point)\b/gi, "!"],
  [/\s*\b(?:new line|newline)\b\s*/gi, "\n"],
];

/** spellings for terms a speech engine lower-cases or splits (whole words, case-insensitive) */
const TERMS: [RegExp, string][] = [
  ...["api", "apis", "sql", "nosql", "http", "https", "tcp", "udp", "dns", "cdn", "url", "urls", "json", "rpc", "grpc", "aws", "gcp", "cpu", "gpu", "ram", "ssd", "ttl", "lru", "lfu", "acid", "sla", "slo", "sli", "qps", "rps", "id", "ids", "uuid", "jwt", "oauth", "s3", "ec2", "vpc", "llm", "llms", "rag", "crdt", "crdts", "wal", "lsm", "cqrs", "dlq", "ui"].map(
    (t): [RegExp, string] => [new RegExp(`\\b${t}\\b`, "gi"), t === "apis" ? "APIs" : t === "urls" ? "URLs" : t === "ids" ? "IDs" : t === "llms" ? "LLMs" : t === "crdts" ? "CRDTs" : t === "nosql" ? "NoSQL" : t === "grpc" ? "gRPC" : t === "oauth" ? "OAuth" : t === "ec2" ? "EC2" : t.toUpperCase()],
  ),
  [/\b(?:redis|radis)\b/gi, "Redis"],
  [/\bkafka\b/gi, "Kafka"],
  [/\bpostgres(?:ql)?\b/gi, "Postgres"],
  [/\bmysql\b/gi, "MySQL"],
  [/\bmongo ?db\b/gi, "MongoDB"],
  [/\bcassandra\b/gi, "Cassandra"],
  [/\bdynamo ?db\b/gi, "DynamoDB"],
  [/\belastic ?search\b/gi, "Elasticsearch"],
  [/\bkubernetes\b/gi, "Kubernetes"],
  [/\bdocker\b/gi, "Docker"],
  [/\bnginx\b/gi, "nginx"],
  [/\bzoo ?keeper\b/gi, "ZooKeeper"],
  [/\bweb ?sockets?\b/gi, "WebSocket"],
  [/\bjava ?script\b/gi, "JavaScript"],
  [/\btype ?script\b/gi, "TypeScript"],
  [/\bpython\b/gi, "Python"],
  [/\braft\b/gi, "Raft"],
  [/\bpaxos\b/gi, "Paxos"],
  [/\bp ?(50|90|95|99|999)\b/gi, "p$1"],
];

/** "the the" → "the" (a stutter, not "had had" or "that that", which are real English) */
const STUTTER = /\b(?!had\b|that\b)(\w+)(?:\s+\1\b)+/gi;
const QUESTION_START = /^(?:(?:so|and|but|okay|ok|well|basically|now|then|also|like),?\s+)*(?:what|why|how|when|where|which|who|whom|whose|is|are|was|were|do|does|did|can|could|should|would|will|isn't|aren't|doesn't|don't|didn't|can't|won't|wouldn't|shouldn't)\b/i;

/** Clean one dictated span; `endMark` false leaves the last sentence open (more speech may follow). */
export function tidySpeech(raw: string, { endMark = true }: { endMark?: boolean } = {}): string {
  let s = ` ${raw} `.replace(/\s+/g, " ");
  s = s.replace(FILLERS, "");
  // "like, you know," as pure filler only between commas / pauses would need prosody: left alone
  for (const [re, mark] of SPOKEN_MARKS) s = s.replace(re, mark);
  s = s.replace(STUTTER, "$1");
  for (const [re, term] of TERMS) s = s.replace(re, term);
  s = s.replace(/\bi(?=\s|'|$)/g, "I").replace(/\bi'(m|d|ll|ve)\b/gi, "I'$1");
  s = s.replace(/\s+([,.?!])/g, "$1").replace(/([,.?!])(?=[^\s\d,.?!])/g, "$1 ").replace(/,+/g, ",").replace(/^[\s,]+/, "").trim();
  // sentences: capital first letter, an end mark ("?" for questions) where the speaker didn't say one
  const lines = s.split("\n");
  return lines
    .map((line, li) => {
      const sentences = line.split(/(?<=[.?!])\s+/).map((x) => x.trim()).filter(Boolean);
      return sentences
        .map((t, i) => {
          t = t.charAt(0).toUpperCase() + t.slice(1);
          const open = !endMark && li === lines.length - 1 && i === sentences.length - 1;
          if (open) return t;
          if (/,$/.test(t)) t = t.slice(0, -1);
          return /[.?!:;]$/.test(t) ? t : t + (QUESTION_START.test(t) ? "?" : ".");
        })
        .join(" ");
    })
    .join("\n")
    .trim();
}
