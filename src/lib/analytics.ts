/**
 * v1 analytics API, kept as a thin wrapper over the v2 tracker (src/lib/track.ts) so any old
 * import keeps working. New code should `import { track } from "@/lib/track"`.
 */
import { pageview, track, type TrackProps } from "./track";

export { track, pageview };

export type AnalyticsEvent = {
  event_type: "page_view" | "click" | "form_submit" | "custom";
  page_path: string;
  page_title?: string;
  metadata?: TrackProps & { name?: string };
};

export function trackEvent(event: AnalyticsEvent): Promise<void> {
  if (event.event_type === "page_view") pageview(event.page_path);
  else {
    const { name, ...props } = event.metadata ?? {};
    track(typeof name === "string" && /^[a-z][a-z0-9_]{1,39}$/.test(name) ? name : event.event_type, props);
  }
  return Promise.resolve();
}

export function trackPageView(path?: string): Promise<void> {
  pageview(path);
  return Promise.resolve();
}

/** No-op: engaged time is measured continuously by the v2 tracker. */
export function trackPageDuration(): void {}

/** No-op: <AnalyticsTracker/> initialises tracking. */
export function initAnalytics(): void {}
