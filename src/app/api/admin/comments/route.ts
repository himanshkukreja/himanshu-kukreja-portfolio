import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type AdminComment = {
  kind: "lesson" | "story";
  id: string;
  userId: string;
  name: string | null;
  /** Plain text only — comment HTML is never sent to the admin UI. */
  text: string;
  where: string;
  href: string;
  parentId: string | null;
  upvotes: number;
  createdAt: string;
};

/** HTML → plain text (tags dropped, common entities decoded, whitespace collapsed). */
function toText(html: string | null | undefined) {
  return (html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 4000);
}

type LessonRow = { id: string; user_id: string; course_id: string; week: string; lesson_slug: string; parent_id: string | null; content: string; raw_content: string | null; upvotes: number | null; created_at: string };
type StoryRow = { id: string; user_id: string; user_name: string | null; story_slug: string; parent_id: string | null; content: string; raw_content: string | null; upvotes: number | null; created_at: string };

/** GET ?limit=200 → { comments: AdminComment[], errors: string[] } (lesson + story comments, newest first). */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") || "200", 10) || 200, 1), 1000);

  const [lessonRes, storyRes] = await Promise.all([
    supabase.from("lesson_comments").select("id, user_id, course_id, week, lesson_slug, parent_id, content, raw_content, upvotes, created_at").order("created_at", { ascending: false }).limit(limit),
    supabase.from("story_comments").select("id, user_id, user_name, story_slug, parent_id, content, raw_content, upvotes, created_at").order("created_at", { ascending: false }).limit(limit),
  ]);
  const errors: string[] = [];
  if (lessonRes.error) errors.push(`lesson_comments: ${lessonRes.error.message}`);
  if (storyRes.error) errors.push(`story_comments: ${storyRes.error.message}`);
  const lessons = (lessonRes.data as LessonRow[] | null) || [];
  const stories = (storyRes.data as StoryRow[] | null) || [];

  const ids = [...new Set(lessons.map((c) => c.user_id))];
  const names = new Map<string, string | null>();
  if (ids.length) {
    const { data } = await supabase.from("user_profiles").select("id, full_name").in("id", ids);
    for (const p of (data as { id: string; full_name: string | null }[] | null) || []) names.set(p.id, p.full_name);
  }

  const comments: AdminComment[] = [
    ...lessons.map((c) => ({
      kind: "lesson" as const,
      id: c.id,
      userId: c.user_id,
      name: names.get(c.user_id) ?? null,
      text: toText(c.raw_content || c.content),
      // shorts reuse lesson_comments under course "shorts"
      where: c.course_id === "shorts" ? `shorts/${c.lesson_slug.replace(/^shorts--/, "")}` : `${c.week}/${c.lesson_slug}`,
      href: c.course_id === "shorts" ? `/learn/shorts?v=${encodeURIComponent(c.lesson_slug)}` : `/learn/${encodeURIComponent(c.course_id)}/${encodeURIComponent(c.week)}/${encodeURIComponent(c.lesson_slug)}`,
      parentId: c.parent_id,
      upvotes: c.upvotes ?? 0,
      createdAt: c.created_at,
    })),
    ...stories.map((c) => ({
      kind: "story" as const,
      id: c.id,
      userId: c.user_id,
      name: c.user_name,
      text: toText(c.raw_content || c.content),
      where: `stories/${c.story_slug}`,
      href: `/stories/${encodeURIComponent(c.story_slug)}`,
      parentId: c.parent_id,
      upvotes: c.upvotes ?? 0,
      createdAt: c.created_at,
    })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  if (errors.length === 2) return NextResponse.json({ error: "Failed to load comments", errors }, { status: 500 });
  return NextResponse.json({ comments, errors });
}

/** DELETE { kind: "lesson" | "story", id } — replies cascade. */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const body = await req.json().catch(() => ({}));
  const table = body?.kind === "lesson" ? "lesson_comments" : body?.kind === "story" ? "story_comments" : null;
  const id = typeof body?.id === "string" ? body.id : null;
  if (!table || !id) return NextResponse.json({ error: "kind and id are required" }, { status: 400 });
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
