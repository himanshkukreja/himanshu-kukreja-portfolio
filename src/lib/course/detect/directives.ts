/**
 * `:::` course blocks (spec: scratchpad/blocks/BLOCKS.md, validator: scripts/validate-blocks.mjs).
 *
 * remark-directive parses `:::name[Title]{attr="…"}` containers. Only the names in BLOCKS are
 * components; everything else the plugin produces (text directives from prose such as
 * `ratio:high`, `::leaf` lines, unknown containers) is turned back into its literal source text by
 * `neutralizeDirectives`, so enabling the plugin never changes what existing lessons say.
 *
 * Rendering contract (same family as the other renderer components):
 *   <figure|aside class="sdb sdb-<name>" data-sd="<name>" data-sd-block="<name>" data-tone|data-type…>
 * The title comes from the directive label and is course text; glyphs, icons, "vs" dividers and
 * default labels are data-sd-chrome so highlight offsets ignore them. Headings inside blocks are
 * styled sub-heads: no ids, no TOC entries, never stage boundaries. Lists stay lists (wrapper spans
 * only), and no text is added or removed, so a block reads the same with CSS off.
 */
import type { Code, Heading, List, ListItem, Paragraph, Parent, PhrasingContent, Root, RootContent, Text } from "mdast";
import type { ContainerDirective, LeafDirective, TextDirective } from "mdast-util-directive";
import type { Element as HastElement, Properties } from "hast";
import { chrome, el, h, isNode, rawHast, text, toText, type AnyNode, type SdEl, type SdHast } from "../md";
import type { QuestMission } from "../types";
import { slugify } from "../slug";
import type { BlockCtx } from "./blocks";
import { renderCode } from "./code";
import { ANIMS, COMMON_ANIM_OPTS } from "../anim/catalog";

export const BLOCK_NAMES = new Set(["panel", "compare", "col", "steps", "tree", "callout", "stats", "calc", "timeline", "checkpoint", "answer", "mission"]);
const TONES = new Set(["core", "info", "ok", "bad", "warn", "note"]);
const CALLOUT_TYPES = new Set(["tip", "key", "warn", "bad", "ok", "info"]);

/* ------------------------------------------------------------------ neutralise stray directives */

type Directive = ContainerDirective | LeafDirective | TextDirective;
type Pos = { start: { offset?: number; line: number }; end: { offset?: number; line: number } } | undefined;

function sliceSrc(src: string, pos: Pos): string | null {
  const s = pos?.start.offset;
  const e = pos?.end.offset;
  return typeof s === "number" && typeof e === "number" ? src.slice(s, e) : null;
}

/** `:name[label]{attrs}` / `::name[label]{attrs}` back to literal text (the label keeps its inline markup). */
function literalPhrasing(node: TextDirective | LeafDirective, src: string): PhrasingContent[] {
  const marker = node.type === "textDirective" ? ":" : "::";
  const raw = sliceSrc(src, node.position as Pos);
  const kids = node.children as PhrasingContent[];
  if (!kids.length) return [text(raw ?? `${marker}${node.name}`)];
  const lastEnd = (kids[kids.length - 1] as { position?: Pos }).position?.end.offset;
  const end = (node.position as Pos)?.end.offset;
  const tail = typeof lastEnd === "number" && typeof end === "number" ? src.slice(lastEnd, end) : "]";
  return [text(`${marker}${node.name}[`), ...kids, text(tail)];
}

function mergeText(kids: RootContent[] | PhrasingContent[]): void {
  for (let i = kids.length - 1; i > 0; i--) {
    const a = kids[i - 1];
    const b = kids[i];
    if (a.type === "text" && b.type === "text") {
      (a as Text).value += (b as Text).value;
      kids.splice(i, 1);
    }
  }
}

/**
 * Turn every directive that is not a known `:::` block back into the text it was written as.
 * Mutates the tree. Returns how many stray directives were neutralised.
 */
export function neutralizeDirectives(tree: Root, src: string): number {
  let n = 0;
  const lines = src.split("\n");
  const walk = (parent: Parent) => {
    const kids = parent.children as RootContent[];
    let touched = false;
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i] as RootContent | Directive;
      if (c.type === "leafDirective" && isAnim(c)) continue; // `::anim[name]` explainer (animFigure)
      if (c.type === "textDirective" || c.type === "leafDirective") {
        n++;
        touched = true;
        const phr = literalPhrasing(c, src);
        const repl: RootContent[] = c.type === "leafDirective" ? [{ type: "paragraph", children: phr } as Paragraph] : (phr as RootContent[]);
        kids.splice(i, 1, ...repl);
        i--; // revisit the replacement: the label may hold further directives
        continue;
      }
      if (c.type === "containerDirective") {
        walk(c);
        if (BLOCK_NAMES.has(c.name)) continue;
        n++;
        touched = true;
        const startLine = (c.position as Pos)?.start.line;
        const endLine = (c.position as Pos)?.end.line;
        const open = startLine ? lines[startLine - 1].trim() : `:::${c.name}`;
        const close = endLine && endLine !== startLine && /^\s*:{3,}\s*$/.test(lines[endLine - 1]) ? lines[endLine - 1].trim() : null;
        const body = c.children.filter((k) => !(k.type === "paragraph" && (k.data as { directiveLabel?: boolean } | undefined)?.directiveLabel));
        const repl: RootContent[] = [{ type: "paragraph", children: [text(open)] } as Paragraph, ...(body as RootContent[])];
        if (close) repl.push({ type: "paragraph", children: [text(close)] } as Paragraph);
        kids.splice(i, 1, ...repl);
        i += repl.length - 1;
        continue;
      }
      if ("children" in c && Array.isArray(c.children)) walk(c as Parent);
    }
    if (touched) mergeText(kids);
  };
  walk(tree);
  return n;
}

