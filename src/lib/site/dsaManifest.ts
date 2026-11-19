import type { MetadataRoute } from "next";
import { DSA_DEFAULT_THEME, READ_MODES } from "@/lib/learn/readingModes";

/**
 * DSA Mastery's own web app manifest (/dsa/manifest.webmanifest, linked from the /dsa layout): installed from a DSA page it is
 * its own app (id /dsa, scope /dsa) with the DSA mark's icons (public/course-brand/dsa) and the theme's colours. The course's
 * manifest (src/lib/site/manifest.ts) stays SD Mastery's.
 */
export function dsaManifest(): MetadataRoute.Manifest {
  const bg = READ_MODES.find((m) => m.id === DSA_DEFAULT_THEME)?.bg ?? "#000000";
  const icon = (n: string, sizes: string, purpose: "any" | "maskable" = "any") => ({ src: `/course-brand/dsa/icons/${n}`, sizes, type: "image/png", purpose });
  return {
    id: "/dsa",
    name: "DSA Mastery",
    short_name: "DSA Mastery",
    description: "Data structures and algorithms, taught concept-first with an AI tutor, lessons, practice problems and a code editor in four languages.",
    start_url: "/dsa",
    scope: "/dsa",
    display: "standalone",
    orientation: "any",
    background_color: bg,
    theme_color: bg,
    categories: ["education", "productivity"],
    icons: [icon("icon-192.png", "192x192"), icon("icon-512.png", "512x512"), icon("icon-maskable-512.png", "512x512", "maskable"), { src: "/course-brand/dsa/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
