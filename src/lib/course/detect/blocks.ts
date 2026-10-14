/**
 * Sibling-sequence detectors (RendererKit groups A, C, D, F): headings with stable ids,
 * reveal cards, practice problems, heading callouts, transcripts, insights, pull quotes,
 * pros/cons, eyebrow labels, resources, up-next, <details> hints and stray <hr>.
 *
 * Input and output are lists of mdast siblings; detected components become `sdEl` nodes
 * that wrap the original mdast (so inline formatting and text survive untouched).
 */
import type { Blockquote, Code, Heading, List, ListItem, Paragraph, PhrasingContent, RootContent, Strong, Text } from "mdast";
import type { Properties } from "hast";
import type { LessonKind, TocItem, TocKind } from "../types";
import { chrome, el, h, isNode, rawHast, stripEmoji, text, toText, type AnyNode, type SdEl } from "../md";
import { IdRegistry, slugify } from "../slug";
import { renderCode } from "./code";

export type BlockCtx = {
  kind: LessonKind;
  ids: IdRegistry;
  toc: TocItem[];
  stats: Record<string, number>;
  stageId: string;
  /** heading ids by markdown depth, for collision scoping */
  hstack: string[];
  figure: number;
  /** "End of Day" + "Tomorrow" pairs that are earlier duplicates (dropped) */
  dropParas: Set<Paragraph>;
  /** the last End-of-Day paragraph (becomes the up-next marker) */
  lastEnd: Paragraph | null;
};

type Opts = { inPhrases?: boolean };

export function count(ctx: BlockCtx, k: string, n = 1) {
  ctx.stats[k] = (ctx.stats[k] || 0) + n;
}

/* ------------------------------------------------------------------ helpers */

function firstStrong(p: Paragraph): { strong: Strong; label: string; after: PhrasingContent[] } | null {
  const [a, ...rest] = p.children;
  if (!a || a.type !== "strong") return null;
  return { strong: a, label: toText(a).trim(), after: rest };
}

/** "**Label:**" or "**Label**:" with optional trailing text. */
function labelOf(p: Paragraph): { label: string; hasText: boolean } | null {
  const fs = firstStrong(p);
  if (!fs) return null;
  const restText = fs.after.map(toText).join("");
  const colonInside = /:\s*$/.test(fs.label);
  const colonAfter = /^\s*:/.test(restText);
  if (!colonInside && !colonAfter && restText.trim()) return null;
  const label = fs.label.replace(/:\s*$/, "").trim();
  const remaining = restText.replace(/^\s*:/, "").trim();
  return { label, hasText: remaining.length > 0 };
}

/**
 * Children of a "**Label**: text" paragraph for block-label layouts: the colon that follows
 * (or ends) the label is dropped so the label can sit on its own line.
 */
function labelChildren(p: Paragraph): AnyNode[] {
  const fs = firstStrong(p);
  if (!fs) return p.children as AnyNode[];
  const strongKids = [...fs.strong.children];
  const lastKid = strongKids[strongKids.length - 1];
  if (lastKid && lastKid.type === "text" && /:\s*$/.test(lastKid.value)) {
    strongKids[strongKids.length - 1] = { ...lastKid, value: lastKid.value.replace(/:\s*$/, "") };
  }
  const rest = [...fs.after];
  if (rest[0] && rest[0].type === "text") rest[0] = { ...rest[0], value: rest[0].value.replace(/^\s*:\s*/, "") };
  return [{ ...fs.strong, children: strongKids } as Strong, text(" "), ...rest] as AnyNode[];
}

function isEmphasisOnly(p: Paragraph): boolean {
  const kids = p.children.filter((c) => !(c.type === "text" && !c.value.trim()));
  return kids.length === 1 && kids[0].type === "emphasis";
}

function headingText(n: Heading): string {
  return stripEmoji(toText(n)).trim();
}