/* ------------------------------------------------------------------ ::anim explainers */

/** `::anim[name]{…}` naming a registered explainer (src/lib/course/anim/catalog.ts). */
export function isAnim(node: { type: string; name?: string; children?: unknown[] }): boolean {
  if (node.type !== "leafDirective" || node.name !== "anim") return false;
  return Object.prototype.hasOwnProperty.call(ANIMS, toText(node as LeafDirective).trim());
}

/**
 * An animated concept explainer: an empty stage the client fills (src/components/learn/anim/), with
 * the catalog title and summary as its readable fallback (no JS, print, still loading). All of it
 * is chrome: it isn't course text, so highlights, search and the lede never see it.
 */
export function animFigure(node: LeafDirective, ctx: BlockCtx): SdHast {
  const name = toText(node).trim();
  const meta = ANIMS[name];
  const allowed = { ...COMMON_ANIM_OPTS, ...(meta.opts || {}) };
  const opts: Record<string, string> = {};
  for (const [k, v] of Object.entries(node.attributes || {})) if (typeof v === "string" && k in allowed) opts[k] = v;
  const title = opts.title || meta.title;
  ctx.stats.anim = (ctx.stats.anim || 0) + 1;
  return rawHast(
    chrome("figure", { className: ["sd-anim"], dataSd: "anim", dataAnim: name, dataAnimOpts: Object.keys(opts).length ? JSON.stringify(opts) : undefined }, [
      h("figcaption", { className: ["sd-anim-head"] }, [h("span", { className: ["sd-anim-tag"] }, ["Explainer"]), h("span", { className: ["sd-anim-title"] }, [title])]),
      h("div", { className: ["sd-anim-stage"], role: "group", ariaLabel: `Animated explainer: ${title}` }, []),
      h("p", { className: ["sd-anim-sum"] }, [meta.summary]),
    ]),
    { component: "anim" },
  );
}

/* ------------------------------------------------------------------ helpers */

type Opts = { inPhrases?: boolean };

function isLabel(n: unknown): n is Paragraph {
  return isNode(n, "paragraph") && !!(n.data as { directiveLabel?: boolean } | undefined)?.directiveLabel;
}

function count(ctx: BlockCtx, k: string) {
  ctx.stats[k] = (ctx.stats[k] || 0) + 1;
}

const blank = (c: PhrasingContent) => c.type === "text" && !c.value.trim();

/** first meaningful paragraph of a list item + the remaining block children */
function itemParts(li: ListItem): { head: PhrasingContent[]; rest: RootContent[] } {
  const [first, ...rest] = li.children as RootContent[];
  if (first && first.type === "paragraph") return { head: first.children, rest };
  return { head: [], rest: li.children as RootContent[] };
}

const LEAD_SEP = /^(\s*(?:[—–]|-{1,2}|:)\s*)/;

/**
 * "**Lead** — rest": the leading strong, the separator text (kept in the DOM, hidden by CSS where
 * the layout already separates them) and the rest.
 */
function splitLead(head: PhrasingContent[]): { lead: PhrasingContent | null; sep: string; rest: PhrasingContent[] } {
  const kids = head.filter((c, i) => !(i === 0 && blank(c)));
  const first = kids[0];
  if (!first || first.type !== "strong") return { lead: null, sep: "", rest: head };
  const after = kids.slice(1);
  let sep = "";
  if (after[0]?.type === "text") {
    const m = after[0].value.match(LEAD_SEP);
    if (m) {
      sep = m[1];
      const v = after[0].value.slice(m[1].length);
      after.splice(0, 1, ...(v ? [{ ...after[0], value: v } as Text] : []));
    }
  }
  return { lead: first, sep, rest: after };
}

/** Split phrasing at the first " — " found in a top-level text node (tree items: `name` — note). */
function splitDash(head: PhrasingContent[]): { name: PhrasingContent[]; sep: string; note: PhrasingContent[] } {
  for (let i = 0; i < head.length; i++) {
    const c = head[i];
    if (c.type !== "text") continue;
    const m = c.value.match(/\s[—–]\s|\s-{1,2}\s/);
    if (!m || m.index === undefined) continue;
    const before = c.value.slice(0, m.index);
    const after = c.value.slice(m.index + m[0].length);
    return {
      name: [...head.slice(0, i), ...(before ? [text(before)] : [])],
      sep: m[0],
      note: [...(after ? [text(after)] : []), ...head.slice(i + 1)],
    };
  }
  return { name: head, sep: "", note: [] };
}

