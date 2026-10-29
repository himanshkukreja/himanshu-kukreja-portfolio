/**
 * What "Listen" reads aloud, in one place for both readers of it:
 * - the player (components/ReadAloud.tsx) walks the live article DOM;
 * - the narration generator (scripts/listen) walks the renderer's HTML (parsed by ./html.ts).
 * Both get the same blocks, so a recording made from one is known to match the other: the manifest
 * carries `listenSource(blocks)` and the player only plays the recording when its own blocks hash
 * the same (otherwise it falls back to the browser voice).
 *
 * A block is one paragraph-sized unit: p, li, h1–h6, a table row, dt/dd, figcaption, summary.
 * Not read: code (block code always, inline code over 64 characters), diagrams, images, buttons and
 * every piece of UI chrome ([data-sd-chrome], aria-hidden), quick-check quizzes, explainer animations,
 * practice hints/solutions, link lists and bare URLs. Checkpoint answers are read, after a pause.
 * Table rows are read cell by cell ("a, b, c").
 *
 * A root marked `data-listen-scope` is read only inside its `[data-listen-part]` elements: the mock
 * interview debrief reads the model answers (and each phase's heading), never the learner's notes,
 * the rubric or the scorecard around them.
 */

/** The little of the DOM this needs; a browser Node and ./html.ts nodes both fit. */
export type ListenNode = {
  nodeType: number;
  nodeValue: string | null;
  childNodes: ArrayLike<ListenNode>;
  tagName?: string;
  getAttribute?: (name: string) => string | null;
};

export type ListenBlock<N extends ListenNode = ListenNode> = {
  el: N;
  text: string;
  heading: boolean;
  /** the first block of a checkpoint's answer (the narration pauses before it) */
  answer: boolean;
};

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "PRE",
  "BUTTON",
  "SVG",
  "IMG",
  "PICTURE",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "TEMPLATE",
  "NOSCRIPT",
  "IFRAME",
  "VIDEO",
  "AUDIO",
  "CANVAS",
  "OBJECT",
  "MATH",
]);
/** course components (data-sd) that don't work as audio */
const SKIP_SD = new Set(["code", "mermaid", "quiz", "anim", "resources", "practice", "hints", "solution"]);
const HEADINGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
const BLOCK_TAGS = new Set(["P", "LI", "TR", "DT", "DD", "FIGCAPTION", "SUMMARY", "CAPTION", ...HEADINGS]);
/** layout elements: words on either side of them never run together */
const SPACED_TAGS = new Set(["DIV", "SECTION", "ARTICLE", "ASIDE", "HEADER", "FOOTER", "FIGURE", "UL", "OL", "DL", "TABLE", "THEAD", "TBODY", "TFOOT", "BR", "HR", "DETAILS", "BLOCKQUOTE", "MAIN", "NAV"]);
/** phrasing elements: their text belongs to the enclosing block */
const INLINE_TAGS = new Set(["A", "ABBR", "B", "BDI", "BDO", "CITE", "CODE", "DATA", "DEL", "DFN", "EM", "I", "INS", "KBD", "LABEL", "MARK", "Q", "S", "SAMP", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "TIME", "U", "VAR", "WBR"]);
const MAX_INLINE_CODE = 64;
const URLISH = /^(https?:\/\/|www\.)\S+$/i;

const TEXT = 3;
const ELEMENT = 1;

const tagOf = (n: ListenNode) => (n.tagName || "").toUpperCase();
const attr = (n: ListenNode, name: string) => (n.getAttribute ? n.getAttribute(name) : null);

