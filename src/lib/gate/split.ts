/**
 * The sign-in gate, server side (owner, 16 Nov 2026): a guest reads the first part of every content page, then the
 * text fades into a sign-in card. This marks where.
 *
 * gateHtml(html) finds a cut about 28% of the way into a rendered article (by text length) and tags every block
 * after it with class "hk-gated"; the first of those also gets "hk-gate-peek". Nothing is removed: the full text
 * stays in the page for everyone (a soft gate, declared to search engines with isAccessibleForFree: false and
 * hasPart.cssSelector ".hk-gated", src/lib/seo/jsonld.tsx). CSS does the rest for guests only (html.hk-guest,
 * set before paint by GATE_JS in ./flag.ts): the peek fades out under a fixed height, the other gated blocks are
 * not shown (globals.css "Sign-in gate").
 *
 * Where it cuts: between blocks, never inside a paragraph. It looks through a lone wrapper (the renderer's
 * .sd-body), keeps at least the hook and the first section when the blocks are sections (a lesson's stages) and
 * the two fit under 45%, and otherwise cuts at the first block boundary between 25% and 40%; if one block spans
 * that whole range (a huge stage), it cuts inside that block the same way. Short pages (under ~1,500 characters
 * of text) and anything it can't read as balanced HTML are left whole: the failure mode is an open page, never a
 * broken one.
 *
 * Import-free (scripts/tests/signin-gate.test.mjs runs it under plain node).
 */

export const GATED_CLASS = "hk-gated";
export const PEEK_CLASS = "hk-gate-peek";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "textarea", "title"]);
/** wrappers the cut may go inside (never a list, table, figure or paragraph) */
const DESCEND = new Set(["div", "section", "article", "main"]);
const MAX_DEPTH = 6;

type Node = {
  start: number;
  end: number;
  /** lower-case tag name, or "#text" */
  tag: string;
  /** [after the open tag, start of the close tag] for an element with content */
  inner: [number, number] | null;
  /** visible text length (whitespace not counted) */
  text: number;
};

/** index just past the `>` that ends the tag opening at `i` (quotes respected), or -1 */
function tagEnd(html: string, i: number): number {
  let q = "";
  for (let k = i + 1; k < html.length; k++) {
    const c = html[k];
    if (q) {
      if (c === q) q = "";
    } else if (c === '"' || c === "'") q = c;
    else if (c === ">") return k + 1;
  }
  return -1;
}

const NAME_RE = /^<\/?([a-zA-Z][a-zA-Z0-9:-]*)/;
const nameAt = (html: string, i: number) => NAME_RE.exec(html.slice(i, i + 80))?.[1]?.toLowerCase() ?? null;

/** the end of a raw-text element's content (`</script` …), or null */
function rawClose(html: string, from: number, tag: string): { start: number; end: number } | null {
  const at = html.toLowerCase().indexOf(`</${tag}`, from);
  if (at < 0) return null;
  const e = tagEnd(html, at);
  return e < 0 ? null : { start: at, end: e };
}

/** The close tag that balances an element opened just before `from`; null when the HTML isn't balanced. */
function matchClose(html: string, from: number, to: number, tag: string): { start: number; end: number } | null {
  const stack = [tag];
  let i = from;
  while (i < to) {
    const lt = html.indexOf("<", i);
    if (lt < 0 || lt >= to) return null;
    if (html.startsWith("<!--", lt)) {
      const e = html.indexOf("-->", lt + 4);
      if (e < 0) return null;
      i = e + 3;
      continue;
    }
    const next = html[lt + 1];
    if (next === "!" || next === "?") {
      const e = tagEnd(html, lt);
      if (e < 0) return null;
      i = e;
      continue;
    }
    const name = nameAt(html, lt);
    if (!name) {
      i = lt + 1; // a bare "<" in text
      continue;
    }
    const e = tagEnd(html, lt);
    if (e < 0) return null;
    if (next === "/") {
      if (stack[stack.length - 1] !== name) return null;
      stack.pop();
      if (!stack.length) return { start: lt, end: e };
      i = e;
      continue;
    }
    if (VOID.has(name) || html[e - 2] === "/") {
      i = e;
      continue;
    }
    if (RAW.has(name)) {
      const c = rawClose(html, e, name);
      if (!c) return null;
      i = c.end;
      continue;
    }
    stack.push(name);
    i = e;
  }
  return null;
}

