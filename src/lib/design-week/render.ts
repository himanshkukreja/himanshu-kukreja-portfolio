import "server-only";
/**
 * Submissions and briefs through the course renderer (same markup, CSS and Mermaid figures as the
 * lessons), after ./sanitize.ts. Output is a fragment without the lesson stage chrome; external
 * links open in a new tab with rel="nofollow ugc noopener noreferrer".
 */
import { renderLesson } from "@/lib/course/render";
import { sanitizeDesignMarkdown, SANITIZE_VERSION } from "./sanitize";

export type RenderedDesign = { html: string; warnings: string[]; diagrams: number };

const cache = new Map<string, RenderedDesign>();
const CACHE_MAX = 300;

function fragment(html: string): string {
  return html
    .replace(/<header class="sd-stage-head"[\s\S]*?<\/header>/g, "")
    .replace(/<section data-sd="stage"[^>]*>/g, "")
    .replace(/<\/section>/g, "");
}

function externalLinks(html: string): string {
  return html.replace(/<a ((?:(?!>)[\s\S])*?)href="(https?:\/\/[^"]*)"([^>]*)>/g, (_m, pre: string, href: string, post: string) => {
    const rest = `${pre}${post}`.replace(/\s*(?:target|rel)="[^"]*"/g, "").trim();
    return `<a ${rest ? `${rest} ` : ""}href="${href}" target="_blank" rel="nofollow ugc noopener noreferrer">`;
  });
}

/** `key` (e.g. submission id + updated_at) memoises the render on this instance. */
export async function renderDesign(md: string, key?: string): Promise<RenderedDesign> {
  const k = key ? `${SANITIZE_VERSION}:${key}` : null;
  if (k && cache.has(k)) return cache.get(k)!;
  const s = sanitizeDesignMarkdown(md);
  let html = "";
  if (s.md.trim()) {
    try {
      const r = await renderLesson(s.md, { kind: "day-content" });
      html = externalLinks(fragment(r.html));
    } catch (e) {
      console.error("[design-week] render failed", e instanceof Error ? e.message : e);
      html = `<p>${s.md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 2000)}</p>`;
    }
  }
  const out: RenderedDesign = { html, warnings: s.warnings, diagrams: s.report.mermaid - s.report.mermaidDropped };
  if (k) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(k, out);
  }
  return out;
}
