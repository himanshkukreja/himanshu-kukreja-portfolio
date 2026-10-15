export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function resolveCoverUrl(src?: string): string | undefined {
  if (!src) return undefined;
  const s = src.trim();
  if (!s) return undefined;
  // already absolute
  if (/^https?:\/\//i.test(s)) return s;
  // Served from /public (story covers in /covers/, inline story figures in /case-files/): never rewritten
  // to ImageKit, stays a same-origin path so it is served (and optimised) locally. Only /blueprints/… paths
  // are ImageKit uploads.
  if (s.startsWith("/covers/") || s.startsWith("/case-files/")) return s;

  const base = process.env.NEXT_PUBLIC_IMAGEKIT_BASE_URL?.replace(/\/$/, "");
  const prefix = process.env.NEXT_PUBLIC_IMAGEKIT_PREFIX_PATH?.replace(/^\/+|\/+$/g, ""); // no leading/trailing slashes
  if (base) {
    // If we have a local-like path, optionally rewrite '/blueprints/foo.png' => '<base>/<prefix>/foo.png'
    if (s.startsWith("/")) {
      const file = s.split("/").pop() || "";
      const path = prefix ? `${prefix}/${file}` : s.replace(/^\//, "");
      return `${base}/${path}`;
    }
    return `${base}/${s.replace(/^\//, "")}`;
  }

  // Fallback to site absolute URL for local assets
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  if (s.startsWith("/")) return site ? `${site}${s}` : s;
  return s;
}

/** Absolute URL for a cover (OpenGraph / Twitter / email need one): local paths get the site origin. */
export function absoluteCoverUrl(src?: string): string | undefined {
  const u = resolveCoverUrl(src);
  if (!u || /^https?:\/\//i.test(u)) return u;
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://himanshukukreja.in").replace(/\/$/, "");
  return `${site}${u.startsWith("/") ? "" : "/"}${u}`;
}
