/**
 * DSA Mastery's lesson and problem directives (the dsa-mastery repo README, "Lesson directives"), on top of the
 * course renderer's `:::` blocks (directives.ts). Active only when a render passes `dsa` options
 * (RenderOpts.dsa → BlockCtx.dsa): System Design Mastery lessons never reach this file, so their output is unchanged.
 *
 *   containers  :::example[Title]{kind}  :::poll[Q]  :::tabs[Title]{id}  :::invariant  :::pattern  :::realsystems{sdm lab}
 *               :::script  :::toggle[Label]   (+ the course's own :::callout, :::panel… as usual)
 *   leaves      ::line[Text]{who opens}  ::trace[id]{predict}  ::handsolve[id]  ::race[id]  ::reorder[tabs-id]
 *               ::game[id]  ::explainback  ::checkpoint[quiz]  ::cards  ::solutions
 *   structures  :::costs[Title]  ::viz[demo]  ::sandbox[id]  ::lab[id]  and six beats meet … recap (Academy Part 2)
 *   beats       ::::beat[scenario] … ::::  → the lesson's six stages (render.ts unwrapBeats)
 *
 * Rendering contract: interactive pieces are `<figure data-dsa="<widget>" …>` with readable, static fallback content
 * (the code tabs show every language, the poll lists its options, a trace names itself) and an empty
 * `[data-dsa-stage]` chrome element the client fills (src/components/dsa/concept/DsaHydrator.tsx). Everything that
 * is not course text is data-sd-chrome, so highlight offsets ignore it.
 */
import type { Code, Paragraph, PhrasingContent, Root, RootContent } from "mdast";
import type { ContainerDirective, LeafDirective } from "mdast-util-directive";
import type { Properties } from "hast";
import { chrome, el, h, rawHast, text, toText, type AnyNode, type SdEl, type SdHast } from "../md";
import { renderCode } from "./code";
import type { BlockCtx } from "./blocks";
import { blockAttr, blockBody, blockCaption, blockInner, blockLabel } from "./directives";
import { BEAT_6S, BEAT_PLAIN } from "@/lib/dsa/words";

export type DsaCastMember = { name: string; role: string };
export type DsaLink = { href: string; title: string; kind: "lesson" | "lab" | "problem" };

export type DsaRenderOpts = {
  /** ::line speakers: cast id → name and role (resources/company/cast.md) */
  cast: Record<string, DsaCastMember>;
  /** a lesson: its `::::beat[...]` containers become the stages */
  beats?: boolean;
  /** the checkpoint quiz's markdown (quiz.md): its ```quiz fences replace `::checkpoint[quiz]` */
  checkpointQuiz?: string;
  /** a problem's reference solutions for `::solutions` (one fence per language) */
  solutions?: { lang: string; code: string }[];
  /** trace and race titles (generated/*), for the readable fallbacks */
  titles?: Record<string, string>;
  /** System Design Mastery targets of :::realsystems{sdm lab} */
  sdmLink?: (path: string) => DsaLink;
  labLink?: (id: string) => DsaLink;
};

/** Container names this file renders (directives.ts keeps them as blocks instead of turning them back into text). */
export const DSA_CONTAINERS = new Set(["beat", "example", "poll", "tabs", "invariant", "pattern", "realsystems", "script", "toggle", "dsa-checkpoint", "costs"]);
/** Leaf names this file renders. */
export const DSA_LEAVES = new Set(["line", "trace", "handsolve", "race", "reorder", "game", "explainback", "checkpoint", "cards", "solutions", "viz", "sandbox", "lab", "visualizer"]);

export const DSA_LANGS = ["python", "javascript", "java", "cpp"] as const;
export const DSA_LANG_LABEL: Record<string, string> = { python: "Python", javascript: "JavaScript", java: "Java", cpp: "C++" };

