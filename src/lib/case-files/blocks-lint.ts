/**
 * `:::` block rules, ported 1:1 from scripts/validate-blocks.mjs (keep the two in sync): the same
 * parser the site uses (remark-parse + gfm + directive), the same names/attributes/structure checks.
 * `::anim[name]{…}` explainers are checked against the catalog and `%% steps:` diagram annotations
 * against the diagram, as the script does. Works on an already parsed mdast tree so the case-file
 * validator parses the body once.
 */
import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import { ANIMS, COMMON_ANIM_OPTS } from "@/lib/course/anim/catalog";
import { countSequenceMessages, diagramKind, parseSteps } from "@/lib/diagrams/steps";

type Spec = { attrs: string[]; children?: string; parent?: string; title?: boolean; list?: "ordered" | "bullet"; boldFirst?: boolean; listOrTable?: boolean };

export const BLOCK_SPEC: Record<string, Spec> = {
  panel: { attrs: ["tone"] },
  compare: { attrs: [], children: "col" },
  col: { attrs: ["tone"], parent: "compare", title: true },
  steps: { attrs: ["dir"], list: "ordered" },
  tree: { attrs: [], list: "bullet" },
  callout: { attrs: ["type"] },
  stats: { attrs: [], list: "bullet", boldFirst: true },
  calc: { attrs: [], listOrTable: true },
  timeline: { attrs: [], list: "bullet", boldFirst: true },
};

export const BLOCK_VALUES: Record<string, string[]> = {
  tone: ["core", "info", "ok", "bad", "warn", "note"],
  type: ["tip", "key", "warn", "bad", "ok", "info"],
  dir: ["down", "right"],
};

export type BlockIssue = { line: number; message: string };

type Node = {
  type: string;
  name?: string;
  depth?: number;
  lang?: string | null;
  ordered?: boolean | null;
  value?: string;
  attributes?: Record<string, string | null | undefined> | null;
  children?: Node[];
  data?: { directiveLabel?: boolean };
  position?: { start: { line: number; offset?: number }; end: { line: number; offset?: number } };
};

