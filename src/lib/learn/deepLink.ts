/**
 * Deep links to an exact passage ("share the line we were reading") and to sections.
 *
 * A passage link carries two locators:
 *
 *   https://himanshukukreja.in/learn/…/lesson?at=s-2-1-write-path,1,the+commit+log,before+the+ack
 *     #:~:text=prefix-,the%20commit%20log,before%20the%20ack,-suffix
 *
 * - `#:~:text=…` is a W3C Text Fragment: Chrome, Edge, Safari and Firefox scroll to the text and
 *   highlight it natively, before any of our code runs. Prefix / suffix words are added until the
 *   first match on the page is the selected one.
 * - `?at=<scope>,<n>,<start>[,<end>]` is our own fallback, resolved by <DeepLinkResolver/> after the
 *   content has mounted: `scope` = id of the nearest heading / stage at or before the passage,
 *   `n` = which occurrence of `start` after that heading, `start` / `end` = the first and last few
 *   words (or the whole quote when short). It survives client rendering (highlights re-inject the
 *   HTML), the auto-hiding header and browsers without text fragments, lands the passage under the
 *   sticky chrome and flashes a temporary highlight (CSS Custom Highlight API, overlay boxes
 *   elsewhere; never written into the content, so it can't collide with saved highlights).
 *
 * Text is indexed the same way on both ends: text nodes in document order, skipping chrome
 * ([data-sd-chrome]), scripts, styles and SVG diagrams, whitespace collapsed, one space at block
 * boundaries (by tag name, so the index doesn't depend on the viewport).
 */
import { track } from "@/lib/track";
import { copyText } from "@/lib/learn/askAi";
import { headerStackBottom, stageRailHeight, topInset } from "@/components/learn/lesson/layout";

export const AT_PARAM = "at";
export const LINK_COPIED = "Link copied — opens at this line";

/* ------------------------------------------------------------------ text index */

type TextIndex = {
  text: string;
  nodes: Text[];
  /** index in `text` where each node's characters begin */
  nodeK: number[];
  /** per character of `text`: node index, offset in that node, block id */
  nodeOf: Int32Array;
  offOf: Int32Array;
  blk: Int32Array;
  nodeIdx: Map<Node, number>;
};

const WS = /\s/;
const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "svg", "math"]);
const PAGE_SKIP_TAGS = new Set(["script", "style", "noscript", "template"]);
const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "body", "dd", "details", "dialog", "div", "dl", "dt", "fieldset",
  "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav",
  "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul", "caption", "br",
]);

/**
 * `content`: the stable index used by `?at=` (both ends must agree). `page`: what the browser's own
 * text-fragment matcher sees (rendered text of the whole page, blocks by computed display).
 */
function buildIndex(root: Node, mode: "content" | "page" = "content"): TextIndex {
  const page = mode === "page";
  const display = new Map<Element, string>();
  const disp = (el: Element) => {
    let d = display.get(el);
    if (d === undefined) {
      d = window.getComputedStyle(el).display;
      display.set(el, d);
    }
    return d;
  };
  const isBlock = (el: Element) => (page ? !disp(el).startsWith("inline") && disp(el) !== "contents" : BLOCK_TAGS.has(el.localName));
  const blockCache = new Map<Element, number>();
  let blockSeq = 0;
  const blockOf = (n: Node): number => {
    const path: Element[] = [];
    let el = n.parentElement;
    let id = 0;
    while (el) {
      const cached = blockCache.get(el);
      if (cached !== undefined) {
        id = cached;
        break;
      }
      path.push(el);
      if (isBlock(el)) {
        id = ++blockSeq;
        break;
      }
      if (el === root) break;
      el = el.parentElement;
    }
    for (const p of path) blockCache.set(p, id);
    return id;
  };

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (page) {
          if (PAGE_SKIP_TAGS.has(el.localName) || el.hasAttribute("hidden") || disp(el) === "none") return NodeFilter.FILTER_REJECT;
        } else if (SKIP_TAGS.has(el.localName) || el.hasAttribute("data-sd-chrome")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const out: string[] = [];
  const nodeOf: number[] = [];
  const offOf: number[] = [];
  const blk: number[] = [];
  const nodes: Text[] = [];
  const nodeK: number[] = [];
  const nodeIdx = new Map<Node, number>();
  let lastBlock = -1;
  let lastSpace = true;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const i = nodes.length;
    nodes.push(n as Text);
    nodeIdx.set(n, i);
    const b = blockOf(n);
    if (out.length && b !== lastBlock && !lastSpace) {
      out.push(" ");
      nodeOf.push(i);
      offOf.push(0);
      blk.push(b);
      lastSpace = true;
    }
    nodeK.push(out.length);
    const v = n.nodeValue || "";
    for (let j = 0; j < v.length; j++) {
      const c = v[j];
      if (WS.test(c)) {
        if (lastSpace) continue;
        out.push(" ");
        lastSpace = true;
      } else {
        out.push(c);
        lastSpace = false;
      }
      nodeOf.push(i);
      offOf.push(j);
      blk.push(b);
    }
    lastBlock = b;
  }
  return { text: out.join(""), nodes, nodeK, nodeOf: Int32Array.from(nodeOf), offOf: Int32Array.from(offOf), blk: Int32Array.from(blk), nodeIdx };
}

