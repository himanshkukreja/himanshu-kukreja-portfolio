import { NextResponse } from "next/server";
import { getAllStories } from "@/lib/stories";

export const runtime = "nodejs"; // ensure Node.js runtime for fs access
// Served from the CDN cache (the /stories middleware gate reads it on story visits); publishing,
// unpublishing or archiving a case file calls revalidatePath("/api/stories") so it updates at once.
export const revalidate = 60;

export async function GET() {
  const stories = await getAllStories();
  return NextResponse.json({ stories });
}
