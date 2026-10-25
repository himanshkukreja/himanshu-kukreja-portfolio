import { NextResponse } from "next/server";
import { fetchMarkdownContent } from "@/lib/github";
import { parseFaq } from "@/lib/learn/faq/parse";

export const runtime = "nodejs";
// Static: built on first request, refreshed daily and on every content push (revalidate-courses).
export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

const SLUG = /^[A-Za-z0-9-]{1,120}$/;

/** GET /api/learn/faq/<week>/<slug> → the lesson's "Questions learners ask", or { items: [] }. */
export async function GET(_: Request, { params }: { params: Promise<{ week: string; slug: string }> }) {
  const { week, slug } = await params;
  if (!SLUG.test(week) || !SLUG.test(slug)) return NextResponse.json({ items: [] });
  const raw = await fetchMarkdownContent(`resources/lesson-faq/${week}/${slug}.md`).catch(() => null);
  const faq = raw ? parseFaq(raw) : null;
  return NextResponse.json(faq ?? { items: [] });
}