/** Strip emoji from text nodes inside a phrasing tree (headings). */
function stripInlineEmoji(children: PhrasingContent[]): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  children.forEach((c, i) => {
    if (c.type === "text") {
      let v = stripEmoji(c.value);
      if (c.value.match(/\s$/) && i < children.length - 1) v += " ";
      if (c.value.match(/^\s/) && i > 0) v = " " + v;
      if (v) out.push({ ...c, value: v });
    } else if ("children" in c && Array.isArray(c.children)) {
      out.push({ ...c, children: stripInlineEmoji(c.children as PhrasingContent[]) } as PhrasingContent);
    } else out.push(c);
  });
  return out;
}

function anchor(id: string, label: string) {
  return rawHast(chrome("a", { className: ["sd-anchor"], href: `#${id}`, ariaLabel: `Link to ${label}` }, ["#"]));
}

/* ------------------------------------------------------------------ headings */

const CHAPTER_RE = /^Chapter\s+(\d+)\s*[:.–—-]\s*(.*)$/i;
const NUMBERED_RE = /^(\d+(?:\.\d+)+)\.?\s+(.*)$/;
const QUESTION_RE = /^Question\s+(\d+)\s*[:.]\s*(.*)$/i;
const PREVIEW_CH_RE = /^(Concept|Day)\s+(\d+)\s*[:.–—-]\s*(.*)$/i;

function headingId(clean: string): { base: string; kind: TocKind } {
  let m = clean.match(CHAPTER_RE);
  if (m) return { base: `ch-${m[1]}-${slugify(m[2], 48)}`.replace(/-$/, ""), kind: "chapter" };
  m = clean.match(NUMBERED_RE);
  if (m) return { base: `s-${m[1].replace(/\./g, "-")}-${slugify(m[2], 48)}`.replace(/-$/, ""), kind: "section" };
  m = clean.match(QUESTION_RE);
  if (m) return { base: `q-${m[1]}-${slugify(m[2], 40)}`.replace(/-$/, ""), kind: "question" };
  m = clean.match(PREVIEW_CH_RE);
  if (m) return { base: `${m[1].toLowerCase()}-${m[2]}-${slugify(m[3], 48)}`.replace(/-$/, ""), kind: "chapter" };
  return { base: slugify(clean) || "section", kind: "other" };
}

export function headingEl(n: Heading, ctx: BlockCtx, extraClass: string[] = []): SdEl {
  const depth = n.depth;
  const clean = headingText(n);
  const { base, kind: baseKind } = headingId(clean);
  const scopes = [ctx.stageId, ...ctx.hstack.slice(1, depth).reverse()].filter(Boolean);
  const id = ctx.ids.claim(base, scopes);
  ctx.hstack[depth] = id;
  ctx.hstack.length = depth + 1;

  let kind: TocKind = baseKind;
  if (kind === "other" && depth === 2 && ctx.kind !== "day-content") kind = "section";
  if (depth <= 3 || kind === "question") {
    ctx.toc.push({ id, text: clean, level: Math.min(4, depth) as 1 | 2 | 3 | 4, kind, stageId: ctx.stageId });
  }

  let inline = stripInlineEmoji(n.children);
  const classes = ["sd-h", `sd-h${depth}`, ...extraClass];
  const first = inline[0];
  const prefix: AnyNode[] = [];
  if (first && first.type === "text") {
    const ch = first.value.match(/^(Chapter\s+(\d+)\s*[:.–—-])\s*/i);
    const num = first.value.match(/^(\d+(?:\.\d+)+\.?)(\s+)/);
    if (ch) {
      classes.push("sd-chapter");
      prefix.push(rawHast(chrome("span", { className: ["sd-ch-box"], ariaHidden: "true" }, [ch[2].padStart(2, "0")])));
      prefix.push(el("span", { className: ["sd-ch-label"] }, [text(ch[1])]));
      prefix.push(text(" "));
      inline = [{ ...first, value: first.value.slice(ch[0].length) }, ...inline.slice(1)];
      inline = [el("span", { className: ["sd-ch-title"] }, inline) as unknown as PhrasingContent];
    } else if (num) {
      classes.push("sd-numbered");
      prefix.push(el("span", { className: ["sd-hnum"] }, [text(num[1])]));
      prefix.push(text(num[2]));
      inline = [{ ...first, value: first.value.slice(num[0].length) }, ...inline.slice(1)];
    }
  }
  const tag = `h${Math.min(6, depth + 1)}`;
  return el(tag, { id, className: classes }, [...prefix, ...(inline as AnyNode[]), anchor(id, clean)], { heading: depth });
}