function span(cls: string, kids: AnyNode[], props: Properties = {}): SdEl {
  return el("span", { className: [cls], ...props }, kids);
}

function sep(value: string, cls = "sdb-sep"): AnyNode[] {
  return value ? [span(cls, [text(value)])] : [];
}

/* ------------------------------------------------------------------ icons (chrome) */

const ICONS: Record<string, string[]> = {
  // 16×16, 1.5px strokes, square caps: drawn, not emoji
  ok: ["M3 8.5l3.2 3.2L13 4.8"],
  bad: ["M4 4l8 8", "M12 4l-8 8"],
  tip: ["M8 1.8v1.6", "M3.2 3.6l1.1 1.1", "M12.8 3.6l-1.1 1.1", "M5.4 10.6a3.6 3.6 0 1 1 5.2 0c-.5.5-.8 1.1-.8 1.8H6.2c0-.7-.3-1.3-.8-1.8z", "M6.4 14.4h3.2"],
  key: ["M8 1.8l6.2 6.2L8 14.2 1.8 8z", "M8 5.4v3.4", "M8 10.4v.4"],
  warn: ["M8 2L14.6 13.6H1.4z", "M8 6.4v3.4", "M8 11.4v.4"],
  info: ["M2.2 2.2h11.6v11.6H2.2z", "M8 7.2v4.6", "M8 4.6v.4"],
  arrow: ["M2 8h11", "M9.5 4.5L13 8l-3.5 3.5"],
};

function icon(name: string, cls: string): HastElement {
  return chrome(
    "span",
    { className: [cls], ariaHidden: "true" },
    [
      h(
        "svg",
        { viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "square", strokeLinejoin: "miter", focusable: "false" },
        (ICONS[name] || ICONS.info).map((d) => h("path", { d })),
      ),
    ],
  );
}

const CALLOUT_LABEL: Record<string, string> = { tip: "Tip", key: "Key insight", warn: "Watch out", bad: "Anti-pattern", ok: "Do this", info: "Note" };
const CALLOUT_SAME: Record<string, RegExp> = {
  tip: /^(?:pro\s+)?tips?\b/i,
  key: /^(?:the\s+)?key\s+(?:insight|takeaway|idea|point)s?\b|^insight\b/i,
  warn: /^(?:warning|watch\s+out|caution|careful)\b/i,
  bad: /^(?:anti-?pattern|wrong|don'?t|avoid)\b/i,
  ok: /^(?:do\s+this|right|correct|best\s+practice)\b/i,
  info: /^(?:note|info)\b/i,
};

/* ------------------------------------------------------------------ inner content */

async function inner(nodes: RootContent[], ctx: BlockCtx, opts: Opts): Promise<AnyNode[]> {
  const out: AnyNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.type === "containerDirective") {
      out.push(await renderBlock(n, ctx, opts));
      continue;
    }
    if (isAnim(n)) {
      out.push(animFigure(n as unknown as LeafDirective, ctx));
      continue;
    }
    if (n.type === "heading") {
      const d = (n as Heading).depth;
      out.push(el(`h${Math.min(6, Math.max(4, d + 1))}`, { className: ["sdb-h"] }, (n as Heading).children as AnyNode[]));
      continue;
    }
    if (n.type === "code") {
      const prev = nodes[i - 1];
      const hast = await renderCode(n as Code, {
        kind: ctx.kind,
        prevText: prev ? toText(prev) : "",
        nextFigure: () => ++ctx.figure,
        count: (k) => count(ctx, k),
        inPhrases: opts.inPhrases,
      });
      out.push(rawHast(hast, { component: String((hast.properties as Properties).dataSd || "code") }));
      continue;
    }
    if (n.type === "html") {
      count(ctx, "htmlDropped");
      continue;
    }
    out.push(n);
  }
  return out;
}

function label(node: ContainerDirective): PhrasingContent[] | null {
  const l = node.children.find(isLabel) as Paragraph | undefined;
  return l && l.children.some((c) => !blank(c)) ? l.children : null;
}

function body(node: ContainerDirective): RootContent[] {
  return node.children.filter((c) => !isLabel(c)) as RootContent[];
}

function attr(node: ContainerDirective, k: string): string | undefined {
  const v = node.attributes?.[k];
  return typeof v === "string" && v ? v : undefined;
}

function caption(title: PhrasingContent[] | null, extra: AnyNode[] = []): AnyNode[] {
  if (!title) return extra.length ? [el("figcaption", { className: ["sdb-head"] }, extra)] : [];
  return [el("figcaption", { className: ["sdb-head"] }, [...extra, span("sdb-title", title as AnyNode[])])];
}

function figure(name: string, props: Properties, kids: AnyNode[]): SdEl {
  return el("figure", { className: ["sdb", `sdb-${name}`], dataSd: name, dataSdBlock: name, ...props }, kids, { component: name });
}

/* ------------------------------------------------------------------ components */