const EXAMPLE_KIND: Record<string, string> = {
  analogy: "Analogy",
  "hand-trace": "Hand trace",
  "dry-run": "Dry run",
  "template-applied": "Template applied",
  "edge-case": "Edge case",
  "wrong-approach": "Mistake museum",
  "does-not-apply": "Does not apply",
  "interview-variation": "Interview variation",
  // structure lessons (Academy Part 2)
  mistake: "Common mistake",
  "when-to-use": "When to use it",
  "when-not": "When not to use it",
};

const OPENS: Record<string, string> = { "first-attempt": "The first attempt", "scale-check": "The scale check", better: "Can we do better?" };

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

const tag = (label: string) => rawHast(chrome("span", { className: ["dsa-tag"] }, [label]));

function figure(name: string, props: Properties, kids: AnyNode[]): SdEl {
  return el("figure", { className: ["sdb", "dsa-block", `dsa-${name}`], dataSd: `dsa-${name}`, dataSdBlock: `dsa-${name}`, ...props }, kids, { component: `dsa-${name}` });
}

/** The client's mount point inside an interactive figure: chrome, empty until hydrated. */
const stage = (extra: Properties = {}) => rawHast(chrome("div", { className: ["dsa-stage"], dataDsaStage: "", ...extra }, []));

/* ------------------------------------------------------------------ tree passes (render.ts) */

/**
 * `::::beat[scenario]` containers at the top of a lesson: replaced by their content, with the beat's `## N. Beat: …`
 * heading promoted to an h1 so render.ts's stage split sees one stage per beat (see dsaStage).
 */
export function unwrapBeats(tree: Root): number {
  let n = 0;
  const out: RootContent[] = [];
  for (const c of tree.children) {
    const d = c as unknown as ContainerDirective;
    if (d.type !== "containerDirective" || d.name !== "beat") {
      out.push(c);
      continue;
    }
    n++;
    const kids = d.children.filter((k) => !(k.type === "paragraph" && (k.data as { directiveLabel?: boolean } | undefined)?.directiveLabel)) as RootContent[];
    const first = kids.findIndex((k) => k.type === "heading");
    if (first >= 0) (kids[first] as { depth: number }).depth = 1;
    out.push(...kids);
  }
  tree.children = out;
  return n;
}

/**
 * Visual lessons (structures, Academy Part 2; algorithms, Part 3): their six beats, by heading label → stage id.
 * "## 1. Meet it: a train of carriages" → stage "meet", labelled "Meet it" (already plain words: no 6S subtitle).
 */
const STRUCTURE_BEATS: Record<string, string> = {
  "meet it": "meet",
  operations: "operations",
  "try it": "sandbox",
  "build it": "build",
  "use it well": "choose",
  recap: "recap",
  // algorithm lessons (Academy Part 3, resources/algorithms/): Meet it, See it move, Why it works, Build it, Use it well, Recap
  "see it move": "see",
  "why it works": "why",
};

/**
 * A beat heading ("1. Scenario: the busiest three hours") → its stage: id "scenario", the plain label "The problem"
 * and the 6S word "Scenario" as its subtitle (owner, 9 Nov 2026: plain names first, src/lib/dsa/words.ts).
 */
export function dsaStage(t: string): { id: string; label: string; title: string; core: boolean; numeral: string; sub: string } | null {
  const st = t.trim().match(/^(\d+)\.\s*([A-Za-z][A-Za-z ]*?)\s*:\s*(.+)$/);
  const sid = st ? STRUCTURE_BEATS[st[2].toLowerCase()] : undefined;
  if (st && sid) return { id: sid, label: st[2], title: st[3].trim(), core: true, numeral: st[1], sub: "" };
  const m = t.trim().match(/^(\d+)\.\s*([A-Za-z]+)\s*[:.–—-]\s*(.+)$/);
  if (!m) return null;
  const id = m[2].toLowerCase();
  if (!BEAT_PLAIN[id]) return null;
  return { id, label: BEAT_PLAIN[id], title: m[3].trim(), core: true, numeral: m[1], sub: BEAT_6S[id] };
}