/* ------------------------------------------------------------------ details */

function detailsSummary(html: string): string | null {
  const m = html.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
}

async function tryDetails(nodes: AnyNode[], i: number, ctx: BlockCtx, opts: Opts): Promise<{ node: AnyNode; end: number } | null> {
  const open = nodes[i];
  if (!isNode(open, "html") || !/^\s*<details/i.test(open.value)) return null;
  let summary = detailsSummary(open.value);
  let start = i + 1;
  if (!summary && isNode(nodes[i + 1], "html")) {
    summary = detailsSummary((nodes[i + 1] as { value: string }).value);
    if (summary) start = i + 2;
  }
  const label = summary || "Details";
  // inline <details>…</details> inside one html node
  if (/<\/details>/i.test(open.value)) {
    const inner = open.value.replace(/^[\s\S]*?<\/summary>/i, "").replace(/<\/details>[\s\S]*$/i, "").replace(/<[^>]+>/g, "").trim();
    count(ctx, "details");
    return {
      node: el("details", { className: ["sd-details"], dataSd: /hint/i.test(label) ? "hints" : "details" }, [
        el("summary", { className: ["sd-details-sum"] }, [text(label)]),
        ...(inner ? [{ type: "paragraph", children: [text(inner)] } as Paragraph] : []),
      ]),
      end: i,
    };
  }
  let j = start;
  while (j < nodes.length && !(isNode(nodes[j], "html") && /<\/details>/i.test((nodes[j] as { value: string }).value))) j++;
  if (j >= nodes.length) return null;
  const inner = await processBlocks(nodes.slice(start, j), ctx, opts);
  const variant = /hint/i.test(label) ? "hints" : /solution|answer/i.test(label) ? "solution" : "details";
  count(ctx, variant === "details" ? "details" : variant);
  return {
    node: el("details", { className: ["sd-details"], dataSd: variant }, [el("summary", { className: ["sd-details-sum"] }, [text(label)]), el("div", { className: ["sd-details-body"] }, inner)], {
      component: variant,
    }),
    end: j,
  };
}

/* ------------------------------------------------------------------ reveal */

const ANSWER_RE = /^(?:strong|model|sample|good|ideal|example)?\s*answer\b/i;