async function panel(node: ContainerDirective, ctx: BlockCtx, opts: Opts): Promise<SdEl> {
  const tone = TONES.has(attr(node, "tone") || "") ? attr(node, "tone")! : "note";
  const title = label(node);
  return figure("panel", { dataTone: tone, dataTitled: title ? "true" : undefined }, [...caption(title), el("div", { className: ["sdb-body"] }, await inner(body(node), ctx, opts))]);
}

/** ✗ on a bad column; ✓ on an ok column only when it is contrasted with a bad one (else a swatch) */
function toneGlyph(tone: string, contrasted: boolean): HastElement {
  if (tone === "bad" || (tone === "ok" && contrasted)) return icon(tone, "sdb-glyph");
  return chrome("span", { className: ["sdb-swatch"], ariaHidden: "true" });
}

async function compare(node: ContainerDirective, ctx: BlockCtx, opts: Opts): Promise<SdEl> {
  const kids = body(node);
  const cols = kids.filter((c): c is ContainerDirective => c.type === "containerDirective" && c.name === "col");
  const others = kids.filter((c) => !(c.type === "containerDirective" && c.name === "col"));
  const colEls: AnyNode[] = [];
  const contrasted = cols.some((c) => attr(c, "tone") === "bad");
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    const tone = TONES.has(attr(c, "tone") || "") ? attr(c, "tone")! : "note";
    const t = label(c);
    const head: AnyNode[] = [rawHast(toneGlyph(tone, contrasted))];
    if (t) head.push(el("p", { className: ["sdb-col-title"] }, t as AnyNode[]));
    colEls.push(
      el("section", { className: ["sdb-col"], dataTone: tone }, [
        ...(i > 0 ? [rawHast(chrome("span", { className: ["sdb-vs"], ariaHidden: "true" }, ["vs"]))] : []),
        el("header", { className: ["sdb-col-head"] }, head),
        el("div", { className: ["sdb-col-body"] }, await inner(body(c), ctx, opts)),
      ]),
    );
  }
  // prose before the first col is an intro, anything after it a footer (document order is kept)
  const firstCol = kids.findIndex((c) => c.type === "containerDirective" && c.name === "col");
  const lead = firstCol > 0 ? others.filter((c) => kids.indexOf(c) < firstCol) : [];
  const tail = others.filter((c) => !lead.includes(c));
  const intro = lead.length ? [el("div", { className: ["sdb-compare-intro"] }, await inner(lead, ctx, opts))] : [];
  const foot = tail.length ? [el("div", { className: ["sdb-compare-foot"] }, await inner(tail, ctx, opts))] : [];
  return figure("compare", { dataCols: String(cols.length || 1), dataContrast: contrasted ? "true" : undefined }, [...caption(label(node)), ...intro, el("div", { className: ["sdb-cols"] }, colEls), ...foot]);
}

/** Short nested bullets (or one "a · b · c" bullet) render as chips; long ones as a compact list. */
function chipsOrList(list: List): AnyNode {
  const items = list.children;
  const simple = items.every((li) => li.children.length === 1 && li.children[0].type === "paragraph");
  if (simple && !list.ordered) {
    // one bullet holding "a · b · c" → one chip per segment (the separators stay in the DOM)
    if (items.length === 1) {
      const p = items[0].children[0] as Paragraph;
      const segs = toText(p).split(/\s+[·•|]\s+/);
      if (segs.length >= 3 && segs.every((s) => s.trim().length > 0 && s.length <= 48)) {
        const parts: AnyNode[] = [];
        let cur: AnyNode[] = [];
        const flush = () => {
          if (cur.length) parts.push(span("sdb-chip", cur));
          cur = [];
        };
        for (const c of p.children) {
          if (c.type !== "text") {
            cur.push(c);
            continue;
          }
          const bits = c.value.split(/(\s+[·•|]\s+)/);
          bits.forEach((b, k) => {
            if (k % 2 === 1) {
              flush();
              parts.push(span("sdb-chip-sep", [text(b)]));
            } else if (b) cur.push(text(b));
          });
        }
        flush();
        return el("ul", { className: ["sdb-chips"] }, [el("li", { className: ["sdb-chips-one"] }, parts)]);
      }
    }
    if (items.length >= 2 && items.every((li) => toText(li).length <= 28)) {
      return el(
        "ul",
        { className: ["sdb-chips"] },
        items.map((li) => el("li", { className: ["sdb-chip"] }, (li.children[0] as Paragraph).children as AnyNode[])),
      );
    }
  }
  // keep the mdast list (tight/loose handling stays remark-rehype's), just add the class
  return { ...list, data: { ...list.data, hProperties: { ...(list.data?.hProperties || {}), className: ["sdb-sublist"] } } } as List;
}

