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
    return posthogRewrites;
  },
  // ...but keep the site's own canonical URLs: /learn/ → /learn as before (proxy paths excluded).
  async redirects() {
    return posthogRewrites.length
      ? [{ source: `/:path((?!${PH.slice(1)}(?:/|$)).+)/`, destination: "/:path", permanent: true }]
      : [];
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
