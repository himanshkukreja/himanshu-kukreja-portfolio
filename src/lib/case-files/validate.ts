/**
 * Case file validator: the house rules every case file follows (frontmatter, structure, `:::`
 * blocks, Mermaid, images, links, debrief, activity, site style). Errors block publishing; warnings
 * are style advice. Line numbers are 1-based in the markdown body as typed in the editor.
 * Server-only (Mermaid parse + HEAD checks for images).
 */
import "server-only";
import type { Code, Heading, Image, Link, Root } from "mdast";
import { checkActivity } from "@/components/stories/activities/data";
import { ACTIVITY_SLUGS } from "@/components/stories/activities/types";
import { readMinutes } from "@/components/stories/case-types";
import { storyWords } from "@/components/stories/case-files";
import { lintBlocks } from "./blocks-lint";
import { checkMermaid } from "./mermaid-check";
import { RESERVED_SLUGS, SLUG_RE, type CaseFileFields, type Problem, type ProblemArea, type Validation } from "./types";
import palette from "@/lib/diagrams/palette.json";

export type ValidateCtx = {
  /** this row's id (excluded from the slug-uniqueness check) */
  id?: string;
  /** slugs of other CMS rows (any status) → their id */
  cmsSlugs: Map<string, string>;
  /** slugs of repo stories (content/stories) */
  repoSlugs: Set<string>;
  /** slugs a reader can open right now (repo + published CMS) */
  liveSlugs: Set<string>;
  overridesFile: boolean;
  /** request origin, for checking local images (/case-files/…, /covers/…) */
  origin?: string;
  /** skip network checks (fast path for the live preview) */
  offline?: boolean;
};

// Emoji / pictographs (the site style is text + mono chips, never emoji). Arrows, ✓ and ◆ are fine.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}✅❌⭐⭕]/u;
const ALLOWED_PICTO = /[✓✔✗✘◆←-⇿→]/u;
const PLACEHOLDER = /\{\{[^{}\n]{1,200}\}\}/;
const TODO = /\b(TODO|TBD|FIXME|lorem ipsum)\b/i;
const ASCII_BOX = /[┌┐└┘│─═║╔╗╚╝├┤┬┴┼]/;
const MERMAID_CLASSES = new Set(Object.keys((palette as { classes: Record<string, unknown> }).classes));
const LESSONS_RE = /lessons?|takeaways?|what (we|i) learned|never again|playbook|for any engineer/i;
const SUMMARY_RE = /summary|conclusion|closing|epilogue|the end|final thoughts|wrap(ping)? up/i;
/** Top-level routes a story may link to (anything else under / is probably a typo). */
const SITE_ROUTES = ["/", "/stories", "/learn", "/play", "/projects", "/newsletter", "/privacy", "/guide", "/auth", "/covers", "/case-files", "/learn-art", "/resume.pdf", "/blueprints"];

type Pos = { start: { line: number; offset?: number }; end: { line: number; offset?: number } };
type AnyNode = { type: string; children?: AnyNode[]; position?: Pos; value?: string; depth?: number; url?: string; alt?: string | null; lang?: string | null };

function textOf(n: AnyNode): string {
  if (typeof n.value === "string" && n.type !== "html") return n.value;
  return (n.children || []).map(textOf).join("");
}

/* HEAD checks, cached for a few minutes so autosave doesn't hammer the CDN. */
const headCache = new Map<string, { at: number; status: number }>();
async function headStatus(url: string): Promise<number> {
  const hit = headCache.get(url);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.status;
  let status = 0;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 4000);
    let res = await fetch(url, { method: "HEAD", signal: ac.signal, cache: "no-store", redirect: "follow" });
    if (res.status === 405 || res.status === 403) res = await fetch(url, { method: "GET", signal: ac.signal, cache: "no-store", headers: { Range: "bytes=0-0" } });
    clearTimeout(t);
    status = res.status;
  } catch {
    status = 0;
  }
  headCache.set(url, { at: Date.now(), status });
  return status;
}

/** Style rules that only warn on imported repo stories (area:rule). */
const GRANDFATHERED = new Set(["body:emoji", "body:lessons", "body:summary", "debrief:debrief-required"]);

