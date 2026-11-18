/**
 * DSA Practice search: the instant scorer, synonyms, filter words and typo tolerance (src/lib/dsa/search/engine.ts), the
 * rank steps (rank.ts) and the smart layer's checks (smart.ts).
 *   node --test scripts/tests/dsa-search.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) { try { return await next(s, c); } catch (e) { if (s.startsWith(".") && !/\\.\\w+$/.test(s)) return next(s + ".ts", c); throw e; } }`),
);
const { buildIndex, distance, isNatural, parseQuery, search, stem, whyText } = await import("../../src/lib/dsa/search/engine.ts");
const { instantRank, smartRank } = await import("../../src/lib/dsa/search/rank.ts");
const { buildTaxonomy, parseSmart, smartKey, smartSelection, smartSystem } = await import("../../src/lib/dsa/search/smart.ts");

const it = (id, title, o = {}) => ({ id, title, aliases: [], topics: [], tags: [], domains: [], level: "medium", lesson: "", summary: "", ...o });
const ITEMS = [
  it("window-median", "Sliding window median of viewer counts", { level: "hard", topics: ["Sliding window", "Heap"], tags: ["sliding-window-fixed"], aliases: ["Sliding Window Median", "LC 480"] }),
  it("longest-session", "Longest fresh listening session", { topics: ["Sliding window", "String"], tags: ["sliding-window-variable"], aliases: ["Longest Substring Without Repeating Characters", "LC 3"], domains: ["streaming"] }),
  it("easy-window", "Total of every window of k posts", { level: "easy", topics: ["Sliding window", "Array"], tags: ["sliding-window-fixed"] }),
  it("find-id", "Find an id in a sorted index", { level: "easy", topics: ["Binary search"], tags: ["binary-search"], aliases: ["Binary Search", "LC 704"] }),
  it("search-tree", "Is it a valid search tree", { topics: ["Tree / BST"], aliases: ["Validate Binary Search Tree", "LC 98"] }),
  it("refund-pair", "A refund pair for a total", { level: "easy", topics: ["Hash map / set", "Array"], tags: ["hashing"], aliases: ["Two Sum", "LC 1"], domains: ["payments"] }),
  it("coins", "Fewest coins for a refund", { topics: ["Dynamic programming"], tags: ["dp", "knapsack"], aliases: ["Coin Change", "LC 322"] }),
  it("climb", "Climb the pricing tiers", { level: "easy", topics: ["Dynamic programming"], tags: ["dp"], aliases: ["Climbing Stairs"] }),
  it("loop", "Detect a loop in a retry chain", { level: "easy", topics: ["Linked list", "Fast & slow", "Cycle detection"], tags: ["fast-slow"], aliases: ["Linked List Cycle"] }),
  it("kth", "Kth fastest pickup", { topics: ["Heap", "Top-K"], tags: ["top-k"], aliases: ["Kth Largest Element in an Array"] }),
  it("islands", "Count rack blocks", { topics: ["Graph", "BFS", "DFS", "Matrix / grid"], tags: ["dfs"], aliases: ["Number of Islands"] }),
  it("lru", "A config cache that evicts the least recently used entry", { topics: ["Design a structure", "Hash map / set", "Linked list"], tags: ["lru"], aliases: ["LRU Cache"] }),
];
const index = buildIndex(ITEMS);
const ids = (q, o) => search(index, q, o).map((h) => h.item.id);

/* ---------------------------------------------------------------- text helpers */

test("stem drops a plural s and keeps short words and ss/us/is endings", () => {
  assert.equal(stem("pointers"), "pointer");
  assert.equal(stem("queries"), "query");
  assert.equal(stem("class"), "class");
  assert.equal(stem("bus"), "bus");
  assert.equal(stem("dp"), "dp");
});

test("distance counts an adjacent swap as one edit and stops early", () => {
  assert.equal(distance("windw", "window", 2), 1);
  assert.equal(distance("sliding", "slidnig", 2), 1);
  assert.equal(distance("abc", "abcdef", 2), 3);
  assert.equal(distance("same", "same", 1), 0);
});

test("a sentence is 4+ words or a question", () => {
  assert.equal(isNatural("sliding window"), false);
  assert.equal(isNatural("lc 1"), false);
  assert.equal(isNatural("I want to learn sliding window"), true);
  assert.equal(isNatural("what is dp?"), true);
  assert.equal(isNatural(""), false);
});

/* ---------------------------------------------------------------- the query */