async function steps(node: ContainerDirective, ctx: BlockCtx, opts: Opts): Promise<SdEl> {
  const kids = body(node);
  const listIdx = kids.findIndex((c) => c.type === "list" && (c as List).ordered);
  if (listIdx < 0) return generic("steps", node, ctx, opts);
  const list = kids[listIdx] as List;
  const items: AnyNode[] = [];
  let maxLen = 0;
  for (const li of list.children) {
    const { head, rest } = itemParts(li);
    const { lead, sep: s, rest: tail } = splitLead(head);
    maxLen = Math.max(maxLen, toText(li).length);
    const headKids: AnyNode[] = lead
      ? [span("sdb-step-title", [lead as AnyNode]), ...sep(s, "sdb-dash"), ...(tail.length ? [span("sdb-step-desc", tail as AnyNode[])] : [])]
      : [span("sdb-step-title", head as AnyNode[])];
    const restOut: AnyNode[] = [];
    for (const r of rest) {
      if (r.type === "list") restOut.push(chipsOrList(r as List));
      else restOut.push(...(await inner([r], ctx, opts)));
    }
    items.push(el("li", { className: ["sdb-step"] }, [el("div", { className: ["sdb-step-head"] }, headKids), ...restOut]));
  }
  const start = typeof list.start === "number" && list.start > 1 ? list.start : undefined;
  // horizontal only where it reads: a handful of short, flat steps
  const right = attr(node, "dir") === "right" && list.children.length <= 6 && maxLen <= 140;
  const ol = el("ol", { className: ["sdb-step-list"], start, style: start ? `counter-reset: sdbstep ${start - 1}` : undefined }, items);
  const before = await inner(kids.slice(0, listIdx), ctx, opts);
  const after = await inner(kids.slice(listIdx + 1), ctx, opts);
  return figure("steps", { dataDir: right ? "right" : "down", dataCount: String(list.children.length) }, [
    ...caption(label(node)),
    el("div", { className: ["sdb-body"] }, [...before, ol, ...after]),
  ]);
}

function treeStats(list: List, depth = 1): { depth: number; items: number } {
  let d = depth;
  let items = 0;
  for (const li of list.children) {
    items++;
    for (const c of li.children) {
      if (c.type === "list") {
        const s = treeStats(c, depth + 1);
        d = Math.max(d, s.depth);
        items += s.items;
      }
    }
  }
  return { depth: d, items };
}

async function tree(node: ContainerDirective, ctx: BlockCtx, opts: Opts): Promise<SdEl> {
  const kids = body(node);
  const listIdx = kids.findIndex((c) => c.type === "list");
  if (listIdx < 0) return generic("tree", node, ctx, opts);
  const root = kids[listIdx] as List;
  const st = treeStats(root);
  // big, deep trees get foldable branches (all open unless the tree is long); small ones stay flat
  const collapsible = st.depth >= 3 && st.items > 16;

  // identifiers/paths/short labels read as mono names; a tree of mostly phrases stays in the body face
  const names = { total: 0, prose: 0 };
  const renderList = async (list: List, level: number): Promise<SdEl> => {
    const lis: AnyNode[] = [];
    for (let i = 0; i < list.children.length; i++) {
      const li = list.children[i];
      const { head, rest } = itemParts(li);
      const { name, sep: s, note } = splitDash(head);
      names.total++;
      if (toText({ type: "paragraph", children: name }).trim().split(/\s+/).length >= 3 && !name.some((c) => c.type === "inlineCode")) names.prose++;
      const line: AnyNode[] = [span("sdb-tree-name", name as AnyNode[]), ...sep(s, "sdb-dash"), ...(note.length ? [span("sdb-tree-note", note as AnyNode[])] : [])];
      const sub: AnyNode[] = [];
      for (const r of rest) {
        if (r.type === "list") sub.push(await renderList(r as List, level + 1));
        else sub.push(...(await inner([r], ctx, opts)));
      }
      const branch = sub.some((x) => x.type === "sdEl" && (x.tag === "ul" || x.tag === "ol"));
      if (collapsible && branch) {
        const open = level === 0 ? st.items <= 60 || i === 0 : st.items <= 48;
        lis.push(
          el("li", { className: ["sdb-tree-item"], dataBranch: "true" }, [
            el("details", { className: ["sdb-tree-fold"], open: open || undefined }, [el("summary", { className: ["sdb-tree-line"] }, line), ...sub]),
          ]),
        );
      } else {
        lis.push(el("li", { className: ["sdb-tree-item"], dataBranch: branch ? "true" : undefined }, [el("div", { className: ["sdb-tree-line"] }, line), ...sub]));
      }
    }
    return el(list.ordered ? "ol" : "ul", { className: ["sdb-tree-list"] }, lis);
  };

  const before = await inner(kids.slice(0, listIdx), ctx, opts);
  const after = await inner(kids.slice(listIdx + 1), ctx, opts);
  const rootEl = await renderList(root, 0);
  return figure("tree", { dataCollapsible: collapsible ? "true" : undefined, dataDepth: String(st.depth), dataNames: names.prose * 2 > names.total ? "prose" : "mono" }, [
    ...caption(label(node)),
    el("div", { className: ["sdb-body"] }, [...before, el("div", { className: ["sdb-tree-root"] }, [rootEl]), ...after]),
  ]);
}