export async function validateCaseFile(f: CaseFileFields, ctx: ValidateCtx): Promise<Validation> {
  const problems: Problem[] = [];
  const add = (level: Problem["level"], area: ProblemArea, rule: string, message: string, extra: { field?: string; line?: number } = {}): void => {
    // Imported repo stories predate the CMS style rules (they end on their own TSX game, not a
    // debrief, and some use emoji / an older chapter shape): those rules advise, never block.
    if (level === "error" && ctx.overridesFile && GRANDFATHERED.has(`${area}:${rule}`)) {
      level = "warning";
      message = `${message} (Existing story: advisory, doesn't block publishing.)`;
    }
    problems.push({ level, area, rule, message, ...extra });
  };
  const error = (area: ProblemArea, rule: string, message: string, extra?: { field?: string; line?: number }) => add("error", area, rule, message, extra);
  const warn = (area: ProblemArea, rule: string, message: string, extra?: { field?: string; line?: number }) => add("warning", area, rule, message, extra);

  /* ───────────── details ───────────── */
  const title = f.title.trim();
  if (!title) error("details", "title-required", "Title is required.", { field: "title" });
  else {
    if (title.length < 15) error("details", "title-length", `Title is ${title.length} characters: write a real headline (15 or more).`, { field: "title" });
    if (title.length > 140) error("details", "title-length", `Title is ${title.length} characters (max 140).`, { field: "title" });
    else if (title.length > 110) warn("details", "title-length", `Title is ${title.length} characters: over 110 it wraps to 4+ lines on phones.`, { field: "title" });
    if (EMOJI.test(title)) error("details", "emoji", "No emoji in the title (site style).", { field: "title" });
  }

  const slug = f.slug.trim();
  if (!slug) error("details", "slug-required", "Slug is required.", { field: "slug" });
  else if (!SLUG_RE.test(slug)) error("details", "slug-format", "Slug: lowercase letters, numbers and single dashes only.", { field: "slug" });
  else if (slug.length < 3 || slug.length > 80) error("details", "slug-format", "Slug must be 3 to 80 characters.", { field: "slug" });
  else if (RESERVED_SLUGS.has(slug)) error("details", "slug-reserved", `"${slug}" is reserved.`, { field: "slug" });
  else {
    const other = ctx.cmsSlugs.get(slug);
    if (other && other !== ctx.id) error("details", "slug-taken", `Another case file in the CMS already uses /stories/${slug}.`, { field: "slug" });
    if (ctx.repoSlugs.has(slug) && !ctx.overridesFile) error("details", "slug-taken", `A repo story (content/stories/${slug}.md) already uses /stories/${slug}. Use "Import" on that story to edit it here.`, { field: "slug" });
  }

  const excerpt = f.excerpt.trim();
  if (!excerpt) error("details", "excerpt-required", "Excerpt is required: it is the card text, the meta description and the email teaser.", { field: "excerpt" });
  else {
    if (excerpt.length < 60) error("details", "excerpt-length", `Excerpt is ${excerpt.length} characters (min 60).`, { field: "excerpt" });
    else if (excerpt.length > 320) error("details", "excerpt-length", `Excerpt is ${excerpt.length} characters (max 320).`, { field: "excerpt" });
    else if (excerpt.length < 100 || excerpt.length > 260) warn("details", "excerpt-length", `Excerpt is ${excerpt.length} characters; the existing case files use 100 to 260.`, { field: "excerpt" });
    if (EMOJI.test(excerpt)) error("details", "emoji", "No emoji in the excerpt (site style).", { field: "excerpt" });
    if (/\*\*|__|\[[^\]]+\]\(|`/.test(excerpt)) warn("details", "excerpt-markdown", "The excerpt is plain text: markdown isn't rendered on cards or in emails.", { field: "excerpt" });
  }

  if (!["incident", "design", "build"].includes(f.type)) error("details", "type", "Pick a type: incident, system design or build log.", { field: "type" });

  const tags = f.tags.map((t) => t.trim()).filter(Boolean);
  if (tags.length < 2) error("details", "tags", "Add at least 2 tags (the existing case files have 5 to 10).", { field: "tags" });
  else if (tags.length > 12) warn("details", "tags", `${tags.length} tags: keep it to 10 or fewer.`, { field: "tags" });
  if (new Set(tags.map((t) => t.toLowerCase())).size !== tags.length) warn("details", "tags", "Duplicate tags.", { field: "tags" });
  if (tags.some((t) => t.length > 40)) warn("details", "tags", "A tag is longer than 40 characters.", { field: "tags" });
  if (tags.some((t) => EMOJI.test(t))) error("details", "emoji", "No emoji in tags.", { field: "tags" });

  if (!f.date) error("details", "date", "Date is required (the case file's opened date).", { field: "date" });
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date) || Number.isNaN(new Date(f.date).getTime())) error("details", "date", "Date must be YYYY-MM-DD.", { field: "date" });
  else if (new Date(f.date).getTime() > Date.now() + 2 * 86400_000) warn("details", "date", "The date is in the future.", { field: "date" });

  if (!f.coverUrl.trim()) error("details", "cover-required", "Upload a cover (1536×1024 blueprint, like the other case files).", { field: "coverUrl" });
  if (f.coverUrl.trim() && !f.coverAlt.trim()) error("details", "cover-alt", "The cover needs alt text: describe what the blueprint shows.", { field: "coverAlt" });
  else if (f.coverAlt.trim() && f.coverAlt.trim().length < 20) warn("details", "cover-alt", "Cover alt text is very short: describe the picture, not just the title.", { field: "coverAlt" });
  if (f.motionCoverUrl.trim() && !/\.svg(\?|$)/i.test(f.motionCoverUrl)) warn("details", "motion-cover", "The motion cover should be a transparent animated SVG on the same 1536×1024 canvas.", { field: "motionCoverUrl" });
  if (f.motionCoverUrl.trim() && !f.coverUrl.trim()) error("details", "motion-cover", "A motion cover only plays over a static cover: upload the cover too.", { field: "motionCoverUrl" });

  /* ───────────── seo ───────────── */
  if (f.seoTitle.trim().length > 70) warn("seo", "seo-title", `SEO title is ${f.seoTitle.trim().length} characters: search results cut it near 60–70.`, { field: "seoTitle" });
  const metaDesc = f.seoDescription.trim();
  if (metaDesc && (metaDesc.length < 50 || metaDesc.length > 170)) warn("seo", "seo-description", `SEO description is ${metaDesc.length} characters: aim for 50 to 160.`, { field: "seoDescription" });
  if (!metaDesc && excerpt.length > 170) warn("seo", "seo-description", "No SEO description and the excerpt is over 170 characters: search results will cut it. Add a shorter one.", { field: "seoDescription" });

  /* ───────────── body ───────────── */
  const body = f.bodyMd.replace(/\r\n/g, "\n");
  const stats = { words: storyWords(body), minutes: readMinutes(storyWords(body)), chapters: 0, diagrams: 0, blocks: 0, images: 0 };
  const urlChecks: { url: string; line: number; kind: "image" | "cover" | "motion" }[] = [];
  if (f.coverUrl.trim()) urlChecks.push({ url: f.coverUrl.trim(), line: 0, kind: "cover" });
  if (f.motionCoverUrl.trim()) urlChecks.push({ url: f.motionCoverUrl.trim(), line: 0, kind: "motion" });

  if (!body.trim()) error("body", "body-required", "The story is empty. Start from the template.");
  else {
    const { unified } = await import("unified");
    const remarkParse = (await import("remark-parse")).default;
    const remarkGfm = (await import("remark-gfm")).default;
    const remarkDirective = (await import("remark-directive")).default;
    const { visit } = await import("unist-util-visit");
    const tree = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).parse(body) as Root;

    // ranges that are code (fenced + inline): text rules skip them
    const codeRanges: [number, number][] = [];
    visit(tree as never, (n: unknown) => {
      const node = n as AnyNode;
      if ((node.type === "code" || node.type === "inlineCode") && node.position?.start.offset != null && node.position.end.offset != null) codeRanges.push([node.position.start.offset, node.position.end.offset]);
    });
    const inCode = (off: number) => codeRanges.some(([a, b]) => off >= a && off < b);
    const lineAt = (off: number) => body.slice(0, off).split("\n").length;
    const commentRanges: [number, number][] = [];
    for (const m of body.matchAll(/<!--[\s\S]*?-->/g)) commentRanges.push([m.index!, m.index! + m[0].length]);
    const inComment = (off: number) => commentRanges.some(([a, b]) => off >= a && off < b);

    // text scans: placeholders, TODOs, emoji
    /** one report per line: `onHit` returns true when it reported something */
    const scan = (re: RegExp, onHit: (line: number, hit: string, code: boolean) => boolean) => {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      const seen = new Set<number>();
      for (const m of body.matchAll(g)) {
        if (inComment(m.index!)) continue;
        const line = lineAt(m.index!);
        if (seen.has(line)) continue;
        if (onHit(line, m[0], inCode(m.index!))) seen.add(line);
      }
    };
    scan(PLACEHOLDER, (line, hit, code) => {
      if (code) return false;
      error("body", "placeholder", `Template placeholder left in: ${hit.slice(0, 60)}`, { line });
      return true;
    });
    scan(TODO, (line, hit, code) => {
      if (code) return false;
      error("body", "todo", `"${hit}" left in the text.`, { line });
      return true;
    });
    scan(EMOJI, (line, hit, code) => {
      if (ALLOWED_PICTO.test(hit) || hit === "\uFE0F") return false;
      if (code) warn("body", "emoji", "Emoji inside a code block: fine in real logs, but the site style avoids it.", { line });
      else error("body", "emoji", `No emoji in case files (site style): "${hit}". Use words or a :::callout.`, { line });
      return true;
    });

    // structure
    const top = tree.children as unknown as AnyNode[];
    const headings: { depth: number; text: string; line: number }[] = [];
    visit(tree as never, "heading", (n: unknown) => {
      const h = n as Heading & AnyNode;
      headings.push({ depth: h.depth, text: textOf(h).trim(), line: h.position?.start.line ?? 1 });
    });
    const h1 = headings.filter((h) => h.depth === 1);
    // `# comment` lines inside code are not headings (mdast already excludes them)
    h1.forEach((h) => error("body", "no-h1", "No # headings: the title comes from the Title field. Chapters are ## headings.", { line: h.line }));
    // "text\n---" is a setext heading, not text + divider: it becomes a chapter by accident
    visit(tree as never, "heading", (n: unknown) => {
      const h = n as Heading & AnyNode;
      const endLine = h.position?.end.line ?? 0;
      const startLine = h.position?.start.line ?? 0;
      if (endLine > startLine && /^\s*(-{2,}|={2,})\s*$/.test(body.split("\n")[endLine - 1] || "")) error("body", "setext-heading", "A --- (or ===) line right under text turns that text into a heading. Leave a blank line before the divider.", { line: startLine });
    });
    const h2 = headings.filter((h) => h.depth === 2);
    stats.chapters = h2.length;
    const firstReal = top.find((n) => n.type !== "html" && n.type !== "thematicBreak");
    if (firstReal && !(firstReal.type === "heading" && firstReal.depth === 2)) error("body", "opening", "Open with the first chapter heading (## Understanding the Problem: …): text before it has no checkpoint.", { line: firstReal.position?.start.line });
    if (h2.length < 4) error("body", "chapters", `${h2.length} chapter${h2.length === 1 ? "" : "s"} (## headings): a case file has at least 4 (hook, the problem, the fix, lessons, summary).`, { line: h2[0]?.line });
    else if (h2.length > 16) warn("body", "chapters", `${h2.length} chapters: every ## is a checkpoint; over 16 the rail gets long.`);
    if (h2.length && !h2.some((h) => LESSONS_RE.test(h.text))) error("body", "lessons", 'Missing the lessons chapter (e.g. "## Lessons for Any Engineer").');
    // a trailing "## Sources" / "## References" chapter may follow the summary
    const closing = [...h2].reverse().find((h) => !/^(sources|references|further reading|notes and sources)\b/i.test(h.text));
    if (closing && !SUMMARY_RE.test(closing.text) && !LESSONS_RE.test(closing.text))
      error("body", "summary", 'End on the summary or the lessons chapter (e.g. "## Summary: …"), optionally followed by "## Sources".', { line: closing.line });
    else if (closing && !SUMMARY_RE.test(closing.text)) warn("body", "summary", 'No closing summary: the repo case files end on "## Summary: …" that comes back to the opening scene.', { line: closing.line });
    const seenH2 = new Set<string>();
    h2.forEach((h) => {
      const k = h.text.toLowerCase();
      if (seenH2.has(k)) warn("body", "chapter-dup", `Two chapters are called "${h.text}".`, { line: h.line });
      seenH2.add(k);
      if (h.text.length > 90) warn("body", "chapter-long", "Chapter heading over 90 characters: it is also the checkpoint label.", { line: h.line });
      if (!h.text) error("body", "chapter-empty", "Empty chapter heading.", { line: h.line });
    });
    for (let i = 1; i < headings.length; i++) {
      if (headings[i].depth > headings[i - 1].depth + 1 && headings[i].depth > 2) warn("body", "heading-skip", `Heading jumps from ${"#".repeat(headings[i - 1].depth)} to ${"#".repeat(headings[i].depth)}.`, { line: headings[i].line });
    }
    // chapter length
    for (let i = 0; i < h2.length; i++) {
      const from = h2[i].line;
      const to = i + 1 < h2.length ? h2[i + 1].line : body.split("\n").length + 1;
      const words = storyWords(body.split("\n").slice(from, to - 1).join("\n"));
      if (words < 40) warn("body", "chapter-short", `Chapter "${h2[i].text.slice(0, 50)}" has ${words} words: too thin to be a checkpoint.`, { line: from });
    }

    // paragraphs
    visit(tree as never, "paragraph", (n: unknown, _i: unknown, parent: unknown) => {
      const p = n as AnyNode;
      if ((parent as AnyNode | undefined)?.type === "listItem") return;
      const words = textOf(p).split(/\s+/).filter(Boolean).length;
      if (words > 130) warn("body", "long-paragraph", `Paragraph of ${words} words: split it (the case files keep paragraphs under ~120 words).`, { line: p.position?.start.line });
    });

    // raw html (only comments are allowed: image prompts, guidance)
    visit(tree as never, "html", (n: unknown) => {
      const h = n as AnyNode;
      const v = (h.value || "").trim();
      if (v && !/^<!--[\s\S]*-->$/.test(v)) warn("body", "raw-html", "Raw HTML is dropped by the renderer: use markdown or a ::: block.", { line: h.position?.start.line });
    });

    // ::: blocks
    const lint = lintBlocks(tree, body);
    stats.blocks = lint.blocks;
    lint.issues.forEach((x) => error("body", "blocks", x.message, { line: x.line }));

    // code + mermaid
    const mermaid: { src: string; line: number }[] = [];
    visit(tree as never, "code", (n: unknown) => {
      const c = n as Code & AnyNode;
      const line = c.position?.start.line ?? 1;
      const lang = (c.lang || "").toLowerCase();
      if (lang === "mermaid") {
        mermaid.push({ src: c.value, line });
        return;
      }
      if (!lang && c.value.split("\n").filter((l) => ASCII_BOX.test(l)).length >= 2) warn("body", "ascii-art", "ASCII box drawing: use a ::: block (panel, compare, steps, tree…) or a Mermaid diagram.", { line });
      if (!lang && c.value.trim()) warn("body", "code-lang", "Code block without a language: add one (```python, ```bash, ```text…) for highlighting.", { line });
    });
    stats.diagrams = mermaid.length;
    for (const d of mermaid) {
      const lines = d.src.split("\n");
      const header = lines.find((l) => l.trim() && !l.trim().startsWith("%%"))?.trim() || "";
      if (!d.src.trim()) {
        error("body", "mermaid-empty", "Empty Mermaid block.", { line: d.line });
        continue;
      }
      if (/"\{\{[^"\n]*\}\}"|title:\s*\{\{/.test(d.src)) error("body", "placeholder", "Template placeholder left in a diagram: replace the {{…}} labels.", { line: d.line });
      if (!/^%%\s*title:/m.test(d.src)) warn("body", "mermaid-title", "Start the diagram with `%% title: …`: it becomes the caption.", { line: d.line });
      if (/^\s*(classDef|style)\s/m.test(d.src) || /fill:\s*#/i.test(d.src)) warn("body", "mermaid-colours", "Don't set colours in diagrams: name a semantic class (:::core, :::store, :::bad…) and the site colours it for light and dark.", { line: d.line });
      for (const m of d.src.matchAll(/:::([A-Za-z][\w-]*)/g)) {
        if (!MERMAID_CLASSES.has(m[1])) {
          warn("body", "mermaid-class", `Unknown diagram class :::${m[1]} (use ${[...MERMAID_CLASSES].join(", ")}).`, { line: d.line });
          break;
        }
      }
      if (/^(flowchart|graph)\s+LR\b/.test(header)) {
        const nodes = new Set([...d.src.matchAll(/^\s*([A-Za-z][\w]*)\s*[[({]/gm)].map((m) => m[1]));
        if (nodes.size > 5) warn("body", "mermaid-direction", `flowchart LR with ${nodes.size} nodes: use TD so it fits a phone.`, { line: d.line });
      }
      const res = await checkMermaid(d.src);
      if (!res.ok) {
        if (res.unverified) warn("body", "mermaid-unverified", res.message, { line: d.line });
        else error("body", "mermaid-parse", `Mermaid: ${res.message}`, { line: res.line ? d.line + res.line : d.line });
      }
    }

    // images
    visit(tree as never, "image", (n: unknown) => {
      const img = n as Image & AnyNode;
      stats.images++;
      const line = img.position?.start.line ?? 1;
      if (!(img.alt || "").trim()) error("body", "image-alt", "Image without alt text: describe what it shows (it is also the caption).", { line });
      if (img.url) urlChecks.push({ url: img.url, line, kind: "image" });
    });
    if (!stats.diagrams && !stats.images) warn("body", "no-diagrams", "No diagrams or images: every case file has blueprints. Add a ```mermaid diagram.");
    else if (!stats.diagrams) warn("body", "no-mermaid", "No Mermaid diagrams: the architecture / flow should be a diagram readers can zoom.");
    const hasNumbers = /^:::(stats|calc|timeline)\b/m.test(body) || /^\|.*\|\s*$/m.test(body);
    if (!hasNumbers) warn("body", "numbers", "No numbers sheet: add the key figures as :::stats, :::calc or a table.");
    const hasSources = /^:::panel\[Sources\]/im.test(body) || /^#{2,4}\s+(sources|references|further reading)/im.test(body);
    if (!hasSources) warn("body", "sources", "No sources: add a :::panel[Sources] with links at the end of the summary.");
    if (stats.words < 900) warn("body", "length", `${stats.words} words (~${stats.minutes} min): the shortest case file is ~2,300 words.`);

    // links
    const ids = new Set<string>();
    {
      const { renderStoryBody } = await import("@/components/stories/render-story");
      const r = await renderStoryBody(body).catch(() => null);
      r?.toc.forEach((t) => ids.add(t.id));
      if (r) for (const m of r.htmlContent.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
    }
    visit(tree as never, "link", (n: unknown) => {
      const l = n as Link & AnyNode;
      const line = l.position?.start.line ?? 1;
      const url = (l.url || "").trim();
      if (!url) {
        error("body", "link-empty", "Link without a URL.", { line });
        return;
      }
      if (!textOf(l).trim()) warn("body", "link-text", "Link without text.", { line });
      if (url.startsWith("#")) {
        if (!ids.has(decodeURIComponent(url.slice(1)))) error("body", "link-anchor", `Broken anchor ${url}: no heading has that id.`, { line });
        return;
      }
      if (/^http:\/\//i.test(url)) warn("body", "link-http", "Insecure http:// link: use https://.", { line });
      if (/^https?:\/\/(www\.)?himanshukukreja\.in(\/|$)/i.test(url)) warn("body", "link-absolute", "Link to this site with a relative path (/stories/…) so it works on previews too.", { line });
      if (url.startsWith("/")) {
        const path = url.split(/[?#]/)[0].replace(/\/$/, "") || "/";
        const story = /^\/stories\/([^/]+)$/.exec(path);
        if (story) {
          if (!ctx.liveSlugs.has(story[1]) && story[1] !== slug) error("body", "link-story", `Broken link: /stories/${story[1]} isn't a published case file.`, { line });
          return;
        }
        if (!SITE_ROUTES.some((r) => (r === "/" ? path === "/" : path === r || path.startsWith(r + "/")))) warn("body", "link-route", `Unknown site path ${path}: check the link.`, { line });
        if (/^\/(covers|case-files|learn-art|blueprints)\//.test(path) || /\.(png|jpe?g|webp|svg|gif|pdf)$/i.test(path)) urlChecks.push({ url, line, kind: "image" });
      }
    });
  }

  /* ───────────── network: images / cover reachable ───────────── */
  if (!ctx.offline && urlChecks.length) {
    const list = urlChecks.slice(0, 40);
    let k = 0;
    const worker = async () => {
      while (k < list.length) {
        const c = list[k++];
        const abs = /^https?:\/\//i.test(c.url) ? c.url : ctx.origin && c.url.startsWith("/") ? `${ctx.origin}${c.url}` : null;
        if (!abs) continue;
        const status = await headStatus(abs);
        const where = c.kind === "cover" ? { field: "coverUrl" } : c.kind === "motion" ? { field: "motionCoverUrl" } : { line: c.line };
        const area: ProblemArea = c.kind === "image" ? "body" : "details";
        if (status === 404 || status === 410) error(area, "broken-image", `${c.kind === "cover" ? "Cover" : c.kind === "motion" ? "Motion cover" : "Image"} not found (404): ${c.url}`, where);
        else if (status === 0) warn(area, "image-unreachable", `Couldn't reach ${c.url} to check it.`, where);
        else if (status >= 400) warn(area, "image-status", `${c.url} answered HTTP ${status}.`, where);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  /* ───────────── debrief ───────────── */
  const d = f.debrief;
  if (!d || (!d.question?.trim() && !(d.options || []).some((o) => o.trim()))) error("debrief", "debrief-required", "Add the debrief: one question with 3–4 options that closes the case (+50 XP).");
  else {
    if (!d.question.trim()) error("debrief", "debrief-question", "Debrief question is empty.", { field: "debrief.question" });
    const opts = d.options || [];
    if (opts.length < 2 || opts.some((o) => !o.trim())) error("debrief", "debrief-options", "Every debrief option needs text (2 to 4 options).", { field: "debrief.options" });
    if (opts.length > 4) error("debrief", "debrief-options", "At most 4 debrief options.", { field: "debrief.options" });
    if (opts.length === 2) warn("debrief", "debrief-options", "Two options is a coin flip: add one or two plausible wrong answers.", { field: "debrief.options" });
    if (!(Number.isInteger(d.answer) && d.answer >= 0 && d.answer < opts.length)) error("debrief", "debrief-answer", "Mark the right debrief answer.", { field: "debrief.answer" });
    if (!d.explain?.trim()) error("debrief", "debrief-explain", "Explain the right answer (readers see it after they pick).", { field: "debrief.explain" });
    if ([d.question, ...opts, d.explain || ""].some((t) => EMOJI.test(t))) error("debrief", "emoji", "No emoji in the debrief.");
  }

  /* ───────────── activity ───────────── */
  const repoActivity = ctx.overridesFile && (ACTIVITY_SLUGS as readonly string[]).includes(slug);
  if (!f.activity || !f.activity.steps.length) {
    if (!repoActivity) warn("activity", "activity-missing", "No end-of-file activity: every repo case file ends with one (+25 XP when solved).");
  } else
    checkActivity(f.activity).forEach((x) => add(x.level, "activity", "activity", x.message, x.step ? { field: `step-${x.step}` } : {}));

  const errors = problems.filter((p) => p.level === "error").length;
  problems.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1) || AREA_ORDER.indexOf(a.area) - AREA_ORDER.indexOf(b.area) || (a.line ?? 0) - (b.line ?? 0));
  return { ok: errors === 0, errors, warnings: problems.length - errors, problems, stats, at: new Date().toISOString() };
}

const AREA_ORDER: ProblemArea[] = ["details", "body", "debrief", "activity", "seo"];