async function tryReveal(nodes: AnyNode[], i: number, ctx: BlockCtx, opts: Opts): Promise<{ node: AnyNode; end: number } | null> {
  const hd = nodes[i] as Heading;
  const clean = headingText(hd);
  const qm = clean.match(QUESTION_RE);
  if (!qm || hd.depth < 2 || hd.depth > 4) return null;
  let end = i + 1;
  while (end < nodes.length && !isNode(nodes[end], "heading") && !isNode(nodes[end], "thematicBreak")) end++;
  const body = nodes.slice(i + 1, end);
  const ansIdx = body.findIndex((n) => isNode(n, "paragraph") && ANSWER_RE.test(firstStrong(n)?.label || ""));
  if (ansIdx < 0) return null;
  const intentIdx = body.findIndex((n, k) => k < ansIdx && isNode(n, "paragraph") && /intent/i.test(firstStrong(n)?.label || ""));
  const heading = headingEl(hd, ctx, ["sd-rv-q"]);
  const qid = (heading.props.id as string) || `q-${qm[1]}`;
  const pre = body.slice(0, ansIdx).filter((_, k) => k !== intentIdx);
  const intent = intentIdx >= 0 ? (body[intentIdx] as Paragraph) : null;
  const answer = await processBlocks(body.slice(ansIdx), ctx, opts);
  const preOut = await processBlocks(pre, ctx, opts);
  count(ctx, "reveal");
  const kids: AnyNode[] = [
    rawHast(
      chrome("div", { className: ["sd-rv-head"] }, [
        h("span", { className: ["sd-rv-kicker"] }, [`Interview question ${qm[1]}`]),
        h("span", { className: ["sd-rv-status"], ariaLive: "polite" }, ["not answered"]),
      ]),
    ),
    heading,
  ];
  if (intent) kids.push(el("p", { className: ["sd-rv-intent"] }, intent.children));
  kids.push(...preOut);
  kids.push(
    rawHast(
      chrome("div", { className: ["sd-rv-gate"] }, [
        h("span", { className: ["sd-rv-hint"] }, ["Answer it out loud first. Then compare."]),
        h("button", { type: "button", className: ["sd-btn", "sd-btn-solid"], dataSdAction: "reveal", ariaExpanded: "false" }, ["Reveal strong answer"]),
      ]),
    ),
  );
  kids.push(el("div", { className: ["sd-rv-answer"], dataSdAnswer: "" }, answer));
  kids.push(
    rawHast(
      chrome("div", { className: ["sd-rv-verdict"], role: "group", ariaLabel: "How did you do?" }, [
        h("button", { type: "button", className: ["sd-btn"], dataSdAction: "knew", ariaPressed: "false" }, ["✓ Knew it"]),
        h("button", { type: "button", className: ["sd-btn"], dataSdAction: "review", ariaPressed: "false" }, ["↻ Review again"]),
        h("button", { type: "button", className: ["sd-btn", "sd-btn-quiet"], dataSdAction: "hide" }, ["Hide answer"]),
      ]),
    ),
  );
  return {
    node: el("section", { className: ["sd-reveal"], dataSd: "reveal", dataQid: qid, dataQn: qm[1], dataQuestion: qm[2].replace(/^["“]|["”]$/g, "").slice(0, 200) }, kids, {
      component: "reveal",
    }),
    end: end - 1,
  };
}

/* ------------------------------------------------------------------ problem */

const PROBLEM_RE = /^(?:Practice\s+)?Problem\s+(\d+)\s*[:.–—-]\s*(.+)$/i;

async function tryProblem(nodes: AnyNode[], i: number, ctx: BlockCtx, opts: Opts): Promise<{ node: AnyNode; end: number } | null> {
  const hd = nodes[i] as Heading;
  const m = headingText(hd).match(PROBLEM_RE);
  if (!m || hd.depth < 2) return null;
  let end = i + 1;
  while (end < nodes.length) {
    const n = nodes[end];
    if (isNode(n, "heading") && n.depth <= hd.depth) break;
    if (isNode(n, "thematicBreak")) break;
    end++;
  }
  if (end === i + 1) return null;
  const heading = headingEl(hd, ctx, ["sd-pb-title"]);
  const body = await processBlocks(nodes.slice(i + 1, end), ctx, opts);
  count(ctx, "problem");
  return {
    node: el(
      "section",
      { className: ["sd-problem"], dataSd: "problem" },
      [rawHast(chrome("p", { className: ["sd-pb-eyebrow"] }, [`Practice · problem ${m[1]}`])), heading, ...body],
      { component: "problem" },
    ),
    end: end - 1,
  };
}

/* ------------------------------------------------------------------ callouts */

const CALLOUTS: { re: RegExp; variant: string; chip: string }[] = [
  { re: /\bInterview Tips?\b/i, variant: "tip", chip: "▲ Interview tip" },
  { re: /\b(Common (Mistakes?|Pitfalls?)|Pitfalls?\b|Anti-?patterns?\b)/i, variant: "pitfall", chip: "✗ Pitfall" },
  { re: /\bKey Takeaways?\b/i, variant: "takeaway", chip: "◆ Key takeaways" },
  { re: /\b(Key Phrases|Phrases to Use|Say This)\b/i, variant: "say", chip: "❯ Say this" },
];