/** `::checkpoint[quiz]` → a dsa-checkpoint container holding quiz.md's ```quiz fences (so they are numbered with the lesson's). */
export function injectCheckpoint(tree: Root, quiz: Root): number {
  const fences = quiz.children.filter((c): c is Code => c.type === "code" && (c.lang || "").toLowerCase() === "quiz");
  let n = 0;
  const walk = (kids: RootContent[]) => {
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i] as unknown as LeafDirective;
      if (c.type === "leafDirective" && c.name === "checkpoint") {
        n++;
        const node = { type: "containerDirective", name: "dsa-checkpoint", attributes: {}, children: fences.map((f) => ({ ...f })) } as unknown as RootContent;
        kids.splice(i, 1, node);
        continue;
      }
      const p = kids[i] as { children?: RootContent[] };
      if (Array.isArray(p.children)) walk(p.children);
    }
  };
  walk(tree.children);
  return n;
}

/* ------------------------------------------------------------------ code tabs */

async function codePane(code: Code, ctx: BlockCtx): Promise<SdHast> {
  const lang = (code.lang || "").toLowerCase();
  // C++ is highlighted with the C grammar (no extra ~0.4 MB C++ grammar on the server) and labelled C++
  const fig = await renderCode({ ...code, lang: lang === "cpp" || lang === "c++" ? "c" : code.lang }, { kind: ctx.kind, nextFigure: () => ++ctx.figure, count: () => {} });
  const norm = lang === "c++" ? "cpp" : lang === "js" ? "javascript" : lang === "py" ? "python" : lang;
  if (norm === "cpp") {
    fig.properties.dataLang = "cpp";
    const walk = (n: { type?: string; properties?: Properties; children?: unknown[]; value?: string }) => {
      if (n.properties && Array.isArray(n.properties.className) && n.properties.className.includes("sd-code-lang")) n.children = [{ type: "text", value: "c++" }];
      else (n.children as typeof n[] | undefined)?.forEach(walk);
    };
    walk(fig as never);
  }
  return rawHast(h("div", { className: ["dsa-pane"], dataLang: norm, dataLangLabel: DSA_LANG_LABEL[norm] || norm }, [fig]), { component: "code" });
}

async function tabs(node: ContainerDirective, ctx: BlockCtx, codes?: Code[]): Promise<SdEl> {
  const kids = codes ?? blockBody(node).filter((c): c is Code => c.type === "code");
  const id = blockAttr(node, "id") || slug(toText({ type: "paragraph", children: blockLabel(node) || [] } as Paragraph)) || "code";
  const panes = await Promise.all(kids.map((c) => codePane(c, ctx)));
  return figure("tabs", { dataDsa: "tabs", dataTabsId: id, dataLangs: kids.map((c) => (c.lang || "").toLowerCase()).join(" ") }, [
    ...blockCaption(blockLabel(node), [tag("Code in four languages")]),
    stage(),
    el("div", { className: ["dsa-panes"] }, panes),
  ]);
}

/* ------------------------------------------------------------------ containers */

