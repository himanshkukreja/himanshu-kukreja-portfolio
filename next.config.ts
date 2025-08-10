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
  ];
  domains = ["ik.imagekit.io"];
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
};

export default nextConfig;
