import type { NextConfig } from "next";

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
};

export default nextConfig;
