import { COURSE_ORIGIN } from "@/lib/site/hosts";

// systemdesignmastery.dev/robots.txt (the middleware rewrites it here); the portfolio's is src/app/robots.ts.
export const dynamic = "force-static";

// private, per-visitor or tool pages: nothing for a search index there
const DISALLOW = ["/admin", "/api/", "/auth/", "/arena/dev", "/dashboard", "/notebook", "/notes", "/bookmarks", "/review", "/certificate", "/offline"];

export function GET() {
  const body = ["User-Agent: *", "Allow: /", ...DISALLOW.map((d) => `Disallow: ${d}`), "", `Host: ${COURSE_ORIGIN}`, `Sitemap: ${COURSE_ORIGIN}/sitemap.xml`, ""].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
