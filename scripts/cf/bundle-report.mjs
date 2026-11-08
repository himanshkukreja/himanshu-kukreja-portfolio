// What the Worker bundle is made of, from wrangler's esbuild metafile (`wrangler deploy --dry-run --metafile`).
// Groups the bytes each input contributes to the output by npm package, or by app folder for our own code, so we can
// see what to slim or move to its own Worker. Workers Paid allows 10 MiB of compressed code per Worker.
// Usage: node scripts/cf/bundle-report.mjs <metafile.json> [top=30]   (prints a Markdown table)
import { readFileSync } from "node:fs";

const [file, topArg] = process.argv.slice(2);
const meta = JSON.parse(readFileSync(file, "utf8"));
const top = Number(topArg) || 30;

function group(path) {
  const p = path.replace(/\\/g, "/");
  const nm = p.lastIndexOf("node_modules/");
  if (nm >= 0) {
    const rest = p.slice(nm + "node_modules/".length).split("/");
    return `npm: ${rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0]}`;
  }
  // Next's compiled server output: chunks and per-route bundles
  const m = p.match(/\.next\/server\/(app\/[^/]+(?:\/[^/]+)?|chunks|pages|edge-chunks|[^/]+)/);
  if (m) return `next: ${m[1]}`;
  return `other: ${p.split("/").slice(-3).join("/")}`;
}

const sums = new Map();
let total = 0;
for (const out of Object.values(meta.outputs || {})) {
  for (const [path, info] of Object.entries(out.inputs || {})) {
    const b = info.bytesInOutput || 0;
    total += b;
    const g = group(path);
    sums.set(g, (sums.get(g) || 0) + b);
  }
}
const rows = [...sums].sort((a, b) => b[1] - a[1]).slice(0, top);
const mib = (b) => (b / 1048576).toFixed(2);
console.log(`\n### Worker bundle by source (${mib(total)} MiB raw)\n`);
console.log("| MiB | share | source |\n|---:|---:|---|");
for (const [g, b] of rows) console.log(`| ${mib(b)} | ${((b / total) * 100).toFixed(1)}% | ${g} |`);
