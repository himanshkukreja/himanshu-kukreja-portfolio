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

const nextConfig: NextConfig = {
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
  ],
  images: {
    remotePatterns,
    domains,
  },
  // Add headers to allow Supabase API calls
  async headers() {
    return [
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
