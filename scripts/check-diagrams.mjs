// Parse every ```mermaid block in the given markdown files with the site's mermaid package and flag
// icon names the site's packs don't have (Mermaid would draw a "?").
// usage: node scripts/check-diagrams.mjs <file.md> [...]   (exit 1 on any failure)
import fs from "fs";

const purify = (await import("dompurify")).default;
if (typeof purify.addHook !== "function") {
  // Node: DOMPurify is an inert stub; parse only needs these to exist
  Object.assign(purify, { addHook() {}, removeHook() {}, removeHooks() {}, removeAllHooks() {}, sanitize: (v) => String(v ?? "") });
}
const mermaid = (await import("mermaid")).default;
const names = JSON.parse(fs.readFileSync(new URL("../src/lib/diagrams/icons/names.json", import.meta.url), "utf8"));
const KNOWN = { tech: new Set(names.tech), sd: new Set(names.sd) };
const ICON_REF = /@\{(?:[^}"]|"[^"]*")*?\bicon\s*:\s*"([^"]*)"/g;

let failures = 0, diagrams = 0, icons = 0;
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
    diagrams++;
    const body = m[1];
    const line = src.slice(0, m.index).split("\n").length;
    const bad = [];
    for (const r of body.matchAll(ICON_REF)) {
      icons++;
      const [pack, name] = r[1].split(":");
      if (!name || !KNOWN[pack]?.has(name)) bad.push(r[1]);
    }
    if (bad.length) { failures++; console.log(`${file}:${line}  unknown icons: ${bad.join(", ")}`); }
    try { await mermaid.parse(body); } catch (e) { failures++; console.log(`${file}:${line}  parse error: ${String(e.message).split("\n")[0].slice(0, 200)}`); }
  }
}
console.log(`files ${process.argv.length - 2}, diagrams ${diagrams}, icon nodes ${icons}, failing ${failures}`);
process.exit(failures ? 1 : 0);
