/**
 * Link rules shared by the renderer (client + server) and the click-tracking redirect.
 * Only links to these hosts are wrapped for click tracking, and the redirect only ever sends
 * people to these hosts, so /api/email/c can't be used as an open redirect.
 */
export const SITE = "https://www.himanshukukreja.in";

export const OWN_HOSTS = ["himanshukukreja.in", "www.himanshukukreja.in"];
export const KNOWN_HOSTS = [
  "github.com",
  "www.github.com",
  "linkedin.com",
  "www.linkedin.com",
  "x.com",
  "twitter.com",
  "instagram.com",
  "www.instagram.com",
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "markdrop.in",
  "www.markdrop.in",
];

export function hostAllowed(host: string, extra: string[] = []): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return OWN_HOSTS.includes(h) || KNOWN_HOSTS.includes(h) || extra.map((e) => e.toLowerCase().trim()).filter(Boolean).includes(h);
}

/** Parsed http(s) URL on an allowed host, else null. */
export function allowedUrl(raw: string, extra: string[] = []): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return hostAllowed(u.hostname, extra) ? u : null;
  } catch {
    return null;
  }
}

export const isOwnUrl = (u: URL) => OWN_HOSTS.includes(u.hostname.toLowerCase());

export const unsubscribeUrlFor = (base: string, token: string) => `${base.replace(/\/$/, "")}/newsletter/unsubscribe?t=${encodeURIComponent(token)}`;
export const openPixelUrl = (base: string, token: string) => `${base.replace(/\/$/, "")}/api/email/o/${encodeURIComponent(token)}.gif`;
export const clickUrl = (base: string, token: string, url: string) => `${base.replace(/\/$/, "")}/api/email/c/${encodeURIComponent(token)}?u=${encodeURIComponent(url)}`;

/** Tokens the tracking routes accept but never record (admin preview + test sends). */
export const isNonTrackingToken = (t: string) => t === "preview" || t === "test" || t.startsWith("test-") || t.startsWith("preview-");
