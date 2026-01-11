"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/analytics";

export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // Track page view on mount and pathname change
    trackPageView();
  }, [pathname]);

  return null; // This component doesn't render anything
}
