// Server-only: builds the "Case files" ledger on top of the existing story loader.
// getAllStories() stays the source of truth for which stories exist; this adds the
// type, read time (word count ÷ 220) and CASE ids the redesign needs.
import { getAllStories } from "@/lib/stories";
import { assignCaseIds, parseDebrief, readMinutes, resolveCaseType, sortNewestFirst, type CaseFile } from "./case-types";

type RawMeta = { words: number; type?: unknown; hasDebrief: boolean };

async function readRawMeta(): Promise<Map<string, RawMeta>> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const matter = (await import("gray-matter")).default;
  const dir = path.join(process.cwd(), "content", "stories");
  const out = new Map<string, RawMeta>();
  let names: string[] = [];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith(".md"));
  } catch {
    return out;
  }
  await Promise.all(
    names.map(async (name) => {
      try {
        const raw = await fs.readFile(path.join(dir, name), "utf8");
        const { data, content } = matter(raw);
        const slug = (typeof data.slug === "string" && data.slug) || path.basename(name, ".md");
        // Count what a reader reads: drop HTML comments (image prompts) before counting.
        const text = content.replace(/<!--[\s\S]*?-->/g, " ").trim();
        const words = text ? text.split(/\s+/).length : 0;
        out.set(slug, { words, type: data.type, hasDebrief: !!parseDebrief(data.debrief) });
      } catch {
        // unreadable file: it simply gets a default read time
      }
    })
  );
  return out;
}

/** All case files, newest first. */
export async function getCaseFiles(): Promise<CaseFile[]> {
  const [stories, meta] = await Promise.all([getAllStories(), readRawMeta()]);
  const ids = assignCaseIds(stories);
  return sortNewestFirst(stories).map((s) => {
    const m = meta.get(s.slug);
    return {
      slug: s.slug,
      caseId: ids.get(s.slug) || "CASE-000",
      title: s.title,
      excerpt: s.excerpt,
      cover: s.cover,
      date: s.date,
      tags: Array.from(new Set(Array.isArray(s.tags) ? s.tags : [])),
      type: resolveCaseType(s.slug, m?.type),
      mins: readMinutes(m?.words || 0),
      hasDebrief: !!m?.hasDebrief,
    };
  });
}
