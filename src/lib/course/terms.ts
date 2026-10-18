/**
 * Hover definitions, server side: marks known concept terms in the rendered lesson (hast) and ships
 * the cards for the terms it marked as JSON inside the HTML, so the page (and a saved offline copy)
 * carries exactly what its hover cards need. <TermCards/> (src/components/learn/concepts) does the
 * rest on the client.
 *
 * Marking rules
 * - the FIRST occurrence of each term per scope (stage by default; "chapter" = per `##` heading, or
 *   "page"), at most `maxPerSection` terms per scope;
 * - prose only: never inside code / pre / kbd, headings, links, buttons, diagrams (mermaid, blueprints,
 *   trees, animations, plates), quick checks, checkpoints, practice cards or any [data-sd-chrome];
 * - only whole text nodes are split, the text itself is untouched (highlight offsets stay valid):
 *     <span class="sd-term" data-term="quorum">quorums</span>
 *   plus data-term-here when the term is taught in this very section (the card then skips its link).
 */
import type { Element as HastElement, ElementContent, Root as HastRoot, Text as HastText } from "hast";
import { findTerms } from "@/lib/concepts/match";
import type { TermCard, TermIndex } from "@/lib/concepts/catalogue";

export type TermsOpts = {
  index: TermIndex;
  /** "<week folder>/<slug>" of the page being rendered, to drop "taught in" links that point here */
  here?: string;
};

const SKIP_TAGS = new Set(["pre", "code", "kbd", "samp", "a", "button", "script", "style", "svg", "math", "h1", "h2", "h3", "h4", "h5", "h6", "header", "figcaption", "summary", "textarea", "select", "option", "label", "mark", "sup", "sub", "img", "picture"]);
const SKIP_SD = new Set(["quiz", "checkpoint", "mermaid", "code", "blueprint", "tree", "practice", "anim", "art", "resources", "up-next", "whiteboard", "numbers", "eyebrow", "eyebrows"]);

function classes(e: HastElement): string[] {
  const c = e.properties?.className;
  return Array.isArray(c) ? c.map(String) : typeof c === "string" ? c.split(/\s+/) : [];
}

function skip(e: HastElement): boolean {
  if (SKIP_TAGS.has(e.tagName)) return true;
  const p = e.properties || {};
  if (p.dataSdChrome !== undefined) return true;
  if (typeof p.dataSd === "string" && SKIP_SD.has(p.dataSd)) return true;
  if (p.dataVariant === "checkpoint") return true;
  const cls = classes(e);
  return cls.includes("sd-mermaid") || cls.includes("sd-term") || cls.includes("sd-checkpoint");
}

/** Markdown depth of a renderer heading (`sd-h<depth>`), 0 when not a heading. */
function headingDepth(e: HastElement): number {
  if (!/^h[1-6]$/.test(e.tagName)) return 0;
  for (const c of classes(e)) {
    const m = c.match(/^sd-h(\d)$/);
    if (m) return Number(m[1]);
  }
  return 0;
}

/** JSON safe inside <script>: no "</script>", no U+2028/2029 line breaks. */
function scriptJson(v: unknown): string {
  return JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function markTerms(tree: HastRoot, opts: TermsOpts): { used: string[]; marks: number } {
  const { index, here } = opts;
  const m = index.matcher;
  if (!m) return { used: [], marks: 0 };
  const { scope, maxPerSection } = index.settings;
  const used = new Set<string>();
  let marks = 0;

  let seen = new Set<string>();
  let count = 0;
  // ids of the stage and the headings above the current point (by markdown depth)
  let stack: string[] = [];

  const reset = () => {
    seen = new Set();
    count = 0;
  };

  const isHere = (id: string) => {
    const c = index.concepts.get(id);
    if (!c || !here || c.taught.lesson !== here) return false;
    return stack.includes(c.taught.anchor);
  };

  const splitText = (node: HastText): ElementContent[] | null => {
    const value = node.value;
    if (!value || value.length < 2 || count >= maxPerSection) return null;
    const out: ElementContent[] = [];
    let last = 0;
    for (const hit of findTerms(m, value)) {
      if (count >= maxPerSection) break;
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      used.add(hit.id);
      count++;
      marks++;
      if (hit.index > last) out.push({ type: "text", value: value.slice(last, hit.index) });
      out.push({
        type: "element",
        tagName: "span",
        properties: { className: ["sd-term"], dataTerm: hit.id, ...(isHere(hit.id) ? { dataTermHere: "" } : {}) },
        children: [{ type: "text", value: hit.text }],
      });
      last = hit.index + hit.text.length;
    }
    if (!out.length) return null;
    if (last < value.length) out.push({ type: "text", value: value.slice(last) });
    return out;
  };

  const walk = (parent: HastElement) => {
    const kids = parent.children;
    for (let i = 0; i < kids.length; i++) {
      const n = kids[i];
      if (n.type === "text") {
        const parts = splitText(n);
        if (parts) {
          kids.splice(i, 1, ...parts);
          i += parts.length - 1;
        }
        continue;
      }
      if (n.type !== "element") continue;
      const d = headingDepth(n);
      if (d >= 2 && typeof n.properties?.id === "string") {
        stack = stack.slice(0, d - 1);
        stack[d - 1] = n.properties.id;
        if (scope === "chapter" && d === 2) reset();
      }
      if (skip(n)) continue;
      walk(n);
    }
  };

  for (const top of tree.children) {
    if (top.type !== "element") continue;
    if (top.properties?.dataSd === "stage") {
      stack = [String(top.properties.id || "")];
      if (scope !== "page") reset();
    }
    if (!skip(top)) walk(top);
  }

  if (used.size) {
    // the cards for the marked terms (+ their related terms' names and links)
    const cards: TermCard[] = [];
    used.forEach((id) => {
      const card = index.cards.get(id);
      if (card) cards.push(card);
    });
    tree.children.push({
      type: "element",
      tagName: "script",
      properties: { type: "application/json", dataSdTerms: "", dataSdChrome: "" },
      children: [{ type: "text", value: scriptJson({ v: 1, cards }) }],
    });
  }
  return { used: Array.from(used), marks };
}
