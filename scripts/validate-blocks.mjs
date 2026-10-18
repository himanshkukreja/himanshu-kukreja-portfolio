#!/usr/bin/env node
// Validates `:::` course blocks exactly as the site parses them (remark-parse + gfm + directive).
// usage: node scripts/validate-blocks.mjs <file.md> [...]   (exit 1 on any failure)
//        --ascii   also list ASCII box blocks still left in each file
import fs from "fs";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import { visit } from "unist-util-visit";
import path from "path";
import { fileURLToPath } from "url";
import { createJiti } from "jiti";

// `::anim[name]` explainers (src/lib/course/anim/catalog.ts) and `%% steps:` diagram annotations
// (src/lib/diagrams/steps.ts) are checked against the site's own sources
const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(siteRoot, "src") } });
const { ANIMS, COMMON_ANIM_OPTS } = await jiti.import(path.join(siteRoot, "src/lib/course/anim/catalog.ts"));
const { parseSteps, diagramKind, countSequenceMessages } = await jiti.import(path.join(siteRoot, "src/lib/diagrams/steps.ts"));

const SPEC = {
  panel: { attrs: ["tone"] },
  compare: { attrs: [], children: "col" },
  col: { attrs: ["tone"], parent: "compare", title: true },
  steps: { attrs: ["dir"], list: "ordered" },
  tree: { attrs: [], list: "bullet" },
  callout: { attrs: ["type"] },
  stats: { attrs: [], list: "bullet", boldFirst: true },
  calc: { attrs: [], listOrTable: true },
  timeline: { attrs: [], list: "bullet", boldFirst: true },
  // side quests: "your turn" prompt with a hidden answer, and the mission brief the quest hero shows
  checkpoint: { attrs: [], title: true, child: "answer" },
  answer: { attrs: [], parent: "checkpoint" },
  mission: { attrs: ["level"], title: true, list: "bullet", boldFirst: true },
};
const VALUES = {
  tone: ["core", "info", "ok", "bad", "warn", "note"],
  type: ["tip", "key", "warn", "bad", "ok", "info"],
  dir: ["down", "right"],
  level: ["Medium", "Hard", "Expert"],
};
const BOX = /[┌┐└┘│─═║╔╗╚╝├┤┬┴┼]/;
const ICON_NAMES = JSON.parse(fs.readFileSync(new URL("../src/lib/diagrams/icons/names.json", import.meta.url), "utf8"));
const ICONS = Object.fromEntries(Object.entries(ICON_NAMES).map(([k, v]) => [k, new Set(v)]));
const ICON_REF = /@\{(?:[^}"]|"[^"]*")*?\bicon\s*:\s*"([^"]*)"/g;

