/**
 * Course content renderer: lesson markdown (unchanged in GitHub) → semantic HTML + the
 * structure the reader needs (stages, TOC, reading time). Spec: RendererKit.dc.html.
 *
 * Pipeline: remark-parse + remark-gfm → hero/stage split → detectors (detect/blocks.ts,
 * detect/code.ts; shiki for tagged code) → remark-rehype (custom sd handlers) → hast pass
 * (tables, task lists) → rehype-stringify.
 *
 * HTML contract (see types.ts): each stage is
 *   <section data-sd="stage" id data-stage-id data-minutes [data-budget]>…</section>
 * components carry data-sd="<kind>", and every piece of UI that is not course text
 * carries data-sd-chrome so highlight offsets can skip it. <CourseEnhancer/> wires up the
 * buttons on the client.
 */
import { createHash } from "crypto";
import type { Heading, Paragraph, Root, RootContent } from "mdast";
import type { Element as HastElement, ElementContent, Root as HastRoot, RootContent as HastRootContent } from "hast";
import type { LessonKind, RenderedLesson, Stage, TocItem } from "./types";
import { chrome, el, h, hastText, rawHast, startsWithEmoji, stripEmoji, text, toText, wordCount, type AnyNode, type SdEl, type SdHast } from "./md";
import { IdRegistry, intToRoman, romanToInt, slugify } from "./slug";
import { cleanHr, count, isEndMarker, isTomorrow, processBlocks, renderNestedCode, type BlockCtx } from "./detect/blocks";

export type RenderStats = Record<string, number>;

const SERIES_RE = /^System Design Mastery Series$/i;

/* ------------------------------------------------------------------ stages */

type StageHead = { id: string; label: string; title: string; budget?: number; core: boolean; numeral?: string };

function majorStage(textRaw: string, kind: LessonKind): StageHead | null {
  const t = stripEmoji(textRaw).trim();
  let m: RegExpMatchArray | null;
  if (kind === "capstone" || kind === "bonus") {
    m = t.match(/^Phase\s+(\d+)\s*[:.–—-]\s*(.+?)(?:\s*\((\d+)\s*min(?:ute)?s?\))?\s*$/i);
    if (m) return { id: `phase-${m[1]}`, label: `Phase ${m[1]}`, title: m[2].trim(), budget: m[3] ? parseInt(m[3], 10) : undefined, core: true, numeral: m[1] };
    return null;
  }
  if (kind === "overview") {
    m = t.match(/^(WEEK|PHASE)\s+(\d+)\s*[:.–—-]\s*(.+)$/i);
    if (m) {
      const w = m[1].toLowerCase();
      return { id: `${w}-${m[2]}`, label: `${w === "week" ? "Week" : "Phase"} ${m[2]}`, title: m[3].trim(), core: true, numeral: m[2] };
    }
    return null;
  }
  if (/^Preface\b/i.test(t)) return { id: "preface", label: "Preface", title: t, core: false };
  m = t.match(/^Part\s+([IVXLC]+|\d+)\s*[:.–—-]\s*(.+)$/i);
  if (m) {
    const n = romanToInt(m[1]);
    return { id: `part-${n}`, label: `Part ${intToRoman(n)}`, title: m[2].trim(), core: true, numeral: intToRoman(n) };
  }
  if (kind === "foundations") {
    m = t.match(/^Chapter\s+(\d+)\s*[:.–—-]\s*(.+)$/i);
    if (m) return { id: `chapter-${m[1]}`, label: `Chapter ${m[1]}`, title: m[2].trim(), core: true, numeral: m[1].padStart(2, "0") };
  }
  if (/^Exercises?\b/i.test(t)) return { id: "exercises", label: "Exercises", title: t, core: false };
  m = t.match(/^Appendix\b\s*([A-Z0-9]+\b)?\s*[:.–—-]?\s*(.*)$/i);
  if (m) return { id: "appendix", label: "Appendix", title: m[2].trim() || "Appendix", core: false };
  return null;
}

type RawStage = { head: StageHead; heading: Heading | null; nodes: RootContent[] };

function previewMajors(nodes: RootContent[]): Set<number> {
  // h1 sections that hold "Concept N" / "Day N" h2s
  const majors = new Set<number>();
  let cur = -1;
  nodes.forEach((n, i) => {
    if (n.type === "heading" && n.depth === 1) cur = i;
    else if (cur >= 0 && n.type === "heading" && n.depth === 2 && /^(Concept|Day)\s+\d+/i.test(stripEmoji(toText(n)))) majors.add(cur);
  });
  return majors;
}