test("filter words become filters and leave the topic words", () => {
  const q = parseQuery("easy sliding window unsolved");
  assert.deepEqual(q.levels, ["easy"]);
  assert.equal(q.status, "unsolved");
  assert.deepEqual(q.terms, ["sliding", "window"]);
  assert.deepEqual(q.filterWords.map((f) => f.value), ["easy", "unsolved"]);
});

test("a level word alone is a filter, several are all kept, saved is a status", () => {
  assert.deepEqual(parseQuery("hard").levels, ["hard"]);
  assert.deepEqual(parseQuery("easy or medium dp").levels, ["easy", "medium"]);
  assert.equal(parseQuery("saved").status, "saved");
  assert.equal(parseQuery("not solved graphs").status, "unsolved");
});

test("filler words are dropped from a sentence, the topic words stay", () => {
  const q = parseQuery("I want to learn sliding window, give me medium string problems");
  assert.deepEqual(q.terms, ["sliding", "window", "string"]);
  assert.deepEqual(q.levels, ["medium"]);
  assert.equal(q.natural, true);
});

test("shorthands expand to what they stand for", () => {
  const dp = parseQuery("dp").units[0].alts.map((a) => a.tokens.join(" "));
  assert.ok(dp.includes("dynamic programming"));
  assert.ok(parseQuery("ll").units[0].alts.some((a) => a.tokens.join(" ") === "linked list"));
  assert.ok(parseQuery("pq").units[0].alts.some((a) => a.tokens.includes("heap")));
  assert.ok(parseQuery("two pointer").units[0].alts.some((a) => a.tokens.join(" ") === "two pointer"));
  assert.ok(parseQuery("hashmap").units[0].alts.some((a) => a.tokens.includes("hashing")));
});

test("a misspelt shorthand or phrase is put right", () => {
  assert.ok(parseQuery("hasmap").units[0].alts.some((a) => a.tokens.includes("hashing")));
  assert.ok(parseQuery("priorty queue").units.some((u) => u.alts.some((a) => a.tokens.includes("heap"))));
});

/* ---------------------------------------------------------------- the scorer */

test("an exact title ranks first, then a prefix, then fuzzy", () => {
  assert.equal(ids("Fewest coins for a refund")[0], "coins");
  assert.equal(ids("fewest coins")[0], "coins");
  assert.equal(ids("fewest coin refnd")[0], "coins");
});

test("an exact title beats a longer title that only contains the words", () => {
  const items = [it("a", "Window of the month"), it("b", "Window")];
  assert.equal(search(buildIndex(items), "window")[0].item.id, "b");
});

test("typos are tolerated: a swap, a drop, a slip", () => {
  const top = ids("slidng windw");
  assert.ok(top.slice(0, 3).every((id) => id.includes("window") || id === "longest-session"));
  assert.ok(ids("binry serch").slice(0, 2).includes("find-id"));
  assert.equal(ids("detct a loop")[0], "loop");
});

test("a short word is not fuzzy: 'dp' does not become 'do'", () => {
  assert.deepEqual(ids("zz"), []);
});

test("classic names find the problem told in its own scenario", () => {
  assert.equal(ids("two sum")[0], "refund-pair");
  assert.equal(ids("LRU cache")[0], "lru");
  assert.equal(ids("coin change")[0], "coins");
  assert.equal(ids("lc 704")[0], "find-id");
});

test("dp finds the dynamic programming problems; bfs the graph traversal ones", () => {
  assert.deepEqual(ids("dp").sort(), ["climb", "coins"]);
  assert.ok(ids("bfs").includes("islands"));
  assert.ok(ids("ll").includes("loop"));
});

test("a whole topic name ranks its problems above a title that shares one word", () => {
  const top = ids("binary search");
  assert.equal(top[0], "find-id");
  assert.ok(top.includes("search-tree"));
});

test("a hit says why it matched, and where in the title to highlight", () => {
  const h = search(index, "two sum")[0];
  assert.equal(whyText(h), "also known as: Two Sum");
  const w = search(index, "sliding window")[0];
  assert.ok(w.ranges.length >= 2);
  const t = w.item.title;
  assert.equal(t.slice(...w.ranges[0]).toLowerCase(), "sliding");
  const topic = search(index, "string")[0];
  assert.equal(whyText(topic), "topic: String");
});

test("every typed word must match (a sentence may skip a few)", () => {
  assert.deepEqual(ids("sliding quokka"), []);
  assert.ok(ids("I want to learn about sliding window problems please").includes("window-median"));
});

