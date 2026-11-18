/**
 * Eval for the DSA ⌘K palette: the lessons (Academy, streets, camp tents, sets) and problems it lists, ranked the way the
 * palette ranks them. hit@5 = an expected page is among the first 5 results.
 *
 *   node scripts/dsa-palette-eval.mjs                       the palette as it is now
 *   node scripts/dsa-palette-eval.mjs --legacy              the palette before 18 Nov: Fuse over lessons, the engine over problems only
 *   node scripts/dsa-palette-eval.mjs --set other.json      another query file (default: dsa-search-eval.json + dsa-search-eval-new.json)
 *
 * Query files: { queries: [{ q, ids: ["<problem id>" | "dsa/sets/co-fintech/warm-up-round"] }] } (queries with a `topic` are skipped here).
 * Reads the content straight from DSA_LOCAL_DIR (default ~/.cache/hk-render/dsa-content).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import matter from "gray-matter";
import Fuse from "fuse.js";

register("data:text/javascript," + encodeURIComponent(`export async function resolve(s, c, next) { try { return await next(s, c); } catch (e) { if (s.startsWith(".") && !/\\.\\w+$/.test(s)) return next(s + ".ts", c); throw e; } }`));
const root = path.resolve(import.meta.dirname, "..");
const L = (p) => import(path.join(root, "src/lib/dsa", p));
const { buildDsaDocs } = await L("search-index.ts");
const { parseLeanPlan } = await L("kinds.ts");
const { classicsOf } = await L("classics.ts");
const { blurbOf } = await L("bundle.ts");
const { itemFromDoc } = await L("search/items.ts");
const { buildIndex, search } = await L("search/engine.ts");

const base = path.join(process.env.DSA_LOCAL_DIR || path.join(os.homedir(), ".cache/hk-render/dsa-content"), "resources");
const yml = (src) => matter(`---\n${src}\n---`).data;
const read = (p) => (fs.existsSync(path.join(base, p)) ? fs.readFileSync(path.join(base, p), "utf8") : null);

const concepts = (yml(read("concepts.yml") || "") .concepts || []).map((c) => ({ id: c.id, module: c.module, order: c.order ?? 0, title: c.title, status: c.status === "built" ? "built" : "planned", summary: c.summary || "", ...(c.kind === "structure" || c.kind === "algorithm" ? { kind: c.kind } : {}) }));
const problems = [];
for (const id of fs.readdirSync(path.join(base, "problems")).sort()) {
  const md = read(`problems/${id}/problem.md`);
  if (!md) continue;
  const f = matter(md).data;
  const t = f.tags || {};
  problems.push({ id, title: f.title || id, module: f.module || "", concept: f.concept || "", level: f.level === "easy" || f.level === "hard" ? f.level : "medium", patterns: t.patterns || [], classic: classicsOf(id, t.classic), role: f.role, companyTypes: t.companyTypes || [], own: { structures: t.structures, algorithms: t.algorithms }, blurb: blurbOf(md), domain: typeof t.domain === "string" ? t.domain : undefined, signals: Array.isArray(t.signals) ? t.signals.slice(0, 4) : undefined });
}
const lean = [];
for (const l of parseLeanPlan(yml(read("plan/curriculum.yml") || ""))) {
  const md = read(`${l.kind === "street" ? "districts" : l.kind === "camp-tent" ? "camps" : "sets"}/${l.module}/${l.id}/lesson.md`);
  if (!md) continue;
  const f = matter(md).data;
  lean.push({ id: l.id, module: l.module, kind: l.kind, title: f.title || l.title, summary: f.summary || "", where: l.moduleTitle });
}
const docs = buildDsaDocs(concepts, problems, () => "", lean);
const pathOf = (d) => d.path;

const legacy = process.argv.includes("--legacy");
let rank;
if (legacy) {
  const probs = docs.filter((d) => d.week === "dsa/problems");
  const eng = buildIndex(probs.map((d) => itemFromDoc({ slug: d.slug, title: d.title, content: d.content, meta: d.meta })));
  const fuse = new Fuse(docs, { keys: [{ name: "title", weight: 3 }, { name: "content", weight: 1 }, { name: "week", weight: 0.6 }], threshold: 0.35, ignoreLocation: true, minMatchCharLength: 2 });
  rank = (q) => {
    const top = search(eng, q, { limit: 6 });
    const dsa = top.map((h) => `dsa/problems/${h.item.id}`);
    const other = fuse.search(q).filter((r) => r.item.week !== "dsa/problems").slice(0, 8).map((r) => pathOf(r.item));
    return (top[0] && top[0].score >= 250 ? [...dsa, ...other] : [...other, ...dsa]).slice(0, 10);
  };
} else {
  const { buildPaletteIndex, paletteHits } = await L("search/palette.ts");
  const eng = buildPaletteIndex(docs);
  rank = (q) => paletteHits(eng, q, 10).map((h) => h.item.path || `dsa/problems/${h.item.id}`);
}

const files = process.argv.includes("--set") ? [process.argv[process.argv.indexOf("--set") + 1]] : ["scripts/dsa-search-eval.json", "scripts/dsa-search-eval-new.json"];
let n = 0, ok = 0, newN = 0, newOk = 0;
for (const f of files) {
  const isNew = /-new\./.test(f);
  for (const q of JSON.parse(fs.readFileSync(path.resolve(root, f), "utf8")).queries) {
    if (!q.ids) continue;
    const want = q.ids.map((x) => (x.includes("/") ? x : `dsa/problems/${x}`));
    const got = rank(q.q);
    const hit = got.slice(0, 5).some((g) => want.includes(g));
    n++; if (hit) ok++;
    if (isNew) { newN++; if (hit) newOk++; }
    if (!hit || isNew) console.log(`${hit ? "ok " : "MISS"} ${q.q.padEnd(44)} ${hit ? "" : "got: " + got.slice(0, 3).join(", ")}`);
  }
}
console.log(`\n${legacy ? "legacy" : "current"} palette: hit@5 all ${ok}/${n} = ${((100 * ok) / n).toFixed(1)}%, new-content set ${newOk}/${newN}`);
if (process.argv.includes("--show")) {
  for (const q of process.argv.slice(process.argv.indexOf("--show") + 1)) console.log(q, "=>", rank(q).slice(0, 6));
}
