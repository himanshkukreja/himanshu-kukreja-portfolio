"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { analyticsRoute } from "@/lib/analytics/client";

/**
 * Mounted once in the root layout. Starts PostHog / GA4 when they are configured and allowed, and
 * re-applies the /admin + opt-out gates on every app-router navigation. Renders nothing; with no
 * analytics config it does nothing at all (see src/lib/analytics/config.ts).
 */
export default function AnalyticsProvider() {
  const pathname = usePathname();
  useEffect(() => {
    analyticsRoute(pathname || "/");
  }, [pathname]);
  return null;
}
