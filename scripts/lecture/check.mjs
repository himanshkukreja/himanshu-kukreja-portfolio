// usage: node scripts/lecture/check.mjs <lecture.json>  — structure, highlight ids, sequence cut points, narration length
// DSA Mastery lectures are checked resolved (scripts/lecture/dsa-resolve.mjs): their quote, array, trace, race and code
// scenes must carry the data the stage draws (person, values, traceData, raceData, code).
import fs from "fs";
import path from "path";
const f = process.argv[2];
const L = JSON.parse(fs.readFileSync(f, "utf8"));
const errs = [], warns = [];
if (!L.quest || !L.title || !L.summary || !Array.isArray(L.scenes)) errs.push("needs quest, title, summary, scenes[]");
const KINDS = ["title", "numbers", "flowchart", "sequence", "state", "list", "compare", "quiz", "chart", "timeline", "phone", "quote", "array", "trace", "race", "code", "chain", "grid", "stack", "queue", "tree", "heap", "graph", "trie", "intervals", "dp", "chars", "bits"];
const DSA_KINDS = ["quote", "array", "trace", "race", "code", "chain", "grid", "stack", "queue", "tree", "heap", "graph", "trie", "intervals", "dp", "chars", "bits"];
if (L.lesson?.course === "dsa") errs.push("an unresolved DSA lecture: run scripts/lecture/dsa-resolve.mjs first and check its output");
// flowchart edges as "from>to" (node shapes, classes and edge labels stripped; "A & B --> C" expanded)
function edgesOf(src) {
  const out = new Set();
  for (let line of src.split("\n")) {
    line = line.replace(/@\{[^}]*\}/g, "").replace(/\["[^"]*"\]|\[[^\]]*\]/g, "").replace(/\(\[[^\]]*\]\)|\(\([^)]*\)\)|\([^)]*\)/g, "").replace(/\{"[^"]*"\}|\{[^}]*\}/g, "").replace(/:::[\w-]+/g, "").replace(/\|[^|]*\|/g, "");
    const parts = line.split(/\s*(?:-\.->|==>|-->|---|-\.-|<-->|~~~)\s*/);
    if (parts.length < 2) continue;
    for (let k = 0; k + 1 < parts.length; k++)
      for (const a of parts[k].split("&").map((x) => x.trim()).filter(Boolean))
        for (const b of parts[k + 1].split("&").map((x) => x.trim()).filter(Boolean)) out.add(`${a}>${b}`);
  }
  return out;
}
let quizzes = 0;
let words = 0, steps = 0;
for (const s of L.scenes || []) {
  if (!KINDS.includes(s.kind)) errs.push(`${s.id}: bad kind ${s.kind}`);
  if (!s.id || !s.title || !Array.isArray(s.steps) || !s.steps.length) errs.push(`${s.id}: needs id, title, steps`);
  if (["flowchart", "sequence", "state"].includes(s.kind) && !s.diagram) errs.push(`${s.id}: ${s.kind} needs diagram`);
  // mermaid ends a sequence statement at ";": the diagram fails and the export waits forever on that frame
  if (s.kind === "sequence" && (s.diagram || "").includes(";")) errs.push(`${s.id}: no ";" in a sequence diagram (mermaid reads it as the end of a line)`);
  if (s.kind === "numbers" && !(s.numbers || []).length) errs.push(`${s.id}: numbers scene needs numbers[]`);
  if (s.kind === "list" && !(s.points || []).length) errs.push(`${s.id}: list scene needs points[]`);
  if (s.kind === "compare" && !(s.left?.points?.length && s.right?.points?.length)) errs.push(`${s.id}: compare needs left/right with points[]`);
  if (s.kind === "chart" && (!["bar", "line"].includes(s.type) || !(s.points || []).length || s.points.some((p) => typeof p.value !== "number"))) errs.push(`${s.id}: chart needs type bar|line and numeric points[]`);
  if (s.kind === "timeline" && !(s.events || []).length) errs.push(`${s.id}: timeline needs events[]`);
  if (s.kind === "phone" && !(s.app && (s.screens || []).length && s.screens.every((x) => x.title && Array.isArray(x.rows)))) errs.push(`${s.id}: phone needs app and screens[{title, rows[]}]`);
  if (DSA_KINDS.includes(s.kind) && !L.dsa) errs.push(`${s.id}: ${s.kind} scenes are for DSA lectures (resolved, with dsa: { module, concept })`);
  if (s.kind === "quote" && !(s.text && s.person?.name)) errs.push(`${s.id}: quote needs text and a resolved person (cast id "${s.who}" not found?)`);
  if (s.kind === "array" && !(s.values || []).length) errs.push(`${s.id}: array needs values[]`);
  if (s.kind === "chain" && !(s.values || []).length) errs.push(`${s.id}: chain needs values[] (the nodes)`);
  if (s.kind === "grid" && (!Array.isArray(s.grid) || !s.grid.length || s.grid.some((r) => typeof r !== "string" || r.length !== s.grid[0].length || !/^[.#SG]+$/.test(r)))) errs.push(`${s.id}: grid needs rows of . # S G, all the same length`);
  if (s.kind === "grid" && s.algorithm && !["bfs", "dfs"].includes(s.algorithm)) errs.push(`${s.id}: algorithm is bfs or dfs`);
  if (s.kind === "stack") {
    const n = (s.values || []).length;
    const id = (v) => Number.isInteger(v) && v >= 0 && v < n;
    if (!n) errs.push(`${s.id}: stack needs values[] (the items)`);
    if (n > (L.short ? 5 : 8) + 1) errs.push(`${s.id}: at most ${L.short ? 6 : 9} items`);
    if (s.mode !== undefined && !["array", "list", "calls"].includes(s.mode)) errs.push(`${s.id}: mode is array, list or calls`);
    for (const [k, st] of (s.steps || []).entries()) {
      if (!Array.isArray(st.order) || !st.order.every(id) || new Set(st.order).size !== st.order.length) errs.push(`${s.id}#${k}: stack steps need order: distinct item ids, bottom to top`);
      if (st.lift !== undefined && st.lift !== null && (!id(st.lift) || (st.order || []).includes(st.lift))) errs.push(`${s.id}#${k}: lift is an item id that is not in order`);
    }
  }
  if (s.kind === "queue") {
    const n = (s.values || []).length;
    const id = (v) => Number.isInteger(v) && v >= 0 && v < n;
    if (!n) errs.push(`${s.id}: queue needs values[] (the items, or the stream in a window scene)`);
    if (s.mode !== undefined && !["ring", "list", "window"].includes(s.mode)) errs.push(`${s.id}: queue mode is ring, list or window`);
    if (n > (L.short ? 7 : 9)) errs.push(`${s.id}: at most ${L.short ? 7 : 9} values`);
    for (const [k, st] of (s.steps || []).entries()) {
      if (!Array.isArray(st.order) || !st.order.every(id) || new Set(st.order).size !== st.order.length) errs.push(`${s.id}#${k}: queue steps need order: distinct ids, front to back (in a window scene, the deque's indexes)`);
      if (st.lift !== undefined && st.lift !== null && (!id(st.lift) || (st.order || []).includes(st.lift))) errs.push(`${s.id}#${k}: lift is an item id that is not in order`);
      if (s.mode === "window" && st.window && !(Array.isArray(st.window) && st.window[0] >= 0 && st.window[1] < n && st.window[0] <= st.window[1])) errs.push(`${s.id}#${k}: window [${st.window}] outside the stream`);
    }
  }
  if (s.kind === "tree") {
    const n = (s.values || []).length;
    const id = (v) => Number.isInteger(v) && v >= 0 && v < n;
    const kids = (a) => Array.isArray(a) && a.length === n && a.every((v) => v === null || id(v));
    const ids = (a) => Array.isArray(a) && a.every(id) && new Set(a).size === a.length;
    if (!n) errs.push(`${s.id}: tree needs values[] (the nodes)`);
    if (n > (L.short ? 7 : 9)) errs.push(`${s.id}: at most ${L.short ? 7 : 9} nodes`);
    if (!kids(s.leftOf) || !kids(s.rightOf)) errs.push(`${s.id}: tree needs leftOf[] and rightOf[]: each node's child id or null`);
    for (const [k, st] of (s.steps || []).entries()) {
      for (const key of ["leftOf", "rightOf"]) if (st[key] !== undefined && !kids(st[key])) errs.push(`${s.id}#${k}: ${key} gives each of the ${n} nodes an id or null`);
      for (const key of ["nodes", "path", "mark"]) if (st[key] !== undefined && !ids(st[key])) errs.push(`${s.id}#${k}: ${key} lists distinct node ids`);
      if (st.seq !== undefined && !(Array.isArray(st.seq) && st.seq.every(id))) errs.push(`${s.id}#${k}: seq lists node ids`);
      for (const key of ["current", "found", "lift"]) if (st[key] !== undefined && st[key] !== null && !id(st[key])) errs.push(`${s.id}#${k}: ${key} is not a node id`);
      if (st.lift !== undefined && st.lift !== null && (st.nodes || []).includes(st.lift)) errs.push(`${s.id}#${k}: lift is a node that is not in nodes`);
    }
  }
  if (s.kind === "heap") {
    if (!(s.values || []).length) errs.push(`${s.id}: heap needs values[] (the array)`);
    if ((s.values || []).length > (L.short ? 7 : 9)) errs.push(`${s.id}: at most ${L.short ? 7 : 9} cells`);
    let n = (s.values || []).length;
    for (const [k, st] of (s.steps || []).entries()) {
      if (st.values !== undefined) {
        if (!(Array.isArray(st.values) && st.values.length <= (L.short ? 7 : 9) && st.values.every(Number.isInteger))) errs.push(`${s.id}#${k}: values is the heap array after this step: whole numbers, at most ${L.short ? 7 : 9}`);
        else n = st.values.length;
      }
      const id = (v) => Number.isInteger(v) && v >= 0 && v < n;
      for (const key of ["swap", "compare"]) if (st[key] !== undefined && !(Array.isArray(st[key]) && st[key].length === 2 && st[key].every(id) && st[key][0] !== st[key][1])) errs.push(`${s.id}#${k}: ${key} is two different indexes 0..${n - 1}`);
      for (const key of ["mark", "path"]) if (st[key] !== undefined && !(Array.isArray(st[key]) && st[key].every(id) && new Set(st[key]).size === st[key].length)) errs.push(`${s.id}#${k}: ${key} lists distinct indexes 0..${n - 1}`);
      if (st.current !== undefined && st.current !== null && !id(st.current)) errs.push(`${s.id}#${k}: current is not an index of the array`);
    }
  }
  if (s.kind === "graph") {
    const nV = s.vertices;
    const cap = L.short ? 6 : 8;
    if (!(Number.isInteger(nV) && nV >= 2 && nV <= cap)) errs.push(`${s.id}: graph needs vertices, a whole number from 2 to ${cap}`);
    const okEdges = (e) => Array.isArray(e) && e.every((x) => Array.isArray(x) && (x.length === 2 || x.length === 3) && x.every(Number.isInteger) && x[0] >= 0 && x[0] < nV && x[1] >= 0 && x[1] < nV && x[0] !== x[1]);
    if (s.edges !== undefined && !okEdges(s.edges)) errs.push(`${s.id}: edges are pairs [from, to] (or [from, to, weight]) of vertices 0..${nV - 1}, no loops`);
    for (const [k, st] of (s.steps || []).entries()) {
      if (st.edges !== undefined && !okEdges(st.edges)) errs.push(`${s.id}#${k}: edges are pairs [from, to] (or [from, to, weight]) of vertices 0..${nV - 1}, no loops`);
      if (st.edge !== undefined && !(Array.isArray(st.edge) && st.edge.length === 2 && st.edge.every((v) => Number.isInteger(v) && v >= 0 && v < nV))) errs.push(`${s.id}#${k}: edge is two vertices 0..${nV - 1}`);
      if (st.show !== undefined && !["graph", "list", "matrix", "both", "all"].includes(st.show)) errs.push(`${s.id}#${k}: show is graph, list, matrix, both or all`);
      for (const key of ["mark", "path"]) if (st[key] !== undefined && !(Array.isArray(st[key]) && st[key].every((v) => Number.isInteger(v) && v >= 0 && v < nV))) errs.push(`${s.id}#${k}: ${key} lists vertices 0..${nV - 1}`);
      if (st.current !== undefined && st.current !== null && !(Number.isInteger(st.current) && st.current >= 0 && st.current < nV)) errs.push(`${s.id}#${k}: current is not a vertex`);
      if (st.dist !== undefined && !(Array.isArray(st.dist) && st.dist.length === nV && st.dist.every((d) => d === null || Number.isInteger(d)))) errs.push(`${s.id}#${k}: dist has one distance (a whole number, or null for not reached) for each of the ${nV} vertices`);
      if (st.done !== undefined && !(Array.isArray(st.done) && st.done.every((v) => Number.isInteger(v) && v >= 0 && v < nV) && new Set(st.done).size === st.done.length)) errs.push(`${s.id}#${k}: done lists distinct vertices 0..${nV - 1}`);
      if (st.heap !== undefined && !(Array.isArray(st.heap) && st.heap.length <= 8 && st.heap.every((h) => Array.isArray(h) && (h.length === 2 || h.length === 3) && h.every(Number.isInteger) && h[1] >= 0 && h[1] < nV))) errs.push(`${s.id}#${k}: heap is up to 8 entries [distance, vertex] (a third item of 1 marks a stale entry)`);
      if (st.indeg !== undefined && !(Array.isArray(st.indeg) && st.indeg.length === nV && st.indeg.every((d) => Number.isInteger(d) && d >= 0))) errs.push(`${s.id}#${k}: indeg has one in-degree (a whole number, 0 or more) for each of the ${nV} vertices`);
      for (const key of ["ready", "topo", "stuck"]) if (st[key] !== undefined && !(Array.isArray(st[key]) && st[key].every((v) => Number.isInteger(v) && v >= 0 && v < nV) && new Set(st[key]).size === st[key].length)) errs.push(`${s.id}#${k}: ${key} lists distinct vertices 0..${nV - 1}`);
      if (st.parent !== undefined) {
        if (!(Array.isArray(st.parent) && st.parent.length === nV && st.parent.every((v) => Number.isInteger(v) && v >= 0 && v < nV))) errs.push(`${s.id}#${k}: parent has one parent (a vertex 0..${nV - 1}) for each of the ${nV} vertices; a root is its own parent`);
        else for (let i = 0; i < nV; i++) { let x = i, hops = 0; while (st.parent[x] !== x && hops <= nV) { x = st.parent[x]; hops++; } if (hops > nV) { errs.push(`${s.id}#${k}: parent: vertex ${i} never reaches a root (a loop of parents)`); break; } }
      }
      if (st.size !== undefined && !(Array.isArray(st.size) && st.size.length === nV && st.size.every((d) => Number.isInteger(d) && d >= 1))) errs.push(`${s.id}#${k}: size has one group size (a whole number, 1 or more) for each of the ${nV} vertices`);
    }
  }
  if (s.kind === "intervals") {
    // greedy choices (A5): talks as bars on an hour axis
    const spans = s.spans || [];
    const nT = spans.length;
    if (!(Array.isArray(spans) && nT >= 2 && nT <= 8 && spans.every((t) => Array.isArray(t) && t.length === 2 && t.every(Number.isInteger) && t[0] >= 0 && t[1] <= 24 && t[0] < t[1]))) errs.push(`${s.id}: intervals scenes need spans: 2 to 8 talks [start, end] in whole hours 0 to 24, with the start before the end`);
    const isTalk = (v) => Number.isInteger(v) && v >= 0 && v < nT;
    for (const [k, st] of (s.steps || []).entries()) {
      for (const key of ["picked", "skipped", "hot"]) if (st[key] !== undefined && !(Array.isArray(st[key]) && st[key].every(isTalk) && new Set(st[key]).size === st[key].length)) errs.push(`${s.id}#${k}: ${key} lists distinct talks 0..${nT - 1}`);
      if (Array.isArray(st.picked) && Array.isArray(st.skipped) && st.picked.some((x) => st.skipped.includes(x))) errs.push(`${s.id}#${k}: a talk cannot be both picked and skipped`);
      if (st.current !== undefined && st.current !== null && !isTalk(st.current)) errs.push(`${s.id}#${k}: current is a talk 0..${nT - 1}`);
      if (st.lastEnd !== undefined && !(Number.isInteger(st.lastEnd) && st.lastEnd >= 0 && st.lastEnd <= 24)) errs.push(`${s.id}#${k}: lastEnd is an hour 0 to 24`);
      if (st.out !== undefined && (typeof st.out !== "string" || !st.out.length || st.out.length > 18)) errs.push(`${s.id}#${k}: out is a chip of 18 characters or fewer`);
      if (st.cost !== undefined && !(Number.isInteger(st.cost) && st.cost >= 0)) errs.push(`${s.id}#${k}: cost is a whole number`);
    }
  }
  if (s.kind === "chars") {
    // strings (A7): a text strip with an optional pattern under it and an optional 26-slot count array
    const c = s.chars || {};
    const nT = typeof c.text === "string" ? [...c.text].length : 0;
    const nP = typeof c.pattern === "string" ? [...c.pattern].length : 0;
    if (!(nT >= 1 && nT <= 24)) errs.push(`${s.id}: chars.text is a string of 1 to 24 characters`);
    if (c.pattern !== undefined && !(nP >= 1 && nP <= 10 && nP <= nT)) errs.push(`${s.id}: chars.pattern is 1 to 10 characters and no longer than the text`);
    const idx = (v) => Number.isInteger(v) && v >= 0 && v < nT;
    for (const [k, st] of (s.steps || []).entries()) {
      if (st.shift !== undefined && !(Number.isInteger(st.shift) && st.shift >= 0 && st.shift + nP <= nT)) errs.push(`${s.id}#${k}: shift puts the pattern outside the text`);
      for (const key of ["mark", "bad"]) if (st[key] !== undefined && !(Array.isArray(st[key]) && st[key].every(idx))) errs.push(`${s.id}#${k}: ${key} lists text indexes 0..${nT - 1}`);
      if (st.window !== undefined && !(Array.isArray(st.window) && idx(st.window[0]) && idx(st.window[1]) && st.window[0] <= st.window[1])) errs.push(`${s.id}#${k}: window is [first, last] text indexes`);
      for (const [name, v] of Object.entries(st.pointers || {})) if (!idx(v)) errs.push(`${s.id}#${k}: pointer ${name}=${v} outside the text`);
      if (st.tally !== undefined && !(c.counts && st.tally && typeof st.tally === "object" && Object.entries(st.tally).every(([l, n]) => /^[a-z]$/.test(l) && Number.isInteger(n) && n >= 0))) errs.push(`${s.id}#${k}: tally maps letters a-z to counts and needs chars.counts`);
      if (st.slot !== undefined && !(c.counts && /^[a-z]$/.test(st.slot))) errs.push(`${s.id}#${k}: slot is a letter a-z and needs chars.counts`);
      if (st.out !== undefined && (typeof st.out !== "string" || !st.out.length || st.out.length > 18)) errs.push(`${s.id}#${k}: out is a chip of 18 characters or fewer`);
      if (st.cost !== undefined && !(Number.isInteger(st.cost) && st.cost >= 0)) errs.push(`${s.id}#${k}: cost is a whole number`);
    }
  }
  if (s.kind === "bits") {
    // bits (A8): numbers as rows of bit cells; an operator makes the last row from the rows before it, and the checker works it out
    const b = s.bits || {};
    const w = b.width;
    if (!(Number.isInteger(w) && w >= 4 && w <= 16)) errs.push(`${s.id}: bits.width is a whole number from 4 to 16`);
    else {
      const signed = b.signed === true;
      if (b.signed !== undefined && typeof b.signed !== "boolean") errs.push(`${s.id}: bits.signed is true or false`);
      if (b.names !== undefined && !(Array.isArray(b.names) && b.names.length === w && b.names.every((x) => typeof x === "string" && x.length >= 1 && x.length <= 7))) errs.push(`${s.id}: bits.names gives ${w} labels of 1 to 7 characters`);
      const mask = (1 << w) - 1;
      const lo = signed ? -(1 << (w - 1)) : 0;
      const hi = signed ? (1 << (w - 1)) - 1 : mask;
      const toSigned = (u) => (u >= 1 << (w - 1) ? u - (1 << w) : u);
      let rows = null;
      for (const [k, st] of (s.steps || []).entries()) {
        if (st.rows !== undefined) {
          if (!(Array.isArray(st.rows) && st.rows.length >= 1 && st.rows.length <= 4 && st.rows.every((r) => Array.isArray(r) && r.length === 2 && typeof r[0] === "string" && r[0].length >= 1 && r[0].length <= 14 && Number.isInteger(r[1])))) errs.push(`${s.id}#${k}: rows is 1 to 4 pairs of [label of 14 characters or fewer, whole number]`);
          else if (st.rows.some((r) => r[1] < lo || r[1] > hi)) errs.push(`${s.id}#${k}: row values run from ${lo} to ${hi} in ${w} bits${signed ? " (signed)" : ""}`);
          else rows = st.rows;
        }
        if (rows === null) { errs.push(`${s.id}#${k}: the first step must set rows`); continue; }
        if (st.hot !== undefined && !(Array.isArray(st.hot) && st.hot.every((h) => Number.isInteger(h) && h >= 0 && h < w))) errs.push(`${s.id}#${k}: hot lists bit positions 0..${w - 1}`);
        if (st.out !== undefined && (typeof st.out !== "string" || !st.out.length || st.out.length > 18)) errs.push(`${s.id}#${k}: out is a chip of 18 characters or fewer`);
        if (st.op !== undefined) {
          if (typeof st.op !== "string" || !/^(&|\||\^|~|<<[1-9]\d?|>>[1-9]\d?|>>>[1-9]\d?)$/.test(st.op)) { errs.push(`${s.id}#${k}: op is one of & | ^ ~ <<n >>n >>>n`); continue; }
          const two = ["&", "|", "^"].includes(st.op);
          if (rows.length !== (two ? 3 : 2)) { errs.push(`${s.id}#${k}: op ${st.op} needs ${two ? "3 rows: two inputs and the result" : "2 rows: the input and the result"}`); continue; }
          const u = rows.map((r) => r[1] & mask);
          const sh = Number((st.op.match(/\d+/) || [0])[0]);
          let want;
          if (st.op === "&") want = u[0] & u[1];
          else if (st.op === "|") want = u[0] | u[1];
          else if (st.op === "^") want = u[0] ^ u[1];
          else if (st.op === "~") want = ~u[0] & mask;
          else if (st.op.startsWith("<<")) want = (u[0] << sh) & mask;
          else if (st.op.startsWith(">>>")) want = u[0] >>> sh;
          else want = signed ? (toSigned(u[0]) >> sh) & mask : u[0] >>> sh;
          if (sh >= w) errs.push(`${s.id}#${k}: a shift of ${sh} is not below the width ${w}`);
          else if (u[u.length - 1] !== want) errs.push(`${s.id}#${k}: op ${st.op} on ${rows.slice(0, -1).map((r) => r[1]).join(" and ")} is ${signed ? toSigned(want) : want}, not ${rows[rows.length - 1][1]}`);
        }
      }
    }
  }
  if (s.kind === "dp") {
    // dynamic programming (A6): a table (cols, rows, base, blocked) or a recursion tree (calls)
    const d = s.dp || {};
    const isTree = Array.isArray(d.calls);
    const cell = (v, R, C) => Array.isArray(v) && v.length >= 2 && Number.isInteger(v[0]) && Number.isInteger(v[1]) && v[0] >= 0 && v[0] < R && v[1] >= 0 && v[1] < C;
    if (isTree) {
      const nC = d.calls.length;
      if (!(nC >= 1 && nC <= 31 && d.calls.every((c, i) => Array.isArray(c) && typeof c[0] === "string" && c[0].length >= 1 && c[0].length <= 6 && Number.isInteger(c[1]) && c[1] >= -1 && c[1] < i && (i === 0 ? c[1] === -1 : c[1] >= 0)))) errs.push(`${s.id}: dp calls are 1 to 31 entries [label of 1 to 6 characters, earlier parent call or -1 for the first call]`);
      const isCall = (v) => Number.isInteger(v) && v >= 0 && v < nC;
      for (const [k, st] of (s.steps || []).entries()) {
        if (st.shown !== undefined && !(Number.isInteger(st.shown) && st.shown >= 0 && st.shown <= nC)) errs.push(`${s.id}#${k}: shown is a number of calls 0..${nC}`);
        for (const key of ["hot", "repeat", "hit"]) if (st[key] !== undefined && !(Array.isArray(st[key]) && st[key].every(isCall) && new Set(st[key]).size === st[key].length)) errs.push(`${s.id}#${k}: ${key} lists distinct calls 0..${nC - 1}`);
        if (st.ret !== undefined && !(st.ret && typeof st.ret === "object" && Object.entries(st.ret).every(([a, b]) => isCall(Number(a)) && typeof b === "string" && b.length <= 8))) errs.push(`${s.id}#${k}: ret maps call numbers to short text`);
        for (const bad of ["put", "now", "reads"]) if (st[bad] !== undefined) errs.push(`${s.id}#${k}: a recursion tree does not use ${bad}`);
      }
    } else {
      const C = (d.cols || []).length;
      const R = d.rows ? d.rows.length : 1;
      if (!(Array.isArray(d.cols) && C >= 2 && C <= 13 && d.cols.every((x) => typeof x === "string" && x.length <= 3) && (d.rows === undefined || (Array.isArray(d.rows) && R >= 2 && R <= 8 && d.rows.every((x) => typeof x === "string" && x.length <= 3))))) errs.push(`${s.id}: a dp table needs cols (2 to 13 short labels) and, for a 2-D table, rows (2 to 8 short labels)`);
      for (const key of ["base", "blocked"]) if (d[key] !== undefined && !(Array.isArray(d[key]) && d[key].every((v) => cell(v, R, C)))) errs.push(`${s.id}: ${key} lists cells [row, column] inside the table`);
      for (const [k, st] of (s.steps || []).entries()) {
        if (st.put !== undefined && !(Array.isArray(st.put) && st.put.every((v) => cell(v, R, C) && v.length === 3 && typeof v[2] === "string" && v[2].length >= 1 && v[2].length <= 7))) errs.push(`${s.id}#${k}: put lists cells [row, column, text of 1 to 7 characters] inside the table`);
        if (st.now !== undefined && !cell(st.now, R, C)) errs.push(`${s.id}#${k}: now is a cell [row, column] inside the table`);
        if (st.reads !== undefined && !(Array.isArray(st.reads) && st.reads.every((v) => cell(v, R, C)))) errs.push(`${s.id}#${k}: reads lists cells [row, column] inside the table`);
        for (const bad of ["shown", "hit", "repeat", "ret", "hot"]) if (st[bad] !== undefined) errs.push(`${s.id}#${k}: a dp table does not use ${bad}`);
      }
    }
    for (const [k, st] of (s.steps || []).entries()) {
      if (st.out !== undefined && (typeof st.out !== "string" || !st.out.length || st.out.length > 18)) errs.push(`${s.id}#${k}: out is a chip of 18 characters or fewer`);
      if (st.cost !== undefined && !(Number.isInteger(st.cost) && st.cost >= 0)) errs.push(`${s.id}#${k}: cost is a whole number`);
    }
  }
  if (s.kind === "trie") {
    const word = (w) => typeof w === "string" && /^[a-z]{1,8}$/.test(w);
    const cap = L.short ? 5 : 7;
    const okWords = (w) => Array.isArray(w) && w.length <= cap && w.every(word);
    if (!okWords(s.words ?? [])) errs.push(`${s.id}: trie words are lowercase words of 1 to 8 letters, at most ${cap}`);
    for (const [k, st] of (s.steps || []).entries()) {
      if (st.words !== undefined && !okWords(st.words)) errs.push(`${s.id}#${k}: words are lowercase words of 1 to 8 letters, at most ${cap}`);
      for (const key of ["walk", "grow", "endAt"]) if (st[key] !== undefined && !(typeof st[key] === "string" && /^[a-z]{0,8}$/.test(st[key]))) errs.push(`${s.id}#${k}: ${key} is a prefix of lowercase letters`);
      for (const key of ["fresh", "lit"]) if (st[key] !== undefined && !(Array.isArray(st[key]) && st[key].every((x) => typeof x === "string" && /^[a-z]{1,8}$/.test(x)))) errs.push(`${s.id}#${k}: ${key} lists prefixes`);
    }
  }
  if (s.kind === "chain" && (s.values || []).length > (L.short ? 5 : 8)) errs.push(`${s.id}: at most ${L.short ? 5 : 8} nodes fit the ${L.short ? "phone" : "stage"}`);
  if (s.kind === "trace" && !(s.traceData?.frames || []).length) errs.push(`${s.id}: trace ${s.trace} is not resolved (no traceData.frames)`);
  if (s.kind === "race" && !(s.raceData?.sizes?.length && (s.raceData.series || []).length && s.raceData.series.every((x) => x.counts?.length === s.raceData.sizes.length))) errs.push(`${s.id}: race ${s.race} needs raceData with sizes and series counts of the same length`);
  if (s.kind === "code" && !s.code?.source) errs.push(`${s.id}: code template ${s.template} (${s.lang}) is not resolved`);
  const edges = s.kind === "flowchart" ? edgesOf(s.diagram || "") : new Set();
  if (s.kind === "quiz") {
    quizzes++;
    if (!s.question || !Array.isArray(s.options) || s.options.length < 3 || s.options.length > 4) errs.push(`${s.id}: quiz needs a question and 3-4 options`);
    if (!(Number.isInteger(s.answer) && s.answer >= 0 && s.answer < (s.options || []).length)) errs.push(`${s.id}: quiz answer must index options`);
    if (!s.explain) errs.push(`${s.id}: quiz needs explain`);
    if (s.steps.length !== 2) errs.push(`${s.id}: quiz needs exactly 2 steps (ask, answer)`);
    // the quiz card has to fit the 16:9 stage with its answer shown: long text is shrunk to fit by Stage (fitQuiz)
    const q = (s.question || "").length, e = (s.explain || "").length;
    const opt = Math.max(0, ...(s.options || []).map((o) => (typeof o === "string" ? o : o?.text || "").length));
    const total = q + e + (s.options || []).reduce((a, o) => a + (typeof o === "string" ? o : o?.text || "").length, 0);
    if (q > 240 || opt > 130 || e > 420 || total > 900) errs.push(`${s.id}: quiz text won't fit the card (question ${q}/200, longest option ${opt}/110, explain ${e}/330, total ${total}/800)`);
    else if (q > 200 || opt > 110 || e > 330 || total > 800) warns.push(`${s.id}: quiz text is long for the card (question ${q}/200, longest option ${opt}/110, explain ${e}/330, total ${total}/800)`);
  }
  const revealMax = s.kind === "numbers" ? (s.numbers || []).length : s.kind === "list" || s.kind === "chart" ? (s.points || []).length : s.kind === "timeline" ? (s.events || []).length : s.kind === "phone" ? Math.max(0, ...(s.screens || []).map((x) => x.rows.length)) : s.kind === "compare" ? (s.left?.points?.length || 0) + (s.right?.points?.length || 0) : 0;
  const src = s.diagram || "";
  const msgs = src.split("\n").filter((l) => /(-{1,2}>>|-{1,2}x|-{1,2}\)|-{1,2}>)/.test(l.trim()) || /^Note\s/i.test(l.trim())).length;
  const ids = new Set([...src.matchAll(/(?:^|[\s>|&-])([A-Za-z][A-Za-z0-9_]*)(?=\s*(?:\[|\(|\{|@\{|-->|==>|-\.->|:::|$|\s*&))/gm)].map((m) => m[1]));
  if (s.kind === "state") for (const m of src.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*-->/gm)) ids.add(m[1]);
  if (s.kind === "state") for (const m of src.matchAll(/-->\s*([A-Za-z_][A-Za-z0-9_]*)/gm)) ids.add(m[1]);
  let lastUpto = 0;
  for (const [k, st] of s.steps.entries()) {
    steps++;
    const w = (st.say || "").split(/\s+/).filter(Boolean).length;
    words += w;
    if (!st.say) errs.push(`${s.id}#${k}: empty say`);
    if (w > 45) warns.push(`${s.id}#${k}: ${w} words (keep steps under ~40)`);
    if (/[→·~₹%$€&<>{}\[\]=*_#|\\]/.test(st.say || "")) warns.push(`${s.id}#${k}: symbol in narration: ${(st.say.match(/[→·~₹%$€&<>{}\[\]=*_#|\\]/g) || []).join(" ")}`);
    if (st.caption && st.caption.split(/\s+/).length > 9) warns.push(`${s.id}#${k}: caption over 9 words`);
    for (const h of st.highlight || []) if (!ids.has(h)) errs.push(`${s.id}#${k}: highlight "${h}" isn't a node id in the diagram`);
    if (st.reveal != null && !["list", "compare", "chart", "timeline", "phone", "numbers"].includes(s.kind)) warns.push(`${s.id}#${k}: reveal only applies to list/compare/chart/timeline/phone/numbers`);
    if (st.flow) {
      if (s.kind !== "flowchart") warns.push(`${s.id}#${k}: flow only applies to flowcharts`);
      else for (let j = 0; j + 1 < st.flow.length; j++) if (!edges.has(`${st.flow[j]}>${st.flow[j + 1]}`)) errs.push(`${s.id}#${k}: flow ${st.flow[j]} -> ${st.flow[j + 1]} isn't an edge in the diagram`);
    }
    for (const h of st.focus || []) if (!ids.has(h)) errs.push(`${s.id}#${k}: focus "${h}" isn't a node id`);
    if (s.kind === "phone" && st.screen != null && !(st.screen >= 0 && st.screen < (s.screens || []).length)) errs.push(`${s.id}#${k}: screen ${st.screen} out of range`);
    if (s.kind === "array") {
      const n = (s.values || []).length;
      if (st.window && !(Array.isArray(st.window) && st.window[0] >= 0 && st.window[1] < n && st.window[0] <= st.window[1] + 1)) errs.push(`${s.id}#${k}: window [${st.window}] outside the array (0..${n - 1})`);
      for (const m of st.mark || []) if (!(m >= 0 && m < n)) errs.push(`${s.id}#${k}: mark ${m} outside the array`);
      for (const [p, v] of Object.entries(st.pointers || {})) if (!(v >= 0 && v < n)) errs.push(`${s.id}#${k}: pointer ${p}=${v} outside the array`);
    }
    if (s.kind === "chain") {
      const n = (s.values || []).length;
      const isId = (v) => Number.isInteger(v) && v >= 0 && v < n;
      if (st.order && !(Array.isArray(st.order) && st.order.every(isId) && new Set(st.order).size === st.order.length)) errs.push(`${s.id}#${k}: order must list distinct node ids 0..${n - 1}`);
      for (const key of ["next", "prev"]) if (st[key] && !(Array.isArray(st[key]) && st[key].length === n && st[key].every((v) => v === null || isId(v)))) errs.push(`${s.id}#${k}: ${key} gives each of the ${n} nodes an id or null`);
      for (const [p, v] of Object.entries(st.labels || {})) if (v !== null && !isId(v)) errs.push(`${s.id}#${k}: label ${p}=${v} is not a node id`);
      for (const m of st.mark || []) if (!isId(m)) errs.push(`${s.id}#${k}: mark ${m} is not a node id`);
    }
    if (s.kind === "trace" && s.traceData && !(Number.isInteger(st.frame) && st.frame >= 0 && st.frame < s.traceData.frames.length)) errs.push(`${s.id}#${k}: frame ${st.frame} outside trace ${s.trace} (0..${s.traceData.frames.length - 1})`);
    if (s.kind === "trace" && s.traceData && /\bpredict\b/i.test(st.say || "") && !s.traceData.frames[st.frame]?.ask) warns.push(`${s.id}#${k}: says "predict" but frame ${st.frame} asks nothing, so no value is hidden`);
    if (s.kind === "code" && s.code) for (const m of st.markers || []) if (!(m >= 1 && m <= s.code.lines.length && s.code.lines[m - 1].length)) errs.push(`${s.id}#${k}: marker ${m} not in template ${s.template} (1..${s.code.lines.length})`);
    if (((st.window && !(s.kind === "queue" && s.mode === "window")) || st.pointers || (st.mark && s.kind !== "chain" && s.kind !== "stack" && s.kind !== "queue" && s.kind !== "tree" && s.kind !== "heap" && s.kind !== "graph")) && s.kind !== "array" && s.kind !== "chars") warns.push(`${s.id}#${k}: window/mark/pointers only apply to array and chars scenes`);
    if ((st.order || st.next || st.labels) && s.kind !== "chain" && s.kind !== "stack" && s.kind !== "queue" && s.kind !== "tree" && s.kind !== "heap" && s.kind !== "graph") warns.push(`${s.id}#${k}: order/next/labels only apply to chain scenes`);
    if (st.markers && s.kind !== "code") warns.push(`${s.id}#${k}: markers only apply to code scenes`);
    if (st.reveal != null && (st.reveal < 0 || st.reveal > revealMax)) errs.push(`${s.id}#${k}: reveal ${st.reveal} outside 0..${revealMax}`);
    if (st.pause != null && !(st.pause >= 0 && st.pause <= 3)) errs.push(`${s.id}#${k}: pause must be 0-3 s`);
    if (s.kind === "sequence" && st.upto) {
      if (st.upto > msgs) errs.push(`${s.id}#${k}: upto ${st.upto} > ${msgs} messages`);
      if (st.upto < lastUpto) warns.push(`${s.id}#${k}: upto goes backwards`);
      lastUpto = st.upto;
    }
  }
}
// course lessons have their own ranges (resources/lectures/README.md, "Course lessons")
const RANGES = { clip: [55, 85, 0, 0, 1, 1], solution: [550, 1100, 0, 1, 8, 18], concept: [1200, 2400, 2, 4, 14, 28], quest: [1700, 2300, 3, 4, 16, 24], preview: [900, 1600, 1, 2, 8, 14], lesson: [2100, 3400, 3, 5, 20, 34], capstone: [2700, 3900, 3, 5, 24, 38], problem: [1900, 2900, 3, 4, 18, 30], lld: [1900, 2900, 3, 4, 18, 30], case: [1500, 2600, 2, 4, 14, 26], interview: [5000, 7800, 0, 3, 28, 80], story: [330, 560, 0, 1, 6, 10], short: [150, 270, 0, 0, 5, 9] };
const kind = L.short ? "short" : L.clip ? "clip" : L.solution ? "solution" : L.dsa ? "concept" : L.lesson ? L.lesson.kind : "quest";
// a DSA lesson's in-article clip: one scene, 20-30 s (about 55-80 words at the voice's 3 words a second plus the
// 0.45 s beat between steps), no quiz; it records at 1280x720 with no music (export.mjs)
if (L.clip) {
  // DSA lessons: dsa--clips--<lesson>--<clip>; System Design Mastery lessons (design patterns): clips--low-level-design--<lesson>--<clip> (src/lib/course/sdm-extras.ts sdmClipQuest)
  const clipQuests = [`dsa--clips--${L.clip.lesson}--${L.clip.id}`, `clips--low-level-design--${L.clip.lesson}--${L.clip.id}`];
  if (!clipQuests.includes(L.quest || "")) errs.push(`clip quest must be ${clipQuests.join(" or ")}`);
  if (!L.clip.caption) errs.push("clip needs a caption");
  if ((L.scenes || []).length !== 1) errs.push("a clip is one scene");
  if ((L.scenes || []).some((s) => s.kind === "quiz")) errs.push("no quizzes in a clip");
  const est = (L.scenes || []).reduce((a, s) => a + s.steps.reduce((b, st) => b + st.say.split(/\s+/).filter(Boolean).length / 3 + 0.45 + (st.pause || 0), 0), 0);
  if (est < 20 || est > 30) errs.push(`clip runs about ${est.toFixed(1)} s (20-30 s)`);
}
if (L.solution && L.quest !== `dsa--solution--${L.solution.problem}`) errs.push(`solution video quest must be dsa--solution--${L.solution.problem}`);
// vertical shorts (resources/shorts/shorts--<long id>.json): portrait-friendly scenes only
if (L.short) {
  // one lecture can give several shorts: shorts--<long id> or shorts--<long id>--<part slug>
  if (!/^shorts--[A-Za-z0-9-]+$/.test(L.quest || "") || !(L.quest === `shorts--${L.short.of}` || (L.quest || "").startsWith(`shorts--${L.short.of}--`))) errs.push(`short quest must be "shorts--${L.short?.of}" or "shorts--${L.short?.of}--<part>"`);
  if (!L.short.of || !L.short.article || !L.short.label) errs.push("short needs of (the long lecture id), article (its page) and label");
  if (!Array.isArray(L.short.topics) || L.short.topics.length < 1 || L.short.topics.length > 3) errs.push("short needs 1-3 topics (lowercase tags like caching, databases, incidents)");
  if (!["tension", "drive", "lofi", "playful", "bright"].includes(L.short.music)) errs.push("short needs music: tension | drive | lofi | playful | bright");
  else for (const tg of L.short.topics) if (!/^[a-z][a-z0-9-]{1,24}$/.test(tg)) errs.push(`topic "${tg}" must be a lowercase tag`);
  // `at` must be a scene of the long lecture (looked up next to this file: ../lectures or ../lectures-next)
  if (L.short.at) {
    const dir = path.dirname(path.resolve(f));
    const longFile = [path.join(dir, "..", "lectures", `${L.short.of}.json`), path.join(dir, "..", "lectures-next", `${L.short.of}.json`)].find((x) => fs.existsSync(x));
    if (!longFile) warns.push(`long lecture ${L.short.of} not found next to this file`);
    else if (!JSON.parse(fs.readFileSync(longFile, "utf8")).scenes?.some((s) => s.id === L.short.at)) errs.push(`at "${L.short.at}" isn't a scene of ${L.short.of}`);
  } else if (!L.short.of.startsWith("war-stories--")) warns.push("short has no at: the full-lecture link opens at the start");
  // a war story told only as a short + its article has no long lecture, so nothing to point `at`
  for (const s of L.scenes || []) {
    if (["quiz"].includes(s.kind)) errs.push(`${s.id}: shorts have no quizzes`);
    // sequence diagrams lay out sideways: on a phone their text is unreadable. Use a top-down flowchart.
    if (s.kind === "sequence") errs.push(`${s.id}: no sequence diagrams in a short (use flowchart TB)`);
    if (s.kind === "flowchart" && ((s.diagram || "").match(/^\s*[A-Za-z][\w-]*\s*[\[({]/gm) || []).length > 6) warns.push(`${s.id}: more than 6 nodes is too small on a phone`);
    if (s.kind === "flowchart" && /^\s*(flowchart|graph)\s+(LR|RL)/m.test(s.diagram || "")) errs.push(`${s.id}: flowcharts in a short run top-down (flowchart TB)`);
    // state diagrams spread sideways and don't zoom in a short: a busy one is unreadable on a phone
    if (s.kind === "state") {
      const tr = (s.diagram || "").split("\n").filter((l) => l.includes("-->"));
      const label = Math.max(0, ...tr.map((l) => (l.split(":")[1] || "").trim().length));
      if (tr.length > 5 || label > 22) warns.push(`${s.id}: a busy state diagram (${tr.length} transitions, ${label}-char label) is unreadable on a phone; use a flowchart TB with 1-3 word labels`);
    }
    if ((s.kind === "numbers" && (s.numbers || []).length > 3) || (s.kind === "list" && (s.points || []).length > 3) || (s.kind === "chart" && (s.points || []).length > 4) || (s.kind === "timeline" && (s.events || []).length > 4) || (s.kind === "compare" && Math.max(s.left?.points?.length || 0, s.right?.points?.length || 0) > 3)) errs.push(`${s.id}: too many items for a phone screen (numbers/list 3, chart/timeline 4, compare 3 a side)`);
    for (const [k, st] of (s.steps || []).entries()) for (const sentence of (st.say || "").split(/(?<=[.!?])\s+/)) if (sentence.split(/\s+/).length > 14) warns.push(`${s.id}#${k}: a ${sentence.split(/\s+/).length}-word sentence (Reels lines are ≤ 12)`);
  }
}
if (L.lesson) {
  if (!["preview", "lesson", "capstone", "problem", "lld", "case", "interview", "story"].includes(L.lesson.kind) || !L.lesson.week || !L.lesson.slug) errs.push("lesson needs week, slug and kind preview|lesson|capstone|problem|lld|case|interview|story");
  if (L.quest !== `${L.lesson.week}--${L.lesson.slug}`) errs.push(`quest must be "${L.lesson.week}--${L.lesson.slug}"`);
}
let index = null;
try {
  index = JSON.parse(fs.readFileSync(new URL("lesson-index.json", `file://${path.resolve(f)}`), "utf8"));
} catch {}
let refs = 0;
for (const s of L.scenes || [])
  for (const [k, st] of s.steps.entries()) {
    if (!st.ref) continue;
    refs++;
    if (!st.ref.lecture || !st.ref.label) errs.push(`${s.id}#${k}: ref needs lecture and label`);
    else if (st.ref.label.split(/\s+/).length > 6) warns.push(`${s.id}#${k}: ref label over 6 words`);
    if (index && st.ref.lecture) {
      const at = index.findIndex((x) => x.id === st.ref.lecture);
      const me = index.findIndex((x) => x.id === L.quest);
      if (at < 0) errs.push(`${s.id}#${k}: ref lecture "${st.ref.lecture}" isn't in lesson-index.json`);
      else if (me >= 0 && at >= me) errs.push(`${s.id}#${k}: ref must point to an earlier lesson`);
    }
  }
if (L.lesson && ["problem", "lld"].includes(L.lesson.kind) && (refs < 2 || refs > 5)) warns.push(`${refs} refs (target 2-5)`);
if (L.lesson && L.lesson.kind === "case" && (refs < 1 || refs > 4)) warns.push(`${refs} refs (target 1-4)`);
if (L.lesson?.kind === "interview" || L.cast) {
  const VOICES = /^(af|am|bf|bm)_[a-z]+$/;
  if (!L.cast?.interviewer?.name || !L.cast?.candidate?.name) errs.push("interview needs cast.interviewer and cast.candidate with name and voice");
  else for (const r of ["interviewer", "candidate"]) if (!VOICES.test(L.cast[r].voice || "")) errs.push(`cast.${r}.voice must be a Kokoro English voice like am_michael`);
  if (L.cast && L.cast.interviewer.voice === L.cast.candidate.voice) errs.push("interviewer and candidate need different voices");
  for (const s of L.scenes || []) for (const [k, st] of s.steps.entries()) if (s.kind !== "quiz" && !["interviewer", "candidate"].includes(st.who)) errs.push(`${s.id}#${k}: who must be interviewer or candidate`);
}
if (L.lesson && L.lesson.kind !== "preview" && index && index.findIndex((x) => x.id === L.quest) > 0 && (refs < 2 || refs > 6)) warns.push(`${refs} refs (target 2-6)`);
if (L.v === 2) {
  const [wMin, wMax, qMin, qMax, sMin, sMax] = RANGES[kind];
  if (words < wMin || words > wMax) warns.push(`narration is ${words} words (${kind} target ${wMin}-${wMax})`);
  if (quizzes < qMin || quizzes > qMax) warns.push(`${quizzes} quiz checkpoints (${kind} target ${qMin}-${qMax})`);
  if ((L.scenes || []).length < sMin || (L.scenes || []).length > sMax) warns.push(`${(L.scenes || []).length} scenes (${kind} target ${sMin}-${sMax})`);
  // 16:9 lectures read left to right; vertical shorts run top-down (checked in the short rules above)
  if (!L.short) for (const s of L.scenes || []) if (s.kind === "flowchart" && /^\s*(flowchart|graph)\s+(TD|TB)/m.test(s.diagram || "")) warns.push(`${s.id}: flowchart should be LR for video`);
  for (const s of L.scenes || []) if (s.kind === "flowchart" && /<br\/?>/.test(s.diagram || "")) warns.push(`${s.id}: flowchart labels should be one line (no <br/>)`);
}
console.log(`${f.split("/").pop()}: ${L.scenes?.length} scenes, ${steps} steps, ${words} words (~${(words / 150).toFixed(1)} min), ${quizzes} quizzes`);
for (const w of warns) console.log("  warn:", w);
for (const e of errs) console.log("  ERROR:", e);
process.exit(errs.length ? 1 : 0);
