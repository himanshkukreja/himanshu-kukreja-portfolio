import type { NextConfig } from "next";
import { POSTHOG_ASSETS_HOST, POSTHOG_INGEST_HOST, POSTHOG_KEY, POSTHOG_PROXY_PATH } from "./src/lib/analytics/config";

// Attempt to configure Image Optimization for remote ImageKit (if provided via env)
const imageKitBase = process.env.NEXT_PUBLIC_IMAGEKIT_BASE_URL;
let remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] | undefined;
let domains: string[] | undefined;
if (imageKitBase) {
  try {
    const u = new URL(imageKitBase);
    remotePatterns = [
      {
        protocol: u.protocol.replace(":", "") as "http" | "https",
        hostname: u.hostname,
        port: u.port || undefined,
        pathname: "/**", // must start with '/'
      },
    ];
    domains = [u.hostname];
  } catch {
    // ignore env parse errors
  }
}

// Fallback to common ImageKit host if env is not set or parsing failed
if (!remotePatterns) {
  remotePatterns = [
    {
      protocol: "https",
      hostname: "ik.imagekit.io",
      pathname: "/**",
    },
    {
      protocol: "https",
      hostname: "lh3.googleusercontent.com",
      pathname: "/**",
    },
  ];
  domains = ["ik.imagekit.io", "lh3.googleusercontent.com"];
} else {
  // Add Google images to existing remote patterns
  remotePatterns.push({
    protocol: "https",
    hostname: "lh3.googleusercontent.com",
    pathname: "/**",
  });
  domains = domains ? [...domains, "lh3.googleusercontent.com"] : ["lh3.googleusercontent.com"];
}

// Case files CMS covers / images live in the public Supabase Storage bucket "case-files".
try {
  const sb = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;
  if (sb) remotePatterns.push({ protocol: "https", hostname: sb.hostname, pathname: "/storage/v1/object/public/case-files/**" });
  // Learner profile photos (bucket "avatars", 20261101_avatars.sql). UserAvatar renders them with a
  // plain <img> (already 256 px), so this only matters if a next/image ever shows one.
  if (sb) remotePatterns.push({ protocol: "https", hostname: sb.hostname, pathname: "/storage/v1/object/public/avatars/**" });
} catch {
  // ignore env parse errors
}

// PostHog first-party proxy (ad-blocker proof), per posthog.com/docs/advanced/proxy/nextjs.
// Registered only when a PostHog project key is configured; otherwise /hkr/* is a plain 404.
const PH = POSTHOG_PROXY_PATH; // "/hkr"
const posthogRewrites = POSTHOG_KEY
  ? [
      { source: `${PH}/static/:path*`, destination: `${POSTHOG_ASSETS_HOST}/static/:path*` },
      { source: `${PH}/array/:path*`, destination: `${POSTHOG_ASSETS_HOST}/array/:path*` },
      { source: `${PH}/:path*`, destination: `${POSTHOG_INGEST_HOST}/:path*` },
    ]
  : [];

// systemdesignmastery.dev has its own mark (the diagram mark, public/course-brand). The favicon, app icons
// and the installed app's icons keep their usual paths (browsers, crawlers, the service worker and the
// push notifications ask for those), answered from public/course-brand on the course host.
const courseHosts = ["systemdesignmastery.dev", "www.systemdesignmastery.dev"];
try {
  if (process.env.NEXT_PUBLIC_COURSE_ORIGIN) courseHosts.push(new URL(process.env.NEXT_PUBLIC_COURSE_ORIGIN).hostname);
} catch {
  // ignore env parse errors
}
const courseHostRe = courseHosts.map((h) => h.replace(/\./g, "\\.")).join("|");
const courseIconRewrites = ["/favicon.ico", "/icon.svg", "/icon.png", "/apple-icon.png", "/icons/:file(icon-[\\w-]+\\.png)"].map((source) => ({
  source,
  has: [{ type: "host" as const, value: `(?:${courseHostRe})` }],
  destination: `/course-brand${source.replace(/:file\(.*\)$/, ":file")}`,
}));

// One id per deploy for offline reading: the service worker is registered as /sw.js?v=<id> (a new id
// installs a new worker) and saved pages record the build whose app files they need. Set once here
// so the build's worker processes (which inherit process.env) all inline the same value.
process.env.HK_BUILD_ID ||=
  process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || `local-${Date.now().toString(36)}`;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_HK_BUILD: process.env.HK_BUILD_ID,
  },
  // PostHog API paths end in a slash (/e/, /flags/?v=2): don't 308 them away (only needed, and
  // only switched on, when the proxy is live).
  skipTrailingSlashRedirect: posthogRewrites.length > 0,
  async rewrites() {
    return { beforeFiles: courseIconRewrites, afterFiles: posthogRewrites, fallback: [] };
  },
  // ...but keep the site's own canonical URLs: /learn/ → /learn as before (proxy paths excluded).
  async redirects() {
    // Moved course pages (practice → prep, tracks → prep/companies, search → chat) are redirected by the
    // middleware with the move to systemdesignmastery.dev (src/lib/learn/paths.ts legacyTarget), in one hop.
    const moved: { source: string; destination: string; permanent: boolean }[] = [];
    return posthogRewrites.length
      ? [...moved, { source: `/:path((?!${PH.slice(1)}(?:/|$)).+)/`, destination: "/:path", permanent: true }]
      : moved;
  },
  outputFileTracingIncludes: {
    "/*": ["./content/**/*"],
    // Case-file update emails: story markdown + each story's activity title/blurb (read at runtime).
    "/api/admin/newsletter/stories": ["./content/stories/**/*", "./src/components/stories/activities/*.tsx"],
    // Share-card fonts (src/lib/og) for the per-lesson OG/Twitter images rendered on demand.
    "/learn/**/opengraph-image": ["./src/lib/og/fonts/*.ttf"],
    "/learn/**/twitter-image": ["./src/lib/og/fonts/*.ttf"],
  },
  serverExternalPackages: [
    "gray-matter",
    "unified",
    "remark-parse",
    "remark-gfm",
    "remark-rehype",
    "rehype-stringify",
    "nodemailer",
    // case files validator: mermaid.parse() in Node (src/lib/case-files/mermaid-check.ts) must share
    // one DOMPurify instance with mermaid, so neither is bundled into the server build
    "mermaid",
    "dompurify",
  ],
  images: {
    remotePatterns,
    domains,
  },
  // Add headers to allow Supabase API calls
  async headers() {
    return [
      {
        // the offline service worker: always revalidated, allowed to control the whole site
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // code labs' Python runtime: versioned folders (public/pyodide/<version>/), never change in place
        source: "/pyodide/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // everything except the PostHog proxy (it forwards PostHog's own headers)
        source: `/((?!${PH.slice(1)}/).*)`,
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, apikey, x-client-info',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
