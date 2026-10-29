// Side-quest follow-up drills (resources/quest-drills/<quest slug>.md, see its README): flags drills
// without a quest, items missing a field, unknown kinds, item counts outside 8–12, and a `Section` that
// names no heading of the quest. Quests without drills are listed, not failed (drills are optional).
// usage: node scripts/check-drills.mjs [content dir]   (default: $SDM_LOCAL_DIR or ../system-design-mastery)
//        exit 1 on any failure
import fs from "fs";
import path from "path";

const root = path.resolve(process.argv[2] || process.env.SDM_LOCAL_DIR || path.join(process.cwd(), "..", "system-design-mastery"));
const QUESTS = path.join(root, "resources", "bonus-problems");
const DRILLS = path.join(root, "resources", "quest-drills");
const KINDS = ["failure", "scale", "trade-off", "alternative", "consistency", "security", "cost"];
const FIELDS = ["Kind", "Pushes on", "Strong answer", "Must mention", "Weak answer", "Section"];

const md = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md") : []);
const quests = new Set(md(QUESTS).map((f) => f.replace(/\.md$/, "")));
const drills = md(DRILLS).map((f) => f.replace(/\.md$/, ""));
// same normalisation as linkSections in src/lib/learn/drills/parse.ts
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(msg);
};

for (const d of drills) {
  if (!quests.has(d)) {
    fail(`drills without a quest: ${d} (the file name must match the quest's, case included)`);
    continue;
  }
  const quest = fs.readFileSync(path.join(QUESTS, `${d}.md`), "utf8").replace(/^```[\s\S]*?^```/gm, "");
  const heads = [...quest.matchAll(/^#{1,4}\s+(.+)$/gm)].map((m) => norm(m[1])).filter(Boolean);
  const src = fs.readFileSync(path.join(DRILLS, `${d}.md`), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "");
  const items = src.split(/^##[ \t]+/m).slice(1);
  if (items.length < 8 || items.length > 12) fail(`${d}: ${items.length} items (8–12 expected)`);
  const kinds = new Set();
  items.forEach((block, i) => {
    const [q, ...rest] = block.trim().split("\n");
    const at = `${d} #${i + 1} "${q.slice(0, 60)}"`;
    const body = rest.join("\n");
    const field = (f) => {
      const m = body.match(new RegExp(`^\\*\\*${f}:\\*\\*[ \\t]*([\\s\\S]*?)(?=^\\*\\*(?:${FIELDS.join("|")}):\\*\\*|$(?![\\s\\S]))`, "mi"));
      return m ? m[1].trim() : null;
    };
    for (const f of FIELDS) if (!field(f)) fail(`${at}: missing **${f}:**`);
    const kind = (field("Kind") || "").toLowerCase();
    if (kind && !KINDS.includes(kind)) fail(`${at}: unknown kind "${kind}" (${KINDS.join(", ")})`);
    kinds.add(kind);
    const bullets = (field("Must mention") || "").split("\n").filter((l) => /^\s*[-*]\s/.test(l)).length;
    if (bullets < 2 || bullets > 3) fail(`${at}: ${bullets} must-mention bullets (2–3 expected)`);
    const section = norm((field("Section") || "").replace(/^\[(.*)\]$/, "$1"));
    if (section && !heads.some((h) => h === section || h.startsWith(section) || (h.length >= 8 && section.startsWith(h)))) fail(`${at}: section "${field("Section")}" is not a heading of the quest`);
  });
  const missingKinds = ["failure", "trade-off", "alternative", "consistency"].filter((k) => !kinds.has(k));
  if (!kinds.has("scale") && !kinds.has("cost")) missingKinds.push("scale or cost");
  if (missingKinds.length) fail(`${d}: no ${missingKinds.join(", ")} item`);
}

const without = [...quests].filter((q) => !drills.includes(q));
console.log(`quests ${quests.size}, with drills ${drills.length}, without ${without.length}, failing ${failures}`);
process.exit(failures ? 1 : 0);
