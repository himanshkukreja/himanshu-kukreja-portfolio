import type { MetadataRoute } from "next";
import { PORTFOLIO_ORIGIN } from "@/lib/site/hosts";

// The portfolio's sitemap (himanshukukreja.in). The course, case files, certificates and profiles
// moved to systemdesignmastery.dev and are listed in its own sitemap (src/app/learn/sitemap.ts).
export const revalidate = 86400;

const PAGES: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, freq: "weekly" },
  { path: "/projects", priority: 0.7, freq: "monthly" },
  { path: "/now", priority: 0.5, freq: "monthly" },
  { path: "/play", priority: 0.4, freq: "monthly" },
  { path: "/privacy", priority: 0.1, freq: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((p) => ({ url: `${PORTFOLIO_ORIGIN}${p.path}`, changeFrequency: p.freq, priority: p.priority }));
}