async function tryCallout(nodes: AnyNode[], i: number, ctx: BlockCtx, opts: Opts): Promise<{ node: AnyNode; end: number } | null> {
  const hd = nodes[i] as Heading;
  const clean = headingText(hd);
  if (hd.depth < 2 || CHAPTER_RE.test(clean)) return null;
  const c = CALLOUTS.find((x) => x.re.test(clean));
  if (!c) return null;
  let end = i + 1;
  while (end < nodes.length && !isNode(nodes[end], "heading") && !isNode(nodes[end], "thematicBreak")) end++;
  if (end === i + 1) return null;
  const heading = headingEl(hd, ctx, ["sd-callout-title"]);
  const body = await processBlocks(nodes.slice(i + 1, end), ctx, { ...opts, inPhrases: c.variant === "say" || opts.inPhrases });
  count(ctx, "callout");
  return {
    node: el(
      "section",
      { className: ["sd-callout"], dataSd: "callout", dataVariant: c.variant },
      [rawHast(chrome("span", { className: ["sd-callout-chip"] }, [c.chip])), heading, ...body],
      { component: "callout" },
    ),
    end: end - 1,
  };
}

/* ------------------------------------------------------------------ resources */

const RESOURCES_RE = /^(Further Reading|Sources|References|Recommended (Resources|Reading)|Resources( for This Week)?|Reading List|.*Reading List)\b/i;

function resourceType(s: string): string {
  if (/\bby\b|\bbook\b|O'Reilly|edition/i.test(s)) return "Book";
  if (/wiki/i.test(s)) return "Wiki";
  if (/paper|arxiv|\bpdf\b|whitepaper|SOSP|OSDI|VLDB|\bACM\b/i.test(s)) return "Paper";
  if (/video|talk|youtube|conference|keynote|course/i.test(s)) return "Talk";
  if (/blog|article|post|engineering/i.test(s)) return "Blog";
  if (/doc|documentation|guide|reference|center|spec|RFC|manual|api/i.test(s)) return "Docs";
  return "Read";
}

function resourcesList(list: List, ctx: BlockCtx): SdEl {
  count(ctx, "resources");
  return el(
    "ul",
    { className: ["sd-resources"], dataSd: "resources" },
    list.children.map((li: ListItem) => {
      const t = toText(li);
      const type = resourceType(t);
      const hasLink = JSON.stringify(li).includes('"type":"link"');
      return el("li", { className: ["sd-res"], dataType: type.toLowerCase(), dataLinked: hasLink ? "true" : undefined }, [
        rawHast(chrome("span", { className: ["sd-res-type"] }, [type])),
        ...(li.children as AnyNode[]),
      ]);
    }),
    { component: "resources" },
  );
}

/* ------------------------------------------------------------------ transcript */

type Speaker = { who: "you" | "interviewer"; label: string; rest: PhrasingContent[] };

function speakerOf(n: AnyNode | undefined): Speaker | null {
  if (!isNode(n, "paragraph")) return null;
  const fs = firstStrong(n);
  if (!fs) return null;
  const m = fs.label.match(/^(Interviewer|You|Candidate|Me)\s*(:?)\s*$/i);
  if (!m) return null;
  const rest = [...fs.after];
  const t0 = rest[0];
  if (!m[2]) {
    if (!t0 || t0.type !== "text" || !/^\s*:/.test(t0.value)) return null;
    rest[0] = { ...(t0 as Text), value: (t0 as Text).value.replace(/^\s*:\s*/, "") };
  } else if (t0 && t0.type === "text") rest[0] = { ...t0, value: t0.value.replace(/^\s+/, "") };
  const who = /^(you|candidate|me)$/i.test(m[1]) ? "you" : "interviewer";
  return { who, label: m[1], rest };
}

function quoteOpen(s: string): boolean {
  const t = s.trim();
  return /^["“]/.test(t) && !/["”][.,!?)]*$/.test(t);
}