const args = process.argv.slice(2);
const listAscii = args.includes("--ascii");
const files = args.filter((a) => !a.startsWith("--"));
let failed = 0, blocks = 0, asciiLeft = 0;
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkDirective);

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const tree = parser.parse(src);
  const errs = [];
  const at = (n) => `${file}:${n.position?.start.line ?? "?"}`;
  visit(tree, (node, _i, parent) => {
    if (node.type === "leafDirective" && node.name === "anim") {
      const name = node.children.map((c) => c.value || "").join("").trim();
      const meta = ANIMS[name];
      if (!meta) {
        errs.push(`${at(node)} ::anim[${name}]: unknown explainer (known: ${Object.keys(ANIMS).join(", ")})`);
        return;
      }
      const allowed = { ...COMMON_ANIM_OPTS, ...(meta.opts || {}) };
      for (const [k, v] of Object.entries(node.attributes || {})) {
        const spec = allowed[k];
        if (!spec) errs.push(`${at(node)} ::anim[${name}]: unknown attribute ${k} (allowed: ${Object.keys(allowed).join(", ")})`);
        else if (Array.isArray(spec) && !spec.includes(v)) errs.push(`${at(node)} ::anim[${name}]: ${k}="${v}" not in ${spec.join("|")}`);
        else if (spec === "int" && !/^\d+$/.test(v)) errs.push(`${at(node)} ::anim[${name}]: ${k} must be a whole number`);
      }
      if (parent?.type !== "root" && parent?.type !== "containerDirective") errs.push(`${at(node)} ::anim[${name}]: put explainers on their own line at the top level (or inside a ::: block), not in a list or quote`);
      return;
    }
    if (node.type === "textDirective" || node.type === "leafDirective") {
      // prose like "ratio:high" parses as a text directive; the site turns these back into text
      if (node.type === "leafDirective" || SPEC[node.name]) errs.push(`${at(node)} stray ${node.type} "${node.name}" — only ::: containers are allowed`);
      return;
    }
    if (node.type !== "containerDirective") return;
    blocks++;
    const spec = SPEC[node.name];
    if (!spec) return errs.push(`${at(node)} unknown block ":::${node.name}"`);
    for (const [k, v] of Object.entries(node.attributes || {})) {
      if (!spec.attrs.includes(k)) errs.push(`${at(node)} ${node.name}: unknown attribute ${k}`);
      else if (VALUES[k] && !VALUES[k].includes(v)) errs.push(`${at(node)} ${node.name}: ${k}="${v}" not in ${VALUES[k].join("|")}`);
    }
    const kids = node.children.filter((c) => !(c.data && c.data.directiveLabel));
    const label = node.children.find((c) => c.data && c.data.directiveLabel);
    if (spec.parent && parent?.name !== spec.parent) errs.push(`${at(node)} :::${node.name} must be inside ::::${spec.parent}`);
    if (spec.title && !label) errs.push(`${at(node)} :::${node.name} needs a [title]`);
    if (spec.children) {
      const cols = kids.filter((c) => c.type === "containerDirective" && c.name === spec.children);
      if (cols.length < 2 || cols.length > 4) errs.push(`${at(node)} ${node.name}: ${cols.length} :::${spec.children} (need 2-4)`);
      if (kids.length !== cols.length) errs.push(`${at(node)} ${node.name}: only :::${spec.children} blocks allowed directly inside (check colon counts)`);
    }
    if (spec.child) {
      const n = kids.filter((c) => c.type === "containerDirective" && c.name === spec.child).length;
      if (n !== 1) errs.push(`${at(node)} ${node.name}: needs exactly one :::${spec.child} inside (found ${n}; the outer fence needs more colons)`);
    }
    if (node.name === "mission" && parent?.type !== "root") errs.push(`${at(node)} mission: must be a top-level block (the quest hero lifts it out)`);
    if (spec.list) {
      const lists = kids.filter((c) => c.type === "list");
      const want = spec.list === "ordered";
      if (lists.length !== 1 || !!lists[0].ordered !== want) errs.push(`${at(node)} ${node.name}: needs exactly one ${spec.list} list`);
      else if (spec.boldFirst) {
        lists[0].children.forEach((li, i) => {
          const first = li.children[0]?.children?.[0];
          if (!first || first.type !== "strong") errs.push(`${at(node)} ${node.name}: item ${i + 1} must start with **bold**`);
        });
      }
    }
    if (spec.listOrTable && !kids.some((c) => c.type === "list" || c.type === "table")) errs.push(`${at(node)} calc: needs a list or a table`);
    // a mismatched closing fence makes a block swallow the rest of the lesson: catch that
    const swallowed = [];
    visit(node, "heading", (h) => { if (h.depth <= 3) swallowed.push(h); });
    if (swallowed.length) errs.push(`${at(node)} ${node.name}: contains a level-${swallowed[0].depth} heading (line ${swallowed[0].position?.start.line}) — unclosed block? use #### inside blocks`);
    visit(node, "code", (c) => { if (c.lang === "quiz" || c.lang === "mermaid") errs.push(`${at(node)} ${node.name}: contains a \`\`\`${c.lang} block (line ${c.position?.start.line}) — unclosed block?`); });
    if (node.position && node.position.end.offset >= src.trimEnd().length - 1 && !/^:{3,}\s*$/m.test(src.trimEnd().split("\n").pop())) errs.push(`${at(node)} ${node.name}: runs to the end of the file — unclosed block?`);
    const span = (node.position?.end.line ?? 0) - (node.position?.start.line ?? 0);
    if (span > 220) errs.push(`${at(node)} ${node.name}: spans ${span} lines — check the closing fence`);
    if (/[\u{1F300}-\u{1FAFF}✅❌]/u.test(src.slice(node.position.start.offset, node.position.end.offset))) errs.push(`${at(node)} ${node.name}: emoji`);
  });
  // unclosed / mismatched fences show up as literal ':::' paragraphs
  visit(tree, "paragraph", (p) => {
    const t = p.children.map((c) => c.value || "").join("");
    if (/^:{3,}/.test(t)) errs.push(`${at(p)} literal "${t.slice(0, 30)}" — unbalanced ::: fence?`);
  });
  // step-through annotations: every step parses and names nodes / edges / messages the diagram has
  visit(tree, "code", (c) => {
    if (c.lang !== "mermaid" || !/%%\s*steps\s*:/i.test(c.value)) return;
    const perrs = [];
    const spec = parseSteps(c.value, perrs);
    perrs.forEach((e) => errs.push(`${at(c)} mermaid steps: ${e}`));
    if (!spec || spec.mode !== "manual") return;
    const body = c.value.split("\n").filter((l) => !l.trim().startsWith("%%"));
    const has = (id) => body.some((l) => new RegExp(`(^|[^\\w-])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w-]|$)`).test(l));
    const msgs = diagramKind(c.value) === "sequenceDiagram" ? countSequenceMessages(c.value) : 0;
    spec.steps.forEach((st, i) => {
      for (const t of st.targets) {
        if (t.kind === "msg" && t.to > msgs) errs.push(`${at(c)} mermaid steps: step ${i + 1} names message ${t.to}, the diagram has ${msgs}`);
        if (t.kind === "node" && !has(t.id)) errs.push(`${at(c)} mermaid steps: step ${i + 1}: no node or subgraph "${t.id}"`);
        if (t.kind === "edge") {
          if (!has(t.from) || !has(t.to)) errs.push(`${at(c)} mermaid steps: step ${i + 1}: edge ${t.from} --> ${t.to} names a missing node`);
          else if (!body.some((l) => { const a = l.search(new RegExp(`(^|[^\\w-])${t.from}([^\\w-]|$)`)); const b = l.lastIndexOf(t.to); return a >= 0 && b > a && /--|==|-\./.test(l.slice(a, b)); }))
            errs.push(`${at(c)} mermaid steps: step ${i + 1}: no edge ${t.from} --> ${t.to} in the diagram`);
        }
      }
    });
  });
  // diagram icons: every `icon: "pack:name"` must exist in the site's packs (Mermaid draws "?" otherwise)
  visit(tree, "code", (c) => {
    if (c.lang !== "mermaid") return;
    for (const m of c.value.matchAll(ICON_REF)) {
      const [pack, name] = m[1].split(":");
      if (!ICONS[pack]?.has(name)) errs.push(`${at(c)} mermaid: unknown icon "${m[1]}" (see DIAGRAMS.md; add it in scripts/build-diagram-icons.mjs)`);
    }
  });
  // unclosed ``` fences: remark runs an unclosed fence to the end of its container (file, list item,
  // quote), and a ```quiz / ```mermaid that swallows the next section can still look closed when it
  // happens to end at another block's closer, so also flag headings or fence openers inside them
  visit(tree, "code", (c, _i, parent) => {
    if (!c.position) return;
    const lines = src.slice(c.position.start.offset, c.position.end.offset).split("\n");
    const strip = (l) => l.replace(/^[\s>]*/, "");
    const open = strip(lines[0]).match(/^(`{3,}|~{3,})/);
    if (!open) return; // indented code block, no fence
    const closer = new RegExp(`^\\${open[1][0]}{${open[1].length},}\\s*$`);
    if (lines.length < 2 || !closer.test(strip(lines[lines.length - 1])))
      errs.push(`${at(c)} unclosed \`\`\`${c.lang ?? ""} fence: no closing ${open[1]} before the end of the ${parent?.type === "root" ? "file" : parent?.type ?? "file"}`);
    if (c.lang !== "quiz" && c.lang !== "mermaid") return;
    c.value.split("\n").forEach((l, i) => {
      const line = c.position.start.line + 1 + i;
      if (/^#{1,2} /.test(l)) errs.push(`${at(c)} \`\`\`${c.lang} block contains a markdown heading at line ${line} ("${l.slice(0, 40)}") — unclosed fence?`);
      else if (/^\s*(`{3,}|~{3,})\S/.test(l)) errs.push(`${at(c)} \`\`\`${c.lang} block contains a fence opener at line ${line} ("${l.trim().slice(0, 30)}") — unclosed fence?`);
    });
  });
  if (listAscii) {
    visit(tree, "code", (c) => {
      if (["", "text", "txt", "plaintext", "ascii", null].includes(c.lang ?? "") && c.value.split("\n").filter((l) => BOX.test(l)).length >= 2) {
        asciiLeft++;
        console.log(`  ascii ${file}:${c.position.start.line}`);
      }
    });
  }
  if (errs.length) { failed++; console.log(`FAIL ${file}\n  ${errs.join("\n  ")}`); }
}
console.log(`files ${files.length}, blocks ${blocks}, failing files ${failed}${listAscii ? `, ascii boxes left ${asciiLeft}` : ""}`);
process.exit(failed ? 1 : 0);