function splitStages(nodes: RootContent[], kind: LessonKind): RawStage[] {
  const stages: RawStage[] = [];
  const leading: RootContent[] = [];
  const h1s = nodes.map((n, i) => (n.type === "heading" && n.depth === 1 ? i : -1)).filter((i) => i >= 0);
  const pm = kind === "week-preview" ? previewMajors(nodes) : null;
  const isMajor = (i: number): StageHead | null => {
    const n = nodes[i] as Heading;
    const t = toText(n);
    if (pm) return pm.has(i) ? { id: slugify(t, 40), label: stripEmoji(t), title: stripEmoji(t), core: true } : null;
    return majorStage(t, kind);
  };
  let anyMajor = h1s.some((i) => isMajor(i));
  const fallback = !anyMajor && h1s.length >= 2;
  if (fallback) anyMajor = true;
  let lastPhaseSeen = false;
  let wrapOpened = false;

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.type === "heading" && n.depth === 1) {
      const t = toText(n);
      let head = fallback ? { id: slugify(t, 40) || "section", label: stripEmoji(t), title: stripEmoji(t), core: true } : isMajor(i);
      if (!head && (kind === "capstone" || kind === "bonus") && lastPhaseSeen && !wrapOpened) {
        head = { id: "wrap-up", label: "Wrap-up", title: stripEmoji(t), core: false };
        wrapOpened = true;
      }
      if (head) {
        if (head.id.startsWith("phase-")) lastPhaseSeen = true;
        stages.push({ head, heading: n, nodes: [] });
        continue;
      }
    }
    if (stages.length) stages[stages.length - 1].nodes.push(n);
    else leading.push(n);
  }

  if (!stages.length) return [{ head: { id: "lesson", label: "Lesson", title: "Lesson", core: false }, heading: null, nodes: leading }];
  if (leading.some((n) => n.type !== "thematicBreak")) {
    stages.unshift({ head: { id: "intro", label: "Intro", title: "Intro", core: false }, heading: null, nodes: leading });
  }
  return stages;
}

/* ------------------------------------------------------------------ reading time */

function stageSeconds(nodes: RootContent[]): { seconds: number; words: number; diagrams: number; codeLines: number } {
  let words = 0;
  let diagrams = 0;
  let codeLines = 0;
  const walk = (n: unknown) => {
    const x = n as { type?: string; value?: string; lang?: string | null; children?: unknown[] };
    if (x.type === "code") {
      const v = x.value || "";
      const box = (v.match(/[─│┌┐└┘├┤┬┴┼═║╔╗╚╝▶▼◀▲]/g) || []).length;
      if (!x.lang && box / Math.max(1, v.replace(/\s/g, "").length) > 0.02) diagrams++;
      else codeLines += v.split("\n").length;
      return;
    }
    if (x.type === "html") return;
    if (x.type === "text" || x.type === "inlineCode") {
      words += wordCount(x.value || "");
      return;
    }
    if (Array.isArray(x.children)) x.children.forEach(walk);
  };
  nodes.forEach(walk);
  return { seconds: (words / 230) * 60 + diagrams * 20 + codeLines, words, diagrams, codeLines };
}

/* ------------------------------------------------------------------ hast pass */

const YES = /^(✓|✔|✅|Yes|YES|yes)$/;
const NO = /^(✗|✘|❌|No|NO|no)$/;

function cls(e: HastElement): string[] {
  const c = e.properties.className;
  return Array.isArray(c) ? c.map(String) : typeof c === "string" ? c.split(/\s+/) : [];
}

function isEl(n: unknown, tag?: string): n is HastElement {
  return !!n && typeof n === "object" && (n as HastElement).type === "element" && (!tag || (n as HastElement).tagName === tag);
}

function prevElement(siblings: HastRootContent[] | ElementContent[], idx: number): HastElement | null {
  for (let k = idx - 1; k >= 0; k--) {
    const s = siblings[k];
    if (s.type === "text" && !s.value.trim()) continue;
    return isEl(s) ? s : null;
  }
  return null;
}

