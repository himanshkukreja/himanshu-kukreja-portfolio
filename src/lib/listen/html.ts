/**
 * A small HTML parser for the narration generator (scripts/listen): turns the course renderer's
 * output (rehype-stringify: well-formed, quoted attributes) into nodes ./extract.ts can walk, the
 * way a browser's innerHTML would. Not for arbitrary web pages. scripts/listen/parity.mjs checks it
 * against Chrome's own parser.
 */
import type { ListenNode } from "./extract";

export type HtmlNode = ListenNode & {
  childNodes: HtmlNode[];
  attrs?: Record<string, string>;
};

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "textarea", "title"]);
/** a new one of these closes an open <p> (the browser's implied end tag) */
const CLOSES_P = new Set(["address", "article", "aside", "blockquote", "details", "div", "dl", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "main", "nav", "ol", "p", "pre", "section", "table", "ul"]);

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rarr: "→",
  larr: "←",
  harr: "↔",
  times: "×",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  bull: "•",
  deg: "°",
  plusmn: "±",
  le: "≤",
  ge: "≥",
  ne: "≠",
  asymp: "≈",
  micro: "µ",
  euro: "€",
  pound: "£",
  rupee: "₹",
  check: "✓",
};

export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[ref] ?? NAMED[ref.toLowerCase()] ?? m;
  });
}

function element(tag: string, attrs: Record<string, string>): HtmlNode {
  return {
    nodeType: 1,
    nodeValue: null,
    tagName: tag.toUpperCase(),
    attrs,
    childNodes: [],
    getAttribute(name: string) {
      const v = attrs[name.toLowerCase()];
      return v === undefined ? null : v;
    },
  };
}

const textNode = (value: string): HtmlNode => ({ nodeType: 3, nodeValue: value, childNodes: [] });

/** Parses an HTML fragment (what React's dangerouslySetInnerHTML is given) into a root node. */
export function parseHtml(html: string): HtmlNode {
  const root: HtmlNode = { nodeType: 11, nodeValue: null, childNodes: [] };
  const stack: { tag: string; node: HtmlNode }[] = [{ tag: "#root", node: root }];
  const top = () => stack[stack.length - 1];
  const append = (n: HtmlNode) => {
    const kids = top().node.childNodes;
    // adjacent text merges, as in the DOM
    const last = kids[kids.length - 1];
    if (n.nodeType === 3 && last && last.nodeType === 3) last.nodeValue = (last.nodeValue || "") + n.nodeValue;
    else kids.push(n);
  };
  const close = (tag: string) => {
    for (let i = stack.length - 1; i > 0; i--) {
      if (stack[i].tag === tag) {
        stack.length = i;
        return;
      }
    }
    // a stray end tag is ignored
  };
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      append(textNode(decodeEntities(html.slice(i))));
      break;
    }
    if (lt > i) append(textNode(decodeEntities(html.slice(i, lt))));
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      const end = html.indexOf(">", lt);
      i = end < 0 ? n : end + 1;
      continue;
    }
    if (html[lt + 1] === "/") {
      const end = html.indexOf(">", lt);
      const tag = html
        .slice(lt + 2, end < 0 ? n : end)
        .trim()
        .toLowerCase();
      // </p> with no open <p> makes an empty paragraph in a browser
      if (tag === "p" && !stack.some((s) => s.tag === "p")) append(element("p", {}));
      else if (tag === "br") append(element("br", {}));
      else close(tag);
      i = end < 0 ? n : end + 1;
      continue;
    }
    const m = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, lt + 64));
    if (!m) {
      append(textNode("<"));
      i = lt + 1;
      continue;
    }
    const tag = m[1].toLowerCase();
    // attributes
    let j = lt + m[0].length;
    const attrs: Record<string, string> = {};
    let selfClose = false;
    while (j < n) {
      while (j < n && /\s/.test(html[j])) j++;
      if (html[j] === ">") {
        j++;
        break;
      }
      if (html[j] === "/" && html[j + 1] === ">") {
        selfClose = true;
        j += 2;
        break;
      }
      const nm = /^[^\s"'>/=]+/.exec(html.slice(j, j + 256));
      if (!nm) {
        j++;
        continue;
      }
      const name = nm[0].toLowerCase();
      j += nm[0].length;
      while (j < n && /\s/.test(html[j])) j++;
      let value = "";
      if (html[j] === "=") {
        j++;
        while (j < n && /\s/.test(html[j])) j++;
        const q = html[j];
        if (q === '"' || q === "'") {
          const end = html.indexOf(q, j + 1);
          value = html.slice(j + 1, end < 0 ? n : end);
          j = end < 0 ? n : end + 1;
        } else {
          const v = /^[^\s>]+/.exec(html.slice(j, j + 1024));
          value = v ? v[0] : "";
          j += value.length;
        }
      }
      if (!(name in attrs)) attrs[name] = decodeEntities(value);
    }
    if (tag === "p" || CLOSES_P.has(tag)) {
      // implied </p>, only when the <p> is the innermost open element in its scope
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === "p") {
          stack.length = k;
          break;
        }
        if (["button", "table", "td", "th", "li", "div", "section", "figure", "blockquote", "details"].includes(stack[k].tag)) break;
      }
    }
    if (tag === "li") {
      // an open <li> in the same list closes
      for (let k = stack.length - 1; k > 0; k--) {
        const t = stack[k].tag;
        if (t === "li") {
          stack.length = k;
          break;
        }
        if (t === "ul" || t === "ol") break;
      }
    }
    const el = element(tag, attrs);
    append(el);
    if (VOID.has(tag) || selfClose) {
      i = j;
      continue;
    }
    if (RAW.has(tag)) {
      const end = html.toLowerCase().indexOf(`</${tag}`, j);
      const body = html.slice(j, end < 0 ? n : end);
      if (body) el.childNodes.push(textNode(tag === "textarea" || tag === "title" ? decodeEntities(body) : body));
      const gt = end < 0 ? n : html.indexOf(">", end);
      i = gt < 0 ? n : gt + 1;
      continue;
    }
    stack.push({ tag, node: el });
    i = j;
  }
  return root;
}