test("accept() narrows by level, and only a level word returns the level's items", () => {
  const r = instantRank(index, "easy sliding window");
  assert.deepEqual(r.hits.map((h) => h.item.id), ["easy-window"]);
  const hard = instantRank(index, "hard");
  assert.deepEqual(hard.hits.map((h) => h.item.id), ["window-median"]);
});

test("unsolved, solved and saved use the learner's progress", () => {
  const progress = { statusOf: (id) => (id === "coins" ? "solved" : "todo"), isSaved: (id) => id === "climb" };
  assert.deepEqual(instantRank(index, "dp solved", progress).hits.map((h) => h.item.id), ["coins"]);
  assert.deepEqual(instantRank(index, "dp unsolved", progress).hits.map((h) => h.item.id), ["climb"]);
  assert.deepEqual(instantRank(index, "saved", progress).hits.map((h) => h.item.id), ["climb"]);
});

test("search over 630 items stays fast (indexing once, then queries)", () => {
  const many = Array.from({ length: 630 }, (_, i) => it(`p-${i}`, `Problem ${i} about ${["windows", "graphs", "caches", "heaps"][i % 4]} and ${["pairs", "runs", "trees"][i % 3]}`, { topics: ["Sliding window"], summary: "a statement of some twenty words about the thing the learner is asked to compute" }));
  const idx = buildIndex(many);
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) {
    idx.memo.clear();
    search(idx, "slidng windw graphs");
  }
  assert.ok((performance.now() - t0) / 20 < 10, "under 10 ms per cold query");
});

/* ---------------------------------------------------------------- the smart layer */

const ROWS = [
  { id: "window-median", level: "hard", structures: ["heap"], algorithms: [], patterns: ["sliding-window"], companies: [], tags: [], concept: "", module: "", seq: 1, order: 1, title: "", rating: null, minutes: null, kind: "practice", video: false, text: "" },
  { id: "longest-session", level: "medium", structures: ["string"], algorithms: [], patterns: ["sliding-window"], companies: ["media-streaming"], tags: [], concept: "", module: "", seq: 2, order: 2, title: "", rating: null, minutes: null, kind: "practice", video: false, text: "" },
  { id: "find-id", level: "easy", structures: [], algorithms: ["binary-search"], patterns: [], companies: [], tags: [], concept: "", module: "", seq: 3, order: 3, title: "", rating: null, minutes: null, kind: "practice", video: false, text: "" },
];
const TAX = buildTaxonomy(ROWS, [{ id: "media-streaming", label: "Media and streaming" }], { "sliding-window": "Sliding window" }, { "sliding-window": "/dsa/concepts/sliding-window" });

test("the taxonomy shown to the model is ids only and small", () => {
  const sys = smartSystem(TAX);
  assert.ok(sys.includes("TOPICS:") && sys.includes("sliding-window") && sys.includes("LESSONS: sliding-window"));
  assert.ok(sys.length < 6000, `${sys.length} chars`);
});

test("parseSmart keeps only ids that exist and caps the lists", () => {
  const a = parseSmart('noise {"filters":{"topics":["sliding-window","made-up","string"],"tags":["x"],"difficulty":["medium","easy","extreme"],"domains":["media-streaming","nope"],"status":"unsolved"},"keywords":["Sliding Window"," "],"learnFirst":"sliding-window","note":"Looking for sliding window."} tail', TAX);
  assert.deepEqual(a.filters.topics, ["sliding-window", "string"]);
  assert.deepEqual(a.filters.tags, []);
  assert.deepEqual(a.filters.difficulty, ["medium", "easy"]);
  assert.deepEqual(a.filters.domains, ["media-streaming"]);
  assert.equal(a.filters.status, "unsolved");
  assert.deepEqual(a.keywords, ["sliding window"]);
  assert.equal(a.learnFirst, "sliding-window");
  assert.equal(parseSmart("not json", TAX), null);
  assert.equal(parseSmart('{"filters":{},"learnFirst":"nope","keywords":[],"note":1}', TAX).learnFirst, undefined);
});

test("smartSelection puts each topic in its own group (the chips) and maps status", () => {
  const a = { filters: { topics: ["sliding-window", "string", "binary-search"], tags: [], difficulty: ["medium"], domains: ["media-streaming"], status: "unsolved" }, keywords: [], note: "" };
  const sel = smartSelection(a);
  assert.deepEqual(sel.patterns, ["sliding-window"]);
  assert.deepEqual(sel.structures, ["string"]);
  assert.deepEqual(sel.algorithms, ["binary-search"]);
  assert.deepEqual(sel.level, ["medium"]);
  assert.deepEqual(sel.company, ["media-streaming"]);
  assert.deepEqual(sel.status, ["todo", "tried"]);
});

