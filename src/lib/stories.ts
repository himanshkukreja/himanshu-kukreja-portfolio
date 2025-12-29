export type StoryFrontmatter = {
  slug: string;
  title: string;
  excerpt?: string;
  cover?: string;
  date?: string;
  tags?: string[];
};

export type Story = StoryFrontmatter & {
  content: string; // HTML
};

export async function getAllStories(): Promise<StoryFrontmatter[]> {
  const files = await listStoryFiles();
  const stories: StoryFrontmatter[] = [];
  for (const file of files) {
    const raw = await readFile(file);
    const { data, content } = await parseFrontmatter(raw);
    // Derive slug from filename if not present in frontmatter
    const pathMod = await import("path");
    const fallbackSlug = pathMod.basename(file, ".md");
    const fm = { ...(data as Record<string, unknown>) } as Partial<StoryFrontmatter>;
    const slug = (fm.slug as string) || fallbackSlug;

    // Derive title from first markdown heading if missing
    let title = (fm.title as string) || "";
    if (!title) {
      const m = content.match(/^#\s+(.+)$/m) || content.match(/^(.+)\n=+$/m) || content.match(/^##\s+(.+)$/m);
      if (m && m[1]) title = m[1].trim();
    }

    if (!slug || !title) continue; // skip invalid entries

    stories.push({
      slug,
      title,
      excerpt: (fm.excerpt as string) || undefined,
      cover: (fm.cover as string) || undefined,
      date: (fm.date as string) || undefined,
      tags: (fm.tags as string[]) || undefined,
    });
  }
  // sort by date desc if present
  stories.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  return stories;
}

export async function getStoryBySlug(slug: string): Promise<Story | null> {
  const files = await listStoryFiles();
  const match = files.find((f) => f.endsWith(`${slug}.md`));
  if (!match) return null;
  const raw = await readFile(match);
  const { content, data } = await parseFrontmatter(raw);
  const { markdownToHtml } = await import("./markdown");
  const html = await markdownToHtml(content);
  return {
    ...(data as StoryFrontmatter),
    slug,
    content: html,
  };
}

async function parseFrontmatter(raw: string) {
  const matter = (await import("gray-matter")).default;
  return matter(raw);
}

async function readFile(path: string): Promise<string> {
  const fs = await import("fs/promises");
  return fs.readFile(path, "utf8");
}

async function listStoryFiles(): Promise<string[]> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const dir = path.join(process.cwd(), "content", "stories");
  const entries: string[] = [];
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const it of items) {
      if (it.isFile() && it.name.endsWith(".md")) {
        entries.push(path.join(dir, it.name));
      }
    }
  } catch {
    // ignore if dir doesn't exist
  }
  return entries;
}
