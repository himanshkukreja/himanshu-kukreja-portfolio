import type { Metadata, Viewport } from "next";
import { DSA_ICONS } from "@/lib/site/courseIcons";
import { DSA_DEFAULT_THEME, READ_MODES } from "@/lib/learn/readingModes";

// Browser chrome colour on every DSA Mastery page: the dark default's black (the root layout says light for SDM). A learner
// who picked another theme there gets that theme's colour from READING_JS before first paint.
export const viewport: Viewport = {
  themeColor: READ_MODES.find((m) => m.id === DSA_DEFAULT_THEME)?.bg ?? "#000000",
  viewportFit: "cover",
};

// DSA Mastery's own favicon set (the DSA mark in its teal; scripts/brand/build-dsa-icons.mjs) and manifest, instead of SD Mastery's orange ones.
// Every DSA route inherits them; the share image is this folder's opengraph-image (the DSA card).
export const metadata: Metadata = {
  icons: {
    icon: [
      { url: DSA_ICONS.ico, sizes: "any" },
      { url: DSA_ICONS.svg, type: "image/svg+xml" },
    ],
    apple: DSA_ICONS.apple,
  },
  manifest: DSA_ICONS.manifest,
};

export default function DsaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
