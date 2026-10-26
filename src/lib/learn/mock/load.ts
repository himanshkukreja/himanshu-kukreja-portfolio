/**
 * Server: mock interview files → MockInterview (HTML rendered, study links resolved).
 * Reads resources/mock-interviews/ through the same GitHub / SDM_LOCAL_DIR layer as lessons.
 * Missing folder or a broken file never breaks the course: it just yields fewer mocks.
 */
import { createHash } from "crypto";
import { fetchGitHubContent, fetchMarkdownContent, isContentMissing, ContentFetchError } from "@/lib/github";
import { renderLesson } from "@/lib/course/render";
import type { CourseLesson, CourseWeek } from "@/lib/learn/types";
import { parseMock, type RawMock } from "./parse";
import { mockHref, type MockInterview, type MockMessage, type MockPhase, type StudyRef } from "./types";

export const MOCK_DIR = "resources/mock-interviews";
const FILE_RE = /^mock-(\d+)-[\w-]+\.md$/;

export type MockSource = { slug: string; n: number; path: string; md: string };

/** Every mock file, in order. Never throws. */
export async function loadMockSources(): Promise<MockSource[]> {
  let files: { name: string; path: string; type: string }[] = [];
  try {
    files = await fetchGitHubContent(MOCK_DIR);
  } catch (e) {
    if (isContentMissing(e)) return [];
    throw e; // transient (rate limit, 5xx): never cache an empty mock list
  }
  const picked = files.filter((f) => f.type === "file" && FILE_RE.test(f.name));
  const out = await Promise.all(
    picked.map(async (f) => {
      try {
        const md = await fetchMarkdownContent(f.path);
        return { slug: f.name.replace(/\.md$/, ""), n: parseInt(f.name.match(FILE_RE)![1], 10), path: f.path, md };
      } catch (e) {
        if (e instanceof ContentFetchError && !isContentMissing(e)) throw e;
        return null;
      }
    })
  );
  // Numbered in course order, not by file: the file number is fixed once published (later mocks can sit
  // between earlier ones), so `n` (shown as "Mock 03", "M3") is the mock's place after its world.
  // Progress and badges are keyed by the front matter `id`, never by `n`.
  const after = (md: string) => weekNumOf(md.match(/^after:\s*["']?([\w-]+)/m)?.[1] || "");
  return out
    .filter((x): x is MockSource => !!x)
    .map((x) => ({ x, file: x.n, w: after(x.md) }))
    .sort((a, b) => (a.w < 0 ? 99 : a.w) - (b.w < 0 ? 99 : b.w) || a.file - b.file)
    .map(({ x }, k) => ({ ...x, n: k + 1 }));
}

export type MockCtx = { weeks: Pick<CourseWeek, "key" | "num" | "code" | "lessons" | "boss" | "trial">[]; sideQuests: CourseLesson[] };

const pad = (n: number) => String(n).padStart(2, "0");

/** "W02-D3", "W00-P3", "W02-PRE", "W02-B", "W02-T", "SQ-04" or "week-folder/slug" → a lesson link. */
export function resolveStudy(code: string, ctx: MockCtx): StudyRef | null {
  const c = code.trim();
  const sq = c.match(/^SQ-?(\d+)$/i);
  if (sq) {
    const l = ctx.sideQuests.find((s) => s.code === `SQ-${pad(parseInt(sq[1], 10))}`);
    return l ? { code: l.code, title: l.title, href: l.href } : null;
  }
  const m = c.match(/^W(\d{1,2})[-·. ]?(D\d+|P\d+|PRE|B|T)$/i);
  if (m) {
    const w = ctx.weeks.find((x) => x.num === parseInt(m[1], 10));
    if (!w) return null;
    const part = m[2].toUpperCase();
    if (part === "B") return w.boss ? { code: `W${w.code} · Boss`, title: w.boss.title, href: w.boss.href } : null;
    if (part === "T") return w.trial ? { code: `W${w.code} · Trial`, title: w.trial.title, href: w.trial.href } : null;
    const l = w.lessons.find((x) => x.code === part);
    return l ? { code: `W${w.code} · ${part === "PRE" ? "Preview" : part}`, title: l.title, href: l.href } : null;
  }
  const p = c.match(/^(week-[\w-]+)\/([\w-]+)$/);
  if (p) {
    for (const w of ctx.weeks) {
      const l = [...w.lessons, ...(w.boss ? [w.boss] : [])].find((x) => x.week === p[1] && x.slug === p[2]);
      if (l) return { code: l.tag, title: l.title, href: l.href };
    }
  }
  return null;
}

async function mdToHtml(md: string): Promise<string> {
  if (!md.trim()) return "";
  const { unified } = await import("unified");
  const remarkParse = (await import("remark-parse")).default;
  const remarkGfm = (await import("remark-gfm")).default;
  const remarkRehype = (await import("remark-rehype")).default;
  const rehypeStringify = (await import("rehype-stringify")).default;
  const file = await unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeStringify).process(md);
  return String(file);
}

/** Course renderer output without the stage wrapper and its "Lesson · N min" header. */
async function blockHtml(md: string): Promise<string> {
  if (!md.trim()) return "";
  const r = await renderLesson(md, { kind: "day-content" });
  return r.html
    .replace(/<header class="sd-stage-head"[\s\S]*?<\/header>/g, "")
    .replace(/<section data-sd="stage"[^>]*>/g, "")
    .replace(/<\/section>\s*$/g, "");
}

export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#]+/g, "")
    .replace(/^\s*[-+]\s+/gm, "- ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function weekNumOf(key: string): number {
  const m = key.match(/week-(\d+)/);
  return m ? parseInt(m[1], 10) : -1;
}

export function coversLabel(covers: string[]): string {
  const nums = covers.map(weekNumOf).filter((n) => n >= 0).sort((a, b) => a - b);
  if (!nums.length) return "";
  return nums.length === 1 ? `W${pad(nums[0])}` : `W${pad(nums[0])}–W${pad(nums[nums.length - 1])}`;
}

/** Placement and coverage only (no rendering): enough for the course map. */
export function placement(raw: RawMock, ctx: MockCtx) {
  const afterWeek = ctx.weeks.find((w) => w.key === raw.after || w.key.startsWith(`${raw.after}-`) || `week-${w.code}` === raw.after) || null;
  const afterNum = afterWeek ? afterWeek.num : weekNumOf(raw.after);
  const covers = raw.covers.length ? raw.covers : ctx.weeks.filter((w) => w.num <= afterNum).map((w) => w.key);
  return { after: afterWeek?.key || raw.after, afterCode: afterWeek ? afterWeek.code : pad(Math.max(0, afterNum)), covers, coversLabel: coversLabel(covers) };
}

export async function buildMock(src: MockSource, ctx: MockCtx): Promise<MockInterview> {
  const raw = parseMock(src.md);
  if (process.env.NODE_ENV !== "production" && raw.warnings.length) console.warn(`[mock] ${src.slug}:`, raw.warnings.join("; "));
  const place = placement(raw, ctx);
  const msg = async (pid: string, kind: "m" | "c", list: RawMock["phases"][number]["prompts"]): Promise<MockMessage[]> =>
    Promise.all(list.map(async (m, i) => ({ id: `${pid}.${kind}${i + 1}`, trigger: m.trigger, html: await mdToHtml(m.md), text: plainText(m.md), title: m.title })));

  const phases: MockPhase[] = await Promise.all(
    raw.phases.map(async (p, k) => {
      const id = `p${k + 1}`;
      return {
        id,
        n: k + 1,
        title: p.title,
        minutes: p.minutes,
        prompts: await msg(id, "m", p.prompts),
        curveballs: await msg(id, "c", p.curveballs),
        hints: await Promise.all(p.hints.map(async (h) => ({ html: await mdToHtml(h), text: plainText(h) }))),
        answerHtml: await blockHtml(p.answer),
        rubric: await Promise.all(
          p.rubric.map(async (s, i) => ({
            id: `${id}.s${i + 1}`,
            level: s.level,
            html: await mdToHtml(s.md),
            text: plainText(s.md),
            study: s.study.map((c) => resolveStudy(c, ctx)).filter((x): x is StudyRef => !!x),
          }))
        ),
      };
    })
  );

  const minutes = raw.minutes ?? phases.reduce((a, p) => a + p.minutes, 0);
  return {
    id: raw.id || src.slug,
    slug: src.slug,
    n: src.n,
    code: `M${src.n}`,
    title: raw.title,
    heading: raw.heading,
    ...place,
    level: raw.level,
    badge: raw.badge || `Mock ${pad(src.n)} cleared`,
    company: raw.company,
    role: raw.role,
    interviewer: raw.interviewer,
    minutes,
    briefHtml: await blockHtml(raw.brief),
    problemHtml: await blockHtml(raw.problem),
    problemText: plainText(raw.problem),
    phases,
    levels: raw.levels,
    closing: raw.closing,
    version: createHash("sha1").update(src.md).digest("hex").slice(0, 12),
    href: mockHref(src.slug),
  };
}

/** Light summary for the course map: parse only, no HTML rendering. */
export function summarize(src: MockSource, ctx: MockCtx) {
  const raw = parseMock(src.md);
  const place = placement(raw, ctx);
  return {
    id: raw.id || src.slug,
    slug: src.slug,
    n: src.n,
    code: `M${src.n}`,
    title: raw.title,
    company: raw.company.name,
    interviewer: raw.interviewer.name,
    role: raw.role,
    ...place,
    level: raw.level,
    badge: raw.badge || `Mock ${pad(src.n)} cleared`,
    minutes: raw.minutes ?? raw.phases.reduce((a, p) => a + p.minutes, 0),
    phases: raw.phases.length,
    curveballs: raw.phases.reduce((a, p) => a + p.curveballs.length, 0),
    signals: raw.phases.reduce((a, p) => a + p.rubric.length, 0),
    href: mockHref(src.slug),
  };
}
