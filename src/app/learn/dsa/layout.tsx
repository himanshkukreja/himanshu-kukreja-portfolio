import type { Viewport } from "next";
import { DSA_DEFAULT_THEME, READ_MODES } from "@/lib/learn/readingModes";

// Browser chrome colour on every DSA Mastery page: the dark default's black (the root layout says light for SDM). A learner
// who picked another theme there gets that theme's colour from READING_JS before first paint.
export const viewport: Viewport = {
  themeColor: READ_MODES.find((m) => m.id === DSA_DEFAULT_THEME)?.bg ?? "#000000",
  viewportFit: "cover",
};

export default function DsaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
