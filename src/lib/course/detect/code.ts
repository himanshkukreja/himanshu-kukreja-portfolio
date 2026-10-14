/**
 * Code-block detectors (RendererKit groups B + E): an untagged fence is classified as
 * whiteboard, note card, interview phrases, tree, numbers sheet, compare card, timeline,
 * blueprint (box diagram) or plain text. Tagged fences become highlighted code blocks.
 *
 * Every detector keeps the source text: lines are re-grouped and styled, box borders and
 * tree glyphs may be dropped, but words are never rewritten. Anything that does not match
 * cleanly falls through to the next rule and finally to a plain <pre>.
 */
import type { Code } from "mdast";
import type { Element as HastElement, ElementContent } from "hast";
import { chrome, EMOJI_RE, h, type HChild } from "../md";
import { highlightLines, plainLines } from "../highlight";
import type { LessonKind } from "../types";

export type CodeKind =
  | "whiteboard"
  | "note"
  | "phrases"
  | "tree"
  | "numbers"
  | "compare"
  | "timeline"
  | "blueprint"
  | "plain"
  | "code";

export type CodeCtx = {
  kind: LessonKind;
  /** text of the block right before this fence (narration such as "They write on the whiteboard:") */
  prevText?: string;
  nextFigure: () => number;
  count: (kind: string) => void;
  /** the fence sits inside a Key Phrases callout */
  inPhrases?: boolean;
};

const BOX_CHARS = /[─━│┃┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬╭╮╯╰▶▼◀▲►◄]/g;
const FRAME_TOP = /^\s*[┌╔╭+][─═━-]{3,}.*[┐╗╮+]\s*$/;
const FRAME_BOTTOM = /^\s*[└╚╰+][─═━-]{3,}.*[┘╝╯+]\s*$/;
const HAS_FRAME = /[┌╔╭][─═━]{2,}/;

/* ---------------------------------------------------------------- utils */