function hastPass(tree: HastRoot, stats: RenderStats, state: { check: number }) {
  const visitKids = (parent: HastRoot | HastElement) => {
    const kids = parent.children as ElementContent[];
    for (let i = 0; i < kids.length; i++) {
      const n = kids[i];
      if (!isEl(n)) continue;
      if (n.properties.dataSdChrome !== undefined) continue;
      if (n.tagName === "pre") continue;

      if (n.tagName === "table") {
        const firstRow = (n.children.find((c) => isEl(c, "thead")) as HastElement | undefined)?.children.find((c) => isEl(c, "tr")) as HastElement | undefined;
        const colCount = firstRow ? firstRow.children.filter((c) => isEl(c)).length : 0;
        const headText = firstRow ? hastText(firstRow).replace(/\s+/g, " ").trim().slice(0, 80) : "Table";
        // pass/fail cells
        const walkCells = (e: HastElement) => {
          for (const c of e.children) {
            if (!isEl(c)) continue;
            if (c.tagName === "td") {
              const t = hastText(c).trim();
              if (YES.test(t)) {
                c.properties.className = [...cls(c), "sd-yes"];
                if (/^[A-Za-z]/.test(t)) c.children.unshift(chrome("span", { className: ["sd-glyph"], ariaHidden: "true" }, ["✓ "]));
              } else if (NO.test(t)) {
                c.properties.className = [...cls(c), "sd-no"];
                if (/^[A-Za-z]/.test(t)) c.children.unshift(chrome("span", { className: ["sd-glyph"], ariaHidden: "true" }, ["✗ "]));
              }
            } else walkCells(c);
          }
        };
        walkCells(n);
        stats.table = (stats.table || 0) + 1;
        kids[i] = h(
          "div",
          { className: ["sd-table"], dataSd: "table", dataSticky: colCount >= 3 ? "true" : undefined, role: "region", tabIndex: 0, ariaLabel: `Table: ${headText}` },
          [n],
        );
        continue;
      }

      // "Numbers" lists: ≥3 items that each lead with a bold figure (**~2,000,000** people …) become a
      // stat-tile grid. Marked with a class only — the text is untouched, so highlight offsets stay valid.
      if ((n.tagName === "ul" || n.tagName === "ol") && !cls(n).includes("contains-task-list")) {
        const items = n.children.filter((c): c is HastElement => isEl(c, "li"));
        const leadsWithFigure = (li: HastElement) => {
          const first = li.children.find((c) => !(c.type === "text" && !c.value.trim()));
          const target = isEl(first, "p") ? first.children.find((c) => !(c.type === "text" && !c.value.trim())) : first;
          return isEl(target, "strong") && /^[~≈<>]?\s?[₹$€]?\d/.test(hastText(target).trim());
        };
        if (items.length >= 3 && items.length <= 8 && items.filter(leadsWithFigure).length >= Math.max(3, Math.ceil(items.length * 0.6))) {
          n.properties.className = [...cls(n), "sd-stats"];
          n.properties.dataSd = "stats";
          stats.stats = (stats.stats || 0) + 1;
        }
      }
      if (n.tagName === "ul" && cls(n).includes("contains-task-list") && !(parent.type === "element" && cls(parent).includes("sd-checklist"))) {
        const items = n.children.filter((c): c is HastElement => isEl(c, "li"));
        let total = 0;
        for (const li of items) {
          const inputIdx = li.children.findIndex((c) => isEl(c, "input"));
          // loose items wrap the checkbox inside a <p>
          let host: HastElement = li;
          let idx = inputIdx;
          if (idx < 0) {
            const p = li.children.find((c): c is HastElement => isEl(c, "p") && c.children.some((x) => isEl(x, "input")));
            if (p) {
              host = p;
              idx = p.children.findIndex((x) => isEl(x, "input"));
            }
          }
          if (idx < 0) continue;
          host.children.splice(idx, 1);
          if (host.children[idx]?.type === "text") {
            const t = host.children[idx] as { value: string };
            t.value = t.value.replace(/^\s+/, "");
          }
          const key = String(state.check++);
          const tid = `sd-ck-${key}`;
          const textKids = li.children;
          li.children = [
            chrome("input", { type: "checkbox", className: ["sd-ck-box"], dataSdCheck: key, ariaLabelledby: tid }),
            h("div", { className: ["sd-ck-text"], id: tid }, textKids),
          ];
          li.properties.className = ["sd-ck-item"];
          li.properties.dataSdCheckItem = key;
          total++;
        }
        if (!total) continue;
        const prev = prevElement(kids, i);
        let title = "Checklist";
        if (prev && (/^h[2-6]$/.test(prev.tagName) || isEl(prev, "p"))) {
          const t = hastText(prev).replace(/#$/, "").replace(/:$/, "").trim();
          if (t && t.length <= 60) title = t;
        }
        n.properties.className = ["sd-ck-list"];
        stats.checklist = (stats.checklist || 0) + 1;
        stats.checkItems = (stats.checkItems || 0) + total;
        kids[i] = h("div", { className: ["sd-checklist"], dataSd: "checklist", dataTotal: String(total) }, [
          chrome("div", { className: ["sd-ck-head"] }, [
            h("span", { className: ["sd-ck-title"] }, [title]),
            h("span", { className: ["sd-ck-count"], ariaLive: "polite" }, [`0/${total} ready`]),
            h("span", { className: ["sd-ck-bar"], ariaHidden: "true" }, [h("span", { className: ["sd-ck-fill"] })]),
          ]),
          n,
        ]);
        continue;
      }
      visitKids(n);
    }
  };
  visitKids(tree);
}

/* ------------------------------------------------------------------ main */

export async function renderLessonDetailed(markdown: string, opts: { kind: LessonKind }): Promise<{ lesson: RenderedLesson; stats: RenderStats }> {
  const { kind } = opts;
  const { unified } = await import("unified");
  const remarkParse = (await import("remark-parse")).default;
  const remarkGfm = (await import("remark-gfm")).default;
  const remarkRehype = (await import("remark-rehype")).default;
  const rehypeStringify = (await import("rehype-stringify")).default;

  const parser = unified().use(remarkParse).use(remarkGfm);
  const mdast = (await parser.run(parser.parse(markdown))) as Root;
  // Image URLs: same ImageKit rewrite the stories pipeline uses (course lessons have no images today).
  {
    const { visit } = await import("unist-util-visit");
    const { resolveCoverUrl } = await import("@/lib/utils");
    visit(mdast, "image", (node: { url?: string }) => {
      const u = node.url ? resolveCoverUrl(node.url) : undefined;
      if (u) node.url = u;
    });
  }
  const stats: RenderStats = {};

  /* hero: h1 title, h2 deck (unless the series label), hr; optional emoji h1 lede */
  const nodes = [...mdast.children];
  let title = "";
  let subtitle: string | undefined;
  let k = 0;
  while (k < nodes.length && nodes[k].type === "thematicBreak") k++;
  let leadingTitle = false;
  if (nodes[k]?.type === "heading" && (nodes[k] as Heading).depth === 1) {
    title = stripEmoji(toText(nodes[k]));
    leadingTitle = true;
    k++;
  } else {
    const h1 = nodes.find((n): n is Heading => n.type === "heading" && n.depth === 1);
    title = h1 ? stripEmoji(toText(h1)) : "";
  }
  // An h2 is a deck/subtitle only right after the leading h1 title (stories start with a real h2 section).
  if (leadingTitle && nodes[k]?.type === "heading" && (nodes[k] as Heading).depth === 2) {
    const t = stripEmoji(toText(nodes[k]));
    if (!SERIES_RE.test(t)) subtitle = t;
    k++;
  }
  while (k < nodes.length && nodes[k].type === "thematicBreak") k++;
  let body = nodes.slice(k).filter((n) => !(n.type === "heading" && n.depth === 2 && SERIES_RE.test(stripEmoji(toText(n)))));
  let lede: SdEl | null = null;
  if (body[0]?.type === "heading" && (body[0] as Heading).depth === 1 && startsWithEmoji(toText(body[0])) && !majorStage(toText(body[0]), kind)) {
    lede = el("p", { className: ["sd-lede"], dataSd: "lede" }, [text(stripEmoji(toText(body[0])))], { component: "lede" });
    body = body.slice(1);
  }

  /* End of Day + Tomorrow: keep only the last pair */
  const ends = body.filter((n) => isEndMarker(n as AnyNode)) as Paragraph[];
  const lastEnd = ends.length ? ends[ends.length - 1] : null;
  const dropParas = new Set<Paragraph>();
  for (const e of ends.slice(0, -1)) {
    dropParas.add(e);
    const at = body.indexOf(e);
    const next = body[at + 1] as AnyNode | undefined;
    if (isTomorrow(next)) dropParas.add(next);
  }

  const raw = splitStages(body, kind);
  if (lede) raw[0].nodes.unshift(lede as unknown as RootContent);

  const ids = new IdRegistry();
  const toc: TocItem[] = [];
  const ctx: BlockCtx = { kind, ids, toc, stats, stageId: "", hstack: [], figure: 0, dropParas, lastEnd };
  const stages: Stage[] = [];
  const sections: SdEl[] = [];
  const coreTotal = raw.filter((s) => s.head.core).length;
  let coreIdx = 0;

  raw.forEach((s) => {
    s.head.id = ids.claim(s.head.id);
  });

  for (const s of raw) {
    const { head } = s;
    ctx.stageId = head.id;
    ctx.hstack = [];
    const time = stageSeconds(s.nodes.concat(s.heading ? [s.heading] : []));
    const minutes = Math.max(1, Math.round(time.seconds / 60));
    stages.push({ id: head.id, label: head.label, title: head.title, minutes, ...(head.budget ? { budgetMinutes: head.budget } : {}) });
    if (head.core) coreIdx++;
    if (s.heading) toc.push({ id: head.id, text: stripEmoji(toText(s.heading)), level: 1, kind: "part", stageId: head.id });

    const content = await processBlocks(s.nodes as AnyNode[], ctx);
    await renderNestedCode(content, ctx);

    const meta = [head.label, head.core && coreTotal > 1 ? `Stage ${coreIdx} of ${coreTotal}` : null, head.budget ? `${head.budget} min budget` : null, `${minutes} min${head.budget ? " read" : ""}`]
      .filter(Boolean)
      .join(" · ");
    const headKids: AnyNode[] = [];
    if (head.numeral) headKids.push(rawHast(chrome("span", { className: ["sd-stage-num"], ariaHidden: "true" }, [head.numeral])));
    const titleKids: AnyNode[] = [rawHast(chrome("p", { className: ["sd-stage-meta"] }, [meta]))];
    if (s.heading) {
      const hd = s.heading;
      const inline = hd.children.map((c) => (c.type === "text" ? { ...c, value: stripEmoji(c.value) } : c));
      const full = stripEmoji(toText(hd));
      const prefixMatch = full.match(/^((?:Part\s+[IVXLC\d]+|Phase\s+\d+|Chapter\s+\d+|WEEK\s+\d+|PHASE\s+\d+|Appendix)\s*[:.–—-])\s*/i);
      let headingChildren: AnyNode[] = inline as AnyNode[];
      if (prefixMatch && inline[0]?.type === "text" && (inline[0] as { value: string }).value.startsWith(prefixMatch[1])) {
        const first = inline[0] as { type: "text"; value: string };
        headingChildren = [
          el("span", { className: ["sd-stage-prefix"] }, [text(prefixMatch[1])]),
          text(" "),
          { ...first, value: first.value.slice(prefixMatch[0].length) },
          ...(inline.slice(1) as AnyNode[]),
        ];
      }
      titleKids.push(el("h2", { className: ["sd-h", "sd-h1", "sd-stage-title"] }, headingChildren, { heading: 1 }));
    }
    headKids.push(el("div", { className: ["sd-stage-titles"] }, titleKids));
    const header = el("header", { className: ["sd-stage-head"], dataSdStageHead: "" }, headKids, { heading: 1 });

    sections.push(
      el(
        "section",
        {
          dataSd: "stage",
          id: head.id,
          dataStageId: head.id,
          dataMinutes: String(minutes),
          dataBudget: head.budget ? String(head.budget) : undefined,
          dataLabel: head.label,
          dataCore: head.core ? "true" : undefined,
          className: ["sd-stage"],
        },
        cleanHr([header, ...content]),
      ),
    );
  }
  count(ctx, "stages", stages.length);

  /* mdast(+sd) → hast */
  const handlers = {
    sdEl(state: { all: (n: unknown) => ElementContent[]; patch: (a: unknown, b: unknown) => void }, node: SdEl): HastElement {
      const result: HastElement = { type: "element", tagName: node.tag, properties: node.props, children: state.all(node) };
      state.patch(node, result);
      return result;
    },
    sdHast(_state: unknown, node: SdHast) {
      return node.hast;
    },
  };
  const toHast = unified().use(remarkRehype, { handlers: handlers as never });
  const outRoot = { type: "root", children: sections } as unknown as Root;
  const hast = (await toHast.run(outRoot)) as HastRoot;
  hastPass(hast, stats, { check: 0 });
  const html = unified().use(rehypeStringify).stringify(hast);

  const readingMinutes = stages.reduce((a, s) => a + s.minutes, 0);
  return {
    lesson: {
      html,
      title,
      subtitle,
      stages,
      toc,
      readingMinutes,
      contentVersion: createHash("sha1").update(markdown).digest("hex").slice(0, 12),
    },
    stats,
  };
}

export async function renderLesson(markdown: string, opts: { kind: LessonKind }): Promise<RenderedLesson> {
  return (await renderLessonDetailed(markdown, opts)).lesson;
}
