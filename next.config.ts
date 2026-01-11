import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./content/**/*"],
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
        source: '/(.*)',
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