function isAllCaps(s: string): boolean {
  const letters = s.replace(/[^A-Za-z]/g, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
}

function stripBox(s: string): string {
  return s.replace(BOX_CHARS, " ").replace(/\s+/g, " ").trim();
}

/** Split text into hast children, wrapping wide emoji in a 2ch span so box columns stay aligned. */
export function preText(s: string): HChild[] {
  const out: HChild[] = [];
  let last = 0;
  EMOJI_RE.lastIndex = 0;
  for (let m = EMOJI_RE.exec(s); m; m = EMOJI_RE.exec(s)) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(h("span", { className: ["sd-emo"] }, [m[0]]));
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  EMOJI_RE.lastIndex = 0;
  return out;
}

/** Wrap ALL-CAPS words (≥3 letters) in <strong> — the kit renders shouting as weight. */
function capsToStrong(s: string): HChild[] {
  const words = s.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  const caps = words.filter((w) => w.length >= 3 && w === w.toUpperCase());
  if (!caps.length || caps.length / Math.max(1, words.length) > 0.5) return preText(s);
  const out: HChild[] = [];
  let last = 0;
  const re = /\b[A-Z][A-Z0-9_'-]{2,}\b/g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push(...preText(s.slice(last, m.index)));
    out.push(h("strong", {}, [m[0]]));
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(...preText(s.slice(last)));
  return out;
}

/** Bold mono numbers inside whiteboard constraints ("50 million", "10,000", "90%"). */
function boldNumbers(s: string): HChild[] {
  const out: HChild[] = [];
  let last = 0;
  const re = /\b\d[\d,.]*\s*(?:%|million|billion|thousand|[KMBG]B?\b|ms\b|seconds?\b|minutes?\b|hours?\b|days?\b|units?\b|users?\b)?/gi;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push(...preText(s.slice(last, m.index)));
    out.push(h("b", { className: ["sd-n"] }, [m[0].trimEnd()]));
    if (m[0] !== m[0].trimEnd()) out.push(m[0].slice(m[0].trimEnd().length));
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(...preText(s.slice(last)));
  return out;
}

function copyButton(label = "Copy"): HastElement {
  return chrome("button", { type: "button", className: ["sd-btn", "sd-copy"], dataSdAction: "copy", ariaLabel: label }, ["Copy"]);
}

function dedent(lines: string[]): string[] {
  const ind = lines.filter((l) => l.trim()).map((l) => (l.match(/^\s*/) || [""])[0].length);
  const min = ind.length ? Math.min(...ind) : 0;
  return lines.map((l) => l.slice(Math.min(min, (l.match(/^\s*/) || [""])[0].length)));
}

function trimBlank(lines: string[]): string[] {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
}

/* ---------------------------------------------------------------- frames */

type Frame = { inner: string[]; double: boolean };

function parseSingleFrame(lines: string[]): Frame | null {
  const ls = trimBlank(lines);
  if (ls.length < 3) return null;
  const top = ls[0];
  const bottom = ls[ls.length - 1];
  if (!FRAME_TOP.test(top) || !FRAME_BOTTOM.test(bottom)) return null;
  const corners = (ls.join("\n").match(/[┌╔╭]/g) || []).length;
  const ascii = top.trim().startsWith("+");
  if (!ascii && corners !== 1) return null;
  const inner: string[] = [];
  for (const raw of ls.slice(1, -1)) {
    const m = raw.match(/^\s*[│║|](.*?)[│║|]?\s*$/);
    if (!m) return null;
    const body = m[1];
    if (/[├┤┼┬┴╠╣╦╩╬▶▼◀▲►◄]/.test(body) || /[─═━]{3,}/.test(body)) return null;
    if (ascii && /\|/.test(body)) return null;
    inner.push(body.replace(/\s+$/, ""));
  }
  return { inner, double: top.includes("╔") || top.includes("═") };
}

/* ------------------------------------------------- note / whiteboard body */

type PanelBlock =
  | { t: "p"; text: string }
  | { t: "list"; ordered: boolean; items: string[] }
  | { t: "label"; text: string }
  | { t: "quote"; text: string; label?: string };

const LIST_MARK = /^(\d+[.)]|[-•*·✓✗✔✘→]|\[[ xX]\])\s+(.*)$/;

function groupsOf(lines: string[]): string[][] {
  const groups: string[][] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (!l.trim()) {
      if (cur.length) groups.push(cur);
      cur = [];
    } else cur.push(l);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function isQuoteStart(s: string) {
  return /^["“]/.test(s.trim());
}
function isQuoteEnd(s: string) {
  return /["”][.)]?$/.test(s.trim());
}

function panelBlocks(lines: string[]): PanelBlock[] {
  const out: PanelBlock[] = [];
  const groups = groupsOf(lines);
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    // a quoted paragraph (may span several groups when the quote contains blank lines)
    if (isQuoteStart(g[0])) {
      const parts = [g.map((l) => l.trim()).join(" ")];
      while (!isQuoteEnd(parts[parts.length - 1]) && gi + 1 < groups.length && !isQuoteStart(groups[gi + 1][0])) {
        gi++;
        parts.push(groups[gi].map((l) => l.trim()).join(" "));
      }
      const prev = out[out.length - 1];
      const label = prev && prev.t === "label" && /:$/.test(prev.text) ? (out.pop() as { text: string }).text : undefined;
      out.push({ t: "quote", text: parts.join(" "), label });
      continue;
    }
    let para: string[] = [];
    let list: { ordered: boolean; items: string[]; indent: number } | null = null;
    const flushPara = () => {
      if (para.length) out.push({ t: "p", text: para.join(" ") });
      para = [];
    };
    const flushList = () => {
      if (list) out.push({ t: "list", ordered: list.ordered, items: list.items });
      list = null;
    };
    if (g.length === 1 && (isAllCaps(g[0]) || (/:$/.test(g[0].trim()) && g[0].trim().length <= 60))) {
      out.push({ t: "label", text: g[0].trim() });
      continue;
    }
    for (const raw of g) {
      const indent = (raw.match(/^\s*/) || [""])[0].length;
      const line = raw.trim();
      const m = line.match(LIST_MARK);
      if (m) {
        flushPara();
        const ordered = /^\d/.test(m[1]);
        const cur = list as { ordered: boolean; items: string[]; indent: number } | null;
        if (!cur || cur.ordered !== ordered) {
          flushList();
          list = { ordered, items: [], indent };
        }
        (list as unknown as { items: string[] }).items.push(ordered ? line : m[2]);
      } else if (list && indent > (list as { indent: number }).indent) {
        const l = list as { items: string[] };
        l.items[l.items.length - 1] += " " + line;
      } else {
        flushList();
        para.push(line);
      }
    }
    flushPara();
    flushList();
  }
  return out;
}

function sayFigure(q: { text: string; label?: string }, count: (k: string) => void): HastElement {
  count("say");
  return h("figure", { className: ["sd-say"], dataSd: "say" }, [
    q.label ? h("p", { className: ["sd-say-label"] }, [q.label]) : null,
    h("blockquote", { className: ["sd-say-q"] }, [h("p", {}, preText(q.text))]),
    chrome("div", { className: ["sd-say-actions"] }, [copyButton("Copy phrase")]),
  ]);
}

function renderPanelBlocks(blocks: PanelBlock[], variant: "note" | "whiteboard", ctx: CodeCtx): HastElement[] {
  const kids: HastElement[] = [];
  let first = true;
  for (const b of blocks) {
    if (b.t === "label") {
      kids.push(h("p", { className: [first ? "sd-panel-eyebrow" : "sd-panel-label"] }, preText(b.text)));
    } else if (b.t === "quote") {
      if (variant === "note" && kids.length <= 1 && b.text.length <= 90 && !b.label) {
        kids.push(h("p", { className: ["sd-panel-title"] }, preText(b.text)));
      } else kids.push(sayFigure(b, ctx.count));
    } else if (b.t === "list") {
      kids.push(
        h(
          b.ordered ? "ol" : "ul",
          { className: ["sd-panel-list"] },
          b.items.map((it) => h("li", {}, variant === "whiteboard" ? boldNumbers(it) : capsToStrong(it))),
        ),
      );
    } else {
      kids.push(h("p", {}, variant === "whiteboard" ? boldNumbers(b.text) : capsToStrong(b.text)));
    }
    first = false;
  }
  return kids;
}

/* --------------------------------------------------------------- detectors */

function detectWhiteboard(lines: string[], ctx: CodeCtx): HastElement | null {
  const frame = parseSingleFrame(lines);
  if (!frame || !frame.double) return null;
  const capstoneLike = ctx.kind === "capstone" || ctx.kind === "bonus" || /whiteboard/i.test(ctx.prevText || "");
  if (!capstoneLike) return null;
  let i0 = 0;
  while (i0 < frame.inner.length && !frame.inner[i0].trim()) i0++;
  if (i0 >= frame.inner.length) return null;
  let j = i0;
  while (j < frame.inner.length && frame.inner[j].trim()) j++;
  const titleLines = frame.inner.slice(i0, j);
  const rest = frame.inner.slice(j);
  const blocks = panelBlocks(rest);
  ctx.count("whiteboard");
  return h("section", { className: ["sd-board"], dataSd: "whiteboard", ariaLabel: "Problem statement" }, [
    chrome("p", { className: ["sd-board-eyebrow"] }, ["On the whiteboard"]),
    h("p", { className: ["sd-board-title"] }, preText(titleLines.map((l) => l.trim()).join(" "))),
    ...renderPanelBlocks(blocks, "whiteboard", ctx),
  ]);
}

function detectNote(lines: string[], ctx: CodeCtx): HastElement | null {
  const frame = parseSingleFrame(lines);
  if (!frame) return null;
  const textChars = frame.inner.join("").replace(/\s/g, "").length;
  if (textChars < 12) return null;
  const blocks = panelBlocks(frame.inner);
  if (!blocks.length) return null;
  ctx.count("note");
  return h("aside", { className: ["sd-note"], dataSd: "note" }, renderPanelBlocks(blocks, "note", ctx));
}

/** Unframed "LABEL:" + "quoted phrase" groups (Key Phrases sections). */
function detectPhrases(lines: string[], ctx: CodeCtx): HastElement | null {
  if (HAS_FRAME.test(lines.join("\n"))) return null;
  const groups = groupsOf(lines);
  if (groups.length < 2) return null;
  let quotes = 0;
  let ok = 0;
  for (const g of groups) {
    if (isQuoteStart(g[0]) || (g.length > 1 && isQuoteEnd(g[g.length - 1]) && quotes > 0)) {
      quotes += isQuoteStart(g[0]) ? 1 : 0;
      ok++;
    } else if (g.length === 1 && /:$/.test(g[0].trim()) && g[0].trim().length <= 70) ok++;
    else if (g.every((l) => LIST_MARK.test(l.trim()) && /["“]/.test(l))) {
      quotes++;
      ok++;
    }
  }
  if (quotes < 1 || ok / groups.length < 0.8 || (!ctx.inPhrases && quotes < 2)) return null;
  const blocks = panelBlocks(lines);
  ctx.count("phrases");
  return h("div", { className: ["sd-phrases"], dataSd: "phrases" }, renderPanelBlocks(blocks, "note", ctx));
}

const TREE_LINE = /^[\s│|]*[├└]──/;

function detectTree(lines: string[], ctx: CodeCtx): HastElement | null {
  const treeLines = lines.filter((l) => TREE_LINE.test(l)).length;
  if (treeLines < 3 || HAS_FRAME.test(lines.join("\n"))) return null;
  const body = trimBlank(lines);
  const capLine = body.find((l) => l.trim() && !TREE_LINE.test(l) && !/^[\s│|]+$/.test(l));
  const caption = body.find((l) => isAllCaps(l) && !TREE_LINE.test(l))?.trim() || capLine?.trim().replace(/:$/, "") || "Tree";
  const n = ctx.nextFigure();
  ctx.count("tree");
  const pre = h(
    "pre",
    { className: ["sd-tree-pre"] },
    body.flatMap((line, i): HChild[] => {
      const m = line.match(/^([\s│|├└─┬┼]*[├└]──\s?|[\s│|]+$)/);
      const parts: HChild[] = [];
      if (i > 0) parts.push("\n");
      if (m) {
        parts.push(h("span", { className: ["sd-tg"] }, [m[0]]));
        const rest = line.slice(m[0].length);
        if (rest) parts.push(h("span", { className: ["sd-tn"] }, preText(rest)));
      } else if (line.trim()) {
        parts.push(h("span", { className: [isAllCaps(line) ? "sd-tcap" : "sd-troot"] }, preText(line)));
      }
      return parts;
    }),
  );
  return h("figure", { className: ["sd-fig", "sd-tree"], dataSd: "tree", ariaLabel: `Figure ${n}: ${caption}` }, [
    chrome("figcaption", { className: ["sd-fig-cap"] }, [h("span", { className: ["sd-fig-tag"] }, [`FIG ${n}`]), ` · ${caption}`]),
    chrome("div", { className: ["sd-toolbar"], role: "toolbar", ariaLabel: "Tree actions" }, [copyButton("Copy tree")]),
    h("div", { className: ["sd-tree-body"] }, [pre]),
  ]);
}

const KV = /^(\s*)(?:[├└│]──\s*|[-•*]\s+)?([A-Za-z(][\w ()'’/.,&+%#-]{0,50}?):\s+(\S.*)$/;
const ARITH = /\d[\d,.]*\s*[KMBGkmb]?\s*[×x*/÷]\s*\(?\d/;
const EQ_LINE = /^(\s*)(?:[├└│]──\s*)?([^:=]*\d[^:=]*?)\s=\s*(\S.*\d.*)$/;

function splitWorking(value: string): { working: string; result: string } {
  const at = value.lastIndexOf("=");
  if (at > 0 && /\d/.test(value.slice(0, at)) && /\d/.test(value.slice(at + 1))) {
    return { working: value.slice(0, at).trim(), result: value.slice(at + 1).trim() };
  }
  return { working: "", result: value.trim() };
}

function detectNumbers(lines: string[], ctx: CodeCtx): HastElement | null {
  if (HAS_FRAME.test(lines.join("\n"))) return null;
  let kvDigit = 0;
  let aligned = 0;
  let arith = 0;
  let eq = 0;
  let other = 0;
  for (const l of lines) {
    if (!l.trim()) continue;
    const m = l.match(KV);
    if (m && /\d/.test(m[3])) {
      kvDigit++;
      if (/:\s{2,}\S/.test(l)) aligned++;
    } else if (EQ_LINE.test(l)) eq++;
    else if (!m) other++;
    if (ARITH.test(l)) arith++;
  }
  const nonEmpty = lines.filter((l) => l.trim()).length;
  const treeLines = lines.filter((l) => TREE_LINE.test(l)).length;
  if (treeLines > nonEmpty / 2) return null;
  const strong = (aligned >= 3 && kvDigit >= 3) || (kvDigit >= 3 && arith + eq >= 1) || (kvDigit >= 2 && arith >= 2) || eq >= 3;
  if (!strong || other > (kvDigit + eq) * 1.5) return null;
  const body = trimBlank(lines);
  const kids: HChild[] = [];
  let title: string | null = null;
  let blankRun = false;
  body.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      if (!blankRun) kids.push(h("div", { className: ["sd-num-gap"], ariaHidden: "true" }));
      blankRun = true;
      return;
    }
    blankRun = false;
    const indent = (line.match(/^[\s│]*/) || [""])[0].length;
    const sub = indent >= 2 || /^\s*[├└│]──/.test(line);
    const kv = line.match(KV);
    if (i === 0 && isAllCaps(line) && !kv) {
      title = line.trim();
      kids.push(h("p", { className: ["sd-num-title"] }, preText(line.trim())));
      return;
    }
    if (kv) {
      const { working, result } = splitWorking(kv[3]);
      const hl = /\b(total|round(?:ed)? up|final|answer|result|required)\b/i.test(kv[2]);
      kids.push(
        h("div", { className: ["sd-num-row", sub ? "sd-num-sub" : "", hl ? "sd-num-hl" : ""].filter(Boolean) }, [
          h("span", { className: ["sd-num-k"] }, preText(kv[2])),
          h("span", { className: ["sd-num-w"] }, preText(working)),
          h("span", { className: ["sd-num-v"] }, preText(result)),
        ]),
      );
      return;
    }
    const eqm = line.match(EQ_LINE);
    if (eqm) {
      kids.push(
        h("div", { className: ["sd-num-row", "sd-num-eq", sub ? "sd-num-sub" : ""].filter(Boolean) }, [
          h("span", { className: ["sd-num-k"] }),
          h("span", { className: ["sd-num-w"] }, preText(eqm[2].replace(/^[├└│─\s]+/, "").trim())),
          h("span", { className: ["sd-num-v"] }, preText(eqm[3].trim())),
        ]),
      );
      return;
    }
    const head = line.trim().match(/^([^:]{2,60}):$/);
    if (head) kids.push(h("p", { className: ["sd-num-head"] }, preText(line.trim())));
    else kids.push(h("p", { className: ["sd-num-note", sub ? "sd-num-sub" : ""].filter(Boolean) }, preText(line.replace(/^[\s│├└─]+/, ""))));
  });
  ctx.count("numbers");
  return h("figure", { className: ["sd-numbers"], dataSd: "numbers", ariaLabel: title ? `Numbers: ${title}` : "Numbers sheet" }, [
    chrome("figcaption", { className: ["sd-fig-cap"] }, [h("span", { className: ["sd-fig-tag"] }, ["NUMBERS"]), " · label · working · result"]),
    h("div", { className: ["sd-num-grid"] }, kids),
  ]);
}

const BAD = /^\s*(?:[-*•]\s*)?(?:(?:❌|✗|✘)|(?:WRONG|BAD|BEFORE|INCORRECT|DON'?T|AVOID|ANTI-?PATTERN)\b[^:\n]{0,40}:)/;
const GOOD = /^\s*(?:[-*•]\s*)?(?:(?:✅|✓|✔)|(?:RIGHT|CORRECT|GOOD|AFTER|BETTER|DO|FIX|SOLUTION)\b[^:\n]{0,40}:)/;
const NEUTRAL = /^\s*([A-Z][A-Z0-9 '’()-]{2,30}):\s*(.*)$/;

type CmpItem = { label: string; body: string[] };
type CmpSection = { pol: "bad" | "good" | "neutral"; items: CmpItem[] };

function detectCompare(lines: string[], ctx: CodeCtx): HastElement | null {
  if (HAS_FRAME.test(lines.join("\n"))) return null;
  const hasBad = lines.some((l) => BAD.test(l));
  const hasGood = lines.some((l) => GOOD.test(l));
  if (!hasBad || !hasGood) return null;
  const body = trimBlank(lines);
  const head: string[] = [];
  const sections: CmpSection[] = [];
  for (const raw of body) {
    const line = raw.replace(/\s+$/, "");
    const pol = BAD.test(line) ? "bad" : GOOD.test(line) ? "good" : NEUTRAL.test(line) && !/^\s/.test(line) ? "neutral" : null;
    const cur = sections[sections.length - 1];
    if (pol) {
      const lastItem = cur?.items[cur.items.length - 1];
      if (cur && cur.pol === pol && lastItem && !lastItem.body.some((b) => b.trim())) cur.items.push({ label: line.trim(), body: [] });
      else sections.push({ pol, items: [{ label: line.trim(), body: [] }] });
    } else if (cur) cur.items[cur.items.length - 1].body.push(line);
    else head.push(line);
  }
  const bad = sections.filter((s) => s.pol === "bad").length;
  const good = sections.filter((s) => s.pol === "good").length;
  if (!bad || !good) return null;
  ctx.count("compare");
  const glyph = { bad: "✗", good: "✓", neutral: "◆" } as const;
  const panes = sections.map((s) =>
    h("div", { className: ["sd-cmp-pane"], dataPol: s.pol }, [
      chrome("span", { className: ["sd-cmp-glyph"], ariaHidden: "true" }, [glyph[s.pol]]),
      ...s.items.flatMap((it) => {
        const b = trimBlank(dedent(it.body));
        return [
          h("p", { className: ["sd-cmp-label"] }, preText(it.label)),
          b.length ? h("pre", { className: ["sd-cmp-body"] }, preText(b.join("\n"))) : null,
        ].filter(Boolean) as HastElement[];
      }),
    ]),
  );
  const headText = trimBlank(head).map((l) => l.replace(/\s+$/, ""));
  // bad…bad good…good (neutral after) → two columns, reading order kept
  const order = sections.map((s) => s.pol).join(",");
  const columns = /^(bad,)*bad,(good,)*good(,neutral)*$/.test(order);
  let grid: HastElement;
  if (columns) {
    const col = (pol: "bad" | "good") =>
      h("div", { className: ["sd-cmp-col"] }, panes.filter((_, k) => sections[k].pol === pol));
    grid = h("div", { className: ["sd-cmp-grid"], dataPanes: "2" }, [col("bad"), col("good"), ...panes.filter((_, k) => sections[k].pol === "neutral")]);
  } else grid = h("div", { className: ["sd-cmp-grid"], dataPanes: String(panes.length) }, panes);
  return h("figure", { className: ["sd-compare"], dataSd: "compare" }, [
    headText.length
      ? h("figcaption", { className: ["sd-cmp-head"] }, preText(dedent(headText).join("\n")))
      : chrome("figcaption", { className: ["sd-cmp-head", "sd-cmp-head-chrome"] }, ["Compare"]),
    grid,
  ]);
}

const TIME_RE =
  /^\s*(T\s*[=+]\s*[\d.:]+\s*(?:ms|s|sec|secs|seconds?|min|mins|minutes?|h|hr|hours?)?|\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:\s*(?:AM|PM|am|pm))?|\d+(?:\.\d+)?\s*(?:ms|s|sec|secs|seconds?|min|mins|minutes?|h|hr|hrs|hours?)\b)\s*(?:[:|–—-]\s*|\s{2,})(\S.*)$/;

function detectTimeline(lines: string[], ctx: CodeCtx): HastElement | null {
  if (HAS_FRAME.test(lines.join("\n"))) return null;
  const body = trimBlank(lines);
  const events = body.filter((l) => TIME_RE.test(l)).length;
  const titled = /^\s*timeline:?\s*$/i.test(body[0] || "");
  if (events < 3 && !(titled && events >= 2)) return null;
  if (events < body.filter((l) => l.trim()).length * 0.4) return null;
  // column layouts ("0:00  Healthy   Call bank   Fail") are text tables, not timelines
  const evLines = body.filter((l) => TIME_RE.test(l));
  const columnar = evLines.filter((l) => /\S\s{2,}\S/.test((l.match(TIME_RE) || [])[2] || "")).length;
  if (columnar >= evLines.length * 0.5 || body.some((l) => /^[\s─━-]{12,}$/.test(l) && /[─━-]{12,}/.test(l))) return null;
  type Ev = { t: string; e: string[] } | { note: string[] };
  const head: string[] = [];
  const items: Ev[] = [];
  let lastIndent = 0;
  for (const raw of body) {
    const line = raw.replace(/\s+$/, "");
    const m = line.match(TIME_RE);
    if (m) {
      items.push({ t: m[1].trim(), e: [m[2]] });
      lastIndent = (line.match(/^\s*/) || [""])[0].length;
      continue;
    }
    const prev = items[items.length - 1];
    const indent = (line.match(/^\s*/) || [""])[0].length;
    if (!items.length) head.push(line);
    else if (prev && "t" in prev && line.trim() && indent > lastIndent) prev.e.push(line.trim());
    else if (prev && "note" in prev) prev.note.push(line);
    else items.push({ note: [line] });
  }
  // trailing notes become a footer
  const foot: string[] = [];
  while (items.length && "note" in items[items.length - 1]) foot.unshift(...(items.pop() as { note: string[] }).note);
  const evs = items.filter((x): x is { t: string; e: string[] } => "t" in x);
  const lastEv = evs[evs.length - 1];
  const badLast = !!lastEv && /!|duplicate|lost|fail|crash|corrupt|overload|oversold|double/i.test(lastEv.e.join(" "));
  ctx.count("timeline");
  return h("figure", { className: ["sd-timeline"], dataSd: "timeline" }, [
    trimBlank(head).length
      ? h("figcaption", { className: ["sd-tl-title"] }, preText(trimBlank(head).map((l) => l.trim()).join(" ")))
      : chrome("figcaption", { className: ["sd-tl-title", "sd-tl-title-chrome"] }, ["Timeline"]),
    h(
      "ol",
      { className: ["sd-tl-list"] },
      items.map((it) =>
        "t" in it
          ? h("li", { className: ["sd-tl-ev", it === lastEv && badLast ? "sd-tl-bad" : ""].filter(Boolean) }, [
              h("span", { className: ["sd-tl-t"] }, [it.t]),
              h("span", { className: ["sd-tl-e"] }, preText(it.e.join("\n"))),
            ])
          : h("li", { className: ["sd-tl-note"] }, preText(trimBlank(it.note).join("\n").trim())),
      ),
    ),
    foot.some((l) => l.trim()) ? h("p", { className: ["sd-tl-foot"] }, preText(trimBlank(foot).map((l) => l.trim()).join("\n"))) : null,
  ]);
}

function boxRatio(s: string): { ratio: number; count: number } {
  const count = (s.match(BOX_CHARS) || []).length;
  const nonSpace = s.replace(/\s/g, "").length || 1;
  return { ratio: count / nonSpace, count };
}

function detectBlueprint(lines: string[], ctx: CodeCtx): HastElement | null {
  const src = lines.join("\n");
  const { ratio, count } = boxRatio(src);
  const framed = HAS_FRAME.test(src) || /^\s*\+[-=]{8,}\+?/m.test(src);
  if (!(ratio > 0.04 && count >= 6) && !(framed && ratio > 0.02)) return null;
  const body = trimBlank(lines);
  // legend: "WORD: text" lines after the last closing corner
  let lastClose = -1;
  body.forEach((l, i) => {
    if (/[└╚╰┘╝╯]/.test(l)) lastClose = i;
  });
  let diagram = body;
  const legend: { term: string; desc: string[] }[] = [];
  if (lastClose >= 0 && lastClose < body.length - 1) {
    const after = body.slice(lastClose + 1);
    let ok = true;
    for (const l of after) {
      if (!l.trim()) continue;
      const m = l.match(/^([A-Z][A-Z0-9_ -]{1,24}):\s+(.+)$/);
      if (m) legend.push({ term: m[1], desc: [m[2].trim()] });
      else if (legend.length && /^\s+\S/.test(l)) legend[legend.length - 1].desc.push(l.trim());
      else {
        ok = false;
        break;
      }
    }
    if (ok && legend.length) diagram = trimBlank(body.slice(0, lastClose + 1));
    else legend.length = 0;
  }
  const texts = diagram.map(stripBox).filter((t) => /[A-Za-z]{2,}/.test(t));
  let caption = texts.find((t) => isAllCaps(t) && t.length <= 64) || texts.find((t) => t.length <= 64) || "Diagram";
  caption = caption.replace(/:$/, "");
  const cols = Math.max(...diagram.map((l) => [...l].length));
  const rows = diagram.length;
  const n = ctx.nextFigure();
  ctx.count("blueprint");
  return h(
    "figure",
    { className: ["sd-fig", "sd-blueprint"], dataSd: "blueprint", dataCols: String(cols), dataRows: String(rows), ariaLabel: `Figure ${n}: ${caption}` },
    [
      chrome("figcaption", { className: ["sd-fig-cap"] }, [
        h("span", { className: ["sd-fig-tag"] }, [`FIG ${n}`]),
        h("span", { className: ["sd-fig-title"] }, [` · ${caption}`]),
        h("span", { className: ["sd-fig-dim"] }, [`${cols}×${rows}`]),
      ]),
      chrome("div", { className: ["sd-toolbar"], role: "toolbar", ariaLabel: "Diagram view" }, [
        h("button", { type: "button", className: ["sd-btn", "sd-seg"], dataSdAction: "fit", ariaPressed: "true" }, ["Fit"]),
        h("button", { type: "button", className: ["sd-btn", "sd-seg"], dataSdAction: "native", ariaPressed: "false" }, ["1:1"]),
        h("span", { className: ["sd-fit-note"] }),
        h("button", { type: "button", className: ["sd-btn"], dataSdAction: "fullscreen" }, ["Fullscreen"]),
        copyButton("Copy diagram"),
      ]),
      h("div", { className: ["sd-bp-body"] }, [h("pre", { className: ["sd-bp-pre"] }, preText(diagram.join("\n")))]),
      legend.length
        ? h(
            "dl",
            { className: ["sd-legend"] },
            legend.flatMap((l) => [h("dt", {}, [l.term]), h("dd", {}, preText(l.desc.join(" ")))]),
          )
        : null,
    ],
  );
}

/* ------------------------------------------------------------- code block */

/** Plain lines (untagged fences): emoji wrapped so ASCII columns stay aligned. */
function plainPreLines(value: string): ElementContent[] {
  if (!EMOJI_RE.test(value)) {
    EMOJI_RE.lastIndex = 0;
    return plainLines(value);
  }
  EMOJI_RE.lastIndex = 0;
  const out: ElementContent[] = [];
  value.split("\n").forEach((line, i) => {
    if (i > 0) out.push({ type: "text", value: "\n" });
    out.push(h("span", { className: ["line"] }, preText(line)));
  });
  return out;
}

function codeTitle(value: string): string | null {
  const m = value.match(/^\s*(?:export\s+)?(?:async\s+)?(?:class|def|function|func|interface|type|struct)\s+([A-Za-z_]\w*)/m);
  return m ? m[1] : null;
}

export async function codeFigure(value: string, lang: string | null, ctx: CodeCtx, plain = false): Promise<HastElement> {
  const lines = value.split("\n");
  const total = lines.length;
  const children: ElementContent[] = plain ? plainPreLines(value) : await highlightLines(value, lang);
  const collapsible = total > 40;
  const title = plain ? null : codeTitle(value);
  const langLabel = plain ? "text" : (lang || "code").toLowerCase();
  ctx.count(plain ? "plain" : "code");
  return h(
    "figure",
    {
      className: ["sd-code", plain ? "sd-code-plain" : ""].filter(Boolean),
      dataSd: "code",
      dataLang: langLabel,
      dataLines: String(total),
      dataCollapsible: collapsible ? "true" : undefined,
      dataCollapsed: collapsible ? "true" : undefined,
    },
    [
      chrome("div", { className: ["sd-code-head"] }, [
        h("span", { className: ["sd-code-lang"] }, [langLabel]),
        h("span", { className: ["sd-code-meta"] }, [`${title ? `${title} · ` : ""}${total} ${total === 1 ? "line" : "lines"}`]),
        copyButton("Copy code"),
      ]),
      h("pre", { className: ["sd-code-pre", plain ? "" : "shiki"].filter(Boolean), tabIndex: 0 }, [h("code", {}, children)]),
      collapsible
        ? chrome("button", { type: "button", className: ["sd-code-more"], dataSdAction: "expand", ariaExpanded: "false" }, [
            `Show all ${total} lines ↓ (${total - 20} hidden)`,
          ])
        : null,
    ],
  );
}

/**
 * ```mermaid → themed diagram. The source stays in the DOM as text (so highlight offsets are stable
 * and the no-JS view still shows it); <MermaidHydrator/> renders the SVG into the chrome canvas.
 * An optional first-line comment `%% title: …` becomes the caption.
 */
export function mermaidFigure(value: string, ctx: CodeCtx): HastElement {
  ctx.count("mermaid");
  const title = value.match(/^\s*%%\s*title:\s*(.+)$/m)?.[1]?.trim();
  const kind = (value.split("\n").find((l) => l.trim() && !l.trim().startsWith("%%")) || "").trim().split(/\s/)[0];
  return h("figure", { className: ["sd-mermaid"], dataSd: "mermaid", dataKind: kind || "diagram" }, [
    chrome("div", { className: ["sd-mermaid-head"] }, [
      h("span", { className: ["sd-mermaid-label"] }, ["Diagram"]),
      title ? h("span", { className: ["sd-mermaid-title"] }, [title]) : null,
      h("span", { className: ["sd-mermaid-tools"] }, [
        h("button", { type: "button", className: ["sd-mermaid-btn"], dataMermaidAction: "zoom", ariaPressed: "false" }, ["1:1"]),
        h("button", { type: "button", className: ["sd-mermaid-btn"], dataMermaidAction: "full" }, ["Fullscreen"]),
        h("button", { type: "button", className: ["sd-mermaid-btn"], dataMermaidAction: "copy" }, ["Copy source"]),
      ]),
    ]),
    h("pre", { className: ["sd-mermaid-src"] }, [value]),
    chrome("div", { className: ["sd-mermaid-canvas"], role: "img", ariaLabel: title ? `Diagram: ${title}` : "Diagram" }, []),
  ]);
}

/** Classify + render one fenced block. */
export async function renderCode(node: Code, ctx: CodeCtx): Promise<HastElement> {
  const value = node.value.replace(/\t/g, "    ");
  if (node.lang && node.lang.toLowerCase() === "mermaid") return mermaidFigure(node.value, ctx);
  if (node.lang) return codeFigure(value, node.lang, ctx);
  const lines = value.split("\n");
  const detectors = [detectWhiteboard, detectNote, detectPhrases, detectNumbers, detectTree, detectCompare, detectTimeline, detectBlueprint];
  for (const d of detectors) {
    try {
      const out = d(lines, ctx);
      if (out) return out;
    } catch {
      /* a detector must never lose the block: fall through */
    }
  }
  return codeFigure(value, null, ctx, true);
}
