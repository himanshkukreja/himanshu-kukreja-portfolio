"use client";

import { useSelectedLayoutSegments } from "next/navigation";
import { DSA_ICONS, SDM_ICONS } from "@/lib/site/courseIcons";

/**
 * The favicon, apple-touch-icon, manifest and web-app title links of the page's <head>. Chosen from the route in the server
 * render (the layout's segments are known without reading the request, so cached pages stay static), so a /dsa page's raw HTML
 * lists only DSA Mastery's teal set and every other page only SD Mastery's orange one: no swap after load, and a bookmark or
 * crawler sees the right icon. Client navigation between the two courses re-renders this with the new route.
 */
export default function CourseHeadIcons() {
  const seg = useSelectedLayoutSegments();
  const s = seg[0] === "learn" && seg[1] === "dsa" ? DSA_ICONS : SDM_ICONS;
  return (
    <>
      <link rel="icon" href={s.ico} sizes="any" />
      <link rel="icon" href={s.svg} type="image/svg+xml" />
      <link rel="apple-touch-icon" href={s.apple} />
      {/* Offline reading / installable app (src/lib/site/portfolioManifest.ts, public/sw.js); in <head> for the same reason. */}
      <link rel="manifest" href={s.manifest} />
      <meta name="apple-mobile-web-app-title" content={s.title} />
    </>
  );
}
