import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/auth";
import { getAllStories } from "@/lib/stories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type StoryStat = {
  slug: string;
  title: string;
  date: string | null;
  totalViews: number;
  uniqueVisitors: number;
  /** Unique visitors first seen in the last 30 days. */
  newVisitors30d: number;
  lastViewedAt: string | null;
};

/** GET → { stories: StoryStat[], totals: { views, unique, new30d } } from story_views + story_unique_visitors. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [all, viewsRes, recentRes] = await Promise.all([
    getAllStories().catch(() => []),
    supabase.from("story_views").select("story_id, total_views, unique_views, last_viewed_at"),
    supabase.from("story_unique_visitors").select("story_id").gte("first_viewed_at", since).limit(50000),
  ]);
  if (viewsRes.error && recentRes.error) return NextResponse.json({ error: "Failed to load story stats" }, { status: 500 });

  type ViewRow = { story_id: string; total_views: number; unique_views: number; last_viewed_at: string | null };
  const views = new Map<string, ViewRow>(((viewsRes.data as ViewRow[] | null) || []).map((v) => [v.story_id, v]));
  const recent = new Map<string, number>();
  for (const r of (recentRes.data as { story_id: string }[] | null) || []) recent.set(r.story_id, (recent.get(r.story_id) || 0) + 1);

  const meta = new Map(all.map((s) => [s.slug, s]));
  const slugs = new Set<string>([...meta.keys(), ...views.keys()]);
  const stories: StoryStat[] = [...slugs]
    .map((slug) => {
      const v = views.get(slug);
      const m = meta.get(slug);
      return {
        slug,
        title: m?.title || slug,
        date: m?.date ?? null,
        totalViews: v?.total_views ?? 0,
        uniqueVisitors: v?.unique_views ?? 0,
        newVisitors30d: recent.get(slug) ?? 0,
        lastViewedAt: v?.last_viewed_at ?? null,
      };
    })
    .sort((a, b) => b.uniqueVisitors - a.uniqueVisitors || b.totalViews - a.totalViews);

  return NextResponse.json({
    stories,
    totals: {
      views: stories.reduce((a, s) => a + s.totalViews, 0),
      unique: stories.reduce((a, s) => a + s.uniqueVisitors, 0),
      new30d: stories.reduce((a, s) => a + s.newVisitors30d, 0),
    },
  });
}
