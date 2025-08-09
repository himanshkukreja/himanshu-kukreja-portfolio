import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure server can use gray-matter/remark packages in serverless envs
  experimental: {
    serverComponentsExternalPackages: [
      "gray-matter",
      "unified",
      "remark-parse",
      "remark-gfm",
      "remark-rehype",
      "rehype-stringify",
    ],
  },
};

export default nextConfig;
