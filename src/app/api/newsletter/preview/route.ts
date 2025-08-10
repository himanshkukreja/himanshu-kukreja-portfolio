import { NextRequest, NextResponse } from "next/server";
import { getAllStories } from "@/lib/stories";
import { buildStoriesEmailHtml } from "@/lib/emailTemplate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  // Public preview endpoint for newsletter HTML
  // Usage: /api/newsletter/preview?slugs=a,b,c&subject=...&headerTitle=...
  const { searchParams } = new URL(req.url);
  const slugsParam = searchParams.get("slugs");
  const subject = (searchParams.get("subject") || "Engineering Stories").trim();
  const headerTitle = searchParams.get("headerTitle")?.trim() || undefined;

  const selectedSlugs = slugsParam
    ? slugsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const all = await getAllStories();
  const stories = selectedSlugs && selectedSlugs.length > 0
    ? all.filter((s) => selectedSlugs.includes(s.slug))
    : all.slice(0, 5);

  if (stories.length === 0) {
    return NextResponse.json({ error: "No stories available for preview" }, { status: 400 });
  }

  const html = buildStoriesEmailHtml(stories, {
    recipientEmail: "preview@example.com",
    subjectTitle: subject,
    headerTitle,
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
