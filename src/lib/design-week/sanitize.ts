/**
 * Learner markdown → markdown the course renderer can be trusted with. Runs before every render of
 * a submission (and the challenge brief), so rule changes apply to old submissions too.
 *
 * The course renderer (src/lib/course/render.ts) builds HTML through hast, so text and attribute
 * values are always escaped and raw HTML blocks are dropped. What it does NOT guard against,
 * because course content is trusted, is handled here by editing the source at the offending
 * node's offsets (no re-serialisation, so everything else stays byte-for-byte):
 *   - raw HTML (block and inline)                    → removed
 *   - images (inline, reference)                     → "(image not shown: alt)" text. Images by URL
 *     are disabled: an external image is a tracking pixel for every reader, can be swapped after
 *     moderation, and diagrams belong in Mermaid (text, theme-aware, reviewable).
 *   - links / definitions with non-http(s)/mailto/relative URLs (javascript:, data:, vbscript:…)
 *                                                    → their text
 *   - h1 headings                                    → h2 (the page owns the h1; h1s would split
 *     the design into lesson "stages")
 *   - ```quiz and other non-language fence tags     → plain code (no XP widgets in submissions)
 *   - ```mermaid: at most LIMITS.mermaidMax diagrams of LIMITS.mermaidCharsMax chars; `%%{init}%%`
 *     and front-matter config stripped (they can restyle the page), extra/oversized ones → code.
 *     Mermaid itself renders with securityLevel "strict" (labels escaped, click handlers off).
 *   - `:::` blocks: layout ones stay (panel, compare, callout, stats, timeline, steps, tree); the
 *     interactive/lesson-only ones (checkpoint, answer, calc, mission) become panels; `::anim` → text.
 * Pure apart from the unified/remark packages, so it is unit-tested under node --test.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import { visit, SKIP } from "unist-util-visit";

export const SANITIZE_VERSION = 1;

const MERMAID_MAX = 8;
const MERMAID_CHARS = 8_000;
const BODY_MAX = 40_000;
const SAFE_BLOCKS = new Set(["panel", "compare", "col", "steps", "tree", "callout", "stats", "timeline"]);
const LANG_RE = /^[a-z0-9][a-z0-9+#._-]{0,23}$/i;
const SPECIAL_LANGS = new Set(["quiz"]);

type Pos = { start?: { offset?: number }; end?: { offset?: number } };
type Node = { type: string; value?: string; url?: string; alt?: string | null; lang?: string | null; meta?: string | null; name?: string; depth?: number; children?: Node[]; position?: Pos };
type Edit = { start: number; end: number; text: string };

export type SanitizeReport = { images: number; html: number; links: number; mermaid: number; mermaidDropped: number; blocks: number };
export type Sanitized = { md: string; report: SanitizeReport; warnings: string[] };

export function safeUrl(raw: string | null | undefined): boolean {
  const u = (raw || "").trim();
  if (!u) return false;
  if (/^(https?:\/\/|mailto:)/i.test(u)) return true;
  if (u.startsWith("//")) return false;
  return /^[/#]/.test(u);
}

/** Escape text so it reads as plain text when re-parsed as markdown. */
export function escapeMd(s: string): string {
  return s.replace(/[\\`*_{}[\]()#+!|<>~:-]/g, (c) => `\\${c}`).replace(/\n+/g, " ");
}

function textOf(n: Node): string {
  if (typeof n.value === "string" && n.type !== "html") return n.value;
  if (n.type === "image") return n.alt || "";
  return (n.children || []).map(textOf).join("");
}

const span = (n: Node): [number, number] | null => {
  const s = n.position?.start?.offset;
  const e = n.position?.end?.offset;
  return typeof s === "number" && typeof e === "number" && e >= s ? [s, e] : null;
};

function fence(lang: string, value: string): string {
  const longest = Math.max(2, ...(value.match(/`+/g) || []).map((x) => x.length));
  const f = "`".repeat(longest + 1);
  return `${f}${lang}\n${value}\n${f}`;
}

function cleanMermaid(src: string): string {
  return src
    .replace(/^\s*---\n[\s\S]*?\n---[ \t]*\n/, "")
    .replace(/%%\{[\s\S]*?\}%%/g, "")
    .replace(/^\s*\n/, "");
}

