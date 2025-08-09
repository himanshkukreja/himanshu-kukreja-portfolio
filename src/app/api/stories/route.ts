import { NextResponse } from "next/server";
import { getAllStories } from "@/lib/stories";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const stories = await getAllStories();
  return NextResponse.json({ stories }, { headers: { "Cache-Control": "no-store" } });
}
