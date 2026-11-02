import type { MetadataRoute } from "next";

/**
 * The course's web app manifest, served on systemdesignmastery.dev as /manifest.webmanifest
 * (src/app/learn/manifest.webmanifest/route.ts, rewritten there by the middleware).
 *
 * "Install" on Android / desktop Chrome and "Add to Home Screen" on iPhone open the course as an app,
 * which is also what keeps saved lessons on iPhone (Safari can clear a website's storage after a week
 * without a visit; home-screen apps keep theirs).
 *
 * Window: desktop Chrome/Edge draw the page into the title bar (window-controls-overlay; the site
 * header becomes the title bar, see globals.css "Installed app window"), everything else, and the
 * reader who folds the overlay away with its chevron, gets a plain standalone window. Not
 * "fullscreen": that hides the system UI and the window buttons (the reader's focus mode goes
 * fullscreen on demand instead).
 *
 * Icons: the course's own diagram mark (public/course-brand), by its own paths so installed apps pick up the change.
 *
 * `name` is what Chrome prefixes window titles with ("<name> - <page title>"), so it is the course
 * name alone and the installed app's page titles drop it (src/components/offline/AppWindow.tsx).
 */
export function courseManifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "System Design Mastery",
    short_name: "SD Mastery",
    description: "The free System Design Mastery course. Save lessons and read them offline: on a flight, on the metro, anywhere.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: "#F5F4F0",
    theme_color: "#F5F4F0",
    categories: ["education", "books", "productivity"],
    icons: [
      { src: "/course-brand/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/course-brand/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/course-brand/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/course-brand/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Offline library", short_name: "Offline", url: "/offline", icons: [{ src: "/course-brand/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Course map", short_name: "Course", url: "/", icons: [{ src: "/course-brand/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
