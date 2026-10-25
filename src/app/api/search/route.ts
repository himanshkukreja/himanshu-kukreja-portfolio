import { NextResponse } from "next/server";
import { getAllLearningResources, fetchMarkdownContent } from "@/lib/github";
import { listStorySources } from "@/lib/stories";
import { getCompanySearchDocs } from "@/lib/learn/prep/load";

export const runtime = "nodejs";
// The palette's search index: built once and served from the cache (CDN), refreshed daily and on every
// content push (revalidate-courses). Filtering happens in the browser, so the request takes no query.
export const revalidate = 86400;

const plain = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^[ \t]*:{2,}[^\n]*$/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/#+\s/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n+/g, " ")
    .trim();

export async function GET() {
  try {
    let resourcesWithContent: unknown[] = [];
    {
      console.log("[Search API] Fetching resources with content...");
      const resources = await getAllLearningResources();

      // Fetch content for each resource
      resourcesWithContent = await Promise.all(
        resources.map(async (resource) => {
          try {
            // Fetch the markdown content
            const content = await fetchMarkdownContent(resource.path);

            // Extract plain text from markdown (remove markdown syntax)
            const plainText = content
              .replace(/```[\s\S]*?```/g, '') // Remove code blocks
              .replace(/^[ \t]*:{2,}[^\n]*$/gm, '') // Remove ::: block fence lines and ::anim explainer lines
              .replace(/`([^`]+)`/g, '$1') // Remove inline code
              .replace(/#+\s/g, '') // Remove headers
              .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
              .replace(/\*([^*]+)\*/g, '$1') // Remove italic
              .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
              .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Remove images
              .replace(/>\s/g, '') // Remove blockquotes
              .replace(/[-*+]\s/g, '') // Remove list markers
              .replace(/\n+/g, ' ') // Replace newlines with spaces
              .trim();

            // Create excerpt (first 300 characters)
            const excerpt = plainText.substring(0, 300) + (plainText.length > 300 ? '...' : '');

            return {
              ...resource,
              content: plainText,
              excerpt,
            };
          } catch (error) {
            console.warn(`[Search API] Failed to fetch content for ${resource.path}:`, error);
            return {
              ...resource,
              content: '',
              excerpt: '',
            };
          }
        })
      );

    }

    // case files (repo stories + published CMS ones), searched alongside the lessons
    const cases = (await listStorySources().catch(() => [])).map((c) => ({ slug: c.slug, title: c.title, excerpt: c.excerpt || "", content: plain(c.body || "").slice(0, 20000) }));

    // interview-prep companies: found by name, what they build, their focus and their questions
    const companies = await getCompanySearchDocs().catch(() => []);

    return NextResponse.json({ results: resourcesWithContent, cases, companies });
  } catch (error) {
    console.error("[Search API] Error:", error);
    return NextResponse.json(
      { error: "Failed to search content", results: [] },
      { status: 500 }
    );
  }
}
