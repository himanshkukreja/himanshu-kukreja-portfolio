import type { MetadataRoute } from "next";

/**
 * Web app manifest: "Install" on Android / desktop Chrome and "Add to Home Screen" on iPhone open
 * the course as an app, which is also what keeps saved lessons on iPhone (Safari can clear a
 * website's storage after a week without a visit; home-screen apps keep theirs).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/learn",
    name: "System Design Mastery · Himanshu Kukreja",
    short_name: "SD Mastery",
    description: "The free System Design Mastery course. Save lessons and read them offline: on a flight, on the metro, anywhere.",
    start_url: "/learn",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["education", "books", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Offline library", short_name: "Offline", url: "/learn/offline", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Course map", short_name: "Course", url: "/learn/system-design-mastery", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
