import "server-only";
/**
 * Server side of the low-level design section: the home's cards (site metadata + the course map's
 * real titles + the companies the prep data says ask each problem), the case-study page's walkthrough
 * extras (class explorer with highlighted code, patterns, labs) and the mount placeholders the client
 * fills. Every read is guarded: a missing piece only means a smaller card, never a failed page.
 */
import { getCourseMap, COURSE_ID } from "@/lib/learn/course";
import { getQuestionBank } from "@/lib/learn/prep/load";
import { getLabSummaries } from "@/lib/learn/labs/load";
import { highlightLines } from "@/lib/course/highlight";
import { CASES, PATTERNS, caseBySlug, patternBySlug, patternChipName, type CaseMeta } from "./meta";
import type { CaseRow } from "./filters";
import type { LldMeta } from "./types";
import { explorerClasses } from "./classes";
import { restructureLld, type LldAnalysis } from "./steps";

export type { LldMeta } from "./types";

export const LLD_AREA = "low-level-design";
export const lldHref = (slug?: string) => (slug ? `/${LLD_AREA}/${slug}` : `/${LLD_AREA}`);
export const patternHref = (slug: string) => `/${LLD_AREA}/patterns/${slug}`;

/** Companies reported to ask each problem, from the prep data (never kept by hand). */
async function companiesBySlug(): Promise<Map<string, CaseRow["companies"]>> {
  const out = new Map<string, CaseRow["companies"]>();
  const bank = await getQuestionBank().catch(() => []);
  for (const q of bank) {
    for (const l of q.links) {
      const m = l.href.match(/^\/low-level-design\/([a-z0-9-]+)$/);
      if (!m) continue;
      const list = out.get(m[1]) ?? [];
      for (const c of q.companies) if (!list.some((x) => x.slug === c.slug)) list.push({ slug: c.slug, name: c.name, reported: c.evidence === "reported" });
      out.set(m[1], list);
    }
  }
  for (const list of out.values()) list.sort((a, b) => Number(b.reported) - Number(a.reported) || a.name.localeCompare(b.name));
  return out;
}

/** The 22 cards. A lesson missing from the course map (or from CASES) is simply not listed. */
export async function getCaseRows(): Promise<CaseRow[]> {
  const [map, companies] = await Promise.all([getCourseMap(COURSE_ID).catch(() => null), companiesBySlug()]);
  const lessons = new Map((map?.lld ?? []).map((l) => [l.slug, l]));
  return CASES.filter((c) => !map || lessons.has(c.slug)).map((c) => {
    const l = lessons.get(c.slug);
    return { ...c, title: l?.title ?? `Design ${c.name}`, href: l?.href ?? lldHref(c.slug), companies: companies.get(c.slug) ?? [] };
  });
}

/** Case studies that use a pattern, for a pattern page (lesson order). */
export async function casesUsing(pattern: string): Promise<CaseRow[]> {
  return (await getCaseRows()).filter((r) => r.patterns.includes(pattern));
}

/* ------------------------------------------------------------------ the case-study page */

async function highlightHtml(code: string): Promise<string> {
  const [{ unified }, { default: rehypeStringify }] = await Promise.all([import("unified"), import("rehype-stringify")]);
  const kids = await highlightLines(code, "python");
  const root = { type: "root", children: [{ type: "element", tagName: "code", properties: {}, children: kids }] };
  return String(unified().use(rehypeStringify).stringify(root as never));
}

/** The markdown the renderer gets (seven steps), and the extras around it. */
export async function prepareLld(slug: string, markdown: string): Promise<{ markdown: string; meta: LldMeta | null; analysis: LldAnalysis }> {
  const cm = caseBySlug(slug);
  const { markdown: md, analysis } = restructureLld(markdown, { labs: !!cm?.labs.length });
  if (!cm) return { markdown: md, meta: null, analysis };
  const [rows, labSummaries] = await Promise.all([getCaseRows(), cm.labs.length ? getLabSummaries().catch(() => []) : Promise.resolve([])]);
  const row = rows.find((r) => r.slug === slug);
  const classes = await Promise.all(
    explorerClasses(markdown).map(async (c) => ({ name: c.name, stereotype: c.stereotype, members: c.members, links: c.links, codeHtml: c.code ? await highlightHtml(c.code).catch(() => null) : null })),
  );
  const at = rows.findIndex((r) => r.slug === slug);
  const nx = at >= 0 ? rows[at + 1] : undefined;
  return {
    markdown: md,
    analysis,
    meta: {
      name: cm.name,
      difficulty: cm.difficulty,
      roundMinutes: cm.roundMinutes,
      patterns: cm.patterns.flatMap((p) => {
        const pm = patternBySlug(p);
        return pm ? [{ slug: p, name: patternChipName(pm), href: patternHref(p) }] : [];
      }),
      companies: row?.companies ?? [],
      langs: analysis.langs,
      labs: cm.labs.flatMap((id) => {
        const l = labSummaries.find((x) => x.id === id);
        return l ? [{ id, title: l.title, href: l.href, minutes: l.minutes, languages: l.languages.map(String) }] : [];
      }),
      classes,
      present: analysis.present,
      missing: analysis.missing,
      next: nx ? { href: nx.href, name: nx.name } : null,
    },
  };
}

/** `<p>LLDMOUNT-x</p>` (the markers steps.ts writes) → the empty element the client fills. */
export function fillMounts(html: string): string {
  return html.replace(/<p>LLDMOUNT-([a-z-]+)<\/p>/g, (_m, id: string) => `<div data-lld-mount="${id}" data-sd-chrome></div>`);
}

export { PATTERNS };