export async function dsaBlock(node: ContainerDirective, ctx: BlockCtx): Promise<SdEl> {
  const title = blockLabel(node);
  switch (node.name) {
    case "example": {
      const kind = blockAttr(node, "kind") || "";
      return figure("example", { dataKind: kind || undefined }, [
        ...blockCaption(title, [tag(EXAMPLE_KIND[kind] || "Example")]),
        el("div", { className: ["sdb-body"] }, await blockInner(blockBody(node), ctx)),
      ]);
    }
    case "poll": {
      const q = title ? toText({ type: "paragraph", children: title } as Paragraph).trim() : "Poll";
      return figure("poll", { dataDsa: "poll", dataPollId: slug(q) }, [
        ...blockCaption(title, [tag("Poll · no wrong answer")]),
        el("div", { className: ["sdb-body", "dsa-poll-options"] }, await blockInner(blockBody(node), ctx)),
        stage(),
      ]);
    }
    case "tabs":
      return tabs(node, ctx);
    case "invariant":
      return figure("invariant", {}, [...blockCaption(title, [tag("Invariant")]), el("div", { className: ["sdb-body"] }, await blockInner(blockBody(node), ctx))]);
    case "pattern":
      return figure("pattern", {}, [...blockCaption(title, [tag("Pattern card")]), el("div", { className: ["sdb-body"] }, await blockInner(blockBody(node), ctx))]);
    case "script":
      return figure("script", {}, [...blockCaption(title, [tag("60-second answer")]), el("div", { className: ["sdb-body"] }, await blockInner(blockBody(node), ctx))]);
    case "toggle": {
      const label = title ? (title as AnyNode[]) : [text("Show more")];
      return el(
        "details",
        { className: ["dsa-toggle"], dataSd: "dsa-toggle", dataSdBlock: "dsa-toggle" },
        [el("summary", { className: ["dsa-toggle-sum"] }, label), el("div", { className: ["dsa-toggle-body"] }, await blockInner(blockBody(node), ctx))],
        { component: "dsa-toggle" },
      );
    }
    case "realsystems": {
      const sdm = (blockAttr(node, "sdm") || "").split(",").map((s) => s.trim()).filter(Boolean);
      const labs = (blockAttr(node, "lab") || "").split(",").map((s) => s.trim()).filter(Boolean);
      const links: DsaLink[] = [
        ...sdm.map((p) => ctx.dsa?.sdmLink?.(p) ?? { href: `/${p}`, title: p, kind: "lesson" as const }),
        ...labs.map((l) => ctx.dsa?.labLink?.(l) ?? { href: `/labs/${l}`, title: l, kind: "lab" as const }),
      ];
      return el(
        "aside",
        { className: ["sdb", "dsa-block", "dsa-realsystems"], dataSd: "dsa-realsystems", dataSdBlock: "dsa-realsystems", role: "note" },
        [
          rawHast(chrome("p", { className: ["dsa-rs-head"] }, [h("span", { className: ["dsa-tag"] }, ["System Design Mastery"]), "Why this matters in real systems"])),
          el("div", { className: ["sdb-body"] }, await blockInner(blockBody(node), ctx)),
          rawHast(
            chrome("ul", { className: ["dsa-rs-links"] }, links.map((l) => h("li", {}, [h("a", { href: l.href, dataKind: l.kind }, [h("span", { className: ["dsa-rs-kind"] }, [l.kind === "lab" ? "Lab" : "Lesson"]), l.title])]))),
          ),
        ],
        { component: "dsa-realsystems" },
      );
    }
    case "costs":
      // a structure lesson's operation-cost table
      return figure("costs", {}, [...blockCaption(title, [tag("What each operation costs")]), el("div", { className: ["sdb-body"] }, await blockInner(blockBody(node), ctx))]);
    case "dsa-checkpoint":
      return figure("checkpoint", { dataDsa: "checkpoint" }, [
        rawHast(chrome("figcaption", { className: ["sdb-head"] }, [h("span", { className: ["dsa-tag"] }, ["Checkpoint quiz"]), h("span", { className: ["sdb-title"] }, ["Pass with 80% to open the gate"])])),
        ...(await blockInner(blockBody(node), ctx)),
        stage(),
      ]);
    default:
      return figure(node.name, {}, [...blockCaption(title), el("div", { className: ["sdb-body"] }, await blockInner(blockBody(node), ctx))]);
  }
}

/* ------------------------------------------------------------------ leaves */

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