async function tryTranscript(nodes: AnyNode[], i: number, ctx: BlockCtx, opts: Opts): Promise<{ node: AnyNode; end: number } | null> {
  if (!speakerOf(nodes[i])) return null;
  const kids: AnyNode[] = [];
  let j = i;
  let bubbles = 0;
  let you = 0;
  while (j < nodes.length) {
    const sp = speakerOf(nodes[j]);
    if (sp) {
      const content: AnyNode[] = [el("p", { className: ["sd-tr-text"] }, sp.rest as AnyNode[])];
      // multi-paragraph quote: keep following blocks until the quote closes
      let k = j + 1;
      if (quoteOpen(sp.rest.map(toText).join(""))) {
        const extra: AnyNode[] = [];
        while (k < nodes.length && k - j <= 12) {
          const nx = nodes[k];
          if (isNode(nx, "heading") || isNode(nx, "thematicBreak") || speakerOf(nx)) break;
          extra.push(nx);
          k++;
          if (isNode(nx, "paragraph") && /["”][.,!?)]*$/.test(toText(nx).trim())) break;
        }
        const last = extra[extra.length - 1];
        if (extra.length && isNode(last, "paragraph") && /["”][.,!?)]*$/.test(toText(last).trim())) {
          content.push(...(await processBlocks(extra, ctx, opts)));
        } else k = j + 1;
      }
      kids.push(el("div", { className: ["sd-bubble"], dataSpeaker: sp.who }, [el("span", { className: ["sd-speaker"] }, [text(sp.label)]), ...content]));
      bubbles++;
      if (sp.who === "you") you++;
      j = k;
      continue;
    }
    // narration: an emphasis-only paragraph followed by another speaker line
    if (isNode(nodes[j], "paragraph") && isEmphasisOnly(nodes[j] as Paragraph) && speakerOf(nodes[j + 1])) {
      kids.push(el("p", { className: ["sd-narration"] }, (nodes[j] as Paragraph).children as AnyNode[]));
      j++;
      continue;
    }
    break;
  }
  if (!bubbles) return null;
  count(ctx, "transcript");
  count(ctx, "bubbles", bubbles);
  const head =
    bubbles >= 2 && you
      ? rawHast(
          chrome("div", { className: ["sd-tr-head"] }, [
            h("span", { className: ["sd-tr-label"] }, ["Transcript"]),
            h("button", { type: "button", className: ["sd-btn", "sd-btn-quiet"], dataSdAction: "hide-you", ariaPressed: "false" }, ["Hide my lines"]),
          ]),
        )
      : null;
  return {
    node: el("div", { className: ["sd-transcript"], dataSd: "transcript", dataCount: String(bubbles) }, head ? [head, ...kids] : kids, { component: "transcript" }),
    end: j - 1,
  };
}

/* ------------------------------------------------------------------ pros / cons */

const PROS_RE = /^(Pros|Strengths|Advantages|Benefits)$/i;
const CONS_RE = /^(Cons|Weaknesses|Disadvantages|Drawbacks)$/i;
const USE_RE = /^(Use when|Best for|When to use|Use it when)$/i;

function labelOnly(n: AnyNode | undefined, re: RegExp): boolean {
  if (!isNode(n, "paragraph")) return false;
  const l = labelOf(n);
  return !!l && !l.hasText && re.test(l.label);
}

function tryProsCons(nodes: AnyNode[], i: number, ctx: BlockCtx): { node: AnyNode; end: number } | null {
  if (!labelOnly(nodes[i], PROS_RE) || !isNode(nodes[i + 1], "list") || !labelOnly(nodes[i + 2], CONS_RE) || !isNode(nodes[i + 3], "list")) return null;
  const cols: AnyNode[] = [
    el("div", { className: ["sd-pc-col"], dataPol: "pro" }, [el("p", { className: ["sd-pc-label"] }, (nodes[i] as Paragraph).children as AnyNode[]), nodes[i + 1]]),
    el("div", { className: ["sd-pc-col"], dataPol: "con" }, [el("p", { className: ["sd-pc-label"] }, (nodes[i + 2] as Paragraph).children as AnyNode[]), nodes[i + 3]]),
  ];
  let end = i + 3;
  if (labelOnly(nodes[i + 4], USE_RE) && isNode(nodes[i + 5], "list")) {
    cols.push(el("div", { className: ["sd-pc-foot"] }, [el("p", { className: ["sd-pc-label"] }, (nodes[i + 4] as Paragraph).children as AnyNode[]), nodes[i + 5]]));
    end = i + 5;
  }
  count(ctx, "proscons");
  return { node: el("div", { className: ["sd-proscons"], dataSd: "proscons" }, cols, { component: "proscons" }), end };
}

/* ------------------------------------------------------------------ paragraphs */

const INSIGHT_RE = /^(Key insights?|Insight|Key point|The key insight)$/i;

function isPullQuote(n: Blockquote): boolean {
  if (n.children.length !== 1 || n.children[0].type !== "paragraph") return false;
  const p = n.children[0];
  const t = toText(p).trim();
  if (!t || t.length > 160) return false;
  const kids = p.children.filter((c) => !(c.type === "text" && !c.value.trim()));
  const allStrong = kids.length === 1 && kids[0].type === "strong";
  const quoted = /^["“].+["”][.!]?$/.test(t);
  return allStrong || quoted;
}

function endMarkerPair(n: AnyNode, next: AnyNode | undefined): boolean {
  return isNode(n, "paragraph") && isEmphasisOnly(n) && /^End of\b/i.test(toText(n).trim()) && (!next || true);
}

export function isEndMarker(n: AnyNode): n is Paragraph {
  return endMarkerPair(n, undefined);
}

export function isTomorrow(n: AnyNode | undefined): n is Paragraph {
  if (!isNode(n, "paragraph")) return false;
  const fs = firstStrong(n);
  return !!fs && /^(Tomorrow|Next( week| up)?|Coming up)\b/i.test(fs.label);
}

/* ------------------------------------------------------------------ main pass */

export async function processBlocks(nodes: AnyNode[], ctx: BlockCtx, opts: Opts = {}): Promise<AnyNode[]> {
  const out: AnyNode[] = [];
  let resourcesDepth = 0;

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];

    if (isNode(n, "html")) {
      const d = await tryDetails(nodes, i, ctx, opts);
      if (d) {
        out.push(d.node);
        i = d.end;
        continue;
      }
      count(ctx, "htmlDropped");
      continue; // raw HTML is never rendered
    }

    if (isNode(n, "heading")) {
      if (resourcesDepth && n.depth <= resourcesDepth) resourcesDepth = 0;
      const tried = (await tryReveal(nodes, i, ctx, opts)) || (await tryProblem(nodes, i, ctx, opts)) || (await tryCallout(nodes, i, ctx, opts));
      if (tried) {
        out.push(tried.node);
        i = tried.end;
        continue;
      }
      if (RESOURCES_RE.test(headingText(n))) resourcesDepth = n.depth;
      out.push(headingEl(n, ctx));
      continue;
    }

    if (isNode(n, "paragraph")) {
      if (ctx.dropParas.has(n)) {
        count(ctx, "dupEndDropped");
        continue;
      }
      if (n === ctx.lastEnd) {
        const next = nodes[i + 1];
        const kids: AnyNode[] = [el("p", { className: ["sd-upnext-end"] }, n.children as AnyNode[])];
        if (isTomorrow(next)) {
          kids.push(el("p", { className: ["sd-upnext-next"] }, labelChildren(next)));
          i++;
        }
        count(ctx, "upNext");
        out.push(el("aside", { className: ["sd-upnext"], dataSd: "up-next", dataEnd: toText(n).trim().slice(0, 120) }, kids, { component: "up-next" }));
        continue;
      }
      const tr = await tryTranscript(nodes, i, ctx, opts);
      if (tr) {
        out.push(tr.node);
        i = tr.end;
        continue;
      }
      const pc = tryProsCons(nodes, i, ctx);
      if (pc) {
        out.push(pc.node);
        i = pc.end;
        continue;
      }
      const fs = firstStrong(n);
      if (fs && INSIGHT_RE.test(fs.label.replace(/:\s*$/, ""))) {
        count(ctx, "insight");
        out.push(el("aside", { className: ["sd-insight"], dataSd: "insight" }, [n], { component: "insight" }));
        continue;
      }
      const lab = labelOf(n);
      if (lab && lab.label.length <= 32 && lab.label.length >= 2) {
        if (!lab.hasText) {
          count(ctx, "eyebrow");
          out.push(el("p", { className: ["sd-eyebrow"], dataSd: "eyebrow" }, n.children as AnyNode[]));
          continue;
        }
        // a run of ≥2 "Label: text" paragraphs → definition grid
        let j = i;
        while (j < nodes.length && isNode(nodes[j], "paragraph")) {
          const l = labelOf(nodes[j] as Paragraph);
          if (!l || !l.hasText || l.label.length > 32 || speakerOf(nodes[j]) || INSIGHT_RE.test(l.label)) break;
          j++;
        }
        if (j - i >= 2) {
          count(ctx, "eyebrowGroup");
          out.push(
            el(
              "div",
              { className: ["sd-dl"], dataSd: "eyebrows" },
              nodes.slice(i, j).map((p) => el("p", { className: ["sd-dl-row"] }, labelChildren(p as Paragraph))),
              { component: "eyebrows" },
            ),
          );
          i = j - 1;
          continue;
        }
        out.push(el("p", { dataSd: "labelled" }, n.children as AnyNode[]));
        continue;
      }
      out.push(n);
      continue;
    }

    if (isNode(n, "blockquote") && isPullQuote(n)) {
      count(ctx, "pullquote");
      out.push(el("blockquote", { className: ["sd-pullquote"], dataSd: "pullquote" }, n.children as AnyNode[], { component: "pullquote" }));
      continue;
    }

    if (isNode(n, "list") && resourcesDepth && !n.children.some((li) => li.checked !== null && li.checked !== undefined)) {
      out.push(resourcesList(n, ctx));
      continue;
    }

    if (isNode(n, "code")) {
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

    out.push(n);
  }
  return cleanHr(out);
}

/* ------------------------------------------------------------------ <hr> */

function headingDepth(n: AnyNode | undefined): number {
  if (!n) return 0;
  if (isNode(n, "heading")) return n.depth;
  if ((n.type === "sdEl" || n.type === "sdHast") && n.meta?.heading) return n.meta.heading;
  return 0;
}

function isComponent(n: AnyNode | undefined): boolean {
  return !!n && (n.type === "sdEl" || n.type === "sdHast") && !!n.meta?.component;
}

/** Drop rules the layout already draws (next to h1/h2, components, stage edges, doubles). */
export function cleanHr(list: AnyNode[]): AnyNode[] {
  const out: AnyNode[] = [];
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (n.type !== "thematicBreak") {
      out.push(n);
      continue;
    }
    const prev = out[out.length - 1];
    let k = i + 1;
    while (k < list.length && list[k].type === "thematicBreak") k++;
    const next = list[k];
    const hd = (x: AnyNode | undefined) => {
      const d = headingDepth(x);
      return d > 0 && d <= 2;
    };
    if (!prev || !next || hd(prev) || hd(next) || isComponent(prev) || isComponent(next)) continue;
    out.push(n);
    i = k - 1;
  }
  return out;
}

/** Replace any `code` node that is still nested (inside lists, quotes…) with its component. */
export async function renderNestedCode(nodes: AnyNode[], ctx: BlockCtx): Promise<void> {
  const jobs: Promise<void>[] = [];
  const walk = (arr: AnyNode[]) => {
    arr.forEach((n, idx) => {
      if (isNode(n, "code")) {
        jobs.push(
          renderCode(n as Code, { kind: ctx.kind, nextFigure: () => ++ctx.figure, count: (k) => count(ctx, k) }).then((hast) => {
            arr[idx] = rawHast(hast, { component: "code" });
          }),
        );
      } else if (n.type !== "sdHast" && "children" in n && Array.isArray(n.children)) walk(n.children as AnyNode[]);
    });
  };
  walk(nodes);
  await Promise.all(jobs);
}

export type { RootContent };
