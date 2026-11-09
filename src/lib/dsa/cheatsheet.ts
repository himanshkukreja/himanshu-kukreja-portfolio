import "server-only";
import matter from "gray-matter";
import { unstable_cache } from "next/cache";
import { renderLesson } from "@/lib/course/render";
import type { DsaRenderOpts } from "@/lib/course/detect/dsa";
import { DSA_CONTENT_TAG, dsaFresh, readDsa } from "./content";
import { conceptHref, getConceptIndex, getProblemIndex } from "./load";
import type { DsaLevel } from "./types";

/**
 * Pattern cheat sheets (/dsa/cheatsheets, /dsa/cheatsheets/<concept>): one printable page per built concept, cut from
 * its lesson (resources/modules/<module>/<concept>/lesson.md), never written by hand:
 *   spot it        the lesson's `signals` (front matter)
 *   invariant      `invariant` (front matter)
 *   the card       the Shape beat's `:::pattern` card (use it when, state, steps, cost)
 *   templates      the Shape beat's `:::tabs` blocks: the same code tools/check runs in Python, Java, C++ and
 *                  JavaScript against the lesson's template cases (front matter `templates`)
 *   complexity     the Shape beat's "Complexity in plain words"
 *   pitfalls       the Stretch beat's mistake museum (`kind="wrong-approach"`): each exhibit's title and its bug lines
 *   test these     the Stretch beat's edge cases (`kind="edge-case"`) by title
 *   not for        the Stretch beat's `kind="does-not-apply"` contrast
 * Rendered by the course renderer with DSA's directives, so the blocks look as they do in the lesson. One small data
 * item per concept (tag dsa-content); nothing loads every lesson at once.
 */

export type CheatsheetSummary = { id: string; module: string; code: string; moduleTitle: string; title: string; summary: string; invariant: string; signals: string[] };

export type Cheatsheet = CheatsheetSummary & {
  level: string;
  /** the :::pattern card, rendered */
  patternHtml: string;
  /** each :::tabs template, rendered (a figure with one pane per language) */
  templates: { id: string; label: string; html: string }[];
  complexityHtml: string;
  pitfalls: { title: string; html: string }[];
  edges: string[];
  notFor: { title: string; html: string }[];
  practice: { id: string; title: string; level: DsaLevel }[];
};

const CACHE = { revalidate: 604800, tags: [DSA_CONTENT_TAG] };
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Front = { title?: string; level?: string; invariant?: string; signals?: unknown[]; practice?: string[] };

/** a beat's markdown: from `::::beat[name]` to its closing `::::` */
function beat(md: string, name: string): string {
  const m = md.match(new RegExp(`^::::beat\\[${name}\\][^\\n]*\\n([\\s\\S]*?)^::::\\s*$`, "m"));
  return m ? m[1] : "";
}

/** every `:::<kind>[Title]{attrs}` … `:::` block in a piece of markdown, whole, with its title and attributes */
function blocks(md: string, kind: string): { title: string; attrs: string; body: string; whole: string }[] {
  const re = new RegExp(`^:::${kind}\\[([^\\]\\n]*)\\](\\{[^}\\n]*\\})?[^\\n]*\\n([\\s\\S]*?)^:::\\s*$`, "gm");
  return [...md.matchAll(re)].map((m) => ({ title: m[1].trim(), attrs: m[2] || "", body: m[3], whole: m[0] }));
}

