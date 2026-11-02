import type { Metadata } from "next";
import { COURSE_NAME, COURSE_ORIGIN } from "./hosts";

/**
 * Metadata defaults for every page served on the course host (layouts of src/app/learn, stories,
 * cert, u): relative canonicals / OG URLs / images resolve against systemdesignmastery.dev.
 */
export const COURSE_LAYOUT_METADATA: Metadata = {
  metadataBase: new URL(COURSE_ORIGIN),
  openGraph: { type: "website", siteName: COURSE_NAME, locale: "en_IN" },
  twitter: { card: "summary_large_image", creator: "@hi_kukreja" },
  alternates: { types: { "application/rss+xml": [{ url: "/case-files/feed.xml", title: `Case files · ${COURSE_NAME}` }] } },
};