async function callout(node: ContainerDirective, ctx: BlockCtx, opts: Opts): Promise<SdEl> {
  const type = CALLOUT_TYPES.has(attr(node, "type") || "") ? attr(node, "type")! : "info";
  const title = label(node);
  // no "KEY INSIGHT Key insight": the kind label only shows when the title doesn't already say it
  const said = title ? CALLOUT_SAME[type].test(toText({ type: "paragraph", children: title }).trim()) : false;
  const kind = said ? [] : [rawHast(chrome("span", { className: ["sdb-callout-kind"] }, [CALLOUT_LABEL[type]]))];
  const head = title
    ? el("p", { className: ["sdb-callout-title"] }, [...kind, ...(title as AnyNode[])])
    : rawHast(chrome("p", { className: ["sdb-callout-title", "sdb-callout-title-chrome"] }, [CALLOUT_LABEL[type]]));
  return el(
    "aside",
    { className: ["sdb", "sdb-callout"], dataSd: "callout", dataSdBlock: "callout", dataType: type, role: "note" },
    [rawHast(icon(type, "sdb-callout-icon")), el("div", { className: ["sdb-callout-main"] }, [head, ...(await inner(body(node), ctx, opts))])],
    { component: "callout" },
  );
}

async function stats(node: ContainerDirective, ctx: BlockCtx, opts: Opts): Promise<SdEl> {
  const kids = body(node);
  const listIdx = kids.findIndex((c) => c.type === "list");
  if (listIdx < 0) return generic("stats", node, ctx, opts);
  const list = kids[listIdx] as List;
  const items = list.children.map((li) => {
    const { head, rest } = itemParts(li);
    const { lead, sep: s, rest: tail } = splitLead(head);
    if (!lead) return el("li", { className: ["sdb-stat"] }, li.children as AnyNode[]);
    return el("li", { className: ["sdb-stat"] }, [lead as AnyNode, ...sep(s, "sdb-dash"), span("sdb-stat-label", tail as AnyNode[]), ...(rest as AnyNode[])]);
  });
  return figure("stats", { dataCount: String(items.length) }, [
    ...caption(label(node)),
    ...(await inner(kids.slice(0, listIdx), ctx, opts)),
    el(list.ordered ? "ol" : "ul", { className: ["sd-stats", "sdb-stat-list"] }, items),
    ...(await inner(kids.slice(listIdx + 1), ctx, opts)),
  ]);
}

/** "Label: working = **result** tail" → label / working / result cells (all original text). */
function calcRow(head: PhrasingContent[]): { shape: string; kids: AnyNode[] } | null {
  const kids = head.filter((c, i) => !(i === 0 && blank(c)));
  if (!kids.length) return null;
  let lastStrong = -1;
  kids.forEach((c, i) => {
    if (c.type === "strong") lastStrong = i;
  });
  let labelKids: PhrasingContent[] = [];
  let restStart = 0;
  let restFirst: PhrasingContent | null = null;
  const f = kids[0];
  if (f.type === "strong" && lastStrong > 0 && (/:\s*$/.test(toText(f)) || (kids[1]?.type === "text" && /^\s*:/.test(kids[1].value)))) {
    labelKids = [f];
    restStart = 1;
    if (kids[1]?.type === "text" && /^\s*:/.test(kids[1].value)) {
      const m = kids[1].value.match(/^\s*:\s*/)!;
      labelKids.push(text(m[0]));
      const v = kids[1].value.slice(m[0].length);
      restFirst = v ? text(v) : null;
      restStart = 2;
    }
  } else if (f.type === "text") {
    const m = f.value.match(/^(.{1,80}?:)(\s+|$)/);
    if (m) {
      labelKids = [text(m[1] + m[2])];
      const v = f.value.slice(m[0].length);
      restFirst = v ? text(v) : null;
      restStart = 1;
    }
  }
  const rest = [...(restFirst ? [restFirst] : []), ...kids.slice(restStart)];
  let r = -1;
  rest.forEach((c, i) => {
    if (c.type === "strong") r = i;
  });
  if (!labelKids.length && r < 0) return null;
  const work = r >= 0 ? rest.slice(0, r) : rest;
  let after = r >= 0 ? rest.slice(r + 1) : [];
  // a short unit/qualifier stays with the result; a sentence after it becomes its own line
  const longTail = after.length > 0 && toText({ type: "paragraph", children: after }).trim().length > 28;
  let punct: PhrasingContent[] = [];
  if (longTail && after[0]?.type === "text") {
    // "**~530/s**. One hot train…": the full stop stays with the result, the sentence moves down
    const m = after[0].value.match(/^[.,;:]+\s*/);
    if (m) {
      punct = [text(m[0])];
      const v = after[0].value.slice(m[0].length);
      after = [...(v ? [text(v)] : []), ...after.slice(1)];
    }
  }
  const res = r >= 0 ? [rest[r], ...(longTail ? punct : after)] : [];
  const workText = toText({ type: "paragraph", children: work }).trim();
  // working that is really a sentence reads as prose, not as mono arithmetic
  const prose = workText.split(/\s+/).length >= 9 && (workText.match(/[\d=×*+/%]/g) || []).length / workText.length < 0.12;
  const shape = `${labelKids.length ? "l" : ""}${workText ? "w" : ""}${res.length ? "r" : ""}`;
  return {
    shape,
    kids: [
      ...(labelKids.length ? [span("sdb-calc-label", labelKids as AnyNode[])] : []),
      ...(workText ? [span(prose ? "sdb-calc-work sdb-calc-prose" : "sdb-calc-work", work as AnyNode[])] : []),
      ...(res.length ? [span("sdb-calc-res", res as AnyNode[])] : []),
      ...(longTail ? [span("sdb-calc-tail", after as AnyNode[])] : []),
    ],
  };
}