/** a `### Heading` section's body (up to the next ###/## heading or the end) */
function section(md: string, heading: RegExp): string {
  const lines = md.split("\n");
  const at = lines.findIndex((l) => /^###\s/.test(l) && heading.test(l));
  if (at < 0) return "";
  const out: string[] = [];
  for (const l of lines.slice(at + 1)) {
    if (/^#{2,3}\s/.test(l) || /^::::/.test(l)) break;
    out.push(l);
  }
  return out.join("\n").trim();
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const firstFence = (md: string) => md.match(/^```[^\n]*\n[\s\S]*?^```\s*$/m)?.[0] || "";
const firstPara = (md: string) =>
  md
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith("```") && !p.startsWith(":::")) || "";

const stripStage = (html: string) =>
  html
    .replace(/<header class="sd-stage-head"[\s\S]*?<\/header>/g, "")
    .replace(/<section data-sd="stage"[^>]*>/g, "")
    .replace(/<\/section>\s*$/g, "")
    .trim();

async function build(id: string): Promise<Cheatsheet | null> {
  const concepts = await getConceptIndex();
  const c = concepts.find((x) => x.id === id);
  if (!c || c.status !== "built") return null;
  const [lessonMd, castMd, courseYml, problems] = await Promise.all([
    readDsa(`resources/modules/${c.module}/${id}/lesson.md`),
    readDsa("resources/company/cast.md"),
    readDsa("resources/course.yml"),
    getProblemIndex(),
  ]);
  if (!lessonMd) return null;
  const { data, content } = matter(lessonMd, {});
  const f = data as Front;
  const cast = Object.fromEntries((((castMd ? matter(castMd, {}).data : {}) as { cast?: { id: string; name: string; role: string }[] }).cast || []).map((x) => [x.id, { name: x.name, role: x.role }]));
  const mods = ((courseYml ? matter(`---\n${courseYml}\n---\n`, {}).data : {}) as { modules?: { id: string; code: string; title: string }[] }).modules || [];
  const mod = mods.find((m) => m.id === c.module);
  const opts: DsaRenderOpts = { cast };
  const render = async (md: string) => (md.trim() ? stripStage((await renderLesson(md, { kind: "day-content", dsa: opts })).html) : "");

  const shape = beat(content, "shape");
  const stretch = beat(content, "stretch");
  const pattern = blocks(shape, "pattern")[0];
  const tabs = blocks(shape, "tabs");
  const examples = blocks(stretch, "example");
  const kindOf = (attrs: string) => attrs.match(/kind="([^"]+)"/)?.[1] || "";
  const byId = new Map(problems.map((p) => [p.id, p]));

  return {
    id,
    module: c.module,
    code: (mod?.code || c.module.split("-")[0]).toUpperCase(),
    moduleTitle: mod?.title || c.module,
    title: f.title || c.title,
    summary: c.summary,
    level: f.level || "",
    invariant: f.invariant || "",
    signals: (f.signals || []).map(String),
    patternHtml: pattern ? await render(pattern.whole) : "",
    templates: await Promise.all(tabs.map(async (t) => ({ id: t.attrs.match(/id="([^"]+)"/)?.[1] || "", label: t.title, html: await render(t.whole) }))),
    complexityHtml: await render(section(shape, /complexity/i)),
    pitfalls: await Promise.all(
      examples
        .filter((e) => kindOf(e.attrs) === "wrong-approach")
        .map(async (e) => ({ title: cap(e.title.replace(/^Exhibit\s+\d+:\s*/i, "")), html: await render(firstFence(e.body) || firstPara(e.body)) })),
    ),
    edges: examples.filter((e) => kindOf(e.attrs) === "edge-case").map((e) => e.title),
    notFor: await Promise.all(examples.filter((e) => kindOf(e.attrs) === "does-not-apply").map(async (e) => ({ title: e.title, html: await render(firstPara(e.body)) }))),
    practice: (f.practice || []).map((p) => byId.get(p)).filter((p): p is NonNullable<typeof p> => !!p).map((p) => ({ id: p.id, title: p.title, level: p.level })),
  };
}

const cachedSheet = unstable_cache(build, ["dsa-cheatsheet-v1"], CACHE);

export async function getCheatsheet(id: string): Promise<Cheatsheet | null> {
  if (!ID.test(id)) return null;
  return dsaFresh() ? build(id) : cachedSheet(id);
}

/** Every built concept's sheet in course order, as cards (the summaries only). */
export async function listCheatsheets(): Promise<CheatsheetSummary[]> {
  const modNum = (m: string) => Number(m.match(/^m(\d+)/)?.[1] ?? 99);
  const built = (await getConceptIndex()).filter((c) => c.status === "built").sort((a, b) => modNum(a.module) - modNum(b.module) || a.order - b.order);
  const out: CheatsheetSummary[] = [];
  for (let i = 0; i < built.length; i += 4) {
    const batch = await Promise.all(built.slice(i, i + 4).map((c) => getCheatsheet(c.id).catch(() => null)));
    for (const s of batch) if (s) out.push({ id: s.id, module: s.module, code: s.code, moduleTitle: s.moduleTitle, title: s.title, summary: s.summary, invariant: s.invariant, signals: s.signals });
  }
  return out;
}

export const cheatsheetHref = (id: string) => `/dsa/cheatsheets/${id}`;
export { conceptHref };