test("smartRank: topics lift, difficulty filters, and an empty filter is relaxed instead of showing nothing", () => {
  const items = ITEMS.slice(0, 4).map((x, i) => ({ ...x, id: ROWS[i]?.id || x.id }));
  const idx = buildIndex([items[0], items[1], items[3]].map((x, i) => ({ ...x, id: ROWS[i].id })));
  const a = { filters: { topics: ["sliding-window"], tags: [], difficulty: ["medium"], domains: [] }, keywords: ["window"], note: "" };
  const r = smartRank(ROWS, idx, a, () => "todo");
  assert.deepEqual(r.rows.map((x) => x.id), ["longest-session"]);
  const none = { filters: { topics: [], tags: [], difficulty: ["hard"], domains: ["media-streaming"] }, keywords: ["window"], note: "" };
  const relaxed = smartRank(ROWS, idx, none, () => "todo");
  assert.ok(relaxed.relaxed.includes("company"));
  assert.ok(relaxed.rows.length >= 1);
});

test("the cache key ignores case, punctuation and spacing", () => {
  assert.equal(smartKey("  Sliding  WINDOW, medium?! "), smartKey("sliding window medium"));
});

/* ---------------------------------------------------------------- the palette: lessons of every kind and the new problems */

const { buildDsaDocs } = await import("../../src/lib/dsa/search-index.ts");
const { buildPaletteIndex, hitPath, mergeLessonHits, paletteHits } = await import("../../src/lib/dsa/search/palette.ts");

const CONCEPTS = [
  { id: "hashing", module: "m3-hashing", order: 1, title: "Hashing basics", status: "built", summary: "Count and look up in constant time." },
  { id: "heaps", module: "m5-heaps", order: 2, title: "Heaps", status: "built", summary: "Always the smallest next.", kind: "structure" },
  { id: "later", module: "m9", order: 3, title: "Planned lesson", status: "planned", summary: "Not written." },
];
const prob = (id, title, o = {}) => ({ id, title, module: "m3-hashing", concept: "hashing", level: "easy", patterns: ["hashing"], classic: [], blurb: "", ...o });
const PROBLEMS = [
  prob("match-refunds-with-payments", "Match refunds with payments", { role: "company", companyTypes: ["fintech", "e-commerce"], domain: "payments", patterns: ["queues", "hashing"], signals: ["the oldest unmatched one first", "a refund with no payment"], blurb: "Pair each refund with the payment it undoes." }),
  prob("detect-a-duplicate-transfer", "Detect a duplicate transfer", { role: "company", companyTypes: ["fintech"], domain: "payments" }),
  prob("fewest-coins-for-a-refund", "Fewest coins for a refund", { module: "m9-dp", level: "medium", patterns: ["dp"], blurb: "Refund an amount with the fewest coins." }),
  prob("reverse-the-words", "Reverse the words of a sentence", { role: "company", companyTypes: ["service-mass-recruiter"], patterns: ["strings"] }),
  prob("order-book-spread", "Order book spread", { role: "company", companyTypes: ["quant-trading"], patterns: ["heaps"] }),
  prob("rate-card-lookup", "Rate card lookup", { patterns: ["hashing"], blurb: "Look up refunds, discounts and fees on a rate card.", signals: ["refunds and fees"] }),
];
const LEAN = [
  { id: "warm-up-round", module: "co-fintech", kind: "set", title: "Warm-up round", summary: "Three easy problems the way a fintech interview frames them.", where: "Fintech interview set" },
  { id: "warm-up-round", module: "co-e-commerce", kind: "set", title: "Warm-up round", summary: "Three easy cart and stock problems.", where: "E-commerce interview set" },
  { id: "warm-up-round", module: "co-quant-trading", kind: "set", title: "Warm-up round", summary: "Easy order-book and rate problems.", where: "Quant and trading interview set" },
  { id: "core-round", module: "co-service-mass-recruiter", kind: "set", title: "Core round", summary: "The strings and arrays these tests ask.", where: "Service and mass recruiters interview set" },
  { id: "variable-windows", module: "d2-two-pointers-windows", kind: "street", title: "Variable windows", summary: "Grow and shrink a window.", where: "2.2 Two pointers" },
  { id: "fast-io-and-stress-testing", module: "camp-1", kind: "camp-tent", title: "Fast I/O and stress testing", summary: "Read input quickly.", where: "Camp 1" },
  { id: "trees-and-graphs", module: "core-150-gaps", kind: "set", title: "Trees and graphs", summary: "The gap set for trees.", where: "Core 150 gaps" },
];
const DOCS = buildDsaDocs(CONCEPTS, PROBLEMS, () => "1.1", LEAN);
const PAL = buildPaletteIndex(DOCS);
const top = (q, n = 5) => paletteHits(PAL, q, n).map(hitPath);
const fintechSet = "dsa/sets/co-fintech/warm-up-round";

