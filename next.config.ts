import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./content/**/*"],
  },
  experimental: {
    serverComponentsExternalPackages: [
      "gray-matter",
      "unified",
      "remark-parse",
      "remark-gfm",
      "remark-rehype",
      "rehype-stringify",
      "nodemailer",
    ],
  },
};

export default nextConfig;
