import { NextRequest, NextResponse } from "next/server";
import { getAllLearningResources } from "@/lib/github";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    // Fetch all resources
    const resources = await getAllLearningResources();

    // If no query, return all resources
    if (!query) {
      return NextResponse.json({ results: resources });
    }

    // Simple server-side filtering (client will do fuzzy search with Fuse.js)
    const lowercaseQuery = query.toLowerCase();
    const filtered = resources.filter(
      (resource) =>
        resource.title.toLowerCase().includes(lowercaseQuery) ||
        resource.week.toLowerCase().includes(lowercaseQuery) ||
        resource.type.toLowerCase().includes(lowercaseQuery) ||
        (resource.day && resource.day.toLowerCase().includes(lowercaseQuery))
    );

    return NextResponse.json({ results: filtered });
  } catch (error) {
    console.error("[Search API] Error:", error);
    return NextResponse.json(
      { error: "Failed to search content", results: [] },
      { status: 500 }
    );
  }
}
