/**
 * ProblemSummary to the compact rows the problems page filters on the client (src/lib/dsa/problem-filters.ts).
 * Pure: the page passes in what the server knows (step labels, concept order, the published solution videos).
 */
import { classicLabel } from "./classics";
import type { FilterRow, Kind } from "./problem-filters";
import { facetsOf, FACETS } from "./taxonomy";
import { stepOf, stepRank, type StepLabels } from "./steps";
import { writtenLessonPaths } from "./lesson-stops";
import type { ProblemSummary } from "./types";

// the company-type tags drifted while the problems were written; one name for each family
const COMPANY_ALIAS: Record<string, string> = {
  "cloud-infrastructure": "infrastructure",
  "infra-platform": "infrastructure",
  "saas-infrastructure": "infrastructure",
  "cloud-storage": "infrastructure",
  "devtools-infra": "developer-tools",
  "saas-b2b": "saas",
  "ride-hailing": "mobility-delivery",
  "social-network": "social-media",
  "team-chat": "social-messaging",
};
const COMPANY_LABEL: Record<string, string> = {
  "big-tech-product": "Big tech product",
  "e-commerce": "E-commerce",
  fintech: "Fintech",
  "mobility-delivery": "Mobility and delivery",
  "media-streaming": "Media and streaming",
  saas: "SaaS",
  infrastructure: "Infrastructure and cloud",
  "developer-tools": "Developer tools",
  logistics: "Logistics",
  "social-media": "Social media",
  "social-messaging": "Social and messaging",
};
export const companyId = (t: string) => COMPANY_ALIAS[t] || t;
export const companyLabel = (id: string) => COMPANY_LABEL[id] || id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

export type Option = { id: string; label: string; hint?: string };

export type ProblemData = {
  rows: FilterRow[];
  /** options that depend on the data: the course's steps, company types */
  steps: Option[];
  companies: Option[];
  /** concept id to its lesson title */
  concepts: Record<string, string>;
  /** concept id to its page, for lessons that are written; a planned lesson has no entry (no link, never a 404) */
  lessons: Record<string, string>;
  /** pattern tags the taxonomy does not know (reported in the build log, never an error) */
  unknown: string[];
};

export function buildProblemData(
  problems: ProblemSummary[],
  opts: { labels: StepLabels; concepts: { id: string; title: string; order: number; kind?: string; status?: string }[]; videos: Iterable<string> },
): ProblemData {
  const videos = new Set(opts.videos);
  const conceptOrder = new Map(opts.concepts.map((c) => [c.id, c.order]));
  const unknown = new Set<string>();
  const companies = new Set<string>();
  const modules = new Set<string>();
  const rows: FilterRow[] = problems.map((p) => {
    const f = facetsOf({ patterns: p.patterns, module: p.module, structures: p.own?.structures, algorithms: p.own?.algorithms });
    f.unknown.forEach((u) => unknown.add(u));
    const co = [...new Set((p.companyTypes || []).map(companyId))];
    co.forEach((c) => companies.add(c));
    modules.add(p.module);
    const kind: Kind = p.role === "checkpoint" || p.role === "warm-up" || p.role === "district" ? p.role : "practice";
    const label = (k: keyof typeof FACETS) => f[k].map((id) => FACETS[k].find((x) => x.id === id)?.label || id);
    const text = [
      p.title,
      p.blurb || "",
      ...label("structures"),
      ...label("algorithms"),
      ...label("patterns"),
      ...p.patterns.map((t) => t.replace(/-/g, " ")),
      ...p.classic.map((c) => `${c.toLowerCase()} ${classicLabel(c).split(" · ")[1] || ""}`),
    ]
      .join(" ")
      .toLowerCase()
      .replace(/\s+/g, " ");
    return {
      id: p.id,
      title: p.title,
      seq: stepRank(opts.labels, p.module) * 1000 + (conceptOrder.get(p.concept) ?? 0),
      order: p.order,
      concept: p.concept,
      module: p.module,
      level: p.level,
      rating: p.rating ?? null,
      minutes: p.minutes,
      kind,
      structures: f.structures,
      algorithms: f.algorithms,
      patterns: f.patterns,
      companies: co,
      video: videos.has(p.id),
      twin: p.classic.length ? classicLabel(p.classic[0]).split(" · ")[0] : "",
      tags: p.patterns,
      text,
    };
  });
  const steps = [...modules]
    .sort((a, b) => stepRank(opts.labels, a) - stepRank(opts.labels, b) || a.localeCompare(b))
    .map((m) => {
      const s = stepOf(opts.labels, m);
      return { id: m, label: s.label, hint: s.building || undefined };
    });
  return {
    rows,
    steps,
    companies: [...companies].sort().map((id) => ({ id, label: companyLabel(id) })),
    concepts: Object.fromEntries(opts.concepts.map((c) => [c.id, c.title])),
    lessons: writtenLessonPaths(opts.concepts),
    unknown: [...unknown].sort(),
  };
}