test("every ready lesson kind and every problem is indexed, planned lessons are not", () => {
  assert.equal(DOCS.length, 2 + LEAN.length + PROBLEMS.length);
  for (const d of DOCS) assert.ok(d.meta, `${d.path} has search meta`);
  const paths = DOCS.map((d) => d.path);
  assert.ok(paths.includes("dsa/districts/d2-two-pointers-windows/variable-windows"));
  assert.ok(paths.includes("dsa/camps/camp-1/fast-io-and-stress-testing"));
  assert.ok(paths.includes("dsa/structures/heaps") && paths.includes("dsa/concepts/hashing"));
  assert.ok(!paths.some((p) => p.endsWith("later")));
});

test("'warm-up' typed with a hyphen is a title word, not the easy filter ('warmup' and 'easy' still are)", () => {
  assert.deepEqual(parseQuery("warm-up round").levels, []);
  assert.deepEqual(parseQuery("warm-up round").terms, ["warm", "up", "round"]);
  assert.deepEqual(parseQuery("fintech warm-up").filterWords, []);
  assert.deepEqual(parseQuery("warmup arrays").levels, ["easy"]);
  assert.deepEqual(parseQuery("easy, arrays").levels, ["easy"]);
});

test("a query of only a filter word lists nothing in the palette; a level word narrows problems, never lessons", () => {
  assert.deepEqual(top("easy"), []);
  const hard = top("hard refunds", 8);
  assert.ok(!hard.includes("dsa/problems/match-refunds-with-payments"));
  assert.ok(top("easy refunds", 8).includes("dsa/problems/match-refunds-with-payments"));
  assert.ok(top("easy fintech", 8).includes(fintechSet));
});

test("a company set's own title reaches the top: 'warm-up round' and 'fintech warm-up'", () => {
  assert.ok(top("warm-up round", 3).every((p) => p.endsWith("/warm-up-round")), top("warm-up round", 3).join());
  assert.equal(top("fintech warm-up", 1)[0], fintechSet);
  assert.equal(top("fintech warm up round", 1)[0], fintechSet);
  assert.equal(top("quant warm-up", 1)[0], "dsa/sets/co-quant-trading/warm-up-round");
});

test("'refunds' finds the company problem named for it first, before a body or tag mention", () => {
  assert.equal(top("refunds", 1)[0], "dsa/problems/match-refunds-with-payments", top("refunds", 3).join());
  assert.equal(top("match refunds", 1)[0], "dsa/problems/match-refunds-with-payments");
  // the rate card only mentions refunds in its statement: it comes after both problems that have the word in the title
  const r = top("refunds", 6);
  assert.ok(r.indexOf("dsa/problems/rate-card-lookup") > r.indexOf("dsa/problems/fewest-coins-for-a-refund") && r.indexOf("dsa/problems/rate-card-lookup") > r.indexOf("dsa/problems/match-refunds-with-payments"), r.join());
});

test("an exact or near-exact title ranks first, a prefix next, whatever the kind", () => {
  assert.equal(top("variable windows", 1)[0], "dsa/districts/d2-two-pointers-windows/variable-windows");
  assert.equal(top("fast io and stress testing", 1)[0], "dsa/camps/camp-1/fast-io-and-stress-testing");
  assert.equal(top("fast i/o stress testng", 1)[0], "dsa/camps/camp-1/fast-io-and-stress-testing");
  assert.equal(top("trees and graphs", 1)[0], "dsa/sets/core-150-gaps/trees-and-graphs");
  assert.equal(top("order book", 1)[0], "dsa/problems/order-book-spread");
});

