import { dsaManifest } from "@/lib/site/dsaManifest";

// systemdesignmastery.dev/dsa/manifest.webmanifest (the config rewrite maps /dsa/* to this route); static.
export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(dsaManifest()), { headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" } });
}