/** visible characters between from and to (tags, comments, scripts and whitespace skipped; an entity counts once) */
function textLen(html: string, from: number, to: number): number {
  let n = 0;
  let i = from;
  while (i < to) {
    const c = html[i];
    if (c === "<") {
      if (html.startsWith("<!--", i)) {
        const e = html.indexOf("-->", i + 4);
        i = e < 0 ? to : e + 3;
        continue;
      }
      const name = nameAt(html, i);
      if (!name) {
        n++;
        i++;
        continue;
      }
      const e = tagEnd(html, i);
      if (e < 0) return n;
      if (html[i + 1] !== "/" && RAW.has(name)) {
        const r = rawClose(html, e, name);
        i = r ? r.end : to;
        continue;
      }
      i = e;
      continue;
    }
    if (c === "&") {
      const semi = html.indexOf(";", i);
      if (semi > i && semi - i < 12) {
        n++;
        i = semi + 1;
        continue;
      }
    }
    if (c !== " " && c !== "\n" && c !== "\t" && c !== "\r") n++;
    i++;
  }
  return n;
}

/** The top-level nodes between from and to (whitespace-only text and comments skipped); null if unbalanced. */
function kids(html: string, from: number, to: number): Node[] | null {
  const out: Node[] = [];
  let i = from;
  while (i < to) {
    const lt = html.indexOf("<", i);
    const stop = lt < 0 || lt >= to ? to : lt;
    if (stop > i) {
      const t = textLen(html, i, stop);
      if (t > 0) out.push({ start: i, end: stop, tag: "#text", inner: null, text: t });
      i = stop;
      continue;
    }
    if (html.startsWith("<!--", i)) {
      const e = html.indexOf("-->", i + 4);
      if (e < 0 || e + 3 > to) return null;
      i = e + 3;
      continue;
    }
    if (html[i + 1] === "/") return null; // a stray close tag at this level
    if (html[i + 1] === "!" || html[i + 1] === "?") {
      const e = tagEnd(html, i);
      if (e < 0) return null;
      i = e;
      continue;
    }
    const tag = nameAt(html, i);
    if (!tag) return null;
    const open = tagEnd(html, i);
    if (open < 0 || open > to) return null;
    if (VOID.has(tag) || html[open - 2] === "/") {
      out.push({ start: i, end: open, tag, inner: null, text: 0 });
      i = open;
      continue;
    }
    const close = RAW.has(tag) ? rawClose(html, open, tag) : matchClose(html, open, to, tag);
    if (!close || close.end > to) return null;
    out.push({ start: i, end: close.end, tag, inner: [open, close.start], text: RAW.has(tag) ? 0 : textLen(html, open, close.start) });
    i = close.end;
  }
  return out;
}

const sum = (list: Node[]) => list.reduce((a, n) => a + n.text, 0);

/**
 * The nodes to gate in `list` (document order), keeping between lo and hi characters of text before them.
 * `first`: this is the first level with more than one block (where "the hook and the first section" applies).
 */
function plan(html: string, list: Node[], lo: number, hi: number, total: number, depth: number, first: boolean): Node[] | null {
  if (list.length === 1) {
    const only = list[0];
    if (!only.inner || !DESCEND.has(only.tag) || depth >= MAX_DEPTH) return null;
    const inner = kids(html, only.inner[0], only.inner[1]);
    return inner ? plan(html, inner, lo, hi, total, depth + 1, first) : null;
  }
  if (first) {
    // a lesson's stages: the hook (intro) and the first section stay open, if together they're under 45%
    const sections = list.map((n, i) => (n.tag === "section" ? i : -1)).filter((i) => i >= 0);
    if (sections.length >= 3) {
      const two = sum(list.slice(0, sections[1] + 1));
      if (two <= total * 0.45) {
        lo = Math.max(lo, two);
        hi = Math.max(hi, two);
      }
    }
  }
  let cum = 0;
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    const after = cum + n.text;
    if (after < lo) {
      cum = after;
      continue;
    }
    // the boundary after this block is in range
    if (after <= hi && i < list.length - 1) return list.slice(i + 1);
    // or the one before it is close enough
    if (i > 0 && cum >= lo * 0.8) return list.slice(i);
    // this block spans the range: cut inside it
    if (n.inner && DESCEND.has(n.tag) && depth < MAX_DEPTH) {
      const inner = kids(html, n.inner[0], n.inner[1]);
      const sub = inner && inner.length > 1 ? plan(html, inner, lo - cum, hi - cum, total, depth + 1, false) : null;
      if (sub && sub.length) return [...sub, ...list.slice(i + 1)];
    }
    if (i > 0) return list.slice(i);
    return i < list.length - 1 ? list.slice(i + 1) : null;
  }
  return null;
}