export function lintBlocks(tree: Root, src: string): { issues: BlockIssue[]; blocks: number } {
  const issues: BlockIssue[] = [];
  let blocks = 0;
  const line = (n: Node) => n.position?.start.line ?? 1;
  const err = (n: Node, message: string) => issues.push({ line: line(n), message });

  visit(tree as never, (raw: unknown, _i: unknown, parentRaw: unknown) => {
    const node = raw as Node;
    const parent = parentRaw as Node | undefined;
    if (node.type === "leafDirective" && node.name === "anim") {
      const name = (node.children || []).map((c) => c.value || "").join("").trim();
      const meta = ANIMS[name];
      if (!meta) {
        err(node, `::anim[${name}]: unknown explainer (known: ${Object.keys(ANIMS).join(", ")})`);
        return;
      }
      const allowed = { ...COMMON_ANIM_OPTS, ...(meta.opts || {}) };
      for (const [k, val] of Object.entries(node.attributes || {})) {
        const v = String(val ?? "");
        const spec = allowed[k];
        if (!spec) err(node, `::anim[${name}]: unknown attribute ${k} (allowed: ${Object.keys(allowed).join(", ")})`);
        else if (Array.isArray(spec) && !spec.includes(v)) err(node, `::anim[${name}]: ${k}="${v}" is not one of ${spec.join(" | ")}`);
        else if (spec === "int" && !/^\d+$/.test(v)) err(node, `::anim[${name}]: ${k} must be a whole number`);
      }
      if (parent?.type !== "root" && parent?.type !== "containerDirective") err(node, `::anim[${name}]: put explainers on their own line at the top level (or inside a ::: block), not in a list or quote`);
      return;
    }
    if (node.type === "textDirective" || node.type === "leafDirective") {
      // prose like "ratio:high" parses as a text directive; the site turns these back into text
      if (node.type === "leafDirective" || (node.name && BLOCK_SPEC[node.name])) err(node, `stray ${node.type === "leafDirective" ? "::" : ":"}${node.name}: only ::: containers are allowed`);
      return;
    }
    if (node.type !== "containerDirective") return;
    blocks++;
    const name = node.name || "";
    const spec = BLOCK_SPEC[name];
    if (!spec) {
      err(node, `unknown block ":::${name}" (allowed: ${Object.keys(BLOCK_SPEC).join(", ")})`);
      return;
    }
    for (const [k, v] of Object.entries(node.attributes || {})) {
      if (!spec.attrs.includes(k)) err(node, `:::${name}: unknown attribute ${k}`);
      else if (BLOCK_VALUES[k] && !BLOCK_VALUES[k].includes(String(v))) err(node, `:::${name}: ${k}="${v}" is not one of ${BLOCK_VALUES[k].join(" | ")}`);
    }
    const kids = (node.children || []).filter((c) => !(c.data && c.data.directiveLabel));
    const label = (node.children || []).find((c) => c.data && c.data.directiveLabel);
    if (spec.parent && parent?.name !== spec.parent) err(node, `:::${name} must be inside ::::${spec.parent} (the outer block uses one more colon)`);
    if (spec.title && !label) err(node, `:::${name} needs a [title]`);
    if (spec.children) {
      const cols = kids.filter((c) => c.type === "containerDirective" && c.name === spec.children);
      if (cols.length < 2 || cols.length > 4) err(node, `${name}: ${cols.length} :::${spec.children} (needs 2 to 4)`);
      if (kids.length !== cols.length) err(node, `${name}: only :::${spec.children} blocks are allowed directly inside (check the colon counts)`);
    }
    if (spec.list) {
      const lists = kids.filter((c) => c.type === "list");
      const want = spec.list === "ordered";
      if (lists.length !== 1 || !!lists[0].ordered !== want) err(node, `:::${name}: needs exactly one ${spec.list === "ordered" ? "numbered" : "bullet"} list`);
      else if (spec.boldFirst) {
        (lists[0].children || []).forEach((li, i) => {
          const first = li.children?.[0]?.children?.[0];
          if (!first || first.type !== "strong") err(li, `:::${name}: item ${i + 1} must start with **bold**`);
        });
      }
    }
    if (spec.listOrTable && !kids.some((c) => c.type === "list" || c.type === "table")) err(node, ":::calc needs a list or a table");
    // a mismatched closing fence makes a block swallow the rest of the story: catch that
    const swallowed: Node[] = [];
    visit(node as never, "heading", (h: unknown) => {
      if (((h as Node).depth ?? 9) <= 3) swallowed.push(h as Node);
    });
    if (swallowed.length) err(node, `:::${name} contains a level-${swallowed[0].depth} heading (line ${line(swallowed[0])}): unclosed block? Use #### inside blocks`);
    visit(node as never, "code", (c: unknown) => {
      const code = c as Node;
      if (code.lang === "quiz" || code.lang === "mermaid") err(node, `:::${name} contains a \`\`\`${code.lang} block (line ${line(code)}): unclosed block?`);
    });
    const endOffset = node.position?.end.offset ?? 0;
    const lastLine = src.trimEnd().split("\n").pop() || "";
    if (endOffset >= src.trimEnd().length - 1 && !/^:{3,}\s*$/.test(lastLine)) err(node, `:::${name} runs to the end of the story: unclosed block?`);
    const span = (node.position?.end.line ?? 0) - (node.position?.start.line ?? 0);
    if (span > 220) err(node, `:::${name} spans ${span} lines: check the closing fence`);
    const body = src.slice(node.position?.start.offset ?? 0, node.position?.end.offset ?? 0);
    if (/[\u{1F300}-\u{1FAFF}✅❌]/u.test(body)) err(node, `:::${name}: emoji (use tone="ok" / tone="bad" instead)`);
  });

  // unclosed / mismatched fences show up as literal ':::' paragraphs
  visit(tree as never, "paragraph", (raw: unknown) => {
    const p = raw as Node;
    const t = (p.children || []).map((c) => c.value || "").join("");
    if (/^:{3,}/.test(t)) err(p, `literal "${t.slice(0, 30)}": unbalanced ::: fence?`);
  });

  // step-through annotations: every step parses and names nodes / edges / messages the diagram has
  visit(tree as never, "code", (raw: unknown) => {
    const c = raw as Node;
    const src = c.value || "";
    if (c.lang !== "mermaid" || !/%%\s*steps\s*:/i.test(src)) return;
    const perrs: string[] = [];
    const spec = parseSteps(src, perrs);
    perrs.forEach((e) => err(c, `mermaid steps: ${e}`));
    if (!spec || spec.mode !== "manual") return;
    const body = src.split("\n").filter((l) => !l.trim().startsWith("%%"));
    const esc = (id: string) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const has = (id: string) => body.some((l) => new RegExp(`(^|[^\\w-])${esc(id)}([^\\w-]|$)`).test(l));
    const msgs = diagramKind(src) === "sequenceDiagram" ? countSequenceMessages(src) : 0;
    spec.steps.forEach((st, i) => {
      for (const t of st.targets) {
        if (t.kind === "msg" && t.to > msgs) err(c, `mermaid steps: step ${i + 1} names message ${t.to}, the diagram has ${msgs}`);
        if (t.kind === "node" && !has(t.id)) err(c, `mermaid steps: step ${i + 1}: no node or subgraph "${t.id}"`);
        if (t.kind === "edge") {
          if (!has(t.from) || !has(t.to)) err(c, `mermaid steps: step ${i + 1}: edge ${t.from} --> ${t.to} names a missing node`);
          else if (
            !body.some((l) => {
              const a = l.search(new RegExp(`(^|[^\\w-])${esc(t.from)}([^\\w-]|$)`));
              const b = l.lastIndexOf(t.to);
              return a >= 0 && b > a && /--|==|-\./.test(l.slice(a, b));
            })
          )
            err(c, `mermaid steps: step ${i + 1}: no edge ${t.from} --> ${t.to} in the diagram`);
        }
      }
    });
  });

  return { issues, blocks };
}
