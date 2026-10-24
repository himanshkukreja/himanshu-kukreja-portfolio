import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // private, per-visitor or tool pages: nothing for a search index there
        disallow: ["/admin", "/api/", "/auth/", "/lab/", "/learn/arena/dev", "/learn/dashboard", "/learn/notebook", "/learn/notes", "/learn/bookmarks", "/learn/review", "/learn/certificate", "/offline", "/learn/offline"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