function widget(kind: string, props: Properties, fallback: string): SdEl {
  return el(
    "figure",
    { className: ["sdb", "dsa-block", "dsa-widget", `dsa-${kind}`], dataSd: `dsa-${kind}`, dataSdBlock: `dsa-${kind}`, dataDsa: kind, ...props },
    [rawHast(chrome("p", { className: ["dsa-fallback"] }, [fallback])), stage()],
    { component: `dsa-${kind}` },
  );
}

export async function dsaLeaf(node: LeafDirective, ctx: BlockCtx): Promise<AnyNode> {
  const label = toText(node).trim();
  const attrs = (node.attributes || {}) as Record<string, string | null | undefined>;
  const titles = ctx.dsa?.titles || {};
  switch (node.name) {
    case "line": {
      const who = attrs.who || "";
      const p = ctx.dsa?.cast[who];
      const opens = attrs.opens && OPENS[attrs.opens] ? attrs.opens : undefined;
      return el("div", { className: ["dsa-line"], dataSd: "dsa-line", dataWho: who || undefined, dataOpens: opens }, [
        rawHast(chrome("span", { className: ["dsa-line-avatar"], ariaHidden: "true" }, [initials(p?.name || who || "?")])),
        el("div", { className: ["dsa-line-main"] }, [
          rawHast(
            chrome("p", { className: ["dsa-line-who"] }, [
              h("span", { className: ["dsa-line-name"] }, [p?.name || who]),
              p?.role ? h("span", { className: ["dsa-line-role"] }, [p.role]) : null,
              opens ? h("span", { className: ["dsa-tag"] }, [OPENS[opens]]) : null,
            ]),
          ),
          el("p", { className: ["dsa-line-text"] }, node.children as PhrasingContent[] as AnyNode[]),
        ]),
      ]);
    }
    case "trace":
      return widget("trace", { dataId: label, dataPredict: "predict" in attrs ? "true" : undefined }, `Dry run: ${titles[label] || label}. The step-by-step player loads in your browser.`);
    case "handsolve":
      return widget("handsolve", { dataId: label }, `Solve it by hand: ${titles[label] || label}. The hand-solve sheet loads in your browser.`);
    case "race":
      return widget("race", { dataId: label }, `Race: ${titles[label] || label}. The operation counter loads in your browser.`);
    case "reorder":
      return widget("reorder", { dataId: label }, "Rebuild the template: put its lines back in order. Loads in your browser.");
    case "game":
      return widget("game", { dataId: label }, `Game: ${label.replace(/-/g, " ")}. Coming to the map as a side path.`);
    case "explainback":
      return widget("explainback", {}, "Explain it back: write the idea in your own words and get feedback.");
    case "checkpoint":
      return widget("checkpoint", {}, "Checkpoint quiz: ten questions on this lesson.");
    case "cards":
      return widget("cards", {}, "Review cards from this lesson.");
    case "viz":
      return widget("viz", { dataId: label }, `Step by step: ${titles[label] || label.replace(/-/g, " ")}. The animated player loads in your browser.`);
    case "sandbox":
      return widget("sandbox", { dataId: label }, "The sandbox: build a list and run its operations step by step. It loads in your browser.");
    case "lab":
      return widget("lab", { dataId: label }, "Build it yourself: write the code in Python, JavaScript, Java or C++ and run the tests. It loads in your browser.");
    case "visualizer":
      return widget("visualizer", { dataId: label }, "The visualizer: draw a grid, then step through BFS and DFS on it. It loads in your browser.");
    case "solutions": {
      const sols = ctx.dsa?.solutions || [];
      if (!sols.length) return widget("solutions", {}, "Reference solutions in four languages.");
      const codes: Code[] = sols.map((s) => ({ type: "code", lang: s.lang, value: s.code.replace(/\s+$/, "") }));
      return tabs({ type: "containerDirective", name: "tabs", attributes: { id: "solutions" }, children: [] } as unknown as ContainerDirective, ctx, codes);
    }
    default:
      return el("p", {}, [text(label)]);
  }
}
