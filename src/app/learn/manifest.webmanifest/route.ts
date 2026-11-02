import { courseManifest } from "@/lib/site/manifest";

// systemdesignmastery.dev/manifest.webmanifest (the middleware rewrites it here); static.
export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(courseManifest()), { headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" } });
}