async function calc(node: ContainerDirective, ctx: BlockCtx, opts: Opts): Promise<SdEl> {
  const kids = body(node);
  const out: AnyNode[] = [];
  let lastResult: SdEl | null = null;
  let tables = 0;
  const walkList = async (list: List, sub: boolean): Promise<SdEl> => {
    const lis: AnyNode[] = [];
    for (const li of list.children) {
      const { head, rest } = itemParts(li);
      const row = calcRow(head);
      const subOut: AnyNode[] = [];
      for (const r of rest) {
        if (r.type === "list") subOut.push(await walkList(r as List, true));
        else subOut.push(...(await inner([r], ctx, opts)));
      }
      const hasRes = !!row && row.shape.endsWith("r");
      const line = row ? el("div", { className: ["sdb-calc-line"], dataShape: row.shape }, row.kids) : el("div", { className: ["sdb-calc-line", "sdb-calc-note"] }, head as AnyNode[]);
      const item = el("li", { className: ["sdb-calc-row"] }, [line, ...subOut]);
      if (hasRes) lastResult = item;
      lis.push(item);
    }
    return el(list.ordered ? "ol" : "ul", { className: ["sdb-calc-list", ...(sub ? ["sdb-calc-sub"] : [])] }, lis);
  };
  for (const k of kids) {
    if (k.type === "list") out.push(await walkList(k as List, false));
    else {
      if (k.type === "table") tables++;
      out.push(...(await inner([k], ctx, opts)));
    }
  }
  if (lastResult) {
    const lr = lastResult as SdEl;
    lr.props.className = [...((lr.props.className as string[]) || []), "sdb-calc-answer"];
  }
  return figure("calc", { dataVariant: tables && !lastResult ? "table" : "list" }, [...caption(label(node), [rawHast(chrome("span", { className: ["sdb-kicker"] }, ["Worksheet"]))]), el("div", { className: ["sdb-body"] }, out)]);
}

async function timeline(node: ContainerDirective, ctx: BlockCtx, opts: Opts): Promise<SdEl> {
  const kids = body(node);
  const listIdx = kids.findIndex((c) => c.type === "list");
  if (listIdx < 0) return generic("timeline", node, ctx, opts);
  const list = kids[listIdx] as List;
  const items: AnyNode[] = [];
  for (const li of list.children) {
    const { head, rest } = itemParts(li);
    const { lead, sep: s, rest: tail } = splitLead(head);
    const restOut = await inner(rest, ctx, opts);
    items.push(
      el("li", { className: ["sdb-tl-item"] }, [
        span("sdb-tl-time", lead ? [lead as AnyNode] : []),
        ...sep(s, "sdb-dash"),
        el("div", { className: ["sdb-tl-event"] }, [...((lead ? tail : head) as AnyNode[]), ...restOut]),
      ]),
    );
  }
  return figure("timeline", { dataCount: String(items.length) }, [
    ...caption(label(node)),
    el("div", { className: ["sdb-body"] }, [
      ...(await inner(kids.slice(0, listIdx), ctx, opts)),
      el(list.ordered ? "ol" : "ul", { className: ["sdb-tl-list"] }, items),
      ...(await inner(kids.slice(listIdx + 1), ctx, opts)),
    ]),
  ]);
}

/**
 * "Your turn" checkpoint: a think-before-you-read prompt whose answer stays behind a reveal.
 *
 *   ::::checkpoint[Where should the video bytes come from?]
 *   Prompt (paragraphs, lists…)
 *   :::answer
 *   The answer.
 *   :::
 *   ::::
 *
 * It is a reveal card (data-sd="reveal", the same gate / verdict chrome and CourseEnhancer wiring as
 * the interview questions) marked data-variant="checkpoint", with a stable data-qid ("cp-<slug>")
 * so verdicts survive edits elsewhere in the lesson. Without an :::answer it is a plain prompt card.
 */
