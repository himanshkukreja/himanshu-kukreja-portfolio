import { NextRequest, NextResponse } from "next/server";
import { getAllLearningResources, fetchMarkdownContent } from "@/lib/github";

export const runtime = "nodejs";

// Cache for resources with content (in-memory cache for better performance)
let cachedResourcesWithContent: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    // Check if cache is valid
    const now = Date.now();
    const isCacheValid = cachedResourcesWithContent && (now - cacheTimestamp < CACHE_DURATION);

    let resourcesWithContent = cachedResourcesWithContent;

    // Fetch and enrich resources with content if cache is invalid
    if (!isCacheValid) {
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

      // Update cache
      cachedResourcesWithContent = resourcesWithContent;
      cacheTimestamp = now;
      console.log("[Search API] Cache updated with content for", resourcesWithContent.length, "resources");
    }

    return NextResponse.json({ results: resourcesWithContent || [] });
  } catch (error) {
    console.error("[Search API] Error:", error);
    return NextResponse.json(
      { error: "Failed to search content", results: [] },
      { status: 500 }
    );
  }
}
