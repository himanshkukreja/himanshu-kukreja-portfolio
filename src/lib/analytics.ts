/**
 * Client-side Analytics Tracking
 * Tracks page views, user sessions, and custom events
 */

export type AnalyticsEvent = {
  event_type: "page_view" | "click" | "form_submit" | "custom";
  page_path: string;
  page_title?: string;
  referrer?: string;
  referrer_domain?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  metadata?: Record<string, any>;
  duration?: number;
};

/**
 * Get or create a unique visitor ID
 * Stored in localStorage to persist across sessions
 */
function getVisitorId(): string {
  if (typeof window === "undefined") return "";

  let visitorId = localStorage.getItem("analytics_visitor_id");
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem("analytics_visitor_id", visitorId);
  }
  return visitorId;
}

/**
 * Get or create a session ID
 * Stored in sessionStorage, regenerated on new browser session
 */
function getSessionId(): string {
  if (typeof window === "undefined") return "";

  let sessionId = sessionStorage.getItem("analytics_session_id");
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem("analytics_session_id", sessionId);
  }
  return sessionId;
}

/**
 * Extract domain from URL
 */
function getDomain(url: string): string | null {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

/**
 * Get UTM parameters from URL
 */
function getUTMParams(): {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
} {
  if (typeof window === "undefined") return {};

  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source") || undefined,
    utm_medium: params.get("utm_medium") || undefined,
    utm_campaign: params.get("utm_campaign") || undefined,
  };
}

/**
 * Detect device type
 */
function getDeviceType(): "desktop" | "mobile" | "tablet" {
  if (typeof window === "undefined") return "desktop";

  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return "tablet";
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return "mobile";
  }
  return "desktop";
}

/**
 * Parse user agent for browser and OS
 */
function parseUserAgent(): { browser?: string; os?: string } {
  if (typeof window === "undefined") return {};

  const ua = navigator.userAgent;
  let browser = "Unknown";
  let os = "Unknown";

  // Detect browser
  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Opera") || ua.includes("OPR")) browser = "Opera";

  // Detect OS
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  return { browser, os };
}

/**
 * Track an analytics event
 */
export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  if (typeof window === "undefined") return;

  // Disable tracking in development mode
  if (process.env.NODE_ENV === "development") {
    console.log("[Analytics] Dev mode - skipping tracking:", event.event_type, event.page_path);
    return;
  }

  const visitorId = getVisitorId();
  const sessionId = getSessionId();
  const utmParams = getUTMParams();
  const { browser, os } = parseUserAgent();
  const deviceType = getDeviceType();

  const referrer = document.referrer || undefined;
  const referrerDomain = referrer ? getDomain(referrer) : undefined;

  const analyticsData = {
    ...event,
    visitor_id: visitorId,
    session_id: sessionId,
    referrer,
    referrer_domain: referrerDomain,
    ...utmParams,
    user_agent: navigator.userAgent,
    device_type: deviceType,
    browser,
    os,
    screen_width: window.screen.width,
    screen_height: window.screen.height,
  };

  try {
    // Use the edge API endpoint which automatically captures geo data from Vercel
    await fetch("/api/analytics/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(analyticsData),
    });
  } catch (error) {
    console.error("[Analytics] Failed to track event:", error);
  }
}

/**
 * Track a page view
 */
export async function trackPageView(path?: string, title?: string): Promise<void> {
  if (typeof window === "undefined") return;

  const pagePath = path || window.location.pathname;
  const pageTitle = title || document.title;

  await trackEvent({
    event_type: "page_view",
    page_path: pagePath,
    page_title: pageTitle,
  });
}

/**
 * Track page duration when user leaves
 */
let pageStartTime = Date.now();

export function trackPageDuration(): void {
  if (typeof window === "undefined") return;

  const duration = Math.floor((Date.now() - pageStartTime) / 1000);

  trackEvent({
    event_type: "page_view",
    page_path: window.location.pathname,
    page_title: document.title,
    duration,
  });
}

/**
 * Initialize analytics tracking
 * Call this in your root layout or _app
 */
export function initAnalytics(): void {
  if (typeof window === "undefined") return;

  // Track page view on load
  trackPageView();

  // Track page duration on unload
  window.addEventListener("beforeunload", trackPageDuration);

  // Reset start time on route changes (for SPAs)
  pageStartTime = Date.now();
}
