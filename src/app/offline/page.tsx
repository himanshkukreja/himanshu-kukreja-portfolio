import type { Metadata } from "next";
import OfflineFallback from "@/components/offline/OfflineFallback";

// Served by the service worker in place of any page that isn't saved, when there's no network.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Offline · Himanshu Kukreja",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return <OfflineFallback />;
}
