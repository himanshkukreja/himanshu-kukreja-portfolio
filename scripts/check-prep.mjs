// Interview-prep company files (resources/interview-prep/companies/*.md, rules in that folder's README):
// YAML parses, required fields, every "reported" question has a source URL, every link is a real course
// article (folder/file-slug), no duplicate questions in a file.
// usage: node scripts/check-prep.mjs [content dir]   (default: $SDM_LOCAL_DIR or ../system-design-mastery)
//        exit 1 on any failure
import fs from "fs";
import path from "path";
import matter from "gray-matter";

const root = path.resolve(process.argv[2] || process.env.SDM_LOCAL_DIR || path.join(process.cwd(), "..", "system-design-mastery"));
const res = path.join(root, "resources");
const DIR = path.join(res, "interview-prep", "companies");
const CATS = ["big-tech", "fintech", "commerce", "food-and-delivery", "mobility", "media", "trading", "saas", "travel", "gaming", "social", "other"];
const TYPES = ["system-design", "lld", "concept"];

const articles = new Set();
for (const d of fs.readdirSync(res)) {
  const full = path.join(res, d);
  if (!fs.statSync(full).isDirectory()) continue;
  for (const f of fs.readdirSync(full)) if (f.endsWith(".md")) articles.add(`${d}/${f.replace(/\.md$/, "")}`);
}

let failures = 0;
let questions = 0;
let reported = 0;
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md") : [];
for (const f of files) {
  const errs = [];
  let d;
  try {
    d = matter(fs.readFileSync(path.join(DIR, f), "utf8")).data;
  } catch (e) {
    console.log(`${f}: YAML does not parse: ${String(e.message).split("\n")[0]}`);
    failures++;
    continue;
  }
  if (!d.company) errs.push("missing company");
  if (!CATS.includes(d.category)) errs.push(`category "${d.category}" is not one of ${CATS.join(", ")}`);
  if (!d.builds) errs.push("missing builds");
  for (const r of d.rounds || []) if (!/^https?:\/\//.test(r?.source || "")) errs.push(`round "${r?.name}" needs a source URL`);
  const seen = new Set();
  for (const q of d.questions || []) {
    questions++;
    const t = String(q?.q || "").trim();
    if (!t) errs.push("a question has no q");
    const key = `${q?.type}:${t.toLowerCase()}`;
    if (seen.has(key)) errs.push(`duplicate question "${t}"`);
    seen.add(key);
    if (!TYPES.includes(q?.type)) errs.push(`"${t}": type "${q?.type}"`);
    if (!["reported", "likely"].includes(q?.evidence)) errs.push(`"${t}": evidence "${q?.evidence}"`);
    if (q?.evidence === "reported") {
      reported++;
      const src = (q.sources || []).filter((s) => /^https?:\/\/\S+$/.test(s?.url || ""));
      if (!src.length) errs.push(`"${t}": reported without a source URL`);
    }
    for (const l of q?.links || []) if (!articles.has(l)) errs.push(`"${t}": unknown article "${l}"`);
  }
  if ((d.questions || []).length < 4) errs.push(`only ${(d.questions || []).length} questions`);
  if (errs.length) {
    failures += errs.length;
    for (const e of errs) console.log(`${f}: ${e}`);
  }
}
console.log(`companies ${files.length}, questions ${questions}, reported ${reported}, failing ${failures}`);
process.exit(failures ? 1 : 0);