async function checkpoint(node: ContainerDirective, ctx: BlockCtx, opts: Opts): Promise<SdEl> {
  const kids = body(node);
  const answers = kids.filter((c): c is ContainerDirective => c.type === "containerDirective" && c.name === "answer");
  const prompt = kids.filter((c) => !answers.includes(c as ContainerDirective));
  const title = label(node);
  const n = (ctx.stats.checkpoint = (ctx.stats.checkpoint || 0) + 1);
  const titleText = title ? toText({ type: "paragraph", children: title }).trim() : `Checkpoint ${n}`;
  const qid = ctx.ids.claim(`cp-${slugify(titleText, 40) || n}`, [ctx.stageId]);
  const head = rawHast(
    chrome("div", { className: ["sd-rv-head"] }, [
      h("span", { className: ["sd-rv-kicker"] }, [`Your turn · checkpoint ${n}`]),
      h("span", { className: ["sd-rv-status"], ariaLive: "polite" }, [answers.length ? "not answered" : "think first"]),
    ]),
  );
  const q = title ? [el("p", { className: ["sd-rv-q", "sd-cp-q"] }, title as AnyNode[])] : [];
  const promptOut = prompt.length ? [el("div", { className: ["sd-cp-prompt"] }, await inner(prompt, ctx, opts))] : [];
  if (!answers.length) {
    return el("section", { className: ["sd-checkpoint", "sd-cp-plain"], dataSd: "checkpoint", id: qid }, [head, ...q, ...promptOut], { component: "checkpoint" });
  }
  const answerOut: AnyNode[] = [];
  for (const a of answers) answerOut.push(...(await inner(body(a), ctx, opts)));
  return el(
    "section",
    { className: ["sd-reveal", "sd-checkpoint"], dataSd: "reveal", dataVariant: "checkpoint", dataQid: qid, dataQuestion: titleText.slice(0, 200), id: qid },
    [
      head,
      ...q,
      ...promptOut,
      rawHast(
        chrome("div", { className: ["sd-rv-gate"] }, [
          h("span", { className: ["sd-rv-hint"] }, ["Think it through, or jot it down. Then compare."]),
          h("button", { type: "button", className: ["sd-btn", "sd-btn-solid"], dataSdAction: "reveal", ariaExpanded: "false" }, ["Reveal the answer"]),
        ]),
      ),
      el("div", { className: ["sd-rv-answer"], dataSdAnswer: "" }, [rawHast(chrome("p", { className: ["sd-cp-answer-tag"] }, ["One strong answer"])), ...answerOut]),
      rawHast(
        chrome("div", { className: ["sd-rv-verdict"], role: "group", ariaLabel: "How did you do?" }, [
          h("button", { type: "button", className: ["sd-btn"], dataSdAction: "knew", ariaPressed: "false" }, ["✓ I had it"]),
          h("button", { type: "button", className: ["sd-btn"], dataSdAction: "review", ariaPressed: "false" }, ["↻ Missed some"]),
          h("button", { type: "button", className: ["sd-btn", "sd-btn-quiet"], dataSdAction: "hide" }, ["Hide answer"]),
        ]),
      ),
    ],
    { component: "checkpoint" },
  );
}

/** Mission text pieces shared by the renderer (lifted into RenderedLesson.mission) and the in-body fallback. */
export function missionFrom(node: ContainerDirective): QuestMission {
  const t = label(node);
  const objective = t ? toText({ type: "paragraph", children: t }).trim() : "";
  const kids = body(node);
  const brief = kids
    .filter((c) => c.type === "paragraph")
    .map((p) => toText(p).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
  const numbers: QuestMission["numbers"] = [];
  const list = kids.find((c): c is List => c.type === "list");
  list?.children.forEach((li) => {
    const { head } = itemParts(li);
    const { lead, rest } = splitLead(head);
    if (!lead) return;
    const value = toText(lead).trim();
    const lbl = toText({ type: "paragraph", children: rest }).replace(/\s+/g, " ").trim();
    if (value) numbers.push({ value, label: lbl });
  });
  const level = attr(node, "level");
  return { objective, ...(level ? { level } : {}), ...(brief ? { brief } : {}), numbers };
}

/** A :::mission that wasn't lifted into the hero (nested somewhere): a stats card, nothing lost. */
async function mission(node: ContainerDirective, ctx: BlockCtx, opts: Opts): Promise<SdEl> {
  const kids = body(node);
  const listIdx = kids.findIndex((c) => c.type === "list");
  if (listIdx < 0) return generic("mission", node, ctx, opts);
  return stats(node, ctx, opts);
}

/** structure didn't match the spec: still a themed card, never lost content */
async function generic(name: string, node: ContainerDirective, ctx: BlockCtx, opts: Opts): Promise<SdEl> {
  return figure(name, { dataTone: "note", dataFallback: "true" }, [...caption(label(node)), el("div", { className: ["sdb-body"] }, await inner(body(node), ctx, opts))]);
}

export async function renderBlock(node: ContainerDirective, ctx: BlockCtx, opts: Opts = {}): Promise<SdEl> {
  count(ctx, `block:${node.name}`);
  switch (node.name) {
    case "panel":
    case "col": // a stray col outside compare reads as a panel
      return panel(node, ctx, opts);
    case "compare":
      return compare(node, ctx, opts);
    case "steps":
      return steps(node, ctx, opts);
    case "tree":
      return tree(node, ctx, opts);
    case "callout":
      return callout(node, ctx, opts);
    case "stats":
      return stats(node, ctx, opts);
    case "calc":
      return calc(node, ctx, opts);
    case "timeline":
      return timeline(node, ctx, opts);
    case "checkpoint":
      return checkpoint(node, ctx, opts);
    case "answer": // an answer outside a checkpoint reads as a panel
      return panel(node, ctx, opts);
    case "mission":
      return mission(node, ctx, opts);
    default:
      return generic(node.name, node, ctx, opts);
  }
}
