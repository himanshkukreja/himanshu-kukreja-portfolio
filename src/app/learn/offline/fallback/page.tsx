import type { Metadata } from "next";
import OfflineFallback from "@/components/offline/OfflineFallback";

// systemdesignmastery.dev/offline/fallback: served by the service worker in place of any page that
// isn't saved, when there's no network (/offline is the library on the course host).
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Offline · System Design Mastery",
  robots: { index: false, follow: false },
};

export default function OfflineFallbackPage() {
  return <OfflineFallback />;
}
