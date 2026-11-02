import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// himanshukukreja.in. The course host has its own (src/app/learn/robots.txt/route.ts); old course
// URLs here all 301 to it, so they need no rules.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // private or tool pages: nothing for a search index there
        disallow: ["/admin", "/api/", "/auth/", "/lab/", "/offline"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
