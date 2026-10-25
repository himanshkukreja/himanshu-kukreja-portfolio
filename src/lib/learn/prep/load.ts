import "server-only";
/**
 * Server: interview-prep companies from the content repo (resources/interview-prep/companies/*.md,
 * format and evidence rule in that folder's README), joined with the course map for article links,
 * and merged into the question bank. Cached like the course map (tag "course-map"); a missing folder or
 * a broken file means fewer companies, never an error page.
 */
import matter from "gray-matter";
import { unstable_cache } from "next/cache";
import { fetchGitHubContent, fetchMarkdownContent, isContentMissing, ContentFetchError } from "@/lib/github";
import { COURSE_ID, COURSE_MAP_TAG, getCourseMap } from "@/lib/learn/course";
import type { CourseLesson } from "@/lib/learn/types";
import {
  companyHref,
  PREP_CATEGORIES,
  questionKey,
  type ArticleLink,
  type BankQuestion,
  type Company,
  type CompanyQuestion,
  type CompanySummary,
  type PrepCategory,
  type PrepSource,
  type QuestionType,
} from "./types";

const DIR = "resources/interview-prep/companies";
const FILE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const TYPES: QuestionType[] = ["system-design", "lld", "concept"];

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const url = (v: unknown) => (/^https?:\/\/\S+$/.test(str(v)) ? str(v) : "");

function sources(v: unknown): PrepSource[] {
  return arr(v)
    .map((s) => (s && typeof s === "object" ? { label: str((s as Record<string, unknown>).label), url: url((s as Record<string, unknown>).url) } : { label: "", url: "" }))
    .filter((s) => s.url);
}

type Built = { companies: CompanySummary[]; bySlug: Record<string, Company>; bank: BankQuestion[] };

async function build(): Promise<Built> {
  let files: { name: string; path: string; type: string }[] = [];
  try {
    files = await fetchGitHubContent(DIR);
  } catch (e) {
    if (isContentMissing(e)) return { companies: [], bySlug: {}, bank: [] };
    throw e; // transient (rate limit, 5xx): never cache an empty list
  }
  const map = await getCourseMap(COURSE_ID).catch(() => null);
  const lessons = new Map<string, CourseLesson>();
  if (map) {
    for (const l of [...map.weeks.flatMap((w) => [...w.lessons, ...(w.boss ? [w.boss] : [])]), ...map.sideQuests, ...(map.problems || []), ...(map.lld || [])]) lessons.set(`${l.week}/${l.slug}`, l);
  }
  const link = (key: unknown): ArticleLink | null => {
    const l = lessons.get(str(key));
    return l ? { code: l.tag, title: l.title, href: l.href } : null;
  };

  const picked = files.filter((f) => f.type === "file" && FILE_RE.test(f.name) && f.name.toLowerCase() !== "readme.md");
  const companies = (
    await Promise.all(
      picked.map(async (f): Promise<Company | null> => {
        let raw: string;
        try {
          raw = await fetchMarkdownContent(f.path);
        } catch (e) {
          if (e instanceof ContentFetchError && !isContentMissing(e)) throw e;
          return null;
        }
        try {
          const d = matter(raw).data as Record<string, unknown>;
          const name = str(d.company);
          if (!name) return null;
          const category = (PREP_CATEGORIES as readonly string[]).includes(str(d.category)) ? (str(d.category) as PrepCategory) : "other";
          const list: CompanyQuestion[] = arr(d.questions)
            .map((x) => {
              const q = x as Record<string, unknown>;
              const type = TYPES.includes(str(q.type) as QuestionType) ? (str(q.type) as QuestionType) : "system-design";
              const src = sources(q.sources);
              // the evidence rule: "reported" needs a source; without one it can only be "likely"
              const evidence: CompanyQuestion["evidence"] = str(q.evidence) === "reported" && src.length ? "reported" : "likely";
              return { q: str(q.q), type, evidence, sources: src, links: arr(q.links).map(link).filter((l): l is ArticleLink => !!l) };
            })
            .filter((q) => q.q)
            .sort((a, b) => (a.evidence === b.evidence ? 0 : a.evidence === "reported" ? -1 : 1));
          const seen = new Set<string>();
          const path: ArticleLink[] = [];
          for (const q of list) for (const l of q.links) if (!seen.has(l.href)) (seen.add(l.href), path.push(l));
          const slug = f.name.replace(/\.md$/, "");
          return {
            slug,
            name,
            category,
            hq: str(d.hq),
            builds: str(d.builds),
            questions: list.length,
            reported: list.filter((q) => q.evidence === "reported").length,
            href: companyHref(slug),
            focus: arr(d.focus).map(str).filter(Boolean),
            rounds: arr(d.rounds)
              .map((r) => ({ name: str((r as Record<string, unknown>)?.name), note: str((r as Record<string, unknown>)?.note), source: url((r as Record<string, unknown>)?.source) }))
              .filter((r) => r.name && r.source),
            list,
            path,
          };
        } catch (e) {
          if (process.env.NODE_ENV !== "production") console.warn(`[prep] ${f.name}: ${(e as Error).message}`);
          return null;
        }
      }),
    )
  )
    .filter((c): c is Company => !!c)
    .sort((a, b) => a.name.localeCompare(b.name));

  const bank = new Map<string, BankQuestion>();
  for (const c of companies) {
    for (const q of c.list) {
      const key = `${q.type}:${questionKey(q.q)}`;
      const b = bank.get(key) ?? { key, q: q.q, type: q.type, links: [], companies: [] };
      for (const l of q.links) if (!b.links.some((x) => x.href === l.href)) b.links.push(l);
      if (!b.companies.some((x) => x.slug === c.slug)) b.companies.push({ slug: c.slug, name: c.name, evidence: q.evidence, sources: q.sources });
      bank.set(key, b);
    }
  }
  const reported = (b: BankQuestion) => b.companies.filter((c) => c.evidence === "reported").length;
  return {
    companies: companies.map(({ focus: _f, rounds: _r, list: _l, path: _p, ...s }) => (void _f, void _r, void _l, void _p, s)),
    bySlug: Object.fromEntries(companies.map((c) => [c.slug, c])),
    bank: [...bank.values()].sort((a, b) => reported(b) - reported(a) || b.companies.length - a.companies.length || a.q.localeCompare(b.q)),
  };
}

const cached = unstable_cache(() => build(), ["interview-prep-v1"], { revalidate: 3600, tags: [COURSE_MAP_TAG] });

async function data(): Promise<Built> {
  try {
    // local content (SDM_LOCAL_DIR) is read fresh in development so edits show up on reload
    return process.env.SDM_LOCAL_DIR && process.env.NODE_ENV !== "production" ? await build() : await cached();
  } catch (e) {
    console.error("[prep] failed to load", e);
    return { companies: [], bySlug: {}, bank: [] };
  }
}

export async function getCompanies(): Promise<CompanySummary[]> {
  return (await data()).companies;
}

export async function getCompany(slug: string): Promise<Company | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  return (await data()).bySlug[slug] ?? null;
}

export async function getQuestionBank(): Promise<BankQuestion[]> {
  return (await data()).bank;
}
