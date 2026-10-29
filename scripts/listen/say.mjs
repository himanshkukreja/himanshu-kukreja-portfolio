// How the narrator says an article's text: the lecture narrator's respellings (SAY_AS / speakable in
// scripts/lecture/export.mjs, read from that file so both voices stay in step), after a pass for
// what articles have and lecture scripts don't: arrows, maths symbols, units glued to numbers,
// "e.g.", code-ish words.
import fs from "fs";
import path from "path";

const HERE = path.dirname(new URL(import.meta.url).pathname);

/**
 * export.mjs is a script (it runs on import), so its respelling block is lifted out of the source:
 * everything from `const SAY_AS =` to the end of the `speakable` expression.
 */
function loadSpeakable() {
  const src = fs.readFileSync(path.join(HERE, "../lecture/export.mjs"), "utf8").split("\n");
  const start = src.findIndex((l) => /^const SAY_AS = /.test(l));
  const sp = src.findIndex((l) => /^const speakable = /.test(l));
  if (start < 0 || sp < start) throw new Error("scripts/lecture/export.mjs: SAY_AS / speakable not found (export them and import here instead)");
  let end = sp + 1;
  while (end < src.length && (src[end] === "" || /^\s/.test(src[end]))) end++;
  const block = src.slice(start, end).join("\n");
  const make = new Function(`${block}\nreturn { speakable, SAY_AS };`);
  return make();
}

export const { speakable, SAY_AS } = loadSpeakable();

const UNITS = { ms: "milliseconds", µs: "microseconds", us: "microseconds", ns: "nanoseconds", Gbps: "gigabits per second", Mbps: "megabits per second", Kbps: "kilobits per second", Tbps: "terabits per second" };
const PER = { s: "second", sec: "second", second: "second", min: "minute", minute: "minute", h: "hour", hr: "hour", hour: "hour", day: "day", d: "day", month: "month", mo: "month", year: "year", yr: "year", user: "user", req: "request", request: "request", node: "node", shard: "shard", key: "key", core: "core", msg: "message", message: "message" };

/** article text → what Kokoro is given (one block) */
export function sayArticle(text, { heading = false } = {}) {
  let t = (heading ? text.replace(/^(?:\d+(?:\.\d+)+\.?|\d+\.)\s+(?=\D)/, "") : text)
    // emoji and pictographs aren't read
    .replace(/[\p{Extended_Pictographic}️‍]/gu, "")
    .replace(/\be\.g\.,?/gi, "for example,")
    .replace(/\bi\.e\.,?/gi, "that is,")
    .replace(/\betc\./gi, "and so on")
    .replace(/\bvs\.?(?=\s)/gi, "versus")
    .replace(/\bw\/o\b/gi, "without")
    .replace(/\breq\/s(ec)?\b/gi, "requests per second")
    .replace(/\breqs\b/gi, "requests")
    // "10,000/s", "queries/sec", "GB/day": per
    .replace(/(\w)\/(s|sec|second|min|minute|h|hr|hour|day|d|month|mo|year|yr|user|req|request|node|shard|key|core|msg|message)\b/gi, (m, a, u) => `${a} per ${PER[u.toLowerCase()] ?? u}`)
    // units glued to numbers: "5GB", "200ms", "10Gbps" ("5GB" → "5 GB" → SAY_AS reads gigabytes)
    .replace(/(\d)(KB|MB|GB|TB|PB)\b/g, "$1 $2")
    .replace(/(\d)\s?(ms|µs|us|ns|Gbps|Mbps|Kbps|Tbps)\b/g, (m, n, u) => `${n} ${UNITS[u]}`)
    // "60s", "0.5s" (not "1990s", "100s of")
    .replace(/\b(\d{1,3}(?:\.\d+)?)s\b(?!\s+of\b)(?!')/g, "$1 seconds")
    .replace(/(\d)K\b/g, "$1 thousand")
    .replace(/(\d)M\b/g, "$1 million")
    .replace(/(\d)B\b/g, "$1 billion")
    .replace(/(\d) s(?=[\s,.;:)]|$)/g, "$1 seconds")
    .replace(/\bEB\b/g, "exabytes")
    .replace(/(\d)\s?[x×](?!\w)/g, "$1 times")
    .replace(/\s×\s/g, " times ")
    .replace(/\s÷\s/g, " divided by ")
    .replace(/\s\+\s/g, " plus ")
    .replace(/\s[-−]\s(?=\d)/g, " minus ")
    .replace(/\s=\s/g, " equals ")
    .replace(/(\w)=(\w)/g, "$1 equals $2")
    .replace(/[≈~]\s?(?=[\d₹$])/g, "about ")
    .replace(/≈/g, " about ")
    .replace(/±\s?/g, "plus or minus ")
    .replace(/≤\s?/g, "at most ")
    .replace(/≥\s?/g, "at least ")
    .replace(/(^|\s)<\s?(?=\d)/g, "$1under ")
    .replace(/(^|\s)>\s?(?=\d)/g, "$1over ")
    .replace(/(\d)\s?[–-]\s?(\d)/g, "$1 to $2")
    .replace(/\s?[→⇒⟶]\s?/g, ", then ")
    .replace(/\s?[←⇐]\s?/g, ", from ")
    .replace(/\s?↔\s?/g, " and ")
    .replace(/\s?[—]\s?/g, ", ")
    .replace(/#(\d)/g, "number $1")
    .replace(/\s&\s/g, " and ")
    .replace(/[✓✔]/g, "")
    .replace(/[✗✘❌]/g, "")
    // code-ish words: get() → get, cache.get → cache dot get, snake_case → snake case
    .replace(/(\w)\(\)/g, "$1")
    .replace(/\b([a-z][\w]*)\.([a-z][\w]*)\b/g, "$1 dot $2")
    .replace(/[*`|]/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  t = speakable(t)
    .replace(/(\w)_(?=\w)/g, "$1 ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\b(about|over|under)(\s+about)+\b/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
  // headings and list items often have no full stop: give each block a sentence end
  if (!/[.!?…:;"”')]$/.test(t)) t += ".";
  return t;
}