/** Index in the text of the first character at or after a DOM point. */
function pointToIndex(idx: TextIndex, container: Node, offset: number): number {
  const i = idx.nodeIdx.get(container);
  if (i !== undefined) {
    let k = idx.nodeK[i];
    while (k < idx.text.length && idx.nodeOf[k] === i && idx.offOf[k] < offset) k++;
    return k;
  }
  // an element (or skipped) container: the first indexed text node after the point
  const point = document.createRange();
  try {
    point.setStart(container, offset);
  } catch {
    return idx.text.length;
  }
  point.collapse(true);
  let lo = 0;
  let hi = idx.nodes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    let after = false;
    try {
      after = point.comparePoint(idx.nodes[mid], 0) >= 0;
    } catch {
      after = false;
    }
    if (after) hi = mid;
    else lo = mid + 1;
  }
  return lo < idx.nodes.length ? idx.nodeK[lo] : idx.text.length;
}

function rangeFrom(idx: TextIndex, s: number, e: number): Range | null {
  if (e <= s || s < 0 || e > idx.text.length) return null;
  const r = document.createRange();
  try {
    r.setStart(idx.nodes[idx.nodeOf[s]], idx.offOf[s]);
    const last = e - 1;
    r.setEnd(idx.nodes[idx.nodeOf[last]], idx.offOf[last] + 1);
  } catch {
    return null;
  }
  return r;
}

function trimSpan(text: string, s: number, e: number): [number, number] {
  while (s < e && text[s] === " ") s++;
  while (e > s && text[e - 1] === " ") e--;
  return [s, e];
}

/* ------------------------------------------------------------------ ?at= locator */

export type Locator = { scope: string; n: number; start: string; end: string };

const SCOPES = 'h1[id], h2[id], h3[id], h4[id], h5[id], h6[id], section[data-sd="stage"][id]';
const SHORT_QUOTE = 64;

/** The first / last words of a long quote: at least ~24 characters, at most 6 words. */
function headWords(q: string): string {
  const words = q.split(" ");
  let out = "";
  for (const w of words.slice(0, 6)) {
    out = out ? `${out} ${w}` : w;
    if (out.length >= 24) break;
  }
  return out;
}

function tailWords(q: string): string {
  const words = q.split(" ");
  let out = "";
  for (const w of words.slice(-6).reverse()) {
    out = out ? `${w} ${out}` : w;
    if (out.length >= 24) break;
  }
  return out;
}

function countBefore(text: string, needle: string, from: number, until: number): number {
  let n = 0;
  for (let k = text.indexOf(needle, from); k >= 0 && k < until; k = text.indexOf(needle, k + 1)) n++;
  return n;
}

function locatorFor(root: Element, idx: TextIndex, s: number, e: number): Locator {
  const text = idx.text;
  const quote = text.slice(s, e);
  let scope = "";
  let scopeK = 0;
  root.querySelectorAll<HTMLElement>(SCOPES).forEach((el) => {
    const k = pointToIndex(idx, el, 0);
    if (k <= s && k >= scopeK) {
      scope = el.id;
      scopeK = k;
    }
  });
  let start = quote;
  let end = "";
  if (quote.length > SHORT_QUOTE) {
    const h = headWords(quote);
    const t = tailWords(quote);
    if (h.length + t.length < quote.length) {
      start = h;
      end = t;
    }
  }
  return { scope, n: countBefore(text, start, scopeK, s), start, end };
}

const encPart = (s: string) => encodeURIComponent(s).replace(/%20/g, "+");
const decPart = (s: string) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return "";
  }
};

export function encodeLocator(l: Locator): string {
  const parts = [l.scope, String(l.n), l.start];
  if (l.end) parts.push(l.end);
  return parts.map(encPart).join(",");
}

