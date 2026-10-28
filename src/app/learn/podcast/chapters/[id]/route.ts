import { NextResponse } from "next/server";
import { lectureMediaBase } from "@/lib/learn/lecture/load";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Ctx = { params: Promise<{ id: string }> };

/** An episode's chapters (Podcasting 2.0 JSON chapters), from the lecture's chapters.json. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const base = (lectureMediaBase() || "").replace(/\/$/, "");
  if (!/^[a-z0-9-]{3,160}$/.test(id) || !/^https?:\/\//.test(base)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const res = await fetch(`${base}/${id}/chapters.json`, { next: { revalidate: 86400 } }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const ch = (await res.json()) as { title: string; at: number }[];
  return NextResponse.json(
    { version: "1.2.0", chapters: ch.filter((c) => c && Number.isFinite(c.at)).map((c) => ({ startTime: Math.round(c.at * 10) / 10, title: c.title, url: `${SITE_URL}/learn/lectures/${id}?t=${Math.floor(c.at)}` })) },
    { headers: { "content-type": "application/json+chapters; charset=utf-8", "access-control-allow-origin": "*" } }
  );
}