function textOf(n: ListenNode): string {
  if (n.nodeType === TEXT) return n.nodeValue || "";
  let s = "";
  for (let i = 0; i < n.childNodes.length; i++) s += textOf(n.childNodes[i]);
  return s;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function skipped(el: ListenNode): boolean {
  const tag = tagOf(el);
  if (SKIP_TAGS.has(tag)) return true;
  if (attr(el, "aria-hidden") === "true" || attr(el, "data-sd-chrome") !== null) return true;
  const sd = attr(el, "data-sd");
  if (sd && SKIP_SD.has(sd)) return true;
  if (tag === "CODE" && norm(textOf(el)).length > MAX_INLINE_CODE) return true;
  if (tag === "A" && URLISH.test(norm(textOf(el)))) return true;
  return false;
}

/** The article's readable blocks, in reading order. `root` is the article body (or its parsed HTML). */
export function extractBlocks<N extends ListenNode>(root: N): ListenBlock<N>[] {
  type Acc = { el: N; parts: string[]; heading: boolean; answer: boolean };
  const acc: Acc[] = [];
  let answerPending = false;
  const scoped = attr(root, "data-listen-scope") !== null;
  // where loose text (outside any block element) collects: its nearest element
  const add = (block: N, s: string) => {
    const last = acc[acc.length - 1];
    if (last && last.el === block) last.parts.push(s);
    else {
      acc.push({ el: block, parts: [s], heading: HEADINGS.has(tagOf(block)), answer: answerPending });
      answerPending = false;
    }
  };
  const walk = (node: N, block: N, inBlock: boolean, inPart: boolean) => {
    if (node.nodeType === TEXT) {
      const t = node.nodeValue || "";
      if (t && inPart) add(block, t);
      return;
    }
    if (node.nodeType !== ELEMENT && node !== root) return;
    if (node !== root && skipped(node)) return;
    const part = inPart || (node !== root && attr(node, "data-listen-part") !== null);
    const tag = tagOf(node);
    // text outside any block element belongs to its nearest non-inline element (a transcript bubble, a
    // timeline row), never to the article root or a whole section
    const isBlock = node !== root && BLOCK_TAGS.has(tag);
    const own = node === root ? block : isBlock || (!inBlock && !INLINE_TAGS.has(tag)) ? node : block;
    if (node !== root && attr(node, "data-sd-answer") !== null) answerPending = true;
    const spaced = SPACED_TAGS.has(tag) && part;
    if (spaced) add(own, " ");
    const kids = node.childNodes;
    for (let i = 0; i < kids.length; i++) walk(kids[i] as N, own, inBlock || isBlock, part);
    if ((tag === "TD" || tag === "TH") && part) add(own, ", ");
    else if (spaced) add(own, " ");
  };
  walk(root, root, false, !scoped);
  const out: ListenBlock<N>[] = [];
  for (const a of acc) {
    const text = norm(a.parts.join("")).replace(/(?:\s*,)+$/, "").replace(/^(?:,\s*)+/, "");
    // a row of empty cells, a stray separator: nothing to say
    if (!/[\p{L}\p{N}]/u.test(text)) continue;
    out.push({ el: a.el, text, heading: a.heading, answer: a.answer });
  }
  // a block split by a nested block (li > p, li > ul) is two blocks; that's fine, they read in order
  return out;
}

/** The text a recording is tied to: change it and the recording is stale. */
export function listenText(blocks: { text: string }[]): string {
  return blocks.map((b) => b.text).join("\n");
}

/** sha1 of the article's readable text, 12 hex characters (the manifest's `source`). */
export function listenSource(blocks: { text: string }[]): string {
  return sha1hex(listenText(blocks)).slice(0, 12);
}

/** SHA-1, synchronous (the player decides inside the click that started it: iOS only plays audio there). */
export function sha1hex(s: string): string {
  const bytes = new TextEncoder().encode(s);
  const n = bytes.length;
  const blocks = ((n + 8) >> 6) + 1;
  const w = new Uint32Array(blocks * 16);
  for (let i = 0; i < n; i++) w[i >> 2] |= bytes[i] << (24 - (i & 3) * 8);
  w[n >> 2] |= 0x80 << (24 - (n & 3) * 8);
  const bits = n * 8;
  w[blocks * 16 - 1] = bits >>> 0;
  w[blocks * 16 - 2] = Math.floor(bits / 0x100000000);
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const W = new Uint32Array(80);
  for (let b = 0; b < w.length; b += 16) {
    for (let t = 0; t < 16; t++) W[t] = w[b + t];
    for (let t = 16; t < 80; t++) {
      const x = W[t - 3] ^ W[t - 8] ^ W[t - 14] ^ W[t - 16];
      W[t] = (x << 1) | (x >>> 31);
    }
    let a = h0;
    let bb = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let t = 0; t < 80; t++) {
      let f: number;
      let k: number;
      if (t < 20) {
        f = (bb & c) | (~bb & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = bb ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (bb & c) | (bb & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = bb ^ c ^ d;
        k = 0xca62c1d6;
      }
      const tmp = (((a << 5) | (a >>> 27)) + f + e + k + W[t]) >>> 0;
      e = d;
      d = c;
      c = ((bb << 30) | (bb >>> 2)) >>> 0;
      bb = a;
      a = tmp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + bb) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((x) => x.toString(16).padStart(8, "0")).join("");
}
