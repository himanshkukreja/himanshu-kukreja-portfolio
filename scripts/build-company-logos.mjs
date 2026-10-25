// Company logos for the Prep tab: picks each company's mark from Simple Icons (@iconify-json/simple-icons,
// CC0 SVG data; the marks stay their owners' trademarks) and writes only those to
// src/lib/learn/prep/logos.json, so pages never load the whole icon set. Companies without a Simple Icons
// mark (or whose mark would be another brand's) get a monogram tile on the site instead.
// usage: node scripts/build-company-logos.mjs [content dir]   (re-run after adding a company)
import fs from "fs";
import path from "path";
import matter from "gray-matter";

const root = path.resolve(process.argv[2] || process.env.SDM_LOCAL_DIR || path.join(process.cwd(), "..", "system-design-mastery"));
const DIR = path.join(root, "resources", "interview-prep", "companies");
const si = JSON.parse(fs.readFileSync(path.join(process.cwd(), "node_modules/@iconify-json/simple-icons/icons.json"), "utf8"));

/** company slug → Simple Icons name, where they differ; null = no mark (monogram) */
const ALIAS = { "goldman-sachs": "goldmansachs", "walmart-global-tech": "walmart", "jpmorgan-chase": null, jiohotstar: null };

const out = {};
const missing = [];
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".md") && x.toLowerCase() !== "readme.md")) {
  const slug = f.replace(/\.md$/, "");
  const name = String(matter(fs.readFileSync(path.join(DIR, f), "utf8")).data.company || slug);
  const key = slug in ALIAS ? ALIAS[slug] : [slug, slug.replace(/-/g, ""), name.toLowerCase().replace(/[^a-z0-9]/g, "")].find((k) => si.icons[k]);
  const icon = key && si.icons[key];
  if (!icon) {
    missing.push(slug);
    continue;
  }
  const w = icon.width ?? si.width ?? 24;
  const h = icon.height ?? si.height ?? 24;
  out[slug] = { body: icon.body, viewBox: `0 0 ${w} ${h}` };
}
const file = path.join(process.cwd(), "src/lib/learn/prep/logos.json");
fs.writeFileSync(file, JSON.stringify(out, null, 0) + "\n");
console.log(`logos ${Object.keys(out).length} (${Math.round(fs.statSync(file).size / 1024)} KB) · monogram ${missing.length}: ${missing.join(", ")}`);