test("a whole-word match in the title beats the same word in the body, a tag or a topic", () => {
  const items = [
    { ...it("body", "Something else entirely", { summary: "retry the payment after a refund" }) },
    { ...it("tag", "Another thing", { tags: ["refund"], topics: ["Refund handling"] }) },
    { ...it("title", "Refund the customer") },
    { ...it("prefix", "Refunded orders report") },
  ];
  const ix = buildIndex(items);
  const r = search(ix, "refund").map((h) => h.item.id);
  assert.equal(r[0], "title");
  assert.ok(r.indexOf("title") < r.indexOf("prefix") && r.indexOf("prefix") < r.indexOf("body"));
  assert.ok(r.indexOf("title") < r.indexOf("tag"));
});

test("company-type words match set lessons and company problems", () => {
  const f = top("fintech", 6);
  assert.ok(f.includes(fintechSet) && f.includes("dsa/problems/match-refunds-with-payments") && f.includes("dsa/problems/detect-a-duplicate-transfer"));
  assert.ok(!f.includes("dsa/sets/co-e-commerce/warm-up-round"));
  assert.ok(top("quant", 3).includes("dsa/sets/co-quant-trading/warm-up-round") && top("quant", 3).includes("dsa/problems/order-book-spread"));
  assert.ok(top("mass recruiter", 3).includes("dsa/sets/co-service-mass-recruiter/core-round") && top("mass recruiters", 3).includes("dsa/problems/reverse-the-words"));
  assert.ok(top("e-commerce interview set", 4).includes("dsa/sets/co-e-commerce/warm-up-round"));
  assert.ok(top("fintech interview", 6).includes("dsa/problems/match-refunds-with-payments"));
});

test("the kind and the pattern names are searchable too", () => {
  assert.ok(top("gap set", 3).includes("dsa/sets/core-150-gaps/trees-and-graphs"));
  assert.ok(top("camp", 3).includes("dsa/camps/camp-1/fast-io-and-stress-testing"));
  assert.ok(top("street", 3).includes("dsa/districts/d2-two-pointers-windows/variable-windows"));
  assert.ok(top("queues", 3).includes("dsa/problems/match-refunds-with-payments"));
  assert.equal(top("detect-a-duplicate-transfer", 1)[0], "dsa/problems/detect-a-duplicate-transfer");
});

test("on a DSA page the DSA hits lead, except another lesson whose title is the query", () => {
  const dsa = ["d1", "d2"];
  assert.deepEqual(mergeLessonHits(dsa, [{ hit: "o1", score: 0.2 }, { hit: "o2", score: 0.4 }], 10), ["d1", "d2", "o1", "o2"]);
  assert.deepEqual(mergeLessonHits(dsa, [{ hit: "o1", score: 0.01 }, { hit: "o2", score: 0.4 }], 10), ["o1", "d1", "d2", "o2"]);
  assert.equal(mergeLessonHits(dsa, [{ hit: "o1", score: 0.3 }], 2).length, 2);
});

test("the smart taxonomy lists lean lessons and company types, so 'fintech interview problems' can be answered", () => {
  const lean = [
    { key: "co-fintech/warm-up-round", title: "Warm-up round", kind: "set", company: "fintech" },
    { key: "co-quant-trading/warm-up-round", title: "Warm-up round", kind: "set", company: "quant-trading" },
    { key: "d4-binary-search/search-in-order", title: "Search in order", kind: "street" },
  ];
  const label = (id) => ({ "quant-trading": "Quant trading" })[id] || id;
  const tx = buildTaxonomy(ROWS, [{ id: "fintech", label: "Fintech" }, { id: "media-streaming", label: "Media and streaming" }], { "sliding-window": "Sliding window" }, { "sliding-window": "/dsa/concepts/sliding-window" }, lean, label);
  const sys = smartSystem(tx);
  assert.ok(sys.includes("DOMAINS: fintech, media-streaming (Media and streaming), quant-trading"), sys.match(/DOMAINS:.*/)[0]);
  assert.ok(sys.includes("co-fintech/warm-up-round") && sys.includes("d4-binary-search/search-in-order"));
  assert.ok(/fintech interview problems/.test(sys) && /mass recruiter/.test(sys));
  assert.ok(sys.length < 6000, `${sys.length} chars`);
  const a = parseSmart('{"filters":{"topics":[],"tags":[],"difficulty":[],"domains":["fintech","quant-trading","nope"],"status":null},"keywords":["fintech"],"learnFirst":"co-fintech/warm-up-round","note":"Fintech interview problems."}', tx);
  assert.deepEqual(a.filters.domains, ["fintech", "quant-trading"]);
  assert.equal(a.learnFirst, "co-fintech/warm-up-round");
});
