import { portfolioManifest } from "@/lib/site/portfolioManifest";

// himanshukukreja.in/manifest.webmanifest (the course host answers this path with its own, src/app/learn/manifest.webmanifest); static.
export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(portfolioManifest()), { headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" } });
}