export function sanitizeDesignMarkdown(input: string): Sanitized {
  const md = String(input ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, BODY_MAX);
  const report: SanitizeReport = { images: 0, html: 0, links: 0, mermaid: 0, mermaidDropped: 0, blocks: 0 };
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).parse(md) as unknown as Node;
  const edits: Edit[] = [];
  const add = (n: Node, text: string) => {
    const sp = span(n);
    if (sp) edits.push({ start: sp[0], end: sp[1], text });
  };

  visit(tree as never, (raw: unknown) => {
    const n = raw as Node;
    switch (n.type) {
      case "html":
        report.html++;
        add(n, "");
        return SKIP;
      case "image":
      case "imageReference": {
        report.images++;
        const alt = (n.alt || "").trim();
        add(n, alt ? `(image not shown: ${escapeMd(alt)})` : "(image not shown)");
        return SKIP;
      }
      case "link":
        if (!safeUrl(n.url)) {
          report.links++;
          add(n, escapeMd(textOf(n)));
          return SKIP;
        }
        return;
      case "definition":
        if (!safeUrl(n.url)) {
          report.links++;
          add(n, "");
        }
        return SKIP;
      case "heading":
        if (n.depth === 1) {
          const sp = span(n);
          const src = sp ? md.slice(sp[0], sp[1]) : "";
          // ATX "# x" → "## x" keeps inline formatting; setext (x\n===) → "## x" as text
          if (/^ {0,3}#(?!#)/.test(src)) edits.push({ start: sp![0] + src.indexOf("#"), end: sp![0] + src.indexOf("#"), text: "#" });
          else add(n, `## ${escapeMd(textOf(n))}`);
        }
        return;
      case "code": {
        const lang = (n.lang || "").trim();
        const low = lang.toLowerCase();
        if (low === "mermaid") {
          report.mermaid++;
          const value = n.value || "";
          if (report.mermaid > MERMAID_MAX || value.length > MERMAID_CHARS) {
            report.mermaidDropped++;
            add(n, fence("text", value));
          } else {
            const cleaned = cleanMermaid(value);
            if (cleaned !== value) add(n, fence("mermaid", cleaned));
          }
          return SKIP;
        }
        if (lang && (SPECIAL_LANGS.has(low) || !LANG_RE.test(lang))) add(n, fence("text", n.value || ""));
        return SKIP;
      }
      case "containerDirective": {
        const name = n.name || "";
        if (!SAFE_BLOCKS.has(name)) {
          const sp = span(n);
          if (sp) {
            const m = md.slice(sp[0]).match(/^(:{3,})([A-Za-z][\w-]*)/);
            if (m) {
              report.blocks++;
              edits.push({ start: sp[0] + m[1].length, end: sp[0] + m[1].length + m[2].length, text: "panel" });
            }
          }
        }
        return;
      }
      case "leafDirective":
        if (n.name === "anim") {
          const sp = span(n);
          if (sp) add(n, escapeMd(md.slice(sp[0], sp[1])));
          return SKIP;
        }
        return;
      default:
        return;
    }
  });

  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = md;
  let floor = Infinity;
  for (const e of edits) {
    if (e.end > floor) continue; // overlapping (shouldn't happen with SKIP): keep the outer edit
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    floor = e.start;
  }

  const warnings: string[] = [];
  if (report.images) warnings.push(`${report.images} image${report.images === 1 ? "" : "s"} not shown: images by URL are off. Draw it as a Mermaid diagram.`);
  if (report.html) warnings.push("Raw HTML was left out. Use markdown.");
  if (report.links) warnings.push("A link with an unsupported address was turned into text (use https:// links).");
  if (report.mermaidDropped) warnings.push(`Only ${MERMAID_MAX} Mermaid diagrams of up to ${MERMAID_CHARS.toLocaleString("en-US")} characters render; the rest show as code.`);
  if (input.length > BODY_MAX) warnings.push(`Only the first ${BODY_MAX.toLocaleString("en-US")} characters are shown.`);
  return { md: out, report, warnings };
}
