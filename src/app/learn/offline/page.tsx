import type { Metadata } from "next";
import OfflineLibrary from "@/components/offline/OfflineLibrary";

// Static on purpose: the service worker precaches this page, so the library opens with no network.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Offline library · System Design Mastery",
  description: "Lessons saved on this device for reading without internet.",
  robots: { index: false, follow: true },
};

export default function OfflineLibraryPage() {
  return <OfflineLibrary />;
}
