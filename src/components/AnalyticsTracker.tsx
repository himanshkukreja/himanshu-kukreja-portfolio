"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pageview } from "@/lib/track";

/** Mounted once in the root layout: a page view per app-router navigation (see src/lib/track.ts). */
export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    pageview(pathname || undefined);
  }, [pathname]);

  return null;
}