/** The locator in the current URL (`?at=`), or null. */
export function readLocator(search: string = typeof window === "undefined" ? "" : window.location.search): Locator | null {
  const m = search.match(/[?&]at=([^&#]*)/);
  if (!m) return null;
  const [scope = "", n = "0", start = "", end = ""] = m[1].split(",").map(decPart);
  const count = Number(n);
  if (!start.trim() || !Number.isInteger(count) || count < 0 || count > 10_000) return null;
  return { scope, n: count, start: start.replace(/\s+/g, " ").trim(), end: end.replace(/\s+/g, " ").trim() };
}

/** The current URL without `?at=` (hash kept). */
export function urlWithoutLocator(): string {
  const params = new URLSearchParams(window.location.search);
  params.delete(AT_PARAM);
  const q = params.toString();
  return `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`;
}

function findNth(text: string, needle: string, from: number, n: number): number {
  let k = text.indexOf(needle, from);
  for (let i = 0; i < n && k >= 0; i++) k = text.indexOf(needle, k + 1);
  return k;
}

export type Resolved = { range: Range | null; scope: HTMLElement | null };

/** Find the passage a locator points at inside `root`. */
export function resolveLocator(root: Element, loc: Locator): Resolved {
  const idx = buildIndex(root);
  const text = idx.text;
  const scopeEl = loc.scope ? root.querySelector<HTMLElement>(`[id="${cssEscape(loc.scope)}"]`) : null;
  const scopeK = scopeEl ? pointToIndex(idx, scopeEl, 0) : 0;
  let len = loc.start.length;
  let hay = text;
  let start = loc.start;
  let k = findNth(hay, start, scopeK, loc.n);
  if (k < 0) k = hay.indexOf(start, scopeK); // fewer occurrences now: the first one after the heading
  if (k < 0) k = hay.indexOf(start);
  if (k < 0) {
    // case changed in an edit
    const lower = text.toLowerCase();
    if (lower.length === text.length) {
      hay = lower;
      start = loc.start.toLowerCase();
      k = findNth(hay, start, scopeK, loc.n);
      if (k < 0) k = hay.indexOf(start);
    }
  }
  if (k < 0) {
    // the sentence was edited: its first three words
    const words = loc.start.split(" ").slice(0, 3).join(" ");
    if (words.length >= 10 && words !== loc.start) {
      k = text.indexOf(words, scopeK);
      if (k < 0) k = text.indexOf(words);
      len = words.length;
      hay = text;
    }
  }
  if (k < 0) return { range: null, scope: scopeEl };
  let e = k + len;
  if (loc.end) {
    const end = hay === text ? loc.end : loc.end.toLowerCase();
    const j = hay.indexOf(end, e);
    if (j >= 0 && j - k < 20_000) e = j + end.length;
  }
  return { range: rangeFrom(idx, k, e), scope: scopeEl };
}

function cssEscape(s: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&");
}

/* ------------------------------------------------------------------ #:~:text= fragment */

let wordRe: RegExp | null = null;
function isWordChar(c: string | undefined): boolean {
  if (!c) return false;
  if (!wordRe) {
    try {
      wordRe = new RegExp("[\\p{L}\\p{N}_]", "u");
    } catch {
      wordRe = /[A-Za-z0-9_\u00C0-\uFFFF]/;
    }
  }
  return wordRe.test(c);
}

/** First match of `needle` in `hay` at or after `from` that starts and ends on word boundaries. */
function firstWordMatch(hay: string, needle: string, from: number): number {
  if (!needle) return -1;
  for (let k = hay.indexOf(needle, from); k >= 0; k = hay.indexOf(needle, k + 1)) {
    const before = hay[k - 1];
    const after = hay[k + needle.length];
    const okStart = !(isWordChar(before) && isWordChar(needle[0]));
    const okEnd = !(isWordChar(after) && isWordChar(needle[needle.length - 1]));
    if (okStart && okEnd) return k;
  }
  return -1;
}

const encFrag = (s: string) => encodeURIComponent(s).replace(/-/g, "%2D");

/** Index of the start of the w-th word before `k` (not crossing `floor`), skipping the gap. */
function wordsBack(text: string, k: number, w: number, floor: number): number {
  let i = k;
  for (let n = 0; n < w; n++) {
    while (i > floor && text[i - 1] === " ") i--;
    if (i <= floor) return floor;
    while (i > floor && text[i - 1] !== " ") i--;
  }
  return i;
}

/** Index just past the w-th word after `k` (not crossing `ceil`). */
function wordsForward(text: string, k: number, w: number, ceil: number): number {
  let i = k;
  for (let n = 0; n < w; n++) {
    while (i < ceil && text[i] === " ") i++;
    if (i >= ceil) return ceil;
    while (i < ceil && text[i] !== " ") i++;
  }
  return i;
}

/** A text directive (without the `#:~:text=` lead) for the range, or "" when it can't be built. */
export function textFragmentFor(range: Range): string {
  const idx = buildIndex(document.body, "page");
  const T = idx.text;
  const lowerT = T.toLowerCase();
  const L = lowerT.length === T.length ? lowerT : T;
  let [s, e] = trimSpan(T, pointToIndex(idx, range.startContainer, range.startOffset), pointToIndex(idx, range.endContainer, range.endOffset));
  if (e <= s) return "";
  // text fragments match whole words
  while (s > 0 && isWordChar(T[s - 1]) && isWordChar(T[s])) s--;
  while (e < T.length && isWordChar(T[e - 1]) && isWordChar(T[e])) e++;
  const bS = idx.blk[s];
  const bE = idx.blk[e - 1];
  let blockStart = s;
  while (blockStart > 0 && idx.blk[blockStart - 1] === bS) blockStart--;
  let blockEnd = e;
  while (blockEnd < T.length && idx.blk[blockEnd] === bE) blockEnd++;
  let startBlockEnd = s;
  while (startBlockEnd < T.length && idx.blk[startBlockEnd] === bS) startBlockEnd++;
  let endBlockStart = e;
  while (endBlockStart > 0 && idx.blk[endBlockStart - 1] === bE) endBlockStart--;

  // textStart [, textEnd]: one term when the passage is short and inside one block
  let startEnd = e; // end index of textStart
  let endStart = -1; // start index of textEnd
  if (!(bS === bE && e - s <= 80)) {
    startEnd = wordsForward(T, s, 4, Math.min(e, startBlockEnd));
    endStart = wordsBack(T, e, 4, Math.max(startEnd, endBlockStart));
    while (endStart < e && T[endStart] === " ") endStart++;
    if (endStart <= startEnd || endStart >= e) {
      if (bS !== bE) return "";
      startEnd = e;
      endStart = -1;
    }
  }
  const startTerm = T.slice(s, startEnd).trim();
  const endTerm = endStart >= 0 ? T.slice(endStart, e).trim() : "";
  if (!startTerm) return "";

  // prefix words until the first match on the page is this one
  let prefixK = s;
  for (const w of [0, 1, 2, 3, 4, 6, 8]) {
    const k0 = wordsBack(T, s, w, blockStart);
    if (firstWordMatch(L, L.slice(k0, startEnd), 0) === k0) {
      prefixK = k0;
      break;
    }
    prefixK = k0;
    if (k0 === blockStart && w > 0) break;
  }
  // suffix words until the end term (or the single term) is the first match after the start
  // (single term: prefix + term + suffix must first match here; range: the end term after the start)
  const tailFrom = endStart >= 0 ? endStart : prefixK;
  const from = endStart >= 0 ? startEnd : 0;
  let suffixK = e;
  for (const w of [0, 1, 2, 3, 4, 6]) {
    const k1 = wordsForward(T, e, w, blockEnd);
    if (firstWordMatch(L, L.slice(tailFrom, k1), from) === tailFrom) {
      suffixK = k1;
      break;
    }
    suffixK = k1;
    if (k1 === blockEnd && w > 0) break;
  }
  const prefix = T.slice(prefixK, s).trim();
  const suffix = T.slice(e, suffixK).trim();
  const parts: string[] = [];
  if (prefix) parts.push(`${encFrag(prefix)}-`);
  parts.push(encFrag(startTerm));
  if (endTerm) parts.push(encFrag(endTerm));
  if (suffix) parts.push(`-${encFrag(suffix)}`);
  return parts.join(",");
}

/* ------------------------------------------------------------------ building + sharing links */

function pageBase(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

export type PassageLink = { url: string; quote: string };

/** The deep link for a selected range inside the content root. */
export function passageLink(root: Element, range: Range): PassageLink | null {
  const idx = buildIndex(root);
  const [s, e] = trimSpan(idx.text, pointToIndex(idx, range.startContainer, range.startOffset), pointToIndex(idx, range.endContainer, range.endOffset));
  if (e <= s) return null;
  const loc = locatorFor(root, idx, s, e);
  let frag = "";
  try {
    frag = textFragmentFor(range);
  } catch {
    frag = "";
  }
  return { url: `${pageBase()}?${AT_PARAM}=${encodeLocator(loc)}${frag ? `#:~:text=${frag}` : ""}`, quote: idx.text.slice(s, e) };
}

export function sectionLink(id: string): string {
  return `${pageBase()}#${encodeURIComponent(id)}`;
}

export function canNativeShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export type ShareResult = "copied" | "shared" | "cancelled" | "failed";

/**
 * Copy (or hand to the share sheet) a link. Call straight from the click handler: the clipboard
 * and the share sheet both need the user gesture.
 */
export async function shareLink(url: string, opts: { kind: "selection" | "section"; channel: "copy" | "share"; title?: string; text?: string }): Promise<ShareResult> {
  if (opts.channel === "share" && canNativeShare()) {
    try {
      await navigator.share({ url, title: opts.title, text: opts.text });
      track("share_link", { kind: opts.kind, channel: "share" });
      return "shared";
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return "cancelled";
      // share sheet unavailable here (permissions, iframe): copy instead
    }
  }
  const ok = await copyText(url);
  if (ok) track("share_link", { kind: opts.kind, channel: "copy" });
  return ok ? "copied" : "failed";
}

/** Copy / share the link to a selected passage. */
export async function sharePassage(root: Element, range: Range, channel: "copy" | "share", title?: string): Promise<ShareResult> {
  const link = passageLink(root, range);
  if (!link) return "failed";
  const q = link.quote.length > 140 ? `${link.quote.slice(0, 137).trimEnd()}…` : link.quote;
  return shareLink(link.url, { kind: "selection", channel, title, text: title ? `“${q}” — ${title}` : `“${q}”` });
}

/* ------------------------------------------------------------------ landing */

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Bottom edge of the sticky chrome showing right now (site header, stage bar, story reader bar). */
export function chromeBottom(): number {
  return headerStackBottom() + stageRailHeight();
}

/** Lesson pages: the header slides away on the way down and returns on the way up. */
function autoHidingHeader(): boolean {
  return !!document.querySelector("[data-stage-rail]");
}

/** Room left above a landed passage, so a line or two of context shows under the chrome. */
function contextGap(chrome: number): number {
  return Math.round(Math.min(120, Math.max(40, (window.innerHeight - chrome) * 0.2)));
}

/**
 * Scroll so a viewport `top` lands `gap` px under the chrome that will show once the scroll ends
 * (lesson pages: going down only the stage bar stays, going up the header comes back on top).
 * `html { scroll-behavior: smooth }` makes "auto" smooth, so jumps say "instant".
 */
function jumpTo(top: number, gap: (chrome: number) => number, behavior: ScrollBehavior) {
  const rail = stageRailHeight();
  let chrome = chromeBottom();
  if (autoHidingHeader()) {
    const header = document.querySelector<HTMLElement>("header[data-focus-hide]");
    const headerH = header ? header.offsetHeight : 0;
    const goingDown = top > chrome;
    const y = window.scrollY + top - rail;
    chrome = goingDown && y > 200 ? topInset() + rail : headerH + rail;
  }
  const delta = top - chrome - gap(chrome);
  if (Math.abs(delta) < 2) return;
  const far = Math.abs(delta) > window.innerHeight * 3;
  window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: prefersReducedMotion() || far ? "instant" : behavior });
}

/** Land a passage (viewport `top`) under the chrome with a line or two of context above it. */
export function scrollToViewportTop(top: number, behavior: ScrollBehavior = "instant") {
  jumpTo(top, contextGap, behavior);
}

/** Is a viewport `top` comfortably on screen, below the chrome? */
export function wellPlaced(top: number): boolean {
  const chrome = chromeBottom();
  return top >= chrome + 4 && top <= chrome + (window.innerHeight - chrome) * 0.5;
}

export function firstRect(range: Range): DOMRect | null {
  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
  if (rects.length) return rects[0];
  const r = range.getBoundingClientRect();
  return r.width || r.height ? r : null;
}

/** Scroll a section heading to just under the sticky chrome (same rule as the reader's scrollToId). */
export function scrollToElement(el: HTMLElement, behavior: ScrollBehavior = "smooth") {
  jumpTo(el.getBoundingClientRect().top, () => 12, behavior);
}

/** Open collapsed content around a passage (details, collapsed code, unrevealed answers). */
export function uncover(range: Range) {
  let el: Element | null = range.startContainer.nodeType === Node.ELEMENT_NODE ? (range.startContainer as Element) : range.startContainer.parentElement;
  // a folded capstone solution ("Design it first") unfolds for a passage link into it (components/learn/lesson/layout.ts)
  if (el) window.dispatchEvent(new CustomEvent("hk:reveal-target", { detail: { el } }));
  while (el) {
    if (el instanceof HTMLDetailsElement && !el.open) el.open = true;
    if (el.matches('[data-sd="code"][data-collapsed="true"]')) el.querySelector<HTMLElement>('[data-sd-action="expand"]')?.click();
    if (el.matches('[data-sd="reveal"]:not([data-revealed="true"])')) el.querySelector<HTMLElement>('[data-sd-action="reveal"]')?.click();
    el = el.parentElement;
  }
}

/* ------------------------------------------------------------------ the temporary highlight */

const HL_STRONG = "sd-deeplink";
const HL_SOFT = "sd-deeplink-soft";

/** Global styles for the flash (rendered by the resolver); also themes the browser's own text-fragment mark. */
export const DEEPLINK_CSS = `
::highlight(${HL_STRONG}) { background-color: rgba(255, 107, 43, 0.34); color: inherit; text-decoration: underline 2px #FF6B2B; text-underline-offset: 3px; }
::highlight(${HL_SOFT}) { background-color: rgba(255, 107, 43, 0.16); color: inherit; }
::target-text { background-color: rgba(255, 107, 43, 0.34); color: inherit; }
.sd-deeplink-box { position: absolute; pointer-events: none; z-index: 1; background: rgba(255, 107, 43, 0.26); box-shadow: inset 0 -2px 0 #FF6B2B; transition: opacity 600ms ease; }
.sd-deeplink-box[data-soft] { opacity: 0.5; box-shadow: none; }
`;

type HighlightApi = { set(name: string, h: unknown): void; delete(name: string): void };

function highlightApi(): { registry: HighlightApi; make: (r: Range) => unknown } | null {
  const reg = (typeof CSS !== "undefined" ? (CSS as unknown as { highlights?: HighlightApi }).highlights : undefined) ?? null;
  const Ctor = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  if (!reg || !Ctor) return null;
  return { registry: reg, make: (r) => new Ctor(r) };
}

/**
 * Paint `range` (re-fetched through `get`, since the content can be re-rendered) with the themed
 * flash: strong for a moment, then soft, then gone. Returns a cleanup.
 */
export type Flash = { stop: () => void; repaint: () => void };

export function flashPassage(get: () => Range | null, opts: { strongMs?: number; totalMs?: number } = {}): Flash {
  const api = highlightApi();
  let soft = false;
  let boxes: HTMLElement[] = [];
  const clearBoxes = () => {
    boxes.forEach((b) => b.remove());
    boxes = [];
  };
  const paint = () => {
    const r = get();
    if (api) {
      api.registry.delete(HL_STRONG);
      api.registry.delete(HL_SOFT);
      if (r) api.registry.set(soft ? HL_SOFT : HL_STRONG, api.make(r));
      return;
    }
    clearBoxes();
    if (!r) return;
    for (const rect of Array.from(r.getClientRects())) {
      if (rect.width < 1 || rect.height < 1) continue;
      const b = document.createElement("div");
      b.className = "sd-deeplink-box";
      b.setAttribute("data-sd-chrome", "");
      b.setAttribute("aria-hidden", "true");
      if (soft) b.setAttribute("data-soft", "");
      b.style.left = `${rect.left + window.scrollX}px`;
      b.style.top = `${rect.top + window.scrollY}px`;
      b.style.width = `${rect.width}px`;
      b.style.height = `${rect.height}px`;
      document.body.appendChild(b);
      boxes.push(b);
    }
  };
  paint();
  let raf = 0;
  const repaint = () => {
    if (!raf) raf = window.requestAnimationFrame(() => ((raf = 0), paint()));
  };
  window.addEventListener("resize", repaint);
  const t1 = window.setTimeout(() => {
    soft = true;
    paint();
  }, opts.strongMs ?? 2600);
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    window.clearTimeout(t1);
    window.clearTimeout(t2);
    window.removeEventListener("resize", repaint);
    if (raf) window.cancelAnimationFrame(raf);
    if (api) {
      api.registry.delete(HL_STRONG);
      api.registry.delete(HL_SOFT);
    }
    clearBoxes();
  };
  const t2 = window.setTimeout(stop, opts.totalMs ?? 9000);
  return { stop, repaint };
}