/** `<tag …>` with `cls` added to its class attribute */
function withClass(openTag: string, cls: string): string {
  const m = /\sclass\s*=\s*(["'])([\s\S]*?)\1/.exec(openTag);
  if (m) {
    const at = m.index + m[0].length - 1; // the closing quote
    return `${openTag.slice(0, at)}${m[2].trim() ? " " : ""}${cls}${openTag.slice(at)}`;
  }
  const name = NAME_RE.exec(openTag)![0];
  return `${name} class="${cls}"${openTag.slice(name.length)}`;
}

export type GateResult = { html: string; gated: boolean; /** share of the text left open, 0..1 */ open: number };

export type GateOptions = {
  /** keep at least this share of the text open (default 0.25) */
  lo?: number;
  /** and at most this share, where the blocks allow (default 0.40) */
  hi?: number;
  /** pages with less text than this stay whole (default 1500 characters) */
  minChars?: number;
};

export function gateHtml(html: string, o: GateOptions = {}): GateResult {
  const whole: GateResult = { html, gated: false, open: 1 };
  if (!html) return whole;
  const top = kids(html, 0, html.length);
  if (!top || !top.length) return whole;
  const total = sum(top);
  if (total < (o.minChars ?? 1500)) return whole;
  // scripts and styles in the body aren't text: they're left as they are
  const marks = plan(html, top, total * (o.lo ?? 0.25), total * (o.hi ?? 0.4), total, 0, true)?.filter((n) => !RAW.has(n.tag) && n.tag !== "template" && n.tag !== "noscript");
  if (!marks || !marks.length) return whole;
  // a short block right at the cut (a heading, an eyebrow, a rule) stays open, so the faded peek is real text
  for (let k = 0; k < 3 && marks.length > 1 && marks[0].tag !== "section" && marks[0].text < 160; k++) marks.shift();
  const gatedText = sum(marks);
  // too little behind the card to be worth a gate
  if (gatedText < total * 0.15) return whole;
  const peek = marks.find((n) => n.tag !== "#text" && n.text > 0) ?? null;
  // apply from the end so earlier offsets stay valid
  let out = html;
  for (let k = marks.length - 1; k >= 0; k--) {
    const n = marks[k];
    const cls = n === peek ? `${GATED_CLASS} ${PEEK_CLASS}` : GATED_CLASS;
    if (n.tag === "#text") {
      out = `${out.slice(0, n.start)}<span class="${cls}">${out.slice(n.start, n.end)}</span>${out.slice(n.end)}`;
      continue;
    }
    const open = tagEnd(out, n.start);
    out = `${out.slice(0, n.start)}${withClass(out.slice(n.start, open), cls)}${out.slice(open)}`;
  }
  return { html: out, gated: true, open: Math.round(((total - gatedText) / total) * 100) / 100 };
}

/**
 * A lesson whose stages are spread over steps (DSA Mastery: Learn, Try it, Check): the cut is measured over the
 * stages `counts` accepts (Learn's) alone, so a guest reads about 25-40% of the Learn text however much Try it and
 * Check hold, and every stage `counts` rejects is gated once the lesson is gated at all. The rejected stages are
 * set aside while the cut is found (a placeholder comment), then put back with the gated class on their `<section>`.
 * Falls back to gateHtml's own answer when the stages can't be read as balanced HTML.
 */
export function gateStagedHtml(html: string, counts: (stage: { id: string; label: string }) => boolean, o: GateOptions = {}): GateResult {
  const whole: GateResult = { html, gated: false, open: 1 };
  if (!html) return whole;
  const found: { start: number; end: number; open: string }[] = [];
  let kept = 0;
  const re = /<section\b[^>]*\bdata-sd="stage"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const idm = /\bdata-stage-id="([^"]*)"/.exec(m[0]) || /\bid="([^"]*)"/.exec(m[0]);
    const label = /\bdata-label="([^"]*)"/.exec(m[0])?.[1] ?? "";
    const close = matchClose(html, m.index + m[0].length, html.length, "section");
    if (!close) return gateHtml(html, o);
    if (counts({ id: idm?.[1] ?? "", label })) kept++;
    else found.push({ start: m.index, end: close.end, open: m[0] });
    re.lastIndex = close.end;
  }
  if (!found.length || !kept) return gateHtml(html, o);
  // set the rejected stages aside, back to front so the offsets hold
  let masked = html;
  for (let k = found.length - 1; k >= 0; k--) masked = `${masked.slice(0, found[k].start)}<!--hk-set-aside:${k}-->${masked.slice(found[k].end)}`;
  const r = gateHtml(masked, o);
  if (!r.gated) return whole;
  let out = r.html;
  for (let k = found.length - 1; k >= 0; k--) {
    const f = found[k];
    const section = `${withClass(f.open, GATED_CLASS)}${html.slice(f.start + f.open.length, f.end)}`;
    out = out.replace(`<!--hk-set-aside:${k}-->`, () => section);
  }
  return { html: out, gated: true, open: r.open };
}
