import { NextRequest, NextResponse } from "next/server";
import { getAllStories } from "@/lib/stories";
import { buildStoriesEmailHtml } from "@/lib/emailTemplate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function requireAdmin(req: NextRequest) {
  const token = req.headers.get("x-admin-token") || req.nextUrl.searchParams.get("token");
  if (token !== process.env.NEWSLETTER_ADMIN_TOKEN) {
    throw new Error("Unauthorized");
  }
}

export async function POST(req: NextRequest) {
  try {
    requireAdmin(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({}));
  const requestedSlugs: string[] | undefined = Array.isArray(payload?.slugs) ? payload.slugs : undefined;
  const subject: string = typeof payload?.subject === "string" && payload.subject.trim() ? payload.subject.trim() : "🚀 Your Weekly Dose of Engineering Stories is Here!";
  const headerTitle: string | undefined = typeof payload?.headerTitle === "string" && payload.headerTitle.trim() ? payload.headerTitle.trim() : undefined;

  // Get stories for preview
  const all = await getAllStories();
  const stories = (requestedSlugs && requestedSlugs.length > 0)
    ? all.filter((s) => requestedSlugs.includes(s.slug))
    : all.slice(0, 5);

  if (stories.length === 0) {
    return NextResponse.json({ error: "No stories selected" }, { status: 400 });
  }

  // Generate preview HTML with placeholder email
  const html = buildStoriesEmailHtml(stories, { 
    recipientEmail: "preview@example.com",
    subjectTitle: subject.replace(/🚀|📧|💡|✨/g, "").trim() || "Your Weekly Dose of Engineering Stories",
    headerTitle
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
