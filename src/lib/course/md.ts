/**
 * Small helpers shared by the course renderer.
 *
 * The renderer builds its output in mdast space. Components are expressed as two
 * custom node types that `remark-rehype` turns into HTML through custom handlers:
 *   - `sdEl`   an element (tag + properties) whose children are ordinary mdast nodes
 *              (paragraphs, lists, inline text…) or further sdEl/sdHast nodes
 *   - `sdHast` a ready-made hast node (used for shiki output and text-derived components)
 */
import type { Nodes as MdNodes, PhrasingContent, RootContent } from "mdast";
import type { ElementContent as HastContent, Element as HastElement, Properties } from "hast";

export type SdMeta = {
  /** markdown heading depth when this element renders a heading */
  heading?: number;
  /** component kind when this element is a detected component */
  component?: string;
};

export interface SdEl {
  type: "sdEl";
  tag: string;
  props: Properties;
  children: AnyNode[];
  meta?: SdMeta;
}

export interface SdHast {
  type: "sdHast";
  hast: HastContent;
  meta?: SdMeta;
}

declare module "mdast" {
  interface RootContentMap {
    sdEl: SdEl;
    sdHast: SdHast;
  }
  interface BlockContentMap {
    sdEl: SdEl;
    sdHast: SdHast;
  }
  interface PhrasingContentMap {
    sdEl: SdEl;
    sdHast: SdHast;
  }
}

export type AnyNode = RootContent | SdEl | SdHast;

export function el(tag: string, props: Properties, children: AnyNode[] = [], meta?: SdMeta): SdEl {
  return { type: "sdEl", tag, props, children, meta };
}

export function text(value: string): PhrasingContent {
  return { type: "text", value };
}

export function rawHast(node: HastContent, meta?: SdMeta): SdHast {
  return { type: "sdHast", hast: node, meta };
}

/* ---------- hast builders (for text-derived components) ---------- */

export type HChild = HastContent | string | null | undefined | false;

export function h(tag: string, props: Properties = {}, children: HChild[] = []): HastElement {
  const kids: HastContent[] = [];
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (typeof c === "string") {
      if (c.length) kids.push({ type: "text", value: c });
    } else kids.push(c);
  }
  return { type: "element", tagName: tag, properties: props, children: kids };
}

/** Chrome: injected UI that is not course text. Excluded from highlight offsets. */
export function chrome(tag: string, props: Properties = {}, children: HChild[] = []): HastElement {
  return h(tag, { ...props, dataSdChrome: "" }, children);
}

/* ---------- text utilities ---------- */

/** Plain text of an mdast (or sd) node. */
export function toText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; value?: unknown; children?: unknown[]; hast?: unknown };
  if (n.type === "sdHast") return hastText(n.hast);
  if (typeof n.value === "string" && n.type !== "html") return n.value;
  if (Array.isArray(n.children)) return n.children.map(toText).join("");
  return "";
}

export function hastText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; value?: unknown; children?: unknown[] };
  if (n.type === "text" && typeof n.value === "string") return n.value;
  if (Array.isArray(n.children)) return n.children.map(hastText).join("");
  return "";
}

/** Emoji that render two columns wide (and that the design strips from headings). */
export const EMOJI_RE = /(?:[\u{1F000}-\u{1FAFF}]|[☀-➿⬀-⯿⌀-⏿]️|[✅❌❎⭐⚡⛔⏳⌛⏰⏱✨❗❓])(?:️|‍(?:[\u{1F000}-\u{1FAFF}]|[☀-➿])️?)*/gu;

/** Remove emoji (and stray variation selectors) from a string, tidying whitespace. */
export function stripEmoji(s: string): string {
  return s.replace(EMOJI_RE, "").replace(/[️‍]/g, "").replace(/\s{2,}/g, " ").trim();
}

export function startsWithEmoji(s: string): boolean {
  EMOJI_RE.lastIndex = 0;
  const m = EMOJI_RE.exec(s.trimStart());
  EMOJI_RE.lastIndex = 0;
  return !!m && m.index === 0;
}

export function wordCount(s: string): number {
  const m = s.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu);
  return m ? m.length : 0;
}

export function isNode<T extends MdNodes["type"] | "sdEl" | "sdHast">(
  n: unknown,
  type: T,
): n is Extract<AnyNode, { type: T }> {
  return !!n && typeof n === "object" && (n as { type?: string }).type === type;
}

export function escapeAttr(s: string): string {
  return s.replace(/[\u0000-\u001f]/g, " ");
}
